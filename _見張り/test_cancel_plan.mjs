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

console.log('\n── ②b 第2段：入庫済み・返車済み・日時変更の計画 ──');
{
  const w = ctx(true);
  const r = { id: 'E', status: 'reserved', approvalPending: true };
  const ci = w.pitCheckInPlan(r, { today: '2026-10-17' });
  T('入庫済み：status=check・入庫日は空なら今日', ci.ok && ci.patch.status === 'check' && ci.patch.actualInAt === '2026-10-17' && ci.flow === '入庫（点検待ちへ）');
  T('入庫済み：承認待ちは1回聞く（approval-pit.js と同じ言葉）', ci.ask && /承認待ちです/.test(ci.ask.msg) && ci.ask.ok === 'このまま入庫する');
  T('入庫済み：入庫日が入っていれば触らない', !('actualInAt' in w.pitCheckInPlan({ id: 'E2', status: 'reserved', actualInAt: '2026-10-16' }).patch));
  T('入庫済み：代車の整備は計画を出さない（pitMaintIntakePlan の道）', w.pitCheckInPlan({ id: 'M', status: 'reserved', internKind: 'loanercar', maintSpans: [] }).skip === 'maint');
  T('入庫済み：止める＝もう入庫した', /もう入庫しています/.test(ci.guard({ status: 'check' })));

  const nc = { id: 'F', status: 'workDone', returnStage: 'returnWait', returnDate: '2026-10-16', amountOrder: 33000 };
  const rd = w.pitReturnDonePlan(nc, { today: '2026-10-17' });
  T('返車済み：実績日＝今日・返車日はそのまま・金額は受注から', rd.ok && rd.patch.status === 'returned' && rd.patch.completedAt === '2026-10-17' && rd.patch.returnDate === '2026-10-16' && +rd.patch.amountFinal === 33000, rd.patch);
  T('返車済み：フロー「返車完了（実績へ）」・窓に確定売上', rd.flow === '返車完了（実績へ）' && /確定売上 ¥33,000/.test(rd.ask.detail), rd.ask);
  T('返車済み：完TELを通っていない車は止める（PF-4010）', w.pitReturnDonePlan({ id: 'G', status: 'workDone' }).code === 'PF-4010');
  const ins = w.pitReturnDonePlan(Object.assign({}, nc, { workSpecials: ['insurance'] }), { today: '2026-10-17' });
  T('🛡 保険：実績に乗せない（入金日が無ければ空）・売掛の印', ins.patch.paymentSeparate === true && ins.patch.completedAt === '' && /保険：入金待ち/.test(ins.flow), ins.patch);
  const ins2 = w.pitReturnDonePlan(Object.assign({}, nc, { workSpecials: ['insurance'], paymentDate: '2026-10-10' }), { today: '2026-10-17' });
  T('🛡 保険：入金日が分かっていればその日で実績', ins2.patch.completedAt === '2026-10-10' && /入金済み/.test(ins2.flow), ins2);
  T('返車済み：止める＝金額がほかで変わった', /変わっています/.test(rd.guard(Object.assign({}, nc, { amountFinal: 1 }))));

  const cw = { id: 'H', status: 'workDone', returnStage: 'callWait', returnDate: '', returnTime: '' };
  const dp = w.pitReturnDatePlan(cw, '2026-10-20', '17:00', { today: '2026-10-17' });
  T('返車の日時：確定返車日・返車待ちへ・完TEL日（PitFlow の入口と同じ）', dp.ok && dp.patch.returnDate === '2026-10-20' && dp.patch.returnDateFinal === '2026-10-20' && dp.patch.returnStage === 'returnWait' && dp.patch.completeCallAt === '2026-10-17', dp.patch);
  T('返車の日時：完TEL待ちから入れた時は「完TEL済」の1行', /^完TEL済（完TEL待ちの欄から返車の予定を入力）／返車 2026-10-20 17:00／完TEL日 2026-10-17/.test(dp.flow), dp.flow);
  const rw = { id: 'I', status: 'workDone', returnStage: 'returnWait', returnDate: '2026-10-18', returnTime: '10:00', returnDateFinal: '2026-10-18' };
  const dp2 = w.pitReturnDatePlan(rw, '', '', { today: '2026-10-17' });
  T('🔴 返車の日時：日付を空にしたら確定返車日も空（A-03）', dp2.patch.returnDate === '' && dp2.patch.returnDateFinal === null && /確定返車日 2026-10-18 → なし/.test(dp2.flow), dp2);
  const dp3 = w.pitReturnDatePlan(rw, '2026-10-19', '10:00', { today: '2026-10-17' });
  T('返車の日時：言葉は return-slot.js の pitReturnChangeText と同じ', /2026-10-18 10:00 → 2026-10-19 10:00/.test(dp3.flow) && dp3.audit.action === '返車の予定を変更', dp3.flow);
  const rp = w.pitReserveDatePlan({ id: 'J', status: 'reserved', reserveDate: '2026-10-17', reserveTime: '09:00' }, '2026-10-18', '10:00');
  T('入庫の日時：言葉は card-tabs.js の pitLogDateChange と同じ', rp.flow === '入庫の予定を 2026-10-17 09:00 → 2026-10-18 10:00 に変更（当日ビューの日時変更）' && rp.patch.intakeTbd === false && rp.audit.action === '入庫の予定を変更', rp);
  T('入庫の日時：同じなら記録しない', w.pitReserveDatePlan({ id: 'K', reserveDate: '2026-10-17', reserveTime: '' }, '2026-10-17', '').audit === null);
}

