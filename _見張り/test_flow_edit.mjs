/* PitFlow v1.43.0 ── フローを「詳細で足す／編集で直す」に分けた のテスト
   -------------------------------------------------------------------
   ◎考え方（ゆうた指定）
     ① **用件を足すのは「カード詳細」のフロー欄**（チップ／自由入力）。
     ② **「予約を編集」→フローは“本当の編集”**＝すでに入っている記録の
        **日時・担当を書き換える／消す**。
     ③ 🔴 **編集できるのは設定権限（PitFlow の役割＝管理）のある人だけ。**
     ＋ 記録の形が3通り（数値の at／文字の at／atTxt つき）あるので、
        **どの形でも日時が読めて・直せる**ことを見張る。
     ＋ v1.42.0 の見張り（`<i data-ic=…>` の文字が出ていないこと）も続ける。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8955      ← 別ウィンドウ
     node test_flow_edit.mjs                                                 */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:8955/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.PitFlowLog && typeof window.openCard === "function"', null, { timeout: 20000 });
await p.waitForTimeout(600);

/* 記録の形を**3通り＋古いタグ入り**で仕込む＝どの形でも読めて直せるか見る */
const CID = await p.evaluate(() => {
  const now = Date.now();
  const c = {
    id: 'flowedit1', resNo: 'E1', customer: 'フロー 花子', car: 'アクア', maker: 'トヨタ',
    tel: '090-0000-0000', reserveDate: window.ymd(new Date()), reserveTime: '10:00',
    status: 'check', boardId: 'default', division: 'div1', workTypes: [], dropType: 'wait',
    log: [
      /* ① 自動（工程） */
      { label: '点検待ち へ', at: now - 5 * 86400000 },
      /* ② 工程移動（atTxt つき） */
      { type: 'phase', from: 'check', to: 'contact', by: '椎名', at: now - 4 * 86400000, atTxt: '7/31 09:00' },
      /* ③ 古いタグ入りの手記録 */
      { label: '<i data-ic=phone data-ics=16></i> こちらから電話 → 留守（折り返し待ち）',
        at: now - 3 * 86400000, staff: '椎名', manual: true },
      /* ④ at が**文字**の古い記録（予約詳細から入ったもの） */
      { text: '本予約に確定した', at: '8/1 14:30', by: '大野' }
    ]
  };
  state.cards.push(c);
  return c.id;
});

const STAFF = await p.evaluate(() => (state.staff || []).map(s => s.name).filter(Boolean).slice(0, 3));

/* ============================================================ */
console.log('\n── ① 時刻の読み方が1本になっている（記録の形が3通りあっても） ──');
{
  const r = await p.evaluate(id => {
    const l = state.cards.find(c => c.id === id).log;
    return l.map(e => ({ ms: window.PitFlowLog.atMs(e), txt: window.PitFlowLog.atText(e), inp: window.PitFlowLog.atInput(e) }));
  }, CID);
  ok('数値の at が読める', typeof r[0].ms === 'number' && r[0].ms > 0, r[0]);
  ok('atTxt つきも読める', typeof r[1].ms === 'number' && r[1].ms > 0, r[1]);
  ok('🔴 at が「文字」の古い記録も読める', typeof r[3].ms === 'number' && r[3].ms > 0, r[3]);
  ok('画面に出す文字は M/D HH:MM', r.every(x => /^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/.test(x.txt)), r.map(x => x.txt));
  ok('日時ピッカー用の文字も作れる', r.every(x => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.inp)), r.map(x => x.inp));
  const by = await p.evaluate(id => state.cards.find(c => c.id === id).log.map(e => window.PitFlowLog.byOf(e)), CID);
  ok('担当は staff でも by でも読める', by[1] === '椎名' && by[2] === '椎名' && by[3] === '大野', by);
}

