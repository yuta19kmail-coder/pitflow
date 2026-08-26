/* ================================================================================
   🏷 入庫バッジの意味（v2.13.0）
   --------------------------------------------------------------------------------
   🗣 ゆうた 2026-08-25
      「新規予約や予約詳細から編集に入った場合、作業タイプのバッチをマウスオーバーしたら
       **バッチの持つ意味を表示して間違えないようにしたい**」
      「これを持って**この入庫バッチの新設についてお知らせ**を入れて」
      「**同様に非カウント実績もセットで**」→（聞いた）→「お知らせ1本に両方」
   --------------------------------------------------------------------------------
   🔴 見張るのは3つ。
      ① 14個ぜんぶに意味が入っていて、**言われたとおりの字**であること
      ② 意味の置き場は**マスター1本**（画面にもお知らせにも書き写していない）
      ③ 押せない時の理由を**消していない**（意味と両方出る）
   ================================================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let OK = 0, NG = 0;
const ok = (n, c, x) => { if (c) { OK++; console.log('  ✅ ' + n); }
                          else { NG++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const bare = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* 🔴 ゆうたが口で言ったとおりの字。ここが**答え合わせの原本**。 */
const 意味 = {
  shaken:    '通常の車検作業',
  '12pt':    '通常の点検作業',
  general:   '通常の修理作業',
  oil:       'オイル交換単体での依頼',
  bp:        '板金修理作業',
  coat1y:    '自社作業によるコーティング（確定でなくてもチェックする）',
  coat3m:    '自社作業によるコーティング（確定でなくてもチェックする）',
  carsale:   '艶出し・ルークリなど車販に依頼する作業（確定でなくてもチェックする）',
  warranty:  '保証会社による整備保証の際に追加で付与（売掛がデフォルトで入る）',
  insurance: '保険会社による板金等の保険作業に付与（保険専用の入金日による実績化挙動）',
  employee:  '工賃の割引やパーツ原価販売を許容する',
  used:      '自社販売の中古車の納車整備時に付与（オーダー販売時の整備伝票有の場合は該当しない）',
  loanercar: '自社代車の整備時に使用',
  inhouse:   'その他社長愛車など伝票が起きない時に使用'
};
const IDS = Object.keys(意味);

