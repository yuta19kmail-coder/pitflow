/* PitFlow v2.116.0 ── 新規予約のバッジは「押した瞬間にチェック」／数え上げと保存の空回りを減らした
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-09-15）
     「新規予約で 車検とか12点とかのバッチをクリックするとき異常に遅いときがある」
     「なんかかなり考え込んでから チェックが入るらしい」

   ◎この試験が見張るもの
     🔴 A 押した直後（画面をまるごと描き直す前）に、もうチェックが付いている
     🔴 A 描き直しのあとも、チェック・概算・作業タイプの中身が正しい（素早く何回押しても最後の姿）
     🔴 B 予約数の数え方は前と同じ答え（全カードを毎回見直す数え方と、全部の日で一致）
     🔴 B カードが増えたら、次の数え上げには増えた分が入る（古い仕分けを使い回さない）
     🔴 C 下書きでバッジを押しても、全件見比べの保存（PitDB.save）は走らない。書きかけの控えは取られる
     🔴 C 下書きでない予約（予約の編集）は、今までどおり保存を呼ぶ

   ◎使い方
     python -m http.server 8996      ← 別ウィンドウ
     node _見張り/test_chip_fast.mjs                                      */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8996;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openNewReserve && window.renderCardForm && window.PitDB && window.pitVerdict', null, { timeout: 30000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(1200);

/* 保存と控えの呼ばれ方を数える（blank-cards.js の相乗りの外側から数える） */
await p.evaluate(() => {
  window.__save = 0; window.__keep = 0;
  const s = PitDB.save; PitDB.save = function () { window.__save++; return s.apply(this, arguments); };
  const k = window.pitKeepDraft; if (k) window.pitKeepDraft = function () { window.__keep++; return k.apply(this, arguments); };
});

console.log('\n■ A 押した瞬間にチェック');
await p.evaluate(() => openNewReserve());
await p.waitForTimeout(1000);
const chip = (nm) => `#md-body .cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip:text-is("${nm}")`;
ok('車検のバッジがある', await p.locator(chip('車検')).count() > 0);

/* 押した「同じ流れの中」（描き直しの前）で見る＝クリックの直後に同期で読む */
const inst = await p.evaluate(() => {
  const r = { renders: 0 };
  const f = window.renderCardForm; window.renderCardForm = function () { r.renders++; return f.apply(this, arguments); };
  const btn = [...document.querySelectorAll('#md-body .cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip')].find(x => x.textContent.trim() === '車検');
  __save = 0; __keep = 0;
  btn.click();
  r.activeNow = btn.classList.contains('active');
  r.othersOff = [...btn.closest('.cf-chips').querySelectorAll('.cf-chip')].filter(x => x !== btn && x.classList.contains('active')).length === 0;
  r.rendersNow = r.renders;
  r.saveNow = __save;
  window.__wrapR = r;
  return r;
});
ok('🔴 押した直後にもうチェックが付いている（描き直しを待たない）', inst.activeNow && inst.othersOff, inst);
ok('🔴 まるごとの描き直しは押した直後にはまだ走っていない（直後に回っている）', inst.rendersNow === 0, inst);
await p.waitForTimeout(400);
const after = await p.evaluate(() => {
  const c = state.cards.find(x => x._draft);
  const btn = [...document.querySelectorAll('#md-body .cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip')].find(x => x.textContent.trim() === '車検');
  return { renders: __wrapR.renders, workType: c && c.workType, est: c && c.estHoldDays, active: !!(btn && btn.classList.contains('active')), save: __save, keep: __keep };
});
ok('🔴 そのあと描き直しが1回走り、チェックも中身も揃っている', after.renders === 1 && after.workType === 'shaken' && after.active, after);
ok('概算 預かり日数が入っている（描き直しで揃う）', after.est !== '' && after.est != null, after);

