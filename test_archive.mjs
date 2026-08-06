/* PitFlow v1.49.0 ── 顧客・車両の「アーカイブ」テスト
   -------------------------------------------------------------------
   ◎ゆうた指定
     ・**「消す」をやめて「アーカイブ」に。** アーカイブすると
       ダッシュボードの検索・顧客呼び出しから出なくなる（その入庫カードも）。
       ⚠ **実績ビューなどの集計はそのまま**（数字を変えない）。
     ・顧客画面に「**アーカイブ済みを見る**」の切替。そこから開いて**戻せる**。
     ・**車両にも同じ仕組み**。乗換で降りた車を片付けられる。履歴は残る。
     ・🔴 **戻すのは管理者だけ。アーカイブは誰でも。**
     ・新規予約の「この顧客で新規車両」を **乗り換え／増車** の2択に。
     ・車を切り替えた時に **カルテNo.が前の車のまま残るバグ**を直す。
   ◎作りの要点
     🔴 **データは消さない**＝印（archived / archivedAt / archivedBy / archiveReason）を立てるだけ。
     🔴 顧客をアーカイブしたら車も**まとめてアーカイブ扱い**だが、
        **車のデータは書き換えない**＝顧客を戻すと車も元どおり（個別に片付けた車は片付いたまま）。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8962      ← 別ウィンドウ
     node test_archive.mjs                                                   */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());   /* ブラウザ標準の窓が出たら OK（ふだんは出ない） */
/* 🔴 v1.49.1 確認は**アプリの中のダイアログ（ui-dialog.js）**になった。
   ⚠ ブラウザの窓ではないので `page.on('dialog')` では取れない。**OKボタンを押す**。 */
const okDialog = async () => {
  await p.waitForSelector('#uid-ok', { timeout: 4000 });
  await p.click('#uid-ok');
  await p.waitForTimeout(350);
};

/* 🔴 v1.54.0 登録画面のナンバーは、新規予約画面と同じ「1BOXを押して4枠」方式。
   ⚠ 素の入力欄は無い。押してガイドを開いてから入れる。 */
const crPlate = async (pg, region, cls, kana, num) => {
  await pg.click('#cust-modal .cf-plate [data-plate-main]');
  await pg.waitForTimeout(200);
  await pg.fill('#cust-modal .cf-plate-region', region);
  await pg.fill('#cust-modal .cf-plate-cls', cls);
  await pg.fill('#cust-modal .cf-plate-kana', kana);
  await pg.fill('#cust-modal .cf-plate-num', num);
  await pg.waitForTimeout(200);
};

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8962/index.html?demo=1');
await p.waitForFunction('window.state && window.PitArchive && window.renderCustomers', null, { timeout: 20000 });
await p.waitForTimeout(800);

/* 顧客2人・車3台・入庫カード3枚をきれいに作り直す
   ・A さん … 車 a1(所沢500あ1111) / a2(所沢500あ2222)
   ・B さん … 車 b1(品川300か3333) */
