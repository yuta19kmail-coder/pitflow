/* ================================================================================
   🗒 フロントマンの「コメント」行を落とさない（v2.12.3）
   --------------------------------------------------------------------------------
   🗣 ゆうた 2026-08-25（売上チェックリスト aaa.pdf・高橋様 MINI・伝票071）
      「燃料圧力測定／エンジンタイミング測定 — 一番上のこの部分」
      「これはフロントマン上では**コメント**という扱いで、**前後に文脈がある**」
      「例えばこの場合なら、これが**点検に掛かってる**感じ」
      「だからこのコメントに関しては**全面的に入れこんでほしい**」
   --------------------------------------------------------------------------------
   ◎PDF の上では「**名前だけ**があって、数量・単価・金額・原価・区分・担当者名称が
     1つも無い行」。お金にならないので、前は**まるごと消えていた。**
   🔴 掛かる先はこちらで推さない。**並んでいた順のまま**入れる（ゆうた指定）。
   🔴 金額は 0 ＝ **検算に1円も影響しない**。ここが崩れたら即アウト。
   ⚠ 巻き込んではいけないもの（実物で全部踏んだ）
      ・`預り金` … 締めの欄の見出し（一般消費税 → 預り金 → 伝票計）
      ・`システム` … 続きの紙に刷り直される伝票の頭
      ・`E90WMWMM32030TL` … 紙の変わり目で落ちてくる、次の伝票の車種名＋車台番号
   ================================================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); }
                          else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const bare = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n── 🔍 決めごとがコードに入っているか ──');
{
  const pdf = bare('js/quarter-pdf.js');
  const wr  = bare('js/quarter-write.js');
  ok('🗒 コメントの種がある', /種: 'コメント'/.test(pdf));
  ok('🔴 金額・原価は 0（検算に触らない）', /種: 'コメント'[\s\S]{0,140}金額: 0, 原価: 0/.test(pdf));
  ok('🔴 締めの欄より下は拾わない（預り金）', /cur\._締め = true/.test(pdf) && /!cur\._締め/.test(pdf));
  ok('🔴 名前の列に入っている字だけ拾う（続きの紙の頭を巻き込まない）', /rw\.名前列/.test(pdf));
  ok('🔴 明細が1つ出てから（伝票の頭と混ざらない）', /cur\.明細\.length\)/.test(pdf));
  /* 🔴 v2.12.4 コメントは**そのまま**入れる。ふつうの明細の名前の掃除を掛けない。 */
  ok('🔴 コメントは掃除していない字を使う（名素）', /種: 'コメント', 名: rw\.名素/.test(pdf));
  ok('🔴 掃除（頭のコード・行末の数字落とし）は明細の名前だけ',
     /var nm = nmRaw\.replace/.test(pdf) && !/名素[\s\S]{0,80}replace\(\/\^\[0-9\]/.test(pdf));
  ok('🚗 車台番号だからといってはじいていない',
     !/\!\/\^\[A-Z0-9\]\[A-Z0-9\\-\]\{4,\}\$\/i\.test\(rw\.名/.test(pdf));
  ok('🖨 出し方も1本（denTable がコメントの行を出す）', /=== 'コメント'/.test(wr));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport:{ width:1400, height:1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed','1'); } catch(e){} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitQPdfRead && window.pitQDenTable', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* ── 📄 高橋様 MINI（伝票071）そのもの ───────────────────────────── */
console.log('\n── 📄 高橋様・MINI（伝票071） ──');
const one = await p.evaluate(async () => {
  const o = await window.pitQPdfRead(
    new File([await (await fetch('/_pdf.pdf')).arrayBuffer()], 'a.pdf', { type:'application/pdf' }), () => {});
  const d = o.伝票[0];
  return { 伝票:d.伝票, 顧客名:d.顧客名, 検算:o.検証.総合計が合う && o.検証.枚数が合う,
           明細が合う:d.明細が合う, 明細合計:d.明細合計, 比べる金額:d.比べる金額,
           先頭5:(d.明細||[]).slice(0,5).map(m => m.種 + '｜' + m.名 + '｜' + m.金額),
           コメントの金額:(d.明細||[]).filter(m => m.種==='コメント')
                            .map(m => (m.金額||0)+(m.原価||0)+(m.数量||0)+(m.単価||0)) };
});
ok('伝票071・高橋貞夫', one.伝票 === '071' && one.顧客名 === '高橋貞夫', one);
ok('🔴 PDFの自己検証は通ったまま', one.検算 === true);
ok('🔴🔴 明細の合計は1円も動かない（＝検算に影響しない）',
   one.明細が合う === true && one.明細合計 === one.比べる金額, one);
ok('🗒 コメントが並びのまま入っている（見出し → コメント2つ → 点検）',
   JSON.stringify(one.先頭5) === JSON.stringify([
     '見出し｜【一般整備】｜undefined',   /* 見出しは金額を持たない（前からこの形） */
     'コメント｜燃料圧力測定｜0',
     'コメント｜エンジンタイミング測定｜0',
     '作業｜テスター診断・エラーチェック・実 点検｜16500',
     '作業｜バルブタイミング点検・タイミング 点検｜74200'
   ]), one.先頭5);
ok('🔴 コメントは数量も単価も金額も原価も0',
   one.コメントの金額.every(x => x === 0), one.コメントの金額);

/* ── 📚 本物6本（973枚）で、拾いすぎていないか ───────────────────── */
console.log('\n── 📚 本物のPDF6本（973枚）で確かめる ──');
const all = await p.evaluate(async () => {
  const files = ['/_pdf.pdf','/_hist/p1.pdf','/_hist/p2.pdf','/_hist/p3.pdf','/_hist/p4.pdf','/_hist/p5.pdf'];
  let 枚 = 0, コメント = 0, 検算OK = 0, 合わない = 0;
  const 名 = {};
  for (const f of files){
    const o = await window.pitQPdfRead(
      new File([await (await fetch(f)).arrayBuffer()], 'x.pdf', { type:'application/pdf' }), () => {});
    if (o.検証.総合計が合う && o.検証.枚数が合う) 検算OK++;
    枚 += o.伝票.length;
    o.伝票.forEach(d => {
      if (!d.明細が合う) 合わない++;
      (d.明細 || []).forEach(m => { if (m.種 === 'コメント'){ コメント++; 名[m.名] = 1; } });
    });
  }
  const ks = Object.keys(名);
  return { 枚, コメント, 検算OK, 合わない, 種類: ks.length,
           締めの言葉: ks.filter(k => /^預り金$/.test(k)),
           頭の言葉:   ks.filter(k => /^(システム|整備|車販)$/.test(k)),
           車台番号:   ks.filter(k => /[A-Z0-9]{8,}/i.test(k)).sort() };
});
ok('6本とも自己検証を通ったまま（973枚）', all.検算OK === 6 && all.枚 === 973, all);
ok('🗒 コメントを拾えている（200件以上）', all.コメント >= 200, all.コメント);
ok('🔴 `預り金` を巻き込んでいない（締めの欄の見出し）', all.締めの言葉.length === 0, all.締めの言葉);
ok('🔴 `システム` を巻き込んでいない（続きの紙の伝票の頭）', all.頭の言葉.length === 0, all.頭の言葉);
/* 🚗 v2.12.4（ゆうた「まれに伝票のコメントとして入れるケースがあるよ」）
   車体番号がコメントに書いてある伝票は**正しい**。はじかず、**後ろ半分も削らず**入れる。
   ・p1.pdf 伝票0129 … 伝票そのものの車台番号（WMWMM32030TL25287）
   ・p3.pdf 伝票00   … 車両が仮登録で車台番号の欄が空。だからコメントに打ってある */
ok('🚗 車体番号のコメントを、切らずにそのまま入れている',
   JSON.stringify(all.車台番号) === JSON.stringify(['E90 WMWMM32030TL25287', 'X1 WBA52EE0505W38279']),
   all.車台番号);

/* ── 🖨 画面に出るか ──────────────────────────────────────── */
console.log('\n── 🖨 伝票の表に出るか ──');
const view = await p.evaluate(async () => {
  const o = await window.pitQPdfRead(
    new File([await (await fetch('/_pdf.pdf')).arrayBuffer()], 'a.pdf', { type:'application/pdf' }), () => {});
  const d = o.伝票[0];
  const m = { 金額:d.比べる金額, 原価:d.原価, 消費税:d.消費税, 伝票計:d.伝票計, 法定:d.法定,
              伝票番号:d.伝票, 明細:d.明細 };
  const box = document.createElement('div');
  box.innerHTML = window.pitQDenTable(m);
  document.body.appendChild(box);
  const cm = [].slice.call(box.querySelectorAll('tr.cm'));
  const 行 = [].slice.call(box.querySelectorAll('tbody tr'));
  const i燃 = 行.findIndex(r => /燃料圧力測定/.test(r.textContent));
  const i点 = 行.findIndex(r => /テスター診断/.test(r.textContent));
  const css = getComputedStyle(cm[0].querySelector('td'), '::before').content;
  return { コメント行: cm.length,
           字: cm.map(r => r.textContent),
           幅いっぱい: cm.every(r => r.querySelector('td[colspan="7"]')),
           飾り: String(css),
           点検より前にいる: i燃 >= 0 && i点 > i燃 };
});
ok('🗒 コメントの行が出る', view.コメント行 === 2, view.コメント行);
ok('🔴 幅いっぱいの1行にする（金額の欄は空）', view.幅いっぱい === true);
/* 🔴 v2.12.4 ゆうた「└ とかは要らない　そのまんまにしてほしい」 */
ok('🔴 飾り（└ など）を足していない',
   view.飾り === 'none' || view.飾り === '' || view.飾り === 'normal', view.飾り);
ok('🔴 字は紙のまま', JSON.stringify(view.字) === JSON.stringify(['燃料圧力測定','エンジンタイミング測定']), view.字);
ok('🔴 並びも紙のまま（燃料圧力測定 → テスター診断）', view.点検より前にいる === true);

console.log('\n── 🧭 まわり ──');
ok('エラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n' + (fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