/* ============================================================ */
console.log('\n── ② カード詳細のフロー欄から用件を足せる ──');
await p.evaluate(id => window.openCard(id), CID);
await p.waitForTimeout(500);
await p.evaluate(() => {
  const t = Array.from(document.querySelectorAll('#modal-detail .cv-tab')).find(e => /フロー/.test(e.textContent));
  if (t) t.click();
});
await p.waitForTimeout(300);
{
  ok('🔴 「アクションを記録」が詳細にある', (await p.locator('#cv-p-flow .pf-flowadd').count()) === 1);
  const chips = await p.evaluate(() => Array.from(document.querySelectorAll('#cv-p-flow .pf-flowchip')).map(e => e.textContent.trim()));
  ok('チップが8つ', chips.length === 8, chips.length);
  ok('🔴 「data-ic」の文字が出ていない', chips.every(t => t.indexOf('data-ic') < 0), chips.filter(t => t.indexOf('data-ic') >= 0));
  ok('チップに線画アイコンが入っている',
     (await p.evaluate(() => Array.from(document.querySelectorAll('#cv-p-flow .pf-flowchip')).every(e => e.querySelectorAll('svg').length >= 1))));
  ok('担当と時刻の欄がある',
     (await p.locator('#cv-flow-staff').count()) === 1 && (await p.locator('#cv-flow-when').count()) === 1);

  /* 担当を選んで、時刻を変えて、チップを押す */
  const before = await p.evaluate(id => state.cards.find(c => c.id === id).log.length, CID);
  await p.selectOption('#cv-flow-staff', STAFF[0]);
  await p.evaluate(() => { document.getElementById('cv-flow-when').value = '2026-08-02T11:22'; });
  await p.evaluate(() => document.querySelectorAll('#cv-p-flow .pf-flowchip')[3].click());  /* 来店・相談 */
  await p.waitForTimeout(400);
  const added = await p.evaluate(id => { const l = state.cards.find(c => c.id === id).log; return l[l.length - 1]; }, CID);
  ok('🔴 1件増えた', (await p.evaluate(id => state.cards.find(c => c.id === id).log.length, CID)) === before + 1);
  ok('🔴 保存された言葉はプレーン（タグ無し）', added.label === '来店・相談', added.label);
  ok('選んだ担当が入る', added.staff === STAFF[0], added.staff);
  ok('指定した時刻が入る', new Date(added.at).getHours() === 11 && new Date(added.at).getMinutes() === 22, new Date(added.at).toString());
  ok('手で足した印（manual）が付く', added.manual === true);
  ok('画面のタイムラインにもすぐ出る',
     (await p.evaluate(() => document.getElementById('cv-p-flow').textContent)).indexOf('来店・相談') >= 0);

  /* 自由入力 */
  await p.fill('#cv-flow-input', '代車の件で連絡待ち');
  await p.evaluate(() => document.querySelector('#cv-p-flow .pf-flowaddbtn').click());
  await p.waitForTimeout(400);
  const last = await p.evaluate(id => { const l = state.cards.find(c => c.id === id).log; return l[l.length - 1].label; }, CID);
  ok('自由入力でも足せる', last === '代車の件で連絡待ち', last);
  ok('入力欄は空に戻る', (await p.inputValue('#cv-flow-input')) === '');
  ok('🔴 詳細のどこにも「data-ic」の文字が出ていない',
     (await p.evaluate(() => document.getElementById('cv-p-flow').textContent)).indexOf('data-ic') < 0);
}

