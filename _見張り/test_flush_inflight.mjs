// ============================================================
// test_flush_inflight.mjs ― 保存が立て続けに2回走っても、自分で自分を弾かない（PF-0012 の空振り）
//   PitFlow v2.115.0 ／ ゆうた報告 2026-09-14
//
//   🗣「予約詳細を保存するときに 他の人が開いています みたいなものと 保存しました が同時にでて保存されている」
//   🗣「100％ではないが他の人は開いていない」
//
//   ◎正体
//     「保存する」で保存が立て続けに2回走る。1回目がサーバーに届く前に2回目が同じカードを送ると、
//     同じ版の番号（rev）を付けてしまい、サーバー（版は いま+1 でないと受け付けない）に弾かれて
//     PF-0012「ほかの端末が先に直していた…」が出ていた。中身は1回目で入っている。
//
//   ここで固めている決めごと
//     🔴🔴 ① 送っている最中のカードをもう一度保存しても、弾かれない（PF-0012 が出ない）
//     🔴🔴 ② 後から直した中身も、1回目が届いたあとに必ずサーバーに届く（消えない）
//     🔴  ③ 版の番号は1つずつ進む（関門を緩めていない＝本当に古い版は今までどおり弾かれる）
//     🔴  ④ 何も変わっていなければ、余計な保存を送らない
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_flush_inflight.mjs
//     （直す前の版で試す時：DBPIT=<db-pit.js の場所> node _見張り/test_flush_inflight.mjs）
// ============================================================
import fs from 'fs';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); }
};
const SRC = process.env.DBPIT ? fs.readFileSync(process.env.DBPIT, 'utf8')
                              : fs.readFileSync(new URL('../js/db-pit.js', import.meta.url), 'utf8');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* 偽のサーバー：版は「いま+1」でないと受け付けない（本物のルールと同じ関門）。まとめ書きは全部か無しか。 */
function makeWorld(){
  const server = {};          /* path → { rev, body } */
  const toasts = [];
  const box = { console: { log(){}, warn(){}, error(){} }, setTimeout, clearTimeout, JSON, Date, Promise, Object, Array, String, Number };
  box.window = box; box.globalThis = box;
  box.state = { cards: [], customers: [], loaners: [], loanerAssigns: [], companyCars: [], fleetEvents: [], settings: {}, bays: [], floorPlan: { shapes: [] } };
  box.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
  box.addEventListener = () => {};
  box.document = { addEventListener(){}, hidden: false };
  box.showToast = (msg, code) => toasts.push(code || msg);
  box.pitAlert = () => {};
  const ref = (col, id) => ({ path: col + '/' + id });
  box.fb = {
    company: () => ({ collection: (col) => ({ doc: (id) => ref(col, id) }) }),
    db: {
      batch(){
        const ops = [];
        return {
          set(r, body){ ops.push({ t: 'set', r, body }); },
          delete(r){ ops.push({ t: 'del', r }); },
          commit(){
            return wait(40).then(() => {
              for (const op of ops) {
                if (op.t !== 'set' || op.r.path.indexOf('pitSettings') === 0) continue;
                const cur = (server[op.r.path] || { rev: 0 }).rev;
                if (op.body.rev !== cur + 1) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
              }
              for (const op of ops) {
                if (op.t === 'del') delete server[op.r.path];
                else server[op.r.path] = { rev: op.body.rev, body: op.body };
              }
            });
          }
        };
      }
    }
  };
  vm.createContext(box);
  vm.runInContext(SRC, box);
  const DB = box.PitDB;
  /* 本番の「読み終わった」状態にする */
  DB.mode = 'cloud'; DB._loaded = true; DB._pending = {}; DB._rev = {};
  DB._shadow = { docs: {}, settings: DB._js(DB._settingsPayload()) };
  DB._resync = () => Promise.resolve(0);        /* 弾かれた時の読み直しは、ここでは数えるだけ */
  let commits = 0;
  const origBatch = box.fb.db.batch;
  box.fb.db.batch = function(){ const b = origBatch(); const c = b.commit; b.commit = function(){ commits++; return c.call(b); }; return b; };
  return { box, DB, server, toasts, commits: () => commits };
}

console.log('── ① 送っている最中にもう一度保存しても弾かれない ──');
{
  const W = makeWorld();
  W.box.state.cards.push({ id: 'c1', customer: '山田 太郎', memo: '1回目' });
  W.DB.save(true);                                   /* 1回目（編集の見張りを外した時） */
  W.box.state.cards[0].memo = '2回目';               /* 顧客控えの反映などで中身がもう少し変わる */
  W.DB.save(true);                                   /* 2回目（1回目が届く前） */
  await wait(900);
  ok('🔴🔴 PF-0012 が出ない', W.toasts.indexOf('PF-0012') < 0, W.toasts);
  ok('🔴🔴 後から直した中身がサーバーに届いている', W.server['pitCards/c1'] && W.server['pitCards/c1'].body.memo === '2回目', W.server['pitCards/c1']);
  ok('🔴 版の番号は 1 → 2 と1つずつ進んだ', W.server['pitCards/c1'] && W.server['pitCards/c1'].rev === 2, W.server['pitCards/c1']);
  ok('送っている最中の印が残っていない', Object.keys(W.DB._pending).length === 0, W.DB._pending);
}

console.log('\n── ② 中身が同じなら余計に送らない ──');
{
  const W = makeWorld();
  W.box.state.cards.push({ id: 'c2', customer: '山田 太郎' });
  W.DB.save(true);
  W.DB.save(true);                                   /* 変わっていない2回目 */
  await wait(900);
  ok('PF-0012 が出ない', W.toasts.indexOf('PF-0012') < 0, W.toasts);
  ok('🔴 送ったのは1回だけ', W.commits() === 1, W.commits());
  ok('版は 1', W.server['pitCards/c2'] && W.server['pitCards/c2'].rev === 1, W.server['pitCards/c2']);
}

console.log('\n── ③ 関門は緩めていない（本当に古い画面は弾かれる） ──');
{
  const W = makeWorld();
  W.server['pitCards/c3'] = { rev: 5, body: { customer: 'ほかの端末の中身' } };   /* ほかの端末が先に進めた */
  W.DB._rev['pitCards/c3'] = 3;                                                  /* この画面は古い版を見ている */
  W.box.state.cards.push({ id: 'c3', customer: '古い中身' });
  W.DB.save(true);
  await wait(300);
  ok('🔴 古い版の書き込みは今までどおり弾かれて PF-0012', W.toasts.indexOf('PF-0012') >= 0, W.toasts);
  ok('🔴 サーバーの中身は、ほかの端末のまま', W.server['pitCards/c3'].body.customer === 'ほかの端末の中身', W.server['pitCards/c3']);
}

console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' 件OK／' + fail + ' 件NG');
process.exit(fail ? 1 : 0);
