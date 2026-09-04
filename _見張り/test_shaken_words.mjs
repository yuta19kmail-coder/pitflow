// ============================================================
// test_shaken_words.mjs ― 車検の言葉を3つに分けた見張り
//   PitFlow v2.56.0 ／ MHS v1.58.0 ／ ゆうた確定 2026-09-04
//
//   🗣「まず実際に再検のパターンが2つある。なのでそもそもの言葉を2つにしよう」
//   🗣「再検→不合格からもう一度受験する行為」
//   🗣「再検になった車の次の予定の時に、この予定が再検だとわかるようにしてほしい」
//
//   ここで固めている決めごと
//     🔴 不合格   … 行って落ちた日に付く（v2.55.0 まで「再検」と出していたもの）
//     🔴 再検     … 不合格のあと、もう一度受験しに行く**予定**に付く。2回目以降だけ回数が出る
//     🔴 再検合格 … 一度落ちたが、その回で受かった。**完了の記録の中の印**（履歴には積まない）
//     🔴 落ちた回数は pitShakenReCount 1本でしか数えない（再検合格は数えない）
//     🔴 一発合格で押し直したら、再検合格の印は**必ず消える**
//     🔴 MHS は物差しが 'repass' を知らない間、そのボタンを出さない（出す順は PitFlow が先）
//     🔴 前日LINEの画像は、これから行く再検を**車種名のうしろの札**で出す（右の印には出さない）
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_shaken_words.mjs
//     node _見張り/test_shaken_words.mjs --break=1 … 予定に再検の印を出さない     → ①が赤
//     node _見張り/test_shaken_words.mjs --break=2 … 一発合格で印を消さない       → ②が赤
//     node _見張り/test_shaken_words.mjs --break=3 … 回数に再検合格まで数える     → ③が赤
//     node _見張り/test_shaken_words.mjs --break=4 … MHSが古い物差しでもボタンを出す → ④が赤
//     node _見張り/test_shaken_words.mjs --break=5 … 窓を切り替える前に3つを控えない → ⑦が赤
// ============================================================
import fs from 'fs';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); }
};
const JS  = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
const MHS = ()  => fs.readFileSync(new URL('../../../MHS/index.html', import.meta.url), 'utf8');
const FN  = (f) => fs.readFileSync(new URL('../../../CarFlow/carflow/functions/' + f, import.meta.url), 'utf8');

function bend(name, src) {
  if (BREAK === '1' && name === 'pit-share.js')
    return src.replace("var isRe   = (state === 'decided') && reNo > 0;", "var isRe   = false;");
  if (BREAK === '2' && name === 'pit-share.js')
    return src.replace("s.repass = (act === 'repass');", "if (act === 'repass') s.repass = true;");
  if (BREAK === '3' && name === 'pit-share.js')
    return src.replace("if (h[i] && h[i].result === 'recheck') n++;", "if (h[i]) n++;");
  return src;
}
function bendShaken(src) {
  if (BREAK === '5') return src.replace(/_shkPend=_grabFields\(\);/g, '_shkPend=null;');
  return src;
}
function bendMhs(src) {
  if (BREAK === '4') return src.replace("(window.PIT_SHAKEN_ACTS||[]).indexOf('repass')>=0", "true");
  return src;
}

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(bend('pit-share.js', JS('pit-share.js')), box);
box.PitShare.use({ divisions: () => [], estAmount: () => 0, teamKey: () => 'default' });

const D1 = '2026-08-24', D2 = '2026-08-31', D3 = '2026-09-07';
const ng = (o) => Object.assign({ date: D1, slot: 'am', result: 'recheck', staff: '鈴木',
                                  office: 'loc1', officeName: '野田', round: 2, note: '光軸' }, o);
/* 車1台ぶんの形。⚠ 車検の車として拾われる条件（workTypes と 生きているカード）も要る */
const CAR = (insp, o) => Object.assign({
  id: 'c1', workTypes: ['shaken'], status: 'work',
  customer: '田中太郎', kana: 'タナカ', car: 'ハイエース', plate: '柏 300 あ 4821',
  inspSchedule: Object.assign({ mode: 'manual', slots: {}, cutBefore: '', history: [] }, insp)
}, o);
const rowsOn = (insp, iso) => box.pitShakenOnDate([CAR(insp)], iso);

console.log('── ① これから行く予定に「再検」が出る（今回の依頼そのもの） ──');
{
  const r = rowsOn({ decided: D2, decidedSlot: 'am', history: [ng({})] }, D2)[0];
  ok('落ちたあとの予定は「再検」', r && r.mark === '再検', r && r.mark);
  ok('何の印かも一緒に配る（re）', r && r.re === true && r.reNo === 1, r && { re: r.re, reNo: r.reNo });
}
{
  const r = rowsOn({ decided: D2, decidedSlot: 'am' }, D2)[0];
  ok('落ちていない予定は印なし', r && r.mark === '' && r.re === false, r && r.mark);
}
{
  const r = rowsOn({ decided: D3, decidedSlot: 'pm', history: [ng({}), ng({ date: D2 })] }, D3)[0];
  ok('2回落ちていたら「再検2」', r && r.mark === '再検2', r && r.mark);
}
{
  const r = rowsOn({ decided: D2, history: [ng({})] }, D1)[0];
  ok('落ちた日そのものは「不合格」', r && r.mark === '不合格' && r.state === 'recheck', r && r.mark);
}

