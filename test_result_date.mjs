/* PitFlow v1.57.0 ── 実績カウント日（管理だけ変更可）と、完TEL済の「過去の日付」
   -------------------------------------------------------------------
   ◎ゆうた依頼
     ・「**実績に入った車の本当の実績カウント日を変更できるように。これは管理者の権限で**」
     ・「**完TEL済、の場合で返車日・時間が過去の日付が入力されている場合は
       ポップアップで『過去の日付です　このまま実績に登録しますか？』と聞いて、
       OKなら返車カレンダーを通さず、実績にその日付で登録する**」
     ・完TEL依頼側は日付欄が無いので**何もしない**（ゆうた確認済み）
   ◎決めごと
     ・実績日を変えたら**返車日も一緒に動かす**（ゆうた選択）
     ・入口は**カード詳細の中**（ゆうた選択）
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8980      ← 別ウィンドウ
     node test_result_date.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8980;
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
await p.waitForFunction('window.state && window.renderCardView && window.PitReturnPopup', null, { timeout: 25000 });
await p.waitForTimeout(900);

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); const q = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); };
const TODAY = iso(0), PAST = iso(-5), FUTURE = iso(3);

/* 本番と同じ「管理かどうか」の物差しを効かせるため、クラウド扱いにして pitIsAdmin を差し替える */
await p.evaluate(() => {
  window.PIT_CLOUD = true;
  window.__admin = true;
  window.pitIsAdmin = function(){ return !!window.__admin; };
  window.pitCurrentStaffName = function(){ return 'サンプル 花子'; };
});

const mkReturned = async (id, done) => p.evaluate(([i, d]) => {
  state.cards = state.cards.filter(x => x.id !== i);
  state.cards.push({ id: i, resNo: 'R-' + i, status: 'returned', customer: '実績 太郎', car: 'アクア',
    boardId: 'default', division: 'div1', workType: 'shaken',
    reserveDate: d, returnDate: d, returnDateFinal: d, completedAt: d, returnTime: '10:00',
    amountFinal: 120000, log: [], maint: {}, office: {} });
  openCard(i, 'modal');
}, [id, done]);

console.log('\n── 📆 実績カウント日の欄（実績カードだけ・管理だけ直せる） ──');
{
  await mkReturned('RD1', PAST); await p.waitForTimeout(350);
  const r = await p.evaluate(() => {
    const row = document.querySelector('#md-body-modal .cv-resdate');
    return { has: !!row, label: row ? row.querySelector('.cv-frt').textContent.replace(/\s+/g,' ').trim() : '',
             val: row ? row.querySelector('#cv-reslock').textContent.trim() : '',
             edit: !!document.querySelector('#md-body-modal .cv-resdate .cv-unlockbtn'),
             adminOnly: !!document.querySelector('#md-body-modal .cv-resdate .cv-adminonly') };
  });
  ok('実績カードに「実績カウント日」の欄が出る', r.has === true, r);
  ok('何の日か分かる書き方', /実績カウント日/.test(r.label) && /売上/.test(r.label), r.label);
  ok('いまの実績日が出ている', r.val !== '' && r.val !== '—', r);
  ok('管理なら「編集」が出る', r.edit === true && r.adminOnly === false, r);

  /* 管理でない人には編集を出さない */
  const nr = await p.evaluate(() => {
    window.__admin = false;
    renderCardView(state.cards.find(x => x.id === 'RD1'), 'md-body-modal');
    const o = { edit: !!document.querySelector('#md-body-modal .cv-resdate .cv-unlockbtn'),
                adminOnly: !!document.querySelector('#md-body-modal .cv-resdate .cv-adminonly'),
                input: !!document.getElementById('cv-resinput'),
                val: (document.getElementById('cv-reslock')||{}).textContent };
    return o;
  });
  ok('🔴 管理でない人には「編集」を出さない', nr.edit === false && nr.adminOnly === true, nr);
  ok('🔴 入力欄そのものを描かない', nr.input === false, nr);
  ok('日付は見えるだけ残る', !!nr.val && nr.val !== '—', nr);

  /* 管理でない人が直に呼んでも通さない */
  const blocked = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'RD1');
    const before = c.completedAt;
    cvSetResultDate('2026-01-01');
    return { before: before, after: c.completedAt };
  });
  ok('🔴 管理でない人が直に呼んでも変わらない', blocked.before === blocked.after, blocked);

  /* 実績になる前のカードには出さない */
  const before = await p.evaluate(() => {
    window.__admin = true;
    state.cards = state.cards.filter(x => x.id !== 'RD0');
    state.cards.push({ id: 'RD0', resNo: 'R-RD0', status: 'reserved', customer: '予約 次郎', car: 'ノート', log: [] });
    openCard('RD0', 'modal');
    return !!document.querySelector('#md-body-modal .cv-resdate');
  });
  ok('実績になる前のカードには出さない', before === false);
}

