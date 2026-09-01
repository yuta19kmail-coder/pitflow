/* PitFlow ── 🔴🔴 **読み込みの札（保存の関門）の見張り**（ブラウザは使わない）
   ===================================================================
   ◎なぜ作ったか（2026-08-28・ゆうた了承）
     開くたびに7つの箱を**丸ごと2回**読んでいる（読んでから、見張りがもう一度全部配る）。
     ここを「見張りの初回配信だけ」に減らすと、開くたびの読み取りが半分になる。
     ただし **読み込みの順番が変わる＝保存の関門（`_loaded`）の作りが変わる。**

     🔴 いまは「7つ全部を読み切ってから札を立てる」ので、
        札が立つ瞬間が1つしかない。減らすと **箱がバラバラに届く**ようになり、
        「全部届いた」を自分で数えないといけなくなる。**そこが事故る。**

   ◎この見張りが止めたい事故（2つだけ）
     🔴 ① **札を早く立てすぎる** … まだ届いていない箱を「空っぽ」と思い込んだまま
          誰かが保存を押すと、空っぽを正としてクラウドへ書きに行く＝**予約が消える**。
          （本番化直後の v1.2.1 で実際に踏んだ。その時の直しがこの札）
     🔴 ② **札が立たない** … 保存が黙って全部見送られる＝**打ったのに残らない**。
          しかもエラーは出ない（`console.warn` だけ）。

   ◎やり方
     本物のクラウドには繋がない。**見せかけのクラウド**を作って、
     どの箱を「まだ届かせないか」を手で決められるようにしてある（`hold` / `release`）。
     ＝「7つのうち1つだけ遅れて届く」を**狙って起こせる**。ブラウザでは起こせない。

   ◎🔴 次に db-pit.js を触る人へ
     読む所を減らしても、**下の 🔴 印の項目が全部緑のままなら安全**。
     赤くなったら、それは「消える」か「残らない」のどちらかが起きている。

   ◎使い方（サーバもブラウザも要らない）
     node test_load_gate.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const tick = () => new Promise(r => setTimeout(r, 0));
const COLS = ['pitCards','pitCustomers','pitLoaners','pitLoanerAssigns','pitCompanyCars','pitFleetEvents','pitBoardNotes'];
const SRC = fs.readFileSync(path.join(process.cwd(), 'js', 'db-pit.js'), 'utf8');

/* =====================================================================
   見せかけのクラウド
   ---------------------------------------------------------------------
   ・hold に入れた箱は、release するまで **届かない**（.get() も 見張りの初回配信も）
   ・書き込みは log に残す。中身も持ち帰る（何を書いたかまで見る）
   ===================================================================== */
