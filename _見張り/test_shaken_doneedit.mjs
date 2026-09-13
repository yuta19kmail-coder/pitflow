// ============================================================
// test_shaken_doneedit.mjs ― ✓ 車検の「合格（済）」の記録も、再検と同じく「押して直す・取り消す」の見張り
//   PitFlow v2.102.0 ／ ゆうた指定 2026-09-13
//
//   🗣「再検系の場合だと予約カード詳細から色々変更できるんだけど、合格しちゃってる場合取り消すしかない」
//   🗣「合格も出し方を再検風にしてもらって、合格後にも変更を出来るようにしたい」
//
//   ここで固めている決めごと
//     🔴🔴 ① 合格の記録の中身（行った日・時間帯・担当・陸運局・R）を直せる。決定の日も一緒に動く
//     🔴🔴 ② 一発合格 ⇄ 再検合格 を直せる。一発合格に直したら「落ちた所」は必ず消える
//     🔴  ③ 開いた時の日・時間帯と合わなければ何もしない／合格していない車では何もしない／渡したものは書き換えない
//     🔴  ④ 直したあとでも「取り消す（予定に戻す）」は今までどおり効く
//     🔴🔴 ⑤ 予約詳細の合格の記録は**押せる**（再検の記録と同じ出し方）。取り消しは窓の中
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_shaken_doneedit.mjs
// ============================================================
import fs from 'fs';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); }
};
const JS = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(JS('pit-share.js'), box);
box.PitShare.use({ divisions: () => [], estAmount: () => 0, teamKey: () => 'default' });
const A = box.pitShakenApply;

const D1 = '2026-09-10', D2 = '2026-09-11';
/* 一発合格で済にした車（9/10 午前・鈴木・野田・2R） */
const doneOf = (kind, note) => A({ mode: 'manual', slots: {}, history: [], decided: D1, decidedSlot: 'am',
                                   office: 'loc1', officeName: '野田', round: 2 },
                                 kind, { staff: '鈴木', office: 'loc1', officeName: '野田', round: 2, note: note || '', today: D1 }).insp;

console.log('── ① 合格の記録の中身を直せる ──');
{
  const s = doneOf('done');
  const r = A(s, 'doneedit', { at: { date: D1, slot: 'am' },
    patch: { date: D2, slot: 'pm', staff: '佐藤', office: 'loc2', officeName: '習志野', round: 4, kind: 'done' } });
  ok('🔴🔴 直せた（null ではない）', !!r, r);
  const n = (r || {}).insp || {};
  ok('🔴🔴 行った日・時間帯が変わる', n.resultDate === D2 && n.resultSlot === 'pm', n);
  ok('🔴 決定の日も同じ日に揃う（車検予定の画面で迷子にならない）', n.decided === D2 && n.decidedSlot === 'pm', n);
  ok('🔴🔴 担当・陸運局・R が変わる', n.resultStaff === '佐藤' && n.office === 'loc2' && n.officeName === '習志野' && n.round === 4, n);
  ok('合格のまま（予定に戻っていない）', n.result === 'done', n.result);
  ok('フローに残す1行がある', /合格の記録を直した/.test((r || {}).log || ''), (r || {}).log);
  const r2 = A(s, 'doneedit', { at: { date: D1, slot: 'am' }, patch: { office: 'loc1', officeName: '' } });
  ok('陸運局を変えない時は、控えの名前を消さない', r2 && r2.insp.officeName === '野田', r2 && r2.insp);
}