await p.evaluate(() => {
  state.customers = [
    { id:'cuA', name:'アーカイブ 太郎', kana:'アーカイブ タロウ', updatedAt:Date.now(),
      contacts:[{tel:'090-1111-1111', primary:true}],
      vehicles:[
        { id:'a1', plate:'所沢500あ1111', maker:'トヨタ', car:'アクア',   boardId:'default', karteNo:'K111', updatedAt:Date.now() },
        { id:'a2', plate:'所沢500あ2222', maker:'ホンダ', car:'フィット', boardId:'default', karteNo:'K222', updatedAt:Date.now() }
      ] },
    { id:'cuB', name:'ノコリ 花子', kana:'ノコリ ハナコ', updatedAt:Date.now(),
      contacts:[{tel:'090-3333-3333', primary:true}],
      vehicles:[ { id:'b1', plate:'品川300か3333', maker:'日産', car:'ノート', boardId:'default', karteNo:'K333', updatedAt:Date.now() } ] }
  ];
  const mk = (id, cu, plate, car) => ({ id:id, resNo:id.toUpperCase(), customerId:cu, customer:(cu==='cuA'?'アーカイブ 太郎':'ノコリ 花子'),
    car:car, maker:'トヨタ', plate:plate, tel:'090-0000-0000', reserveDate: window.ymd(new Date()),
    reserveTime:'10:00', status:'returned', returnDate: window.ymd(new Date()), boardId:'default',
    division:'div1', workTypes:[], dropType:'wait', amountFinal:10000 });
  state.cards = [ mk('kA1','cuA','所沢500あ1111','アクア'), mk('kA2','cuA','所沢500あ2222','フィット'), mk('kB1','cuB','品川300か3333','ノート') ];
});
const searchCards = q => p.evaluate(x => (window.pitSearchRun ? pitSearchRun(x) : null), q);
/* 検索は内部関数なので、画面の検索欄を使って結果の行数で見る */
const searchHits = async (q) => {
  await p.evaluate(() => showView('dashboard'));
  await p.waitForTimeout(400);
  await p.fill('#mydash-search-input', q);
  await p.waitForTimeout(500);
  return p.evaluate(() => {
    const box = document.getElementById('mydash-search-results');
    return { txt: box ? box.textContent : '', rows: box ? box.querySelectorAll('.psr-row').length : 0 };
  });
};

console.log('\n── ① アーカイブ前は今までどおり検索に出る ──');
{
  const r = await searchHits('アーカイブ');
  ok('顧客もカードも検索に出る', r.rows >= 2 && r.txt.indexOf('アーカイブ 太郎') >= 0, r.rows);
}

console.log('\n── ② 🔴 顧客をアーカイブすると検索から消える（カードごと） ──');
{
  ok('アーカイブできた', await p.evaluate(() => PitArchive.archiveCust('cuA') === true));
  ok('印が立っている（消してはいない）', await p.evaluate(() => {
    const c = state.customers.find(x => x.id === 'cuA');
    return !!c && c.archived === true && !!c.archivedAt;
  }));
  ok('🔴 顧客データは残っている（人数は減らない）', (await p.evaluate(() => state.customers.length)) === 2);
  ok('🔴 入庫カードも消していない', (await p.evaluate(() => state.cards.length)) === 3);
  const r = await searchHits('アーカイブ');
  ok('🔴 ダッシュボード検索に出ない', r.txt.indexOf('アーカイブ 太郎') < 0, r.txt.slice(0, 80));
  const r2 = await searchHits('所沢500あ1111');
  ok('🔴 その人の入庫カードも検索に出ない', r2.rows === 0, r2.rows);
  const r3 = await searchHits('ノコリ');
  ok('ほかの顧客は今までどおり出る', r3.txt.indexOf('ノコリ 花子') >= 0, r3.txt.slice(0, 80));
}

console.log('\n── ③ 新規予約の「顧客呼び出し」にも出ない ──');
{
  const hit = await p.evaluate(() => {
    const vis = (state.customers || []).filter(c => PitArchive.custVisible(c)).map(c => c.name);
    return vis;
  });
  ok('🔴 呼び出しの候補から外れている', hit.indexOf('アーカイブ 太郎') < 0 && hit.indexOf('ノコリ 花子') >= 0, hit);
  const src = fs.readFileSync('js/customers.js', 'utf8');
  ok('顧客呼び出しが判定を通している', /PitArchive\.custVisible\(c\)/.test(src) && /PitArchive\.vehArchived\(c,v\)/.test(src));
}

console.log('\n── ④ 🔴 顧客をアーカイブすると、その車もまとめてアーカイブ扱い ──');
{
  const st = await p.evaluate(() => {
    const c = state.customers.find(x => x.id === 'cuA');
    return c.vehicles.map(v => ({ id:v.id, self: PitArchive.vehSelfArchived(v), all: PitArchive.vehArchived(c, v) }));
  });
  ok('🔴 2台とも「アーカイブ扱い」', st.every(v => v.all === true), st);
  ok('🔴 でも車のデータは書き換えていない（self は false）', st.every(v => v.self === false), st);
}