console.log('\n── 📆 実績日を変えると、返車日も一緒に動く（ゆうた指定） ──');
{
  await mkReturned('RD2', PAST); await p.waitForTimeout(350);
  const r = await p.evaluate((t) => {
    const c = state.cards.find(x => x.id === 'RD2');
    cvSetResultDate(t);
    return { completedAt: c.completedAt, returnDate: c.returnDate, returnDateFinal: c.returnDateFinal,
             logs: (c.log || []).map(e => e.label || '') };
  }, TODAY);
  ok('🔴 実績カウント日が変わる', r.completedAt === TODAY, r);
  ok('🔴 返車日も一緒に動く', r.returnDate === TODAY && r.returnDateFinal === TODAY, r);
  ok('🔴 フローに「どこから どこへ」が残る', r.logs.some(x => /実績カウント日を/.test(x) && x.indexOf(TODAY) >= 0), r.logs);

  /* 空にはできない（実績から消えてしまうため） */
  const empty = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'RD2');
    cvSetResultDate('');
    return c.completedAt;
  });
  ok('🔴 空にはできない（実績から消えてしまうので）', empty === TODAY, empty);

  /* 逆から：確定返車日を直すと実績日も動く（元からの作り・壊していない） */
  const rev = await p.evaluate((f) => {
    const c = state.cards.find(x => x.id === 'RD2');
    cvSetReturn(f);
    return { completedAt: c.completedAt, returnDate: c.returnDate };
  }, FUTURE);
  ok('確定返車日から直しても実績日が揃う', rev.completedAt === FUTURE && rev.returnDate === FUTURE, rev);

  /* その返車日も、実績カードでは管理だけ */
  const revBlocked = await p.evaluate((t) => {
    window.__admin = false;
    const c = state.cards.find(x => x.id === 'RD2');
    cvSetReturn(t);
    const out = { completedAt: c.completedAt };
    window.__admin = true;
    return out;
  }, TODAY);
  ok('🔴 実績カードの返車日も管理だけ（鍵が抜け道にならない）', revBlocked.completedAt === FUTURE, revBlocked);
}

