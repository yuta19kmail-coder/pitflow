/* PitFlow ── 🔴🔴🔴 **版番号でサーバーが弾く**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた発案（2026-08-29）
     🗣「なんか上書きできない表面にはでないタイムスタンプとかそんなんとかでは防げないの？
     　　**絶対それを照合して新しい方が優先される**みたいな」

   ◎なぜ要るか
     8/28 の事故は「古い画面が、他人の作業をまるごと消した」。
     v2.24.0 で「気づく・張り直す・読み直す」を入れて**古い時間を短くした**が、
     🔴 **人が手で押した時の穴は塞がっていない。** 古い画面で1か所直せば、同じことが起きる。

   ◎唯一の「絶対」＝**サーバーが弾く**
     カードに**表に出ない版番号（rev）**を持たせ、書く時に
     「**自分が見た版の次の番号**」を必ず添える。サーバー（Firestore のルール）は
     `新しい版 == いまの版 + 1` でなければ**受け付けない**。
     🔴 **照合をアプリの中でやっても意味がない**（古い画面は自分が古いことを知らない）。
        だから**サーバー側**で弾く。ここが肝。

   ◎この見張りが守るもの
     🔴 ① 書き込みに版番号が入る（1つずつ増える）
     🔴 ② 版番号は**カードの中身に混ざらない**（混ぜると差分判定が狂って永久保存ループになる）
     🔴 ③ 古い版のまま書こうとしたら**弾かれる**
     🔴 ④ 弾かれたら**読み直す。勝手に書き直さない**（古い内容で押し切らない）
     🔴 ⑤ 弾かれたことを黙らない
     🔴 ⑥ まだ版番号を持っていないカードは、今までどおり書ける（移行中に止めない）
   ◎使い方
     node test_rev_guard.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const tick = (n = 3) => new Promise(r => setTimeout(r, n));
const 待つ = () => new Promise(r => setTimeout(r, 900));
const COLS = ['pitCards','pitCustomers','pitLoaners','pitLoanerAssigns','pitCompanyCars','pitFleetEvents','pitBoardNotes'];
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

/* =====================================================================
   見せかけのクラウド（**サーバーのルールも真似る**）
   ・pitCards は「版番号がいまの+1」でなければ受け付けない
   ・まだ版番号を持っていないカードは素通り（移行中）
   ===================================================================== */
