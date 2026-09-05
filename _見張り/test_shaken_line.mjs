// ============================================================
// test_shaken_line.mjs ― 作業サマリー「車検ライン」タブの見張り
//   PitFlow v2.58.0 ／ ゆうた指定 2026-09-04
//
//   🗣「作業サマリー画面の一番上に 整備 と 車検ライン の大きく2つに分かれる」
//   🗣「整備の方の内容は既存のものと何も変えない」
//   🗣「その月ごとのライン業務の件数／誰が何台行って何%／合格何台 うち国産何台 何%／理由一覧」
//   🗣（誰の実績か）「回送の担当だけ」／（数え方）「どちらもかな　全体からエラーの数　詳細」
//
//   ここで固めている決めごと
//     🔴 数えるのは **実際に陸運局へ行った記録だけ**。予定（決定・暫定）は1件も数えない
//     🔴 入場回数と台数は別もの（1台が2回行けば入場2・台数1）。その差が手戻り
//     🔴 不合格はその月に落ちた回だけ（前の月のぶんを引きずらない）
//     🔴 再検合格は「一発合格」に混ぜない（合格ではあるが、一度ひっかかっている）
//     🔴 落ちた所は「・、／ 空白」で割って数える。再検合格のぶんも数える（整備の材料としては同じ）
//     🔴 整備タブは1行も変えていない（上のタブが増えただけ）
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_shaken_line.mjs
//     node _見張り/test_shaken_line.mjs --break=1 … 予定も数える           → ①が赤
//     node _見張り/test_shaken_line.mjs --break=2 … 前の月の不合格も数える → ②が赤
//     node _見張り/test_shaken_line.mjs --break=3 … 再検合格を一発に混ぜる → ③が赤
//     node _見張り/test_shaken_line.mjs --break=4 … 落ちた所を割らない     → ④が赤
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

function bend(src) {
  if (BREAK === '1') return src.replace("if(s.result==='done'){", "if(s.result==='done'||s.decided){");
  if (BREAK === '2') return src.replace("if(h.date<moS || h.date>moE) return;", "");
  if (BREAK === '3') return src.replace("kind: rp?'repass':(reN?'passAfter':'pass1')", "kind: (reN?'passAfter':'pass1')");
  if (BREAK === '4') return src.replace(/split\(\/\[・、，,／\\\/\\s\]\+\/\)/, "split(/\\u0000/)");
  return src;
}

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(JS('pit-share.js'), box);
box.PitShare.use({ divisions: () => [], estAmount: () => 0, teamKey: () => 'default' });

/* 車1台ぶんの作り物。board＝'import' が輸入（2課）、それ以外が国産。 */
let seq = 0;
const car = (o) => Object.assign({
  id: 'c' + (++seq), workTypes: ['shaken'], status: 'work',
  customer: 'テスト太郎', car: 'ハイエース', maker: 'トヨタ', plate: '柏 300 あ 0000', boardId: 'default'
}, o);
const insp = (o) => Object.assign({ mode: 'manual', slots: {}, history: [] }, o);
const ng = (o) => Object.assign({ date: '2026-09-02', slot: 'am', result: 'recheck',
                                  staff: '吉田', officeName: '野田', round: 2, note: '光軸' }, o);

