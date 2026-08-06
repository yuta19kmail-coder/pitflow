/* PitFlow v1.53.0 ── 予約から顧客控えを作るところの直し4件のテスト
   -------------------------------------------------------------------
   ◎背景（2026-08-06 本番調査）
     本番 6,238人／予約142枚を数えたところ
       ・**カナだけで受けた予約 14枚が、1枚残らず顧客控えに残っていなかった**（取りこぼし100%）
       ・ナンバーが「0」の車が **82台**、複数のお客様にまたがっていた（「1」も2台）
     原因＝控えを作る側が **漢字の欄しか見ていない**／**「0」を車の見分けに使っていた**。

   ◎ゆうた確認のうえ直した4件
     ① カナだけのお客様も顧客として登録する（一覧・詳細の名前も、漢字が無ければカナ）
     ② 「0」「1」「なし」「未定」「新規車両」等は**車の見分けに使わない**（データは消さない）
     ③ ナンバーで当てても**名前が明らかに違えば、名前・TELを上書きしない**（知らせて何もしない）
     ④ TELが空の同姓同名は、**カナも一致**していなければ同じ人と決めない

   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8976      ← 別ウィンドウ
     node test_custlink.mjs                                                   */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8976;
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
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.state && window.upsertCustomerFromCard && window.pitIsRealPlate', null, { timeout: 25000 });
await p.waitForTimeout(800);

/* 控えを入れ替えて、1枚のカードを保存した結果を返す（closeDetail が呼ぶ関数そのものを叩く） */
const run = (existing, card) => p.evaluate(a => {
  state.customers = JSON.parse(JSON.stringify(a[0]));
  const c = Object.assign({ id: 'ct' + Math.floor(Math.random() * 1e9) }, a[1]);
  upsertCustomerFromCard(c);
  return {
    n: state.customers.length,
    people: state.customers.map(x => ({
      name: x.name || '', kana: x.kana || '',
      tel: ((x.contacts || [])[0] || {}).tel || '',
      veh: (x.vehicles || []).map(v => (v.plate || '(空)') + ':' + (v.maker || '') + (v.car || ''))
    })),
    linked: c.customerId || '', vehId: c.vehId || ''
  };
}, [existing, card]);

/* 本番と同じ形の控え（「0」の車を持つ人を2人＝82台問題の縮図） */
const BASE = [
  { id: 'cu1', name: '鈴木 一郎', kana: 'スズキ イチロウ', updatedAt: 1, contacts: [{ tel: '090-1111-1111', primary: true }],
    vehicles: [{ id: 'v1', plate: '野田 300 あ 1111', maker: 'トヨタ', car: 'プリウス', karteNo: 'K1' }] },
  { id: 'cu2', name: '渡辺 悟', kana: 'ワタナベ サトル', updatedAt: 1, contacts: [{ tel: '080-9569-4843', primary: true }],
    vehicles: [{ id: 'v2', plate: '0', maker: 'ダイハツ', car: 'ムーヴ', karteNo: 'K2' }] },
  { id: 'cu3', name: 'ミズグチ', kana: 'ミズグチ', updatedAt: 1, contacts: [{ tel: '090-2555-2442', primary: true }],
    vehicles: [{ id: 'v3', plate: '0', maker: '日産', car: 'セレナ', karteNo: 'K3' }] }
];

console.log('\n── ① 🔴 カナだけで受けた新規のお客様が顧客として登録される（14枚の正体） ──');
{
  /* 本番で見つかった実物と同じ形：漢字なし・カナあり・TELあり・ナンバーなし・車種だけ */
  const r = await run(BASE, { customer: '', kana: 'キシダ', seiKana: 'キシダ', tel: '090-9150-6224',
                              plate: '', maker: 'MINI', car: 'MINI', repeat: 'first' });
  ok('🔴 顧客が1人増える（前は増えなかった）', r.n === 4, r.n);
  const me = r.people.find(x => x.kana === 'キシダ');
  ok('カナが控えに入る', !!me, r.people);
  ok('漢字は空のまま（勝手に埋めない）', !!me && me.name === '', me);
  ok('TELも控えに入る', !!me && me.tel === '090-9150-6224', me);
  ok('車も1台つく', !!me && me.veh.length === 1 && /MINI/.test(me.veh[0]), me);
  ok('カードとお客様がひも付く', !!r.linked, r.linked);
}