function makeCloud(opt) {
  const data = {};
  COLS.forEach(c => { data[c] = ((opt.data && opt.data[c]) || []).map(o => JSON.parse(JSON.stringify(o))); });
  const settingsDoc = { settings: {}, bays: [], floorPlan: { shapes: [] }, aiVerdicts: {}, boardLabels: {}, inspectMarks: {}, inspectMutes: {} };
  const watchers = {}, errs = {};
  const log = { set: [], del: [], 弾いた: [] };
  let ルールを効かせる = opt.ルール !== false;

  const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.id; return c; };
  const docOf = (id, body) => ({ id, exists: body !== null && body !== undefined, data: () => body === null ? null : JSON.parse(JSON.stringify(body)), metadata: { fromCache: false } });
  const colSnap = (col) => { const arr = data[col].map(o => docOf(o.id, strip(o)));
    return { forEach: f => arr.forEach(f), docChanges: () => arr.map(doc => ({ type: 'added', doc })), size: arr.length, metadata: { fromCache: false } }; };
  const one = (col, id) => { const o = (data[col] || []).find(x => x.id === id); return docOf(id, o ? strip(o) : null); };

  const collection = (col) => ({
    get: () => Promise.resolve(colSnap(col)),
    onSnapshot: (cb, er) => { watchers[col] = cb; errs[col] = er; Promise.resolve().then(() => cb(colSnap(col))); return () => {}; },
    doc: (id) => ({
      __path: col + '/' + id,
      get: () => Promise.resolve(col === 'pitSettings' ? docOf(id, settingsDoc) : one(col, id)),
      onSnapshot: (a, b, c) => {
        const opt2 = (typeof a === 'object' && a !== null) ? a : null;
        const next = opt2 ? b : a;
        const 出す = () => { const d0 = col === 'pitSettings' ? docOf(id, settingsDoc) : one(col, id); d0.metadata = { fromCache: false }; next(d0); };
        if (!opt2) watchers[col + '/' + id] = next;
        Promise.resolve().then(出す);
        return () => {};
      }
    })
  });

  /* 🔴 ここがサーバーのルール。版番号が合わなければ受け付けない */
  function ルール判定(col, id, body) {
    if (!ルールを効かせる || col !== 'pitCards') return true;
    const いま = (data[col] || []).find(x => x.id === id);
    if (!いま) return true;                                  // 新しいカード＝素通り
    if (いま.rev === undefined || いま.rev === null) return true;   // まだ版番号が無い＝移行中は素通り
    return body && body.rev === いま.rev + 1;
  }

  const db = { batch: () => { const ops = []; return {
      set: (ref, body) => ops.push({ t: 'set', p: ref.__path, body }),
      delete: (ref) => ops.push({ t: 'del', p: ref.__path }),
      commit: () => {
        for (const o of ops) {
          const i = o.p.indexOf('/'), col = o.p.slice(0, i), id = o.p.slice(i + 1);
          if (o.t === 'set' && !ルール判定(col, id, o.body)) {
            log.弾いた.push(o.p + '（版 ' + (o.body && o.body.rev) + '）');
            const e = new Error('PERMISSION_DENIED: Missing or insufficient permissions.');
            e.code = 'permission-denied';
            return Promise.reject(e);                        // まとめ書きは1件でも弾かれたら全部落ちる
          }
        }
        ops.forEach(o => { const i = o.p.indexOf('/'), col = o.p.slice(0, i), id = o.p.slice(i + 1);
          if (o.t === 'del') { log.del.push(o.p); if (data[col]) data[col] = data[col].filter(x => x.id !== id); return; }
          log.set.push(o.p);
          if (data[col]) { const j = data[col].findIndex(x => x.id === id); const n = Object.assign({ id }, o.body); if (j >= 0) data[col][j] = n; else data[col].push(n); }
        });
        return Promise.resolve();
      } }; } };

  return {
    fb: { ready: true, currentUser: { uid: 'u1' }, db, company: () => ({ collection }), serverTimestamp: () => 0 },
    log, data,
    よそが直す: (col, id, patch) => { const o = (data[col] || []).find(x => x.id === id); if (!o) return false;
      Object.assign(o, patch); if (o.rev !== undefined) o.rev = (o.rev || 0) + 1;
      const cb = watchers[col]; if (cb) cb({ docChanges: () => [{ type: 'modified', doc: docOf(id, strip(o)) }], forEach: () => {} });
      return true; },
    よそが黙って直す: (col, id, patch) => { const o = (data[col] || []).find(x => x.id === id); if (!o) return false;
      Object.assign(o, patch); if (o.rev !== undefined) o.rev = (o.rev || 0) + 1; return true; },   /* 届かない＝古い画面になる */
    サーバーの: (col, id) => { const o = (data[col] || []).find(x => x.id === id); return o ? JSON.parse(JSON.stringify(o)) : null; }
  };
}