console.log('\n── ⑤ 🔴 戻せるのは管理者だけ ──');
{
  await p.evaluate(() => { window.PIT_CLOUD = true; window.pitIsAdmin = function(){ return false; }; });
  ok('権限の判定が false', (await p.evaluate(() => PitArchive.canRestore())) === false);
  ok('🔴 呼んでも戻せない', (await p.evaluate(() => PitArchive.restoreCust('cuA'))) === false);
  ok('🔴 印はそのまま', (await p.evaluate(() => state.customers.find(x => x.id === 'cuA').archived)) === true);
  ok('アーカイブする方は権限が無くてもできる', (await p.evaluate(() => PitArchive.canArchive())) === true);
  await p.evaluate(() => { window.PIT_CLOUD = false; window.pitIsAdmin = function(){ return true; }; });
  ok('管理者なら戻せる', (await p.evaluate(() => PitArchive.restoreCust('cuA'))) === true);
  ok('印が消えている', (await p.evaluate(() => {
    const c = state.customers.find(x => x.id === 'cuA');
    return !c.archived && !c.archivedAt && !c.archivedBy;
  })));
  const r = await searchHits('アーカイブ');
  ok('🔴 戻したら検索にも戻ってくる', r.txt.indexOf('アーカイブ 太郎') >= 0, r.txt.slice(0, 80));
}

console.log('\n── ⑥ 車だけアーカイブできる（顧客はそのまま） ──');
{
  ok('車をアーカイブできた', await p.evaluate(() => PitArchive.archiveVeh('cuA', 'a1', '乗換') === true));
  ok('🔴 顧客はふつうのまま', (await p.evaluate(() => PitArchive.custArchived(state.customers.find(x => x.id === 'cuA')))) === false);
  const r = await searchHits('所沢500あ1111');
  ok('🔴 その車の入庫カードは検索に出ない', r.rows === 0, r.rows);
  const r2 = await searchHits('所沢500あ2222');
  ok('🔴 もう1台の入庫カードは今までどおり出る', r2.rows >= 1, r2.rows);
  ok('理由（乗換）が残っている', (await p.evaluate(() => {
    const v = state.customers.find(x => x.id === 'cuA').vehicles.find(y => y.id === 'a1');
    return v.archiveReason;
  })) === '乗換');
}

console.log('\n── ⑦ 🔴 顧客を片付けて戻すと、個別に片付けた車は片付いたまま ──');
{
  await p.evaluate(() => PitArchive.archiveCust('cuA'));
  await p.evaluate(() => PitArchive.restoreCust('cuA'));
  const st = await p.evaluate(() => {
    const c = state.customers.find(x => x.id === 'cuA');
    return c.vehicles.map(v => ({ id:v.id, all: PitArchive.vehArchived(c, v) }));
  });
  ok('🔴 a1（個別に片付けた）は片付いたまま', st.find(v => v.id === 'a1').all === true, st);
  ok('🔴 a2（とばっちりだった）は元どおり', st.find(v => v.id === 'a2').all === false, st);
  ok('車も管理者なら戻せる', await p.evaluate(() => PitArchive.restoreVeh('cuA', 'a1') === true));
}

