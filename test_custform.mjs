/* PitFlow v1.54.0 ── 登録画面の入力欄／来店履歴のトリガー／ナンバー空欄化 のテスト
   -------------------------------------------------------------------
   ◎ゆうた指定
     ① 顧客一覧からの新規顧客登録が、**新規予約画面と同じ入力**になっていない
        （姓／名で分かれていない・カナの自動入力が効かない・電話3枠が出ない・
          ナンバー入力補助が出ない・メーカー／車種の候補が上に出ない）。
        **全て新規予約登録画面を参照する事。追加車両登録でも同様。**
     ② 来店履歴の記載トリガーが**予約段階で入ってしまっている**。
        **タスクフローを通過して返車まで完了し、実績ボードに乗ったタイミング**で記載する。
        **金額もそこで本当に確定**。
     ③ ナンバーに「0」が入っている82台を**空欄化**する（別スクリプトで1回だけ実行）。
   ◎作りの要点
     🔴 入力補助は **card-detail.js / carname-pit.js の本物を借りている**（写しを作らない）。
        ここが崩れたら落ちるように、**同じ関数を通しているか**も見張る。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8977      ← 別ウィンドウ
     node test_custform.mjs                                                  */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8977;
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
await p.waitForFunction('window.state && window.PitCustReg && window.pitPlateGuideHtml && window.PitCarName', null, { timeout: 25000 });
await p.waitForTimeout(800);

const openNew = async () => {
  await p.evaluate(() => { state.customers = []; state.cards = []; if (window.custCloseModal) custCloseModal(); custNewCustomer(); });
  await p.waitForSelector('#cr-sei', { timeout: 5000 });
  await p.waitForTimeout(250);
};

console.log('\n── ① 🔴 名前が「姓／名」の2枠（新規予約画面と同じ） ──');
{
  await openNew();
  const r = await p.evaluate(() => {
    const box = document.getElementById('cust-modal');
    return {
      sei: !!box.querySelector('#cr-sei'), mei: !!box.querySelector('#cr-mei'),
      seik: !!box.querySelector('#cr-seikana'), meik: !!box.querySelector('#cr-meikana'),
      /* 予約画面と同じ部品（.cf-namebox / .cf-nb-seg）を使っているか */
      sameParts: box.querySelectorAll('.cf-namebox').length === 2 && box.querySelectorAll('.cf-nb-seg').length === 4,
      old: !!box.querySelector('#cr-name')
    };
  });
  ok('姓／名の2枠がある', r.sei && r.mei, r);
  ok('カナもセイ／メイの2枠', r.seik && r.meik, r);
  ok('🔴 新規予約画面と同じ部品を使っている（.cf-namebox）', r.sameParts === true, r);
  ok('1枠の古い欄はもう無い', r.old === false);

  /* 姓／名 → お客様名は半角空白で合成される */
  await p.fill('#cr-sei', '小林'); await p.fill('#cr-mei', '太郎');
  await p.fill('#cr-seikana', 'コバヤシ'); await p.fill('#cr-meikana', 'タロウ');
  await p.fill('#cr-contacts .cr-t1', '090'); await p.fill('#cr-contacts .cr-t2', '1234'); await p.fill('#cr-contacts .cr-t3', '5678');
  await p.evaluate(() => crSave());
  await p.waitForTimeout(400);
  const c = await p.evaluate(() => state.customers[0]);
  ok('お客様名が「姓 名」で合成される', c.name === '小林 太郎', c.name);
  ok('カナも「セイ メイ」で合成される', c.kana === 'コバヤシ タロウ', c.kana);
}

