/* PitFlow v1.18.0 ── ?card= でカードを直接開けるか（deeplink-pit.js 単体テスト）
     ・deeplink-pit.js だけを載せた小さなページで、待ち方・URLの後始末を確かめる
     ・PitFlow 本体は動かさない（state / PitDB / pitOpenCardDetail をにせ物で用意）

     python3 -m http.server 8936      （このフォルダで・別ウィンドウ）
     node test_deeplink.mjs                                                     */
import { chromium } from 'playwright';
import fs from 'fs';
const cp=['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p=>fs.existsSync(p));
const b=await chromium.launch({executablePath:cp});
let pass=0,fail=0; const ok=(n,c,x='')=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x?' → '+x:''));} };

// ① 遅れて届くカードでも開ける
let p=await b.newPage();
await p.goto('http://127.0.0.1:8936/_deeplink_test.html?card=c99&x=1');
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
await p.goto('http://127.0.0.1:8936/_deeplink_test.html?card=c1');
await p.evaluate(()=>{ document.getElementById('pit-login').style.display='block'; state.cards=[{id:'c1'}]; PitDB._loaded=true; });
await p.waitForTimeout(700);
ok('ログイン中は開かない', (await p.evaluate(()=>window.__opened.length))===0);
await p.evaluate(()=>{ document.getElementById('pit-login').style.display='none'; });
await p.waitForTimeout(600);
ok('ログイン後に開く', (await p.evaluate(()=>window.__opened.length))===1);
await p.close();

// ③ 読み込み済みなのに無いIDは、そっと知らせて終わる
p=await b.newPage();
await p.goto('http://127.0.0.1:8936/_deeplink_test.html?card=nope');
await p.evaluate(()=>{ state.cards=[{id:'c1'}]; PitDB._loaded=true; });
await p.waitForTimeout(700);
ok('無いIDでは開かない', (await p.evaluate(()=>window.__opened.length))===0);
ok('見つからない旨を知らせる', (await p.evaluate(()=>window.__toasts||[])).some(t=>/見つかりません/.test(t)));
await p.close();

// ④ ?card= が無ければ何もしない
p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://127.0.0.1:8936/_deeplink_test.html');
await p.waitForTimeout(500);
ok('パラメータ無しでは無反応・エラー0', (await p.evaluate(()=>window.__opened.length))===0 && errs.length===0, errs.join('|'));
await p.close();
await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail?1:0);
