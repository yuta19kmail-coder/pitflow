/* =====================================================================
   PitFlow ── 2026-10-14 棚卸し「今すぐ直せる」の直し（v2.186.0）をまとめて見張る（ブラウザは使わない）
   ---------------------------------------------------------------------
   A-02 予約詳細で直した欄の「編集：…」は、書いたその場（保存と同じ1回）で残る・同じ欄の連続は1行・2台でも消えない
   A-03 返車日を空にしたら確定返車日も空になる（完TELの窓の「未定」・当日ビューの返車キャンセル）＋前 → 後の記録
   A-04 予約・返車カレンダー・実績の月送りが月末（31日）に1か月飛ばない
   A-05 完TEL 済／未・仮⇄本予約・車検の記録直し・予定に戻す が「前 → 後」をフローと操作ログの両方へ／予定依頼も操作ログへ
   A-06 カードの消去は cardId・実績日・確定金額・売上日を操作ログに残す
   A-07 クォーターチェックの時刻・「入れた日」は日本時間（朝9時前に前日にならない）
   A-09 予約詳細を開いただけ（既定値の下ごしらえ）では書かない＝版が進まず、他の人の編集を弾かない
   B-14 クォーター一覧は取引（transaction）で足す・設定ファイルの読み込みは「確認した」印も置き換わると言う
   使い方：node _見張り/test_audit_1015b.mjs
     直す前の版で赤を確かめる：直す前のフォルダで同じファイルを走らせる（db-pit は PIT_DB_SRC でも差し替えられる）
   ===================================================================== */
process.env.TZ = 'Asia/Tokyo';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { makeCloud, boot, 待つ } from './_pit_cloud2.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
const 素 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const base = () => {
  const ctx = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Date, JSON, Math,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  ctx.window = ctx; return ctx;
};
const 走らせる = (ctx, files) => { vm.createContext(ctx); files.forEach(f => vm.runInContext(JS(f), ctx, { filename: f })); return ctx; };
const flowStub = (ctx) => { ctx.logFlow = (c, t) => { (c.log = c.log || []).push({ label: t, at: Date.now(), staff: '大野' }); }; };

/* ---------------------------------------------------------------- A-04 */
console.log('\n── 🔴 A-04 月末（31日）に月送りが1か月飛ばない ──');
{
  const ctx = base();
  ctx.state = { reserveRange: 'month', reserveDate: new Date(2026, 9, 31), returnRange: 'month', returnDate: new Date(2026, 9, 31) };
  走らせる(ctx, ['reserve.js', 'return.js']);
  ctx.renderReserve = () => {}; ctx.renderReturn = () => {};
  ctx.reserveNext();
  ok('🔴 予約カレンダー：10/31 から「次へ」で11月', ctx.state.reserveDate.getMonth() === 10, ctx.state.reserveDate.toString());
  ctx.state.reserveDate = new Date(2026, 11, 31); ctx.reservePrev();
  ok('予約カレンダー：12/31 から「前へ」で11月', ctx.state.reserveDate.getMonth() === 10, ctx.state.reserveDate.toString());
  ctx.state.reserveRange = '2month'; ctx.state.reserveDate = new Date(2026, 0, 31); ctx.reserveNext();
  ok('予約の2か月表示：1/31 から「次へ」で2月', ctx.state.reserveDate.getMonth() === 1, ctx.state.reserveDate.toString());
  ctx.returnNext();
  ok('🔴 返車カレンダー：10/31 から「次へ」で11月', ctx.state.returnDate.getMonth() === 10, ctx.state.returnDate.toString());
  const r = 素(JS('reserve.js')), t = 素(JS('return.js'));
  ok('🔴 2か月表示の2つ目（m2）も1日に寄せてから', /m2\.setDate\(1\); m2\.setMonth/.test(r) && /m2\.setDate\(1\); m2\.setMonth/.test(t));
  ok('見出しの「〜◯月」も1日に寄せてから', /next\.setDate\(1\); next\.setMonth/.test(r) && /next\.setDate\(1\); next\.setMonth/.test(t));
  const v = 素(JS('views.js'));
  ok('実績の月送り（prevMonth／nextMonth）も1日に寄せる', /function nextMonth\(\)\{\s*state\.resultMonth\.setDate\(1\)/.test(v) && /function prevMonth\(\)\{\s*state\.resultMonth\.setDate\(1\)/.test(v));
}

/* ---------------------------------------------------------------- A-07 */
console.log('\n── 🔴 A-07 クォーターチェックの時刻は日本時間 ──');
{
  const ctx = base();
  try { 走らせる(ctx, ['quarter.js']); } catch (e) {}
  ok('🔴 記録の時刻（世界時間の ISO）を日本時間で見せる：10/13 23:30Z → 10/14 08:30',
     typeof ctx.pitQStamp === 'function' && ctx.pitQStamp('2026-10-13T23:30:00.000Z', 16) === '2026-10-14 08:30', ctx.pitQStamp && ctx.pitQStamp('2026-10-13T23:30:00.000Z', 16));
  ok('日付だけ（10字）も日本時間', ctx.pitQStamp && ctx.pitQStamp('2026-10-13T23:30:00.000Z', 10) === '2026-10-14');
  ok('昔の「YYYY-MM-DD HH:MM」はそのまま', ctx.pitQStamp && ctx.pitQStamp('2026-10-01 09:15', 16) === '2026-10-01 09:15');
  const q = 素(JS('quarter.js')), w = 素(JS('quarter-write.js'));
  ok('🔴 画面に出す時刻を ISO の前から切らない（quarter.js）', !/\.at\)\.slice\(0, 1[06]\)|走らせた日時\)\.slice\(0, 1[06]\)/.test(q));
  ok('🔴 「書き込みました」の時刻・伝票の「入れた日」に toISOString を使わない（quarter-write.js）', !/toISOString/.test(w));
}