function boot(opt) {
  const cloud = makeCloud(opt || {});
  const 言 = [];
  const ctx = {};
  ctx.window = ctx;
  ctx.console = { log: m => 言.push(String(m)), warn: m => 言.push('警告:' + m), error: m => 言.push('エラー:' + m) };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.Promise = Promise; ctx.JSON = JSON; ctx.Date = Date; ctx.Math = Math;
  ctx.document = { addEventListener() {}, querySelector: () => ({ content: '0.0.0' }), hidden: false, getElementById: () => null, createElement: () => ({ style:{}, remove(){}, setAttribute(){} }) };
  ctx.addEventListener = () => {};
  ctx.localStorage = { length: 0, getItem: () => null, setItem() {}, removeItem() {}, key: () => null };
  ctx.PIT_CLOUD = true; ctx.PIT_WORK_TYPES = [];
  ctx.state = { settings: {}, bays: [], floorPlan: { shapes: [] }, aiVerdicts: {}, boardLabels: {}, inspectMarks: {}, inspectMutes: {},
                cards: [], customers: [], loaners: [], loanerAssigns: [], companyCars: [], fleetEvents: [], boardNotes: [], staff: [] };
  ctx.fb = cloud.fb;
  const ランプ = { 帯: null, 状態: '', 知らせ: [] };
  ctx.PitSync = { link: (on, why) => { ランプ.帯 = on ? null : (why || '出た'); }, set: v => { ランプ.状態 = v; },
                  connected: () => { ランプ.状態 = 'idle'; }, received: () => {}, saving: () => {}, saved: () => {}, failed: () => {} };
  ctx.showToast = (m, code) => ランプ.知らせ.push((code||'') + ' ' + m);
  ctx.pitCardEditingId = () => null;
  vm.createContext(ctx);
  vm.runInContext(JS('db-pit.js'), ctx, { filename: 'db-pit.js' });
  return { ctx, D: ctx.PitDB, S: ctx.state, cloud, 言, ランプ };
}

const カード = (id, rev) => { const o = { id, resNo: 'A' + id, customer: 'テスト', status: 'reserved' }; if (rev !== undefined) o.rev = rev; return o; };

/* =====================================================================
   ① 書き込みに版番号が入る／中身には混ざらない
   ===================================================================== */
