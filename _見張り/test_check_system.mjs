/* PitFlow ── 🧱 **チェック体制の裏側3つ**の見張り（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-09-13・8月の総点検のあと「仕組みとしての評価」を受けて）
     🗣「印の保存を1件ずつにする／書き込み済みかどうかを車のデータから数えて出す／
     　　日常のデータチェックに規則を足す　ここまでやっちゃおう」

   ◎ここで見張ること
     🔴🔴 ① 印（伝票を直した・確認した・直した記録）は1件ずつ書く
            ・2台の端末が同時に押しても、**どちらの印も消えない**
            ・外した印は、前の一覧（qmarks）に残っていても**よみがえらない**
            ・まだ新しくなっていない端末が前の一覧を**書類ごと書いても、新しい印は消えない**
            ・**上限なし**（900件入れて900件読める）
     🔴🔴 ② 伝票の書き込みは**お客様の車のデータから数える**（書けた／対象／書く先なし／まだ）
            ・まだの分があれば、残した結果なら「PDFを入れ直すと書けます」と言う
            ・Qの箱にも「伝票の書き込み ◯/◯」を出す
     🔴🔴 ③ 日常チェックに2本：D10 金額が文字／T10 返車済みなのに入庫日が返車日より後

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_check_system.mjs
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
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---- 偽の Firestore（pitSettings の書類だけ。set の merge は地図を奥までまぜる） ---- */
const store = {};
function merge(a, b){
  const out = Object.assign({}, a);
  Object.keys(b).forEach(k => {
    const v = b[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = merge(out[k], v);
    else out[k] = v;
  });
  return out;
}
const fakeCo = { collection: () => ({ doc: (id) => ({
  get: async () => ({ exists: store[id] !== undefined, data: () => clone(store[id] || {}) }),
  set: async (body, opt) => { store[id] = (opt && opt.merge) ? merge(store[id] || {}, clone(body)) : clone(body); }
}) }) };
function device(){
  const ctx = { console, setTimeout, clearTimeout, Promise, PIT_CLOUD: true, fb: { company: () => fakeCo },
    state: { cards: [], staff: [] }, pitCanEditFinal: () => true };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(JS('quarter-fix.js'), ctx, { filename: 'quarter-fix.js' });
  return ctx;
}
const row = (no, id) => ({ soft: { 売上日: '2026-08-2' + (no % 9), 伝票: String(no).padStart(4, '0'), 顧客名: 'テスト' + no, ナンバー: '柏 300 あ ' + no },
                           pit: { 生: { id } } });
const keysOf = (ctx) => (ctx._pitQMarks || []).map(m => m.key);

console.log('\n── ① 印は1件ずつ書く（同時に押しても消えない） ──');
{
  const A = device(), B = device();
  await A.pitQLoadMarks(); await B.pitQLoadMarks();
  const ra = row(1, 'ca'), rb = row(2, 'cb');
  await A.pitQMark('売上日', ra.soft, ra.pit, true);
  await B.pitQMark('金額', rb.soft, rb.pit, true);      /* B は A の印を知らないまま押す */
  const C = device(); await C.pitQLoadMarks();
  const ka = A.pitQMarkKey('売上日', ra.soft, 'ca'), kb = B.pitQMarkKey('金額', rb.soft, 'cb');
  ok('🔴🔴 A の印も B の印も残っている（あとから押した人が消さない）', keysOf(C).includes(ka) && keysOf(C).includes(kb), keysOf(C));

  await A.pitQMark('売上日', ra.soft, ra.pit, false);
  const D = device(); await D.pitQLoadMarks();
  ok('🔴 外した印は消える／ほかの人の印は残る', !keysOf(D).includes(ka) && keysOf(D).includes(kb), keysOf(D));

  await B.pitQDid('担当', rb, 'フロント担当を 社長 → 専務 にした');
  const E = device(); await E.pitQLoadMarks();
  ok('🔴 直した記録（DID）も1件ずつ残る', keysOf(E).some(k => k.indexOf('DID|') === 0) && keysOf(E).includes(kb), keysOf(E));

  /* まだ新しくなっていない端末が、前の一覧を**書類ごと**書いた */
  await fakeCo.collection('pitSettings').doc('qmarks').set({ 一覧: [
    { key: 'OLD|1', 種類: '売上日', at: '2026-08-25T00:00:00.000Z' },
    { key: ka, 種類: '売上日', at: '2026-08-25T00:00:00.000Z' }        /* A が外した印の、古い写し */
  ] });
  const F = device(); await F.pitQLoadMarks();
  ok('🔴🔴 前の一覧を書類ごと書かれても、新しい印は消えない', keysOf(F).includes(kb), keysOf(F));
  ok('🔴 前の一覧にしか無い印も読める（移行の途中でも見える）', keysOf(F).includes('OLD|1'));
  ok('🔴🔴 外した印は、前の一覧に残っていてもよみがえらない', !keysOf(F).includes(ka), keysOf(F));
  ok('🔴 前の一覧（qmarks）には書きに行かない', JSON.stringify(store.qmarks.一覧.map(m => m.key)) === JSON.stringify(['OLD|1', ka]));

  const G = device(); await G.pitQLoadMarks();
  for (let i = 0; i < 900; i++) await G.pitQDid('売上日', row(1000 + i, 'cx' + i), 'test');
  const H = device(); await H.pitQLoadMarks();
  ok('🔴🔴 上限なし（900件入れて全部読める）', keysOf(H).filter(k => k.indexOf('DID|') === 0).length >= 900, keysOf(H).length);

  const fx = bare('quarter-fix.js');
  ok('（前提）印の書類は既にあるルールの中（pitSettings）', /collection\('pitSettings'\)/.test(fx) && /doc\('qmarks'\)/.test(fx));
  ok('🔴 一覧まるごと上書きの書き方が残っていない', !/set\(\{\s*一覧/.test(fx) && !/slice\(0,\s*CAP\)/.test(fx));
}

console.log('\n── ② 伝票の書き込みは、お客様の車のデータから数える ──');
{
  const VEH = { 'P1': { 伝票: [{ 予約番号: 'R1', 伝票番号: '0001' }] }, 'P2': { 伝票: [{ 予約番号: 'R2', 伝票番号: '0002' }] }, 'P3': { 伝票: [] } };
  const ctx = { console, _insp: { q: { groups: [], gi: 0 } }, pitQNokori: () => 0,
    pitVehByPlate: (plate) => VEH[plate] ? { veh: VEH[plate] } : null };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(JS('quarter-write.js'), ctx, { filename: 'quarter-write.js' });
  const pr = (i, plate, softPlate) => ({ soft: { 伝票: '000' + i, ナンバー: softPlate || plate, 顧客名: 'テスト' + i, 車体番号: 'VIN' + i, 明細: [], 明細が合う: true },
                                        pit: { 予約番号: 'R' + i, ナンバー: plate, 車体番号: 'VIN' + i } });
  const R = { 結びついた: [pr(1, 'P1'), pr(2, 'P2'), pr(3, 'P3'), pr(4, '', '仮登録車両')], 検算: { 合う: true } };
  const wc = ctx.pitQWriteCount ? ctx.pitQWriteCount(R) : null;
  ok('🔴🔴 数える関数がある', !!wc);
  ok('🔴🔴 書けた2／対象3／書く先なし1／まだ 0003', !!wc && wc.書けた === 2 && wc.対象 === 3 && wc.書く先なし === 1 && wc.未.join() === '0003', wc);
  const h1 = ctx.pitQWritePanel(R, { 再生: true });
  ok('🔴🔴 残した結果なら「まだ書き込まれていません」＋「PDFを入れ直すと書けます」', /まだ書き込まれていません/.test(h1) && /PDFを入れ直すと書けます/.test(h1), h1);
  ok('🔴 「伝票の書き込み 2/3」と、書く先の無い枚数を言う', /伝票の書き込み 2\/3/.test(h1) && /ナンバーが無い 1枚/.test(h1), h1);
  ok('🔴 「書き込むものはありません」と嘘をつかない', !/書き込むものはありません/.test(h1));
  VEH.P3.伝票.push({ 予約番号: 'R3', 伝票番号: '0003' });
  const h2 = ctx.pitQWritePanel(R, { 再生: true });
  ok('🔴 全部入っていれば「書き込み済みです」', /書き込み済みです/.test(h2) && /伝票の書き込み 3\/3/.test(h2), h2);

  const q = bare('quarter.js');
  const box = (q.match(/function wBox\(g, nok, 保存\)\{[\s\S]*?\n  \}/) || [''])[0];
  ok('🔴🔴 Qの箱に「伝票の書き込み ◯/◯」を出す（数えるのは quarter-write.js の1本）', /pitQWriteCount/.test(box) && /伝票の書き込み /.test(box), box.slice(0, 200));
  ok('🔴 まだの分は、次にやることを言う（残りを0に／PDFを入れ直す／書き込む）',
     /残りを0にすると書けます/.test(box) && /PDFを入れ直すと書けます/.test(box) && /書き込む/.test(box));
  ok('🔴 箱の中で呼んでいる', /wBox\(g, nok, 保存\)/.test(q.replace(box, '')));
  const css = fs.readFileSync(path.join(process.cwd(), 'css', 'quarter.css'), 'utf8');
  ok('見た目がある（まだの分は目立たせる）', /\.q-pq-w\.ng/.test(css) && /\.q-wr\.warn/.test(css));
}

console.log('\n── ③ 日常チェックに2本（D10 金額が文字／T10 入庫日が返車日より後） ──');
{
  function boot(cards){
    const ctx = { console, setTimeout, clearTimeout,
      document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
      state: { cards: cards || [], customers: [], loaners: [], companyCars: [], settings: {},
               workTypes: [], staff: [], boards: [], inspectMarks: {}, inspectMutes: {} } };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(JS('intern-pit.js'), ctx, { filename: 'intern-pit.js' });
    vm.runInContext(JS('pit-share.js'), ctx, { filename: 'pit-share.js' });
    vm.runInContext(JS('inspect-rules.js'), ctx, { filename: 'inspect-rules.js' });
    return ctx;
  }
  const base = { status: 'returned', returnStage: 'returnWait', customer: 'テスト', kana: 'テスト', tel: '0471234567', car: 'タント', frontStaff: '社長' };
  const cards = [
    Object.assign({ id: 'txt1', plate: '柏 500 あ 1', amountFinal: '317180', completedAt: '2026-08-25', returnDate: '2026-08-25', reserveDate: '2026-08-24' }, base),
    Object.assign({ id: 'in1', plate: '柏 500 あ 2', amountFinal: 30000, completedAt: '2026-08-01', returnDate: '2026-08-01', returnDateFinal: '2026-08-01', reserveDate: '2026-08-05', actualInAt: '2026-08-05' }, base),
    Object.assign({ id: 'ok1', plate: '柏 500 あ 3', amountFinal: 5000, completedAt: '2026-08-10', returnDate: '2026-08-10', reserveDate: '2026-08-09', actualInAt: '2026-08-09' }, base),
    Object.assign({}, base, { id: 'live1', status: 'work', plate: '柏 500 あ 4', amountOrder: 8000, reserveDate: '2026-08-20', returnDate: '2026-08-18' })
  ];
  const ctx = boot(cards);
  const R = ctx.PIT_INSPECT_RULES || [];
  ok('🔴 規則表に D10・T10 がある', R.some(x => x.id === 'D10') && R.some(x => x.id === 'T10'));
  const fs2 = (ctx.pitInspectRun().findings || []);
  const hit = (rule, id) => fs2.filter(f => f.ruleId === rule && JSON.stringify(f).indexOf(id) >= 0);
  ok('🔴🔴 D10：金額が文字の車を拾う', hit('D10', 'txt1').length === 1, fs2.filter(f => f.ruleId === 'D10'));
  ok('🔴 D10：数字の車は拾わない', hit('D10', 'in1').length === 0 && hit('D10', 'ok1').length === 0);
  ok('🔴🔴 T10：返車済みで入庫日が返車日より後の車を拾う', hit('T10', 'in1').length === 1, fs2.filter(f => f.ruleId === 'T10'));
  ok('🔴 T10：普通の車・まだ返車していない車は拾わない', hit('T10', 'ok1').length === 0 && hit('T10', 'live1').length === 0 && hit('T10', 'txt1').length === 0);
  const GONE = ['M05','M10','F01','F02','F11','R05','R07','S08','S01','S03','S04','S06','D06'];
  ok('消した番号を使っていない', !GONE.includes('D10') && !GONE.includes('T10'));

  const fx = bare('inspect-fix.js');
  ok('🔴 「ここを直す」で D10 の金額欄が開く', /D10:\s*\['amountFinal', 'amountOrder', 'amountQuote', 'estAmount', 'feeAmount'\]/.test(fx));
  ok('🔴 「ここを直す」で T10 の入庫日・実入庫日が開く', /T10:\s*\['reserveDate', 'actualInAt'\]/.test(fx) && /id:'actualInAt'/.test(fx));
  ok('🔴🔴 金額が文字の車は、同じ数のまま保存しても数字で入り直す（「変わっていません」で止めない）',
     /文字の金額 = \(fd\.type === 'money' && typeof c\[fd\.id\] === 'string'/.test(fx) && /if \(nv === ov && !文字の金額\) return;/.test(fx));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