console.log('\n── ⑧ 顧客画面：切替ボタンで「アーカイブ済みだけ」に ──');
{
  await p.evaluate(() => PitArchive.archiveCust('cuB'));
  await p.evaluate(() => showView('customers'));
  await p.waitForTimeout(600);
  ok('切替ボタンがある', (await p.locator('.cust-archbtn').count()) === 1);
  const names1 = await p.evaluate(() => Array.from(document.querySelectorAll('.ct-name')).map(e => e.textContent.trim()).filter(Boolean));
  ok('🔴 ふつうの一覧にアーカイブ済みは出ない', names1.indexOf('ノコリ 花子') < 0 && names1.indexOf('アーカイブ 太郎') >= 0, names1);
  await p.evaluate(() => document.querySelector('.cust-archbtn').click());
  await p.waitForTimeout(500);
  const names2 = await p.evaluate(() => Array.from(document.querySelectorAll('.ct-name')).map(e => e.textContent.trim()).filter(Boolean));
  ok('🔴 切り替えるとアーカイブ済みだけになる', names2.indexOf('ノコリ 花子') >= 0 && names2.indexOf('アーカイブ 太郎') < 0, names2);
  ok('ボタンが押した見た目になる', await p.evaluate(() => document.querySelector('.cust-archbtn').classList.contains('on')));
  /* 詳細を開くと帯と「戻す」が出る */
  await p.evaluate(() => custOpen('cuB'));
  await p.waitForTimeout(500);
  ok('🔴 アーカイブ済みの帯が出る', (await p.locator('.cd-archbar').count()) === 1);
  /* 🔴 v1.49.1 アーカイブ／戻すは**右上の小さいアイコン**になった（文字は title に入る） */
  ok('🔴 管理者には「戻す」のアイコンが出る', (await p.locator('.cd-ico-restore').count()) === 1);
  ok('アイコンだけなので説明（title）が付いている',
     (await p.evaluate(() => (document.querySelector('.cd-ico-restore') || {}).title)) === 'アーカイブから戻す');
  ok('文字の大きいボタンとしては出ていない',
     (await p.evaluate(() => Array.from(document.querySelectorAll('.cd-btn')).every(e => e.textContent.indexOf('戻す') < 0))));
  await p.evaluate(() => { window.PIT_CLOUD = true; window.pitIsAdmin = function(){ return false; }; });
  await p.evaluate(() => custOpen('cuB'));
  await p.waitForTimeout(400);
  ok('🔴 権限が無い人には「戻す」を出さない', (await p.locator('.cd-ico-restore').count()) === 0);
  ok('かわりに鍵のアイコンが出る', (await p.locator('.cd-ico-lock').count()) === 1);
  await p.evaluate(() => { window.PIT_CLOUD = false; window.pitIsAdmin = function(){ return true; }; });
  await p.evaluate(() => { PitArchive.restoreCust('cuB'); if (window.custCloseModal) custCloseModal(); });
}

