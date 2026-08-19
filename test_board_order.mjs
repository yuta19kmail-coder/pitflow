/* PitFlow v1.140.0 ── タスクボードの並び順のテスト
   -------------------------------------------------------------------
   ◎見張っているもの（ゆうた指定 2026-08-18）
     ① マスター並び（board-order.js）
        ・番号を持っていないカードに、**いまの並びのまま** 10,20,30… と振る
        ・🔴 **配列の順が入れ替わっても、画面の並びは変わらない**（＝勝手に並び替わらない）
        ・人が掴んで落とした時だけ番号が変わる
        ・新しく来たカード・工程を移したカードは**列のいちばん下**
     ② 一時並び替え（board-sort.js）
        ・入庫日が早い順／代車リミットが近い順（超過が上・代車なしは下）／金額が大きい順（暫定含め）
        ・🔴 **データを触らない**＝解除するとマスター並びがそのまま戻る
        ・並び替え中は**カードを掴めない**／区切りラインは**薄く出たまま**
     ③ メンバー絞り込み（myonly-pit.js）
        ・選んだ1人だけ残る
        ・🔴 **担当車両と同時には効かない**
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8952      ← 別ウィンドウ
     node test_board_order.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8952/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.PitBoardOrder && window.PitBoardSort && window.PitMyOnly', null, { timeout: 20000 });
await p.waitForTimeout(600);

const COL = st => '#kanban-cols-1 .kanban-col-body[data-drop-val="' + st + '"]';
const seq = st => p.evaluate(sel => Array.from(document.querySelector(sel).children)
  .filter(el => el.getAttribute('data-card-id')).map(el => el.getAttribute('data-card-id')), COL(st));
const seqAll = st => p.evaluate(sel => Array.from(document.querySelector(sel).children)
  .map(el => el.getAttribute('data-card-id') ? ('card:' + el.getAttribute('data-card-id'))
        : (el.getAttribute('data-lineid') ? 'LINE' : null)).filter(Boolean), COL(st));
const orders = () => p.evaluate(() => state.cards.map(c => [c.id, c.boardOrder]));

/* 盤面を作る。入庫日・代車・金額・担当をバラバラにして、3つの物差しが効くか見る */
async function setup(){
  await p.evaluate(() => {
    state.settings.boardLines = [];
    const D = n => { const d = new Date(); d.setDate(d.getDate() + n); return window.ymd(d); };
    state.cards = [
      /* id, 入庫日, 代車の返す日, 金額 */
      { id:'A', resNo:'A', customer:'あ 太郎', car:'アクア', status:'check', boardId:'default', division:'div1',
        reserveDate: D(-3), reserveTime:'10:00', needLoaner:true,  loanerTo: D(5),  amountQuote: 50000,  frontStaff:'甲', workTypes:[] },
      { id:'B', resNo:'B', customer:'い 次郎', car:'ノート', status:'check', boardId:'default', division:'div1',
        reserveDate: D(-7), reserveTime:'09:00', needLoaner:true,  loanerTo: D(-2), amountQuote: 30000,  frontStaff:'乙', workTypes:[] },
      { id:'C', resNo:'C', customer:'う 三郎', car:'フィット', status:'check', boardId:'default', division:'div1',
        reserveDate: D(-1), reserveTime:'08:00', needLoaner:false,                  amountOrder: 300000, frontStaff:'甲', workTypes:[] },
      { id:'D', resNo:'D', customer:'え 四郎', car:'タント', status:'check', boardId:'default', division:'div1',
        reserveDate: D(-5), reserveTime:'11:00', needLoaner:true,  loanerTo: D(1),  amountQuote: 120000, frontStaff:'乙', workTypes:[] },
      { id:'E', resNo:'E', customer:'お 五郎', car:'ヴィッツ', status:'work', boardId:'default', division:'div1',
        reserveDate: D(-2), reserveTime:'12:00', needLoaner:false,                  amountQuote: 20000,  frontStaff:'甲', workTypes:[] }
    ];
    state.cards.forEach(c => { delete c.boardOrder; });
    /* 名簿（フロント2人） */
    state.staff = [ { id:'s1', name:'甲', realName:'甲', aliases:['甲'], front:true },
                    { id:'s2', name:'乙', realName:'乙', aliases:['乙'], front:true } ];
    try { localStorage.setItem('pitflow_bn_me', 's1'); } catch(e){}
    window.showView('course1');
  });
  await p.waitForTimeout(400);
}

