// ============================================================
// test_nav.mjs  ―  ブラウザの「戻る」の見張り（共通部品 js/coreflow-nav.js）
//   PitFlow に置いてあるが、中身は **全アプリ共通の部品** を試している。
//   本物のアプリではなく、同じ形の小さな画面（_test_nav.html）で
//   「権限で追い返される」「下書きがあって離れない」まで再現して確かめる。
//
//   使い方： python3 -m http.server 8952 --directory .  →  PORT=8952 node test_nav.mjs
// ============================================================
import { chromium } from 'playwright';
import fs from 'fs';
/* 🔴 2026-08-21 ここだけ `chromium.launch()` を素で呼んでいたので、
   ブラウザの置き場所が見つからず **この見張りだけずっと動いていなかった**（NGですらなく起動失敗）。
   ほかの見張りと同じ探し方にそろえる。 */
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(x => fs.existsSync(x));
const PORT = process.env.PORT || 8952;
/* 🔴 `localhost` だと環境によって IPv6(::1) を先に見に行き、
   IPv4 でだけ待っているサーバに繋がらない。ほかの見張りと同じ 127.0.0.1 にそろえる。 */
const BASE = `http://127.0.0.1:${PORT}`;
const b = await chromium.launch({ executablePath: cp }); const ctx = await b.newContext(); const p = await ctx.newPage();
let ok=0,ng=0;
const t=(n,c,x)=>{ c?(ok++,console.log('  OK  '+n)):(ng++,console.log('  NG  '+n+(x!==undefined?'  '+JSON.stringify(x):''))); };
const view = () => p.evaluate(()=> (document.querySelector('.view.active')||{}).id.replace('view-',''));
const hash = () => p.evaluate(()=> location.hash);

console.log('── ① まず外のページから入る（CoreFlow の代わり）──');
await p.goto(`${BASE}/_test_nav_outer.html`);
await p.click('#go'); await p.waitForLoadState();
await p.evaluate(()=>showView('dashboard'));
t('入った直後は住所に画面が付く', (await hash())==='#/dashboard', await hash());

console.log('\n── ② 画面を3つ渡り歩いて、戻るで順に戻る ──');
for (const v of ['today','loaner','admin']) await p.evaluate(k=>showView(k), v);
t('admin は権限が無いので dashboard に追い返される', (await view())==='dashboard');
t('住所も追い返された先になっている', (await hash())==='#/dashboard', await hash());
await p.goBack(); t('戻る① → 代車カレンダー', (await view())==='loaner', await view());
await p.goBack(); t('戻る② → 当日',           (await view())==='today',  await view());
await p.goBack(); t('戻る③ → ダッシュボード',  (await view())==='dashboard', await view());

console.log('\n── ③ もう一度戻ると、はじめてアプリの外へ出る ──');
await p.goBack(); await p.waitForLoadState();
t('アプリの外（さっきのページ）に戻った', await p.evaluate(()=>!!document.getElementById('go')));

console.log('\n── ④ 進むで戻れる ──');
await p.goForward(); await p.waitForLoadState();
t('アプリに戻ってきた', (await p.title())==='戻るの検証');

console.log('\n── ⑤ 下書きがある時、戻るでも「離れますか？」が効く ──');
await p.goto(`${BASE}/_test_nav.html`);
await p.evaluate(()=>showView('dashboard'));
await p.evaluate(()=>showView('loaner'));
await p.evaluate(()=>{ window.blocked=true; });
await p.goBack(); await p.waitForTimeout(120);
t('戻るを押しても代車カレンダーから離れない', (await view())==='loaner', await view());
t('とめたことが画面側に伝わっている', (await p.evaluate(()=>log.join(','))).includes('とめた'));
t('住所も代車カレンダーのまま（ズレない）', (await hash())==='#/loaner', await hash());
await p.evaluate(()=>{ window.blocked=false; });
await p.goBack(); await p.waitForTimeout(120);
t('下書きを片付けたら戻れる', (await view())==='dashboard', await view());

console.log('\n── ⑥ 住所を直接開くとその画面が出る（人に送れる）──');
await p.goto('about:blank');
await p.goto(`${BASE}/_test_nav.html#/loaner`);
await p.evaluate(()=>showView('dashboard'));   // アプリは既定の画面を開こうとする
t('住所に書いてある代車カレンダーが開く', (await view())==='loaner', await view());

console.log('\n── ⑦ 同じ画面を描き直しても足跡が増えない ──');
await p.goto('about:blank');
await p.goto(`${BASE}/_test_nav.html`);
await p.evaluate(()=>showView('dashboard'));
await p.evaluate(()=>showView('today'));
for (let i=0;i<10;i++) await p.evaluate(()=>showView('today'));   // 背後の描き直しを10回
await p.goBack(); await p.waitForTimeout(120);
t('10回描き直しても、戻る1回でダッシュボードへ', (await view())==='dashboard', await view());


console.log('\n── ⑧ 🔴 再読み込みしても、見ていた画面のまま戻る（自動更新のため・2026-08-17）──');
//   自動更新は location.reload() で入れ替える。その時いた画面に戻れないと
//   「見ていたものが消えた」になる。**住所に画面名が入っているので戻れる**ことを実測する。
await p.goto('about:blank');
await p.goto(`${BASE}/_test_nav.html`);
await p.evaluate(()=>showView('dashboard'));
await p.evaluate(()=>showView('today'));
await p.evaluate(()=>showView('loaner'));
t('いま代車カレンダーにいる', (await view())==='loaner', await view());
t('住所にも書いてある',       (await hash())==='#/loaner', await hash());
await p.reload();                                   // ← 自動更新と同じこと
await p.evaluate(()=>showView('dashboard'));        // アプリは起動時に既定の画面を開く
t('🔴 再読み込み後も代車カレンダーのまま', (await view())==='loaner', await view());
t('🔴 住所もそのまま',                     (await hash())==='#/loaner', await hash());
await p.goBack(); await p.waitForTimeout(150);
t('再読み込みのあとも「戻る」が効く（当日へ）', (await view())==='today', await view());

console.log('\n── ⑨ 住所に画面が無い時は、既定の画面のまま（壊れない）──');
await p.goto('about:blank');
await p.goto(`${BASE}/_test_nav.html`);
await p.evaluate(()=>showView('dashboard'));
await p.reload();
await p.evaluate(()=>showView('dashboard'));
t('既定の画面が出る', (await view())==='dashboard', await view());
t('住所も既定の画面', (await hash())==='#/dashboard', await hash());

await b.close();
console.log(`\n${ok} OK / ${ng} NG`); process.exit(ng?1:0);