console.log('\n── ⑨ 🔴 新規予約：乗り換え／増車 の2択 →【v1.52.0】登録画面へ ──');
/* 🔴 v1.52.0 でここの作りが変わった（ゆうた指定）。
   前は「カードの車の欄を空にして手で打ち直す」だったが、
   **新設した『顧客・車両の登録』画面（cust-reg.js）に統合**した。
   ＝2択を選ぶ → 登録画面が開く → 登録すると**その車がカードに入る**。
   ⚠ 乗り換えのときに前の車をアーカイブする、という肝心の部分は変わっていない。 */
{
  const CID = await p.evaluate(() => {
    const c = { id:'arcCard', resNo:'AR1', customerId:'cuA', customer:'アーカイブ 太郎', kana:'アーカイブ タロウ',
      tel:'090-1111-1111', plate:'所沢500あ1111', maker:'トヨタ', car:'アクア', karteNo:'K111',
      drive:['mt'], boardId:'default', division:'div1', reserveDate: window.ymd(new Date()), reserveTime:'10:00',
      status:'reserved', workTypes:[], dropType:'wait' };
    state.cards.push(c); window.openCard(c.id, 'page'); return c.id;
  });
  await p.waitForTimeout(600);
  ok('2択のメニューが出ている', (await p.locator('#cf-veh-menu').count()) === 1);
  const items = await p.evaluate(() => Array.from(document.querySelectorAll('#cf-veh-menu .vh-mi b')).map(e => e.textContent.trim()));
  ok('🔴 「乗り換え」と「増車」の2つ', items.length === 2 && /乗り換え/.test(items[0]) && /増車/.test(items[1]), items);

  /* まず「増車」＝前の車はそのまま。登録画面が開く */
  await p.evaluate(() => cfAddVehicle('add'));
  await okDialog();                                   /* 🔴 確認ダイアログの「増車で登録」を押す */
  await p.waitForTimeout(500);
  ok('🔴 v1.52.0 登録画面が開く', await p.evaluate(() => !!document.getElementById('cr-karte')));
  ok('🔴 増車では前の車をアーカイブしない',
     (await p.evaluate(() => PitArchive.vehSelfArchived(state.customers.find(x=>x.id==='cuA').vehicles.find(v=>v.id==='a1')))) === false);
  /* 🔴 v1.54.0 ナンバーは新規予約画面と同じ入力補助になった（1BOXを押して4枠に入れる） */
  await crPlate(p, '野田', '300', 'さ', '9999');
  await p.fill('#cr-maker', 'スバル');
  await p.fill('#cr-car', 'レガシィ');        await p.fill('#cr-karte', 'K999');
  await p.evaluate(() => crSave());
  await p.waitForTimeout(700);
  const afterAdd = await p.evaluate(id => { const c = state.cards.find(x => x.id === id); return { plate:c.plate, maker:c.maker, car:c.car, karte:c.karteNo, drive:(c.drive||[]).length, cust:c.customer, tel:c.tel }; }, CID);
  ok('🔴 登録した車がカードに入る', afterAdd.plate === '野田 300 さ 9999' && afterAdd.maker === 'スバル' && afterAdd.car === 'レガシィ', afterAdd);
  ok('🔴 カルテNo.も新しい車のものになる（v1.48.1 までのバグ）', afterAdd.karte === 'K999', afterAdd);
  ok('車両注意は空になる（車ごとの情報）', afterAdd.drive === 0, afterAdd);
  ok('🔴 人の情報（名前・TEL）は消えない', afterAdd.cust === 'アーカイブ 太郎' && afterAdd.tel === '090-1111-1111', afterAdd);
  ok('増車なので顧客の車が1台増える',
     (await p.evaluate(() => state.customers.find(x=>x.id==='cuA').vehicles.length)) === 3);

  /* 次に「乗り換え」＝前の車をアーカイブしてから登録画面へ */
  await p.evaluate(id => { const c = state.cards.find(x => x.id === id); c.plate='所沢500あ2222'; c.maker='ホンダ'; c.car='フィット'; c.karteNo='K222'; renderCardForm(c); }, CID);
  await p.waitForTimeout(400);
  await p.evaluate(() => cfAddVehicle('trade'));
  await okDialog();                                   /* 🔴 確認ダイアログの「乗り換えで登録」を押す */
  await p.waitForTimeout(600);
  ok('🔴 乗り換えでは前の車がアーカイブされる',
     (await p.evaluate(() => PitArchive.vehSelfArchived(state.customers.find(x=>x.id==='cuA').vehicles.find(v=>v.id==='a2')))) === true);
  ok('理由が「乗換」で残る',
     (await p.evaluate(() => state.customers.find(x=>x.id==='cuA').vehicles.find(v=>v.id==='a2').archiveReason)) === '乗換');
  ok('🔴 こちらも登録画面が開く', await p.evaluate(() => !!document.getElementById('cr-karte')));
  await crPlate(p, '野田', '300', 'た', '8888'); await p.fill('#cr-karte', 'K888');
  await p.evaluate(() => crSave());
  await p.waitForTimeout(700);
  const afterTrade = await p.evaluate(id => { const c = state.cards.find(x => x.id === id); return { plate:c.plate, karte:c.karteNo }; }, CID);
  ok('こちらも登録した車がカードに入る', afterTrade.plate === '野田 300 た 8888' && afterTrade.karte === 'K888', afterTrade);
  ok('🔴 車のデータは消えていない（アーカイブしただけ）',
     (await p.evaluate(() => state.customers.find(x=>x.id==='cuA').vehicles.filter(v=>v.id==='a1'||v.id==='a2').length)) === 2);
  await p.evaluate(() => {
    const cu = state.customers.find(x=>x.id==='cuA');
    PitArchive.restoreVeh('cuA','a2');
    cu.vehicles = cu.vehicles.filter(v => v.id==='a1' || v.id==='a2');   /* 登録した2台は片付けて、次の⑩へ元の形で渡す */
    if (window.closeDetail) closeDetail();
  });
  await p.waitForTimeout(400);
}

