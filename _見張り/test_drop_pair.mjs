/* ============================================================
   test_drop_pair.mjs
   受付タイプが2つ（待＋当返 など）の時の見え方を見張る。

   きっかけ：ゆうた 2026-08-28
     「MHSの当日もそうなんだけど、待+当返みたいに2つ以上になるとCSSがへんなのか」
     「**凄く小さくなっちゃう**」

   何が起きていたか（v2.20.0 まで）：
     `.dbpair>span` が **font-size:9px !important** で全部の画面を縮めていた（v0.87.2）。
     当日ビューの受付の枠は **44px** あるのに、実測 15px＋15px＝**31px しか使っていなかった**。

   いまの決めごと（v2.20.1）：
     ・共通（`.dbpair>span`）は**字を小さくしない**。詰めるのは余白と角丸だけ
     ・固定枠（`.tr-tag-slot`）だけ **枠を2つで分け合う**（高さ26pxは1つの時と同じ）
     ・🔴 MHS の当日ボードも**同じ形**（片方だけ直さない）

   使い方：
     python3 -m http.server 8970 --directory . &
     PORT=8970 node test_drop_pair.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8970;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

console.log('\n── 🎨 CSS の決めごと ──');
{
  const pol = fs.readFileSync(path.join(process.cwd(), 'css', 'polish.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const vw  = fs.readFileSync(path.join(process.cwd(), 'css', 'views.css'),  'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const pair = (pol.match(/\.dbpair\s*>\s*span\{[^}]*\}/) || [''])[0];
  ok('🔴 共通の規則が字を小さくしていない（font-size を書いていない）', !!pair && !/font-size/.test(pair), pair);
  ok('🔴 高さ・幅を潰していない（height/width の !important が無い）',
     !!pair && !/height\s*:\s*auto/.test(pair) && !/width\s*:\s*auto/.test(pair), pair);
  ok('固定枠は2つで分け合う（.tr-tag-slot .dbpair が全幅）', /\.tr-tag-slot \.dbpair\{[^}]*width:\s*100%/.test(vw));
  ok('その中の札が半分ずつ（flex:1 1 0）', /\.tr-tag-slot \.dbpair > \.tag-drop\{[^}]*flex:\s*1 1 0/.test(vw));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.showView', null, { timeout: 25000 });
await p.waitForTimeout(600);

await p.evaluate(() => {
  const ymdL = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const t = ymdL(new Date());
  state.cards = (state.cards || []).filter(c => c.reserveDate !== t);     /* その日は自分の3台だけにする */
  const mk = (id, name, o) => Object.assign({ id:id, resNo:'X-'+id, customer:name, car:'テスト車',
    plate:'習志野 300 あ 12-34', reserveDate:t, reserveTime:'10:00', status:'reserved', boardId:'default',
    workType:'shaken', workTypes:['shaken'] }, o || {});
  state.cards.push(mk('DP-1', '一つだけ',  { dropType:'wait' }));
  state.cards.push(mk('DP-2', '待と当返',  { dropType:'wait', dropType2:'sameDay' }));
  state.cards.push(mk('DP-3', '預と当返',  { dropType:'drop', dropType2:'sameDay' }));
  showView('today');
});
await p.waitForTimeout(800);

const m = await p.evaluate(() => {
  const out = { one:null, pairs:[] };
  document.querySelectorAll('.today-row').forEach(row => {
    /* ⚠ 右タグは3スロット（添え物／受付／作業）。**受付の枠＝札が入っている方**を選ぶ。
       　 先頭の `.tr-tag-slot` は添え物（相談・代車・洗車）なので、そこを見ると何も見つからない。 */
    const slot = [].slice.call(row.querySelectorAll('.tr-tag-slot'))
                   .find(function(s){ return s.querySelector('.tag-drop'); });
    if (!slot) return;
    const sw = slot.getBoundingClientRect().width;
    const pair = slot.querySelector('.dbpair');
    const t = el => { const r = el.getBoundingClientRect(); return {
      w:+r.width.toFixed(1), h:+r.height.toFixed(1), fs:parseFloat(getComputedStyle(el).fontSize),
      left:+r.left.toFixed(1), right:+r.right.toFixed(1), txt:el.textContent.trim() }; };
    if (pair) out.pairs.push({ slot:+sw.toFixed(1), sl:+slot.getBoundingClientRect().left.toFixed(1),
                               sr:+slot.getBoundingClientRect().right.toFixed(1),
                               items:[...pair.children].map(t) });
    else { const one = slot.querySelector('.tag-drop'); if (one && !out.one) out.one = { slot:+sw.toFixed(1), item:t(one) }; }
  });
  return out;
});

console.log('\n── 📏 当日ビューで実際に測る ──');
{
  ok('1つの時＝枠いっぱい（44px・26px・14px）',
     m.one && m.one.item.w >= 43 && m.one.item.h === 26 && m.one.item.fs === 14, m.one);
  ok('2つの札が出ている（2組）', m.pairs.length >= 2, m.pairs.length);
  m.pairs.forEach(function(pr, i){
    const a = pr.items[0], b2 = pr.items[1];
    ok('【' + (i+1) + '】🔴 字が小さくなりすぎない（12px以上・前は9px）', a.fs >= 12 && b2.fs >= 12, [a.fs, b2.fs]);
    ok('【' + (i+1) + '】🔴 高さは1つの時と同じ（26px）', a.h === 26 && b2.h === 26, [a.h, b2.h]);
    ok('【' + (i+1) + '】🔴 2つで枠を分け合う（それぞれ18px以上）', a.w >= 18 && b2.w >= 18, [a.w, b2.w]);
    ok('【' + (i+1) + '】枠からはみ出さない', a.left >= pr.sl - 0.5 && b2.right <= pr.sr + 0.5, pr);
    ok('【' + (i+1) + '】2つの札が同じ大きさ', Math.abs(a.w - b2.w) <= 0.6 && a.h === b2.h, [a.w, b2.w]);
  });
  ok('🔴 2つの時も、1つの時と同じ枠幅に収まっている',
     m.one && m.pairs.every(pr => Math.abs(pr.slot - m.one.slot) < 0.5), { one: m.one && m.one.slot, pairs: m.pairs.map(x=>x.slot) });
}

console.log('\n── 🧯 JSエラー ──');
ok('JSエラーが1つも出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n===== ' + OK + ' OK / ' + NG + ' NG =====');
process.exit(NG ? 1 : 0);