console.log('\n── 🔴 ①版番号を添えて書く／中身には混ぜない ──');
{
  const { D, S, cloud } = boot({ data: { pitCards: [カード('c1', 3)] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ok('読み込めている', S.cards.length === 1);
  ok('🔴🔴 版番号は画面のカードに混ざっていない', S.cards[0].rev === undefined, S.cards[0]);
  ok('でも覚えてはいる（3）', D._revOf && D._revOf('cards', 'c1') === 3, { rev: D._revOf && D._revOf('cards','c1') });

  S.cards[0].memo = 'ひとこと';
  D.save(true); await 待つ();
  const 後 = cloud.サーバーの('pitCards', 'c1');
  ok('🔴 サーバーの版が1つ進んだ（3→4）', 後.rev === 4, 後);
  ok('書いた中身も入っている', 後.memo === 'ひとこと', 後);
  ok('弾かれていない', cloud.log.弾いた.length === 0, cloud.log.弾いた);

  /* 続けてもう1回 */
  S.cards[0].memo = 'ふたこと';
  D.save(true); await 待つ();
  ok('🔴 続けて書いても1つずつ増える（4→5）', cloud.サーバーの('pitCards','c1').rev === 5, cloud.サーバーの('pitCards','c1'));
}

/* =====================================================================
   ② 版番号が増えても、無駄な保存を起こさない（差分判定を汚さない）
   ===================================================================== */
console.log('\n── 🔴 ②版番号のせいで書き続けない ──');
{
  const { D, S, cloud } = boot({ data: { pitCards: [カード('c1', 1)] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  S.cards[0].memo = 'あ'; D.save(true); await 待つ();
  const 回数 = cloud.log.set.length;
  D.save(true); await 待つ();
  D.save(true); await 待つ();
  ok('🔴 中身が変わっていなければ、もう書かない', cloud.log.set.length === 回数, { 前: 回数, 後: cloud.log.set.length });
}

/* =====================================================================
   ③ 古い画面の書き込みは、サーバーが弾く（本丸）
   ===================================================================== */
console.log('\n── 🔴🔴🔴 ③古い画面の書き込みを、サーバーが弾く ──');
{
  const { D, S, cloud, ランプ } = boot({ data: { pitCards: [カード('c1', 1)] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  /* よその端末が直したが、この画面には届いていない（＝8/28 の形） */
  cloud.よそが黙って直す('pitCards', 'c1', { status: 'returned', amountFinal: 41000 });
  ok('サーバーは進んでいる（版2・返車済み）', cloud.サーバーの('pitCards','c1').rev === 2);
  ok('🔴 この画面は古いまま', S.cards[0].status === 'reserved');

  S.cards[0].status = 'cancelled';           /* 古い画面が「未入庫」に落とそうとする */
  const 前 = JSON.stringify(cloud.サーバーの('pitCards','c1'));
  D.save(true); await 待つ(); await 待つ();

  ok('🔴🔴🔴 サーバーが弾いた', cloud.log.弾いた.length > 0, cloud.log.弾いた);
  const 後 = cloud.サーバーの('pitCards','c1');
  ok('🔴🔴 他人の作業が消えていない（返車済みのまま）', 後.status === 'returned', 後);
  ok('🔴🔴 売上も消えていない', 後.amountFinal === 41000, 後);
  ok('🔴 弾かれたことを黙らない', ランプ.知らせ.length > 0 || ランプ.帯 !== null, ランプ);
  ok('🔴 弾かれたあと、画面が本物に直る（読み直した）', S.cards[0].status === 'returned', S.cards[0]);
  ok('🔴 古い内容で押し切らない（書き直さない）', 後.status !== 'cancelled', 後);
}

/* =====================================================================
   ④ まだ版番号を持っていないカードは、今までどおり書ける（移行中に止めない）
   ===================================================================== */
console.log('\n── ④版番号がまだ無いカードは、今までどおり書ける ──');
{
  const { D, S, cloud } = boot({ data: { pitCards: [カード('c9')] } });   /* rev なし */
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  S.cards[0].memo = 'はじめて'; D.save(true); await 待つ();
  const 後 = cloud.サーバーの('pitCards','c9');
  ok('書ける', 後.memo === 'はじめて', 後);
  ok('🔴 この時に版番号が付く（1）', 後.rev === 1, 後);
  ok('弾かれていない', cloud.log.弾いた.length === 0, cloud.log.弾いた);
}

/* =====================================================================
   ⑤ ふつうに他の端末の変更を受け取っている時は、何も邪魔しない
   ===================================================================== */
console.log('\n── ⑤ふつうの共同作業を邪魔しない ──');
{
  const { D, S, cloud } = boot({ data: { pitCards: [カード('c1', 1)] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  cloud.よそが直す('pitCards', 'c1', { customer: 'よそが直した' });   /* ちゃんと届く */
  await tick(); await tick();
  ok('よその直しが画面に入る', S.cards[0].customer === 'よそが直した', S.cards[0]);
  ok('新しい版も覚えている（2）', D._revOf('cards','c1') === 2, { rev: D._revOf('cards','c1') });
  S.cards[0].memo = 'こちらも直す'; D.save(true); await 待つ();
  ok('🔴 そのあと自分の直しがちゃんと通る', cloud.サーバーの('pitCards','c1').memo === 'こちらも直す', cloud.サーバーの('pitCards','c1'));
  ok('弾かれていない', cloud.log.弾いた.length === 0, cloud.log.弾いた);
}

/* =====================================================================
   ⑥ コードの形
   ===================================================================== */
console.log('\n── 🔴 ⑥コードの形 ──');
{
  const 素 = JS('db-pit.js').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok('版番号を控える入れ物がある', /_rev\b/.test(素));
  ok('🔴 書く時に版番号を添えている', /rev\s*[:=]/.test(素));
  ok('🔴 受け取った版番号を中身から外している', /delete\s+\w+\.rev|delete\s+o\.rev/.test(素));
  ok('🔴 弾かれた時の道がある（permission-denied）', /permission-denied|弾/.test(素));
}

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
process.exit(fail === 0 ? 0 : 1);
