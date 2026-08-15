/* PitFlow v1.102.0 ── 新規予約の「呼び出し」検索を、マスター検索と同じ探し方に
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-15）
     「ダッシュボード上のマスター検索に比べて、新規予約での検索の結果が薄い
       （入庫予約とかがないのはわかってる）。なんか件数制限みたいなものがある」

   ◎調べて分かった「薄い」理由（3つ）
     ① **10件で打ち切っていた**（しかも何件あるか出さないので気づけない）
     ② **スペース区切りが効かない**＝「山田 アクア」と2語で打つと 0件
     ③ **全角の英数字をならしていなかった**＝全角で打ったナンバー・電話が当たらない

   ◎ここで見張ること
     🔴 探し方の物差しは search.js の1本（`pitSearchNorm` / `pitSearchWords`）を借りる
     🔴 v1.102.1（ゆうた指定）**顧客は上限なし＝全件出す。**（マスター検索の顧客欄も同じ）
        ⚠ カード（入庫予約・過去入庫）は今までどおり上位30件
     🔴 名前で引けばその人の車が全部出る／2語で絞れる／全角でも当たる
     🔴 アーカイブした顧客・車両は今までどおり出さない（v1.49.0）

   ◎使い方
     python3 -m http.server 8936      ← 別ウィンドウ
     node test_recall.mjs                                               */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8936;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.custSuggest && window.pitSearchWords', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 顧客を並べて、新規予約の「呼び出し」に打ち込んだ時の候補を読む */
const setup = () => p.evaluate(() => {
  const cust = [];
  /* 同じ苗字の人を25人（＝昔の10件上限に必ず引っかかる） */
  for (let i = 1; i <= 25; i++) {
    cust.push({
      id: 'cu' + i, name: '山田 太郎' + i, kana: 'ヤマダ タロウ', updatedAt: Date.now(),
      contacts: [{ tel: '090-1111-' + String(1000 + i), primary: true }],
      vehicles: [{ id: 'v' + i, plate: '品川 300 あ ' + (1000 + i), maker: 'トヨタ', car: (i === 3 ? 'アクア' : 'ヴィッツ') }]
    });
  }
  /* 車を3台持っている人（名前で引いたら3台とも出るはず） */
  cust.push({ id: 'cuM', name: '鈴木 花子', kana: 'スズキ ハナコ', updatedAt: Date.now(), contacts: [],
    vehicles: [
      { id: 'vm1', plate: '品川 500 さ 1', maker: '日産', car: 'ノート' },
      { id: 'vm2', plate: '品川 500 さ 2', maker: 'ホンダ', car: 'フィット' },
      { id: 'vm3', plate: '品川 500 さ 3', maker: 'マツダ', car: 'デミオ' }
    ] });
  /* 車を持っていない人 */
  cust.push({ id: 'cuN', name: '佐藤 車なし', kana: 'サトウ クルマナシ', updatedAt: Date.now(), contacts: [], vehicles: [] });
  /* アーカイブ済み（出てはいけない） */
  cust.push({ id: 'cuA', name: '片付 済子', kana: 'カタヅケ スミコ', archived: true, updatedAt: Date.now(), contacts: [],
    vehicles: [{ id: 'va1', plate: '品川 900 か 9', maker: 'スバル', car: 'インプレッサ' }] });
  state.customers = cust;
  state.cards = [];
  return true;
});

/* 呼び出し欄に打ち込んで、出た候補を読む */
const recall = q => p.evaluate(qq => {
  /* ⚠ 候補の箱は「いま開いているフォームの中」から探される作り（v1.44.0）なので、
     試験でも **#md-body の中** に置かないと見つけてもらえない。 */
  const host = document.getElementById('md-body') || document.body;
  let box = host.querySelector('#cf-recall-list');
  if (!box) { box = document.createElement('div'); box.id = 'cf-recall-list'; host.appendChild(box); }
  custSuggest(qq);
  const items = [].map.call(box.querySelectorAll('.cf-recall-item'), e => e.textContent.trim());
  const more = box.querySelector('.cf-recall-more');
  return { n: items.length, items: items.slice(0, 3), more: more ? more.textContent.trim() : '', shown: box.style.display };
}, q);