box.state = { cards: [
  /* A 国産・一発合格 */
  car({ inspSchedule: insp({ result:'done', resultDate:'2026-09-10', resultSlot:'am', resultStaff:'吉田', officeName:'野田', round:2 }) }),
  /* B 国産・9/2に落ちて、9/9に合格（＝入場2回・台数1） */
  car({ inspSchedule: insp({ history:[ng({})], result:'done', resultDate:'2026-09-09', resultSlot:'pm', resultStaff:'こばやし', officeName:'野田', round:4 }) }),
  /* C 輸入・再検合格（その場で直して通った） */
  car({ boardId:'import', inspSchedule: insp({ result:'done', resultDate:'2026-09-05', resultSlot:'am', resultStaff:'吉田',
        officeName:'習志野', round:1, repass:true, repassNote:'サイドスリップ' }) }),
  /* D 輸入・9/12に落ちたまま（まだ決め直していない） */
  car({ boardId:'import', inspSchedule: insp({ history:[ng({ date:'2026-09-12', slot:'pm', staff:'こばやし', officeName:'習志野', round:4, note:'光軸・ブーツ切れ' })] }) }),
  /* E 先月落ちた車＝この月には出ない */
  car({ inspSchedule: insp({ history:[ng({ date:'2026-08-20' })], decided:'2026-10-01', decidedSlot:'am' }) }),
  /* F 予定だけ（まだ行っていない）＝1件も数えない */
  car({ inspSchedule: insp({ decided:'2026-09-25', decidedSlot:'am' }) }),
  /* G 車検じゃない車＝関係ない */
  car({ workTypes:['general'], inspSchedule: insp({ result:'done', resultDate:'2026-09-11' }) })
]};

vm.runInContext(bend(JS('shaken-line.js')), box);

const T = box.pitShakenLineTrips('2026-09-01', '2026-09-30');
const kind = (k) => T.filter(t => t.kind === k).length;
const cars  = new Set(T.map(t => t.c.id)).size;

console.log('── ① 数えるのは「行った記録」だけ ──');
ok('入場は5回（A1・B2・C1・D1）', T.length === 5, T.length);
ok('予定だけの車は数えない', !T.some(t => t.c.id === 'c6'), T.map(t => t.c.id));
ok('車検じゃない車は数えない', !T.some(t => t.c.id === 'c7'));
ok('実台数は4台（入場5・台数4＝手戻り1）', cars === 4, cars);

console.log('── ② 月をまたいだものを引きずらない ──');
ok('先月の不合格は入らない', !T.some(t => t.iso < '2026-09-01'), T.map(t => t.iso));
ok('この月の不合格は2件', kind('ng') === 2, kind('ng'));

console.log('── ③ 合格の内訳（一発／再検合格／戻して合格） ──');
ok('一発合格は1台', kind('pass1') === 1, kind('pass1'));
ok('再検合格は1台（一発に混ぜない）', kind('repass') === 1, kind('repass'));
ok('戻して合格は1台', kind('passAfter') === 1, kind('passAfter'));
ok('合格は合わせて3台', kind('pass1') + kind('repass') + kind('passAfter') === 3);

console.log('── ④ 国産・輸入と、落ちた所 ──');
const dom = T.filter(t => t.team !== 'import'), imp = T.filter(t => t.team === 'import');
ok('国産の入場は3回', dom.length === 3, dom.length);
ok('輸入の入場は2回', imp.length === 2, imp.length);
ok('輸入の合格は1台（再検合格）', imp.filter(t => t.kind === 'repass').length === 1);

const wrap = { innerHTML: '' };
box.renderShakenLine(wrap, '<i>top</i>', '<i>head</i>', '2026-09-01', '2026-09-30', 'テスト。');
const H = wrap.innerHTML;
ok('落ちた所は「・」で割って数える（光軸が2件）', /光軸[\s\S]{0,220}?>2</.test(H), H.indexOf('光軸') >= 0);
ok('再検合格に書いた所も理由に数える（サイドスリップ）', H.indexOf('サイドスリップ') > 0);

console.log('── ⑤ 画面に出るもの ──');
ok('全体→エラー→詳細の3段になっている',
   H.indexOf('>全体<') > 0 && H.indexOf('>エラー<') > 0 && H.indexOf('>詳細<') > 0
   && H.indexOf('>全体<') < H.indexOf('>エラー<') && H.indexOf('>エラー<') < H.indexOf('>詳細<'));
