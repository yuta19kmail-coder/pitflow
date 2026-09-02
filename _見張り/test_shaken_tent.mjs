// ============================================================
// test_shaken_tent.mjs ― 🅿 暫定予定（仮押さえ）と 再検の1行メモ の見張り
//   PitFlow v2.54.0 ／ ゆうた指定 2026-09-02
//
//   🗣「再検のチェック時→1行でいいからその内容をかけるようにする」
//   🗣「予定の一番左、車種がならんでいるところに既存の詳細ホバーとクリックで予約詳細展開できるように」
//   🗣「その代わりに予定一覧で候補日の修正が出来ないようにする」
//   🗣「ただし、車種×日の１セルに対してクリックする事で暫定予定として
//   　　上の決定カードのような形のものを下にも設置できるようにする」
//   🗣（暫定はどこまで？）「仮押さえ止まり」
//
//   ここで固めている決めごと
//     🔴 暫定は 1台に1つ／同じマスをもう一度押すと外れる／別のマスなら移る
//     🔴 決まっている車（決定ずみ・済）には置けない
//     🔴 決まった・終わった・取り消した で暫定は必ず落ちる
//     🔴 暫定は decided を触らない＝MHS・当日ビュー・前日LINEには出ない
//     🔴 再検の理由（1行）は history に残り、フローの記録にも出る。空でも記録できる
//     🔴 この表から「行ける枠」は入れ替えられない（shkSlot は廃止・入口は予約詳細だけ）
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_shaken_tent.mjs
//     node _見張り/test_shaken_tent.mjs --break=1  … 同じマスで外れなくする      → ①が赤
//     node _見張り/test_shaken_tent.mjs --break=2  … 再検の理由を捨てる          → ②が赤
//     node _見張り/test_shaken_tent.mjs --break=3  … 決定ずみでも置けるようにする → ①が赤
//     node _見張り/test_shaken_tent.mjs --break=4  … マスを押したら行ける枠に戻す → ⑤が赤
// ============================================================
import fs from 'fs';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); }
};
const JS = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');

/* ⚠ わざと壊すモードが空振りすると「見張りが効いていないのに全部緑」になる（v2.49.1 の教訓）。
   壊す場所は、直したその行に当てること。 */
