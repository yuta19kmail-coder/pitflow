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
  fs.writeFileSync(path.join(dir,'_save-part.js'), src.slice(from,to));

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
window.__reset=function(card){
  state.cards=[Object.assign({id:'c1'},card)]; _editingCardId='c1';
  window._pitLastSaveAt=0;   /* 🔴 v1.56.1 二度押しの見張りを毎回まっさらに（続けて試すので） */
  window.__closed=0; window.__printed=[]; window.__toasts=[]; window.__logs=[]; window.__flow=[]; window.__draftCleared=0; window.__alert=null;
};
window.__card=function(){ return state.cards[0]; };
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
ok('5つ・順番どおり', JSON.stringify(items)===JSON.stringify(['仮予約で保存','入庫中に印刷して保存','入庫中に保存のみ','予約保存のみ','表紙印刷のみ']), items);
ok('下に開く（ボタンより下）', await p.evaluate(()=>{
  const b=document.getElementById('cs-menu-btn').getBoundingClientRect();
  const q=document.getElementById('cs-menu-panel').getBoundingClientRect(); return q.top>=b.bottom-1; }));
await p.keyboard.press('Escape');
ok('Escで閉じる', await p.evaluate(()=>getComputedStyle(document.getElementById('cs-menu-panel')).display)==='none');
await p.click('#cs-menu-btn'); await p.mouse.click(5,380);
ok('外側クリックで閉じる', await p.evaluate(()=>getComputedStyle(document.getElementById('cs-menu-panel')).display)==='none');

const run=async (setup,fn)=>{ await p.evaluate(c=>window.__reset(c),setup); await p.evaluate(f=>{ eval(f); },fn); await p.waitForTimeout(60);
  return p.evaluate(()=>({card:window.__card(),closed:window.__closed,printed:window.__printed,toasts:window.__toasts,logs:window.__logs,flow:window.__flow,draft:window.__draftCleared,alert:window.__alert})); };

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

console.log('\n── ⑤ 入庫日が空 → 今日を入れる ──');
r=await run({_draft:true,status:'reserved',boardId:'default',reserveDate:''},'pitSaveInWork(false)');
ok('入庫日に今日が入る',      r.card.reserveDate===TODAY, r.card.reserveDate);
ok('実入庫日も今日',          r.card.actualInAt===TODAY, r.card.actualInAt);
ok('入れた旨を知らせる',      /今日/.test(r.toasts[0]), r.toasts);

console.log('\n── ⑥ 国産/輸入が未選択 → 止めて教える ──');
r=await run({_draft:true,status:'reserved',boardId:null,reserveDate:PAST},'pitSaveInWork(false)');
ok('保存しない（下書きのまま）', r.card._draft===true, r.card._draft);
ok('status を変えない',          r.card.status==='reserved', r.card.status);
ok('画面を閉じない',             r.closed===0, r.closed);
ok('アプリ内ダイアログで教える',  !!r.alert && /国産|輸入/.test(r.alert.t), r.alert);

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
