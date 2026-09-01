/* PitFlow ── 🚨🚨🚨 **古い画面のまま自動処理が走って、他人の作業を消す**（ブラウザは使わない）
   ===================================================================
   ◎実際に起きた事故（2026-08-28 13:37:03・詳細＝`調査_2026-08-29_PitFlow_古い画面のまま塗り替わる.md`）
     開きっぱなしの画面が、線が切れて **8/27 の作業を受け取っていなかった**。
     その画面で自動処理（入庫日を過ぎた予約を未入庫へ）が走り、**5件を古い写しで塗り替えた。**
     消えたのは入庫と返車だけでなく、椎名さん・社長・箱崎さんが 8/27 にやったことも全部。

   ◎なぜ止められなかったか（3つ重なった）
     🔴 ① 変更を受け取る線が切れても、**アプリは黙っている**（張り直さない・画面にも出さない）
     🔴 ② 保存が「変わった所だけ」ではなく **カードまるごと差し替え**
     🔴 ③ 自動処理が、**手元の写しだけを見て**「入庫していない」と判断した
        （v2.22.0 で入れた「実入庫日があれば動かさない」も、**古い写しの実入庫日を見る**ので効かない）

   ◎この見張りがやること
     本物のクラウドには繋がない。**見せかけのクラウド**を作り、
     「この端末にだけ届かせない」を手で起こせるようにしてある（`止める` / `流す`）。
     ＝ **事故をそのまま再現できる。**

   ◎🔴 直す前は ①②③ が赤くなる。それが正しい（＝事故を再現できている証拠）。
   ◎使い方
     node test_stale_guard.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const tick = (n = 3) => new Promise(r => setTimeout(r, n));
/* 🔴 保存は500ms待ってからまとめて送られる（デバウンス）。ここを待たないと**何も起きていないのに緑になる**。 */
const 保存を待つ = () => new Promise(r => setTimeout(r, 900));
const COLS = ['pitCards','pitCustomers','pitLoaners','pitLoanerAssigns','pitCompanyCars','pitFleetEvents','pitBoardNotes'];
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

/* =====================================================================
   見せかけのクラウド
   ・`止める(箱)` … その箱の見張りへの配信を止める（＝線が切れた状態）
   ・`よそが直す()` … 別の端末がサーバーの中身を直した、を作る
   ===================================================================== */
