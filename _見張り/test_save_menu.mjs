/* PitFlow v1.19.0 ── 新規予約カード「保存の6通り」のテスト
   -------------------------------------------------------------------
   ◎考え方（MHS の _harness.mjs と同じ）
     PitFlow 本体は動かさない。index.html のカードのヘッダと、
     card-detail.js の**保存まわりの関数だけ**を切り出した小さなページを
     その場で組み立てて、本物のコードを動かして確かめる。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8940      ← 別ウィンドウ
     node test_save_menu.mjs
   ⚠ 書き出す test-save.html / _save-part.js は確認用。本番には含めない（.gitignore 済み）。 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/* ---- 試験台を組み立てる ---- */
(function build(){
  const dir = process.cwd();
  const src = fs.readFileSync(path.join(dir,'js','card-detail.js'),'utf8');
  /* 🔴 v1.56.1 「中身が空なら予約を作らない」の見張り（_pitCardIsBlankNow / _pitAskBlankSave）が
     保存関数の**手前**に増えたので、切り出しの開始をそこまで戻す
     （二度押しの見張り `_pitLastSaveAt` / `_pitSaveOnce` もその手前にある）。
     ⚠ 手前で切ると保存関数の中から呼べず、丸ごと落ちる。 */
  const from = src.indexOf('var _pitLastSaveAt = 0;');
  const to   = src.indexOf('function renderCardForm(c)');
  if (from < 0 || to < 0) throw new Error('card-detail.js の保存まわりが見つかりません（関数名が変わった？）');
  /* 🔴 v1.76.0 すべての保存が **_pitCardGuard（赤なら止める／黄なら1回聞く）** を通るようになった。
     ⚠ 本物を切り出して足す（写しを作らない）。ここも本体の並びが変わったら落ちる＝それでよい。 */
  const gFrom = src.indexOf('function _cardMarkMisses(c, root){');
  const gTo   = src.indexOf('/* 再描画後に赤枠を貼り直す', gFrom);
  if (gFrom < 0 || gTo < 0) throw new Error('card-detail.js から入力チェック＋関門を切り出せません（構成が変わった？）');
  /* 🔴 v1.168.0 **必須／推奨の表は js/card-miss.js へ移した。**
     ＝ `_cardMarkMisses` は「どこに赤枠を塗るか」だけになり、表そのものは
       `pitCardMisses` に聞く。試験台にも**本物のまま**足す（写しを作らない）。
     ⚠ ここを足し忘れると、関門が「赤ゼロ」と勘違いして**全部素通り**する。 */
  const missSrc = fs.readFileSync(path.join(dir,'js','card-miss.js'),'utf8');
  /* 🔴 v2.87.0 「この車でもう1件」は **views.js の本物**を切り出して足す（写しを作らない）。
     ＝ 引き継ぐ欄の一覧（PIT_NEXT_KEEP）を試験の中に書き写さない。本体で足した欄がそのまま試される。
     ⚠ 名前や並びが変わったらここで落ちる＝それでよい。 */
  const vSrc = fs.readFileSync(path.join(dir,'js','views.js'),'utf8');
  const vbFrom = vSrc.indexOf('function _pitBlankReserveCard(){');
  const vbTo   = vSrc.indexOf('function openNewReserve(){');
  const vnFrom = vSrc.indexOf('const PIT_NEXT_KEEP = [');
  const vnEnd  = vSrc.indexOf('window.pitOpenNextReserveFrom = pitOpenNextReserveFrom;');
  if (vbFrom < 0 || vbTo < 0 || vnFrom < 0 || vnEnd < 0) throw new Error('views.js から「まっさらな1枚」と「この車でもう1件」を切り出せません（構成が変わった？）');
  const vPart = vSrc.slice(vbFrom, vbTo) + '\n' + vSrc.slice(vnFrom, vnEnd + 'window.pitOpenNextReserveFrom = pitOpenNextReserveFrom;'.length);
  fs.writeFileSync(path.join(dir,'_save-part.js'),
    'let _cardBodyId = "md-body";\nlet _cardCheckOn = false;\n'
    + missSrc + '\n' + src.slice(gFrom,gTo) + '\n' + src.slice(from,to) + '\n' + vPart);

  const h = fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const head = h.slice(h.indexOf('<section id="view-card" class="view">'), h.indexOf('<div id="md-body"'));
  const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="css/card-view.css">
<style>
:root{--bg:#12161f;--bg2:#161c28;--bg3:#1e2634;--border:#2b3547;--text:#dbe3ef;--text3:#63718a;--brand:#1db97a}
body{margin:0;background:var(--bg);color:var(--text);font-family:sans-serif}
.view-header{display:flex;gap:8px;align-items:center;padding:14px}
.vh-btn{padding:7px 12px;border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:8px;cursor:pointer;font-family:inherit}
.vh-btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}
.view-title{flex:1}
</style><body>
${head}</section>
<div id="md-body"></div>
<script>
/* PitFlow の土台をうすく再現（保存関数が呼ぶものだけ） */
var _editingCardId='c1';
window.ymd=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
window.state={ cards:[], currentView:'reserve' };
window.__closed=0; window.__printed=[]; window.__toasts=[]; window.__logs=[]; window.__flow=[]; window.__draftCleared=0;
window.closeDetail=function(){ window.__closed++; };
window.pitPrintCover=function(id){ window.__printed.push(id); };
window.pitToast=function(m){ window.__toasts.push(m); };
window.pitLog=function(a,o){ window.__logs.push({a:a,o:o}); };
window.logFlow=function(c,l){ window.__flow.push(l); };
window.pitClearDraftKeep=function(){ window.__draftCleared++; };
window.UI={ alert:function(t,o){ window.__alert={t:t,o:o}; return Promise.resolve(true); } };
window.pitAlert=function(t,o){ window.__alert={t:t,o:o}; return Promise.resolve(true); };
/* 🟡 v1.76.0 黄（入れたほうがいい）の確認。既定は「このまま保存する」＝今までの試験がそのまま通る */
window.__askAnswer=true;
window.pitAsk=function(t,o){ window.__ask={t:t,o:o}; return Promise.resolve(window.__askAnswer); };
/* 🔴 v1.76.0 赤（必須）が全部入った土台。見たい所だけを上書きして試す */
window.__FULL={ kana:'タナカ', repeat:'repeater', tel:'090-0000-0000', dropType:'wait', workType:'oil' };
window.__reset=function(card){
  state.cards=[Object.assign({id:'c1'},window.__FULL,card)]; _editingCardId='c1';
  _cardCheckOn=false; window.__ask=null; window.__askAnswer=true;
  window._pitLastSaveAt=0;   /* 🔴 v1.56.1 二度押しの見張りを毎回まっさらに（続けて試すので） */
  window.__closed=0; window.__printed=[]; window.__toasts=[]; window.__logs=[]; window.__flow=[]; window.__draftCleared=0; window.__alert=null;
  window.__opened=[]; window.__resNoSeq=0;   /* 🔁 v2.87.0 2枚目まわりも毎回まっさらに */
};
window.__card=function(){ return state.cards[0]; };
/* 🔁 v2.87.0 「この車でもう1件」で2枚目が開くところ。開いた相手を控えるだけ。 */
window.__opened=[];
window.openCard=function(id,mode){ window.__opened.push({id:id,mode:mode}); };
window.PitDB={ save:function(){} };
window.__resNoSeq=0;
window.pitGenResNo=function(){ window.__resNoSeq++; return 'K0000'+window.__resNoSeq; };
window.pitCurrentStaffName=function(){ return ''; };
window.__next=function(){ return state.cards[1]; };
</script>
<script src="_save-part.js"></script>
<script>window.__ready=1;</script></body>`;
  fs.writeFileSync(path.join(dir,'test-save.html'), page);
})();

const cp=['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p=>fs.existsSync(p));
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const TODAY=ymd(new Date()), PAST=ymd(new Date(Date.now()-9*86400000));
let pass=0,fail=0;
const ok=(n,c,x='')=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==''?'  → '+JSON.stringify(x):''));} };

const b=await chromium.launch({executablePath:cp});
const p=await b.newPage({viewport:{width:1280,height:400}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
p.on('console',m=>{ if(m.type()==='error'&&!/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:8940/test-save.html'); await p.waitForFunction('window.__ready===1');

console.log('\n── ① ボタンの並び（右から 印刷して保存／その他保存／入力チェック） ──');
const btns=await p.evaluate(()=>Array.from(document.querySelectorAll('.view-header > button, .view-header > .vh-menu > button')).map(x=>x.textContent.replace(/\s+/g,' ').trim()));
console.log('   ',JSON.stringify(btns));
ok('一番右が「印刷して保存」', /印刷して保存/.test(btns[btns.length-1]), btns);
ok('その次が「その他保存」',   /その他保存/.test(btns[btns.length-2]), btns);
ok('その次が「入力チェック」', /入力チェック/.test(btns[btns.length-3]), btns);
ok('「保存する」「仮予約で登録」が表の並びから消えた', !btns.some(x=>/^保存する|仮予約で登録/.test(x)), btns);

console.log('\n── ② その他保存メニュー ──');
ok('最初は閉じている', await p.evaluate(()=>getComputedStyle(document.getElementById('cs-menu-panel')).display)==='none');
await p.click('#cs-menu-btn');
const items=await p.evaluate(()=>Array.from(document.querySelectorAll('#cs-menu-panel .vh-mi b')).map(x=>x.textContent.trim()));
console.log('   ',JSON.stringify(items));
ok('開く', await p.evaluate(()=>getComputedStyle(document.getElementById('cs-menu-panel')).display)!=='none');
/* 🔵 v1.74.0 いちばん上に「承認に回して保存」が増えた（ゆうた指定）。
   🔁 v2.87.0 その次に「印刷して保存して、この車でもう1件」が入った（ゆうた指定 2026-09-09）。
   ⚠ 一等地（画面右の「印刷して保存」）は動かさない＝いちばん多い操作の場所を変えない。 */
ok('7つ・順番どおり（承認 → この車でもう1件 が先頭2つ）', JSON.stringify(items)===JSON.stringify(['承認に回して保存','印刷して保存して、この車でもう1件','仮予約で保存','入庫中に印刷して保存','入庫中に保存のみ','予約保存のみ','表紙印刷のみ']), items);
ok('下に開く（ボタンより下）', await p.evaluate(()=>{
  const b=document.getElementById('cs-menu-btn').getBoundingClientRect();
  const q=document.getElementById('cs-menu-panel').getBoundingClientRect(); return q.top>=b.bottom-1; }));
await p.keyboard.press('Escape');
ok('Escで閉じる', await p.evaluate(()=>getComputedStyle(document.getElementById('cs-menu-panel')).display)==='none');
await p.click('#cs-menu-btn'); await p.mouse.click(5,380);
ok('外側クリックで閉じる', await p.evaluate(()=>getComputedStyle(document.getElementById('cs-menu-panel')).display)==='none');

const run=async (setup,fn)=>{ await p.evaluate(c=>window.__reset(c),setup); await p.evaluate(f=>{ eval(f); },fn); await p.waitForTimeout(60);
  return p.evaluate(()=>({card:window.__card(),closed:window.__closed,printed:window.__printed,toasts:window.__toasts,logs:window.__logs,flow:window.__flow,draft:window.__draftCleared,alert:window.__alert,ask:window.__ask})); };

console.log('\n── ③ 入庫中に保存のみ（過去日・国産＝1課） ──');
let r=await run({_draft:true,status:'reserved',boardId:'default',customer:'田中',car:'ノート',reserveDate:PAST},'pitSaveInWork(false)');
console.log('   ',JSON.stringify({s:r.card.status,b:r.card.boardId,rd:r.card.reserveDate,ai:r.card.actualInAt,d:r.card._draft,t:r.toasts}));
ok('status が check（点検待ち）',      r.card.status==='check', r.card.status);
ok('boardId は国産のまま＝1課の盤面',  r.card.boardId==='default', r.card.boardId);
ok('入庫日は過去日のまま（書き換えない）', r.card.reserveDate===PAST, r.card.reserveDate);
ok('実入庫日に入庫日が入る',            r.card.actualInAt===PAST, r.card.actualInAt);
ok('下書きが外れる＝保存される',        r.card._draft===undefined, r.card._draft);
ok('入庫日未定フラグが下りる',          r.card.intakeTbd===false, r.card.intakeTbd);
ok('仮予約フラグは立たない',            r.card.tentative===false, r.card.tentative);
ok('印刷していない',                    r.printed.length===0, r.printed);
ok('元の画面へ戻る（closeDetail）',     r.closed===1, r.closed);
ok('操作ログに残る',                    r.logs.some(x=>/入庫中で登録/.test(x.a)), r.logs);
ok('ログに過去日と分かる印',            r.logs.some(x=>/過去日/.test(x.o.label||'')), r.logs);
ok('トーストに1課と入庫日',             /1課/.test(r.toasts[0])&&r.toasts[0].includes(PAST), r.toasts);

console.log('\n── ④ 入庫中に印刷して保存（輸入＝2課） ──');
r=await run({_draft:true,status:'reserved',boardId:'import',customer:'鈴木',reserveDate:PAST},'pitSaveInWork(true)');
ok('status が check',        r.card.status==='check', r.card.status);
ok('2課の盤面（import）',    r.card.boardId==='import', r.card.boardId);
ok('表紙を印刷した',          r.printed.length===1&&r.printed[0]==='c1', r.printed);
ok('トーストが2課',           /2課/.test(r.toasts[0]), r.toasts);
ok('元の画面へ戻る',          r.closed===1, r.closed);

/* 🔴 v1.76.0 入庫日は**赤（必須）**になった＝ボタンからは空のまま保存できない。
   　 空なら今日を入れる仕掛けは**念のための受け皿**として残っている（直接呼べば効く）。 */
console.log('\n── ⑤ 入庫日が空 → 関門で止まる／受け皿は生きている ──');
r=await run({_draft:true,status:'reserved',boardId:'default',reserveDate:''},'pitSaveInWork(false)');
ok('🔴 保存しない（下書きのまま）', r.card._draft===true, r.card._draft);
ok('🔴 画面を閉じない',             r.closed===0, r.closed);
ok('🔴 足りないと教える',           !!r.alert && /保存できません/.test(r.alert.t), r.alert);
ok('🔴 どこがダメか名前で伝える',   !!r.alert && /入庫日/.test(r.alert.o.detail||''), r.alert);
r=await run({_draft:true,status:'reserved',boardId:'default',reserveDate:''},'_pitSaveInWorkGo(false)');
ok('受け皿：入庫日に今日が入る',    r.card.reserveDate===TODAY, r.card.reserveDate);
ok('受け皿：実入庫日も今日',        r.card.actualInAt===TODAY, r.card.actualInAt);
ok('受け皿：入れた旨を知らせる',    /今日/.test(r.toasts[0]), r.toasts);

/* 🟡 v1.76.0 国産/輸入は**黄（入れたほうがいい）**に落ちた＝1回聞いて、それでも進めば下の案内で止まる */
console.log('\n── ⑥ 国産/輸入が未選択 → 1回聞いて、進めても止めて教える ──');
r=await run({_draft:true,status:'reserved',boardId:null,reserveDate:PAST},'pitSaveInWork(false)');
ok('🟡 黄で1回聞く',             !!r.ask && /国産車／輸入車/.test(r.ask.o.detail||''), r.ask);
ok('保存しない（下書きのまま）', r.card._draft===true, r.card._draft);
ok('status を変えない',          r.card.status==='reserved', r.card.status);
ok('画面を閉じない',             r.closed===0, r.closed);
ok('アプリ内ダイアログで教える',  !!r.alert && /国産|輸入/.test((r.alert.t||'')+(r.alert.o&&r.alert.o.detail||'')), r.alert);
ok('🟡「入力に戻る」を選べば保存に進まない', await (async()=>{
  await p.evaluate(d=>{ window.__reset({_draft:true,status:'reserved',boardId:'default',reserveDate:d,menu:''}); window.__askAnswer=false; }, PAST);
  await p.evaluate(()=>{ pitSaveInWork(false); }); await p.waitForTimeout(80);
  return p.evaluate(()=>window.__card()._draft===true && window.__closed===0);
})());

console.log('\n── ⑤-2 赤が足りない時は「すべての保存」で止まる（ゆうた指定） ──');
for (const [label,fn] of [['予約保存のみ','pitSaveCard()'],['仮予約で保存','pitSaveTentative()'],['印刷して保存','pitSaveAndPrint()'],['入庫中に保存','pitSaveInWork(false)']]){
  r=await run({_draft:true,status:'reserved',boardId:'default',reserveDate:TODAY,car:'ノート',kana:''},fn);
  ok(label+'：赤（カナ）で止まる', r.card._draft===true && r.closed===0 && !!r.alert && /保存できません/.test(r.alert.t), {d:r.card._draft,c:r.closed,a:r.alert&&r.alert.t});
}

console.log('\n── ⑦ 表紙印刷のみ（刷るだけ・保存しない・画面に残る） ──');
r=await run({_draft:true,status:'reserved',boardId:'default',reserveDate:TODAY},'pitPrintCoverOnly()');
ok('印刷した',                r.printed.length===1, r.printed);
ok('下書きのまま＝保存しない', r.card._draft===true, r.card._draft);
ok('画面を閉じない',           r.closed===0, r.closed);
ok('status を変えない',        r.card.status==='reserved', r.card.status);
ok('保存していないと伝える',   /保存はしていません/.test(r.toasts[0]||''), r.toasts);

console.log('\n── ⑧ 予約保存のみ／仮予約で保存（今までどおり） ──');
r=await run({_draft:true,status:'reserved',boardId:'default',reserveDate:TODAY},'pitSaveCard()');
ok('予約保存のみ：下書きが外れる', r.card._draft===undefined, r.card._draft);
ok('予約保存のみ：status は予約のまま', r.card.status==='reserved', r.card.status);
ok('予約保存のみ：閉じる', r.closed===1, r.closed);
r=await run({_draft:true,status:'reserved',boardId:'default',reserveDate:TODAY},'pitSaveTentative()');
ok('仮予約：tentative が立つ', r.card.tentative===true, r.card.tentative);
ok('仮予約：下書きが外れる',   r.card._draft===undefined, r.card._draft);
ok('仮予約：status は予約のまま', r.card.status==='reserved', r.card.status);

/* ===================================================================
   🔁 v2.87.0（ゆうた指定 2026-09-09）印刷して保存して、この車でもう1件
   -------------------------------------------------------------------
   見ているのは＝1枚目はふつうに刷って保存されるか／2枚目が続けて開くか／
   引き継ぐ欄と、わざと空にする欄／2枚がつながっていないこと／
   🔴 **関門で止まったら2枚目を開かないこと**（ここが一番大事）。
   =================================================================== */
console.log('\n── ⑩ 印刷して保存して、この車でもう1件（v2.87.0） ──');
const SRC = { _draft:true, status:'reserved', boardId:'default', division:'d1',
  customer:'田中 太郎', sei:'田中', mei:'太郎', kana:'タナカ タロウ', seiKana:'タナカ', meiKana:'タロウ',
  tel:'090-1111-2222', contacts:[{tel:'090-1111-2222',label:'個人携帯',primary:true}],
  karteNo:'1234', maker:'トヨタ', car:'アクアGz', plate:'松戸 500 す 8230', drive:['low'],
  repeat:'repeater', customerId:'cust1', frontStaff:'吉田', reserveStaff:'小林',
  /* ⚠ 車検にすると「諸費用」が赤になって関門で止まる＝ここでは油脂類で試す（関門そのものは下で別に試す） */
  workType:'oil', workAddons:['bp'],
  /* ここから下は「引き継がない」ことを確かめるための、わざと入れてある分 */
  reserveDate:PAST, reserveTime:'10:00', dropType:'wait', consult:true, memo:'相談で来店',
  needLoaner:true, loanerId:'L1', loanerFrom:PAST, loanerTo:PAST,
  estAmount:120000, estHoldDays:3, returnDate:PAST, tentative:false };

const runNext = async (setup, fn) => {
  await p.evaluate(c=>{ window.__reset(c); }, setup);
  await p.evaluate(f=>{ eval(f); }, fn);
  await p.waitForTimeout(80);
  return p.evaluate(()=>({ card:window.__card(), next:window.__next(), n:state.cards.length,
    closed:window.__closed, printed:window.__printed, opened:window.__opened,
    toasts:window.__toasts, logs:window.__logs, flow:window.__flow, alert:window.__alert, ask:window.__ask }));
};

let x = await runNext(SRC, 'pitSaveAndPrintNext()');
console.log('   ', JSON.stringify({n:x.n, printed:x.printed, opened:x.opened, closed:x.closed, alert:x.alert, ask:x.ask}));
ok('1枚目：表紙を刷った',              x.printed.length===1 && x.printed[0]==='c1', x.printed);
ok('1枚目：下書きが外れる＝保存される', x.card._draft===undefined, x.card._draft);
ok('1枚目：フローに「表紙を印刷して保存」', x.flow.some(l=>/表紙を印刷して保存/.test(l)), x.flow);
ok('1枚目：前の画面へ戻る（closeDetail）', x.closed===1, x.closed);
ok('🔴 2枚目ができた（合計2枚）',       x.n===2, x.n);
ok('🔴 2枚目が全画面で開く',           x.opened.length===1 && x.opened[0].mode==='page', x.opened);
ok('🔴 開いたのは2枚目（1枚目ではない）', x.opened.length===1 && x.opened[0].id===x.next.id && x.next.id!=='c1', {o:x.opened,id:x.next&&x.next.id});
ok('2枚目は下書き＝押すまで予約にならない', x.next._draft===true, x.next._draft);
ok('続けて入力してほしいと伝える',       x.toasts.some(t=>/次の予約を入力/.test(t)), x.toasts);

console.log('\n   ▸ 引き継ぐもの（ゆうた指定 2026-09-09）');
for (const [label,key] of [['お客様名','customer'],['姓','sei'],['名','mei'],['カナ','kana'],
  ['TEL','tel'],['初回／リピーター','repeat'],['お客様の紐づけ','customerId'],
  ['カルテNo.','karteNo'],['メーカー','maker'],['車種','car'],['ナンバー','plate'],
  ['作業タイプ','workType'],['国産／輸入','boardId'],['課','division'],
  ['フロント担当','frontStaff'],['予約担当','reserveStaff']]){
  ok('引き継ぐ：'+label, JSON.stringify(x.next[key])===JSON.stringify(SRC[key]), {n:x.next[key],s:SRC[key]});
}
ok('引き継ぐ：その他連絡先', JSON.stringify(x.next.contacts)===JSON.stringify(SRC.contacts), x.next.contacts);
ok('引き継ぐ：車両注意',     JSON.stringify(x.next.drive)===JSON.stringify(SRC.drive), x.next.drive);
ok('引き継ぐ：併用可',       JSON.stringify(x.next.workAddons)===JSON.stringify(SRC.workAddons), x.next.workAddons);

console.log('\n   ▸ わざと空にするもの');
ok('🔴 相談の印は引き継がない', x.next.consult===false, x.next.consult);
ok('受付タイプは空',            !x.next.dropType, x.next.dropType);
ok('入庫時刻は空',              x.next.reserveTime==='', x.next.reserveTime);
ok('作業内容は空',              x.next.menu==='', x.next.menu);
ok('メモは空',                  x.next.memo==='', x.next.memo);
ok('代車は付いてこない',        x.next.needLoaner===false, x.next.needLoaner);
ok('🔴 使用代車・貸出の期間も付いてこない', !x.next.loanerId && !x.next.loanerFrom && !x.next.loanerTo,
   {i:x.next.loanerId,f:x.next.loanerFrom,t:x.next.loanerTo});
ok('概算 金額は空',             x.next.estAmount===null, x.next.estAmount);
ok('概算 日数は空',             x.next.estHoldDays==='', x.next.estHoldDays);
ok('返車予定日は空',            x.next.returnDate==='', x.next.returnDate);
ok('仮予約の印は立っていない',  x.next.tentative===false, x.next.tentative);
ok('🔴 入庫日は今日（前の日付を持ってこない）', x.next.reserveDate===TODAY, x.next.reserveDate);
ok('状態は予約',                x.next.status==='reserved', x.next.status);

console.log('\n   ▸ 2枚はつながっていない');
ok('🔴 予約番号は別々',        !!x.next.resNo && x.next.resNo!==x.card.resNo, {a:x.card.resNo,b:x.next.resNo});
ok('🔴 相手を指す印を持たない', !Object.keys(x.next).some(k=>/pair|linkedCard|siblingId|fromCard/i.test(k)), Object.keys(x.next).filter(k=>/pair|link|sibling|from/i.test(k)));
ok('1枚目にも相手の印は付かない', !Object.keys(x.card).some(k=>/pair|linkedCard|siblingId|nextCard/i.test(k)), Object.keys(x.card).filter(k=>/pair|link|sibling|next/i.test(k)));
ok('🔴 連絡先は写し＝2枚目を直しても1枚目は変わらない', await p.evaluate(()=>{
  const a=state.cards[0], b=state.cards[1];
  if (!b.contacts) return false;
  b.contacts[0].tel='080-9999-9999';
  return a.contacts[0].tel==='090-1111-2222';
}));

console.log('\n   ▸ 🔴 関門で止まったら2枚目を開かない');
x = await runNext(Object.assign({}, SRC, {kana:'', seiKana:'', meiKana:''}), 'pitSaveAndPrintNext()');
ok('🔴 赤（カナ）で止まる',       !!x.alert && /保存できません/.test(x.alert.t), x.alert&&x.alert.t);
ok('🔴 1枚目は下書きのまま',      x.card._draft===true, x.card._draft);
ok('🔴 刷らない',                 x.printed.length===0, x.printed);
ok('🔴 画面を閉じない',           x.closed===0, x.closed);
ok('🔴🔴 2枚目を開かない（1枚のまま）', x.n===1 && x.opened.length===0, {n:x.n,o:x.opened});

console.log('\n   ▸ 🟡 黄で「入力に戻る」を選んだら、そこで終わり');
await p.evaluate(s=>{ window.__reset(Object.assign({},s,{reserveTime:''})); window.__askAnswer=false; }, SRC);
await p.evaluate(()=>{ pitSaveAndPrintNext(); }); await p.waitForTimeout(100);
ok('🟡 保存しない・刷らない・2枚目も開かない', await p.evaluate(()=>
  state.cards[0]._draft===true && window.__printed.length===0 && window.__closed===0 && state.cards.length===1 && window.__opened.length===0));

console.log('\n── ⑨ メニューから選ぶと閉じる ──');
await p.evaluate(()=>window.__reset({_draft:true,status:'reserved',boardId:'default',reserveDate:'2026-08-04'}));
await p.click('#cs-menu-btn');
await p.evaluate(()=>Array.from(document.querySelectorAll('#cs-menu-panel .vh-mi')).find(x=>/予約保存のみ/.test(x.textContent)).click());
await p.waitForTimeout(80);
ok('選んだらメニューが閉じる', await p.evaluate(()=>getComputedStyle(document.getElementById('cs-menu-panel')).display)==='none');
ok('JSエラー0', errs.length===0, errs.slice(0,3));

await p.click('#cs-menu-btn'); await p.waitForTimeout(150);
await p.screenshot({path:'shot_save_menu.png'});
await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail?1:0);
