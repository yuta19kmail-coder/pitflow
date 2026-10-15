/* =====================================================================
   PitFlow ── 🔴🔴 **2台同時でも、相手の直しも自分の直しも消えない**（v2.185.0・棚卸し S-01・S-03・S-04）
   ---------------------------------------------------------------------
   ◎見張るもの
     ① S-04 顧客：A が車を足す → まだ受け取っていない B が電話を直して保存 → 両方残る（丸ごと上書きしない）
     ② S-04 設定1枚：A と B が別々の「確認した」札を付ける → 両方残る
     ③ S-04 送るのは変えた欄だけ（mergeFields）・版（rev）を添える（顧客・代車・設定も）
     ④ S-01 予約詳細が握っているカードは、相手の直しを受け取っても**同じ物のまま**＝そのあと入れた金額が保存される
     ⑤ S-03 予約を編集中に相手が別の欄を直した → 保存が弾かれても、自分の欄を載せ直して両方残る
     ⑥ S-03 同じ欄を両方が直した → 相手を残す（押し切らない）＋黙らない（PF-0012）
     ⑦ S-04 手元の一覧から消えただけの物には delete を送らない（取り込みの置き換え・読み込みのやり直し）
     ⑧ 消す操作（PitDB.keep）を通った物は消える
     ⑨ 送っている最中に届いた相手の直しは、送り終わってから取り直す
     ⑩ 受け取った時、手元でまだ送っていない欄（相手が触っていない欄）は消さない
   ◎使い方
     node _見張り/test_two_devices.mjs
     直す前の版で赤を確かめる：PIT_DB_SRC=<古い db-pit.js> node _見張り/test_two_devices.mjs
   ===================================================================== */
import { makeCloud, boot, 待つ } from './_pit_cloud2.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const 起こす = async (cloud) => { const T = boot(cloud); T.D.connectCloud({}, {}); await 待つ(30); return T; };
const 保存 = async (T, ms = 80) => { T.D.save(true); await 待つ(ms); };

const 顧客 = { id: 'k1', name: '山田', tel: '090-1111', vehicles: [{ id: 'v1', car: 'タント' }], rev: 3 };
const カード = { id: 'c1', resNo: 'A100', customer: '山田', status: 'check', memo: '', todayNote: '', amountFinal: null, log: [{ at: 1, label: '入庫' }], rev: 5 };

console.log('\n── 🔴 ①顧客：A が車を足す／まだ受け取っていない B が電話を直す ──');
{
  const cloud = makeCloud({ data: { pitCustomers: [顧客] } });
  const A = await 起こす(cloud), B = await 起こす(cloud);
  cloud.止める(B.dev);
  A.S.customers[0].vehicles.push({ id: 'v2', car: 'N-BOX' });
  await 保存(A);
  B.S.customers[0].tel = '090-2222';
  await 保存(B);
  const s = cloud.サーバーの('pitCustomers', 'k1');
  ok('🔴🔴 A が足した車が残っている', s.vehicles.length === 2 && s.vehicles[1].id === 'v2', s);
  ok('🔴 B が直した電話も入っている', s.tel === '090-2222', s);
  cloud.届けなおす(B.dev); await 待つ(60);
  ok('B の画面にも A の車が届く', B.S.customers[0].vehicles.length === 2, B.S.customers[0]);
}

console.log('\n── 🔴 ②設定1枚：A と B が別々の「確認した」札を付ける ──');
{
  const cloud = makeCloud({ revCols: ['pitCards', '@settings'], settings: { settings: { holidays: ['水'] }, bays: [], floorPlan: { shapes: [] }, aiVerdicts: {}, boardLabels: {}, inspectMarks: {}, inspectMutes: {}, rev: 2 } });
  const A = await 起こす(cloud), B = await 起こす(cloud);
  cloud.止める(B.dev);
  A.S.inspectMarks['札A'] = { by: 'A' };
  await 保存(A);
  B.S.inspectMarks['札B'] = { by: 'B' };
  B.S.settings.holidays = ['水', '日'];
  await 保存(B, 300);   /* 偽クラウドは設定1枚にも版の関門を付けた（ルールに足す予定の形）＝B は1回弾かれて載せ直す */
  const s = cloud.サーバーの('pitSettings', 'main');
  ok('🔴🔴 A の札が残っている', !!(s.inspectMarks && s.inspectMarks['札A']), s.inspectMarks);
  ok('🔴 B の札も入っている', !!(s.inspectMarks && s.inspectMarks['札B']), s.inspectMarks);
  ok('B が直した設定も入っている', JSON.stringify(s.settings.holidays) === '["水","日"]', s.settings);
  ok('設定1枚にも版が付いて進む', s.rev === 4, s.rev);
}