function makeCloud(opt) {
  const data = {};                       // 箱の名前 → [{id, ...}]
  COLS.forEach(c => { data[c] = (opt.data && opt.data[c] ? opt.data[c] : []).map(o => JSON.parse(JSON.stringify(o))); });
  const settingsDoc = (opt.settings === undefined)
    ? { settings: {}, bays: [], floorPlan: { shapes: [] }, aiVerdicts: {}, boardLabels: {}, inspectMarks: {}, inspectMutes: {} }
    : opt.settings;                      // null なら「まだ1度も保存されていない」

  const held = new Set(opt.hold || []);
  const waiting = [];                    // {箱, 実行}
  const watchers = {};                   // 箱 → 受け取り口
  const log = { set: [], del: [], commits: 0 };

  const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.id; return c; };
  const docOf = (id, body) => ({ id, exists: body !== null && body !== undefined, data: () => body === null ? null : JSON.parse(JSON.stringify(body)) });
  const colSnap = (col) => {
    const arr = data[col].map(o => docOf(o.id, strip(o)));
    return { forEach: f => arr.forEach(f), docChanges: () => arr.map(doc => ({ type: 'added', doc })), size: arr.length };
  };
  const gate = (name, fn) => { if (held.has(name)) waiting.push({ name, fn }); else Promise.resolve().then(fn); };
  const gated = (name, make) => new Promise(res => gate(name, () => res(make())));

  const collection = (col) => ({
    get: () => gated(col, () => colSnap(col)),
    onSnapshot: (cb) => { watchers[col] = cb; gate(col, () => cb(colSnap(col))); return () => { delete watchers[col]; }; },
    doc: (id) => ({
      __path: col + '/' + id,
      get: () => gated(col, () => docOf(id, col === 'pitSettings' ? settingsDoc : null)),
      /* ⚠ v2.24.0 から、つながり監視が (options, next, err) の形でも呼ぶ。両方受ける。 */
      onSnapshot: (a, b, c) => {
        const opt = (typeof a === 'object' && a !== null) ? a : null;
        const next = opt ? b : a;
        const 出す = () => { const d0 = docOf(id, col === 'pitSettings' ? settingsDoc : null);
                             d0.metadata = { fromCache: false }; next(d0); };
        if (!opt) watchers[col + '/' + id] = next;
        gate(col, 出す);
        return () => {};
      }
    })
  });

  const db = {
    batch: () => {
      const ops = [];
      return {
        set: (ref, body) => ops.push({ t: 'set', p: ref.__path, body }),
        delete: (ref) => ops.push({ t: 'del', p: ref.__path }),
        commit: () => {
          ops.forEach(o => {
            const [col, id] = [o.p.slice(0, o.p.indexOf('/')), o.p.slice(o.p.indexOf('/') + 1)];
            if (o.t === 'del') { log.del.push(o.p); if (data[col]) data[col] = data[col].filter(x => x.id !== id); return; }
            log.set.push(o.p);
            if (data[col]) { const i = data[col].findIndex(x => x.id === id); const n = Object.assign({ id }, o.body); if (i >= 0) data[col][i] = n; else data[col].push(n); }
          });
          log.commits++;
          return Promise.resolve();
        }
      };
    }
  };

  return {
    fb: { ready: true, db, company: () => ({ collection }) },
    log, data, watchers,
    release: (name) => { const rest = []; waiting.forEach(w => { if (w.name === name) Promise.resolve().then(w.fn); else rest.push(w); }); waiting.length = 0; rest.forEach(w => waiting.push(w)); held.delete(name); },
    releaseAll: () => { const all = waiting.slice(); waiting.length = 0; held.clear(); all.forEach(w => Promise.resolve().then(w.fn)); },
    /* あとから他の端末が直した、を届ける */
    deliver: (col, changes) => {
      const cb = watchers[col]; if (!cb) return false;
      cb({ docChanges: () => changes.map(c => ({ type: c.type || 'modified', doc: docOf(c.id, c.body === undefined ? null : c.body) })), forEach: () => {} });
      return true;
    }
  };
}

/* =====================================================================
   db-pit.js を node の中で起こす（画面は無い）
   ===================================================================== */
function boot(opt) {
  const cloud = makeCloud(opt || {});
  const said = [];
  const ctx = {};
  ctx.window = ctx;
  ctx.console = { log: m => said.push(String(m)), warn: m => said.push('警告:' + m), error: m => said.push('エラー:' + m) };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.Promise = Promise; ctx.JSON = JSON; ctx.Date = Date; ctx.Math = Math;
  ctx.document = { addEventListener() {}, querySelector: () => ({ content: '0.0.0' }), hidden: false };
  ctx.addEventListener = () => {};
  ctx.localStorage = { length: 0, getItem: () => null, setItem() {}, removeItem() {}, key: () => null };
  ctx.PIT_CLOUD = true;                 // 本番モードで起こす
  ctx.PIT_WORK_TYPES = [];              // 作業タイプの揃え直しは今回の話ではないので黙らせる
  ctx.state = { settings: {}, bays: [], floorPlan: { shapes: [] }, aiVerdicts: {}, boardLabels: {}, inspectMarks: {}, inspectMutes: {},
                cards: [], customers: [], loaners: [], loanerAssigns: [], companyCars: [], fleetEvents: [], boardNotes: [], staff: [] };
  ctx.fb = cloud.fb;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'db-pit.js' });
  return { ctx, D: ctx.PitDB, S: ctx.state, cloud, said };
}
const 書いた数 = c => c.log.set.length + c.log.del.length;

/* =====================================================================
   ① 読み終わるまでは、何があっても書かない
   ===================================================================== */
console.log('\n── 🔴 ①読み終わるまでは、1件も書かない ──');
{
  const { D, S, cloud } = boot({ data: { pitCards: [{ id: 'c1', name: '本物' }] } });
  /* 画面に前の残り（見本など）が乗っている状態を作る＝これが上がったら事故 */
  S.cards = [{ id: 'ゴミ1', name: '前の画面の残り' }];
  S.customers = [{ id: 'ゴミ2', name: '前の画面の残り' }];
  D.connectCloud({}, {});                       // まだ1つも届いていない
  ok('読み込みを始めた時点で札は下りている', D._loaded === false);
  ok('🔴 読み込み中は保存が通らない（見送る）', D.save(true) === false);
  await tick();
  ok('🔴 読み込み中はクラウドへ1件も書いていない', 書いた数(cloud) === 0, cloud.log);
}
{
  /* 7つのうち **1つだけ** 遅れて届く。残り6つは届いている。 */
  const { D, S, cloud } = boot({ data: { pitCards: [{ id: 'c1', name: '本物' }] }, hold: ['pitFleetEvents'] });
  S.cards = [{ id: 'ゴミ1', name: '前の画面の残り' }];
  D.connectCloud({}, {});
  await tick(); await tick(); await tick();
  ok('🔴 1つだけ遅れている間は札が立たない', D._loaded === false);
  ok('🔴 1つだけ遅れている間は保存が通らない', D.save(true) === false);
  await tick();
  ok('🔴 1つだけ遅れている間は1件も書いていない', 書いた数(cloud) === 0, cloud.log);
  cloud.release('pitFleetEvents');
  await tick(); await tick(); await tick();
  ok('🔴 遅れていた箱が届いたら札が立つ', D._loaded === true);
}