/* ============================================================ */
console.log('\n── ③ 編集画面のフロー＝日時・担当を直せる（設定権限あり） ──');
await p.evaluate(id => window.openCardEditForm(id), CID);
await p.waitForTimeout(450);
await p.evaluate(() => switchCardTab('flow'));
await p.waitForTimeout(350);
{
  ok('🔴 サンプル（＝権限あり）では編集の表が出る', (await p.locator('.pf-flowedit').count()) === 1);
  ok('用件を足すチップは編集側には無い', (await p.locator('.cf-panel[data-tab="flow"] .pf-flowadd').count()) === 0);
  const rows = await p.evaluate(() => document.querySelectorAll('.pf-ferow').length);
  ok('記録の数だけ行が出る', rows === (await p.evaluate(id => state.cards.find(c => c.id === id).log.length, CID)), rows);
  ok('新しい順（いちばん上が最後に足したもの）',
     (await p.evaluate(() => document.querySelector('.pf-ferow').getAttribute('data-i'))) ===
     String((await p.evaluate(id => state.cards.find(c => c.id === id).log.length - 1, CID))));
  ok('日時ピッカーが行の数だけある', (await p.evaluate(() => document.querySelectorAll('.pf-ferow input[type=datetime-local]').length)) === rows);
  ok('担当セレクトも行の数だけある', (await p.evaluate(() => document.querySelectorAll('.pf-ferow select').length)) === rows);
  ok('🔴 「data-ic」の文字が出ていない',
     (await p.evaluate(() => document.getElementById('md-body-modal').textContent)).indexOf('data-ic') < 0);

  /* 日時を直す（0番＝いちばん古い自動記録） */
  await p.evaluate(() => {
    const row = document.querySelector('.pf-ferow[data-i="0"]');
    const inp = row.querySelector('input[type=datetime-local]');
    inp.value = '2026-07-15T08:05';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(350);
  const e0 = await p.evaluate(id => state.cards.find(c => c.id === id).log[0], CID);
  ok('🔴 日時が書き換わった', new Date(e0.at).getFullYear() === 2026 && new Date(e0.at).getMonth() === 6 && new Date(e0.at).getDate() === 15, new Date(e0.at).toString());
  ok('時分も入る', new Date(e0.at).getHours() === 8 && new Date(e0.at).getMinutes() === 5);

  /* atTxt を持っている記録は atTxt も一緒に直る＝画面と食い違わない */
  await p.evaluate(() => {
    const row = document.querySelector('.pf-ferow[data-i="1"]');
    const inp = row.querySelector('input[type=datetime-local]');
    inp.value = '2026-07-20T16:40';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(350);
  const e1 = await p.evaluate(id => state.cards.find(c => c.id === id).log[1], CID);
  ok('🔴 atTxt を持つ記録は atTxt も一緒に直る', e1.atTxt === '7/20 16:40', e1.atTxt);

  /* at が「文字」だった記録も直せる＝数値になる */
  await p.evaluate(() => {
    const row = document.querySelector('.pf-ferow[data-i="3"]');
    const inp = row.querySelector('input[type=datetime-local]');
    inp.value = '2026-08-03T09:15';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(350);
  const e3 = await p.evaluate(id => state.cards.find(c => c.id === id).log[3], CID);
  ok('🔴 at が文字だった記録も直せる（数値になる）', typeof e3.at === 'number' && new Date(e3.at).getDate() === 3, e3.at);

  /* 担当を直す */
  await p.evaluate(nm => {
    const row = document.querySelector('.pf-ferow[data-i="0"]');
    const sel = row.querySelector('select');
    sel.value = nm;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, STAFF[1]);
  await p.waitForTimeout(350);
  ok('🔴 担当が書き換わった', (await p.evaluate(id => window.PitFlowLog.byOf(state.cards.find(c => c.id === id).log[0]), CID)) === STAFF[1]);
  ok('by で持っていた記録は by 側が変わる', await p.evaluate(async id => {
    const row = document.querySelector('.pf-ferow[data-i="3"]');
    const sel = row.querySelector('select'); sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    return state.cards.find(c => c.id === id).log[3].by === '';
  }, CID));

  /* 手記録は言葉も直せる／自動の記録は直せない */
  ok('手で足した記録は言葉の入力欄がある',
     (await p.evaluate(() => !!document.querySelector('.pf-ferow[data-i="2"] input[type=text]'))));
  ok('🔴 自動（工程）の記録は言葉の入力欄が無い',
     (await p.evaluate(() => !document.querySelector('.pf-ferow[data-i="1"] input[type=text]'))));
  ok('🔴 自動の記録は呼んでも言葉を直せない（画面と裏側が揃っている）',
     (await p.evaluate(id => window.PitFlowLog.setText(id, 1, 'いたずら') === false && window.PitFlowLog.setText(id, 0, 'いたずら') === false, CID)));
  await p.evaluate(() => {
    const inp = document.querySelector('.pf-ferow[data-i="2"] input[type=text]');
    inp.value = 'こちらから電話 → 留守（あとで折り返し）';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(350);
  ok('言葉が書き換わった',
     (await p.evaluate(id => state.cards.find(c => c.id === id).log[2].label, CID)) === 'こちらから電話 → 留守（あとで折り返し）');
  ok('🔴 直した言葉にタグは入らない', await p.evaluate(async id => {
    const inp = document.querySelector('.pf-ferow[data-i="2"] input[type=text]');
    inp.value = '<i data-ic=phone></i> 電話した';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    return state.cards.find(c => c.id === id).log[2].label === '電話した';
  }, CID));

  /* 消す */
  const n0 = await p.evaluate(id => state.cards.find(c => c.id === id).log.length, CID);
  await p.evaluate(() => document.querySelector('.pf-ferow[data-i="2"] .pf-fedel').click());
  await p.waitForTimeout(350);
  ok('🔴 記録を消せる', (await p.evaluate(id => state.cards.find(c => c.id === id).log.length, CID)) === n0 - 1);
  ok('消えたのは狙った1件だけ',
     (await p.evaluate(id => state.cards.find(c => c.id === id).log.some(e => (e.label || '') === '電話した'), CID)) === false);
}

/* ============================================================ */
console.log('\n── ④ 設定権限が無い人は直せない ──');
{
  await p.evaluate(() => { window.PIT_CLOUD = true; window.pitIsAdmin = function(){ return false; }; });
  ok('権限の判定が false になった', (await p.evaluate(() => window.PitFlowLog.canEdit())) === false);
  await p.evaluate(() => switchCardTab('basic'));
  await p.evaluate(() => switchCardTab('flow'));
  await p.evaluate(() => cfFlowRepaint());
  await p.waitForTimeout(350);
  ok('🔴 編集の表が出ない', (await p.locator('.pf-flowedit').count()) === 0);
  ok('🔴 「設定権限（管理）のある人だけ」の断りが出る',
     (await p.evaluate(() => document.getElementById('md-body-modal').textContent)).indexOf('設定権限') >= 0);
  ok('今までどおりタイムラインは見える', (await p.locator('.cf-panel[data-tab="flow"] .cf-flow').count()) === 1);
  /* 直接呼んでも通らない＝画面を隠しただけにしない */
  const before = await p.evaluate(id => JSON.stringify(state.cards.find(c => c.id === id).log), CID);
  const r = await p.evaluate(id => [
    window.PitFlowLog.setAt(id, 0, '2020-01-01T00:00'),
    window.PitFlowLog.setBy(id, 0, 'だれか'),
    window.PitFlowLog.setText(id, 0, 'いたずら'),
    window.PitFlowLog.del(id, 1)
  ], CID);
  ok('🔴 呼んでも全部はじかれる', JSON.stringify(r) === JSON.stringify([false, false, false, false]), r);
  ok('🔴 記録は1文字も変わっていない',
     (await p.evaluate(id => JSON.stringify(state.cards.find(c => c.id === id).log), CID)) === before);
  /* 足すのは権限が無くてもできる（現場の記録なので） */
  ok('用件を足すのは権限が無くてもできる',
     await p.evaluate(id => window.PitFlowLog.add(id, '権限なしでも足せる', 'zz') === true, CID));
  ok('手で足した記録は権限が無くても消せる',
     await p.evaluate(id => { const l = state.cards.find(c => c.id === id).log; return window.PitFlowLog.del(id, l.length - 1) === true; }, CID));
  await p.evaluate(() => { window.PIT_CLOUD = false; window.pitIsAdmin = function(){ return true; }; });
}

/* ============================================================ */
console.log('\n── ⑤ 二度と落ちないように（配線チェック） ──');
{
  const fp = fs.readFileSync('js/flow-pit.js', 'utf8');
  ok('🔴 よくあるアクションに HTML を書いていない', !/var QUICK = \[[^\]]*<i data-ic/.test(fp));
  ok('印はアイコン名（ic）で持っている', /\{ ic: 'phone',\s*label:/.test(fp));
  ok('権限は pitIsAdmin を見ている', /w\.pitIsAdmin && w\.pitIsAdmin\(\)/.test(fp));
  ok('直す系はすべて権限を先に見る',
     (fp.match(/function set(At|By|Text)\([\s\S]{0,80}?if \(!canEdit\(\)\) return false;/g) || []).length === 3);
  const ct = fs.readFileSync('js/card-tabs.js', 'utf8');
  ok('編集側に一覧を二重に持っていない', !/const FLOW_QUICK = \[/.test(ct));
  ok('編集側は PitFlowLog.editHtml を呼んでいる', /PitFlowLog\.editHtml\(c\)/.test(ct));
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  ok('詳細側は PitFlowLog.addHtml を呼んでいる', /PitFlowLog\.addHtml\(c, 'cv'\)/.test(cv));
  ok('詳細側にフローだけ描き直す口がある', /window\.cvFlowRepaint = function/.test(cv));
  const idx = fs.readFileSync('index.html', 'utf8');
  ok('flow-pit.js を読み込んでいる', /js\/flow-pit\.js\?v=/.test(idx));
  ok('flow-pit.js は card-view.js より先', idx.indexOf('js/flow-pit.js') < idx.indexOf('js/card-view.js'));
  /* ⚠ 版は上がっていくので数字は固定しない（決め打ちだと毎回のリリースで落ちる）。
     「ログイン画面の版・トップバーの版・meta app-version の3つがそろっているか」だけ見る。 */
  const _mVer = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _tVer = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _aVer = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_mVer && _mVer === _tVer && _mVer === _aVer, [_mVer, _tVer, _aVer]);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 5));
}

/* ============================================================ */
console.log('\n── ⑥ 打ち間違いは詳細からその場で消せる（手で足した記録だけ） ──');
{
  await p.evaluate(id => window.openCard(id), CID);
  await p.waitForTimeout(450);
  await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll('#modal-detail .cv-tab')).find(e => /フロー/.test(e.textContent));
    if (t) t.click();
  });
  await p.waitForTimeout(300);
  const n = await p.evaluate(id => state.cards.find(c => c.id === id).log.length, CID);
  const dels = await p.evaluate(() => document.querySelectorAll('#cv-p-flow .cv-fdel').length);
  const man = await p.evaluate(id => state.cards.find(c => c.id === id).log.filter(e => e.manual).length, CID);
  ok('🔴 ✕ が出るのは手で足した記録だけ', dels === man, { dels, man });
  await p.evaluate(() => document.querySelector('#cv-p-flow .cv-fdel').click());
  await p.waitForTimeout(350);
  ok('詳細から消せる', (await p.evaluate(id => state.cards.find(c => c.id === id).log.length, CID)) === n - 1);
  ok('🔴 工程の記録は見出しが空にならない',
     (await p.evaluate(() => Array.from(document.querySelectorAll('#cv-p-flow .cv-ft')).every(e => e.textContent.trim().length > 0))));
}

await p.evaluate(id => window.openCardEditForm(id), CID);
await p.waitForTimeout(450);
await p.evaluate(() => switchCardTab('flow'));
await p.waitForTimeout(400);
await p.locator('#modal-detail').screenshot({ path: 'shot_flow_edit.png' });
console.log('\n===== ' + pass + ' OK / ' + fail + ' NG =====');
await b.close();
process.exit(fail ? 1 : 0);
