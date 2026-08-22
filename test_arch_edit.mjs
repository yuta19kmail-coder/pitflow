/* PitFlow v1.171.0 ── 📦 完了アーカイブ（返車済みの記録）を**管理者だけ**あとから直せる
   -------------------------------------------------------------------
   ◎ゆうた依頼（2026-08-22）
     🗣「管理者であっても、埋め込みになってる完TELなどがアーカイブ済みなのをいじれない。
     　　管理者はいじれるようにしてほしい」
   ◎困っていたこと
     返車済みになった瞬間、完TEL・支払い・洗車・お礼LINE・車販依頼は
     **読み取り専用の「完了アーカイブ」**になり、**管理者でも直せなかった**。
     ＝ 完TELの印を付け忘れた／支払いが違った、が分かっても直す場所がどこにも無い。
   ◎決めごと（この試験が見張るもの）
     ・直せるのは**管理だけ**。物差しは `pitCanEditFinal`（＝`pitIsAdmin`）の1本
     ・**ボタンを消しただけにしない**＝書き込む所（`cvPick` ほか）でも同じ条件で止める
     ・**ワンクッション**＝「編集」を押した時だけ開く（記録を勢いで触らない）
     ・**欄も書き込みも増やさない**＝表紙チェックと同じ `pickRow` / `cvPick`
     ・直したら**フローと操作ログに「どこから どこへ」**を必ず残す
     ・🔴 確定金額・実績カウント日・確定返車日は**この枠に入れない**（上のロック行のまま）
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8937      ← 別ウィンドウ
     node test_arch_edit.mjs                                                  */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8937;
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
await p.waitForFunction('window.state && window.renderCardView && window.openCard', null, { timeout: 25000 });
await p.waitForTimeout(900);

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); const q = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); };
const PAST = iso(-6), RECENT = iso(-2);

/* 本番と同じ「管理かどうか」の物差しを効かせる（クラウド扱いにして pitIsAdmin を差し替える） */
await p.evaluate(() => {
  window.PIT_CLOUD = true;
  window.__admin = true;
  window.pitIsAdmin = function () { return !!window.__admin; };
  window.pitCurrentStaffName = function () { return 'サンプル 花子'; };
});
const setAdmin = async (on) => p.evaluate((v) => { window.__admin = v; }, on);

/* 返車済み（実績）＋アーカイブ済みのカードを作って開く */
const mkReturned = async (id, extra) => p.evaluate(([i, d, ex]) => {
  state.cards = state.cards.filter(x => x.id !== i);
  state.cards.push(Object.assign({
    id: i, resNo: 'R-' + i, status: 'returned', customer: 'アーカイブ 太郎', car: 'アクア',
    boardId: 'default', division: 'div1', workType: 'shaken',
    reserveDate: d, returnDate: d, returnDateFinal: d, completedAt: d, returnTime: '10:00',
    amountFinal: 120000, archived: true, archivedAt: Date.now(),
    coverCall: { done: false }, payment: '', needWash: false, washNote: '', noThanksLine: false,
    log: [], maint: {}, office: {}
  }, ex || {}));
  openCard(i, 'modal');
}, [id, PAST, extra || null]);

const look = () => p.evaluate(() => {
  const host = document.getElementById('md-body-modal');
  const arch = host ? host.querySelector('.cv-arch') : null;
  const edit = host ? host.querySelector('.cv-archedit') : null;
  const sect = host ? Array.prototype.filter.call(host.querySelectorAll('.cv-sect'), s => /完了アーカイブ/.test(s.textContent))[0] : null;
  const pk = edit ? Array.prototype.map.call(edit.querySelectorAll('.cv-pk'), x => x.textContent.trim()) : [];
  return {
    ro: !!arch, editing: !!edit,
    sect: sect ? sect.textContent.replace(/\s+/g, ' ').trim() : '',
    btn: !!(sect && sect.querySelector('.cv-unlockbtn')),
    lock: !!(sect && sect.querySelector('.cv-adminonly')),
    rows: pk,
    note: edit ? (edit.querySelector('.cv-archnote') || {}).textContent || '' : '',
    /* 🔴 確定金額・実績カウント日はこの枠の**直せる欄**に入っていないこと
       （案内の文には出てくるので、行の名前だけを見る） */
    inEditMoney: pk.some(k => /確定金額|実績カウント日|確定返車日/.test(k)),
    hasResRow: !!(host && host.querySelector('.cv-resdate'))
  };
});

