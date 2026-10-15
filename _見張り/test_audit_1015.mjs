/* =====================================================================
   PitFlow ── 2026-10-14 棚卸しの直し（v2.185.0）をまとめて見張る（ブラウザは使わない）
   ---------------------------------------------------------------------
   S-02 マスター入力で直すと、開いていた間に足されたフローの行と他人の変更が消えない
   S-25 フローの ✕ は消さずに打ち消し線・自動の記録は消せない・直す／消すは操作ログへ
   S-27 予約に紐づかない代車の貸出（手入力・緊急）も、作る・動かす・消すが操作ログに残る
   S-28 「入庫を取り消して予約に戻す」は消した値を「元は …」で残す
   S-41 未定BOX の日付はカレンダーで受け、形の違う字（10/20・全角）を入れない
   S-06 代車カレンダーの下書き中の札はクラウドへ送らない
   S-07 送る前に端末へ控える（journal）・閉じる時に止める（v2.185.2 で enablePersistence は外した）
   S-46 ログイン無しで取れる不要物を公開から外す
   使い方：node _見張り/test_audit_1015.mjs
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
const 素 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const 待つ = (ms = 10) => new Promise(r => setTimeout(r, ms));
const base = () => {
  const ctx = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  ctx.window = ctx; return ctx;
};

/* ---------------------------------------------------------------- S-02 */
console.log('\n── 🔴 S-02 マスター入力：開いていた間のフロー行・他人の変更を消さない ──');
{
  const ctx = base();
  ctx.state = { cards: [], customers: [], loaners: [], companyCars: [], boards: [{ id: 'default', name: '国産車', cols: [] }],
    settings: {}, workTypes: [], staff: [], divisions: [], dropTypes: [], repeatTypes: [] };
  const 操作 = [];
  ctx.pitLog = (a, o) => 操作.push(a + ' / ' + ((o && o.label) || ''));
  ctx.logFlow = (c, t) => { (c.log = c.log || []).push({ at: Date.now(), label: t }); };
  ctx.pitIsAdmin = () => true;
  ctx.pitAsk = () => Promise.resolve(true);
  vm.createContext(ctx);
  ['intern-pit.js', 'pit-share.js', 'card-miss.js', 'master-pit.js'].forEach(f => vm.runInContext(JS(f), ctx, { filename: f }));
  const カード = { id: 'm1', kana: 'ヤマダ', customer: '山田', repeat: 'repeat', dropType: 'drop', workType: 'normal', workTypes: ['normal'],
    boardId: 'default', reserveDate: '2026-10-10', actualInAt: '2026-10-10', status: 'check', memo: '元のメモ', todayNote: '',
    plate: '野田 300 あ 1', log: [{ at: 1, label: '入庫' }] };
  ctx.state.cards = [JSON.parse(JSON.stringify(カード))];
  ctx.pitMasterOpen('m1');
  ctx.pitMasterSet('memo', 'マスターで直したメモ');
  /* 開いている間に MHS が返車済み＋フロー1行＋当日メモ（本物へ） */
  const live = ctx.state.cards[0];
  live.status = 'workDone'; live.todayNote = 'MHSの当日メモ';
  live.log.push({ at: 2, label: '作業完了／MHS' });
  ctx.pitMasterSave(false); await 待つ(20);
  const s = ctx.state.cards[0];
  ok('🔴 自分の直し（メモ）は入る', s.memo === 'マスターで直したメモ', s.memo);
  ok('🔴🔴 開いていた間に足されたフローの行が残る', s.log.some(r => r.label === '作業完了／MHS'), s.log);
  ok('🔴🔴 他人が変えた状態・当日メモが戻らない', s.status === 'workDone' && s.todayNote === 'MHSの当日メモ', { st: s.status, n: s.todayNote });
  ok('記録に「当日メモ」を自分の名前で書いていない', !s.log.some(r => /当日メモ/.test(r.label || '')), s.log);
  /* 同じ欄を他人も直していたら聞く */
  ctx.pitMasterOpen('m1');
  ctx.pitMasterSet('memo', 'もう一度');
  ctx.state.cards[0].memo = 'ほかの人が直した';
  let 聞いた = null;
  ctx.pitAsk = (m, o) => { if (o && o.code) { 聞いた = o.code; return Promise.resolve(false); } return Promise.resolve(true); };
  ctx.pitMasterSave(false); await 待つ(20);
  ok('🔴 同じ欄をほかの人も直していたら聞く（PF-3081）', 聞いた === 'PF-3081', 聞いた);
  ok('やめたら上書きしない', ctx.state.cards[0].memo === 'ほかの人が直した', ctx.state.cards[0].memo);
}

