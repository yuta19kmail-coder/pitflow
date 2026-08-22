/* PitFlow v1.176.0 ── 🔎 検索で「当たった所」を塗る／どの欄で当たったかを出す
   -------------------------------------------------------------------
   ◎ゆうた依頼（2026-08-22）
     🗣「検索がヒットした時に**どこが当たってるのか**ハイライト表示。
     　　マスター検索や新規予約の検索画面で検索した時にヒットしたものをハイライトしてほしい。
     　　例えば自分的にはナンバーで **920** で検索した時に **9/20** とかでヒットして
     　　？？？って迷って意外とはかどらない」

   ◎この試験が見張るもの
     ・当たった字が `<mark class="psr-hit">` で塗られる（**元の字のまま**・見た目は変わらない）
     ・**どの欄で当たったか**が出る（画面に出ていない欄＝メモ・作業内容・代車 でも分かる）
     ・🔴🔴 **拾う範囲は1文字も変わっていない**（見えるようにしただけ）
     ・新規予約の「呼び出し」も**同じ1本**（search.js）を借りている
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8941      ← 別ウィンドウ
     node test_search_hit.mjs                                                 */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8941;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitSearchInput && window.pitSearchMark && window.pitSearchWhere', null, { timeout: 25000 });
await p.waitForTimeout(900);

/* ゆうたの例そのもの＝「920」で、ナンバーの車と、9/20 の車の2枚
   ⚠ 決め打ちの日付は書かない（規則④）。**今日からの日数**で作り、9月20日は「9/20 に当たること」だけを見る。 */
const D = (off) => { const d = new Date(); d.setDate(d.getDate() + off);
  const q = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); };
/* 「日付で当たる」を確かめるための1枚＝**その日付の 月/日 で引く**（何月何日でもよい） */
const DATE_CARD = D(9), DATE_MD = (function (x) { const q = x.split('-'); return (+q[1]) + '/' + (+q[2]); })(D(9));
const DATE_Q = (function (x) { const q = x.split('-'); return q[1] + q[2]; })(D(9));   /* 0920 のような形 */
const seed = () => p.evaluate((v) => {
  state.cards = [
    { id: 'sPlate', resNo: 'R-1', customer: '番号 太郎', kana: 'バンゴウタロウ', car: 'アクア',
      plate: '野田 500 あ ' + v.q, tel: '090-1111-2222', boardId: 'default', division: 'div1',
      status: 'work', reserveDate: v.other, returnDate: v.other, log: [], maint: {}, office: {} },
    { id: 'sDate', resNo: 'R-2', customer: '日付 花子', kana: 'ヒヅケハナコ', car: 'ノート',
      plate: '野田 300 い 11-11', tel: '090-3333-4444', boardId: 'default', division: 'div1',
      status: 'work', reserveDate: v.date, returnDate: v.date, log: [], maint: {}, office: {} },
    { id: 'sMemo', resNo: 'R-3', customer: 'メモ 次郎', kana: 'メモジロウ', car: 'ヤリス',
      plate: '野田 300 う 22-22', tel: '090-5555-6666', boardId: 'default', division: 'div1',
      status: 'work', reserveDate: v.other, returnDate: v.other,
      menu: 'ブレーキパッド交換 ' + v.q + '番の部品', log: [], maint: {}, office: {} }
  ];
  state.customers = [
    { id: 'cu1', name: '顧客 三郎', kana: 'コキャクサブロウ', contacts: [{ tel: '090-7777-8888', primary: true }],
      vehicles: [{ id: 'v1', car: 'フィット', maker: 'ホンダ', plate: '野田 500 え ' + v.q }] }
  ];
  if (window.pitSearchBind) pitSearchBind('pit-search-wrap', 'pit-search-input', 'pit-search-results');
  let box = document.getElementById('pit-search-results');
  if (!box) { box = document.createElement('div'); box.id = 'pit-search-results'; document.body.appendChild(box); }
  box.innerHTML = '';
}, { date: DATE_CARD, other: D(1), q: DATE_Q });

const run = (q) => p.evaluate((x) => {
  pitSearchInput(x);
  const box = document.getElementById('pit-search-results');
  const rows = Array.from(box.querySelectorAll('.psr-row')).map(r => ({
    txt: r.textContent.replace(/\s+/g, ' ').trim(),
    marks: Array.from(r.querySelectorAll('mark.psr-hit')).map(m => m.textContent),
    where: (r.querySelector('.psr-where') || {}).textContent || ''
  }));
  return { n: rows.length, rows };
}, q);

console.log('\n── ① ゆうたの例：「920」で引く ──');
{
  await seed();
  const r = await run(DATE_Q);
  ok('3枚とも当たる（拾う範囲は変えていない）', r.n >= 3, r.n);

  const plate = r.rows.filter(x => /番号 太郎/.test(x.txt))[0] || {};
  const date  = r.rows.filter(x => /日付 花子/.test(x.txt))[0] || {};
  const memo  = r.rows.filter(x => /メモ 次郎/.test(x.txt))[0] || {};

  ok('🔴🔴 ナンバーで当たった車＝「ナンバー」と出る', /ナンバー/.test(plate.where), plate.where);
  ok('🔴🔴 日付で当たった車＝「入庫日」と出る（ここが今回の肝）', /入庫日/.test(date.where), date.where);
  ok('🔴 日付の車に「ナンバー」とは出ない', !/ナンバー/.test(date.where), date.where);
  ok('🔴🔴 画面に出ていない欄（作業内容）で当たったことも分かる',
     /作業内容/.test(memo.where), memo.where);

  ok('🔴 ナンバーの当たった字が塗られる', (plate.marks || []).some(x => x.indexOf(DATE_Q) >= 0), plate.marks);
  /* 🔴🔴 ここが今回の困りごとそのもの。
     画面に出ているのは **2026-09-20**。「920」はその字の中に無いので**塗れない**。
     だから **どの書き方で当たったか**（9/20）を行に出す。 */
  ok('🔴🔴 日付は「どの書き方で当たったか」まで出る（9/20 のような形）',
     date.where.indexOf(DATE_MD) >= 0, [date.where, DATE_MD]);
}