console.log('\n── ① 🔴 カナの自動入力（IMEの読みを拾う） ──');
{
  await openNew();
  const r = await p.evaluate(() => {
    const sei = document.getElementById('cr-sei'), seik = document.getElementById('cr-seikana');
    /* IMEの変換前の読みが来た時と同じ出来事を起こす */
    sei.dispatchEvent(new CompositionEvent('compositionstart'));
    sei.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'こばやし' }));
    const mid = seik.value;
    sei.dispatchEvent(new CompositionEvent('compositionend', { data: '小林' }));
    sei.value = '小林';
    return { mid: mid, end: seik.value };
  });
  ok('🔴 打っている途中でカナ欄にカタカナが入る', r.mid === 'コバヤシ', r);
  ok('🔴 確定してもカナが残る（漢字は入らない）', r.end === 'コバヤシ', r);
  /* 名の方も同じ */
  const r2 = await p.evaluate(() => {
    const mei = document.getElementById('cr-mei'), meik = document.getElementById('cr-meikana');
    mei.dispatchEvent(new CompositionEvent('compositionstart'));
    mei.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'たろう' }));
    mei.dispatchEvent(new CompositionEvent('compositionend', { data: '太郎' }));
    return meik.value;
  });
  ok('名 → メイ も自動で入る', r2 === 'タロウ', r2);
  const src = fs.readFileSync('js/cust-reg.js', 'utf8');
  ok('🔴 自動フリガナは予約画面の本物を借りている（写しでない）', /pitBindAutoKanaSeg\(/.test(src));
}

console.log('\n── ① 🔴 電話は3枠（新規予約画面と同じ） ──');
{
  await openNew();
  const n = await p.evaluate(() => document.querySelectorAll('#cr-contacts .cr-ct .cr-t1, #cr-contacts .cr-ct .cr-t2, #cr-contacts .cr-ct .cr-t3').length);
  ok('3つの枠がある', n === 3, n);
  await p.fill('#cr-contacts .cr-t1', '０９-０');    /* 全角＋ハイフン混じり */
  await p.fill('#cr-contacts .cr-t2', '1234');
  await p.fill('#cr-contacts .cr-t3', '5678９');      /* 桁あふれ（枠の上限で切れる） */
  await p.waitForTimeout(150);
  const v = await p.evaluate(() => ['cr-t1','cr-t2','cr-t3'].map(c => document.querySelector('#cr-contacts .' + c).value));
  ok('🔴 全角→半角・ハイフン落とし・桁あふれを直す（予約画面と同じ）', v[0] === '090' && v[1] === '1234' && v[2] === '5678', v);
  await p.fill('#cr-sei', 'テスト');
  await p.evaluate(() => crSave());
  await p.waitForTimeout(400);
  const tel = await p.evaluate(() => ((state.customers[0] || {}).contacts || [])[0]);
  ok('3枠が「090-1234-5678」に合成される', tel && tel.tel === '090-1234-5678', tel);
  ok('優先の印も付く', !!(tel && tel.primary));
}