/* ---------------------------------------------------------------- S-25 */
console.log('\n── 🔴 S-25 フロー：消さずに打ち消し線・直す／消すは操作ログへ ──');
{
  const ctx = base();
  ctx.PIT_CLOUD = true; ctx.pitIsAdmin = () => true;
  const 操作 = [];
  ctx.pitLog = (a, o) => 操作.push(a + ' / ' + ((o && o.label) || ''));
  ctx.pitCurrentStaffName = () => 'ゆうた';
  ctx.state = { cards: [{ id: 'c1', resNo: 'A1', log: [
    { label: '留守', at: 1000, manual: true, staff: '高橋' },
    { label: '確定返車日を変更　10/13 → 10/16', at: 2000 },
    { type: 'phase', from: 'check', to: 'work', at: 3000, by: '高橋' } ] }], staff: [] };
  vm.createContext(ctx);
  vm.runInContext(JS('flow-pit.js'), ctx, { filename: 'flow-pit.js' });
  const P = ctx.PitFlowLog, c = ctx.state.cards[0];
  P.del('c1', 0);
  ok('🔴🔴 手で足した記録は消えずに残る（行の数が同じ）', c.log.length === 3, c.log.length);
  ok('🔴 打ち消しの印・誰・いつ', c.log[0].deleted === true && c.log[0].deletedBy === 'ゆうた' && !!c.log[0].deletedAt, c.log[0]);
  ok('🔴 消したことが操作ログに残る', 操作.some(t => /フローの記録を消した/.test(t) && /留守/.test(t)), 操作);
  ok('🔴🔴 自動の記録（⑧の前 → 後）は管理の人でも消せない', P.del('c1', 1) === false && !c.log[1].deleted);
  ok('工程の記録も消せない', P.del('c1', 2) === false);
  P.undel('c1', 0);
  ok('「戻す」で戻る', !c.log[0].deleted, c.log[0]);
  操作.length = 0;
  P.setAt('c1', 2, '2026-10-14T09:30');
  ok('🔴 日時を直すと操作ログに「前 → 後」', 操作.some(t => /日時を直した/.test(t) && /→/.test(t)), 操作);
  P.setBy('c1', 2, '佐藤');
  ok('🔴 担当を直すと操作ログに「前 → 後」', 操作.some(t => /担当を直した/.test(t) && /高橋 → 佐藤/.test(t)), 操作);
  const cv = JS('card-view.js');
  ok('詳細の ✕ は打ち消し線の印を描き、「戻す」を出す', /cv-fgone/.test(cv) && /pitFlowUndel/.test(cv));
}

