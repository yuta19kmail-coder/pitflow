/* PitFlow v1.18.0 ── ?card= でカードを直接開けるか（deeplink-pit.js 単体テスト）
   v2.118.0 ── ?fd= （FlowDesk のショートカット）も同じページで見る
     ・deeplink-pit.js だけを載せた小さなページで、待ち方・URLの後始末を確かめる
     ・PitFlow 本体は動かさない（state / PitDB / pitOpenCardDetail をにせ物で用意）

     python -m http.server 8936      （PitFlow のフォルダで・別ウィンドウ）
     node _見張り/test_deeplink.mjs                                             */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
const cp=chromePath();   /* 🧪 2026-09-13 場所は _chrome.mjs 1本（Windows でも走る） */
const b=await chromium.launch({executablePath:cp});
const PAGE='http://127.0.0.1:8936/_見張り/_deeplink_test.html';   /* 🧪 v2.118.0 置き場を _見張り に合わせた（前は消えたページを見ていて途中で止まっていた） */
let pass=0,fail=0; const ok=(n,c,x='')=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x?' → '+x:''));} };

// ① 遅れて届くカードでも開ける
let p=await b.newPage();
await p.goto(PAGE+'?card=c99&x=1');
await p.waitForTimeout(600);
ok('カードが未着のうちは開かない', (await p.evaluate(()=>window.__opened.length))===0);
await p.evaluate(()=>{ state.cards=[{id:'c99'}]; PitDB._loaded=true; });
await p.waitForTimeout(600);
ok('届いた瞬間に開く', (await p.evaluate(()=>window.__opened))[0]==='c99');
ok('?card= がURLから消える', !(await p.evaluate(()=>location.search)).includes('card='), await p.evaluate(()=>location.search));
ok('他のパラメータは残る', (await p.evaluate(()=>location.search)).includes('x=1'), await p.evaluate(()=>location.search));
await p.close();

// ② ログイン画面が出ている間は待つ
p=await b.newPage();
await p.goto(PAGE+'?card=c1');
await p.evaluate(()=>{ document.getElementById('pit-login').style.display='block'; state.cards=[{id:'c1'}]; PitDB._loaded=true; });
await p.waitForTimeout(700);
ok('ログイン中は開かない', (await p.evaluate(()=>window.__opened.length))===0);
await p.evaluate(()=>{ document.getElementById('pit-login').style.display='none'; });
await p.waitForTimeout(600);
ok('ログイン後に開く', (await p.evaluate(()=>window.__opened.length))===1);
await p.close();

// ③ 読み込み済みなのに無いIDは、そっと知らせて終わる
p=await b.newPage();
await p.goto(PAGE+'?card=nope');
await p.evaluate(()=>{ state.cards=[{id:'c1'}]; PitDB._loaded=true; });
await p.waitForTimeout(700);
ok('無いIDでは開かない', (await p.evaluate(()=>window.__opened.length))===0);
ok('見つからない旨を知らせる', (await p.evaluate(()=>window.__toasts||[])).some(t=>/見つかりません/.test(t)));
await p.close();

// ④ ?card= が無ければ何もしない
p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(PAGE);
await p.waitForTimeout(500);
ok('パラメータ無しでは無反応・エラー0', (await p.evaluate(()=>window.__opened.length+window.__fd.length))===0 && errs.length===0, errs.join('|'));
await p.close();

// ⑤ ?fd=new-reserve … 入るまで待つ → 1回だけ動く → ?fd= だけ消える（# は残る）
p=await b.newPage();
await p.goto(PAGE+'?fd=new-reserve&x=1#/availcal');
await p.evaluate(()=>{ document.getElementById('pit-login').style.display='block'; });
await p.waitForTimeout(700);
ok('fd：ログイン画面の間は動かない', (await p.evaluate(()=>window.__fd.length))===0);
await p.evaluate(()=>{ document.getElementById('pit-login').style.display='none'; });
await p.waitForTimeout(700);
ok('fd：ログインしてもまだ入っていない印（pit-authed）が無ければ動かない', (await p.evaluate(()=>window.__fd.length))===0);
await p.evaluate(()=>{ document.body.classList.add('pit-authed'); state.currentView='availcal'; });
await p.waitForTimeout(700);
ok('fd：入ったら新規予約が開く（画面の後）', JSON.stringify(await p.evaluate(()=>window.__fd))==='["new-reserve:availcal"]', JSON.stringify(await p.evaluate(()=>window.__fd)));
ok('fd：?fd= がURLから消える', !(await p.evaluate(()=>location.search)).includes('fd='), await p.evaluate(()=>location.search));
ok('fd：他のパラメータは残る', (await p.evaluate(()=>location.search)).includes('x=1'));
ok('fd：# の画面は残る', (await p.evaluate(()=>location.hash))==='#/availcal', await p.evaluate(()=>location.hash));
await p.waitForTimeout(700);
ok('fd：2回は動かない', (await p.evaluate(()=>window.__fd.length))===1);
await p.close();

// ⑥ 本番（PIT_CLOUD）はデータ読み込みまで待つ／new-customer
p=await b.newPage();
await p.goto(PAGE+'?fd=new-customer');
await p.evaluate(()=>{ window.PIT_CLOUD=true; document.body.classList.add('pit-authed'); });
await p.waitForTimeout(700);
ok('fd：本番はデータが来るまで動かない', (await p.evaluate(()=>window.__fd.length))===0);
await p.evaluate(()=>{ PitDB._loaded=true; });
await p.waitForTimeout(700);
ok('fd：データが来たら新規顧客登録が開く', JSON.stringify(await p.evaluate(()=>window.__fd))==='["new-customer"]');
ok('fd：URLがきれいになる', (await p.evaluate(()=>location.search))==='', await p.evaluate(()=>location.search));
await p.close();

// ⑦ 知らない値は無視（URLも触らない）
p=await b.newPage();
const errs2=[]; p.on('pageerror',e=>errs2.push(String(e)));
await p.goto(PAGE+'?fd=delete-all');
await p.evaluate(()=>{ document.body.classList.add('pit-authed'); });
await p.waitForTimeout(700);
ok('fd：知らない値では何も動かない・エラー0', (await p.evaluate(()=>window.__fd.length))===0 && errs2.length===0, errs2.join('|'));
await p.close();

await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail?1:0);