console.log('\n───── ① マスター並び（board-order.js）─────');
await setup();
ok('番号を持っていないカードに番号が振られる',
   (await orders()).filter(([id, o]) => o != null).length === 5, await orders());
ok('いまの並びのまま 10,20,30… で振られる',
   JSON.stringify(await seq('check')) === JSON.stringify(['A','B','C','D']), await seq('check'));

/* 🔴 いちばん大事なところ：配列の順が入れ替わっても画面の並びは変わらない
   （読み込み直し・自動更新・他の人の編集で起きていたのがこれ） */
await p.evaluate(() => { state.cards.reverse(); window.showView('course1'); });
await p.waitForTimeout(300);
ok('🔴 配列の順が逆さになっても、画面の並びは変わらない',
   JSON.stringify(await seq('check')) === JSON.stringify(['A','B','C','D']), await seq('check'));

/* 人が掴んで落とす＝Cを Aの手前へ */
await p.evaluate(() => { const c = state.cards.find(x=>x.id==='C'), t = state.cards.find(x=>x.id==='A');
  PitBoardOrder.moveBefore(c, t); window.showView('course1'); });
await p.waitForTimeout(300);
ok('人が動かした順になる（C→A→B→D）',
   JSON.stringify(await seq('check')) === JSON.stringify(['C','A','B','D']), await seq('check'));
await p.evaluate(() => { state.cards.sort((a,b)=> a.id < b.id ? -1 : 1); window.showView('course1'); });
await p.waitForTimeout(300);
ok('🔴 動かしたあとに配列が並び替わっても、人が動かした順のまま',
   JSON.stringify(await seq('check')) === JSON.stringify(['C','A','B','D']), await seq('check'));

/* 新しく来たカードは列のいちばん下 */
await p.evaluate(() => {
  state.cards.unshift({ id:'Z', resNo:'Z', customer:'新 六郎', car:'新車', status:'check', boardId:'default',
    division:'div1', reserveDate: window.ymd(new Date()), reserveTime:'09:00', workTypes:[] });
  window.showView('course1');
});
await p.waitForTimeout(300);
ok('新しく来たカードは列のいちばん下（配列の先頭に入れても割り込まない）',
   (await seq('check')).slice(-1)[0] === 'Z', await seq('check'));

/* 工程を移したカードは移った先のいちばん下 */
await p.evaluate(() => { const c = state.cards.find(x=>x.id==='A'); c.status = 'work';
  PitBoardOrder.moveToEnd(c); window.showView('course1'); });
await p.waitForTimeout(300);
ok('工程を移したカードは移った先の列のいちばん下',
   JSON.stringify(await seq('work')) === JSON.stringify(['E','A']), await seq('work'));

/* 🔴 v1.140.1（ゆうた指定）ドラッグで持ってきたら「落とした場所」に入る */
console.log('\n───── ①-b 落とした場所に入る（v1.140.1）─────');
await setup();
/* E（作業中）を、点検待ちの「1枚目と2枚目のあいだ」の余白に落とす */
await p.evaluate(([colSel]) => {
  const body = document.querySelector(colSel);
  const kids = Array.from(body.children).filter(el => el.hasAttribute('data-card-id'));
  const r1 = kids[0].getBoundingClientRect(), r2 = kids[1].getBoundingClientRect();
  const y = (r1.bottom + r2.top) / 2;
  const src = document.querySelector('[data-card-id="E"]');
  const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { bubbles:true, cancelable:true, dataTransfer:dt }));
  const opt = { bubbles:true, cancelable:true, dataTransfer:dt, clientX: r1.left + 10, clientY: y };
  body.dispatchEvent(new DragEvent('dragover', opt));
  body.dispatchEvent(new DragEvent('drop', opt));
  src.dispatchEvent(new DragEvent('dragend', { bubbles:true, cancelable:true, dataTransfer:dt }));
}, [COL('check')]);
await p.waitForTimeout(400);
ok('🔴 列の余白に落とすと、落とした場所に入る（A→E→B→C→D）',
   JSON.stringify(await seq('check')) === JSON.stringify(['A','E','B','C','D']), await seq('check'));