console.log('\n── 🔍 コードの決めごと ──');
{
  const st = bare('js/state.js');
  const cd = bare('js/card-detail.js');
  const nw = bare('js/news-pit.js');
  ok('🏷 意味を引く口が1本ある（pitBadgeDesc）', /w?indow\.pitBadgeDesc = function/.test(st));
  ok('🏷 引き出しごとに並べる口もある（pitBadgeGroups）', /w?indow\.pitBadgeGroups = function/.test(st));
  ok('🔴 チップの title は1本で作る（_chipTitle）',
     /function _chipTitle\(id, why\)/.test(cd) && (cd.match(/_chipTitle\(/g) || []).length >= 4,
     (cd.match(/_chipTitle\(/g) || []).length);
  ok('🔴 画面に意味を書き写していない',
     !IDS.some(k => cd.indexOf(意味[k]) >= 0));
  ok('🔴 お知らせにも意味を書き写していない（マスターから組み立てる）',
     !IDS.some(k => nw.indexOf(意味[k]) >= 0) && /pitBadgeGroups\(\)/.test(nw));
  ok('🔴 お知らせの body は関数でも書ける（BODY で通す）',
     /function BODY\(a\)/.test(nw) && !/\(a\.body \|\| ''\)/.test(nw));
  /* 🔴 作業タイプの一覧を1文字でも変えたら版を上げる決まり（test_worktype_pingpong の相方） */
  ok('🔧 作業タイプの一覧の版を上げた', /PIT_WORK_TYPES_VER = '2\.13\.0'/.test(st));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed','1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitBadgeDesc && window.renderCardForm', null, { timeout: 25000 });
await p.waitForTimeout(900);

console.log('\n── 🏷 14個の意味 ──');
{
  const got = await p.evaluate(ids => {
    const o = {}; ids.forEach(k => { o[k] = window.pitBadgeDesc(k); }); return o;
  }, IDS);
  let 全部 = true;
  IDS.forEach(k => { if (got[k] !== 意味[k]) 全部 = false; });
  ok('🔴🔴 14個ぜんぶ、言われたとおりの字が入っている', 全部,
     IDS.filter(k => got[k] !== 意味[k]).map(k => k + ': ' + got[k]));
  const 空 = await p.evaluate(() => [window.pitBadgeDesc(''), window.pitBadgeDesc('しらない印')]);
  ok('🔴 知らない印には何も言わない（空を返す）', 空[0] === '' && 空[1] === '', 空);
  const g = await p.evaluate(() => (window.pitBadgeGroups() || []).map(x => x.名 + ':' + x.items.length));
  ok('🗂 引き出しは3つ（作業タイプ8・付加3・社内区分3）',
     g.join() === '作業タイプ:8,付加:3,社内区分:3', g);
}

console.log('\n── 🖱 新規予約の画面で、押す前に読める ──');
{
  await p.click('text=新規予約');
  await p.waitForTimeout(900);
  const ob = await p.$('#cf-other-btn');
  ok('🗄「その他」の引き出しがある', !!ob);
  if (ob){ await ob.click(); await p.waitForTimeout(500); }
  const r = await p.evaluate(() => {
    const o = {};
    [].slice.call(document.querySelectorAll('.cf-chip[data-val]')).forEach(x => {
      o[x.getAttribute('data-val')] = x.getAttribute('title') || '';
    });
    return { title: o, パネル: !!document.querySelector('.cf-other-panel') };
  });
  ok('🗄 引き出しが開く', r.パネル === true);
  const 無し = IDS.filter(k => r.title[k] === undefined);
  ok('🔴 14個ぜんぶチップが出ている', 無し.length === 0, 無し);
  const 出ない = IDS.filter(k => (r.title[k] || '').indexOf(意味[k]) < 0);
  ok('🔴🔴 14個ぜんぶ、乗せたら意味が出る', 出ない.length === 0,
     出ない.map(k => k + ': ' + r.title[k]));
  /* ⚠ 押せない時の理由は消さない。意味と両方出す（理由が先） */
  const 付加 = ['warranty','insurance','employee'];
  ok('🔴 押せない印は「なぜ押せないか」も出る（意味より先）',
     付加.every(k => /^作業タイプを選ぶと押せます/.test(r.title[k] || '')
                   && (r.title[k] || '').indexOf(意味[k]) > 0),
     付加.map(k => r.title[k]));
}

console.log('\n── 📣 お知らせ ──');
{
  const r = await p.evaluate(() => {
    const a = (window.PIT_NEWS || [])[0];
    const el = document.createElement('div');
    el.innerHTML = (typeof a.body === 'function') ? a.body() : (a.body || '');
    return { id: a.id, 版: a.version, 日: a.date, 題: a.title,
             関数で書いてある: typeof a.body === 'function',
             文字: el.textContent.replace(/\s+/g, ' ') };
  });
  ok('📣 先頭が今回のお知らせ', r.id === 'n-20260825-badges-v2130' && r.版 === '2.13.0', r.id);
  ok('🔴 中身はマスターから組み立てている（関数）', r.関数で書いてある === true);
  const 抜け = IDS.filter(k => r.文字.indexOf(意味[k]) < 0);
  ok('🔴🔴 14個ぜんぶの意味がお知らせに載る', 抜け.length === 0, 抜け);
  ok('🔴 非カウント実績も同じお知らせに入っている',
     /非カウント一覧/.test(r.文字) && /売上・作業サマリー/.test(r.文字), r.文字.slice(0, 80));
  ok('　行き先を言っている（実績カレンダーに残る）', /記録としてそのまま残ります/.test(r.文字));
  ok('　まちがえると数字が変わる印を名指ししている',
     /売掛が既定/.test(r.文字) && /保険専用の入金日/.test(r.文字) && /売上に数えません/.test(r.文字));
}

console.log('\n── 🔢 版くらべのけた（受信箱の並び） ──');
{
  const r = await p.evaluate(() => {
    if (window.showView) showView('news');
    window.renderNews();
    return [].slice.call(document.querySelectorAll('.nw-item .nw-ver, .nw-item'))
      .slice(0, 3).map(x => (x.textContent.match(/v[\d.]+/) || [''])[0]);
  });
  /* 🔴🔴 前は major*10000 + minor*100 で、v1.185.0 が v2.13.0 より大きくなっていた */
  ok('🔴🔴 いちばん新しい版が先頭に来る（v2.13.0）', r[0] === 'v2.13.0', r);
  const cmp = await p.evaluate(() => {
    const el = [].slice.call(document.querySelectorAll('.nw-item'))
      .map(x => (x.textContent.match(/v([\d.]+)/) || [0,'0'])[1]);
    const n = v => { const p = String(v).split('.').map(Number);
      return (p[0]||0)*1e8 + (p[1]||0)*1e4 + (p[2]||0); };
    for (let i = 1; i < el.length; i++) if (n(el[i-1]) < n(el[i])) return { 崩れ:[el[i-1], el[i]] };
    return { 崩れ: null, 件数: el.length };
  });
  ok('🔴 受信箱ぜんぶが版の新しい順', cmp.崩れ === null, cmp);
}

/* ================================================================
   ✂️ v2.13.1 支払い（現金・カード…）を丸ごと外した（ゆうた 2026-08-25）
   🗣「カード詳細の支払い（現金 カード）などが選べる部分は**丸ごとカット**してほしい。
   　　多分今どこかにデータを使ってはいないと思う」
   🔴🔴 名前の似た **入金日（paymentDate / paymentSeparate）は別物。残っていること**まで見る。
        あれは保険の実績化の要（insurance-pit.js）。ここを一緒に消すと保険が壊れる。
   ================================================================ */
console.log('\n── ✂️ 支払い（現金・カード）を外した ──');
{
  const cv = bare('js/card-view.js');
  const cd = bare('js/card-detail.js');
  const st = bare('js/state.js');
  ok('✂️ 選ぶ行が無い（画面）', !/pickRow\('支払い'/.test(cv));
  ok('✂️ 一覧を作る所も無い（payMethods）', !/function payMethods/.test(cv));
  ok('✂️ 書き込む所も無い（c.payment =）', !/_c\.payment = val/.test(cv));
  ok('✂️ 記録の表からも外した（ARCH_W の pay）', !/pay:'支払い'/.test(cv));
  ok('✂️ 死んでいた paymentSelect を消した', !/function paymentSelect/.test(cd));
  ok('✂️ マスターも消した（state.paymentMethods）', !/paymentMethods: \[/.test(st));
  /* 🔴 ここが本丸。入金日は保険の実績化に使っている＝1バイトも触らない */
  ok('🔴🔴 入金日は残っている（paymentDate）', /c\.paymentDate/.test(cv), 'card-view');
  ok('🔴🔴 売掛（入金日を分ける）も残っている', /paymentSeparate/.test(cv));
  const ins = bare('js/insurance-pit.js');
  ok('🔴 保険は入金日を見たまま', /c\.paymentDate/.test(ins));

  const r = await p.evaluate(async () => {
    const 済 = (window.state.cards || []).find(c => c && c.status === 'returned');
    const 未 = (window.state.cards || []).find(c => c && c.status !== 'returned');
    const 開く = async (c) => { window.pitOpenCardDetail(c.id);
      await new Promise(r => setTimeout(r, 500)); return document.body.innerText; };
    const a = await 開く(未);
    const b = await 開く(済);
    let arch = '';
    try { if (window.cvArchEdit){ window.cvArchEdit(); await new Promise(r => setTimeout(r, 400));
          arch = document.body.innerText; } } catch (e) { arch = 'ERR ' + e; }
    return { 予約中に支払い: /支払い/.test(a), 返車済みに支払い: /支払い/.test(b),
             アーカイブ編集に支払い: /支払い/.test(arch),
             入金の欄がある: /入金/.test(b),
             マスターが残っていない: !window.state.paymentMethods };
  });
  ok('🔴 予約中のカードに「支払い」が出ない', r.予約中に支払い === false, r);
  ok('🔴 返車済みのカードにも出ない', r.返車済みに支払い === false, r);
  ok('🔴 完了アーカイブの編集にも出ない（＝開いても落ちない）', r.アーカイブ編集に支払い === false, r);
  ok('🔴🔴 入金の欄はそのまま出る', r.入金の欄がある === true, r);
  ok('✂️ 画面にもマスターが残っていない', r.マスターが残っていない === true, r);
}

console.log('\n── 🧭 まわり ──');
ok('エラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
await b.close();
process.exit(NG ? 1 : 0);