function makeCloud(opt) {
  const data = {};
  COLS.forEach(c => { data[c] = ((opt.data && opt.data[c]) || []).map(o => JSON.parse(JSON.stringify(o))); });
  const settingsDoc = opt.settings === undefined
    ? { settings: {}, bays: [], floorPlan: { shapes: [] }, aiVerdicts: {}, boardLabels: {}, inspectMarks: {}, inspectMutes: {} }
    : opt.settings;
  const dead = new Set();                 // 配信を止めた箱
  const watchers = {};
  const log = { set: [], del: [], commits: 0, serverGets: [] };
  let 通信できる = true;

  const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.id; return c; };
  const docOf = (id, body) => ({ id, exists: body !== null && body !== undefined, data: () => body === null ? null : JSON.parse(JSON.stringify(body)) });
  const colSnap = (col) => {
    const arr = data[col].map(o => docOf(o.id, strip(o)));
    return { forEach: f => arr.forEach(f), docChanges: () => arr.map(doc => ({ type: 'added', doc })), size: arr.length,
             metadata: { fromCache: false } };
  };
  const one = (col, id) => { const o = (data[col] || []).find(x => x.id === id); return docOf(id, o ? strip(o) : null); };

  const errs = {};                          // 箱 → 見張りのエラー口
  let 写しから = false;                      // つながり監視が返す印（true＝サーバーから届いていない）
  const 監視 = { cb: null, err: null };
  const collection = (col) => ({
    get: (o) => {
      if (o && o.source === 'server' && !通信できる) return Promise.reject(new Error('offline'));
      return Promise.resolve(colSnap(col));
    },
    onSnapshot: (cb, er) => { watchers[col] = cb; errs[col] = er;
      Promise.resolve().then(() => { if (!dead.has(col)) cb(colSnap(col)); }); return () => { delete watchers[col]; }; },
    doc: (id) => ({
      __path: col + '/' + id,
      get: (o) => {
        if (o && o.source === 'server') { log.serverGets.push(col + '/' + id); if (!通信できる) return Promise.reject(new Error('offline')); }
        return Promise.resolve(col === 'pitSettings' ? docOf(id, settingsDoc) : one(col, id));
      },
      /* (options, next, err) と (next, err) の両方を受ける＝本物と同じ */
      onSnapshot: (a, b, c) => {
        const opt = (typeof a === 'object' && a !== null) ? a : null;
        const next = opt ? b : a, er = opt ? c : b;
        const 出す = () => { const d0 = col === 'pitSettings' ? docOf(id, settingsDoc) : one(col, id);
                             d0.metadata = { fromCache: opt ? 写しから : false }; next(d0); };
        if (opt) { 監視.cb = 出す; 監視.err = er; }
        else { watchers[col + '/' + id] = next; }
        Promise.resolve().then(() => { if (!dead.has(col)) 出す(); });
        return () => {};
      }
    })
  });

  const db = { batch: () => { const ops = []; return {
      set: (ref, body) => ops.push({ t: 'set', p: ref.__path, body }),
      delete: (ref) => ops.push({ t: 'del', p: ref.__path }),
      commit: () => { if (!通信できる) return Promise.reject(new Error('offline'));
        ops.forEach(o => { const i = o.p.indexOf('/'), col = o.p.slice(0, i), id = o.p.slice(i + 1);
          if (o.t === 'del') { log.del.push(o.p); if (data[col]) data[col] = data[col].filter(x => x.id !== id); return; }
          log.set.push(o.p);
          if (data[col]) { const j = data[col].findIndex(x => x.id === id); const n = Object.assign({ id }, o.body); if (j >= 0) data[col][j] = n; else data[col].push(n); }
        });
        log.commits++; return Promise.resolve(); } }; } };

  return {
    fb: { ready: true, currentUser: { uid: 'u1' }, db, company: () => ({ collection }), serverTimestamp: () => 0 },
    log, data, watchers,
    止める: (col) => dead.add(col),
    /* 見張りが落ちた（エラーで死んだ）を起こす */
    線を切る: (col) => { dead.add(col); if (errs[col]) errs[col](new Error('listen failed')); },
    /* つながり監視の印を「サーバーから届いていません」にする／戻す */
    写しから返す: () => { 写しから = true; if (監視.cb) 監視.cb(); },
    サーバーに戻す: () => { 写しから = false; dead.clear(); if (監視.cb) 監視.cb(); },
    生きている箱: () => Object.keys(watchers),
    通信を切る: () => { 通信できる = false; },
    通信を戻す: () => { 通信できる = true; },
    /* よその端末がサーバーの中身を直した（この端末には届かない箱なら届かない） */
    よそが直す: (col, id, patch) => {
      const o = (data[col] || []).find(x => x.id === id); if (!o) return false;
      Object.assign(o, patch);
      const cb = watchers[col];
      if (cb && !dead.has(col)) cb({ docChanges: () => [{ type: 'modified', doc: docOf(id, strip(o)) }], forEach: () => {} });
      return true;
    },
    サーバーの: (col, id) => { const o = (data[col] || []).find(x => x.id === id); return o ? JSON.parse(JSON.stringify(o)) : null; }
  };
}

/* =====================================================================
   端末を1台起こす（db-pit.js ＋ overdue-pit.js）
   ===================================================================== */