/* ---------------------------------------------------------------- A-03 */
console.log('\n── 🔴 A-03 返車日を空にしたら確定返車日も空に・前 → 後を残す ──');
{
  const ctx = base();
  const 操作 = [];
  ctx.pitLog = (a, o) => 操作.push(a + ' / ' + ((o && o.label) || ''));
  flowStub(ctx);
  ctx.state = { cards: [] };
  走らせる(ctx, ['return-slot.js']);
  const c = { id: 'r1', customer: '山田', car: 'タント', status: 'workDone', returnStage: 'returnWait', returnDate: '2026-10-16', returnTime: '10:00', returnDateFinal: '2026-10-16', log: [] };
  const res = ctx.pitReturnSetDateTime(c, '', '');
  ok('🔴🔴 返車日を空にすると確定返車日も空', c.returnDateFinal == null || c.returnDateFinal === '', c.returnDateFinal);
  ctx.pitReturnLogChange(c, res);
  ok('🔴 フローに「確定返車日 前 → なし」', c.log.some(r => /確定返車日 2026-10-16 → なし/.test(r.label)), c.log);
  ok('🔴 操作ログにも同じ1行', 操作.some(t => /確定返車日 2026-10-16 → なし/.test(t)), 操作);
  const 済 = { id: 'r2', status: 'returned', returnStage: 'returnWait', returnDate: '2026-10-10', returnDateFinal: '2026-10-10', completedAt: '2026-10-10', log: [] };
  ctx.pitReturnSetDateTime(済, '', '');
  ok('返車済み（実績）の車の確定返車日は動かさない', 済.returnDateFinal === '2026-10-10', 済.returnDateFinal);
  const 入れる = { id: 'r3', status: 'workDone', returnStage: 'returnWait', returnDate: '', returnDateFinal: null, log: [] };
  ctx.pitReturnSetDateTime(入れる, '2026-10-20', '');
  ok('日付を入れた時は今までどおり確定返車日に入る', 入れる.returnDateFinal === '2026-10-20', 入れる.returnDateFinal);
  const p = 素(JS('return-popup.js'));
  ok('🔴 完TELの窓で「d || 前の確定返車日」をやめた', !/returnDateFinal = d \|\| c\.returnDateFinal/.test(p));
  ok('完TELの窓：完TEL済・完TEL依頼を操作ログにも', /pitLog\('完TEL済にした'/.test(p) && /pitLog\('完TEL依頼にした'/.test(p));
  const td = 素(JS('today.js'));
  ok('当日ビューの返車キャンセル：操作ログにも（確定返車日の前の日付き）', /pitLog\('返車予定をキャンセル'/.test(td) && /_rs\.fFrom/.test(td));
}

/* ---------------------------------------------------------------- A-05 */
console.log('\n── 🔴 A-05 前 → 後が残らない道 ──');
{
  const ctx = base();
  const 操作 = [];
  ctx.pitLog = (a, o) => 操作.push(a + ' / ' + ((o && o.label) || ''));
  flowStub(ctx);
  ctx.state = { cards: [], staff: [] };
  走らせる(ctx, ['pit-share.js']);
  const 済 = { mode: 'manual', slots: {}, history: [], decided: '2026-10-14', decidedSlot: 'am', result: 'done', resultDate: '2026-10-14', resultSlot: 'am', resultStaff: '大野', office: 'o1', officeName: '品川', round: 2 };
  const r1 = ctx.pitShakenApply(済, 'doneedit', { at: { date: '2026-10-14', slot: 'am' }, patch: { date: '2026-10-15', slot: 'pm', round: 3 } });
  ok('🔴 合格の記録を直した：前の日・時間帯・R が「元は」で残る', r1 && /元は 10\/14 午前/.test(r1.log) && /2R/.test(r1.log.split('元は')[1] || ''), r1 && r1.log);
  const r2 = ctx.pitShakenApply(済, 'reopen', {});
  ok('🔴 予定に戻した：消える前の合格の日・担当が残る', r2 && /予定に戻した　元は 10\/14 午前/.test(r2.log) && /大野/.test(r2.log), r2 && r2.log);
  const 再 = { mode: 'manual', slots: {}, history: [{ date: '2026-10-10', slot: 'am', result: 'recheck', staff: '大野', officeName: '品川', round: 1, note: 'ライト' }] };
  const r3 = ctx.pitShakenApply(再, 'reedit', { at: { i: 0, date: '2026-10-10', slot: 'am' }, patch: { date: '2026-10-11' } });
  ok('不合格の記録を直した：元の日も残る', r3 && /元は 10\/10 午前/.test(r3.log), r3 && r3.log);
  const c = { id: 's1', customer: '佐藤', car: 'N-BOX', log: [] };
  ok('🔴 車検の記録の入口（pitShakenLog）がある', typeof ctx.pitShakenLog === 'function');
  if (ctx.pitShakenLog) ctx.pitShakenLog(c, r1);
  ok('🔴🔴 車検の操作がフローと操作ログの両方へ', c.log.length === 1 && 操作.some(t => /合格の記録を直した/.test(t) && /元は/.test(t)), { log: c.log, 操作 });
  const cv = 素(JS('card-view.js')), sk = 素(JS('shaken.js'));
  const 呼ぶ = (cv.match(/pitShakenLog\(/g) || []).length + (sk.match(/pitShakenLog\(/g) || []).length;
  ok('🔴 車検を書く画面（予約詳細3・車検予定5）が全部 pitShakenLog を通る', 呼ぶ >= 8, 呼ぶ);
  ok('🔴 仮予約⇄本予約は「前 → 後」の入口（pitLogDateChange）を通る', /pitLogDateChange\(_c, '予約の種類', _tFrom/.test(cv));
  ok('🔴 表紙の「完TEL 済／未」は返車前でもフローと操作ログへ', /pitLog\('完TELの印を変えた'/.test(cv) && /_cFrom/.test(cv));
  ok('🔴 PitFlow から出した予定依頼が操作ログに残る', /pitLog\('予定依頼を出した'/.test(素(JS('req-pit.js'))));
}

/* ---------------------------------------------------------------- A-06 */
console.log('\n── 🔴 A-06 カードの消去：消す前の中身を操作ログに ──');
{
  const cv = 素(JS('card-view.js'));
  /* 🗑 v2.189.0 消去＝ゴミ箱へ（先にゴミ箱へ写す cvDeleteCard → 入ったら cvDeleteCardNow が今までどおり消す） */
  const m = cv.match(/function cvDeleteCardNow\(_c\)\{[\s\S]*?\n  \}/);
  const s = m ? m[0] : '';
  ok('🔴 操作ログに cardId', /pitLog\([^,]*'予約カードを消去[^']*'[^,]*, \{[^}]*cardId: _c\.id/.test(s), s.slice(0, 200));
  ok('🗑 消去は先にゴミ箱へ写し、入ってから消す（入らなければ消さない PF-0065）', /cvTrashCopy\(c0\)\.then\(function\(\)\{ cvDeleteCardNow\(c0\); \}\)/.test(cv) && /PF-0065/.test(cv) && /CFTrash\.put\(b, co, \{ app:'pitflow', col:'pitCards'/.test(cv));
  ok('🔴 実績日・確定金額・売上日も', /実績日/.test(s) && /確定金額/.test(s) && /売上日/.test(s));
}

/* ---------------------------------------------------------------- A-09 */
console.log('\n── 🔴🔴 A-09 予約詳細を開いただけでは書かない（2台） ──');
{
  /* 開く時の下ごしらえ（card-view.js の ensure）をそのまま借りる */
  const cvSrc = JS('card-view.js');
  const em = cvSrc.match(/  function ensure\(c\)\{[\s\S]*?\n    return c;\n  \}/);
  const 下ごしらえ = new Function('return (' + (em ? em[0].trim() : 'function ensure(c){ return c; }') + ');')();
  ok('ensure を見つけた', !!em);
  ok('🔴 card-view.js が ensure を保存の比べ方に貸している（pitCardFillDefaults）', /window\.pitCardFillDefaults = ensure/.test(cvSrc));
  const 古いカード = { id: 'c9', resNo: 'Z1', customer: '山田', status: 'check', memo: '', log: [{ at: 1, label: '入庫' }], rev: 7 };
  const cloud = makeCloud({ data: { pitCards: [古いカード] } });
  const A = boot(cloud, { before: (ctx) => { ctx.pitCardFillDefaults = 下ごしらえ; } }); A.D.connectCloud({}, {}); await 待つ(30);
  const B = boot(cloud, { before: (ctx) => { ctx.pitCardFillDefaults = 下ごしらえ; } }); B.D.connectCloud({}, {}); await 待つ(30);
  cloud.止める(B.dev);
  下ごしらえ(A.S.cards[0]);                          /* A が予約詳細を開く（既定値の下ごしらえ） */
  A.D.save(true); await 待つ(80);
  const w = cloud.log.writes.filter(x => x.p === 'pitCards/c9');
  ok('🔴🔴 開いただけでは1件も書かない', w.length === 0, w);
  ok('🔴 版（rev）が進まない', cloud.サーバーの('pitCards', 'c9').rev === 7, cloud.サーバーの('pitCards', 'c9').rev);
  B.S.cards[0].memo = 'B が予約を編集で直したメモ';  /* まだ受け取っていない B が保存 */
  B.D.save(true); await 待つ(200);
  ok('🔴🔴 B の編集が弾かれない', cloud.log.弾いた.length === 0, cloud.log.弾いた);
  ok('B のメモが入る', cloud.サーバーの('pitCards', 'c9').memo === 'B が予約を編集で直したメモ');
  cloud.届けなおす(B.dev); await 待つ(60);
  A.S.cards[0].handover = 'home';                    /* 人が既定値以外に変えた欄は書く */
  A.D.save(true); await 待つ(150);
  const s = cloud.サーバーの('pitCards', 'c9');
  ok('🔴 人が変えた欄（引き渡し）は今までどおり書く', s.handover === 'home', s);
  ok('B のメモは残る', s.memo === 'B が予約を編集で直したメモ', s);
  const w2 = cloud.log.writes.filter(x => x.p === 'pitCards/c9').pop();
  ok('書くのは変えた欄＋版だけ（既定値の欄を巻き込まない）', w2 && JSON.stringify(w2.fields) === '["handover","rev"]', w2);
}

/* ---------------------------------------------------------------- A-02 */
console.log('\n── 🔴🔴 A-02 「編集：…」は書いたその場で（保存と同じ1回）・2台でも消えない ──');
{
  const cd = JS('card-detail.js');
  const bm = cd.match(/var _editRun = null;[\s\S]*?window\.pitCardEditRunEnd = _editRunEnd;/);
  ok('書いたその場で残す仕組み（_cardEditStep）がある', !!bm);
  ok('🔴 db-pit.js は送る直前に pitBeforeFlush を呼ぶ（クラウド・練習モードとも）', (JS('db-pit.js').match(/window\.pitBeforeFlush\(\)/g) || []).length >= 2);
  const カード = { id: 'e1', resNo: 'E1', customer: '山田', car: 'タント', status: 'check', memo: '', todayNote: '', log: [{ at: 1, label: '入庫' }], rev: 3 };
  const cloud = makeCloud({ data: { pitCards: [カード] } });
  const 操作 = [];
  const 仕込む = (ctx) => {
    ctx.pitLog = (a, o) => 操作.push(a + ' / ' + ((o && o.label) || ''));
    ctx.logFlow = (c, t) => { (c.log = c.log || []).push({ label: t, at: Date.now(), staff: '大野' }); };
  };
  const A = boot(cloud, { before: 仕込む, extra: ['pit-share.js'] }); A.D.connectCloud({}, {}); await 待つ(30);
  const B = boot(cloud, { before: 仕込む }); B.D.connectCloud({}, {}); await 待つ(30);
  if (bm) vm.runInContext('var _editingCardId = null, _openSnap = null;\n' + bm[0] + '\nwindow.__開く = function(id){ _editingCardId = id; _openSnap = JSON.parse(JSON.stringify(state.cards.find(function(x){return x.id===id;}))); };', A.ctx);
  if (A.ctx.__開く) A.ctx.__開く('e1');
  cloud.止める(B.dev);
  A.S.cards[0].memo = 'オイル';
  A.D.save(true); await 待つ(120);
  let s = cloud.サーバーの('pitCards', 'e1');
  ok('🔴🔴 閉じる前（保存の時）に「編集：メモ」がフローに入っている', (s.log || []).some(r => /^編集：メモ （空）→ オイル|^編集：メモ.*→ オイル/.test(r.label || '')), s.log);
  const w = cloud.log.writes.filter(x => x.p === 'pitCards/e1');
  ok('🔴 中身と記録が同じ1回の書き込み', w.length === 1 && w[0].fields.indexOf('memo') >= 0 && w[0].fields.indexOf('log') >= 0, w);
  A.S.cards[0].memo = 'オイル交換';
  A.D.save(true); await 待つ(120);
  s = cloud.サーバーの('pitCards', 'e1');
  const 編集 = (s.log || []).filter(r => /^編集：メモ/.test(r.label || ''));
  ok('🔴 同じ欄を続けて直したら1行にまとまる（前は直し始めの値）', 編集.length === 1 && /→ オイル交換$/.test(編集[0].label) && !/オイル →/.test(編集[0].label), 編集);
  ok('操作ログはひと続きが終わるまで書かない（打つたびに増えない）', !操作.some(t => /予約を編集/.test(t)), 操作);
  B.S.cards[0].todayNote = 'B の当日メモ';           /* まだ受け取っていない B が別の欄を保存 */
  B.D.save(true); await 待つ(250);
  s = cloud.サーバーの('pitCards', 'e1');
  ok('🔴🔴 2台：B が保存しても A の「編集：…」の行が残る', (s.log || []).some(r => /^編集：メモ/.test(r.label || '')), s.log);
  ok('2台：A のメモ・B の当日メモの両方が残る', s.memo === 'オイル交換' && s.todayNote === 'B の当日メモ', s);
  if (A.ctx.pitCardEditRunEnd) A.ctx.pitCardEditRunEnd();
  ok('🔴 ひと続きが終わったら操作ログに1行（前 → 後）', 操作.filter(t => /予約を編集/.test(t)).length === 1 && 操作.some(t => /メモ （空） → オイル交換|メモ.*→ オイル交換/.test(t)), 操作);
  ok('閉じる時（closeDetail）は残りを書き切って締めるだけ', /_cardEditStep\(\); \} catch \(e\) \{\}\s*try \{ _editRunEnd\(\); \}/.test(cd));
}

/* ---------------------------------------------------------------- B-14 */
console.log('\n── 🔴 B-14 クォーター一覧は取引で・設定の読み込みの説明 ──');
{
  const qs = 素(JS('quarter-store.js'));
  ok('🔴 一覧に足す（pushList）は runTransaction', /function pushList[\s\S]*?runTransaction[\s\S]*?\n  \}/.test(qs));
  ok('一覧から消す（deleteRun）も runTransaction', /function deleteRun[\s\S]*?runTransaction/.test(qs));
  /* 2台：取引の中で読み直すので、間に足された行が消えない（取引を持つ偽の Firestore で確かめる） */
  const ctx = base();
  let doc = { 一覧: [{ id: 'qrun-old', from: '2026-09-01' }, { id: 'qrun-A', from: '2026-10-01' }] };
  const ref = { get: () => Promise.resolve({ exists: true, data: () => JSON.parse(JSON.stringify(doc)) }),
                set: (v) => { doc = JSON.parse(JSON.stringify(v)); return Promise.resolve(); } };
  let 割り込み = true;
  ref.firestore = { runTransaction: async (fn) => {
    for (let i = 0; i < 3; i++) {
      const seen = JSON.stringify(doc); let pend = null;
      const tx = { get: (r) => r.get(), set: (r, v) => { pend = v; } };
      await fn(tx);
      if (割り込み) { doc.一覧.push({ id: 'qrun-B', from: '2026-10-08' }); 割り込み = false; }   /* 取引の間に B が足す */
      if (JSON.stringify(doc) !== seen) continue;                                              /* 読み直し */
      doc = JSON.parse(JSON.stringify(pend)); return;
    }
  } };
  ctx.PIT_CLOUD = true;
  ctx.fb = { company: () => ({ collection: () => ({ doc: (id) => id === 'qruns' ? ref : { delete: () => Promise.resolve(), set: () => Promise.resolve(), get: () => Promise.resolve({ exists: false }) } }) }) };
  try { 走らせる(ctx, ['quarter-store.js']); } catch (e) {}
  ctx.pitQRunId = ctx.pitQRunId || (() => 'qrun-A');
  if (ctx.pitQDeleteRun) {
    const 消す = ctx.pitQRunId('2026-10-01', '2026-10-07');
    doc.一覧[1].id = 消す;
    await ctx.pitQDeleteRun('2026-10-01', '2026-10-07');
    const ids = doc.一覧.map(x => x.id);
    ok('🔴🔴 2台：A が1行消す間に B が足した行が消えない（取引の中で読み直す）', ids.includes('qrun-B') && ids.includes('qrun-old') && !ids.includes(消す), ids);
  } else {
    ok('一覧から消す関数（pitQDeleteRun）がある', false);
  }
  const st = JS('settings-transfer.js');
  ok('🔴 設定の読み込み：「確認した」印も置き換わると先に言う', /「確認した」「出さない」の印も、ファイルを書き出した時点のものに置き換わります/.test(st));
}

/* ---------------------------------------------------------------- 車販作業の「戻す」（CarFlow v3.16.7 と揃える） */
console.log('\n── 🔴 車販作業の「戻す」は済の印を2本とも外す・記録に残す ──');
{
  const src = JS('car-sales.js');
  const m = src.match(/const CS_DONEFLAG = [^\n]*\n/);
  const u = src.match(/(?:const CS_TASK_W[\s\S]*?)?window\.csUndo = function\(id, task\)\{[\s\S]*?\n\};/);
  const d = src.match(/window\.csDone = function\(id, task\)\{[\s\S]*?\n\};/);
  const ctx = base();
  const 操作 = [];
  ctx.pitLog = (a, o) => 操作.push(a + ' / ' + ((o && o.label) || ''));
  flowStub(ctx);
  ctx.renderCarSales = () => {};
  ctx.state = { cards: [{ id: 'k1', customer: '山田', car: 'タント', salesReq: true, salesReqDone: true, coatingDone: false, log: [] }] };
  vm.createContext(ctx);
  vm.runInContext((m ? m[0] : '') + (u ? u[0] : '') + '\n' + (d ? d[0] : ''), ctx);
  ctx.csUndo('k1', 'coating');
  const c = ctx.state.cards[0];
  ok('🔴🔴 「その他依頼」側の印（salesReqDone）で済んだ車も戻る', !c.salesReqDone && !c.coatingDone, c);
  ok('🔴 戻したことがフローに（前 → 後・外した印）', c.log.some(r => /車販作業を戻した（コーティング・済 → 未・外した印 salesReqDone）/.test(r.label)), c.log);
  ok('🔴 操作ログにも', 操作.some(t => /車販作業を戻した/.test(t)), 操作);
  ctx.csDone('k1', 'wash');
  ok('完了も操作ログへ（未 → 済）', 操作.some(t => /車販作業 完了（洗車・未 → 済）/.test(t)), 操作);
}

/* ---------------------------------------------------------------- A-26（v2.187.0） */
console.log('\n── 🔴 A-26 代車の入庫・社内車両の実績化は「読むだけの物差し」（MHS も同じ物を借りる＝MHS\\test_v189_maint.mjs で本体と突き合わせ） ──');
{
  const ctx = base();
  ctx.state = { cards: [], staff: [] };
  走らせる(ctx, ['pit-share.js', 'intern-pit.js']);
  const T0 = '2026-10-15';
  const c = { id: 'm1', status: 'reserved', internKind: 'loanercar', workType: 'shaken', maintVehId: 'v1', boardId: 'default',
              maintSpans: [{ sid: 's1', from: '2026-10-14', to: '2026-10-16' }, { sid: 's2', from: '2026-10-30', to: '2026-10-31' }], maintFixSid: 's1', log: [] };
  const 前 = JSON.stringify(c);
  const p = ctx.pitMaintIntakePlan(c, { today: T0, loaners: [{ id: 'v1', model: 'ハスラー', custId: 'k1', custVehId: 'kv1' }], companyCars: [],
    customers: [{ id: 'k1', name: '山田', vehicles: [{ id: 'kv1', boardId: 'import', karteNo: 'K1' }] }] });
  ok('🔴 カードを書き換えない（読むだけ）', JSON.stringify(c) === 前);
  ok('🔴 答え：点検待ち・入庫日・期間を今日から・お客様の控え・課', p.ok && p.patch.status === 'check' && p.patch.actualInAt === T0 && p.patch.maintSpans[0].from === T0
     && p.patch.customerId === 'k1' && p.patch.boardId === 'import' && !('customer' in p.patch), p);
  ok('フロー・操作ログの行も答えに入っている（前 → 後）', /予約 → 点検待ち/.test(p.logLines[0]) && p.audit[0].action === '代車を整備で入庫した');
  ok('もう入庫していれば PF-3058', ctx.pitMaintIntakePlan(Object.assign({}, c, { status: 'check' }), { today: T0 }).code === 'PF-3058');
  ok('ふつうのカードは素通し（skip）', ctx.pitMaintIntakePlan({ id: 'n' }, {}).skip === true);
  const r = ctx.pitInternReturnPlan(Object.assign({}, c, { status: 'workDone', returnDate: '' }), { today: T0 });
  ok('🔴 社内車両の実績化：売上なし・残りの候補を消す', r.ok && r.patch.amountFinal === '' && r.patch.maintSpans.length === 1 && r.audit.length === 2, r);
  ok('🔴 実績化のフローの1行は日本語の状態名（MHS でも同じ）', /作業完了 → 返車済み/.test(r.logLines[0]) && !/workDone/.test(r.logLines[0]), r.logLines);
  /* v2.187.1 物差しが「できない」と言った時（ask が無い）でも例外にならず、理由を出して止まる */
  const 出した = [];
  ctx.pitAlert = (m, o) => 出した.push((o && o.code) + ' ' + m);
  const 本物 = ctx.pitInternReturnPlan;
  ctx.pitInternReturnPlan = () => ({ ok: false, code: 'PF-4013', why: '代車の整備は PitFlow で返車してください（部品が古い）' });
  let 引き取った = null, 落ちた = null;
  try { 引き取った = ctx.pitInternReturn(Object.assign({}, c, { status: 'workDone' })); } catch (e) { 落ちた = e.message; }
  ctx.pitInternReturnPlan = 本物;
  ok('🔴 できない時は例外にならず、理由を出して止まる（引き取って進めない）', !落ちた && 引き取った === true && 出した.some(t => /PF-4013/.test(t)), { 落ちた, 出した });
  const mp = 素(JS('maint-pit.js')), ip = 素(JS('intern-pit.js'));
  ok('🔴 PitFlow 本体の入庫もこの物差しを通す（maint-pit.js）', /w\.pitMaintIntakePlan\(c, _intakeCtx/.test(mp) && !/c\.status\s*=\s*'check'/.test(mp));
  ok('🔴 PitFlow 本体の実績化もこの物差しを通す（intern-pit.js）', /w\.pitInternReturnPlan\(c, \{ today/.test(ip));
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' 件が緑／' + fail + ' 件が赤');
process.exit(fail ? 1 : 0);