/* ---------------------------------------------------------------- S-27 / S-06 */
console.log('\n── 🔴 S-27 代車：予約に紐づかない札も記録／S-06 下書きは送らない ──');
{
  const src = JS('loaner.js');
  const s = 素(src);
  ok('🔴 予約以外の貸出を作ると操作ログ', /_loOpLog\('代車を貸し出した（予約以外）'/.test(s));
  ok('🔴 緊急車両を作ると操作ログ', /_loOpLog\('緊急車両を追加して貸し出した'/.test(s));
  ok('🔴 キャンセル（消去）すると中身ごと操作ログ', /_loOpLog\('代車の貸出をキャンセル/.test(s));
  ok('🔴 下書きの反映で「前 → 後」を操作ログ（予約に紐づかない札も）', /_loOpLog\('代車の貸出を動かした（代車カレンダーで反映）'/.test(s));
  ok('返却の確定・取り消しも操作ログ', /_loOpLog\('代車の返却を確定した'/.test(s) && /_loOpLog\('代車の返却を取り消した'/.test(s));
  ok('🔴 札を外す所は PitDB.keep を通る（直に filter して代入しない）', !/state\.loanerAssigns\s*=\s*\(state\.loanerAssigns\s*\|\|\s*\[\]\)\.filter\(function\(x\)/.test(s));
  ok('🔴 S-06 下書きの札かを db-pit.js へ知らせる口がある', /window\.pitLoanerInDraft\s*=/.test(s));
  ok('🔴 S-06 db-pit.js は下書きの札を送らない', /pitLoanerInDraft\(o\)\) return;/.test(JS('db-pit.js')));
}

/* ---------------------------------------------------------------- S-28 */
console.log('\n── 🔴 S-28 入庫を取り消して予約に戻す＝「元は …」 ──');
{
  const s = 素(JS('card-view.js'));
  const i = s.indexOf('window.cvBackToReserve');
  const body = s.slice(i, i + 4000);
  ok('🔴 消す前の確定金額・実績日・売上日・完TEL日・返車日を拾う', ['amountFinal', 'completedAt', 'salesDate', 'completeCallAt', 'returnDateFinal'].every(k => body.indexOf("c." + k) < body.indexOf("c.status = 'reserved'") && body.indexOf("c." + k) >= 0));
  ok('🔴 フローと操作ログの両方に「元は」を付ける', /logFlow\(c, '入庫を取り消して予約に戻した' \+ _元txt\)/.test(body) && /label: _cvLabel\(c\) \+ _元txt/.test(body));
}

/* ---------------------------------------------------------------- S-41 */
console.log('\n── 🔴 S-41 未定BOX の日付 ──');
{
  const ctx = base();
  let 次の答え = null, 出した = null;
  ctx.UI = { prompt: (t, v, o) => { ctx.__種類 = o && o.type; return Promise.resolve(次の答え); }, confirm: () => Promise.resolve(true), alert: (m, o) => { 出した = o && o.code; return Promise.resolve(true); } };
  ctx.pitAlert = (m, o) => { 出した = o && o.code; };
  vm.createContext(ctx);
  vm.runInContext(JS('ask-pit.js'), ctx, { filename: 'ask-pit.js' });
  const N = ctx.pitDateNorm;
  ok('pitDateNorm がある', typeof N === 'function');
  if (N) {
    ok('2026-10-20 はそのまま', N('2026-10-20') === '2026-10-20');
    ok('🔴 全角は直して受ける', N('２０２６－１０－２０') === '2026-10-20', N('２０２６－１０－２０'));
    ok('「/」区切り・1桁も直す', N('2026/1/5') === '2026-01-05');
    ok('🔴🔴 年の無い「10/20」は入れない', N('10/20') === '');
    ok('ありえない日（2/30）は入れない', N('2026-02-30') === '');
  }
  if (ctx.pitAskDate) {
    次の答え = '10/20'; const a = await ctx.pitAskDate('入庫日', '2026-10-01');
    ok('🔴 形が違えば null で返し、PF-1090 を出す', a === null && 出した === 'PF-1090', { a, 出した });
    次の答え = '２０２６－１０－２０'; const b = await ctx.pitAskDate('入庫日', '');
    ok('全角は直して返す', b === '2026-10-20', b);
    ok('🔴 共通部品の窓に {type:"date"} を渡す（カレンダーで受ける）', ctx.__種類 === 'date', ctx.__種類);
  } else ok('pitAskDate がある', false);
  const u = 素(JS('undetermined.js'));
  ok('🔴 未定BOX の2か所は pitAskDate を使う（文字の欄で受けない）', (u.match(/pitAskDate\(/g) || []).length >= 2 && !/pitAskText\('(入庫日|完TEL)/.test(u));
}

/* ---------------------------------------------------------------- S-07 */
console.log('\n── 🔴 S-07 送れていない直しを端末に残す・閉じる時に止める ──');
{
  const fi = 素(JS('firebase-init.js'));
  ok('🔴 enablePersistence は使わない（起動が重い・弾かれると黙って戻る）＝v2.185.2', !/enablePersistence\(/.test(fi));
  ok('🔴 送る前に端末へ控え（_jAdd）、届いたら消す（_jDone）', /self\._jAdd\(group\);[\s\S]{0,80}batch\.commit\(\)\.then\(function \(\) \{\s*self\._jDone\(group\)/.test(素(JS('db-pit.js'))));
  const d = 素(JS('db-pit.js'));
  ok('🔴 閉じる時、まだ届いていない直しがあれば止める（beforeunload）', /beforeunload[\s\S]{0,200}_unsentWarn\(\)/.test(d) && /returnValue/.test(d));
  /* 判定そのもの */
  const ctx = base(); ctx.PIT_CLOUD = true; ctx.PIT_WORK_TYPES = []; ctx.addEventListener = () => {};
  ctx.state = { settings: {}, cards: [], customers: [], loaners: [], loanerAssigns: [], companyCars: [], fleetEvents: [], boardNotes: [], staff: [] };
  ctx.document.querySelector = () => ({ content: '0' });
  vm.createContext(ctx); vm.runInContext(JS('db-pit.js'), ctx, { filename: 'db-pit.js' });
  const D = ctx.PitDB; D.mode = 'cloud';
  D._pending = {}; ok('送るものが無ければ止めない', D._unsentWarn() === false);
  D._pending = { 'pitCards/c1': 1 }; D._pendingSince = Date.now(); D._link = true;
  ok('押してすぐ（送り始めたばかり）なら止めない', D._unsentWarn() === false);
  D._pendingSince = Date.now() - 3000;
  ok('🔴 3秒たっても届いていなければ止める', D._unsentWarn() === true);
  D._pendingSince = Date.now(); D._link = false;
  ok('🔴 線が切れていて未送信があれば止める', D._unsentWarn() === true);
}

/* ---------------------------------------------------------------- S-46 */
console.log('\n── 🔴 S-46 ログイン無しで取れる不要物を公開から外す ──');
{
  const fj = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
  const ig = (fj.hosting && fj.hosting.ignore) || [];
  ['js/sample-patterns.js', 'shot_*.png', 'notes_*.png', 'test-*.html'].forEach(p => ok('ignore に ' + p, ig.includes(p) || ig.includes('**/' + p), ig));
  const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  ok('外した js は index.html から読まれていない', !/sample-patterns\.js/.test(idx));
  const rs = 素(JS('reset-pit.js'));
  ok('🔴 本番では「初期化」を出さない・動かさない（PF-0014）', /function canShow\(\)\s*\{\s*return isDemo\(\) && !isCloud\(\)/.test(rs) && /if \(isCloud\(\)\)[\s\S]{0,120}PF-0014/.test(rs));
}

console.log('\n' + (fail ? '  ❌ ' + fail + '件 赤／' + pass + '件 緑' : '  ✅ 全部そろっています（' + pass + '件）'));
process.exit(fail ? 1 : 0);
