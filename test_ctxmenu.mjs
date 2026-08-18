/* PitFlow v1.20.0 ── 右クリックメニューのテスト
   -------------------------------------------------------------------
   ◎考え方
     PitFlow 本体は動かさない。**実マークアップと同じ目印だけを並べた小さなページ**を
     その場で組み立てて、本物の ctxmenu-pit.js を動かして確かめる。
     ⚠ ここで使っている目印（data-card-id / tr.ct-clickrow の onclick="custOpen(...)" など）が
        本体と食い違ったら、右クリックが効かなくなる＝このテストが落ちる。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8942      ← 別ウィンドウ
     node test_ctxmenu.mjs                                                  */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/* ---- 試験台を組み立てる ---- */
(function build(){
  const dir = process.cwd();
  const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="css/card-view.css">
<style>
:root{--bg:#12161f;--bg2:#161c28;--bg3:#1e2634;--border:#2b3547;--text:#dbe3ef;--text2:#93a2bb;--text3:#63718a;--brand:#1db97a}
body{margin:0;background:var(--bg);color:var(--text);font-family:sans-serif;padding:16px}
.box{border:1px solid var(--border);padding:10px;margin:8px 0;border-radius:8px}
</style><body>
<div class="box"><div class="pit-card" data-card-id="c1" draggable="true">予約中カード（田中／ノート）</div></div>
<div class="box"><div class="pit-card" data-card-id="c2">作業中カード（鈴木／320i）</div></div>
<div class="box"><div class="pit-card" data-card-id="c3">返車済みカード（森／アクア）</div></div>
<div class="box"><div class="bn-note" data-note-id="n1">付箋</div></div>
<div class="box"><span class="lo-badge" data-aid="a1" data-card-id="c1">代車の貸出バッジ</span></div>
<table class="box"><tr class="ct-clickrow" onclick="custOpen('cu1')"><td>顧客の行（山田）</td></tr></table>
<div class="box"><div class="fl-row fl-row-click" onclick="fleetOpenDetail('v1')">車両の行</div></div>
<div class="box"><div class="reserve-month-day" data-drop="reserveDate" data-drop-val="2026-08-10">予約カレンダーの日</div></div>
<div class="box"><div class="cfs-day" data-ds="2026-08-11">空き状況の日</div></div>
<div class="box" id="plain">ただの余白（標準メニューのまま）</div>
<div class="box"><input id="inp" value="入力欄（標準のまま）"></div>
<script src="js/coreflow-icons.js"><\/script>
<script>
window.ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
window.__acts=[]; window.__toasts=[]; window.__opened=[]; window.__copied=[];
window.state={ currentView:'task', settings:{},
  cards:[
    {id:'c1',status:'reserved',boardId:'default',customer:'田中 太郎',car:'ノート',maker:'日産',plate:'品川 300 あ 12-34',tel:'090-1111-2222'},
    {id:'c2',status:'estim',boardId:'import',customer:'鈴木 次郎',car:'320i',urgent:true},
    {id:'c3',status:'returned',boardId:'default',customer:'森 三郎',car:'アクア'}
  ],
  customers:[{id:'cu1',name:'山田 花子',kana:'ヤマダ ハナコ',tel:'080-3333-4444'}],
  loaners:[{id:'v1',name:'1 タント',plate:'習志野 500 あ 55-55'}], companyCars:[],
  boards:[{id:'default',name:'国産車',cols:[{id:'check',name:'点検待ち'},{id:'estim',name:'見積り中'},{id:'contact',name:'連絡中'},{id:'parts',name:'パーツ待ち'},{id:'work',name:'作業待ち'},{id:'workDone',name:'作業完了済',terminal:true},{id:'scrap',name:'廃車',side:true}]},
          {id:'import',name:'輸入車',cols:[{id:'check',name:'点検待ち'},{id:'estim',name:'見積り中'},{id:'contact',name:'連絡中'},{id:'parts',name:'パーツ待ち'},{id:'work',name:'作業待ち'},{id:'workDone',name:'作業完了済',terminal:true}]}]
};
window.pitSurname=n=>String(n||'').trim().split(' ')[0];
window.pitToast=m=>window.__toasts.push(m);
window.openDetail=id=>window.__acts.push('openDetail:'+id);
window.custOpen=id=>window.__acts.push('custOpen:'+id);
window.fleetOpenDetail=id=>window.__acts.push('fleetOpenDetail:'+id);
window.loBadgeDetail=id=>window.__acts.push('loBadgeDetail:'+id);
window.openBoardNoteModal=id=>window.__acts.push('note:'+id);
window.pitPrintCover=id=>window.__acts.push('print:'+id);
window.pitGotoReserveDate=d=>window.__acts.push('gotoDate:'+d);
window.pitTodayCheckIn=id=>{ const c=state.cards.find(x=>x.id===id); if(c){c.status='check';} window.__acts.push('checkIn:'+id); };
window.pitTodayReturn=id=>{ const c=state.cards.find(x=>x.id===id); if(c){c.status='returned';} window.__acts.push('return:'+id); };
window.openNewReserve=()=>{ const c={id:'new1',_draft:true,status:'reserved'}; state.cards.push(c); window.__acts.push('newReserve'); };
window.renderCardForm=()=>{};
window.showView=v=>window.__acts.push('showView:'+v);
window.PitDB={save:()=>window.__acts.push('save')};
window.logFlow=()=>{}; window.pitLog=(a,o)=>window.__acts.push('log:'+a);
window.open=(u)=>{ window.__opened.push(u); return null; };
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{ writeText:t=>{ window.__copied.push(t); return Promise.resolve(); } }});
window.__reset=()=>{ window.__acts=[]; window.__toasts=[]; window.__opened=[]; window.__copied=[]; };
<\/script>
<script src="js/board-line.js"><\/script>
<script src="js/ctxmenu-pit.js"><\/script>
<script>window.__ready=1;<\/script>`;
  fs.writeFileSync(path.join(dir,'test-ctx.html'), page);
})();

const cp=['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p=>fs.existsSync(p));
let pass=0,fail=0;
const ok=(n,c,x='')=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==''?'  → '+JSON.stringify(x):''));} };
const b=await chromium.launch({executablePath:cp});
const p=await b.newPage({viewport:{width:1200,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
p.on('console',m=>{ if(m.type()==='error'&&!/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:8942/test-ctx.html'); await p.waitForFunction('window.__ready===1');

const rc=async(sel,mod)=>{ await p.evaluate(()=>{window.pitCtxClose&&window.pitCtxClose(); window.__reset();}); await p.click(sel,{button:'right',modifiers:mod||[]}); await p.waitForTimeout(90); };
const menu=()=>p.evaluate(()=>{ const m=document.getElementById('pit-ctx'); if(!m) return null;
  return { title:(m.querySelector('.pcx-title')||{}).textContent||'',
           items:Array.from(m.querySelectorAll('.pcx-i')).map(x=>({t:x.querySelector('b').textContent, off:x.classList.contains('is-off'), sub:x.classList.contains('has-sub')})) }; });
const clickItem=t=>p.evaluate(t=>{ const b=Array.from(document.querySelectorAll('#pit-ctx .pcx-i')).find(x=>x.querySelector('b').textContent===t); if(b) b.click(); }, t);
const clickSub=t=>p.evaluate(t=>{ const b=Array.from(document.querySelectorAll('#pit-ctx-sub .pcx-i')).find(x=>x.querySelector('b').textContent===t); if(b) b.click(); }, t);

console.log('\n── ① 対象の上で出る／余白では出ない ──');
await rc('#plain');   ok('ただの余白では出ない（標準のまま）', await menu()===null);
await rc('#inp');     ok('入力欄では出ない（コピー/貼り付けを残す）', await menu()===null);
await rc('[data-card-id="c1"]'); let m=await menu();
ok('カードの上で出る', !!m);
ok('見出しが 顧客名＋車種', /田中 様/.test(m.title)&&/ノート/.test(m.title), m.title);

console.log('\n── ② Shift＋右クリックは標準に逃がす ──');
await rc('[data-card-id="c1"]',['Shift']);
ok('Shift＋右クリックでは出ない', await menu()===null);

console.log('\n── ③ カードのメニュー（状態で出し分け） ──');
await rc('[data-card-id="c1"]'); m=await menu();
console.log('   予約中:',JSON.stringify(m.items.map(x=>x.t)));
ok('予約中：入庫済みにする が出る', m.items.some(x=>x.t==='入庫済みにする'));
ok('詳細を開く／別タブ／表紙を印刷 がある', ['詳細を開く','別タブで開く','表紙を印刷'].every(t=>m.items.some(x=>x.t===t)));
ok('コピー が子メニュー', m.items.some(x=>x.t==='コピー'&&x.sub));

await rc('[data-card-id="c2"]'); m=await menu();
console.log('   作業中:',JSON.stringify(m.items.map(x=>x.t)));
ok('作業中：入庫済みにする は出ない', !m.items.some(x=>x.t==='入庫済みにする'));

await rc('[data-card-id="c3"]'); m=await menu();
ok('返車済み：入庫済みにする は出ない', !m.items.some(x=>x.t==='入庫済みにする'), m.items.map(x=>x.t));

/* 🔴 v1.96.0（ゆうた指定）右クリックから外した3つ。どの状態のカードでも二度と出さない。
   ・返車済みにする … 実績（確定売上）に固まる、取り返しのつきにくい操作
   ・工程を変える   … カードをドラッグする、が本来のやり方
   ・急ぎにする     … カードの詳細から付け外しする                       */
console.log('\n── ③-2 🔴 右クリックから外した3つ（どのカードでも出ない） ──');
for (const [id,name] of [['c1','予約中'],['c2','作業中'],['c3','返車済み']]){
  await rc(`[data-card-id="${id}"]`); m=await menu();
  const ng=m.items.filter(x=>/返車済みにする|工程を変える|急ぎ/.test(x.t)).map(x=>x.t);
  ok(`${name}：返車済みにする／工程を変える／急ぎ が出ない`, ng.length===0, {出た:ng, 全部:m.items.map(x=>x.t)});
  const dbl=await p.evaluate(()=>{
    const kids=Array.from(document.getElementById('pit-ctx').children);
    return kids.some((el,i)=>i>0&&el.classList.contains('pcx-sep')&&kids[i-1].classList.contains('pcx-sep'));
  });
  ok(`${name}：区切り線が二本並んでいない`, dbl===false, dbl);
}
{
  const src=fs.readFileSync('js/ctxmenu-pit.js','utf8');
  ok('🔴 元のコードごと消えている（コメント以外に残っていない）',
     !/label:\s*'返車済みにする'/.test(src) && !/label:\s*'工程を変える'/.test(src) && !/'急ぎにする'/.test(src), '');
}

console.log('\n── ④ 実際に押す ──');
await rc('[data-card-id="c1"]'); await clickItem('詳細を開く'); await p.waitForTimeout(60);
ok('詳細を開く→openDetail', (await p.evaluate(()=>window.__acts)).includes('openDetail:c1'));
ok('押したらメニューが閉じる', await menu()===null);

await rc('[data-card-id="c1"]'); await clickItem('別タブで開く'); await p.waitForTimeout(60);
ok('別タブ→?card= のURL', /pitflow\.kobayashi-motors\.com\/\?card=c1$/.test((await p.evaluate(()=>window.__opened))[0]||''), await p.evaluate(()=>window.__opened));

await rc('[data-card-id="c1"]'); await clickItem('入庫済みにする'); await p.waitForTimeout(80);
let acts=await p.evaluate(()=>window.__acts);
ok('入庫済み→pitTodayCheckIn＋画面の描き直し', acts.includes('checkIn:c1')&&acts.some(a=>a.startsWith('showView')), acts);

/* ⑤「工程を変える」の子メニューの試験は v1.96.0 で役目を終えた（メニューごと外したため）。
   子メニューの仕組み自体は下の「コピー」で見張っている。 */

console.log('\n── ⑥ コピー ──');
await rc('[data-card-id="c1"]');
await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('#pit-ctx .pcx-i')).find(x=>x.querySelector('b').textContent==='コピー'); b.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); });
await p.waitForTimeout(90);
const cp2=await p.evaluate(()=>Array.from(document.querySelectorAll('#pit-ctx-sub .pcx-i')).map(x=>x.querySelector('b').textContent));
ok('コピーの中身5つ', JSON.stringify(cp2)===JSON.stringify(['顧客名','ナンバー','電話番号','メーカー・車種','このカードのURL']), cp2);
await clickSub('ナンバー'); await p.waitForTimeout(90);
ok('ナンバーがコピーされる', (await p.evaluate(()=>window.__copied))[0]==='品川 300 あ 12-34', await p.evaluate(()=>window.__copied));

console.log('\n── ⑦ カード以外の対象 ──');
await rc('[data-note-id="n1"]'); m=await menu(); ok('付箋', !!m&&m.items[0].t==='付箋を開く', m&&m.items.map(x=>x.t));
await rc('[data-aid="a1"]');    m=await menu(); ok('代車の貸出＋紐づく予約カード', !!m&&m.items.length===2, m&&m.items.map(x=>x.t));
await rc('tr.ct-clickrow');     m=await menu();
ok('顧客の行（onclickからID取得）', !!m&&m.items[0].t==='顧客詳細を開く', m&&m.items.map(x=>x.t));
ok('顧客名が見出しに出る', /山田/.test(m.title), m.title);
await clickItem('顧客詳細を開く'); await p.waitForTimeout(60);
ok('顧客を開ける', (await p.evaluate(()=>window.__acts)).includes('custOpen:cu1'));
await rc('.fl-row-click');      m=await menu(); ok('車両の行', !!m&&m.items[0].t==='車両を開く', m&&m.items.map(x=>x.t));
await rc('[data-drop-val="2026-08-10"]'); m=await menu();
console.log('   日:',JSON.stringify(m&&m.items.map(x=>x.t)));
ok('予約カレンダーの日', !!m&&m.items.some(x=>x.t==='この日で新規予約'));
await clickItem('この日で新規予約'); await p.waitForTimeout(80);
ok('その日で新規予約が開く', await p.evaluate(()=>{ const d=state.cards.filter(x=>x._draft); return d.length&&d[d.length-1].reserveDate==='2026-08-10'; }));
await rc('.cfs-day[data-ds="2026-08-11"]'); m=await menu(); ok('空き状況の日', !!m&&m.items.some(x=>x.t==='この日の予約カレンダーへ'));

/* ===================================================================
   ⑦-2 🔴 v1.133.0（ゆうた指摘）「この下にラインを入れる」はタスク看板だけ
   -------------------------------------------------------------------
   🗣「右クリメニューも『ラインを引く』とかタスクビューでしか使えないのとかでてるよ」
   区切りラインは**タスク看板の列の中にしか無い**。当日ビューや検索結果で押しても
   線はその画面に出ない＝何も起きていないように見える。だからメニューに出さない。
   =================================================================== */
console.log('\n── ⑦-2 区切りラインはタスク看板だけ ──');
const setView = v => p.evaluate(v => { state.currentView = v; }, v);
const hasLine = async sel => { await rc(sel); const mm = await menu(); return !!(mm && mm.items.some(x=>x.t==='この下にラインを入れる')); };

await setView('task');
ok('看板（統合）＋作業中カード：出る', await hasLine('[data-card-id="c2"]'));
await setView('course1');
ok('看板（1課）：出る', await hasLine('[data-card-id="c2"]'));
await setView('course2');
ok('看板（2課）：出る', await hasLine('[data-card-id="c2"]'));

for (const v of ['today','return','reserve','loaner','parking','floor','result','search','dashboard','customers','availcal','shakencal']){
  await setView(v);
  ok(`${v} ビュー：出ない`, (await hasLine('[data-card-id="c2"]'))===false);
}

await setView('task');
/* ⚠ c1 は ④で「入庫済みにする」を押しているので status が check になっている。予約中に戻してから見る。 */
await p.evaluate(()=>{ state.cards.find(x=>x.id==='c1').status='reserved'; });
ok('看板でも予約中のカードには出ない', (await hasLine('[data-card-id="c1"]'))===false);
ok('看板でも返車済みのカードには出ない', (await hasLine('[data-card-id="c3"]'))===false);
await p.evaluate(()=>{ state.cards.find(x=>x.id==='c2').returnStage='callWait'; });
ok('完TELを通った車には出ない（盤面から外れている）', (await hasLine('[data-card-id="c2"]'))===false);
await p.evaluate(()=>{ delete state.cards.find(x=>x.id==='c2').returnStage; });

{
  const src=fs.readFileSync('js/ctxmenu-pit.js','utf8');
  ok('🔴 出す条件が ctxmenu 側に書き戻されていない（board-line.js の1本）',
     !/PitBoardLine[\s\S]{0,120}status/.test(src) && /PitBoardLine\.ctxItem/.test(src), '');
}

console.log('\n── ⑧ 閉じ方 ──');
await rc('[data-card-id="c1"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(60);
ok('Escで閉じる', await menu()===null);
await rc('[data-card-id="c1"]'); await p.mouse.click(1150,880); await p.waitForTimeout(60);
ok('外側クリックで閉じる', await menu()===null);
await rc('[data-card-id="c1"]'); await p.evaluate(()=>window.dispatchEvent(new Event('resize'))); await p.waitForTimeout(60);
ok('画面サイズ変更で閉じる', await menu()===null);

console.log('\n── ⑨ 画面のはみ出し ──');
await p.evaluate(()=>{ const d=document.querySelector('[data-card-id="c1"]'); d.style.position='fixed'; d.style.right='2px'; d.style.bottom='2px'; d.style.left='auto'; });
await p.click('[data-card-id="c1"]',{button:'right'}); await p.waitForTimeout(90);
const fit=await p.evaluate(()=>{ const m=document.getElementById('pit-ctx'); const r=m.getBoundingClientRect();
  return { r:Math.round(r.right), b:Math.round(r.bottom), vw:innerWidth, vh:innerHeight }; });
ok('右下でも画面内に収まる', fit.r<=fit.vw&&fit.b<=fit.vh, fit);
ok('JSエラー0', errs.length===0, errs.slice(0,3));

await p.evaluate(()=>{ const d=document.querySelector('[data-card-id="c1"]'); d.style.cssText=''; });
await p.click('[data-card-id="c2"]',{button:'right'}); await p.waitForTimeout(120);
await p.screenshot({path:'shot_ctxmenu.png'});
await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail?1:0);
