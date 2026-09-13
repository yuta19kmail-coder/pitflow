/* PitFlow ── ⏳ **「伝票を直した」の印は、次のPDFで伝票が変わっていなければ無効**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた（2026-09-13・8月の総点検のあと）
     🗣「それはやろう」
       ＝ 0701 小黒様。8/25 に「整備ソフト側を直した（PitFlow はこのままでよい）」を押したが、
         9/13 に読んだPDFでも伝票は 8/16 のまま。**印のせいでチェック済みに隠れ、残り0に見えていた。**

   ◎決めごと
     🔴🔴 ① 「伝票を直した」＝**約束の印**（売上日・金額・担当）。
            印を押したあとに読んだ伝票で、**まだ同じズレがあれば印は効かない**（赤に戻る）
     🔴  ② 押し直せば、また効く（次のPDFを読むまで）
     🔴🔴 ③ 「このままでよい（実績日）」「確かめた（同じ車）」は**約束ではない**ので、古くても効いたまま
     🔴  ④ 読んだ時刻が分からない行（前の版で残した伝票）は、今までどおり印が効く
     🔴  ⑤ 画面は「◯/◯ に押したが、◯/◯ に読んだ伝票はまだ変わっていない」と言う
     🔴  ⑥ 読んだ時刻は PDF を読んだ時に付け、残した伝票にも残す。前の版の保存は「走らせた日時」で補う

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_quarter_stale.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
const bare = (f) => JS(f).replace(/\/\*[\s\S]*?\*\//g, '');

const ctx = { console, setTimeout, clearTimeout, Promise,
  state: { cards: [], staff: [{ id: 'u1', name: '社長' }, { id: 'u2', name: '専務' }] },
  pitQStaffName: (v) => String(v || '').replace(/\s/g, ''), pitCanEditFinal: () => true };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(JS('quarter-fix.js'), ctx, { filename: 'quarter-fix.js' });

const MARK_AT = '2026-08-25T04:12:29.101Z';   /* 0701 に「伝票を直した」を押した時 */
const READ_OLD = '2026-08-24T10:00:00.000Z';  /* 押す前に読んだPDF */
const READ_NEW = '2026-09-13T07:38:00.000Z';  /* 押したあとに読んだPDF（伝票は変わっていない） */

/* 0701 と同じ形：カードの売上日 8/15、伝票 8/16 */
const row = (id, read, o) => Object.assign({
  soft: { 売上日: '2026-08-16', 伝票: '0701', 顧客名: '小黒雄太', ナンバー: '習志野 502 な 3594', 金額: 8000, 受付担当: '社長', 読んだ: read },
  pit: { 生: { id }, 売上日: '2026-08-15', 数える日: '2026-08-17', フロント担当: '社長', 確定金額: 8000 },
  差: 0, 担当一致: true, 売上日ちがい: true, 期間の外: false, 同一性: 'vinOK', 同じ車: true
}, o || {});
const key = (p, kind) => [p.soft.売上日, p.soft.伝票, p.pit.生.id, kind].join('|');
const markAt = (p, kind, at) => { ctx._pitQMarks.unshift({ key: key(p, kind), 種類: kind, at, by: 'チーフ' }); };

console.log('\n── ① 押したあとに読んだ伝票でもズレが同じ → 印は効かない ──');
{
  ctx._pitQMarks = [];
  const p = row('c1', READ_NEW);
  ok('（前提）売上日のズレがある', ctx.pitQFixKinds(p).some(k => k.kind === '売上日'));
  markAt(p, '売上日', MARK_AT);
  ok('🔴🔴 印は効かない（pitQMarkOf が返さない）', ctx.pitQMarkOf('売上日', p.soft, 'c1') === null);
  ok('🔴🔴 残りに数える（rowLeft 1）', ctx.pitQRowLeft(p) === 1, ctx.pitQRowLeft(p));
  ok('🔴🔴 チェック済みに隠れない', ctx.pitQRowDone(p) === false);
  const st = ctx.pitQStaleMarkOf && ctx.pitQStaleMarkOf('売上日', p.soft, 'c1');
  ok('🔴 無効になった印は別に引ける（画面が「押したのに変わっていない」と言うため）', !!(st && st.at === MARK_AT), st);
}