/* 素早く連打＝描き直しは最後の1回にまとまり、最後の姿になる */
const burst = await p.evaluate(async () => {
  __wrapR.renders = 0;
  const find = nm => [...document.querySelectorAll('#md-body .cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip')].find(x => x.textContent.trim() === nm);
  find('12点').click(); find('車検').click(); find('12点').click();
  await new Promise(r => setTimeout(r, 400));
  const c = state.cards.find(x => x._draft);
  const on = [...document.querySelectorAll('#md-body .cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip.active')].map(x => x.textContent.trim());
  return { renders: __wrapR.renders, workType: c.workType, on };
});
ok('🔴 素早く3回押しても描き直しは1回にまとまる', burst.renders === 1, burst);
const twelveId = await p.evaluate(() => { const b = [...document.querySelectorAll('#md-body .cf-chips[data-key="workType"] .cf-chip')].find(x => x.textContent.trim() === '12点'); return b && b.dataset.val; });
ok('🔴 最後に押した「12点」だけにチェック・中身も12点', burst.workType === twelveId && burst.on.length === 1 && burst.on[0] === '12点', burst);

console.log('\n■ C 下書きでは全件見比べの保存を呼ばない');
ok('🔴 下書きでバッジを押しても PitDB.save は0回', after.save === 0, after);
ok('🔴 書きかけの控え（pitKeepDraft）は取られている', after.keep >= 1, after);

console.log('\n■ B 予約数の数え方は前と同じ答え');
const same = await p.evaluate(() => {
  const naive = (team, d) => (state.cards || []).filter(c => c.boardId === team && c.reserveDate === d && c.status !== 'returned' && c.status !== 'scrap').length;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  let bad = [], n = 0;
  for (let i = -30; i < 90; i++) {
    const d = new Date(t); d.setDate(d.getDate() + i);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const v = pitVerdict(ds);
    ['default', 'import'].forEach(team => {
      const got = v && v[team] && v[team].by === 'calc' && v[team].mark !== '休' ? v[team].cnt : null;
      if (got == null) return;
      n++;
      const want = naive(team, ds);
      if (got !== want) bad.push({ ds, team, got, want });
    });
  }
  return { n, bad: bad.slice(0, 5) };
});
ok('比べた日がある', same.n > 20, same.n);
ok('🔴 全部の日で、前の数え方と同じ台数', same.bad.length === 0, same);

const grow = await p.evaluate(async () => {
  const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 40);
  const ds = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  const before = pitVerdict(ds).default.cnt;
  await new Promise(r => setTimeout(r, 0));
  state.cards.push({ id: 'zz_grow', boardId: 'default', reserveDate: ds, status: 'reserved', workType: 'general' });
  const now = pitVerdict(ds).default.cnt;
  /* 同じ流れの中で、中身だけ書き換えた（件数は同じ）場合も、次の一拍では新しい数になる */
  state.cards.find(x => x.id === 'zz_grow').status = 'returned';
  await new Promise(r => setTimeout(r, 0));
  const later = pitVerdict(ds).default.cnt;
  state.cards = state.cards.filter(x => x.id !== 'zz_grow');
  return { before, now, later };
});
ok('🔴 カードを足したら、次の数え上げに入る', grow.now === grow.before + 1, grow);
ok('🔴 返車済みにしたら、次の一拍で数から外れる（古い仕分けを使い回さない）', grow.later === grow.before, grow);

console.log('\n■ C 下書きでない予約は今までどおり保存');
const edit = await p.evaluate(async () => {
  const c = state.cards.find(x => !x._draft && x.status === 'check') || state.cards.find(x => !x._draft);
  if (window.pitCancelCard) { try { await pitCancelCard(true); } catch (e) {} }
  openDetail(c.id);
  await new Promise(r => setTimeout(r, 300));
  openCardEditForm(c.id);
  await new Promise(r => setTimeout(r, 300));
  __save = 0;
  const btn = [...document.querySelectorAll('#md-body-modal .cf-chips[data-key="workType"]:not([data-drawerwt]) .cf-chip')].find(x => !x.classList.contains('active'));
  if (!btn) return { skip: true };
  btn.click();
  const activeNow = btn.classList.contains('active');
  await new Promise(r => setTimeout(r, 400));
  const r = { skip: false, activeNow, save: __save, workType: c.workType, val: btn.dataset.val };
  if (window.pitCardEditCancel) pitCardEditCancel();
  return r;
});
if (edit.skip) ok('（編集フォームに押せるバッジが無いので飛ばす）', true);
else {
  ok('🔴 予約の編集でも押した直後にチェック', edit.activeNow, edit);
  ok('🔴 下書きでない予約は保存を呼ぶ（今までどおり）', edit.save >= 1 && edit.workType === edit.val, edit);
}

ok('画面のエラーが無い', errs.length === 0, errs);
console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail ? 1 : 0);