console.log('\n── 🔴 ③送るのは変えた欄だけ・版を添える ──');
{
  const cloud = makeCloud({ data: { pitCustomers: [顧客], pitLoanerAssigns: [{ id: 'a1', loanerId: 'L1', from: '2026-10-01', to: '2026-10-05', washDone: false, rev: 1 }] } });
  const A = await 起こす(cloud);
  A.S.customers[0].tel = '090-3333';
  A.S.loanerAssigns[0].to = '2026-10-06';
  await 保存(A);
  const w1 = cloud.log.writes.find(w => w.p === 'pitCustomers/k1');
  const w2 = cloud.log.writes.find(w => w.p === 'pitLoanerAssigns/a1');
  ok('🔴 顧客は「電話＋版」だけ書く', w1 && JSON.stringify(w1.fields) === '["tel","rev"]', w1);
  ok('🔴 貸出の札は「返す日＋版」だけ書く（CarFlow の洗車の印を巻き込まない）', w2 && JSON.stringify(w2.fields) === '["to","rev"]', w2);
  ok('版が1つ進む（顧客 3→4）', cloud.サーバーの('pitCustomers', 'k1').rev === 4);
}

console.log('\n── 🔴🔴 ④予約詳細が握っているカードは、相手の直しを受け取っても生きている（S-01） ──');
{
  const cloud = makeCloud({ data: { pitCards: [カード] } });
  const A = await 起こす(cloud);
  const 握る = A.S.cards[0];                                   /* card-view.js の _c と同じ */
  cloud.よそが直す('pitCards', 'c1', { todayNote: 'MHSで当日メモ' });   /* MHS の当日ビュー */
  await 待つ(40);
  ok('相手の当日メモが画面に届く', A.S.cards[0].todayNote === 'MHSで当日メモ', A.S.cards[0]);
  ok('🔴🔴 握っていた物と state の物が同じ（抜け殻になっていない）', 握る === A.S.cards[0]);
  握る.amountFinal = 58000;                                     /* 詳細で確定金額を入れる */
  await 保存(A);
  const s = cloud.サーバーの('pitCards', 'c1');
  ok('🔴🔴 詳細で入れた金額がサーバーに届く', s.amountFinal === 58000, s);
  ok('相手の当日メモも残っている', s.todayNote === 'MHSで当日メモ', s);
  ok('弾かれていない', cloud.log.弾いた.length === 0, cloud.log.弾いた);
}

console.log('\n── 🔴🔴 ⑤予約を編集中に相手が別の欄を直した → 両方残る（S-03） ──');
{
  const cloud = makeCloud({ data: { pitCards: [カード] } });
  const A = await 起こす(cloud);
  A.ctx.__editing = 'c1';                                       /* 予約を編集で開いている */
  A.S.cards[0].memo = 'A が打ったメモ';
  cloud.よそが直す('pitCards', 'c1', { todayNote: 'MHSで当日メモ', log: カード.log.concat([{ at: 2, label: '入庫済み／MHS' }]) });
  await 待つ(40);
  A.ctx.__editing = null;                                       /* 保存する */
  await 保存(A, 250);
  const s = cloud.サーバーの('pitCards', 'c1');
  ok('🔴🔴 A のメモが入っている（捨てられていない）', s.memo === 'A が打ったメモ', s);
  ok('🔴 相手の当日メモも残っている', s.todayNote === 'MHSで当日メモ', s);
  ok('🔴 相手のフローの行も残っている', (s.log || []).some(r => r.label === '入庫済み／MHS'), s.log);
  ok('「打った内容は入っていません」は出ない', !A.知らせ.some(t => /入っていません/.test(t)), A.知らせ);
  ok('A の画面にも相手の当日メモ', A.S.cards[0].todayNote === 'MHSで当日メモ', A.S.cards[0]);
}