console.log('── ② 再検合格＝完了の中の印。押し直したら消える ──');
{
  const s = { mode: 'manual', slots: {}, history: [ng({})], decided: D2, decidedSlot: 'pm' };
  const r = box.pitShakenApply(s, 'repass', { staff: '吉田', note: ' 光軸\n ', today: D2 });
  ok('完了として残る', r && r.insp.result === 'done' && r.insp.resultDate === D2, r && r.insp.result);
  ok('再検合格の印が立つ', r && r.insp.repass === true, r && r.insp.repass);
  ok('落ちた所は1行にして残す', r && r.insp.repassNote === '光軸', r && r.insp.repassNote);
  ok('履歴には積まない（同じ日に2行出さない）', r && r.insp.history.length === 1, r && r.insp.history.length);
  const rows = box.pitShakenOnDate([CAR(r.insp)], D2);
  ok('その日の印は「再検合格」', rows[0] && rows[0].mark === '再検合格' && rows[0].repass === true, rows[0] && rows[0].mark);
  const d = box.pitShakenApply(r.insp, 'done', { staff: '吉田', today: D2 });
  ok('一発合格で押し直したら印が消える', d && d.insp.repass === false, d && d.insp.repass);
  ok('押し直したら落ちた所も消える', d && !d.insp.repassNote, d && d.insp.repassNote);
  const o = box.pitShakenApply(r.insp, 'reopen', { today: D2 });
  ok('予定に戻したら印も落ちる', o && !o.insp.repass && !o.insp.repassNote, o && o.insp.repass);
}
{
  const s = { mode: 'manual', slots: {}, history: [], decided: D2, decidedSlot: 'am' };
  const r = box.pitShakenApply(s, 'done', { staff: '吉田', today: D2 });
  const rows = box.pitShakenOnDate([CAR(r.insp)], D2);
  ok('一発合格は「済」のまま', rows[0] && rows[0].mark === '済' && rows[0].repass === false, rows[0] && rows[0].mark);
}
{
  const s = { mode: 'manual', slots: {}, history: [], decided: D2, decidedSlot: 'am' };
  const r = box.pitShakenApply(s, 'recheck', { staff: '吉田', note: 'サイドスリップ', today: D2 });
  ok('不合格のログは「不合格」と書く', r && r.log.indexOf('車検 不合格') === 0, r && r.log);
  ok('不合格にすると行く日が空に戻る', r && !r.insp.decided, r && r.insp.decided);
}

console.log('── ③ 落ちた回数は1本でしか数えない ──');
{
  ok('不合格だけ数える', box.pitShakenReCount({ history: [ng({}), ng({ date: D2 })] }) === 2);
  ok('再検合格は回数に入れない',
     box.pitShakenReCount({ result: 'done', repass: true, history: [] }) === 0,
     box.pitShakenReCount({ result: 'done', repass: true, history: [] }));
  ok('済んだ記録は数えない', box.pitShakenReCount({ history: [{ date: D1, result: 'done' }] }) === 0);
  ok('履歴が無くても落ちない', box.pitShakenReCount(null) === 0 && box.pitShakenReCount({}) === 0);
}