function boot(opt) {
  const cloud = makeCloud(opt || {});
  const said = [];
  const ctx = {};
  ctx.window = ctx;
  const 文 = (a) => [].map.call(a, x => (x && x.stack) ? x.stack.split('\n').slice(0,3).join(' | ') : String(x)).join(' ');
  ctx.console = { log: function(){ said.push(文(arguments)); }, warn: function(){ said.push('警告:' + 文(arguments)); }, error: function(){ said.push('エラー:' + 文(arguments)); } };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.Promise = Promise; ctx.JSON = JSON; ctx.Date = Date; ctx.Math = Math;
  ctx.document = { addEventListener() {}, querySelector: () => ({ content: '0.0.0' }), hidden: false };
  ctx.addEventListener = () => {};
  ctx.localStorage = { length: 0, getItem: () => null, setItem() {}, removeItem() {}, key: () => null };
  ctx.PIT_CLOUD = true;
  ctx.PIT_WORK_TYPES = [];
  ctx.state = { settings: {}, bays: [], floorPlan: { shapes: [] }, aiVerdicts: {}, boardLabels: {}, inspectMarks: {}, inspectMutes: {},
                cards: [], customers: [], loaners: [], loanerAssigns: [], companyCars: [], fleetEvents: [], boardNotes: [], staff: [] };
  ctx.fb = cloud.fb;
  /* 画面まわりの代わり（記録だけ残す） */
  const 記録 = { flow: [], op: [] };
  ctx.logFlow = (c, txt, o) => { (c.log = c.log || []).push({ at: Date.now(), label: txt, auto: !!(o && o.auto) }); 記録.flow.push((c.resNo||c.id) + ': ' + txt); };
  ctx.logFlowAuto = (c, txt) => ctx.logFlow(c, txt, { auto: true });
  ctx.pitLog = (a, o) => 記録.op.push(a + ' / ' + ((o && o.label) || ''));
  ctx.pitCardTag = (c) => '[' + ((c && c.resNo) || '') + ']';
  ctx.pitLoanerPlanOf = () => ({ n: 0, text: '' });
  ctx.pitReturnSetDateTime = (c) => { c.returnDate = ''; c.returnTime = ''; };
  const ランプ = { 帯: null, 状態: '', 受信: 0 };
  ctx.PitSync = {
    link: (on, why) => { ランプ.帯 = on ? null : (why || '出た'); },
    set: (v) => { ランプ.状態 = v; },
    connected: () => { ランプ.状態 = 'idle'; },
    received: () => { ランプ.受信++; },
    saving: () => {}, saved: () => {}, failed: () => {}
  };
  ctx.pitCardEditingId = () => ctx.__editing || null;
  vm.createContext(ctx);
  vm.runInContext(JS('db-pit.js'), ctx, { filename: 'db-pit.js' });
  vm.runInContext(JS('overdue-pit.js'), ctx, { filename: 'overdue-pit.js' });
  return { ctx, D: ctx.PitDB, S: ctx.state, cloud, said, 記録, ランプ };
}

const 昨日 = (() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().slice(0, 10); })();
const 今日 = new Date().toISOString().slice(0, 10);

/* 8/27 の姿＝入庫も返車もまだ（＝古い画面が握っていた姿） */
const 古い姿 = { id: 'x1', resNo: 'P55192', customer: '竹村', status: 'reserved', reserveDate: 昨日,
                 log: [{ at: 1, label: '予約作成' }] };
/* 現場が進めた本当の姿（入庫・工程・返車・売上） */
const 本当の姿 = Object.assign({}, 古い姿, {
  status: 'returned', actualInAt: 昨日, returnDate: 昨日, completedAt: 昨日, amountFinal: 41000,
  log: [{ at: 1, label: '予約作成' }, { at: 2, label: '入庫（点検待ちへ）' },
        { at: 3, label: 'フェーズ移動 点検待ち → 作業完了' }, { at: 4, label: '返車完了（実績へ）' }]
});

/* =====================================================================
   ① 事故の再現：線が切れた端末で自動処理が走ると、他人の作業が消える
   ===================================================================== */