console.log('\n── ⑩ 🔴 実績・売上の集計は変えていない（ゆうた指定） ──');
{
  const files = ['js/result.js', 'js/sales.js', 'js/mech-summary.js'];
  files.forEach(function (f) {
    if (!fs.existsSync(f)) return;
    const src = fs.readFileSync(f, 'utf8');
    ok(f + ' はアーカイブで数字を減らしていない', !/PitArchive/.test(src));
  });
  /* ⚠ 数を決め打ちにしない＝「どのファイルに入れたか」で見る。
     予約・当日・返車・タスクの各ビューは**触っていない**＝現場の作業は今までどおり流れる。 */
  ['js/reserve.js', 'js/today.js', 'js/return.js', 'js/task.js'].forEach(function (f) {
    if (!fs.existsSync(f)) return;
    ok(f + ' は触っていない（現場の流れは今までどおり）', !/PitArchive/.test(fs.readFileSync(f, 'utf8')));
  });
}

console.log('\n── ⑪ 二度と崩れないように（配線チェック） ──');
{
  const a = fs.readFileSync('js/archive-pit.js', 'utf8');
  ok('🔴 判定の物差しが1か所にある', /w\.PitArchive = \{/.test(a));
  ok('戻すのは管理者だけ（関数の頭で見ている）',
     (a.match(/if \(!canRestore\(\)\) return false;/g) || []).length === 2);
  ok('アーカイブは誰でも', /function canArchive\(\)\{ return true; \}/.test(a));
  ok('🔴 データを消していない（splice などしていない）', !/\.splice\(/.test(a));
  const c = fs.readFileSync('js/customers.js', 'utf8');
  ok('🔴 「削除」はもう無い', !/window\.custDelete\s*=/.test(c) && !/custDelete\(/.test(c));
  ok('顧客のアーカイブ／戻すがある', /window\.custArchive\s*=/.test(c) && /window\.custRestore\s*=/.test(c));
  ok('車両のアーカイブ／戻すがある', /window\.custVehArchive\s*=/.test(c) && /window\.custVehRestore\s*=/.test(c));
  const d = fs.readFileSync('js/card-detail.js', 'utf8');
  ok('🔴 車両ごとの欄をぜんぶ空にしている', /c\.plate=''; c\.maker=''; c\.car=''; c\.karteNo='';/.test(d));
  ok('乗り換えは前の車をアーカイブしてから', /PitArchive\.archiveVehByPlate\(c\.customerId, oldPlate, '乗換'\)/.test(d));
  /* 🔴 v1.49.1 ゆうた指定＝どのアーカイブ操作にも確認を入れる。ブラウザ標準の confirm は使わない。 */
  ok('🔴 乗り換え／増車にも確認が入る', /UI\.confirm\(kind === 'trade'/.test(d));
  /* ⚠ 数ではなく「**4つの関数それぞれの中に確認がある**」で見る＝あとで並びが変わっても意味が保たれる。
     ⚠ 開発用の「サンプル顧客を入れ替え」は別物なので数えない。 */
  ['custArchive', 'custRestore', 'custVehArchive', 'custVehRestore'].forEach(function (fn) {
    const i = c.indexOf('window.' + fn + '=');
    const body = i < 0 ? '' : c.slice(i, i + 1200);
    ok('🔴 ' + fn + ' に確認が入っている', /_ask\(/.test(body));
  });
  ok('確認はアプリの中のダイアログを使っている（画面が止まらない）',
     /if\(window\.UI && UI\.confirm\) return UI\.confirm\(title/.test(c));
  ok('切替ボタンの文字が「アーカイブ検索」', /アーカイブ検索/.test(c) && !/アーカイブ済みを見る/.test(c));
  ok('アーカイブ／戻すは小さいアイコン（cd-ico / cd-vico）', /cd-ico-arch/.test(c) && /cd-vico-arch/.test(c));
  const idx = fs.readFileSync('index.html', 'utf8');
  ok('archive-pit.js を読み込んでいる', /js\/archive-pit\.js\?v=/.test(idx));
  ok('archive-pit.js は customers.js より先', idx.indexOf('js/archive-pit.js') < idx.indexOf('js/customers.js'));
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