console.log('\n── ① 同じカナのお客様で2回目の予約＝人も車も増えない ──');
{
  const one = await run(BASE, { customer: '', kana: 'シガ', tel: '080-3693-6877', plate: '', maker: 'スバル', car: 'レヴォーグレバック' });
  const after = await p.evaluate(() => {
    const c2 = { id: 'ct2', customer: '', kana: 'シガ', tel: '080-3693-6877', plate: '', maker: 'スバル', car: 'レヴォーグレバック' };
    upsertCustomerFromCard(c2);
    const me = state.customers.find(x => (x.kana || '') === 'シガ');
    return { n: state.customers.length, veh: (me.vehicles || []).length };
  });
  ok('人は増えない', after.n === one.n, { 1: one.n, 2: after.n });
  ok('🔴 車も増えない（前は保存のたびに1台ずつ増えていた）', after.veh === 1, after.veh);
}

console.log('\n── ① 一覧・詳細の名前が「カナ」で出る ──');
{
  await p.evaluate(() => {
    state.customers = [{ id: 'cuK', name: '', kana: 'キシダ', updatedAt: Date.now(), contacts: [{ tel: '090-9150-6224', primary: true }],
      vehicles: [{ id: 'vK', plate: '', maker: 'MINI', car: 'MINI' }] }];
    state.cards = []; showView('customers'); renderCustomers();
  });
  await p.waitForTimeout(400);
  const t = await p.evaluate(() => document.querySelector('#cust-thost').textContent);
  ok('🔴 顧客一覧に「(無名)」ではなくカナが出る', t.indexOf('キシダ') >= 0 && t.indexOf('(無名)') < 0, t.slice(0, 100));
  await p.evaluate(() => custOpen('cuK'));
  await p.waitForTimeout(350);
  const h = await p.evaluate(() => document.querySelector('#cust-modal .cd-hname').textContent);
  ok('🔴 顧客詳細の見出しもカナ', h.indexOf('キシダ') >= 0, h);
  await p.evaluate(() => custCloseModal());
}

console.log('\n── ② 🔴 意味をなさないナンバーは車の見分けに使わない ──');
{
  const t = await p.evaluate(() => ['0','1','00','なし','無し','未定','不明','新規車両','-','ー','ナンバーなし']
    .map(x => [x, pitIsRealPlate(x)]));
  ok('「0」「1」などは番号として扱わない', t.every(x => x[1] === false), t.filter(x => x[1]));
  const t2 = await p.evaluate(() => ['野田 300 ひ 5555','品川500あ1','足立 300 あ 12'].map(x => [x, pitIsRealPlate(x)]));
  ok('本物のナンバーはちゃんと通る', t2.every(x => x[1] === true), t2);

  /* 「0」で予約を取っても、既に「0」を持っている人に吸い込まれない */
  const r = await run(BASE, { customer: '高橋 三郎', kana: 'タカハシ サブロウ', tel: '090-3333-3333', plate: '0', maker: 'マツダ', car: 'CX-5' });
  ok('🔴 新しいお客様として登録される（前は渡辺様に吸い込まれた）', r.n === 4, r.n);
  const wat = r.people.find(x => x.name === '渡辺 悟');
  ok('🔴 渡辺様の名前が書き換わっていない', !!wat, r.people.map(x => x.name));
  ok('🔴 渡辺様のTELもそのまま', !!wat && wat.tel === '080-9569-4843', wat);
  ok('🔴 渡辺様の車もそのまま（ムーヴのまま）', !!wat && /ムーヴ/.test(wat.veh.join('')), wat);
  const taka = r.people.find(x => x.name === '高橋 三郎');
  ok('新しい人の車は「0」を持たない（控えを汚さない）', !!taka && taka.veh[0].indexOf('(空)') === 0, taka);
  const miz = r.people.find(x => x.name === 'ミズグチ');
  ok('もう1人の「0」の方も無傷', !!miz && /セレナ/.test(miz.veh.join('')), miz);
}