console.log('\n── ② 一発合格 ⇄ 再検合格 ──');
{
  const s = doneOf('done');
  const r = A(s, 'doneedit', { at: { date: D1, slot: 'am' }, patch: { kind: 'repass', note: '光軸' } });
  ok('🔴🔴 一発合格 → 再検合格に直せる（落ちた所も入る）', r && box.pitShakenIsRepass(r.insp) && r.insp.repassNote === '光軸', r && r.insp);
  const r2 = A(r.insp, 'doneedit', { at: { date: D1, slot: 'am' }, patch: { kind: 'done', note: '光軸' } });
  ok('🔴🔴 再検合格 → 一発合格に直すと、落ちた所は消える', r2 && !box.pitShakenIsRepass(r2.insp) && r2.insp.repassNote === '', r2 && r2.insp);
  const r3 = A(doneOf('repass', 'ブーツ切れ'), 'doneedit', { at: { date: D1, slot: 'am' }, patch: { staff: '佐藤' } });
  ok('種類を渡さない時は、再検合格の印と落ちた所をそのまま残す', r3 && r3.insp.repass === true && r3.insp.repassNote === 'ブーツ切れ', r3 && r3.insp);
}

console.log('\n── ③ 関門 ──');
{
  const s = doneOf('done');
  ok('🔴 開いた時の日が違えば何もしない（ほかの端末が先に直した）', A(s, 'doneedit', { at: { date: D2, slot: 'am' }, patch: { staff: 'x' } }) === null);
  ok('🔴 開いた時の時間帯が違えば何もしない', A(s, 'doneedit', { at: { date: D1, slot: 'pm' }, patch: { staff: 'x' } }) === null);
  ok('🔴 合格していない車では何もしない', A({ decided: D1, decidedSlot: 'am', history: [] }, 'doneedit', { at: { date: D1, slot: 'am' }, patch: {} }) === null);
  const before = JSON.stringify(s);
  A(s, 'doneedit', { at: { date: D1, slot: 'am' }, patch: { date: D2, staff: '佐藤' } });
  ok('渡したものは書き換えない（写しを返す）', JSON.stringify(s) === before);
  ok('知っている指示の一覧に入っている（MHS が古い物差しを見分けられる）', box.PIT_SHAKEN_ACTS.indexOf('doneedit') >= 0);
}

console.log('\n── ④ 直したあとでも取り消せる ──');
{
  const e = A(doneOf('repass', '光軸'), 'doneedit', { at: { date: D1, slot: 'am' }, patch: { date: D2 } }).insp;
  const r = A(e, 'reopen', {});
  ok('🔴 取り消す＝予定に戻る（直した日が決定に残る）', r.insp.result === '' && r.insp.decided === D2, r.insp);
  ok('🔴 再検合格の印も落ちる', r.insp.repass === false && r.insp.repassNote === '', r.insp);
}

console.log('\n── ⑤ 予約詳細の出し方（再検と同じく押せる） ──');
{
  const cv = JS('card-view.js');
  ok('🔴🔴 合格の記録を押すと直す窓が開く', /<div class="cv-shdone"><div class="cv-shok-i" onclick="cvShDoneOpen\(\)"/.test(cv));
  ok('🔴🔴 合格の枠に「済を取り消す」ボタンを直置きしない（取り消しは窓の中）', !/onclick="cvShakenReopen\(\)">↩ 済を取り消す/.test(cv));
  ok('🔴 窓で一発合格／再検合格を選べる', /data-k="done"[^\n]*一発合格/.test(cv) && /data-k="repass"[^\n]*再検合格/.test(cv));
  ok('🔴 窓の中に取り消しボタンがある', /onclick="cvShDoneDrop\(\)">🗑 この合格の記録を取り消す/.test(cv));
  ok('🔴🔴 中身は物差し1本（doneedit を呼ぶだけ）', /pitShakenApply\(s, 'doneedit'/.test(cv));
  ok('取り消しは今までの cvShakenReopen を通す', /cvShDoneDrop[\s\S]*?cvShakenReopen\(\)/.test(cv));
  ok('先に直されていた時は知らせる', /cvShDoneSave[\s\S]*?ほかの端末で先に直されたようです/.test(cv));
  const css = fs.readFileSync(new URL('../css/card-view.css', import.meta.url), 'utf8');
  ok('押せる見た目がある（.cv-shok-i:hover）', /\.cv-shok-i:hover/.test(css));
}

console.log('\n─────────────────────────────');
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
