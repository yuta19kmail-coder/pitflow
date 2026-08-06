/* PitFlow v1.52.0 ── 顧客まわり6件のテスト
   -------------------------------------------------------------------
   ◎ゆうた指定
     ① 車両のアーカイブは**顧客一覧の表示から外す**（現所有＋アーカイブで2行→1行に）
     ② 顧客詳細は、車のカードから外し、**来店履歴の下に「アーカイブ車両」欄**（小さいBOX・グレー）
     ③ 顧客一覧の右上「新規入庫（予約画面）」を撤去し **「＋ 新規顧客登録」** に
     ④ 顧客カードからの車両追加と合わせて、**顧客・車両の登録画面を新設して統合**
        （Lステップなど顧客に紐づく部分も新規登録できる）
     ⑤ 🔴 **「都度車両変動」**＝カルテNo.・担当・課は共通／ナンバーなし／
        車種名を新規予約時に手入力→表紙・予約カード・実績・履歴にその名前が出る／
        次の予約でまた別の車種名を同じカルテNo.で
     ⑥ Lステップアイコンを**新規予約の右**へ（有無で位置がガタつかない）
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8975      ← 別ウィンドウ
     node test_custreg.mjs                                                   */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8975;   /* 既定 8975。別のポートで立てたときは PORT=xxxx を付ける */
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());
const okDialog = async () => { await p.waitForSelector('#uid-ok', { timeout: 4000 }); await p.click('#uid-ok'); await p.waitForTimeout(320); };
/* 🔴 v1.54.0 登録画面のナンバーは新規予約画面と同じ「1BOXを押して4枠」方式（素の入力欄は無い） */
const crPlate = async (pg, region, cls, kana, num) => {
  await pg.click('#cust-modal .cf-plate [data-plate-main]');
  await pg.waitForTimeout(200);
  await pg.fill('#cust-modal .cf-plate-region', region);
  await pg.fill('#cust-modal .cf-plate-cls', cls);
  await pg.fill('#cust-modal .cf-plate-kana', kana);
  await pg.fill('#cust-modal .cf-plate-num', num);
  await pg.waitForTimeout(200);
};
/* 「書きかけの予約があります」の確認が挟まらないよう、控えを消してから新規予約を開く */
const newReserve = async (custId, vehId) => {
  await p.evaluate(() => { try { localStorage.removeItem('pitflow_draft_card'); } catch (e) {} });
  await p.evaluate(a => custNewReserveFor(a[0], a[1]), [custId, vehId]);
  await p.waitForFunction(() => { const id = window.pitOpenCardId && pitOpenCardId(); return !!(id && (state.cards || []).some(c => c.id === id && (c.customer || '').trim())); }, null, { timeout: 8000 });
  await p.waitForTimeout(250);
};
const openCardOf = () => p.evaluate(() => { const id = pitOpenCardId(); return (state.cards || []).find(c => c.id === id) || {}; });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1`);
await p.waitForFunction('window.state && window.PitArchive && window.renderCustomers && window.PitCustReg', null, { timeout: 25000 });
await p.waitForTimeout(800);

/* テスト用の顧客をきれいに作る
   ・A さん … 生きてる車 a1／アーカイブ済み a2 （＝一覧では1行になるはず）
   ・B さん … 生きてる車 b1（Lステップ登録済）                                 */
const seed = async () => p.evaluate(() => {
  state.customers = [
    { id:'cuA', name:'テスト 太郎', kana:'テスト タロウ', updatedAt:Date.now(),
      contacts:[{tel:'090-1111-1111', primary:true}],
      vehicles:[
        { id:'a1', plate:'野田300あ1111', maker:'トヨタ', car:'アクア',   boardId:'default', karteNo:'K111', updatedAt:Date.now() },
        { id:'a2', plate:'野田300あ2222', maker:'ホンダ', car:'フィット', boardId:'default', karteNo:'K222', updatedAt:Date.now(),
          archived:true, archivedAt:Date.now(), archivedBy:'テスト', archiveReason:'乗換' }
      ] },
    { id:'cuB', name:'エル 花子', kana:'エル ハナコ', updatedAt:Date.now(), lineStatus:'ok', lstepId:'12345',
      contacts:[{tel:'090-3333-3333', primary:true}],
      vehicles:[ { id:'b1', plate:'野田500か3333', maker:'日産', car:'ノート', boardId:'default', karteNo:'K333', updatedAt:Date.now() } ] }
  ];
  state.cards = [];
  showView('customers'); renderCustomers();
});
await seed(); await p.waitForTimeout(400);

console.log('\n── ① 🔴 アーカイブした車は顧客一覧に出さない（1人1行） ──');
{
  const r = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#cust-thost .ct tbody tr')];
    return { n: rows.length, txt: rows.map(x => x.textContent).join(' | ') };
  });
  ok('2人ぶんで2行だけ（アーカイブ車で増えない）', r.n === 2, r.n);
  ok('生きている車は出る', r.txt.indexOf('アクア') >= 0 && r.txt.indexOf('ノート') >= 0, r.txt.slice(0, 120));
  ok('🔴 アーカイブした車は出ない', r.txt.indexOf('フィット') < 0 && r.txt.indexOf('2222') < 0, r.txt.slice(0, 160));
  ok('データは消していない（2台のまま）', (await p.evaluate(() => state.customers[0].vehicles.length)) === 2);
}

console.log('\n── ⑥ 🔴 Lステップは新規予約の「右」・無い人も位置がずれない ──');
{
  const r = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#cust-thost .ct tbody tr').forEach(tr => {
      const row = tr.querySelector('.ct-actrow'); if (!row) return;
      const kids = [...row.children].map(x => x.className);
      const nb = row.querySelector('.ct-bnew'), li = row.querySelector('.ct-licon'), no = row.querySelector('.ct-licon-none');
      out.push({ kids, newLeft: nb ? Math.round(nb.getBoundingClientRect().left) : null,
                 newRight: nb ? Math.round(nb.getBoundingClientRect().right) : null,
                 hasL: !!li, hasSpacer: !!no,
                 lLeft: li ? Math.round(li.getBoundingClientRect().left) : (no ? Math.round(no.getBoundingClientRect().left) : null) });
    });
    return out;
  });
  ok('行が2つとも取れた', r.length === 2, r.length);
  ok('新規予約 → Lステップ の順に並ぶ', r.every(x => x.kids[0].indexOf('ct-bnew') >= 0), r.map(x => x.kids));
  ok('Lステップがある人には L が出る', r.some(x => x.hasL), r.map(x => x.hasL));
  ok('🔴 無い人には同じ幅の空きマスが入る', r.some(x => x.hasSpacer), r.map(x => x.hasSpacer));
  ok('🔴 新規予約ボタンの左端が全行そろう（ガタつかない）', new Set(r.map(x => x.newLeft)).size === 1, r.map(x => x.newLeft));
  ok('Lステップ枠の左端も全行そろう', new Set(r.map(x => x.lLeft)).size === 1, r.map(x => x.lLeft));
}

console.log('\n── ③ 顧客一覧の右上は「＋ 新規顧客登録」（新規入庫は撤去） ──');
{
  const r = await p.evaluate(() => {
    const btn = document.querySelector('#view-customers .view-actions .vh-btn');
    return { txt: btn ? btn.textContent.trim() : '', on: btn ? btn.getAttribute('onclick') : '' };
  });
  ok('文言が「＋ 新規顧客登録」', r.txt.indexOf('新規顧客登録') >= 0, r.txt);
  ok('🔴 新規入庫（予約画面）は開かない', r.on.indexOf('openNewReserve') < 0 && r.on.indexOf('custNewCustomer') >= 0, r.on);
}

console.log('\n── ② 🔴 顧客詳細：アーカイブ車両は来店履歴の下の欄へ ──');
{
  await p.evaluate(() => custOpen('cuA'));
  await p.waitForTimeout(350);
  const r = await p.evaluate(() => {
    const box = document.getElementById('cust-modal');
    const vehs = [...box.querySelectorAll('.cd-vehs .cd-veh')].map(x => x.textContent);
    const arows = [...box.querySelectorAll('.cd-arow')].map(x => x.textContent);
    const secs = [...box.querySelectorAll('.cd-sect')].map(x => x.textContent.trim());
    const stat = [...box.querySelectorAll('.cd-stat b')].map(x => x.textContent);
    /* 「アーカイブ車両」欄が「来店履歴」より下にあるか（DOM の並びで見る） */
    const idxH = secs.findIndex(s => s.indexOf('来店履歴') >= 0);
    const idxA = secs.findIndex(s => s.indexOf('アーカイブ車両') >= 0);
    return { vehs, arows, secs, stat, idxH, idxA,
             archListGray: !!box.querySelector('.cd-archlist'),
             hasAddBtn: !!box.querySelector('.cd-addveh') };
  });
  ok('車のカードは生きている1台だけ', r.vehs.length === 1 && r.vehs[0].indexOf('アクア') >= 0, r.vehs.length);
  ok('🔴 車のカードにアーカイブ車は無い', !r.vehs.join(' ').includes('フィット'), r.vehs);
  ok('保有台数も生きている台数', r.stat[1] === '1', r.stat);
  ok('「アーカイブ車両」欄がある', r.idxA >= 0, r.secs);
  ok('🔴 来店履歴より「下」にある', r.idxA > r.idxH, { idxH: r.idxH, idxA: r.idxA });
  ok('アーカイブ車が小さいBOXで並ぶ', r.arows.length === 1 && r.arows[0].indexOf('フィット') >= 0, r.arows);
  ok('グレーアウトして出る（.cd-archlist）', r.archListGray === true);
  ok('「車両を追加」ボタンがある', r.hasAddBtn === true);
}

console.log('\n── アーカイブ車が1台も無ければ欄ごと出さない ──');
{
  await p.evaluate(() => custOpen('cuB'));
  await p.waitForTimeout(300);
  const has = await p.evaluate(() => !!document.querySelector('#cust-modal .cd-arow'));
  ok('欄が出ない', has === false);
}

console.log('\n── ④ 新規顧客登録：顧客＋車両＋Lステップをまとめて登録 ──');
{
  await p.evaluate(() => { custCloseModal(); custNewCustomer(); });
  await p.waitForTimeout(320);
  ok('登録画面が開く', await p.evaluate(() => !!document.getElementById('cr-sei')));   /* v1.54.0：名前は姓／名の2枠に */
  ok('Lステップの欄がある（顧客に紐づく部分も登録できる）', await p.evaluate(() => !!document.getElementById('cr-line-status') && !!document.getElementById('cr-lstep')));
  ok('都度車両変動のスイッチがある', await p.evaluate(() => !!document.getElementById('cr-pv')));
  /* 名前なしでは登録できない */
  await p.evaluate(() => crSave());
  await p.waitForTimeout(200);
  ok('🔴 お客様名が空なら登録しない', await p.evaluate(() => !!document.getElementById('cr-sei')));
  await p.fill('#cr-sei', 'シンキ'); await p.fill('#cr-mei', '次郎');
  await p.fill('#cr-seikana', 'シンキ'); await p.fill('#cr-meikana', 'ジロウ');
  await p.fill('#cr-contacts .cr-t1', '090'); await p.fill('#cr-contacts .cr-t2', '9999'); await p.fill('#cr-contacts .cr-t3', '9999');
  await p.fill('#cr-contacts .cr-clabel', '個人携帯');
  await p.selectOption('#cr-line-status', 'ok');
  await p.waitForTimeout(120);
  await p.fill('#cr-lstep', '77777');
  await crPlate(p, '野田', '500', 'さ', '7777');
  await p.fill('#cr-maker', 'スバル');
  await p.fill('#cr-car', 'レヴォーグ');
  await p.fill('#cr-karte', 'K777');
  await p.selectOption('#cr-board', 'default');
  await p.evaluate(() => crSave());
  await p.waitForTimeout(450);
  const r = await p.evaluate(() => {
    const c = state.customers.find(x => x.name === 'シンキ 次郎');
    return c ? { name: c.name, kana: c.kana, tel: (c.contacts[0] || {}).tel, line: c.lineStatus, lstep: c.lstepId,
                 veh: (c.vehicles || []).map(v => ({ plate: v.plate, car: v.car, karte: v.karteNo, pv: !!v.perVisit })) } : null;
  });
  ok('顧客が登録された', !!r && r.name === 'シンキ 次郎', r);
  ok('カナ・連絡先も入る', !!r && r.kana === 'シンキ ジロウ' && r.tel === '090-9999-9999', r);
  ok('🔴 Lステップ（顧客に紐づく部分）も登録できる', !!r && r.line === 'ok' && r.lstep === '77777', r);
  ok('1台目の車も一緒に登録される', !!r && r.veh.length === 1 && r.veh[0].plate === '野田 500 さ 7777' && r.veh[0].karte === 'K777', r && r.veh);
  ok('登録後はその顧客の詳細が開く', await p.evaluate(() => !!document.querySelector('#cust-modal .cd-hname')));
}

console.log('\n── ④ 同じナンバーは登録させない（車を見分ける鍵なので） ──');
{
  await p.evaluate(() => { custCloseModal(); custAddVehicleFor('cuA'); });
  await p.waitForTimeout(300);
  ok('車両追加モードで開く（人の欄は出ない）', await p.evaluate(() => !!document.querySelector('#cust-modal .cr-who') && !document.getElementById('cr-sei')));
  await crPlate(p, '野田', '500', 'か', '3333');   /* B さんの車と同じ */
  await p.evaluate(() => crSave());
  await p.waitForTimeout(250);
  ok('🔴 他の人と同じナンバーは弾く', await p.evaluate(() => !!document.querySelector('#cust-modal .cf-plate')));
  ok('車は増えていない', (await p.evaluate(() => state.customers.find(x => x.id === 'cuA').vehicles.length)) === 2);
}

console.log('\n── ⑤ 🔴 都度車両変動：ナンバーなし・カルテNo共通で登録 ──');
{
  await p.evaluate(() => { custCloseModal(); custAddVehicleFor('cuA'); });
  await p.waitForTimeout(300);
  await p.click('#cr-pv');
  await p.waitForTimeout(150);
  const ui = await p.evaluate(() => ({
    plateHidden: getComputedStyle(document.getElementById('cr-plainveh')).display === 'none',
    noteShown: getComputedStyle(document.getElementById('cr-pvnote')).display !== 'none',
    karteReq: getComputedStyle(document.getElementById('cr-karte-req')).display !== 'none'
  }));
  ok('🔴 ナンバー・メーカー・車種の欄が消える', ui.plateHidden === true, ui);
  ok('説明が出る', ui.noteShown === true);
  ok('カルテNo.が必須になる', ui.karteReq === true);
  await p.evaluate(() => crSave());
  await p.waitForTimeout(200);
  ok('🔴 カルテNo.なしでは登録できない', await p.evaluate(() => !!document.getElementById('cr-karte')));
  await p.fill('#cr-karte', 'K900');
  await p.selectOption('#cr-div', await p.evaluate(() => (state.divisions[0] || {}).id || ''));
  await p.evaluate(() => crSave());
  await p.waitForTimeout(400);
  const v = await p.evaluate(() => {
    const c = state.customers.find(x => x.id === 'cuA');
    const pv = (c.vehicles || []).find(x => x.perVisit);
    return pv ? { plate: pv.plate, karte: pv.karteNo, pv: !!pv.perVisit, id: pv.id, div: pv.division } : null;
  });
  ok('都度車両変動の車ができた', !!v && v.pv === true, v);
  ok('🔴 ナンバーは持たない', !!v && !v.plate, v);
  ok('カルテNo.は共通で持つ', !!v && v.karte === 'K900', v);
  ok('課も共通で持つ', !!v && !!v.div, v);
  const shown = await p.evaluate(() => { custOpen('cuA'); return null; });
  await p.waitForTimeout(300);
  ok('顧客詳細に「都度車両変動」と出る', (await p.evaluate(() => document.querySelector('#cust-modal .cd-vehs').textContent)).indexOf('都度車両変動') >= 0);
  await p.evaluate(() => { custCloseModal(); renderCustomers(); });
  await p.waitForTimeout(300);
  ok('一覧のナンバー欄は「都度変動」の印', (await p.evaluate(() => document.querySelector('#cust-thost').textContent)).indexOf('都度変動') >= 0);
}

console.log('\n── ⑤ 🔴 新規予約：車種名を手入力→カードに乗る／同じカルテNoのまま ──');
{
  const vid = await p.evaluate(() => (state.customers.find(x => x.id === 'cuA').vehicles.find(v => v.perVisit) || {}).id);
  /* 1回目 */
  await newReserve('cuA', vid);
  let c = await openCardOf();
  c = { perVisit: !!c.perVisit, vehId: c.vehId, plate: c.plate, car: c.car, karte: c.karteNo, id: c.id, cust: c.customer };
  ok('カードが都度変動の印を持つ', c.perVisit === true, c);
  ok('🔴 ナンバーは空のまま', !c.plate, c);
  ok('🔴 車種も空＝これから手で入れる', !c.car, c);
  ok('カルテNo.は共通のものが入る', c.karte === 'K900', c);
  ok('お客様は引き継がれる', c.cust === 'テスト 太郎', c);
  const pvUi = await p.evaluate(() => {
    /* 🔴 入庫カードのフォームは置き場所が2つある（#md-body / #md-body-modal）。
       画面全体から探すと前に開いたフォームを拾うので、**いま描いている入れ物の中**だけを見る（v1.44.0 の教訓）。 */
    const host = document.getElementById('md-body');
    const el = host.querySelector('.cf-plate-pv');
    return { badge: !!el, txt: el ? el.textContent : '', plainGuide: !!host.querySelector('.cf-plate-guide') };
  });
  ok('カードのナンバー欄が「都度車両変動」の案内に替わる', pvUi.badge === true && pvUi.txt.indexOf('車種名') >= 0, pvUi.txt.slice(0, 60));
  ok('ナンバー入力ガイドは出ない', pvUi.plainGuide === false);

  /* 車種名を手で入れて保存＝控えに書き戻す */
  const id1 = c.id;
  await p.evaluate(id => {
    const x = state.cards.find(k => k.id === id);
    x.car = 'ハイエース'; x.maker = 'トヨタ'; x._draft = false;
    upsertCustomerFromCard(x);
  }, id1);
  await p.waitForTimeout(300);
  let after = await p.evaluate(() => {
    const cu = state.customers.find(x => x.id === 'cuA');
    const pv = cu.vehicles.find(v => v.perVisit);
    return { nVeh: cu.vehicles.length, plate: pv.plate, car: pv.car, last: pv.lastCar, karte: pv.karteNo };
  });
  ok('🔴 車は増えない（毎回1件のまま）', after.nVeh === 3, after);
  ok('🔴 車の側の名前は書き換えない', !after.car, after);
  ok('前回の車種名だけ控える', after.last === 'トヨタ ハイエース', after);
  ok('カルテNo.は変わらない', after.karte === 'K900', after);

  /* 2回目＝別の車種名を同じカルテNo.で */
  await newReserve('cuA', vid);
  const c2x = await openCardOf();
  const c2 = { car: c2x.car, karte: c2x.karteNo, id: c2x.id, perVisit: !!c2x.perVisit };
  ok('🔴 2回目は別のカードになる（前のを使い回さない）', c2.id !== id1, { one: id1, two: c2.id });
  ok('🔴 2回目も車種は空から（前回のを引きずらない）', !c2.car, c2);
  ok('🔴 カルテNo.は同じまま', c2.karte === 'K900', c2);
  await p.evaluate(id => {
    const x = state.cards.find(k => k.id === id);
    x.car = 'キャラバン'; x.maker = '日産'; x._draft = false;
    upsertCustomerFromCard(x);
  }, c2.id);
  await p.waitForTimeout(300);
  after = await p.evaluate(() => {
    const cu = state.customers.find(x => x.id === 'cuA');
    return { nVeh: cu.vehicles.length, last: cu.vehicles.find(v => v.perVisit).lastCar };
  });
  ok('🔴 2回目でも車は増えない', after.nVeh === 3, after);
  ok('前回の控えが新しい方に入れ替わる', after.last === '日産 キャラバン', after);

  /* 🔴 過去の予約は当時の車種名のまま残る */
  const hist = await p.evaluate((a) => {
    const one = state.cards.find(k => k.id === a[0]), two = state.cards.find(k => k.id === a[1]);
    return { one: one.car, two: two.car };
  }, [id1, c2.id]);
  ok('🔴 過去の予約は当時の車種名のまま', hist.one === 'ハイエース' && hist.two === 'キャラバン', hist);

  /* 履歴（顧客詳細）にその名前が出る */
  /* 🔴 v1.54.0 来店履歴に載るのは「返車済み＋実績の日付が入ったもの」だけになった */
  await p.evaluate(() => {
    state.cards.forEach(k => { if (k.customerId === 'cuA'){ k.status = 'returned'; k.completedAt = '2026-08-06'; k.returnDate = '2026-08-06'; } });
    custOpen('cuA');
  });
  await p.waitForTimeout(350);
  const ht = await p.evaluate(() => document.querySelector('#cust-modal .cd-hist').textContent);
  ok('🔴 来店履歴に両方の車種名が出る', ht.indexOf('ハイエース') >= 0 && ht.indexOf('キャラバン') >= 0, ht.slice(0, 200));
}

console.log('\n── 既存の作りを壊していないか ──');
{
  await p.evaluate(() => custCloseModal());
  await seed(); await p.waitForTimeout(350);
  /* 顧客を編集して保存しても、アーカイブと都度変動の印が消えないこと（v1.52.0 で直した所） */
  await p.evaluate(() => {
    const c = state.customers.find(x => x.id === 'cuA');
    c.vehicles.push({ id:'a3', plate:'', maker:'', car:'', karteNo:'K900', perVisit:true, updatedAt:Date.now() });
    custEdit('cuA');
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => custSaveEdit('cuA'));
  await p.waitForTimeout(350);
  const keep = await p.evaluate(() => {
    const c = state.customers.find(x => x.id === 'cuA');
    return { n: c.vehicles.length, arch: !!(c.vehicles.find(v => v.id === 'a2') || {}).archived, pv: !!(c.vehicles.find(v => v.id === 'a3') || {}).perVisit };
  });
  ok('🔴 編集保存でアーカイブの印が消えない', keep.arch === true, keep);
  ok('🔴 編集保存で都度変動の印が消えない', keep.pv === true, keep);
  ok('車の台数も変わらない', keep.n === 3, keep);
  /* ふつうの車の呼び出しは今までどおり */
  await p.evaluate(() => custCloseModal());
  await newReserve('cuB', 'b1');
  const nbx = await openCardOf();
  const nb = { plate: nbx.plate, car: nbx.car, pv: !!nbx.perVisit };
  ok('ふつうの車はナンバーも車種も入る（今までどおり）', nb.plate === '野田500か3333' && nb.car === 'ノート' && nb.pv === false, nb);
  /* アーカイブ済みの顧客は今までどおり一覧から消える */
  await p.evaluate(() => { PitArchive.archiveCust('cuB'); showView('customers'); renderCustomers(); });
  await p.waitForTimeout(400);
  const t = await p.evaluate(() => document.querySelector('#cust-thost').textContent);
  ok('顧客ごとアーカイブすると一覧から消える（今までどおり）', t.indexOf('エル 花子') < 0, t.slice(0, 120));
  await p.evaluate(() => { custToggleArchived(); });
  await p.waitForTimeout(400);
  const t2 = await p.evaluate(() => document.querySelector('#cust-thost').textContent);
  ok('🔴 アーカイブ検索では車も今までどおり出る（持ち主のとばっちり分は隠さない）', t2.indexOf('ノート') >= 0, t2.slice(0, 160));
}

console.log('\n── ソースの見張り ──');
{
  const cs = fs.readFileSync('js/customers.js', 'utf8');
  const cr = fs.readFileSync('js/cust-reg.js', 'utf8');
  const cd = fs.readFileSync('js/card-detail.js', 'utf8');
  const ix = fs.readFileSync('index.html', 'utf8');
  ok('一覧・詳細は archive-pit.js の判定を通している', /PitArchive\.vehSelfArchived/.test(cs));
  ok('カードの「＋この顧客で新規車両」が登録画面に統合されている', /PitCustReg\.open\(/.test(cd));
  ok('登録画面は PitDB.save を通す', /PitDB\.save\(\)/.test(cr));
  /* ⚠ 版の数字はテストに書かない（デザインや別件で上がるたびに落ちるため）。
        「ログイン画面・トップバー・app-version の3つがそろっているか」だけ見る（2026-08-05 の決めごと）。 */
  const vs = [ (ix.match(/app-version" content="([\d.]+)"/) || [])[1],
               (ix.match(/login-ver">v([\d.]+)</) || [])[1],
               (ix.match(/class="ver">v([\d.]+)</) || [])[1] ];
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  ok('cust-reg.js が読み込まれている', /js\/cust-reg\.js\?v=/.test(ix));
  ok('customers.js にキャッシュ番号が付いている', /js\/customers\.js\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