console.log('\n── ② 塗り方（元の字のまま・見た目を変えない） ──');
{
  const r = await p.evaluate(() => ({
    plain:  pitSearchMark('野田 500 あ 123', ['500あ1']),
    kana:   pitSearchMark('タナカ', ['たなか']),
    zen:    pitSearchMark('１２３', ['123']),
    none:   pitSearchMark('アクア', ['123']),
    esc:    pitSearchMark('<script>', ['123']),
    escHit: pitSearchMark('a<b>c', ['b'])
  }));
  ok('🔴 空白をまたいでも、元の字はそのまま（消えない・増えない）',
     r.plain.replace(/<[^>]+>/g, '') === '野田 500 あ 123', r.plain);
  /* 🔴 空白をまたいだ当たり（「500あ9」）でも、**元の空白はそのまま**残って塗られる */
  ok('🔴 塗るのは当たった所だけ（空白をまたいでも元の形のまま）',
     /<mark class="psr-hit">500 あ 1<\/mark>/.test(r.plain), r.plain);
  ok('カタカナ↔ひらがなでも当たる', /<mark/.test(r.kana), r.kana);
  ok('全角の数字でも当たる', /<mark/.test(r.zen), r.zen);
  ok('当たらなければ塗らない', !/<mark/.test(r.none), r.none);
  ok('🔴 危ない字はそのまま出さない（エスケープしている）', r.esc === '&lt;script&gt;', r.esc);
  ok('🔴 塗った時もエスケープしている', /&lt;/.test(r.escHit) && /<mark/.test(r.escHit), r.escHit);
}

console.log('\n── ③ 🔴🔴 拾う範囲は1文字も変わっていない ──');
{
  /* 欄ごとに1語ずつ引いて、**今までどおり当たる**ことを見る（拾う範囲を変えていない証拠） */
  const r = await p.evaluate((v) => {
    const hit = (q) => { pitSearchInput(q);
      return document.querySelectorAll('#pit-search-results .psr-row').length; };
    return { plate: hit(v.q), kana: hit('ひづけ'), menu: hit('ブレーキパッド'),
             tel: hit('090-5555'), resNo: hit('R-3'), date: hit(v.md), cust: hit('こきゃく') };
  }, { q: DATE_Q, md: DATE_MD });
  ok('ナンバーで引ける', r.plate >= 1, r.plate);
  ok('カナで引ける', r.kana >= 1, r.kana);
  ok('作業内容で引ける', r.menu >= 1, r.menu);
  ok('電話で引ける', r.tel >= 1, r.tel);
  ok('予約番号で引ける', r.resNo >= 1, r.resNo);
  ok('日付（9/20 のような形）で引ける', r.date >= 1, r.date);
  ok('顧客台帳も引ける', r.cust >= 1, r.cust);
}

console.log('\n── ④ 新規予約の「呼び出し」も同じ1本を借りている ──');
{
  const r = await p.evaluate((q) => {
    /* ⚠ 候補の箱は「いま開いているフォームの中」から探される作り（v1.44.0）。
       だから **#md-body の中**に置かないと見つけてもらえない。 */
    const host = document.getElementById('md-body') || document.body;
    let box = host.querySelector('#cf-recall-list');
    if (!box) { box = document.createElement('div'); box.id = 'cf-recall-list'; host.appendChild(box); }
    custSuggest(q);
    return { html: box.innerHTML,
             marks: Array.from(box.querySelectorAll('mark.psr-hit')).map(m => m.textContent),
             where: (box.querySelector('.cf-recall-where') || {}).textContent || '' };
  }, DATE_Q);
  ok('🔴 呼び出しでも当たった字が塗られる', r.marks.length > 0, r.marks);
  ok('🔴 呼び出しでも「どの欄で当たったか」が出る', /ナンバー/.test(r.where), r.where);
}

console.log('\n── 🧭 ソースの見張り ──');
{
  const sc = fs.readFileSync('js/search.js', 'utf8');
  const cu = fs.readFileSync('js/customers.js', 'utf8');
  const ix = fs.readFileSync('index.html', 'utf8');
  ok('🔴🔴 探す材料と「どの欄か」は同じ表から（cardFields / custFields）',
     /function cardFields/.test(sc) && /function custFields/.test(sc)
     && /cardFields\(c\)\.map/.test(sc) && /custFields\(cust\)\.map/.test(sc), '');
  ok('🔴🔴 呼び出し（customers.js）に塗り方を書き写していない',
     /pitSearchMark/.test(cu) && !/psr-hit/.test(cu) && !/function normIndex/.test(cu), '');
  ok('🔴 呼び出しは「どの欄か」も借りている', /pitSearchWhere/.test(cu), '');
  const ver = (ix.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('🔴 版が3か所そろっている',
     !!ver && ix.indexOf('<span class="ver">v' + ver + '</span>') >= 0
           && ix.indexOf('<div class="login-ver">v' + ver + '</div>') >= 0, ver);
  ok('直したファイルにキャッシュ番号が付いている',
     /search\.js\?v=\d+/.test(ix) && /customers\.js\?v=\d+/.test(ix) && /search\.css\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

console.log('\n' + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