console.log('\n── 🔴 ⑥同じ欄を両方が直した → 相手を残す・黙らない（S-03） ──');
{
  const cloud = makeCloud({ data: { pitCards: [カード] } });
  const A = await 起こす(cloud);
  A.ctx.__editing = 'c1';
  A.S.cards[0].todayNote = 'A の当日メモ';
  A.S.cards[0].memo = 'A のメモ';
  cloud.よそが直す('pitCards', 'c1', { todayNote: 'MHS の当日メモ' });
  await 待つ(40);
  A.ctx.__editing = null;
  await 保存(A, 250);
  const s = cloud.サーバーの('pitCards', 'c1');
  ok('🔴 重なった欄は相手（先に直した方）を残す', s.todayNote === 'MHS の当日メモ', s);
  ok('🔴 重ならない欄（メモ）は入る', s.memo === 'A のメモ', s);
  ok('🔴 黙らない（PF-0012）', A.知らせ.some(t => /PF-0012/.test(t)), A.知らせ);
}

console.log('\n── 🔴🔴 ⑦手元の一覧から消えただけの物には delete を送らない ──');
{
  const cloud = makeCloud({ data: { pitCustomers: [顧客, Object.assign({}, 顧客, { id: 'k2', name: '佐藤' })], pitCards: [カード] } });
  const A = await 起こす(cloud);
  A.S.customers = [Object.assign({}, A.S.customers[0])];       /* 取り込みの置き換え（import-bizcloud）など */
  A.S.cards = [];
  await 保存(A);
  ok('🔴🔴 サーバーから1件も消えていない', cloud.log.del.length === 0, cloud.log.del);
  ok('🔴 消えていた顧客は手元に戻る', A.S.customers.some(c => c.id === 'k2'), A.S.customers.map(c => c.id));
  ok('🔴 消えていたカードも手元に戻る', A.S.cards.some(c => c.id === 'c1'));
}

console.log('\n── ⑧消す操作を通った物は消える ──');
{
  const cloud = makeCloud({ data: { pitLoanerAssigns: [{ id: 'a1', loanerId: 'L1' }, { id: 'a2', loanerId: 'L2' }] } });
  const A = await 起こす(cloud);
  if (typeof A.D.keep === 'function') A.D.keep('loanerAssigns', a => a.id !== 'a1');
  else A.S.loanerAssigns = A.S.loanerAssigns.filter(a => a.id !== 'a1');
  await 保存(A);
  ok('消した1件だけ消える', JSON.stringify(cloud.log.del) === '["pitLoanerAssigns/a1"]', cloud.log.del);
}

console.log('\n── 🔴 ⑨送っている最中に届いた相手の直しは、送り終わってから取り直す ──');
{
  const cloud = makeCloud({ data: { pitCustomers: [顧客] }, delay: 60 });
  const A = await 起こす(cloud);
  A.S.customers[0].tel = '090-4444';
  A.D.save(true);                                               /* 送り始め（60ms かかる） */
  await 待つ(10);
  cloud.よそが直す('pitCustomers', 'k1', { name: '山田（旧姓 鈴木）' });   /* 送っている最中に届く */
  await 待つ(300);
  ok('🔴 相手の直しが画面に入る（捨てたままにしない）', A.S.customers[0].name === '山田（旧姓 鈴木）', A.S.customers[0]);
  ok('自分の直しも残る', A.S.customers[0].tel === '090-4444' && cloud.サーバーの('pitCustomers', 'k1').tel === '090-4444', A.S.customers[0]);
}