console.log('\n── ① 🔴 ナンバー入力補助（地名・分類・かな・番号の4枠） ──');
{
  await openNew();
  const r = await p.evaluate(() => {
    const box = document.getElementById('cust-modal');
    return {
      guide: !!box.querySelector('.cf-plate .cf-plate-guide'),
      grid: box.querySelectorAll('.cf-plate [data-plate]').length,
      main: !!box.querySelector('.cf-plate [data-plate-main]'),
      newveh: !!box.querySelector('.cf-plate [data-plate-newveh]'),
      old: !!box.querySelector('#cr-plate')
    };
  });
  ok('入力補助の枠が出る', r.guide === true, r);
  ok('4つの枠（地名・分類・かな・番号）', r.grid === 4, r.grid);
  ok('まとめて見せる1BOXもある', r.main === true);
  ok('「新規車両」スイッチも予約画面と同じく出る', r.newveh === true);
  ok('素のナンバー欄はもう無い', r.old === false);

  /* 予約画面と同じ＝1BOXを押すとガイドが開く */
  await p.click('#cust-modal .cf-plate [data-plate-main]');
  await p.waitForTimeout(250);
  ok('🔴 1BOXを押すとガイドが開く（予約画面と同じ）', await p.evaluate(() => document.querySelector('#cust-modal .cf-plate').classList.contains('open')));
  await p.fill('#cust-modal .cf-plate-region', '野田');
  await p.fill('#cust-modal .cf-plate-cls', '３００');    /* 全角 */
  await p.fill('#cust-modal .cf-plate-kana', 'ひろ');     /* 2文字 */
  await p.fill('#cust-modal .cf-plate-num', '5５5５');   /* 全角まじり（枠の上限は4文字） */
  await p.waitForTimeout(200);
  const g = await p.evaluate(() => ({
    cls: document.querySelector('#cust-modal .cf-plate-cls').value,
    kana: document.querySelector('#cust-modal .cf-plate-kana').value,
    num: document.querySelector('#cust-modal .cf-plate-num').value,
    main: document.querySelector('#cust-modal [data-plate-main]').value
  }));
  ok('🔴 全角→半角・かな1文字に直す（予約画面と同じ）', g.cls === '300' && g.kana === 'ひ' && g.num === '5555', g);
  ok('🔴 1BOXに「野田 300 ひ 5555」と合成される', g.main === '野田 300 ひ 5555', g.main);
  await p.fill('#cr-sei', 'ナンバー');
  await p.evaluate(() => crSave());
  await p.waitForTimeout(400);
  const veh = await p.evaluate(() => ((state.customers[0] || {}).vehicles || [])[0]);
  ok('その形のまま控えに入る', veh && veh.plate === '野田 300 ひ 5555', veh);
  const src = fs.readFileSync('js/cust-reg.js', 'utf8');
  ok('🔴 入力補助は予約画面の本物を借りている（写しでない）', /pitPlateGuideHtml\(/.test(src) && /pitBindPlateGuide\(/.test(src));
}

console.log('\n── ① 🔴 メーカー・車種の候補が入力欄の上に出る ──');
{
  await p.evaluate(() => {
    /* 候補の元になる過去データを用意（国産のトヨタ・アクア） */
    state.customers = [{ id: 'cuS', name: '過去 太郎', updatedAt: 1, contacts: [],
      vehicles: [{ id: 'vS', plate: '野田 300 あ 1', maker: 'トヨタ', car: 'アクア', boardId: 'default' },
                 { id: 'vS2', plate: '野田 300 あ 2', maker: 'トヨタ', car: 'アクア', boardId: 'default' }] }];
    state.cards = [];
    if (window.pitCarNameReset) pitCarNameReset();
    if (window.custCloseModal) custCloseModal();
    custNewCustomer();
  });
  await p.waitForSelector('#cr-maker', { timeout: 5000 });
  await p.waitForTimeout(300);
  const attached = await p.evaluate(() => {
    const mk = document.querySelector('#cust-modal input[data-cn="maker"]');
    const cr = document.querySelector('#cust-modal input[data-cn="car"]');
    return { mk: !!mk, cr: !!cr };
  });
  ok('メーカー・車種に候補の印が付いている（data-cn）', attached.mk && attached.cr, attached);
  await p.click('#cr-maker');
  await p.type('#cr-maker', 'ト');
  await p.waitForTimeout(400);
  const dd = await p.evaluate(() => {
    const el = document.querySelector('.cn-dd.show') || document.querySelector('.cn-dd');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const inp = document.querySelector('#cr-maker').getBoundingClientRect();
    return { shown: el.classList.contains('show'), text: el.textContent, above: r.top < inp.top };
  });
  ok('🔴 候補が出る', !!dd && dd.shown === true, dd && dd.text);
  ok('候補に「トヨタ」が入っている', !!dd && dd.text.indexOf('トヨタ') >= 0, dd && dd.text.slice(0, 40));
  ok('🔴 候補が入力欄の「上」に出る', !!dd && dd.above === true, dd);
  const src = fs.readFileSync('js/cust-reg.js', 'utf8');
  ok('🔴 候補も予約画面の本物を借りている（PitCarName.mount）', /PitCarName\.mount\(/.test(src));
}

console.log('\n── ① 車両を追加のときも同じ入力（ゆうた指定） ──');
{
  await p.evaluate(() => {
    state.customers = [{ id: 'cuA', name: '既存 太郎', kana: 'キゾン タロウ', updatedAt: 1, contacts: [{ tel: '090-1-1', primary: true }], vehicles: [] }];
    if (window.custCloseModal) custCloseModal();
    custAddVehicleFor('cuA');
  });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const box = document.getElementById('cust-modal');
    return {
      plate4: box.querySelectorAll('.cf-plate [data-plate]').length,
      cn: box.querySelectorAll('input[data-cn]').length,
      name: !!box.querySelector('#cr-sei')   /* 人の欄は出ない */
    };
  });
  ok('🔴 ナンバー入力補助が出る', r.plate4 === 4, r);
  ok('🔴 メーカー・車種の候補も出る', r.cn === 2, r);
  ok('人の欄は出ない（車を足すだけなので）', r.name === false);
}

console.log('\n── ② 🔴 来店履歴は「実績になったもの」だけ ──');
{
  await p.evaluate(() => {
    state.customers = [{ id: 'cuH', name: '履歴 太郎', kana: 'リレキ タロウ', updatedAt: 1, contacts: [],
      vehicles: [{ id: 'vH', plate: '野田 300 か 1111', maker: 'トヨタ', car: 'アクア', boardId: 'default' }] }];
    const mk = (id, st, extra) => Object.assign({ id: id, resNo: id.toUpperCase(), customerId: 'cuH', customer: '履歴 太郎',
      plate: '野田 300 か 1111', maker: 'トヨタ', car: 'アクア', boardId: 'default', reserveDate: '2026-08-01',
      status: st, workTypes: [], estAmount: 10000 }, extra || {});
    state.cards = [
      mk('h1', 'reserved'),                                                   /* 予約中 */
      mk('h2', 'check'),                                                      /* 作業中（点検待ち） */
      mk('h3', 'workDone', { completedAt: '2026-08-02' }),                    /* 作業完了・まだ返車前 */
      mk('h4', 'returned', { }),                                              /* 返車済みだが実績の日付なし */
      mk('h5', 'returned', { completedAt: '2026-08-03', returnDate: '2026-08-03', amountFinal: 55000 })  /* 🔴 実績 */
    ];
    custOpen('cuH');
  });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const box = document.getElementById('cust-modal');
    const rows = [...box.querySelectorAll('.cd-hist .cd-hrow')];
    return {
      rows: rows.length, txt: rows.map(x => x.textContent).join(' | '),
      stat: [...box.querySelectorAll('.cd-stat b')].map(x => x.textContent),
      total: (box.querySelector('.cd-total b') || {}).textContent || '',
      cnt: (box.querySelector('.cd-sect .cd-cnt') && [...box.querySelectorAll('.cd-sect')].map(x => x.textContent).join('|')) || ''
    };
  });
  ok('🔴 実績になった1件だけ並ぶ', r.rows === 1, { rows: r.rows, txt: r.txt.slice(0, 120) });
  ok('🔴 予約中・作業中は出ない', r.txt.indexOf('予約') < 0, r.txt.slice(0, 120));
  ok('🔴 作業完了（返車前）も出ない', r.rows === 1);
  ok('来店回数も実績の数', r.stat[0] === '1', r.stat);
  ok('🔴 金額は確定額（¥55,000）を使う', r.total.indexOf('55,000') >= 0, r.total);
  ok('予約・作業中の件数は見出しに添える', /予約・作業中\s*4件/.test(r.cnt.replace(/\s+/g, ' ')), r.cnt.slice(0, 120));
  ok('実績の日付で出る', r.txt.indexOf('2026-08-03') >= 0, r.txt.slice(0, 80));
}