function bend(name, src) {
  if (BREAK === '1' && name === 'pit-share.js')
    return src.replace("if (s.tent === iso && (s.tentSlot === 'pm' ? 'pm' : 'am') === sl){", "if (false){");
  if (BREAK === '2' && name === 'pit-share.js')
    return src.replace("note: note2 });", "note: '' });");
  if (BREAK === '3' && name === 'pit-share.js')
    return src.replace("if (s.decided || s.result === 'done') return null;   /* 決まっている車には置かない */", "");
  if (BREAK === '4' && name === 'shaken.js')
    return src.replace(/onclick="shkTent\(/g, 'onclick="shkSlot(');
  return src;
}

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(bend('pit-share.js', JS('pit-share.js')), box);
box.PitShare.use({ divisions: () => [], estAmount: () => 0, teamKey: () => 'default' });

const D1 = '2026-09-10', D2 = '2026-09-14';
const S = (o) => Object.assign({ mode: 'manual', slots: {}, cutBefore: '', history: [] }, o);

console.log('── ① 🅿 暫定は「1台に1つ」「同じマスで外れる」「別のマスなら移る」──');
{
  const r1 = box.pitShakenTent(S({}), D1, 'am');
  ok('置ける', !!r1 && r1.on === true && r1.insp.tent === D1 && r1.insp.tentSlot === 'am', r1 && r1.insp);
  ok('🔴 決定は触らない（＝MHS・当日ビュー・前日LINEには出ない）',
     !!r1 && !r1.insp.decided && !r1.insp.result, r1 && r1.insp);
  ok('フローに残る1行がある', !!r1 && /暫定予定/.test(r1.log), r1 && r1.log);

  const r2 = box.pitShakenTent(r1.insp, D1, 'am');
  ok('🔴 同じマスをもう一度押すと外れる', !!r2 && r2.on === false && !r2.insp.tent, r2 && r2.insp);

  const r3 = box.pitShakenTent(r1.insp, D1, 'pm');
  ok('同じ日でも午前→午後は「移る」（外れない）', !!r3 && r3.on === true && r3.insp.tentSlot === 'pm', r3 && r3.insp);

  const r4 = box.pitShakenTent(r1.insp, D2, 'pm');
  ok('🔴 別のマスを押すと「移る」＝2つにならない',
     !!r4 && r4.insp.tent === D2 && r4.insp.tentSlot === 'pm', r4 && r4.insp);
  ok('動かした時はログでそう言う', !!r4 && /動かした/.test(r4.log), r4 && r4.log);

  ok('🔴 決まっている車には置けない', box.pitShakenTent(S({ decided: D1, decidedSlot: 'am' }), D2, 'am') === null);
  ok('🔴 済んだ車にも置けない', box.pitShakenTent(S({ result: 'done', resultDate: D1 }), D2, 'am') === null);
  ok('日付の形が違うものは受け取らない', box.pitShakenTent(S({}), '9/10', 'am') === null);
  ok('渡した方を書き換えない（写しを返す）', (() => {
    const base = S({}); box.pitShakenTent(base, D1, 'am'); return !base.tent;
  })());
}

console.log('\n── ② 🔴 再検の理由（1行）が残る ──');
{
  const r = box.pitShakenApply(S({ decided: D1, decidedSlot: 'pm' }), 'recheck', { staff: '鈴木', note: '光軸' });
  const h = r.insp.history[r.insp.history.length - 1];
  ok('history に理由が入る', h && h.note === '光軸', h);
  ok('フローの記録にも出る', /光軸/.test(r.log), r.log);
  ok('日・時間帯・担当は今までどおり残る', h && h.date === D1 && h.slot === 'pm' && h.staff === '鈴木', h);

  const r0 = box.pitShakenApply(S({ decided: D1 }), 'recheck', { staff: '鈴木' });
  const h0 = r0.insp.history[0];
  ok('🔴 空のままでも記録できる（理由は任意）', !!h0 && h0.result === 'recheck' && h0.note === '', h0);
  ok('空の時はログに「／」を足さない', !/／$/.test(r0.log), r0.log);

  const rn = box.pitShakenApply(S({ decided: D1 }), 'recheck', { note: ' 光軸\nサイドスリップ ' });
  ok('改行は潰して1行にする', rn.insp.history[0].note === '光軸 サイドスリップ', rn.insp.history[0].note);
  const rl = box.pitShakenApply(S({ decided: D1 }), 'recheck', { note: 'あ'.repeat(200) });
  ok('長すぎるものは120字で切る', rl.insp.history[0].note.length === 120, rl.insp.history[0].note.length);

  const rd = box.pitShakenApply(S({ decided: D1 }), 'done', { note: '見ないはず' });
  ok('🔴 完了（済）では理由を見ない', !/見ないはず/.test(rd.log), rd.log);
}

console.log('\n── ③ 🅿 決まった・終わった・取り消した で暫定は落ちる ──');
{
  const t = S({ tent: D2, tentSlot: 'am', decided: D1, decidedSlot: 'am' });
  ok('完了で落ちる',     !box.pitShakenApply(t, 'done',   {}).insp.tent);
  ok('再検で落ちる',     !box.pitShakenApply(t, 'recheck',{}).insp.tent);
  ok('取り消しで落ちる', !box.pitShakenApply(t, 'cancel', {}).insp.tent);
}

console.log('\n── ④ 🅿 読み出しは物差し1本（決まった車の古い暫定は出さない）──');
{
  ok('入っていれば返す', (box.pitShakenTentOf({ tent: D1, tentSlot: 'pm' }) || {}).slot === 'pm');
  ok('無ければ null', box.pitShakenTentOf({}) === null);
  ok('🔴 決定ずみなら（古い暫定が残っていても）出さない',
     box.pitShakenTentOf({ tent: D1, decided: D2 }) === null);
  ok('🔴 済んだ車も出さない', box.pitShakenTentOf({ tent: D1, result: 'done' }) === null);
}

console.log('\n── ⑤ 🔴 画面の決めごと（車検予定の表）──');
{
  const sk = bend('shaken.js', JS('shaken.js'));
  ok('🔴 この表から行ける枠を入れ替える窓口は無い（shkSlot は廃止）', !/window\.shkSlot\s*=/.test(sk));
  ok('マスを押すと暫定を置く', /onclick="shkTent\(/.test(sk));
  ok('🔴 帯そのものには onclick が付いていない（見るだけ）',
     !/shk-bar[^>]*onclick=/.test(sk.replace(/\n/g, ' ')));
  ok('一番左を押すと予約詳細が開く', /shk-gut gcar clk[\s\S]{0,160}?onclick="openDetail\(/.test(sk));
  ok('暫定カードは決定カードと同じ形（shk-chip を使う）', /shk-chip shk-tent shk-drag/.test(sk));
  ok('暫定カードは上の「決定」へ運べる（掴める印が付いている）', /shk-drag/.test(sk));
  ok('決定した時に暫定を落としている', /s\.tent=''; s\.tentSlot='';/.test(sk));
  ok('再検の理由を書く欄がある', /id="shk-note"/.test(sk));
  ok('🔴 暫定の中身は物差し（pitShakenTent）を呼ぶだけ', /pitShakenTent\(s, iso, slot\)/.test(sk));

  const hv = JS('card-hover.js');
  ok('🔴 ホバーは一番左だけ（行ぜんぶではない）',
     /\.shk-gut\.gcar/.test(hv) && !/'[^']*\.shk-gcar,/.test(hv));
  /* 🔴 v2.54.1 ゆうた「予定バーの所でもホバーがでるのはやめてほしい」
     ＝帯は押すと暫定を置く所。乗せただけで情報カードが出ると、置きたいマスに被る。 */
  ok('🔴 帯（予定バー）ではホバーを出さない', !/var HOVER_SEL[^;]*\.shk-bar/.test(hv));

  const cv = JS('card-view.js');
  ok('予約詳細の再検の窓にも理由の欄がある', /id="cv-shnote"/.test(cv));
  ok('予約詳細の再検履歴に理由を出す', /cv-shrc-n/.test(cv));
  ok('🔴 予約詳細でも切り方は同じ（120字・改行つぶし）', /slice\(0,120\)/.test(cv.replace(/\s/g, '')));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