console.log('\n── ① 返車済みカードの「完了アーカイブ」（管理でない人） ──');
{
  await setAdmin(false);
  await mkReturned('AR1'); await p.waitForTimeout(350);
  const r = await look();
  ok('完了アーカイブの枠が出る（記録として読める）', r.ro === true && r.editing === false, r);
  ok('🔴 管理でない人に「編集」は出ない', r.btn === false, r);
  ok('🔴 代わりに「管理のみ」と出る（無いのか触れないのか分かる）', r.lock === true, r);
}

console.log('\n── ② 管理者には「編集」が出る（押すまでは記録のまま） ──');
{
  await setAdmin(true);
  await p.evaluate(() => renderCardView(state.cards.filter(c => c.id === 'AR1')[0], 'md-body-modal'));
  await p.waitForTimeout(250);
  let r = await look();
  ok('🔴 管理なら「編集」が出る', r.btn === true && r.lock === false, r);
  ok('押すまでは記録のまま（ワンクッション）', r.ro === true && r.editing === false, r);

  await p.click('#md-body-modal .cv-sect-arch .cv-unlockbtn');
  await p.waitForTimeout(300);
  r = await look();
  ok('押すと編集中になる', r.editing === true && r.ro === false, r);
  ok('編集中だと分かる見出し', /編集中/.test(r.sect), r.sect);
  ok('「編集を終える」が出る', r.btn === true, r);
  ok('返車済みだと断ってから開く', /返車済み/.test(r.note), r.note);
  ok('記録に残ることも書いてある', /フロー|操作ログ/.test(r.note), r.note);
  ok('🔴 完TELが直せる', r.rows.indexOf('完TEL') >= 0, r.rows);
  ok('支払い・洗車・お礼LINE・車販依頼も直せる',
     ['支払い', '洗車', '洗車備考', 'お礼LINE', '車販依頼', '依頼メモ'].every(k => r.rows.indexOf(k) >= 0), r.rows);
  ok('🔴🔴 確定金額・実績カウント日・確定返車日はこの枠に入れない', r.inEditMoney === false, r);
  ok('実績カウント日は今までどおり上の欄にある', r.hasResRow === true, r);
}