console.log('\n── ② 「新規車両」スイッチを続けて使っても前の人を乗っ取らない ──');
{
  const r = await p.evaluate(() => {
    state.customers = [];
    [['青木 一', '090-0001', '車A'], ['井上 二', '090-0002', '車B'], ['上田 三', '090-0003', '車C']].forEach(function (x, i) {
      upsertCustomerFromCard({ id: 'k' + i, customer: x[0], kana: '', tel: x[1], plate: '新規車両', maker: 'トヨタ', car: x[2] });
    });
    return { n: state.customers.length, names: state.customers.map(c => c.name),
             plates: state.customers.map(c => (c.vehicles || []).map(v => v.plate || '(空)').join(',')) };
  });
  ok('🔴 3人ぶんちゃんと残る（前は1人に潰れていた）', r.n === 3, r);
  ok('名前も3人ぶん', r.names.join(',') === '青木 一,井上 二,上田 三', r.names);
  ok('🔴 「新規車両」という文言を控えに残さない', r.plates.every(x => x === '(空)'), r.plates);
}

console.log('\n── ③ 🔴 ナンバーで当てても名前が違えば上書きしない ──');
{
  const r = await run(BASE, { customer: '新しい 太郎', kana: 'アタラシイ タロウ', tel: '090-6666-6666',
                              plate: '野田 300 あ 1111', maker: 'トヨタ', car: 'プリウス' });
  const suzu = r.people.find(x => x.name === '鈴木 一郎');
  ok('🔴 鈴木様の名前が守られる（前は「新しい 太郎」に化けた）', !!suzu, r.people.map(x => x.name));
  ok('🔴 鈴木様のTELも守られる', !!suzu && suzu.tel === '090-1111-1111', suzu);
  ok('人数は増えない（勝手に別人も作らない）', r.n === 3, r.n);
  ok('カードは誰にもひも付けない', !r.linked, r.linked);
}

console.log('\n── ③ 名前が同じなら今までどおり更新される ──');
{
  const r = await run(BASE, { customer: '鈴木 一郎', kana: 'スズキ イチロウ', tel: '090-1111-9999',
                              plate: '野田 300 あ 1111', maker: 'トヨタ', car: 'プリウス Z' });
  const suzu = r.people.find(x => x.name === '鈴木 一郎');
  ok('TELの変更は反映される', !!suzu && suzu.tel === '090-1111-9999', suzu);
  ok('車種の変更も反映される', !!suzu && /プリウスZ|プリウス Z/.test(suzu.veh.join('')), suzu);
  ok('人数は増えない', r.n === 3, r.n);
}

console.log('\n── ④ 🔴 TELが空の同姓同名は、カナが違えば別人にする ──');
{
  const same = await run(BASE, { customer: '鈴木 一郎', kana: 'スズキ イチロウ', tel: '',
                                 plate: '野田 500 さ 8888', maker: 'スバル', car: 'レヴォーグ' });
  ok('カナも同じなら今までどおり同じ人', same.n === 3, same.n);
  ok('その人に車が足される', (same.people.find(x => x.name === '鈴木 一郎') || {}).veh.length === 2, same.people[0]);

  const diff = await run(BASE, { customer: '鈴木 一郎', kana: 'スズキ カズオ', tel: '',
                                 plate: '野田 500 さ 7777', maker: 'スバル', car: 'インプレッサ' });
  ok('🔴 カナが違えば別人として登録される', diff.n === 4, diff.n);
  ok('元の鈴木様の車は増えていない', (diff.people.find(x => x.kana === 'スズキ イチロウ') || {}).veh.length === 1, diff.people);

  const tel = await run(BASE, { customer: '鈴木 一郎', kana: 'スズキ イチロウ', tel: '090-7777-7777',
                                plate: '野田 500 さ 6666', maker: 'スバル', car: 'BRZ' });
  ok('TELが違えば（カナが同じでも）別人＝今までどおり', tel.n === 4, tel.n);
}