console.log('\n── 🔴 ⑩受け取った時、手元でまだ送っていない欄は消さない ──');
{
  const cloud = makeCloud({ data: { pitCards: [カード] } });
  const A = await 起こす(cloud);
  A.S.cards[0].memo = 'まだ送っていない';                       /* 0.5秒の待ちの間 */
  cloud.よそが直す('pitCards', 'c1', { todayNote: '相手' });
  await 待つ(40);
  ok('🔴 手元のメモが残っている', A.S.cards[0].memo === 'まだ送っていない', A.S.cards[0]);
  ok('相手の当日メモも入る', A.S.cards[0].todayNote === '相手', A.S.cards[0]);
  await 保存(A, 250);
  const s = cloud.サーバーの('pitCards', 'c1');
  ok('両方サーバーに残る', s.memo === 'まだ送っていない' && s.todayNote === '相手', s);
}

console.log('\n── 🔴 ⑪付箋の回覧の確認は「1件足す」で書き、次の保存で配列を丸ごと書き直さない（S-18） ──');
{
  const cloud = makeCloud({ data: { pitBoardNotes: [{ id: 'n1', text: '回覧', doneByUids: ['x'] }] } });
  const A = await 起こす(cloud);
  cloud.止める(A.dev);
  cloud.よそが直す('pitBoardNotes', 'n1', { doneByUids: ['x', 'y'] });          /* 別の人が確認（A にはまだ届かない） */
  const n = A.S.boardNotes[0];
  n.doneByUids.push('z');                                                      /* A が確認（部品が手元に入れる） */
  cloud.data.pitBoardNotes[0].doneByUids.push('z');                            /* board-notes.js が arrayUnion で書いた分 */
  if (typeof A.D.sentFields === 'function') A.D.sentFields('boardNotes', n, ['doneByUids']);
  n.text = '回覧（直した）';
  await 保存(A);
  const s = cloud.サーバーの('pitBoardNotes', 'n1');
  ok('🔴🔴 相手の確認（y）が消えていない', JSON.stringify(s.doneByUids) === '["x","y","z"]', s.doneByUids);
  ok('ほかに直した欄（本文）は送られる', s.text === '回覧（直した）', s);
  const src = (await import('fs')).readFileSync('js/board-notes.js', 'utf8');
  ok('board-notes.js は info を渡し、1件足す／抜くを atomicPatch で書く', /CFNoteAll\.save\(note, res, info\)/.test(src) && /atomicPatch\(note, info, FV\)/.test(src) && /sentFields\('boardNotes'/.test(src));
}

console.log('\n── 🔴 ⑬自分の保存の「手元向けの受信」で、読み直し・描き直しを起こさない（出す前の確認の指摘） ──');
{
  const cards = []; for (let i = 0; i < 20; i++) cards.push({ id: 'p' + i, resNo: 'P' + i, status: 'check', memo: '', rev: 1 });
  const cloud = makeCloud({ data: { pitCards: cards }, localEcho: true });
  const A = await 起こす(cloud);
  let 描き直し = 0; A.ctx.showView = () => { 描き直し++; }; A.S.currentView = 'board';
  let 読み = 0; const r0 = A.D.refreshDoc.bind(A.D); A.D.refreshDoc = function () { 読み++; return r0.apply(null, arguments); };
  A.S.cards.forEach((c, i) => { c.memo = 'x' + i; });
  await 保存(A, 120);
  ok('🔴 20枚を1回保存してもサーバーを読み直さない', 読み === 0, 読み);
  ok('🔴 描き直しもしない', 描き直し === 0, 描き直し);
  ok('ちゃんと届いている', cloud.サーバーの('pitCards', 'p7').memo === 'x7');
}

console.log('\n── 🔴 ⑭フローの行を打ち消した／直したのと、ほかの端末の追記が重なっても2行にならない ──');
{
  const cloud = makeCloud({ data: { pitCards: [Object.assign({}, カード, { log: [{ at: 1, label: '留守', manual: true }] })] } });
  const A = await 起こす(cloud);
  A.ctx.__editing = 'c1';
  A.S.cards[0].log[0].deleted = true; A.S.cards[0].log[0].deletedBy = 'A';    /* 打ち消し線 */
  cloud.よそが直す('pitCards', 'c1', { log: [{ at: 1, label: '留守', manual: true }, { at: 2, label: '入庫済み／MHS' }] });
  await 待つ(40);
  A.ctx.__editing = null;
  await 保存(A, 250);
  const s = cloud.サーバーの('pitCards', 'c1');
  ok('🔴 行は2つ（打ち消した行＋相手の行）＝同じ行が2つにならない', s.log.length === 2, s.log);
  ok('打ち消しが入っている', s.log[0].deleted === true, s.log[0]);
  ok('相手の行も残る', s.log[1].label === '入庫済み／MHS', s.log);
}

console.log('\n── 🔴 ⑪b 返信を消す（形が少し違う返信も id で消える・共通部品の applyOps） ──');
{
  const fs = await import('fs'), vm = await import('vm');
  const sh = '../../_shared/coreflow-note-board.js';
  if (!fs.existsSync(sh)) console.log('  ⏭ 共通部品が無いので飛ばした');
  else {
    const c2 = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
      document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} } },
      localStorage: { getItem: () => null, setItem() {} } };
    c2.window = c2; vm.createContext(c2); vm.runInContext(fs.readFileSync(sh, 'utf8'), c2);
    const R = c2.CFNoteBoard.rules;
    /* サーバーの返信は形が少し違う（at・edited が多い） */
    const cloud = makeCloud({ data: { pitBoardNotes: [{ id: 'n2', text: '付箋', replies: [{ id: 'r1', text: 'はい', at: 5, edited: true }, { id: 'r2', text: '了解', at: 6 }] }] } });
    const A = await 起こす(cloud);
    const n = A.S.boardNotes[0];
    const 消す = { id: 'r1', text: 'はい' };                                     /* 手元の形（at が無い） */
    n.replies = n.replies.filter(r => r.id !== 'r1');
    const 本 = cloud.data.pitBoardNotes;
    const ref = { set: (b, o) => { Object.assign(本[0], b); return Promise.resolve(); } };
    const db = { runTransaction: fn => fn({ get: () => Promise.resolve({ exists: true, data: () => JSON.parse(JSON.stringify(本[0])) }),
                                            set: (r, b) => { Object.keys(b).forEach(k => { 本[0][k] = b[k]; }); } }) };
    const FV = { arrayUnion: v => ({ __u: v }), arrayRemove: v => ({ __r: v }) };
    await R.applyOps(ref, n, { ops: { replies: { remove: 消す } }, fields: [] }, FV, db, {});
    A.D.sentFields('boardNotes', n, ['replies']);
    await 保存(A);
    const s = cloud.サーバーの('pitBoardNotes', 'n2');
    ok('🔴 形が少し違う返信も id で消える', !s.replies.some(r => r.id === 'r1') && s.replies.some(r => r.id === 'r2'), s.replies);
    ok('次の保存で返信を丸ごと書き直さない', !cloud.log.writes.some(w => w.p === 'pitBoardNotes/n2' && String(w.fields).includes('replies')), cloud.log.writes);
    const bn = fs.readFileSync('js/board-notes.js', 'utf8');
    ok('board-notes.js は applyOps を呼ぶ（無い古い写しは atomicPatch）', /R\.applyOps\(ref, note, info, FV, fb\.db, extra\)/.test(bn) && /R\.atomicPatch\(note, info, FV\)/.test(bn));
  }
}