console.log('\n── ① 押す前に読んだ伝票なら、印は効く（今までどおり） ──');
{
  ctx._pitQMarks = [];
  const p = row('c2', READ_OLD);
  markAt(p, '売上日', MARK_AT);
  ok('🔴 印が効く', !!ctx.pitQMarkOf('売上日', p.soft, 'c2'));
  ok('🔴 チェック済みになる', ctx.pitQRowDone(p) === true);
  ok('無効の印としては出ない', !(ctx.pitQStaleMarkOf && ctx.pitQStaleMarkOf('売上日', p.soft, 'c2')));
}

console.log('\n── ② 押し直せば、また効く ──');
{
  ctx._pitQMarks = [];
  const p = row('c3', READ_NEW);
  markAt(p, '売上日', '2026-09-13T08:00:00.000Z');
  ok('🔴 読んだあとに押した印は効く', !!ctx.pitQMarkOf('売上日', p.soft, 'c3') && ctx.pitQRowDone(p) === true);
}

console.log('\n── ① 金額・担当の約束も同じ ──');
{
  ctx._pitQMarks = [];
  const m = row('c4', READ_NEW, { 差: 171, 売上日ちがい: false });
  m.pit.売上日 = m.soft.売上日; m.soft.金額 = 8171;
  markAt(m, '金額', MARK_AT);
  ok('🔴 金額の約束も、あとで読んだ伝票が同じなら効かない', ctx.pitQMarkOf('金額', m.soft, 'c4') === null && ctx.pitQRowDone(m) === false);
  const s = row('c5', READ_NEW, { 担当一致: false, 売上日ちがい: false });
  s.pit.売上日 = s.soft.売上日; s.soft.受付担当 = '専務';
  markAt(s, '担当', MARK_AT);
  ok('🔴 担当の約束も、あとで読んだ伝票が同じなら効かない', ctx.pitQMarkOf('担当', s.soft, 'c5') === null && ctx.pitQRowDone(s) === false);
}

console.log('\n── ③ 「このままでよい」「確かめた」は約束ではない＝古くても効く ──');
{
  ctx._pitQMarks = [];
  const k = row('c6', READ_NEW, { 売上日ちがい: false, 期間の外: true });
  k.pit.売上日 = k.soft.売上日;
  markAt(k, '実績日', MARK_AT);
  ok('🔴🔴 実績日「このままでよい」は効いたまま', !!ctx.pitQMarkOf('実績日', k.soft, 'c6') && ctx.pitQRowDone(k) === true);
  const v = row('c7', READ_NEW, { 売上日ちがい: false, 同一性: 'plateNG' });
  v.pit.売上日 = v.soft.売上日;
  markAt(v, '同じ車', MARK_AT);
  ok('🔴🔴 同じ車「確かめた」は効いたまま', !!ctx.pitQMarkOf('同じ車', v.soft, 'c7') && ctx.pitQRowDone(v) === true);
}

console.log('\n── ④ 読んだ時刻が分からない行は、今までどおり印が効く ──');
{
  ctx._pitQMarks = [];
  const p = row('c8', '');
  markAt(p, '売上日', MARK_AT);
  ok('🔴 読んだ時刻なし → 効く（前の版の保存を壊さない）', !!ctx.pitQMarkOf('売上日', p.soft, 'c8') && ctx.pitQRowDone(p) === true);
}

console.log('\n── ⑤⑥ 画面と、読んだ時刻の受け渡し ──');
{
  const q = bare('quarter.js');
  const inner = (q.match(/function fixInner\(p\)\{[\s\S]*?\n  \}/) || [''])[0];
  ok('🔴 直すボタンの所で、無効になった印を言う', /pitQStaleMarkOf/.test(inner) && /q-fx-stale/.test(inner), inner.slice(0, 200));
  ok('🔴 PDFを読んだ時に、伝票の行へ読んだ時刻を付ける', /読んだ:\s*読んだ時/.test(q));
  ok('🔴 残した伝票で組み直す時、時刻の無い行は「走らせた日時」で補う', /\.読んだ\s*=\s*s\(r\.走らせた日時\)/.test(q));
  ok('🔴 突き合わせが読んだ時刻を連れて行く', /読んだ:\s*t\(r\.読んだ\)/.test(bare('quarter-match.js')));
  ok('🔴 残す伝票にも読んだ時刻を残す', /読んだ:\s*s\(r\.読んだ\)/.test(bare('quarter-store.js')));
  ok('無効の印の見た目がある', /\.q-fx-stale/.test(fs.readFileSync(path.join(process.cwd(), 'css', 'quarter.css'), 'utf8')));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
