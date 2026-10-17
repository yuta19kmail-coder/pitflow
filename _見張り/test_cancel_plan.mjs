/* ========================================================
   test_cancel_plan.mjs ── 🔗 2026-10-17（棚卸し C-07 連携の型・第1段）
   --------------------------------------------------------
   ゆうた決定「挙動は PitFlow をマスターとして PitFlow に揃えて」。
   返車キャンセル・来店なしキャンセルの「何を書くか」は pit-share.js の計画（書かない関数）1本にし、
   PitFlow 本体（today.js）・MHS（index.html）・見る所3つ（_shared\coreflow-desk-pit.js）が同じ物を借りる。
   ◎見張ること
     ① 計画の中身（確定返車日も空にする・ベイは触らない・日付の残し方・操作ログ・止める条件）
     ② 3つの書き手が計画を借りていて、前の写し（ベイを空ける・確定返車日を残す）が残っていない
   走らせ方:  node _見張り/test_cancel_plan.mjs   （PitFlow\pitflow で・ブラウザ不要）
   ======================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PF = path.join(HERE, '..');
const ROOT = path.join(PF, '..', '..');
let ok = 0, ng = 0;
const T = (n, c, x) => { if (c) { ok++; console.log('  ✅ ' + n); } else { ng++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')); } };

function ctx(withSlot) {
  const w = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout };
  w.window = w;
  vm.createContext(w);
  vm.runInContext(fs.readFileSync(path.join(PF, 'js', 'pit-share.js'), 'utf8'), w);
  if (withSlot) vm.runInContext(fs.readFileSync(path.join(PF, 'js', 'return-slot.js'), 'utf8'), w);
  return w;
}

console.log('\n── ① 返車キャンセルの計画 ──');
for (const withSlot of [true, false]) {
  const w = ctx(withSlot), tag = withSlot ? '（日時の入口あり）' : '（入口なし＝最小限）';
  const c = { id: 'A', status: 'workDone', returnDate: '2026-10-15', returnTime: '17:00', returnDateFinal: '2026-10-15', returnStage: 'returnWait' };
  const p = w.pitReturnCancelPlan(c);
  T('返車日・時間を空にする' + tag, p.ok && p.patch.returnDate === '' && p.patch.returnTime === '', p.patch);
  T('🔴 確定返車日も空にする（A-03）' + tag, p.patch.returnDateFinal === null, p.patch);
  T('フローに「元は〜・確定返車日 → なし」' + tag, /返車予定キャンセル（未定へ）　元は 2026-10-15 17:00・確定返車日 2026-10-15 → なし/.test(p.flow), p.flow);
  T('操作ログは「返車予定をキャンセル」kind out' + tag, p.audit.action === '返車予定をキャンセル' && p.audit.kind === 'out');
  T('元のカードは書き換えない（計画は書かない関数）' + tag, c.returnDate === '2026-10-15' && c.returnDateFinal === '2026-10-15');
  T('止める：もう返車済み' + tag, /返車済み/.test(p.guard(Object.assign({}, c, { status: 'returned' }))));
  T('止める：返車日がほかで変わった' + tag, /変わっています/.test(p.guard(Object.assign({}, c, { returnDate: '2026-10-16' }))));
  T('止めない：今と同じ' + tag, p.guard(Object.assign({}, c)) === '');
}
{
  const w = ctx(true);
  const done = { id: 'B', status: 'returned', returnDate: '2026-10-15', returnDateFinal: '2026-10-15' };
  T('返車済み（実績）の確定返車日は動かさない（入口の決まり）', !('returnDateFinal' in w.pitReturnCancelPlan(done).patch));
}

console.log('\n── ② 来店なしキャンセルの計画（PitFlow 本体の形） ──');
{
  const w = ctx(false);
  const c = { id: 'C', status: 'reserved', bayId: 'b1', baySlot: 1, noShowAt: '2026-10-10', cancelledAt: '2026-09-01' };
  const p = w.pitNoShowCancelPlan(c, { today: '2026-10-17', loaner: { n: 1, text: 'N-BOX' } });
  T('status＝cancelled・noShow を立てる', p.patch.status === 'cancelled' && p.patch.noShow === true);
  T('🔴 ベイは触らない（MHS だけ空けていた）', !('bayId' in p.patch) && !('baySlot' in p.patch), p.patch);
  T('🔴 noShowAt は前の値を残す・cancelledAt は今日', p.patch.noShowAt === '2026-10-10' && p.patch.cancelledAt === '2026-10-17', p.patch);
  T('代車の予定はそのまま、をフローと窓に書く', /代車の予定はそのまま：N-BOX/.test(p.flow) && /N-BOX/.test(p.ask.detail));
  T('🔴 操作ログを残す（前は PitFlow 本体だけ残していなかった）', p.audit.action === '入庫予約をキャンセル（来店なし）' && p.audit.kind === 'in');
  T('止める：もう入庫した', /入庫前ではありません/.test(p.guard({ status: 'check' })));
  T('止めない：まだ予約', p.guard({ status: 'reserved' }) === '');
  const p2 = w.pitNoShowCancelPlan({ id: 'D', status: 'reserved' }, { today: '2026-10-17' });
  T('noShowAt が無ければ今日', p2.patch.noShowAt === '2026-10-17');
}

console.log('\n── ③ 3つの書き手が同じ計画を借りている ──');
{
  const today = fs.readFileSync(path.join(PF, 'js', 'today.js'), 'utf8');
  const tc = today.slice(today.indexOf('window.pitTodayCancel'), today.indexOf('window.pitTodayActionClose'));
  T('PitFlow 本体（today.js）は計画を使う', /pitReturnCancelPlan\(c\)/.test(tc) && /pitNoShowCancelPlan\(c,/.test(tc) && /pitLog\(_pl\.audit\.action/.test(tc));
  T('PitFlow 本体に前の手書き（c.noShow = true など）が残っていない', !/c\.noShow\s*=\s*true/.test(tc) && !/c\.status\s*=\s*'cancelled'/.test(tc));

  const mhs = fs.readFileSync(path.join(ROOT, 'MHS', 'index.html'), 'utf8');
  const mc = mhs.slice(mhs.indexOf('function pitTodayCancel('), mhs.indexOf('function pitTodayCheckIn('));
  T('MHS は計画を借りる', /pitReturnCancelPlan\(c\)/.test(mc) && /pitNoShowCancelPlan\(c,/.test(mc) && /pitPatch\(id,plan\.patch,plan\.toast,plan\.flow,plan\.guard\)/.test(mc));
  T('🔴 MHS に前の写し（ベイを空ける）が残っていない', !/bayId:null/.test(mc), mc.slice(0, 200));
  T('MHS の書き込み口は guard があれば今のカードを読んで確かめる（MH-0041）', /function pitPatch\(id,patch,okMsg,flowLabel,guard\)/.test(mhs) && /runTransaction/.test(mhs.slice(mhs.indexOf('function pitPatch('), mhs.indexOf('function pitPatch(') + 2500)) && /MH-0041/.test(mhs));

  const dp = fs.readFileSync(path.join(ROOT, '_shared', 'coreflow-desk-pit.js'), 'utf8');
  const dc = dp.slice(dp.indexOf("if (a === 'cancel' || a === 'cancel-go')"), dp.indexOf("if (a === 'shk')"));
  T('見る所3つ（desk-pit）は計画を借りる', /pitReturnCancelPlan/.test(dp) && /pitNoShowCancelPlan/.test(dp) && /patch\(c, pl\.patch, label, pl\.flow, '', pl\.guard\)/.test(dc));
  T('🔴 desk-pit に前の写し（返車日だけ空にする）が残っていない', !/returnDate: '', returnTime: '', returnTbd: false/.test(dp));
}

console.log('\n' + (ng ? '❌' : '✅') + '  ' + ok + ' 件OK / ' + ng + ' 件NG');
process.exit(ng ? 1 : 0);