console.log('\n── 📞 完TEL済で返車予定日が過去 → 聞いてから実績へ ──');
{
  const mkWork = () => p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'RP1');
    state.cards.push({ id: 'RP1', resNo: 'R-RP1', status: 'work', customer: '過去 三郎', car: 'タント',
      boardId: 'default', division: 'div1', workType: 'shaken', estAmount: 55000,
      bayId: 'B1', log: [], coverCall: { done: false, at: '', staff: '' } });
    PitReturnPopup.open('RP1', 'callDone');
  });

  /* ① 過去の日付 → 聞く */
  await mkWork(); await p.waitForTimeout(300);
  const asked = await p.evaluate((d) => {
    let seen = null; const keep = UI.confirm;
    UI.confirm = function(m, o){ seen = { m: m, o: o }; return Promise.resolve(false); };   /* 「日付を直す」 */
    document.getElementById('rp-date').value = d;
    PitReturnPopup.close(true);
    UI.confirm = keep;
    return { seen: seen, open: document.getElementById('rp-backdrop').classList.contains('show') };
  }, PAST);
  await p.waitForTimeout(250);
  const afterNo = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'RP1');
    return { status: c.status, stage: c.returnStage, completedAt: c.completedAt,
             open: document.getElementById('rp-backdrop').classList.contains('show') };
  });
  ok('🔴 過去の日付だと聞いてくる', !!asked.seen && /過去の日付です/.test(asked.seen.m), asked.seen);
  ok('選択肢は「実績に登録する」「日付を直す」', asked.seen && asked.seen.o.ok === '実績に登録する' && asked.seen.o.cancel === '日付を直す', asked.seen && asked.seen.o);
  ok('🔴 「日付を直す」ならポップアップは閉じない', afterNo.open === true, afterNo);
  ok('🔴 「日付を直す」なら何も書き込まない', afterNo.status === 'work' && !afterNo.stage && !afterNo.completedAt, afterNo);

  /* ② 過去の日付 → OK → 返車カレンダーを通さず実績へ */
  const done = await p.evaluate((d) => {
    const keep = UI.confirm;
    UI.confirm = function(){ return Promise.resolve(true); };
    document.getElementById('rp-date').value = d;
    document.getElementById('rp-amt').value = '78,000';
    PitReturnPopup.close(true);
    UI.confirm = keep;
    return true;
  }, PAST);
  await p.waitForTimeout(400);
  const res = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'RP1');
    return { status: c.status, completedAt: c.completedAt, returnDate: c.returnDate, returnDateFinal: c.returnDateFinal,
             amountFinal: c.amountFinal, stage: c.returnStage, call: c.coverCall && c.coverCall.done,
             bay: c.bayId, logs: (c.log || []).map(e => e.label || ''),
             open: document.getElementById('rp-backdrop').classList.contains('show') };
  });
  ok('🔴 その日付で実績になる', res.status === 'returned' && res.completedAt === PAST, res);
  ok('🔴 返車日もその日付', res.returnDate === PAST && res.returnDateFinal === PAST, res);
  ok('🔴 売上が固まる（入力した確定金額）', res.amountFinal === 78000, res);
  ok('完TEL済の印が付く', res.call === true, res);
  ok('PIT枠から外れる', !res.bay, res);
  ok('フローに残る', res.logs.some(x => /そのまま実績へ/.test(x) && x.indexOf(PAST) >= 0), res.logs);
  ok('ポップアップは閉じる', res.open === false, res);

  /* 🔴 返車カレンダーに出てこない（返車ビューの絞り込みと同じ条件で確かめる） */
  const cal = await p.evaluate((d) => {
    const c = state.cards.find(x => x.id === 'RP1');
    return { inReturnCal: (c.returnDate === d && c.status !== 'returned' && c.returnStage === 'returnWait') };
  }, PAST);
  ok('🔴 返車カレンダーには置かれない', cal.inReturnCal === false, cal);

  /* 🔴 実績ビューの数え方（result.js）と、来店履歴の数え方（customers.js）で拾える */
  const counted = await p.evaluate((d) => {
    const c = state.cards.find(x => x.id === 'RP1');
    return { result: (c.completedAt === d && (c.status === 'workDone' || c.status === 'returned')),
             visit: !!(c.status === 'returned' && String(c.completedAt || '').trim()) };
  }, PAST);
  ok('🔴 実績ビューがその日で数える', counted.result === true, counted);
  ok('🔴 来店履歴（実績だけ）にも乗る', counted.visit === true, counted);

  /* ③ 今日・未来はいままでどおり（聞かない・返車カレンダーへ） */
  for (const [d, name] of [[TODAY, '今日'], [FUTURE, '未来']]){
    await mkWork(); await p.waitForTimeout(250);
    const r = await p.evaluate((dd) => {
      let asked = 0; const keep = UI.confirm;
      UI.confirm = function(){ asked++; return Promise.resolve(true); };
      document.getElementById('rp-date').value = dd;
      PitReturnPopup.close(true);
      UI.confirm = keep;
      const c = state.cards.find(x => x.id === 'RP1');
      return { asked: asked, status: c.status, stage: c.returnStage, completedAt: c.completedAt || '' };
    }, d);
    await p.waitForTimeout(200);
    ok(name + 'の日付では聞かない', r.asked === 0, r);
    ok(name + 'は今までどおり返車予定へ', r.status === 'workDone' && r.stage === 'returnWait' && r.completedAt === '', r);
  }

  /* ④ 日付が空（返車未定）も今までどおり */
  await mkWork(); await p.waitForTimeout(250);
  const blank = await p.evaluate(() => {
    let asked = 0; const keep = UI.confirm;
    UI.confirm = function(){ asked++; return Promise.resolve(true); };
    document.getElementById('rp-date').value = '';
    PitReturnPopup.close(true);
    UI.confirm = keep;
    const c = state.cards.find(x => x.id === 'RP1');
    return { asked: asked, stage: c.returnStage, status: c.status };
  });
  ok('日付が空なら聞かない（返車未定のまま）', blank.asked === 0 && blank.stage === 'returnWait' && blank.status === 'workDone', blank);

  /* ⑤ 完TEL依頼は今までどおり（日付欄が無いので何もしない） */
  const req = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'RP2');
    state.cards.push({ id: 'RP2', resNo: 'R-RP2', status: 'work', customer: '依頼 四郎', car: 'ノート', estAmount: 30000, log: [] });
    PitReturnPopup.open('RP2', 'callReq');
    const dateShown = document.getElementById('rp-date-field').style.display !== 'none';
    let asked = 0; const keep = UI.confirm;
    UI.confirm = function(){ asked++; return Promise.resolve(true); };
    PitReturnPopup.close(true);
    UI.confirm = keep;
    const c = state.cards.find(x => x.id === 'RP2');
    return { dateShown: dateShown, asked: asked, stage: c.returnStage, status: c.status };
  });
  await p.waitForTimeout(200);
  ok('完TEL依頼には日付欄が出ない', req.dateShown === false, req);
  ok('完TEL依頼では聞かない（今までどおり完TEL待ちへ）', req.asked === 0 && req.stage === 'callWait' && req.status === 'workDone', req);
}