console.log('\n── 🔴 ⑫オフラインで直して閉じた分が弾かれたら、次に開いた時に知らせる（黙って捨てない） ──');
{
  const 箱 = {};
  const LS = { get length() { return Object.keys(箱).length; }, getItem: k => (k in 箱 ? 箱[k] : null), setItem: (k, v) => { 箱[k] = String(v); }, removeItem: k => { delete 箱[k]; }, key: i => Object.keys(箱)[i] || null };
  const cloud = makeCloud({ data: { pitCards: [カード, Object.assign({}, カード, { id: 'c2', resNo: 'A200' })] }, delay: 400 });
  const A1 = boot(cloud, { before: c => { c.localStorage = LS; } });
  A1.D.connectCloud({}, {}); await 待つ(30);
  A1.S.cards[1].memo = '届いた方';
  A1.D.save(true); await 待つ(450);                          /* c2 は届いた（控えは消える） */
  A1.S.cards[0].memo = 'オフラインで打ったメモ';            /* 送り始めて、届く前に閉じた */
  A1.D.save(true); await 待つ(20);
  A1.D._jDone = () => {};                                   /* 閉じた＝この画面はもう控えを消さない・載せ直しもしない */
  A1.D._rebaseAll = () => new Promise(() => {});
  cloud.よそが直す('pitCards', 'c1', { memo: 'ほかの人のメモ' });   /* その間にほかの人が同じカードを直した */
  await 待つ(450);                                          /* c1 は版で弾かれた */
  /* まだ A1 のタブが生きている（合図が新しい）間は、2つ目のタブは A1 の控えに触らない */
  const 出た0 = [];
  const B2 = boot(cloud, { before: c => { c.localStorage = LS; } });
  B2.ctx.pitAsk = (m, o) => { 出た0.push((o && o.code) + ' ' + m); return Promise.resolve(false); };
  B2.ctx.pitLog = () => {};
  B2.D._JWAIT = 30; B2.D.connectCloud({}, {}); await 待つ(120);
  ok('🔴 同じPCのほかのタブがまだ開いている間は「送れなかった」と言わない・控えも消さない', 出た0.length === 0 && !!LS.getItem('pitflow_unsent_v1'), 出た0);
  Object.keys(箱).filter(k => /^pitflow_tab_/.test(k)).forEach(k => LS.removeItem(k));   /* A1 を閉じた */
  const 出た = [];
  const A2 = boot(cloud, { before: c => { c.localStorage = LS; } });
  A2.ctx.pitAsk = (m, o) => { 出た.push((o && o.code) + ' ' + m + ' ' + (o && o.detail)); return Promise.resolve(true); };   /* 「入れ直す」 */
  A2.ctx.pitLog = (a, o) => 出た.push('ログ ' + a + ' ' + (o && o.label));
  A2.D._JWAIT = 30;
  A2.D.connectCloud({}, {}); await 待つ(700);   /* この偽クラウドは届くまで 0.4 秒 */
  ok('🔴🔴 送れなかった直しを画面に出す（PF-0013・どのカードのどの欄か）', 出た.some(t => /PF-0013/.test(t) && /A100/.test(t) && /メモ|memo/.test(t)), 出た);
  ok('🔴 届いた方（A200）は出さない', !出た.some(t => /A200/.test(t)), 出た);
  ok('操作ログにも残す', 出た.some(t => /^ログ 送れなかった直し/.test(t)), 出た);
  ok('見せた控えは消える（2回出さない）', !(JSON.parse(LS.getItem('pitflow_unsent_v1') || '[]').some(e => e.tab !== A2.D._jTab)), LS.getItem('pitflow_unsent_v1'));
  if (process.env.DBG) console.log(A2.言.join(' | '));
  ok('🔴 「入れ直す」で、その欄だけ今の版で入る', cloud.サーバーの('pitCards', 'c1').memo === 'オフラインで打ったメモ', cloud.サーバーの('pitCards', 'c1'));
  ok('いまの値と直した値を並べて見せる', 出た.some(t => /いま「ほかの人のメモ」→ 直した「オフラインで打ったメモ」/.test(t)), 出た);
  const src = (await import('fs')).readFileSync('js/import-bizcloud.js', 'utf8');
  ok('顧客の丸ごと取り込みは本番（PIT_CLOUD）では止める（PF-9012）', /if \(window\.PIT_CLOUD\)[\s\S]{0,200}PF-9012/.test(src));
}

console.log('\n────────────────────────────');
console.log(fail === 0 ? `  ✅ 全部そろっています（${pass}件）` : `  ❌ ${fail}件 赤／${pass}件 緑`);
process.exit(fail === 0 ? 0 : 1);