/* いちばん下の余白に落としたら、今までどおり末尾 */
await setup();
await p.evaluate(([colSel]) => {
  const body = document.querySelector(colSel);
  const rb = body.getBoundingClientRect();
  const src = document.querySelector('[data-card-id="E"]');
  const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { bubbles:true, cancelable:true, dataTransfer:dt }));
  const opt = { bubbles:true, cancelable:true, dataTransfer:dt, clientX: rb.left + 10, clientY: rb.bottom - 2 };
  body.dispatchEvent(new DragEvent('dragover', opt));
  body.dispatchEvent(new DragEvent('drop', opt));
  src.dispatchEvent(new DragEvent('dragend', { bubbles:true, cancelable:true, dataTransfer:dt }));
}, [COL('check')]);
await p.waitForTimeout(400);
ok('いちばん下の余白に落としたら末尾（A→B→C→D→E）',
   JSON.stringify(await seq('check')) === JSON.stringify(['A','B','C','D','E']), await seq('check'));

console.log('\n───── ② 一時並び替え（board-sort.js）─────');
await setup();
const master = await seq('check');
await p.evaluate(() => pitBoardSortSet('in'));
await p.waitForTimeout(350);
ok('入庫日が早い順（B→D→A→C）',
   JSON.stringify(await seq('check')) === JSON.stringify(['B','D','A','C']), await seq('check'));
ok('青い帯が出る', await p.evaluate(() => !!document.querySelector('.kb-tmpbar')));
ok('カードに物差しの数字が出る',
   await p.evaluate(() => !!document.querySelector('#kanban-cols-1 .pit-card.kb-sortkey[data-sortkey]')));

await p.evaluate(() => pitBoardSortSet('loaner'));
await p.waitForTimeout(350);
ok('代車リミットが近い順・超過が上・代車なしは下（B→D→A→C）',
   JSON.stringify(await seq('check')) === JSON.stringify(['B','D','A','C']), await seq('check'));

await p.evaluate(() => pitBoardSortSet('amt'));
await p.waitForTimeout(350);
ok('金額が大きい順・暫定含め（C→D→A→B）',
   JSON.stringify(await seq('check')) === JSON.stringify(['C','D','A','B']), await seq('check'));
ok('金額バッジに段が出る（確/受/見/概）',
   /^[確受見概] ¥/.test(await p.evaluate(() => (document.querySelector('#kanban-cols-1 .pit-card.kb-sortkey[data-sortkey]')||{}).getAttribute?.('data-sortkey') || '')),
   await p.evaluate(() => (document.querySelector('#kanban-cols-1 .pit-card.kb-sortkey')||{}).getAttribute?.('data-sortkey')));

/* 🔴 v1.140.1 バッジの中身（時間を出さない・値が無いなら札を付けない） */
await p.evaluate(() => pitBoardSortSet('in'));
await p.waitForTimeout(350);
const badges = () => p.evaluate(() => Array.from(document.querySelectorAll('#kanban-cols-1 .pit-card[data-card-id]'))
  .map(el => [el.getAttribute('data-card-id'), el.getAttribute('data-sortkey')]));
ok('🔴 入庫日のバッジに時間が出ない（8/12 のみ）',
   (await badges()).every(([, v]) => v == null || /^\d+\/\d+$/.test(v)), await badges());
await p.evaluate(() => pitBoardSortSet('loaner'));
await p.waitForTimeout(350);
/* ⚠ 盤ぜんぶを見ているので、作業中の E（代車なし）も入る＝札なしは C と E の2枚 */
ok('🔴 代車が無いカードには札を付けない（C・E だけ札なし）',
   (await badges()).filter(([, v]) => v == null).map(x => x[0]).sort().join(',') === 'C,E', await badges());
ok('代車があるカードには残り日数が出る',
   (await badges()).filter(([, v]) => v != null).every(([, v]) => /^(超過|残)\d+日$/.test(v)), await badges());
ok('🔴 並び替え中は車両注意タブを隠している（CSS）',
   await p.evaluate(() => { const st = Array.from(document.styleSheets).some(sh => { try { return Array.from(sh.cssRules).some(r => /pf-sorting[\s\S]*pcm-cau/.test(r.cssText)); } catch(e){ return false; } }); return st; }));

/* 🔴 データを触っていないこと */
const beforeOrders = JSON.stringify(await orders());
await p.evaluate(() => pitBoardSortSet('in'));
await p.waitForTimeout(300);
ok('🔴 並び替えてもデータ（boardOrder）は1つも変わらない', JSON.stringify(await orders()) === beforeOrders);