console.log('\n── ソースの見張り ──');
{
  const rp = fs.readFileSync('js/return-popup.js', 'utf8');
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  ok('過去日の判定は「今日より前」だけ', /dChk < todayISO\(\)/.test(rp));
  ok('🔴 実績化は当日ビューと同じ形（status/completedAt/amountFinal）',
     /c\.status = 'returned';/.test(rp) && /c\.completedAt = d;/.test(rp) && /c\.amountFinal =/.test(rp));
  ok('実績日を直せるかの物差しは pitIsAdmin', /pitIsAdmin\(\)/.test(cv) && /function canEditResultDate/.test(cv));
  ok('実績日を変えたら返車日も動かしている', /_c\.completedAt = v;[\s\S]{0,200}_c\.returnDate = v;/.test(cv));

  const ix = fs.readFileSync('index.html', 'utf8');
  const vs = [(ix.match(/app-version" content="([\d.]+)"/) || [])[1],
              (ix.match(/login-ver">v([\d.]+)</) || [])[1],
              (ix.match(/class="ver">v([\d.]+)</) || [])[1]];
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  /* 🔴 版は上がる一方なので、決め打ちで書かない（毎回テストが古くなるため）。
     **この節を書いた時の版（1.57.0）より下がっていないこと**だけを見る。 */
  const _num = v => String(v||'').split('.').map(Number);
  const _ge = (a, b) => { const x=_num(a), y=_num(b);
    for (let i=0;i<3;i++){ if ((x[i]||0) !== (y[i]||0)) return (x[i]||0) > (y[i]||0); } return true; };
  ok('版が v1.57.0 より下がっていない', _ge(vs[0], '1.57.0'), vs);
  ok('直した3本にキャッシュ番号が付いている',
     /card-view\.js\?v=\d+/.test(ix) && /return-popup\.js\?v=\d+/.test(ix) && /card-view\.css\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