/* =====================================================================
   ② 読み終わったら、必ず書けるようになる（黙って止まらない）
   ===================================================================== */
console.log('\n── 🔴 ②読み終わったら、必ず書ける ──');
{
  const { D } = boot({ data: { pitCards: [{ id: 'c1' }] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ok('🔴 ふつうに読み終われば札が立つ', D._loaded === true);
}
{
  const { D } = boot({});                        // 7つとも空っぽ
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ok('🔴 箱が全部空っぽでも札は立つ', D._loaded === true);
}
{
  const { D } = boot({ data: { pitCards: [{ id: 'c1' }] }, settings: null });   // 設定がまだ1度も無い
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ok('🔴 設定がまだ1度も無くても札は立つ', D._loaded === true);
}

/* =====================================================================
   ③ 読み込んだだけでは、クラウドを1文字も変えない
   ---------------------------------------------------------------------
   🔴 開いた人が何もしていないのに書き込みが起きる作りだと、
      台数ぶんの読み取りを呼んで**さらに重くなる**（見張りが全端末に配るため）
   ===================================================================== */
console.log('\n── 🔴 ③開いただけでは、クラウドを変えない ──');
{
  const { D, S, cloud } = boot({ data: {
    pitCards:     [{ id: 'c1', name: 'カード1' }, { id: 'c2', name: 'カード2' }],
    pitCustomers: [{ id: 'k1', name: 'お客様1' }],
    pitLoaners:   [{ id: 'd1', no: '1' }]
  } });
  S.cards = [{ id: 'ゴミ1', name: '前の画面の残り' }];            // 読み込み前に乗っていた残り
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  ok('🔴 読み込みで、前の画面の残りが消えている', S.cards.every(c => c.id !== 'ゴミ1'), S.cards);
  ok('読み込んだ中身が入っている（カード2件）', S.cards.length === 2, S.cards.length);
  ok('読み込んだ中身が入っている（顧客1件）', S.customers.length === 1);
  ok('読み込んだ中身が入っている（代車1件）', S.loaners.length === 1);
  D.save(true); await tick(); await tick();
  ok('🔴 開いただけなら、書き込みは0件', 書いた数(cloud) === 0, cloud.log);
  ok('🔴 前の画面の残りがクラウドへ上がっていない', !cloud.log.set.some(p => p.indexOf('ゴミ') >= 0), cloud.log.set);
}

/* =====================================================================
   ④ 読み終わったあとは、ふつうに足せる・消せる（余計な所は触らない）
   ===================================================================== */
console.log('\n── ④読み終わったあとは、ふつうに足せる・消せる ──');
{
  const { D, S, cloud } = boot({ data: {
    pitCards:     [{ id: 'c1', name: 'カード1' }],
    pitCustomers: [{ id: 'k1', name: 'お客様1' }]
  } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();

  S.cards.push({ id: 'c9', name: '新しい予約' });
  D.save(true); await tick(); await tick();
  ok('足した1件だけが上がる', cloud.log.set.length === 1 && cloud.log.set[0] === 'pitCards/c9', cloud.log.set);
  ok('🔴 他の箱には1件も触らない', cloud.log.set.filter(p => p.indexOf('pitCards/') !== 0).length === 0, cloud.log.set);
  ok('消しには行っていない', cloud.log.del.length === 0, cloud.log.del);

  cloud.log.set.length = 0;
  S.cards = S.cards.filter(c => c.id !== 'c1');
  D.save(true); await tick(); await tick();
  ok('消した1件だけが消える', cloud.log.del.length === 1 && cloud.log.del[0] === 'pitCards/c1', cloud.log.del);
  ok('🔴 顧客は巻き添えで消えない', !cloud.log.del.some(p => p.indexOf('pitCustomers/') === 0), cloud.log.del);
}

/* =====================================================================
   ⑤ 他の端末が直した分を受け取っても、こちらから書き返さない
   ---------------------------------------------------------------------
   🔴 ここが崩れると、2台で開いているだけで**書き込みと読み取りが往復し続ける**
      （2026-08-25 に本番が止まったのがこれ。作業タイプ版）
   ===================================================================== */
console.log('\n── 🔴 ⑤受け取っても、書き返さない ──');
{
  const { D, S, cloud } = boot({ data: { pitCards: [{ id: 'c1', name: 'カード1' }] } });
  D.connectCloud({}, {}); await tick(); await tick(); await tick();
  cloud.log.set.length = 0; cloud.log.del.length = 0;

  const 届いた = cloud.deliver('pitCards', [{ type: 'modified', id: 'c1', body: { name: 'よその端末が直した' } }]);
  ok('見張りが張れている（届く）', 届いた === true);
  ok('よその端末の直しが画面に入る', (S.cards.find(c => c.id === 'c1') || {}).name === 'よその端末が直した', S.cards);
  D.save(true); await tick(); await tick();
  ok('🔴 受け取った内容を、そのまま書き返さない', 書いた数(cloud) === 0, cloud.log);

  /* よその端末が1件消した → こちらの画面からも消える／消し返さない */
  cloud.deliver('pitCards', [{ type: 'removed', id: 'c1' }]);
  ok('よその端末が消した分は画面からも消える', S.cards.length === 0, S.cards);
  D.save(true); await tick(); await tick();
  ok('🔴 消えた分を書き戻さない', 書いた数(cloud) === 0, cloud.log);
}

/* =====================================================================
   ⑥ コードの形（次に触る人が壊しやすい所を、機械が見張る）
   ===================================================================== */
console.log('\n── 🔴 ⑥コードの形 ──');
{
  const 素 = SRC.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok('札は false で始まる', /_loaded:\s*false/.test(素));
  ok('🔴 保存の入口に札の関門がある', /if\s*\(!this\._loaded\)/.test(素));
  /* 🔴 いちばん大事な1本。
     読む所を減らすと「全部届いた」を自分で数えることになるが、**札を立てる場所は1か所のまま**にすること。
     2か所に増えた瞬間、片方だけ先に立つ道ができる＝空っぽを正として書く事故が戻ってくる。 */
  const 立てる = (素.match(/_loaded\s*=\s*true/g) || []).length;
  ok('🔴🔴 札を立てる場所は1か所だけ', 立てる === 1, '見つかった数=' + 立てる);
  ok('札を下ろす場所は読み込み開始と切断の2か所', (素.match(/_loaded\s*=\s*false/g) || []).length === 2);

  /* 読む箱と見張る箱は、同じ一覧から作ること（片方だけ増やす事故を止める） */
  /* 🔴 棚卸し方式。箱の名前は一覧（_COLS）1か所だけに書く。
     例外は pitCards だけ＝「いま予約を編集している入庫カードは差し替えない」関門で名指しが要る。
       ・受け取り（_watch）… v1.56.1（打った内容が消える事故を止めている）
       ・読み直し（_resync）… v2.24.0（同じ関門。2つの道で答えを変えないため）
     ＝ **2回まで**許す。どちらも消さないこと。
     ⚠ 数が増えたらここが赤くなる。増やすのではなく、一覧をなぞる形に直すこと。 */
  const 直書き = COLS.map(c => [c, (素.split("'" + c + "'").length - 1) - 1]).filter(([c, n]) => n > (c === 'pitCards' ? 2 : 0));
  ok('🔴 箱の名前を一覧の外で直書きしていない（pitCards の関門1つだけ許す）', 直書き.length === 0, 直書き);
  ok('箱は7つ', COLS.every(c => 素.indexOf("'" + c + "'") > 0));

  const i = 素.indexOf('_watch: function');
  const 見張り部 = i < 0 ? '' : 素.slice(i, i + 2600);
  ok('見張りは一覧をなぞって張っている', /Object\.keys\(this\._COLS\)|Object\.keys\(self\._COLS\)/.test(見張り部));
  const j = 素.indexOf('connectCloud: function');
  /* ⚠ v2.24.0 で connectCloud が長くなった（try/finally を入れた）ので、見る幅を広げた。 */
  const 読み部 = j < 0 ? '' : 素.slice(j, j + 3600);
  ok('読み込みも一覧をなぞっている', /Object\.keys\(this\._COLS\)|Object\.keys\(self\._COLS\)/.test(読み部));
  ok('🔴 読み込みの締めで見張りを張っている', /_watch\(\)/.test(読み部));
}

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
process.exit(fail === 0 ? 0 : 1);