console.log('\n── ② 1件も実績が無い人は「まだありません」＋予約の件数 ──');
{
  await p.evaluate(() => { state.cards = state.cards.filter(c => c.id !== 'h5'); custCloseModal(); custOpen('cuH'); });
  await p.waitForTimeout(400);
  /* ⚠ .cd-empty は連絡先の欄にも出るので、**来店履歴の欄の中**から取る */
  const t = await p.evaluate(() => {
    const secs = [...document.querySelectorAll('#cust-modal .cd-sec')];
    const sec = secs.find(x => (x.querySelector('.cd-sect') || {}).textContent && x.querySelector('.cd-sect').textContent.indexOf('来店履歴') >= 0);
    return sec ? ((sec.querySelector('.cd-empty') || {}).textContent || '') : '';
  });
  ok('🔴 履歴は0件になる', (await p.evaluate(() => document.querySelectorAll('#cust-modal .cd-hist .cd-hrow').length)) === 0);
  ok('「返車まで終わって実績になった入庫だけ」と伝える', /返車まで終わって実績/.test(t), t.slice(0, 80));
  ok('予約・作業中の件数も伝える', /4件/.test(t), t.slice(0, 120));
}

console.log('\n── ② 車ごとの来店履歴も同じ決まり ──');
{
  await p.evaluate(() => { custCloseModal(); custHistory('cuH', 'vH'); });
  await p.waitForTimeout(350);
  const r = await p.evaluate(() => {
    const box = document.getElementById('cust-modal');
    return { rows: box.querySelectorAll('.cm-hrow').length, empty: (box.querySelector('.cust-empty') || {}).textContent || '' };
  });
  ok('🔴 実績が無ければ1件も出ない', r.rows === 0, r.rows);
  ok('同じ言い方で伝える', /返車まで終わって実績/.test(r.empty), r.empty.slice(0, 80));
  await p.evaluate(() => { custCloseModal(); });
}