console.log('\n── ③ 直せる／直したら記録に残る ──');
{
  const chip = async (label, text) => p.evaluate(([l, t]) => {
    const rows = document.querySelectorAll('#md-body-modal .cv-archedit .cv-pickrow');
    for (const row of rows) {
      const k = row.querySelector('.cv-pk');
      if (!k || k.textContent.trim() !== l) continue;
      const c = Array.prototype.filter.call(row.querySelectorAll('.cv-chip'), x => x.textContent.trim() === t)[0];
      if (c) { c.click(); return true; }
    }
    return false;
  }, [label, text]);

  ok('完TELの「済」を押せた', await chip('完TEL', '済') === true);
  await p.waitForTimeout(250);
  let r = await p.evaluate(() => {
    const c = state.cards.filter(x => x.id === 'AR1')[0];
    return { done: !!(c.coverCall && c.coverCall.done), at: (c.coverCall || {}).at || '',
             flow: (c.log || []).map(e => e.text || e.title || e.msg || JSON.stringify(e)).join(' / ') };
  });
  ok('🔴 完TELが「済」になった（返車済みの車でも直せた）', r.done === true, r);
  ok('誰がいつ押したかも残る', r.at !== '', r);
  ok('🔴 フローに「どこから どこへ」が残る', /完了アーカイブを直した/.test(r.flow) && /完TEL/.test(r.flow) && /未/.test(r.flow) && /済/.test(r.flow), r.flow);

  ok('洗車の「要」を押せた', await chip('洗車', '要') === true);
  await p.waitForTimeout(200);
  await p.evaluate(() => {
    const rows = document.querySelectorAll('#md-body-modal .cv-archedit .cv-pickrow');
    for (const row of rows) {
      const k = row.querySelector('.cv-pk');
      if (k && k.textContent.trim() === '洗車備考') {
        const i = row.querySelector('input');
        i.value = '外だけ・室内は不要';
        i.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await p.waitForTimeout(250);
  r = await p.evaluate(() => {
    const c = state.cards.filter(x => x.id === 'AR1')[0];
    return { wash: !!c.needWash, note: c.washNote || '',
             flow: (c.log || []).map(e => e.text || e.title || e.msg || JSON.stringify(e)).join(' / ') };
  });
  ok('洗車が「要」になった', r.wash === true, r);
  ok('洗車備考が入った', r.note === '外だけ・室内は不要', r);
  ok('洗車備考の直しも記録に残る', /洗車備考/.test(r.flow), r.flow);

  await p.click('#md-body-modal .cv-sect-arch .cv-unlockbtn');   /* 編集を終える */
  await p.waitForTimeout(300);
  const back = await look();
  ok('「編集を終える」で記録の姿に戻る', back.ro === true && back.editing === false, back);
  const shown = await p.evaluate(() => (document.querySelector('#md-body-modal .cv-arch') || {}).textContent || '');
  ok('戻った記録に、直した内容が出ている', /済/.test(shown) && /外だけ/.test(shown), shown.slice(0, 120));
}

console.log('\n── ④ 🔴 ボタンを消しただけにしない（書き込む所でも止める） ──');
{
  await setAdmin(false);
  await p.evaluate(() => renderCardView(state.cards.filter(c => c.id === 'AR1')[0], 'md-body-modal'));
  await p.waitForTimeout(250);
  const before = await p.evaluate(() => {
    const c = state.cards.filter(x => x.id === 'AR1')[0];
    return { done: !!(c.coverCall || {}).done, note: c.washNote || '', memo: c.salesReqMemo || '', n: (c.log || []).length };
  });
  await p.evaluate(() => { try { cvPick('call', 'ng', null); } catch (e) {} });
  await p.evaluate(() => { try { cvWashNote('勝手に書き換え'); } catch (e) {} });
  await p.evaluate(() => { try { cvSalesMemo('勝手に書き換え'); } catch (e) {} });
  await p.waitForTimeout(250);
  const after = await p.evaluate(() => {
    const c = state.cards.filter(x => x.id === 'AR1')[0];
    return { done: !!(c.coverCall || {}).done, note: c.washNote || '', memo: c.salesReqMemo || '', n: (c.log || []).length };
  });
  ok('🔴 管理でない人が呼んでも完TELは変わらない', after.done === before.done && after.done === true, { before, after });
  ok('🔴 洗車備考も変わらない', after.note === before.note, { before, after });
  ok('🔴 依頼メモも変わらない', after.memo === before.memo, { before, after });
  ok('記録も増えていない', after.n === before.n, { before, after });
  const denied = await p.evaluate(() => {
    const ov = document.getElementById('uid-ov');
    return !!(ov && ov.classList.contains('open')) ? (ov.textContent || '') : '';
  });
  ok('🔴 なぜ直せないかを窓で言う（黙って何も起きない、にしない）', /管理/.test(denied), denied.slice(0, 90));
  ok('その窓にもエラー番号が出る', /PF-0021/.test(denied), denied.slice(0, 120));
  /* 断りの窓を閉じてから次へ（開いたままだと以降のクリックを全部ふさぐ） */
  for (let i = 0; i < 5; i++) {
    const open = await p.evaluate(() => {
      const ov = document.getElementById('uid-ov');
      if (!ov || !ov.classList.contains('open')) return false;
      const x = document.getElementById('uid-ok'); if (x) x.click();
      return true;
    });
    await p.waitForTimeout(200);
    if (!open) break;
  }
}

console.log('\n── ⑤ 別のカードを開いたら編集中は閉じる ──');
{
  await setAdmin(true);
  await p.evaluate(() => renderCardView(state.cards.filter(c => c.id === 'AR1')[0], 'md-body-modal'));
  await p.waitForTimeout(200);
  await p.click('#md-body-modal .cv-sect-arch .cv-unlockbtn');
  await p.waitForTimeout(250);
  ok('AR1 は編集中', (await look()).editing === true);
  await mkReturned('AR2'); await p.waitForTimeout(350);
  ok('🔴 別のカードは記録のまま開く（編集中を持ち越さない）', (await look()).editing === false);
}

console.log('\n── ⑥ 返車前のカードは今までどおり（巻き込んでいない） ──');
{
  await setAdmin(false);
  await p.evaluate((RECENT) => {
    state.cards = state.cards.filter(x => x.id !== 'AR3');
    state.cards.push({ id: 'AR3', resNo: 'R-AR3', status: 'workDone', customer: '作業中 次郎', car: 'ヤリス',
      boardId: 'default', division: 'div1', workType: 'shaken', reserveDate: RECENT,
      coverCall: { done: false }, log: [], maint: {}, office: {} });
    openCard('AR3', 'modal');
  }, RECENT);
  await p.waitForTimeout(350);
  const r = await p.evaluate(() => {
    const host = document.getElementById('md-body-modal');
    const rows = Array.prototype.map.call(host.querySelectorAll('.cv-pk'), x => x.textContent.trim());
    return { arch: !!host.querySelector('.cv-arch'), edit: !!host.querySelector('.cv-archedit'), rows: rows };
  });
  ok('返車前に完了アーカイブは出ない', r.arch === false && r.edit === false, r);
  ok('表紙チェックは今までどおり出る', r.rows.indexOf('完TEL') >= 0, r.rows);
  const w = await p.evaluate(() => {
    const rows = document.querySelectorAll('#md-body-modal .cv-pickrow');
    for (const row of rows) {
      const k = row.querySelector('.cv-pk');
      if (k && k.textContent.trim() === '完TEL') {
        const c = Array.prototype.filter.call(row.querySelectorAll('.cv-chip'), x => x.textContent.trim() === '済')[0];
        if (c) { c.click(); return true; }
      }
    }
    return false;
  });
  await p.waitForTimeout(200);
  const done = await p.evaluate(() => !!(state.cards.filter(x => x.id === 'AR3')[0].coverCall || {}).done);
  ok('🔴 返車前なら管理でなくても今までどおり押せる', w === true && done === true, { w, done });
}

console.log('\n── ⑦ ソースの見張り ──');
{
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  const ec = fs.readFileSync('js/errcode-pit.js', 'utf8');
  const cs = fs.readFileSync('css/card-view.css', 'utf8');
  const ix = fs.readFileSync('index.html', 'utf8');
  ok('🔴 直せるかの物差しは canEditResultDate の1本（新しい物差しを作っていない）',
     /function _archGuard\(\)[\s\S]{0,220}canEditResultDate\(\)/.test(cv));
  ok('🔴 完了アーカイブの見出しも同じ1本で出し分けている',
     /var head = canEditResultDate\(\)/.test(cv));
  ok('🔴 断りにエラー番号が付いている（PF-0021）', /code:\s*'PF-0021'/.test(cv));
  ok('🔴 その番号が台帳にある', /'PF-0021'/.test(ec) && /完了アーカイブ/.test(ec));
  ok('🔴 編集の姿は pickRow を使い回している（欄を新しく組み立てていない）',
     /function archiveEditHtml[\s\S]{0,1800}pickRow\('完TEL'/.test(cv));
  ok('🔴 書き込みも cvPick の1本（写しを作っていない）',
     (cv.match(/_c\.coverCall\.done\s*=/g) || []).length === 1);
  ok('⚠ 見出しを flex にしたのは完了アーカイブだけ（.cv-sect 全部を触っていない）',
     /\.cv-sect-arch\{/.test(cs) && !/^\.cv-sect\{[^}]*display:flex/m.test(cs));
  /* 🔴 版の「数字そのもの」は、いちばん新しい試験だけが見張る。
     古い試験に数字を書くと、版を上げるたびに落ちる（CoreNote v3.17.0 の教訓）。
     ここが見るのは **3か所がそろっていること** だけ。 */
  const ver = (ix.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('版が3か所そろっている',
     !!ver && ix.indexOf('<span class="ver">v' + ver + '</span>') >= 0
           && ix.indexOf('<div class="login-ver">v' + ver + '</div>') >= 0, ver);
  /* ⚠ 見張るのは**この回で直した2本**だけ。ほかのファイルの番号まで書くと、
     関係のない直しで落ちる（`errcode-pit.js` の番号を書いていて実際に落ちた）。 */
  ok('直した2本にキャッシュ番号が付いている',
     /card-view\.js\?v=\d+/.test(ix) && /card-view\.css\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

console.log('\n' + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