/* 並び替え中は掴めない */
await p.evaluate(() => {
  window.__prevented = false;
  const el = document.querySelector('#kanban-cols-1 .pit-card[data-card-id]');
  const ev = new DragEvent('dragstart', { bubbles:true, cancelable:true, dataTransfer:new DataTransfer() });
  el.dispatchEvent(ev);
  window.__prevented = ev.defaultPrevented;
});
ok('🔴 並び替え中はカードを掴めない', await p.evaluate(() => window.__prevented));

await p.evaluate(() => pitBoardSortSet('master'));
await p.waitForTimeout(350);
ok('マスター並びに戻すと元どおり', JSON.stringify(await seq('check')) === JSON.stringify(master), await seq('check'));
ok('帯が消える', await p.evaluate(() => !document.querySelector('.kb-tmpbar')));

/* 🔴 v1.140.2（ゆうた指定）帯の戻すボタンは、青も緑も**「キャンセル」で統一** */
await p.evaluate(() => { pitBoardSortSet('amt'); PitMyOnly.setMember('s2'); });
await p.waitForTimeout(400);
ok('🔴 青い帯のボタンが「キャンセル」',
   (await p.evaluate(() => (document.querySelector('.kb-tmpbar-x') || {}).textContent)) === 'キャンセル');
ok('🔴 緑の帯のボタンも「キャンセル」',
   (await p.evaluate(() => (document.querySelector('.kb-filtbar-x') || {}).textContent)) === 'キャンセル');
await p.evaluate(() => { pitBoardSortSet('master'); pitMemberFilterClear(); });
await p.waitForTimeout(300);

/* 区切りラインは薄く出たまま・掴めない */
await p.evaluate(() => { PitBoardLine.put('default','check','A','今日はここまで'); window.showView('course1'); });
await p.waitForTimeout(300);
const withLine = await seqAll('check');
ok('マスター並びで区切りラインが出ている', withLine.indexOf('LINE') > 0, withLine);
await p.evaluate(() => pitBoardSortSet('amt'));
await p.waitForTimeout(350);
ok('🔴 並び替え中も区切りラインは消えない', (await seqAll('check')).indexOf('LINE') >= 0, await seqAll('check'));
ok('並び替え中の区切りラインは掴めない（draggable が付かない）',
   await p.evaluate(() => { const el = document.querySelector('#kanban-cols-1 [data-lineid]'); return !!el && el.getAttribute('draggable') !== 'true'; }));
ok('並び替え中は右クリックの「この下にラインを入れる」が出ない',
   await p.evaluate(() => PitBoardLine.ctxItem(state.cards.find(c=>c.id==='A')) === null));
await p.evaluate(() => pitBoardSortSet('master'));
await p.waitForTimeout(300);

console.log('\n───── ③ メンバー絞り込み（myonly-pit.js）─────');
await setup();
/* 🔴 v1.140.1（ゆうた報告「数字が全然合わない」）
   メニューに出る台数＝その人を選んだ時に実際に残る枚数、でなければならない。
   ⚠ カードによって frontStaffId が入っていたり名前だけだったりするので、そこも混ぜて試す。 */
await p.evaluate(() => {
  state.cards.find(c => c.id === 'A').frontStaffId = 's1';   /* IDで持っている */
  delete state.cards.find(c => c.id === 'A').frontStaff;
  state.cards.find(c => c.id === 'C').frontStaff = '甲';      /* 名前だけ */
  window.showView('course1');
});
await p.waitForTimeout(300);
await p.evaluate(() => { document.querySelector('.kb-memfilt').click(); });
await p.waitForTimeout(300);
const menuCnt = await p.evaluate(() => Array.from(document.querySelectorAll('.kb-dd [data-memset]'))
  .filter(el => el.getAttribute('data-memset'))
  .map(el => [el.getAttribute('data-memset'), (el.querySelector('.kb-dd-sm') || {}).textContent]));
ok('🔴 メニューの台数が実物と合う（甲＝3台／乙＝2台・IDと名前が混ざっていても）',
   JSON.stringify(menuCnt) === JSON.stringify([['s1','3台'], ['s2','2台']]), menuCnt);
ok('🔴 ボタンに絵文字を付けていない',
   await p.evaluate(() => !/[\u{1F300}-\u{1FAFF}]/u.test(document.querySelector('.kb-memfilt').textContent)));
