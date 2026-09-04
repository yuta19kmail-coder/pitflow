// ============================================================
// test_shaken_recheck.mjs ― ↺ 再検の記録を「あとから直す・取り消す」の見張り
//   PitFlow v2.55.0 ／ MHS v1.57.0 ／ ゆうた指定 2026-09-02
//
//   🗣「既に再検にしちゃったもの、逆に再検をキャンセルしたり、日付を変えたりもできないかも」
//   🗣（直せる範囲）「中身全部＋取り消し」
//   🗣（取り消したあと）「押す前の姿に戻す」
//   🗣（MHS）「MHSでも取り消せる」
//
//   ここで固めている決めごと
//     🔴 直せるのは 行った日・時間帯・担当・陸運局・R・理由 の全部
//     🔴 取り消したら、その日を「決定」に戻す（担当も戻す）
//     🔴 ただし **もう別の日で決め直している／済んでいる時は戻さない**（今の予定を上書きしない）
//     🔴 記録は「何番目」だけで指さない。開いた時の日と時間帯が合わなければ **何もしない**
//        （v2.24.0「古い画面が他人の作業をまるごと消す」と同じ穴を開けない）
//     🔴 同じ日・同じ時間帯に2本ある時、MHS は消さずに PitFlow へ回す
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_shaken_recheck.mjs
//     node _見張り/test_shaken_recheck.mjs --break=1 … 日と時間帯の確認をやめる → ③が赤
//     node _見張り/test_shaken_recheck.mjs --break=2 … 決め直していても予定を戻す → ②が赤
//     node _見張り/test_shaken_recheck.mjs --break=3 … 2本ある時も番号を返す   → ④が赤
//     node _見張り/test_shaken_recheck.mjs --break=4 … 予約詳細の履歴を押せなくする → ⑤が赤
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
const MHS = () => fs.readFileSync(new URL('../../../MHS/index.html', import.meta.url), 'utf8');

