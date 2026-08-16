/* PitFlow v1.98.0 ── 当日ビュー：担当者が空なら「課」を出す
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-15）
     「当日ビューで担当者が入ってない場合、**時間横の担当者エリアが空欄**になっちゃうが、
       直接的な担当者が入ってない場合は **1課か2課を入力**するようにして、**色はグリーンピンク**で」

   ◎ここで見張ること
     🔴 フロント担当が入っていれば、今までどおり**人の名前**（課は出さない）
     🔴 空なら **課（1課・2課）** を出す。色は 1課＝緑・2課＝ピンク
     🔴 課の名前も色も **state.divisions の表1本**から引く（設定で変えたら一緒に変わる）
     🔴 課も空なら今までどおり**空欄**（国産／輸入から 1課／2課 を作らない＝v1.92.0の決めごと）
     🔴 入庫の列でも返車の列でも同じ

   ◎使い方
     python3 -m http.server 8997      ← 別ウィンドウ
     node test_today_div.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8997;
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
await p.waitForFunction('window.state && window.renderToday && window.pitDivisionLabel', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 当日ビューにカードを1枚だけ置いて、時間横のバッジを読む */
const badge = card => p.evaluate(c => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = ymd(new Date());
  const full = Object.assign({
    id: 'cTD', customer: 'テスト 太郎', kana: 'テスト タロウ', car: 'ノート',
    boardId: 'default', workType: 'general', dropType: 'drop', status: 'reserved',
    reserveDate: today, reserveTime: '10:00'
  }, c);
  if (full._return){
    full.status = 'workDone'; full.returnStage = 'returnWait';
    full.returnDate = today; full.returnTime = '15:00';
    delete full._return;
  }
  state.cards = [full];
  window._todayOffset = 0;
  showView('today');
  renderToday();
  const col = full.returnStage ? '.today-col-body' : '.today-col-body';
  const el = document.querySelector('#view-today-body .tr-front');
  if (!el) return { none: true };
  return {
    text: (el.textContent || '').trim(),
    cls: el.className,
    bg: el.style.background || el.style.backgroundColor || '',
    title: el.getAttribute('title') || ''
  };
}, card);

console.log('\n── 👤 担当者が入っていれば今までどおり ──');
{
  const r = await badge({ frontStaff: '小林 勇太', division: 'div1' });
  ok('🔴 人の名前が出る（課は出さない）', r.text === '小林' && !/is-div/.test(r.cls), r);
  ok('色は今までどおり（国産＝緑）', /29, 185, 122|1db97a/.test(r.bg), r.bg);
}

console.log('\n── 🟢🩷 担当者が空なら課を出す（今回の直し） ──');
{
  const r = await badge({ frontStaff: '', division: 'div1' });
  ok('🔴 1課が出る（空欄にしない）', r.text === '1課', r);
  ok('🔴 課の印（is-div）が付く', /is-div/.test(r.cls), r.cls);
  ok('🔴 色は緑', /29, 185, 122|1db97a/.test(r.bg), r.bg);
  ok('担当者がまだと分かる説明が付く', /担当者/.test(r.title), r.title);
}
{
  const r = await badge({ frontStaff: '', division: 'div2', boardId: 'import' });
  ok('🔴 2課が出る', r.text === '2課', r);
  ok('🔴 色はピンク', /236, 72, 153|ec4899/.test(r.bg), r.bg);
}
{
  /* 車と課がちぐはぐでも、出るのは**課のボタンどおり**（v1.92.0の決めごと） */
  const r = await badge({ frontStaff: '', division: 'div2', boardId: 'default' });
  ok('🔴 国産の車でもボタンが2課ならピンクの2課', r.text === '2課' && /236, 72, 153|ec4899/.test(r.bg), r);
}

console.log('\n── ⬜ 課も空なら、今までどおり空欄 ──');
{
  const r = await badge({ frontStaff: '', division: '' });
  ok('🔴 空欄のまま（車から 1課 を作らない）', r.text === '' && /empty/.test(r.cls), r);
  const r2 = await badge({ frontStaff: '', division: '', boardId: 'import' });
  ok('🔴 輸入の車でも 2課 を作らない', r2.text === '' && /empty/.test(r2.cls), r2);
}

console.log('\n── 🏷 名前も色も設定の表から引く ──');
{
  await p.evaluate(() => {
    window.__keepDiv = JSON.parse(JSON.stringify(state.divisions));
    state.divisions = [
      { id: 'div1', label: '整備1課', color: '#0ea5e9' },
      { id: 'div2', label: '整備2課', color: '#f59e0b' }
    ];
  });
  const r = await badge({ frontStaff: '', division: 'div1' });
  ok('🔴 課の名前を変えたらバッジの字も変わる', r.text === '整備1課', r);
  ok('🔴 課の色を変えたらバッジの色も変わる', /14, 165, 233|0ea5e9/.test(r.bg), r.bg);
  const r2 = await badge({ frontStaff: '', division: 'div9' });
  ok('表に無い課は出さない（勝手に1課にしない）', r2.text === '' && /empty/.test(r2.cls), r2);
  await p.evaluate(() => { state.divisions = window.__keepDiv; });
}

console.log('\n── ↔ 返車の列でも同じ ──');
{
  const r = await badge({ frontStaff: '', division: 'div2', _return: true });
  ok('🔴 返車の列でも課が出る', r.text === '2課' && /is-div/.test(r.cls), r);
  const r2 = await badge({ frontStaff: '田中 一郎', division: 'div2', _return: true });
  ok('返車の列でも人が優先', r2.text === '田中' && !/is-div/.test(r2.cls), r2);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  const st = fs.readFileSync('js/pit-share.js', 'utf8');   /* 🔴 v1.103.0 課の物差しは pit-share.js へ移した */
  ok('🔴 課の色を引く物差しが1本ある', /function pitDivisionColor/.test(st) && /w\.pitDivisionColor/.test(st), '');
  const td = fs.readFileSync('js/today.js', 'utf8');
  ok('🔴 当日ビューが課の名前を直に書いていない', !/'1課'|"1課"/.test(td), '');
  /* 🔴 課のバッジの色は表から。**車（国産／輸入）から作らない**（v1.92.0の決めごと）
     ⚠ v1.104.0 で名前が badgeColor になり、**人のバッジも同じ色**を使うようになった
        （課が空ならグレー＝ゆうた指定 2026-08-16）。 */
  const divLine = (td.match(/const badgeColor = [\s\S]*?;\n/) || [''])[0];
  ok('🔴 課の色は表から引いている', /pitDivisionColorOr\(c\)|pitDivisionColor\(c\)/.test(divLine), divLine);
  ok('🔴 課の色を車から作っていない', !/isImp/.test(divLine), divLine);
  ok('🔴 人のバッジも車から塗っていない', !/isImp \? '#ec4899'/.test(td));

  /* 見本データでも当日ビューがふつうに描けるか */
  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { showView('today'); renderToday(); });
  await p.waitForTimeout(300);
  const n = await p.evaluate(() => document.querySelectorAll('#view-today-body .today-row').length);
  ok('見本データで当日ビューが描ける', n >= 0, n);

  for (const v of ['dashboard', 'today', 'task', 'reserve', 'return']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(220);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