console.log('\n── ② 実績の判定は実績ボードと同じ印を見ている ──');
{
  const r = await p.evaluate(() => [
    ['予約中',       pitCardIsDone({ status: 'reserved' })],
    ['作業中',       pitCardIsDone({ status: 'check' })],
    ['作業完了だけ', pitCardIsDone({ status: 'workDone', completedAt: '2026-08-02' })],
    ['返車済みだけ', pitCardIsDone({ status: 'returned' })],
    ['返車＋実績日', pitCardIsDone({ status: 'returned', completedAt: '2026-08-03' })]
  ]);
  ok('🔴 「返車済み＋実績の日付」だけが実績', JSON.stringify(r.map(x => x[1])) === JSON.stringify([false, false, false, false, true]), r);
  const res = fs.readFileSync('js/result.js', 'utf8');
  ok('実績ビューも completedAt と status を見ている（同じ物差し）', /completedAt === dateStr/.test(res) && /'returned'/.test(res));
  const tod = fs.readFileSync('js/today.js', 'utf8');
  ok('🔴 返車時に金額が確定される（amountFinal）', /c\.completedAt = t;/.test(tod) && /c\.amountFinal/.test(tod));
}

console.log('\n── ③ ナンバー空欄化スクリプトの中身（読むだけの見張り） ──');
{
  const fx = fs.readFileSync('../out6/顧客控え_ナンバー0を空にする.js', 'utf8');
  ok('本体の物差し（pitIsRealPlate）を借りている', /pitIsRealPlate/.test(fx));
  ok('🔴 先に控えをダウンロードしてから書き換える', fx.indexOf('download(backup') < fx.indexOf('x.veh.plate = \'\''), '');
  ok('🔴 控えを保存できなければ中止する', /控えを保存できなかったので中止/.test(fx));
  ok('車のデータは消していない（plate を空にするだけ）', !/splice|delete .*vehicles/.test(fx));
  ok('貼っただけでは書き換わらない（run\\(\\) を打つ必要がある）', /return show\(\);/.test(fx));
  ok('操作ログに残す', /pitOpLog/.test(fx));
}