console.log('\n── ②c 第2段：車販作業・完TEL済・お礼LINE の計画 ──');
{
  const w = ctx(true);
  const c = { id: 'S', status: 'workDone', coatingDone: false, salesReqDone: true };
  const u = w.pitCarSalesPlan(c, 'coating', false);
  T('車販作業を戻す：コーティング／車販依頼は2本とも外す・外した印を残す', u.patch.coatingDone === false && u.patch.salesReqDone === false && u.flow === '車販作業を戻した（コーティング・済 → 未・外した印 salesReqDone）', u);
  const d = w.pitCarSalesPlan({ id: 'S2' }, 'headlight', true);
  T('車販作業 完了：言葉は「ライト磨き」（PitFlow の言葉）', d.patch.headlightDone === true && d.flow === '車販作業 完了（ライト磨き・未 → 済）' && d.audit.kind === 'sales');
  T('車販作業：止める＝もう済', /先に「済」/.test(d.guard({ headlightDone: true })));

  const cw = { id: 'T', status: 'work', returnStage: 'callWait', bayId: 'b2', baySlot: 1, testDrive: true, coverCall: { done: false } };
  const cd = w.pitCallDonePlan(cw, { amt: '12,000', wash: true, washNote: '室内', line: true, d: '2026-10-20', t: '15:00' }, { today: '2026-10-17' });
  T('完TEL済：PitFlow の窓と同じ欄（作業完了・ベイを外す・試乗を外す・返車待ち・確定返車日・完TEL日・電話カバー済）',
    cd.ok && cd.patch.status === 'workDone' && cd.patch.bayId === null && cd.patch.testDrive === false && cd.patch.returnStage === 'returnWait'
    && cd.patch.returnDate === '2026-10-20' && cd.patch.returnDateFinal === '2026-10-20' && cd.patch.completeCallAt === '2026-10-17' && cd.patch.coverCall.done === true
    && cd.patch.amountFinal === 12000 && cd.patch.needWash === true && (w.pitThanksLineOK(cw) ? cd.patch.noThanksLine === false : !('noThanksLine' in cd.patch)), cd.patch);
  T('完TEL済：言葉は「完TEL済 → 行き先（日 時）」', /^完TEL済 → .+（2026-10-20 15:00）$/.test(cd.flow) && cd.audit.action === '完TEL済にした', cd.flow);
  T('完TEL済：過去の日付は止める（PitFlow の窓で実績化を聞く道）', w.pitCallDonePlan(cw, { d: '2026-10-01' }, { today: '2026-10-17' }).pastDate === true);
  const nd = w.pitCallDonePlan(Object.assign({}, cw, { returnDate: '2026-10-18', returnDateFinal: '2026-10-18' }), { d: '' }, { today: '2026-10-17' });
  T('完TEL済：日付未定なら確定返車日も空', nd.patch.returnDateFinal === null && nd.patch.returnDate === '', nd.patch);

  const th = w.pitThanksPlan({ id: 'U', status: 'returned', thanksLineSent: false }, false, { me: '小林' });
  T('お礼LINE：外す＝3つの欄を空に・言葉は PitFlow と同じ', th.patch.thanksLineSent === false && th.patch.thanksLineSentAt === '' && th.flow === 'お礼LINEの「送った」を外した');
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
  T('第2段：3つの書き手が入庫済み・返車済み・日時変更の計画を借りる',
    /pitCheckInPlan\(c,/.test(today) && /pitReturnDonePlan\(c,/.test(today) && /pitReserveDatePlan\(c, d, t\)/.test(today)
    && /pitCheckInPlan\(c,/.test(mhs) && /pitReturnDonePlan\(c,/.test(mhs) && /pitReturnDatePlan\(c,d,t/.test(mhs) && /pitReserveDatePlan\(c,d,t\)/.test(mhs)
    && /pitCheckInPlan\(c,/.test(dp) && /pitReturnDonePlan\(c,/.test(dp) && /pitReturnDatePlan\(c, d, tt/.test(dp) && /pitReserveDatePlan\(c, d, tt\)/.test(dp));
  const cf = fs.readFileSync(path.join(ROOT, 'CarFlow', 'carflow', 'js', 'pit-embed.js'), 'utf8');
  T('第2段：車販作業・完TEL済・お礼LINE も借りる（PitFlow 本体・desk-pit・CarFlow）',
    /pitCarSalesPlan\(c, task, on\)/.test(fs.readFileSync(path.join(PF, 'js', 'car-sales.js'), 'utf8'))
    && /pitCarSalesPlan\(c, CS_TASK\[sec\], on\)/.test(dp) && /pitCallDonePlan\(c,/.test(dp) && /pitThanksPlan\(c, on,/.test(dp)
    && /window\.pitCarSalesPlan\(c, task, !!val\)/.test(cf) && /\/js\/pit-share\.js/.test(cf));
  T('🔴 第2段：前の写し（MHS の pitReturnPatch・desk の返車日の手組み）が残っていない', !/function pitReturnPatch/.test(mhs) && !/p2\.returnDateFinal = d/.test(dp) && !/var p4 = \{ status: 'returned'/.test(dp));
}

console.log('\n' + (ng ? '❌' : '✅') + '  ' + ok + ' 件OK / ' + ng + ' 件NG');
process.exit(ng ? 1 : 0);