/* マスター検索の顧客ヒット数（比べる相手） */
const master = q => p.evaluate(qq => {
  const words = pitSearchWords(qq);
  const nz = pitSearchNorm;
  return (state.customers || [])
    .filter(c => (window.PitArchive ? PitArchive.custVisible(c) : true))
    .filter(c => {
      const parts = [c.name, c.kana];
      (c.contacts || []).forEach(ct => parts.push(ct.tel, ct.label));
      (c.vehicles || []).filter(v => (window.PitArchive ? !PitArchive.vehArchived(c, v) : true))
        .forEach(v => parts.push(v.plate, v.maker, v.car));
      const blob = nz(parts.filter(Boolean).join(' '));
      return words.every(w => blob.indexOf(w) >= 0);
    }).length;
}, q);

await setup();

console.log('\n── 📋 件数の打ち切りをやめた（v1.102.1） ──');
{
  const r = await recall('山田');
  ok('🔴 10件で止まらない', r.n === 25, r.n);
  ok('マスター検索の顧客ヒット数と数が合う', r.n === (await master('山田')), r.n);
  ok('30件までなら案内は出さない', r.more === '', r.more);
}
{
  /* 40人にして、昔の上限（30）を超えても全部出るか見る */
  await p.evaluate(() => {
    for (let i = 26; i <= 40; i++) {
      state.customers.push({ id: 'cx' + i, name: '山田 次郎' + i, kana: 'ヤマダ ジロウ', updatedAt: Date.now(), contacts: [],
        vehicles: [{ id: 'vx' + i, plate: '品川 300 い ' + (2000 + i), maker: 'トヨタ', car: 'ヤリス' }] });
    }
  });
  const r = await recall('山田');
  ok('🔴 上限なし＝40件そのまま出る', r.n === 40, r.n);
  ok('🔴 何件出ているかを添える', /40件/.test(r.more) && /全部出しています/.test(r.more), r.more);
  ok('絞り方も添える', /スペース/.test(r.more), r.more);
  ok('🔴 「上位◯件」とは言わない（切っていないので）', !/上位/.test(r.more), r.more);
}
{
  /* マスター検索の顧客欄も上限なし */
  const r = await p.evaluate(() => {
    /* ⚠ 結果の箱はダッシュボードの中にある。開いていない時のために用意してから縛る。 */
    let box = document.getElementById('pit-search-results');
    if (!box) { box = document.createElement('div'); box.id = 'pit-search-results'; document.body.appendChild(box); }
    pitSearchBind('pit-search-wrap', 'pit-search-input', 'pit-search-results');
    pitSearchInput('山田');
    const heads = [].map.call(box.querySelectorAll('.psr-head'), e => e.textContent.trim());
    /* 顧客の行は先頭に人のマーク（.psr-cust-tag）が付く */
    return { rows: box.querySelectorAll('.psr-cust-tag').length, heads: heads };
  });
  const custHead = (r.heads || []).find(h => /顧客/.test(h)) || '';
  ok('🔴 マスター検索の顧客も全件出る', r.rows === 40, r);
  ok('🔴 「上位30件」と言わなくなった', !/上位/.test(custHead), custHead);
  ok('件数と絞り方は出す', /40件/.test(custHead) && /スペース/.test(custHead), custHead);
}

console.log('\n── 🔎 スペース区切り（AND） ──');
{
  const r = await recall('山田 アクア');
  ok('🔴 2語で絞れる（前は0件だった）', r.n === 1, r);
  ok('当たったのはアクアの人', /アクア/.test(r.items[0] || ''), r.items);
  const r2 = await recall('山田 ぞんざいな語');
  ok('当たらない語を足せば0件', r2.n === 0 && r2.shown === 'none', r2);
}

console.log('\n── 🔤 文字のならし方をマスター検索と揃える ──');
{
  const r = await recall('ヤマダ');
  ok('カタカナで引ける', r.n > 0, r.n);
  const r2 = await recall('やまだ');
  ok('🔴 ひらがなでも同じ数だけ引ける', r2.n === r.n, [r.n, r2.n]);
  const r3 = await recall('１００３');   /* 全角の数字 */
  ok('🔴 全角の数字でも当たる（前は当たらなかった）', r3.n >= 1, r3);
  /* ⚠ 全角のハイフン（－）は今も当たらない。**マスター検索も同じ**なので、
     ここだけ直すと逆に食い違う。直すなら search.js の物差し1本を直して両方に効かせること。 */
  const r4 = await recall('０９０－１１１１－１００３');
  ok('全角ハイフン混じりは当たらない（マスター検索と同じ＝食い違っていない）', r4.n === 0, r4.n);
}