console.log('\n── 何も入っていない予約は今までどおり控えを作らない ──');
{
  const r = await run(BASE, { customer: '', kana: '', tel: '090-0000-0000', plate: '', maker: '', car: '' });
  ok('人は増えない', r.n === 3, r.n);
  const r2 = await run(BASE, { customer: '', kana: '', tel: '', plate: '0', maker: 'トヨタ', car: 'アクア' });
  ok('🔴 名前もカナも無く、ナンバーが「0」だけなら作らない', r2.n === 3, r2.n);
}

console.log('\n── 登録画面（新規顧客）もカナだけでOK ──');
{
  await p.evaluate(() => { state.customers = []; state.cards = []; custCloseModal(); custNewCustomer(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => crSave());
  await p.waitForTimeout(250);
  ok('🔴 漢字もカナも空なら登録しない', await p.evaluate(() => !!document.getElementById('cr-sei')));
  await p.fill('#cr-seikana', 'キシダ');
  await p.fill('#cr-contacts .cr-t1', '090'); await p.fill('#cr-contacts .cr-t2', '9150'); await p.fill('#cr-contacts .cr-t3', '6224');
  await p.evaluate(() => crSave());
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => state.customers.map(c => ({ name: c.name, kana: c.kana })));
  ok('🔴 カナだけで登録できる', r.length === 1 && r[0].kana === 'キシダ' && r[0].name === '', r);
}

console.log('\n── 既存の作りを壊していないか ──');
{
  const r = await run(BASE, { customer: '佐藤 次郎', kana: 'サトウ ジロウ', tel: '090-9999-9999',
                              plate: '野田 500 か 9999', maker: '日産', car: 'ノート' });
  ok('ふつうの新規のお客様は今までどおり増える', r.n === 4, r.n);
  const r2 = await p.evaluate(() => {
    state.customers = JSON.parse(JSON.stringify([{ id: 'cuX', name: '呼出 太郎', kana: 'ヨビダシ タロウ', updatedAt: 1,
      contacts: [{ tel: '090-5555-5555', primary: true }], vehicles: [{ id: 'vx', plate: '野田 300 か 1234', maker: 'トヨタ', car: 'アクア' }] }]));
    const c = { id: 'ctx', customerId: 'cuX', customer: '呼出 太郎（改名）', kana: 'ヨビダシ タロウ', tel: '090-5555-5555',
                plate: '野田 300 か 1234', maker: 'トヨタ', car: 'アクア' };
    upsertCustomerFromCard(c);
    return { n: state.customers.length, name: state.customers[0].name };
  });
  ok('顧客呼び出しでひも付いた人は、名前の直しが今までどおり反映される', r2.n === 1 && r2.name === '呼出 太郎（改名）', r2);
}

console.log('\n── ソースの見張り ──');
{
  const cs = fs.readFileSync('js/customers.js', 'utf8');
  const ar = fs.readFileSync('js/archive-pit.js', 'utf8');
  const cr = fs.readFileSync('js/cust-reg.js', 'utf8');
  const ix = fs.readFileSync('index.html', 'utf8');
  ok('ナンバーの物差しが1か所にある', /function isRealPlate/.test(cs) && /pitIsRealPlate/.test(cs));
  ok('アーカイブ側も同じ物差しを通す', /pitIsRealPlate/.test(ar));
  ok('登録画面も同じ物差しを通す', /pitIsRealPlate/.test(cr));
  ok('名前の出し方も1か所にある', /function custDispName/.test(cs) && /pitCustDispName/.test(cs));
  /* ⚠ 版の数字はテストに書かない（2026-08-05 の決めごと）。3か所がそろっているかだけ見る */
  const vs = [ (ix.match(/app-version" content="([\d.]+)"/) || [])[1],
               (ix.match(/login-ver">v([\d.]+)</) || [])[1],
               (ix.match(/class="ver">v([\d.]+)</) || [])[1] ];
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  ok('直した3本にキャッシュ番号が付いている', /customers\.js\?v=\d+/.test(ix) && /cust-reg\.js\?v=\d+/.test(ix) && /archive-pit\.js\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