console.log('\n── 既存の作りを壊していないか ──');
{
  /* 予約画面の入力補助が今までどおり動くか（借りる形に直したので） */
  await p.evaluate(() => { state.cards = []; try { localStorage.removeItem('pitflow_draft_card'); } catch (e) {} openNewReserve(); });
  await p.waitForTimeout(800);
  await p.click('#md-body .cf-plate [data-plate-main]');   /* 予約画面も1BOXを押してガイドを開く */
  await p.waitForTimeout(250);
  await p.fill('#md-body .cf-plate-region', '品川');
  await p.fill('#md-body .cf-plate-cls', '５００');
  await p.fill('#md-body .cf-plate-kana', 'あい');
  await p.fill('#md-body .cf-plate-num', '1234');
  await p.waitForTimeout(250);
  const c = await p.evaluate(() => { const id = pitOpenCardId(); return (state.cards.find(x => x.id === id) || {}).plate; });
  ok('🔴 予約画面のナンバー入力補助は今までどおり', c === '品川 500 あ 1234', c);
  await p.evaluate(() => {
    const id = pitOpenCardId(); const x = state.cards.find(k => k.id === id);
    const sei = document.querySelector('#md-body [data-name="sei"]');
    sei.dispatchEvent(new CompositionEvent('compositionstart'));
    sei.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'すずき' }));
    sei.dispatchEvent(new CompositionEvent('compositionend', { data: '鈴木' }));
  });
  await p.waitForTimeout(200);
  const k = await p.evaluate(() => document.querySelector('#md-body [data-name="seiKana"]').value);
  ok('🔴 予約画面の自動フリガナも今までどおり', k === 'スズキ', k);
  const nv = await p.evaluate(() => !!document.querySelector('#md-body [data-plate-newveh]'));
  ok('「新規車両」スイッチも残っている', nv === true);
}

console.log('\n── ④ 🔴 車検の諸費用は上下の矢印を出さない（手で打つ欄） ──');
{
  await p.evaluate(() => {
    state.cards = []; try { localStorage.removeItem('pitflow_draft_card'); } catch (e) {}
    if (window.custCloseModal) custCloseModal();
    openNewReserve();
  });
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const id = pitOpenCardId(); const c = state.cards.find(x => x.id === id);
    const wt = (state.workTypes || []).find(w => /車検/.test(w.label)) || (state.workTypes || [])[0];
    if (wt) c.workType = wt.id;
    renderCardForm(c);
  });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const host = document.getElementById('md-body');
    const fee = host.querySelector('[data-key="feeAmount"]');
    const est = host.querySelector('[data-key="estAmount"]');
    return {
      fee: !!fee, nospin: fee ? fee.hasAttribute('data-nospin') : null,
      feeAp: fee ? getComputedStyle(fee).appearance : null,
      feeType: fee ? fee.type : null,
      estNospin: est ? est.hasAttribute('data-nospin') : null,
      estAp: est ? getComputedStyle(est).appearance : null
    };
  });
  ok('諸費用の欄が出る（車検のとき）', r.fee === true, r);
  ok('🔴 上下の矢印を出さない印が付いている', r.nospin === true, r);
  ok('🔴 実際につまみが消えている（appearance:textfield）', r.feeAp === 'textfield', r.feeAp);
  ok('数字の欄であることは変えていない', r.feeType === 'number', r.feeType);
  ok('🔴 ほかの金額欄（概算）は今までどおり', r.estNospin === false && r.estAp !== 'textfield', r);
}

console.log('\n── ソースの見張り ──');
{
  const cd = fs.readFileSync('js/card-detail.js', 'utf8');
  const ix = fs.readFileSync('index.html', 'utf8');
  ok('入力補助の貸し出し口がある', /window\.pitPlateGuideHtml/.test(cd) && /window\.pitBindPlateGuide/.test(cd) && /window\.pitBindAutoKanaSeg/.test(cd));
  ok('予約画面も同じ配線を通している', /_bindPlateGuide\(root\.querySelector\('\.cf-plate'\)/.test(cd));
  const vs = [ (ix.match(/app-version" content="([\d.]+)"/) || [])[1],
               (ix.match(/login-ver">v([\d.]+)</) || [])[1],
               (ix.match(/class="ver">v([\d.]+)</) || [])[1] ];
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  ok('直した3本にキャッシュ番号が付いている', /customers\.js\?v=\d+/.test(ix) && /cust-reg\.js\?v=\d+/.test(ix) && /card-detail\.js\?v=\d+/.test(ix));
  const cr = fs.readFileSync('js/cust-reg.js', 'utf8');
  ok('起動ログの版表記も直っている', !/登録画面 v1\.52\.0/.test(cr));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