console.log('── ④ 画面が物差しを通っているか（文字で確かめる） ──');
{
  const sh = bendShaken(JS('shaken.js'));
  ok('決定カードは物差しの行を受け取る', /function decChip\(c, kind, row\)/.test(sh));
  ok('決定カードは物差しの字をそのまま出す', /row \? \(row\.mark \|\| ''\)/.test(sh));
  ok('再検合格だけ「再合」に縮める（枠が118px）', /mark = '再合'/.test(sh));
  ok('完了のボタンが3つある',
     sh.indexOf("'done'") > 0 && sh.indexOf("'repass'") > 0 && sh.indexOf("'recheck'") > 0
     && /完了（一発合格）/.test(sh) && /完了（再検合格）/.test(sh) && /不合格（記録して候補へ戻す）/.test(sh));
  ok('落ちた所は不合格と再検合格の両方で書ける（窓は同じ1つ）',
     /window\.shkNotePop=function\(id,act\)/.test(sh) && /shkActNote\(/.test(sh)
     && /note:\(note==null\?null:note\)/.test(sh.replace(/\s/g, '')));
  ok('ガントの左端は「不合格◯」', /'不合格'\+rcN/.test(sh));
  ok('件数と凡例も新しい言葉', /うち再合/.test(sh) && /不合格'\+cnt\.recheck/.test(sh));

  const cv = JS('card-view.js');
  ok('予約詳細は物差しに寄せた（写しを消した）', /pitShakenApply\(s, kind,/.test(cv));
  ok('予約詳細に写しが残っていない', cv.indexOf("result:'recheck', staff:staff") < 0);
  ok('予約詳細の見出しは「不合格の記録」', /不合格の記録 '\+_rcH\.length/.test(cv));
  ok('予約詳細の押し先も3つ',
     /車検済にする（一発合格）/.test(cv) && /再検合格で済にする/.test(cv) && /不合格を記録/.test(cv));
  ok('済を取り消したら再検合格の印も落ちる', /s\.repass=false; s\.repassNote='';/.test(cv));
}

console.log('── ⑤ MHS（当日ビュー） ──');
{
  const m = bendMhs(MHS());
  ok('これから行く再検は頭の札を入れ替える', /bshk-kind'\+\(isRe\?' re':''\)/.test(m));
  ok('頭に出す時は右端の印を出さない', /var mk = \(!isRe && r\.mark\)/.test(m));
  ok('再検合格は緑の印', /shk-mk\.rp\{/.test(m) && /r\.repass\?' rp'/.test(m));
  ok('頭の札の色は黄色ではない（オレンジ）', /\.bshk-kind\.re\{background:#f97316/.test(m));
  ok('物差しが知らない指示のボタンは出さない',
     /\(window\.PIT_SHAKEN_ACTS\|\|\[\]\)\.indexOf\('repass'\)>=0/.test(m));
  ok('押し先の言葉も3つ', /完了（一発合格）/.test(m) && /完了（再検合格）/.test(m) && /不合格（戻して修理）/.test(m));
}

console.log('── ⑥ 前日LINEの画像 ──');
{
  const b = FN('board-image.js'), mb = FN('mhs-board.js');
  ok('物差しの新しい中身を渡している', /re: !!r\.re/.test(mb) && /repass: !!r\.repass/.test(mb) && /kind: r\.kind/.test(mb));
  ok('車種名のうしろに 車検／再検 の札を出す', /badge\(r\.re \? \(r\.mark \|\| '再検'\) : \(r\.kind \|\| '車検'\)/.test(b));
  ok('これから行く再検は右の印に出さない', /\(r\.mark && !r\.re\) \?/.test(b));
  ok('再検合格は緑', /r\.repass \? '#047857'/.test(b));
}

console.log('── ⑦ 決定チップの窓の組み方（v2.57.0・ゆうた指定 2026-09-04） ──');
{
  const sh = bendShaken(JS('shaken.js'));
  const menu = sh.slice(sh.indexOf('window.shkChipMenu='), sh.indexOf('function _slT('));
  ok('🔴 「予定を取り消す」は消した（候補に戻すと実質同じ）', menu.indexOf("'cancel'") < 0);
  ok('🔴 塊を分ける線が2本ある', (menu.match(/shk-psep/g) || []).length === 2, (menu.match(/shk-psep/g) || []).length);
  ok('カードを開くは、まん中の塊に入っている',
     menu.indexOf('openDetail') > menu.indexOf('shk-psep') && /return;/.test(menu));
  ok('午前午後は窓を切り替える（そのままラウンドへ）', /shkFlipPop\(/.test(menu) && !/'flip'/.test(menu));
  ok('再検合格・不合格は理由の窓へ切り替える',
     /shkNotePop\('.\+id\+'.,.'repass'\)/.test(menu.replace(/\\/g, '')) || /shkNotePop/.test(menu));
  ok('一発合格だけはその場で確定（理由が無いので）', /shkAct\('.\+id\+'.,.'done'\)/.test(menu.replace(/\\/g, '')) || /'done'/.test(menu));
  ok('窓の中に落ちた所の入力を置きっぱなしにしない', menu.indexOf('id="shk-note"') < 0);

  ok('🔴 切り替える前に、担当・陸運局・R を控える',
     /window\.shkNotePop=function[\s\S]{0,200}_shkPend=_grabFields\(\)/.test(sh)
     && /window\.shkFlipPop=function[\s\S]{0,200}_shkPend=_grabFields\(\)/.test(sh));
  ok('ラウンドの窓は 1〜4R を全部出す', /\[1,2,3,4\]\.map/.test(sh) && /未定にする/.test(sh));
  ok('落ちた所の窓に「よく使う言葉」の札がある',
     /SHK_NG_WORDS\s*=\s*\['光軸'/.test(sh) && /window\.shkAddWord=/.test(sh));
  ok('札はもう一度押すと外れる', /if\(i>=0\) a\.splice\(i,1\); else a\.push\(w\);/.test(sh));
  ok('記録は物差し1本を通る（窓が増えても写しを作らない）',
     /function _applyPend/.test(sh) && /pitShakenApply\(s, act,/.test(sh));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（' + pass + '件 緑）' : '✅ ぜんぶ緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