function bend(name, src) {
  if (BREAK === '1' && name === 'pit-share.js')
    return src.replace("if (at.date && row.date !== at.date) return null;", "");
  if (BREAK === '2' && name === 'pit-share.js')
    return src.replace("if (opt.restore && !s.decided && s.result !== 'done'){", "if (opt.restore){");
  if (BREAK === '3' && name === 'pit-share.js')
    return src.replace("if (hit.length > 1) return { amb: true };", "");
  if (BREAK === '4' && name === 'card-view.js')
    return src.replace(/onclick="cvShReOpen\(/g, 'data-x="cvShReOpen(');
  return src;
}

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(bend('pit-share.js', JS('pit-share.js')), box);
box.PitShare.use({ divisions: () => [], estAmount: () => 0, teamKey: () => 'default' });

const D1 = '2026-08-24', D2 = '2026-08-31', D3 = '2026-09-07';
const rec = (o) => Object.assign({ date: D1, slot: 'am', result: 'recheck', staff: '鈴木',
                                   office: 'loc1', officeName: '野田', round: 2, note: '光軸' }, o);
const S = (o) => Object.assign({ mode: 'manual', slots: {}, cutBefore: '', history: [rec({})] }, o);

console.log('── ① 中身をぜんぶ直せる ──');
{
  const r = box.pitShakenApply(S({}), 'reedit', { at: { i: 0, date: D1, slot: 'am' }, patch: {
    date: D2, slot: 'pm', staff: '田中', office: 'loc2', officeName: '習志野', round: 4, note: 'サイドスリップ' } });
  const h = r && r.insp.history[0];
  ok('日を直せる',       h && h.date === D2, h);
  ok('時間帯を直せる',   h && h.slot === 'pm', h);
  ok('担当を直せる',     h && h.staff === '田中', h);
  ok('陸運局を直せる',   h && h.office === 'loc2' && h.officeName === '習志野', h);
  ok('Rを直せる',        h && h.round === 4, h);
  ok('理由を直せる',     h && h.note === 'サイドスリップ', h);
  ok('記録は1本のまま（増やさない）', r.insp.history.length === 1, r.insp.history.length);
  /* ⚠ v2.56.0 で言葉を分けた＝ログの字も「不合格の記録」に変わった（記録の中身は同じ） */
  ok('フローに残る1行がある', /不合格の記録を直した/.test(r.log), r.log);

  const rp = box.pitShakenApply(S({}), 'reedit', { at: { i: 0, date: D1, slot: 'am' }, patch: { note: 'ブーツ切れ' } });
  ok('🔴 渡さなかったものは触らない（担当・陸運局・Rはそのまま）',
     rp.insp.history[0].staff === '鈴木' && rp.insp.history[0].round === 2, rp.insp.history[0]);
  ok('理由も改行を潰して120字で切る',
     box.pitShakenApply(S({}), 'reedit', { at: { i: 0, date: D1, slot: 'am' }, patch: { note: ' あ\nい ' } })
       .insp.history[0].note === 'あ い');
  ok('🔴 車のいまの陸運局・Rは書き換えない（記録の中だけ直す）',
     rp.insp.office === undefined && rp.insp.round === undefined, { o: rp.insp.office, r: rp.insp.round });
}

console.log('\n── ② 取り消すと「押す前の姿」に戻る ──');
{
  const r = box.pitShakenApply(S({}), 'redrop', { at: { i: 0, date: D1, slot: 'am' }, restore: true });
  ok('記録が消える', r && r.insp.history.length === 0, r && r.insp.history);
  ok('🔴 その日が「決定」に戻る', r.insp.decided === D1 && r.insp.decidedSlot === 'am', r.insp);
  ok('🔴 担当も戻る', r.insp.resultStaff === '鈴木', r.insp.resultStaff);
  ok('フローに「予定に戻した」と残る', /予定に戻した/.test(r.log), r.log);

  const r2 = box.pitShakenApply(S({ decided: D3, decidedSlot: 'pm' }), 'redrop', { at: { i: 0, date: D1, slot: 'am' }, restore: true });
  ok('🔴 もう別の日で決め直していたら、行く日は動かさない',
     r2.insp.decided === D3 && r2.insp.decidedSlot === 'pm', r2.insp);
  ok('　その時も記録は消える', r2.insp.history.length === 0);
  ok('　その時は「予定に戻した」と言わない', !/予定に戻した/.test(r2.log), r2.log);

  const r3 = box.pitShakenApply(S({ result: 'done', resultDate: D3 }), 'redrop', { at: { i: 0, date: D1, slot: 'am' }, restore: true });
  ok('🔴 もう済んでいたら、行く日は動かさない', !r3.insp.decided, r3.insp);

  const r4 = box.pitShakenApply(S({}), 'redrop', { at: { i: 0, date: D1, slot: 'am' } });
  ok('戻さない指示なら、記録を消すだけ', r4.insp.history.length === 0 && !r4.insp.decided, r4.insp);
}

console.log('\n── ③ 🔴 「何番目」だけで指さない（他の端末が先に直していた時）──');
{
  ok('日が食い違えば何もしない',
     box.pitShakenApply(S({}), 'redrop', { at: { i: 0, date: D2, slot: 'am' }, restore: true }) === null);
  ok('番号がもう無ければ何もしない',
     box.pitShakenApply(S({}), 'reedit', { at: { i: 3, date: D1, slot: 'am' }, patch: { note: 'x' } }) === null);
  ok('再検ではない記録は触らない',
     box.pitShakenApply(S({ history: [rec({ result: 'done' })] }), 'redrop', { at: { i: 0, date: D1, slot: 'am' } }) === null);
  ok('渡した方を書き換えない（写しを返す）', (() => {
    const base = S({}); box.pitShakenApply(base, 'redrop', { at: { i: 0, date: D1, slot: 'am' } });
    return base.history.length === 1;
  })());
}

console.log('\n── ④ 🔎 その日・その時間帯の記録を探す（MHSが使う）──');
{
  ok('1本なら番号を返す', (box.pitShakenReFind(S({}), D1, 'am') || {}).i === 0);
  ok('無ければ null',    box.pitShakenReFind(S({}), D2, 'am') === null);
  const two = S({ history: [rec({}), rec({ staff: '田中' })] });
  ok('🔴 同じ日・同じ時間帯に2本ある時は番号を返さない',
     (box.pitShakenReFind(two, D1, 'am') || {}).amb === true, box.pitShakenReFind(two, D1, 'am'));
  ok('時間帯が違えば別物として拾える',
     (box.pitShakenReFind(S({ history: [rec({}), rec({ slot: 'pm' })] }), D1, 'pm') || {}).i === 1);
}

console.log('\n── ⑤ 画面の決めごと ──');
{
  const cv = bend('card-view.js', JS('card-view.js'));
  ok('🔴 予約詳細の再検履歴は1本ずつ押せる', /onclick="cvShReOpen\(/.test(cv));
  ok('　押すのは「もとの並びの番号」（絞ったあとの番号ではない）', /\.map\(function\(x,i\)\{ return \{ x:x, i:i \}; \}\)/.test(cv));
  ok('直す窓に日・時間帯・担当・陸運局・R・理由がある',
     ['cv-shdate','cv-shslot','cv-shstaff','cv-shoffice','cv-shround','cv-shnote'].every(id => cv.includes('id="'+id+'"')));
  ok('「この再検の記録を取り消す」がある', /この再検の記録を取り消す/.test(cv));
  ok('🔴 取り消す前に必ず確かめる（いきなり消さない）', /UI\.confirm\('この再検の記録を取り消しますか/.test(cv));
  ok('🔴 中身の作り方は物差し1本（reedit / redrop を呼ぶだけ）',
     /_cvShReApply\('reedit'/.test(cv) && /_cvShReApply\('redrop'/.test(cv) && /pitShakenApply\(s, act,/.test(cv));
  ok('先に直されていた時は、黙って何もせず知らせる', /ほかの端末で先に直されたようです/.test(cv));

  const css = fs.readFileSync(new URL('../css/card-view.css', import.meta.url), 'utf8');
  ok('🔴 窓の1行入力も他の欄と同じ見た目（v2.54.0 の書き忘れ）',
     /input\[type=text\]/.test(css) && /\.cv-shrc-i/.test(css));

  const mhs = MHS();
  /* ⚠ v1.58.0 で言葉を分けた＝ボタンの字は「この不合格の記録を取り消す」 */
  ok('MHS も記録の取り消しボタンを出す', /この不合格の記録を取り消す/.test(mhs));
  ok('MHS は行の日と時間帯を渡している', /pitShkTap\(\\'\'\+escA\(r\.id\)\+\'\\',\\''\+escA\(bStr\)/.test(mhs.replace(/\n/g,' ')) || /escA\(bStr\)/.test(mhs));
  ok('🔴 MHS も中身は物差し1本（redrop を呼ぶだけ）', /pitShakenApply\(s, 'redrop'/.test(mhs));
  ok('🔴 MHS は2本ある時に消さず PitFlow へ回す', /hit\.amb/.test(mhs) && /予約詳細/.test(mhs));
  ok('🔴 MHS は古い物差しを掴んでいる間はボタンを出さない',
     /PIT_SHAKEN_ACTS\|\|\[\]\)\.indexOf\('redrop'\)/.test(mhs));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