ok('入場回数と台数の両方が出る', /5<span>回<\/span>/.test(H) && /実台数 4 台/.test(H), H.slice(H.indexOf('sv-hero'), H.indexOf('sv-hero') + 400));
ok('一発合格率が出る（1/3＝33.3%）', H.indexOf('33.3%') > 0);
ok('回送の担当別の表がある（整備した人ではない）',
   H.indexOf('回送の担当別') > 0 && H.indexOf('整備した人ではありません') > 0);
ok('国産・輸入の表がある', H.indexOf('>国産<') > 0 && H.indexOf('>輸入<') > 0);
ok('不合格の明細がある', H.indexOf('不合格の明細') > 0);
ok('気をつけどころが出る', H.indexOf('気をつけどころ') > 0);
/* 🔴🔴 v2.61.0 ゆうたの大前提＝抜けは許容せず、**0にする対象として数を出す** */
ok('未記入が無い月は「全部書かれています」と出す', H.indexOf('未記入 0件') > 0);
{
  /* 落ちた所を書いていない不合格を1件だけ足して、そこだけ見る（ほかの数字は動かさない） */
  const keep = box.state.cards.slice();
  box.state.cards = keep.concat([car({ customer: '未記入太郎',
    inspSchedule: insp({ history: [ng({ date: '2026-09-25', note: '' })] }) })]);
  const w2 = { innerHTML: '' };
  box.renderShakenLine(w2, '', '', '2026-09-01', '2026-09-30', '');
  const H2 = w2.innerHTML;
  ok('🔴 落ちた所の未記入を「0にする対象」として立てる',
     H2.indexOf('0にする対象') > 0 && H2.indexOf('落ちた所」が未記入') > 0);
  ok('未記入だと集計に出ないことを書いてある', H2.indexOf('上の集計に出てきません') > 0);
  box.state.cards = keep;
}
ok('予定は数えていないと書いてある', H.indexOf('予定は0件も入っていません') > 0);

console.log('── ⑥ 整備タブは触っていない ──');
{
  const ms = JS('mech-summary.js');
  ok('一番上のタブが増えただけ', /function topTabs\(\)/.test(ms) && /wsSetTop/.test(ms));
  ok('整備の配分エンジンは残っている', /function pitMechAlloc/.test(ms) && /FEE_DEFAULT/.test(ms));
  ok('期間の出し方は1か所（車検ラインへ渡している）', /renderShakenLine\(wrap, topTabs\(\), header\(\)/.test(ms));
  /* 🔴🔴 2026-09-04 の反省（来店属性で踏んだ）＝**文字だけ見ていると「無い関数を呼んでいる」を拾えない。**
     期間の帯を存在しない名前で呼び、タブを押しても何も起きない状態で出してしまった。
     ＝ 呼んでいる名前が、そのファイルに本当にあるかまで見る。 */
  var br = ms.slice(ms.indexOf("if(window._wsTop==='line')"), ms.indexOf("if(window._wsMode==='year') renderYear"));
  br = br.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  var callNames = (br.match(/(?:^|[^\w.$])([a-zA-Z_$][\w$]*)\s*\(/g) || [])
    .map(function(x){ return x.replace(/[^\w$]/g, ''); })
    .filter(function(n2){ return ['if','return','function','var','typeof','new','Date'].indexOf(n2) < 0 && n2.indexOf('renderShakenLine') !== 0; });
  var miss = callNames.filter(function(n2){ return ms.indexOf('function ' + n2 + '(') < 0 && ms.indexOf('window.' + n2 + ' =') < 0; });
  ok('🔴 呼んでいる関数が本当にある（無い名前を呼んでいない）', miss.length === 0, miss);
  const idx = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  ok('index.html に ?v= 付きで載っている',
     /js\/shaken-line\.js\?v=\d+/.test(idx) && /css\/shaken-line\.css\?v=\d+/.test(idx));
  ok('車検ラインは mech-summary より前に読む',
     idx.indexOf('js/shaken-line.js') < idx.indexOf('js/mech-summary.js'));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（' + pass + '件 緑）' : '✅ ぜんぶ緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