console.log('\n── 🚨 ①事故の再現（線が切れた端末＋自動処理） ──');
{
  const { D, S, cloud, ctx } = boot({ data: { pitCards: [JSON.parse(JSON.stringify(古い姿))] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ok('端末は読み終わっている', D._loaded === true);

  cloud.止める('pitCards');                                  /* 🔴 ここで線が切れた */
  cloud.よそが直す('pitCards', 'x1', 本当の姿);              /* 現場が 入庫→工程→返車 を進めた */

  ok('サーバーは「返車済み・売上あり」になっている', cloud.サーバーの('pitCards','x1').status === 'returned');
  ok('🔴 この端末には届いていない（古い写しのまま）', S.cards[0].status === 'reserved', S.cards[0]);

  ctx.pitAutoOverdue();                                      /* 開いている画面が描き直された、を想定 */
  await 保存を待つ();

  const 後 = cloud.サーバーの('pitCards', 'x1');
  ok('🔴🔴🔴 他人の作業を消していない（返車済みのまま）', 後.status === 'returned', 後);
  ok('🔴🔴 実入庫日を消していない', 後.actualInAt === 昨日, 後);
  ok('🔴🔴 売上を消していない', 後.amountFinal === 41000, 後);
  ok('🔴 カードの記録（フロー）を消していない', (後.log || []).length >= 4, (後.log || []).map(x => x.label));
  ok('🔴 未入庫の印を付けていない', !後.noShow, 後);
}

/* =====================================================================
   ② 本当に来なかった車は、今までどおり未入庫へ落ちる（直しすぎない）
   ===================================================================== */
console.log('\n── ②本当に来なかった車は、ちゃんと未入庫へ落ちる ──');
{
  const { D, S, cloud, ctx } = boot({ data: { pitCards: [JSON.parse(JSON.stringify(古い姿))] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ctx.pitAutoOverdue();
  await 保存を待つ();
  const 後 = cloud.サーバーの('pitCards', 'x1');
  ok('未入庫へ落ちる', 後.status === 'cancelled', 後);
  ok('自動で来なかった印が付く', 後.noShow === true, 後);
  ok('置き場を空ける', 後.bayId === null || 後.bayId === undefined, 後);
  ok('カードの記録に1行残る', (後.log || []).some(x => /未入庫へ（自動）/.test(x.label)), (後.log||[]).map(x=>x.label));
}

/* =====================================================================
   ③ つながっていない時は、自動処理は何もしない
   ===================================================================== */
console.log('\n── 🔴 ③つながっていない時は、何も動かさない ──');
{
  const { D, S, cloud, ctx } = boot({ data: { pitCards: [JSON.parse(JSON.stringify(古い姿))] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  cloud.通信を切る();
  ctx.pitAutoOverdue();
  await 保存を待つ();
  const 後 = cloud.サーバーの('pitCards', 'x1');
  ok('🔴 通信できない時は動かさない（予約のまま）', 後.status === 'reserved', 後);
  ok('🔴 書き込みも起こしていない', cloud.log.set.length === 0, cloud.log);
}

/* =====================================================================
   ④ 読み終わる前は、今までどおり何もしない
   ===================================================================== */
console.log('\n── ④読み終わる前は何もしない（今までどおり） ──');
{
  const { D, cloud, ctx } = boot({ data: { pitCards: [JSON.parse(JSON.stringify(古い姿))] } });
  ctx.pitAutoOverdue();                                        /* connectCloud を呼ぶ前 */
  await 保存を待つ();
  ok('札が立つ前は動かさない', cloud.log.set.length === 0, cloud.log);
}

/* =====================================================================
   ⑤ 線が切れたら、黙らずに気づく
   ===================================================================== */
console.log('\n── 🔴 ⑤線が切れたら気づく（黙らない） ──');
{
  const { D, cloud, ランプ } = boot({ data: { pitCards: [JSON.parse(JSON.stringify(古い姿))] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ok('つながっている状態から始まる', D._link === true && ランプ.帯 === null);

  cloud.線を切る('pitCards');                       /* 見張りが死んだ */
  await tick(); await tick();
  ok('🔴 つながっていないと分かる', D._link === false, { link: D._link });
  ok('🔴 画面に帯を出す（黙らない）', ランプ.帯 !== null, ランプ);
  ok('🔴 ランプもオフラインになる', ランプ.状態 === 'offline', ランプ);
}

/* =====================================================================
   ⑥ 切れたら張り直して、届いていなかった分を取り込む
   ===================================================================== */
console.log('\n── 🔴 ⑥張り直して、届いていなかった分を取り込む ──');
{
  const { D, S, cloud, ランプ } = boot({ data: { pitCards: [JSON.parse(JSON.stringify(古い姿))] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();

  cloud.線を切る('pitCards');
  cloud.よそが直す('pitCards', 'x1', 本当の姿);      /* 切れている間に現場が進めた */
  await tick(); await tick();
  ok('切れている間は古いまま', S.cards[0].status === 'reserved', S.cards[0]);

  cloud.サーバーに戻す();                            /* 線が復活 */
  await new Promise(r => setTimeout(r, 1400));       /* 張り直しの待ち（1回目＝1秒） */
  ok('🔴🔴 張り直して、本物が画面に入った', S.cards[0].status === 'returned', S.cards[0]);
  ok('🔴 実入庫日も入った', S.cards[0].actualInAt === 昨日, S.cards[0]);
  ok('🔴 売上も入った', S.cards[0].amountFinal === 41000, S.cards[0]);
  ok('🔴 つながったことが分かる', D._link === true, { link: D._link });
  ok('🔴 帯が消える', ランプ.帯 === null, ランプ);
  ok('この端末からは1文字も書いていない', cloud.log.set.length === 0, cloud.log.set);
}

/* =====================================================================
   ⑦ 読み直しで、手元の直しを消さない
   ===================================================================== */
console.log('\n── 🔴 ⑦読み直しの時、何を守って何を上書きするか ──');
{
  const { D, S, cloud, ctx } = boot({ data: { pitCards: [
    JSON.parse(JSON.stringify(古い姿)),
    { id: 'x2', resNo: 'A00001', customer: '別の人', status: 'reserved', reserveDate: 今日, log: [] }
  ] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();

  ctx.__editing = 'x1';                              /* いま x1 を「予約を編集」で開いている */
  S.cards.find(c => c.id === 'x2').memo = 'いま打っている途中';   /* まだ保存していない直し */

  cloud.線を切る('pitCards');
  cloud.よそが直す('pitCards', 'x1', 本当の姿);
  cloud.よそが直す('pitCards', 'x2', { customer: 'よそが変えた' });
  cloud.サーバーに戻す();
  await new Promise(r => setTimeout(r, 1400));

  ok('🔴 編集中のカードは差し替えない（打っている最中を守る）', S.cards.find(c => c.id === 'x1').status === 'reserved', S.cards.find(c => c.id === 'x1'));
  /* 🔴 それ以外は**サーバーが勝つ**（2026-08-29 に決めた）。
     「古い手元が勝つ」を1か所でも残すと、8/28 の事故と同じ形がそこから戻ってくる。 */
  ok('🔴 編集中でないものは、サーバーの姿になる', S.cards.find(c => c.id === 'x2').customer === 'よそが変えた', S.cards.find(c => c.id === 'x2'));
}

/* =====================================================================
   ⑧ 切れている間に消されたカードは、戻った時に手元からも消える
   ===================================================================== */
console.log('\n── ⑧切れている間に消えたカードは、戻ったら消える ──');
{
  const { D, S, cloud } = boot({ data: { pitCards: [
    JSON.parse(JSON.stringify(古い姿)),
    { id: 'x9', resNo: 'Z00009', customer: '消される人', status: 'reserved', reserveDate: 今日, log: [] }
  ] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ok('2件ある', S.cards.length === 2);

  cloud.線を切る('pitCards');
  cloud.data.pitCards = cloud.data.pitCards.filter(c => c.id !== 'x9');   /* よそが消した */
  cloud.サーバーに戻す();
  await new Promise(r => setTimeout(r, 1400));
  ok('消えたカードは手元からも消える', S.cards.length === 1 && !S.cards.some(c => c.id === 'x9'), S.cards.map(c => c.id));
}

/* =====================================================================
   ⑨ 受け取りの途中でつまずいても、保存が黙って止まらない
   ===================================================================== */
console.log('\n── 🔴 ⑨受け取りでつまずいても、保存が止まらない ──');
{
  const { D, S, cloud, ctx } = boot({ data: { pitCards: [JSON.parse(JSON.stringify(古い姿))] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  /* 受け取りの途中でわざと例外を出す（編集中の判定が壊れた、を模す） */
  ctx.pitCardEditingId = () => { throw new Error('わざと'); };
  try { cloud.よそが直す('pitCards', 'x1', { customer: 'よそ' }); } catch (e) {}
  await tick(); await tick();
  ok('🔴 つまずいても「反映中」の札が立ちっぱなしにならない', D._applying === false, { applying: D._applying });
  ctx.pitCardEditingId = () => null;
  S.cards[0].memo = 'あとから打った';
  D.save(true);
  await tick(); await tick(); await tick();
  ok('🔴 そのあとの保存がちゃんと届く', cloud.サーバーの('pitCards','x1').memo === 'あとから打った', cloud.サーバーの('pitCards','x1'));
}

/* =====================================================================
   ⑩ 一瞬「届いていない」になっただけでは、帯を出さない
   ---------------------------------------------------------------------
   🔴 開いた直後は必ず一瞬そうなる。毎回赤い帯が光ると、
      本当に切れた時に誰も見なくなる（オオカミ少年）。
   ===================================================================== */
console.log('\n── 🔴 ⑩一瞬なら帯を出さない（オオカミ少年にしない） ──');
{
  const { D, cloud, ランプ } = boot({ data: { pitCards: [JSON.parse(JSON.stringify(古い姿))] } });
  D._OFF_WAIT = 300;                                  /* 試験なので短くする */
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  cloud.写しから返す();                                /* 届いていない状態 */
  await new Promise(r => setTimeout(r, 120));
  ok('🔴 すぐには帯を出さない', ランプ.帯 === null, ランプ);
  cloud.サーバーに戻す();                              /* すぐ戻った */
  await new Promise(r => setTimeout(r, 400));
  ok('🔴 戻ったら、結局1度も帯を出さない', ランプ.帯 === null, ランプ);
  ok('つながっている', D._link === true);

  cloud.写しから返す();                                /* 今度は戻らない */
  await new Promise(r => setTimeout(r, 500));
  ok('🔴 続くようなら、ちゃんと帯を出す', ランプ.帯 !== null, ランプ);
}

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
process.exit(fail === 0 ? 0 : 1);