console.log('\n── 🚗 人と車の出しかた ──');
{
  const r = await recall('鈴木');
  ok('🔴 名前で引くと、その人の車が全部出る', r.n === 3, r);
  const r2 = await recall('鈴木 フィット');
  ok('🔴 車種を足せばその1台だけ', r2.n === 1 && /フィット/.test(r2.items[0] || ''), r2);
  const r3 = await recall('デミオ');
  ok('車種だけでも引ける', r3.n === 1, r3);
  const r4 = await recall('佐藤');
  ok('車を持っていない人も出る', r4.n === 1 && /車両なし/.test(r4.items[0] || ''), r4);
}

console.log('\n── 📦 アーカイブは今までどおり出さない ──');
{
  const r = await recall('片付');
  ok('🔴 アーカイブした顧客は出さない', r.n === 0, r);
  const r2 = await recall('インプレッサ');
  ok('🔴 アーカイブした車のナンバー・車種でも出さない', r2.n === 0, r2);
}

console.log('\n── ⏱ 実データくらいの量でも使えるか（顧客6,500人） ──');
{
  const r = await p.evaluate(() => {
    const cust = [];
    const sei = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤'];
    const car = ['アクア','プリウス','ノート','フィット','ヴィッツ','セレナ','タント','ムーヴ'];
    for (let i = 0; i < 6500; i++) {
      cust.push({ id: 'p' + i, name: sei[i % 10] + ' ' + (i), kana: 'カナ' + i, updatedAt: i, contacts: [{ tel: '090-0000-' + i, primary: true }],
        vehicles: [{ id: 'pv' + i, plate: '品川 300 あ ' + i, maker: 'トヨタ', car: car[i % 8] }] });
    }
    state.customers = cust;
    const t0 = performance.now();
    custSuggest('佐藤');                     /* 650人ヒット */
    const t1 = performance.now();
    custSuggest('佐藤 アクア');              /* 2語で絞る */
    const t2 = performance.now();
    const host = document.getElementById('md-body') || document.body;
    const box = host.querySelector('#cf-recall-list');
    const n2 = box.querySelectorAll('.cf-recall-item').length;
    custSuggest('佐藤');
    const n1 = box.querySelectorAll('.cf-recall-item').length;
    return { wide: Math.round(t1 - t0), narrow: Math.round(t2 - t1), n1, n2 };
  });
  ok('🔴 650人ヒットしても全部出る', r.n1 === 650, r.n1);
  ok('2語で絞れる', r.n2 > 0 && r.n2 < r.n1, r);
  ok('🔴 打つたびに引っかからない（1文字ぶん 500ms 未満）', r.wide < 500, r.wide + 'ms');
  console.log('     ⏱ 650人を出すのに ' + r.wide + 'ms ／ 2語で絞ると ' + r.narrow + 'ms');
}

console.log('\n── 🧭 物差しが1本か ──');
{
  const sc = fs.readFileSync('js/search.js', 'utf8');
  ok('🔴 探し方をマスター検索から配っている', /window\.pitSearchNorm/.test(sc) && /window\.pitSearchWords/.test(sc), '');
  const cu = fs.readFileSync('js/customers.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok('🔴 呼び出し側はそれを借りている', /pitSearchWords\(qstr\)/.test(cu) && /pitSearchNorm/.test(cu), '');
  ok('🔴 打ち切りが残っていない（10件も30件も）', !/slice\(0,\s*(10|30)\)/.test(cu) && !/RECALL_MAX/.test(cu), '');
  const sc2 = fs.readFileSync('js/search.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('🔴 マスター検索の顧客も切っていない', !/custHits\.slice/.test(sc2), '');
  ok('カードは今までどおり上位30件のまま', /list\.slice\(0, MAX\)/.test(sc2), '');

  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  for (const v of ['dashboard', 'reserve', 'customers', 'today']) {
    await p.evaluate(x => { try { showView(x); } catch (e) {} }, v);
    await p.waitForTimeout(200);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