await p.evaluate(() => { document.body.click(); });
await p.waitForTimeout(200);
await p.evaluate(() => PitMyOnly.setMember('s1'));
await p.waitForTimeout(350);
ok('メニューの台数どおりに残る（甲＝3台）',
   (await seq('check')).length + (await seq('work')).length === 3,
   [await seq('check'), await seq('work')]);
ok('帯にも絵文字を付けていない',
   await p.evaluate(() => !/[\u{1F300}-\u{1FAFF}]/u.test(document.querySelector('.kb-filtbar').textContent)));
await p.evaluate(() => pitMemberFilterClear());
await p.waitForTimeout(300);
await setup();
await p.evaluate(() => PitMyOnly.setMember('s2'));
await p.waitForTimeout(350);
ok('選んだ1人（乙）の担当だけ残る',
   JSON.stringify(await seq('check')) === JSON.stringify(['B','D']), await seq('check'));
ok('緑の帯が出る', await p.evaluate(() => !!document.querySelector('.kb-filtbar')));
await p.evaluate(() => PitMyOnly.set(true));
await p.waitForTimeout(350);
ok('🔴 担当車両を押すとメンバーは外れる（同時に効かない）',
   await p.evaluate(() => PitMyOnly.memberId() === '' && PitMyOnly.isOn() === true));
ok('担当車両＝自分（甲）の担当だけ残る',
   JSON.stringify(await seq('check')) === JSON.stringify(['A','C']), await seq('check'));
await p.evaluate(() => PitMyOnly.setMember('s2'));
await p.waitForTimeout(350);
ok('🔴 メンバーを選ぶと担当車両は外れる（同時に効かない）',
   await p.evaluate(() => PitMyOnly.isOn() === false && PitMyOnly.memberId() === 's2'));
await p.evaluate(() => pitMemberFilterClear());
await p.waitForTimeout(350);
ok('「全部出す」で全部戻る', (await seq('check')).length === 4, await seq('check'));

/* 絞り込み＋並び替えの合わせ技 */
await p.evaluate(() => { PitMyOnly.setMember('s2'); pitBoardSortSet('amt'); });
await p.waitForTimeout(400);
ok('絞り込みと並び替えは同時に効く（乙の担当を金額順＝D→B）',
   JSON.stringify(await seq('check')) === JSON.stringify(['D','B']), await seq('check'));
ok('帯が2本（緑と青）出る',
   await p.evaluate(() => !!document.querySelector('.kb-filtbar') && !!document.querySelector('.kb-tmpbar')));

/* ビューを移ると解除 */
await p.evaluate(() => window.showView('today'));
await p.waitForTimeout(300);
await p.evaluate(() => window.showView('course1'));
await p.waitForTimeout(400);
ok('別のビューへ移ると絞り込みも並び替えも解除される',
   await p.evaluate(() => PitBoardSort.isOn() === false && PitMyOnly.active() === false));

/* 🔴 v1.140.2 お知らせを1本足した（ゆうた「この仕組み自体でお知らせを一本」） */
console.log('\n───── ④ お知らせ ─────');
{
  const n = await p.evaluate(() => (window.PIT_NEWS || []).find(x => x.id === 'n-20260818-boardorder') || null);
  ok('お知らせが1本入っている（id は二度と変えないこと）', !!n);
  ok('お知らせが配列のいちばん先頭にある',
     await p.evaluate(() => ((window.PIT_NEWS || [])[0] || {}).id === 'n-20260818-boardorder'));
  ok('版と日付が入っている', !!(n && n.version === '1.140.2' && n.date === '2026-08-18'), n && [n.version, n.date]);
  ok('🔴 コードの言葉を出していない（boardOrder / status / returnStage）',
     !!n && !/boardOrder|returnStage|frontStaffId|\bstatus\b/.test(n.title + n.body), n && n.title);
  ok('外し方は「キャンセル」で書いてある', !!n && /キャンセル/.test(n.body));
  ok('id が重なっていない',
     await p.evaluate(() => { const ids = (window.PIT_NEWS || []).map(x => x.id); return ids.length === new Set(ids).size; }));
}

console.log('\n───── まとめ ─────');
ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 5));
console.log('\n  ' + pass + ' OK / ' + fail + ' NG\n');
await b.close();
process.exit(fail ? 1 : 0);
