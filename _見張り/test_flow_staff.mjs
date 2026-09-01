/* PitFlow v1.55.0 ── フローの担当（誰がやったか）のテスト
   -------------------------------------------------------------------
   ◎ゆうた指定
     ・アクション記録は担当を選ぶからいいが、**既定でそのアカウントの名前が選ばれた状態**にしてほしい。
     ・それ以外の「連絡中 → パーツ待ち」みたいな**自動で入る記録は、やったアカウントを自動で担当に入れる**。
   ◎見つかった正体
     🔴 自動の記録は **window.bnMe（どこにも値を入れていない変数）** を見ていたので、
        担当が**ずっと空**だった。名前の作り方を `pitFlowMe()`（呼び名）に一本化した。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8978      ← 別ウィンドウ
     node test_flow_staff.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8978;
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
await p.waitForFunction('window.state && window.PitFlowLog && window.logFlow && window.logPhaseMove', null, { timeout: 25000 });
await p.waitForTimeout(800);

/* ログインしている人＝「サンプル 花子」ということにする（呼び名を返す入口を差し替える） */
const ME = 'サンプル 花子';
await p.evaluate(me => {
  window.pitCurrentStaffName = function(){ return me; };
  if (!Array.isArray(state.staff)) state.staff = [];
  if (!state.staff.some(s => s.name === me)) state.staff.push({ id: 'stME', name: me, front: true });
}, ME);

console.log('\n── 🔴 名前の作り方が1か所にある ──');
{
  ok('pitFlowMe() がある', await p.evaluate(() => typeof window.pitFlowMe === 'function'));
  ok('ログインしている人の呼び名を返す', (await p.evaluate(() => pitFlowMe())) === ME);
  const r = await p.evaluate(() => {
    const keep = window.pitCurrentStaffName;
    window.pitCurrentStaffName = function(){ return ''; };
    window.fb = window.fb || {}; window.fb.currentMember = { name: '本名 太郎' };
    const v = pitFlowMe();
    window.pitCurrentStaffName = keep;
    return v;
  });
  ok('名簿に居ない時はログイン名で埋める（空にしない）', r === '本名 太郎', r);
}

console.log('\n── 🔴 自動で入る記録に、やった人が入る ──');
{
  const r = await p.evaluate(() => {
    const c = { id: 'fc1', log: [] };
    logFlow(c, '返車完了（実績へ）');
    logPhaseMove(c, 'contact', 'parts');
    return c.log.map(e => ({ label: e.label || '', from: e.from || '', to: e.to || '', staff: e.staff || '', by: e.by || '' }));
  });
  ok('工程の自動記録（logFlow）に担当が入る', r[0].staff === ME, r[0]);
  ok('🔴 連絡中→パーツ待ち（logPhaseMove）にも担当が入る', r[1].by === ME, r[1]);
  ok('前と後の工程はそのまま残る', r[1].from === 'contact' && r[1].to === 'parts', r[1]);
  /* フロー欄が読む窓口を通しても、ちゃんと担当として読める */
  const shown = await p.evaluate(() => {
    const c = { id: 'fc2', log: [] };
    logFlow(c, 'テスト記録');
    logPhaseMove(c, 'contact', 'parts');
    return c.log.map(e => PitFlowLog.byOf(e));
  });
  ok('🔴 フロー欄が読む担当も、その名前になる', shown[0] === ME && shown[1] === ME, shown);
}

console.log('\n── 🔴 アクション記録の担当は、開いた時点で自分 ──');
{
  const r = await p.evaluate(() => {
    const c = { id: 'fc3', log: [] };
    const html = PitFlowLog.addHtml(c, 'cv');
    const box = document.createElement('div'); box.innerHTML = html; document.body.appendChild(box);
    const sel = box.querySelector('#cv-flow-staff');
    const out = { value: sel.value, selected: sel.options[sel.selectedIndex].text, count: sel.options.length };
    box.remove();
    return out;
  });
  ok('🔴 既定で自分が選ばれている', r.value === ME, r);
  ok('「担当 ―」のままではない', r.selected === ME, r);

  /* 名簿に自分が居なくても空欄にしない */
  const r2 = await p.evaluate(() => {
    const keep = state.staff.slice();
    state.staff = state.staff.filter(s => s.name !== 'サンプル 花子');
    const c = { id: 'fc4', log: [] };
    const box = document.createElement('div'); box.innerHTML = PitFlowLog.addHtml(c, 'cv'); document.body.appendChild(box);
    const sel = box.querySelector('#cv-flow-staff');
    const out = { value: sel.value };
    box.remove(); state.staff = keep;
    return out;
  });
  ok('🔴 名簿に自分が居なくても、自分が選ばれる', r2.value === ME, r2);
}

console.log('\n── 手で足した記録は、選んだ担当のまま（今までどおり） ──');
{
  const r = await p.evaluate(() => {
    state.cards = [{ id: 'card1', log: [], status: 'contact' }];
    const box = document.createElement('div'); box.innerHTML = PitFlowLog.addHtml(state.cards[0], 'cv'); document.body.appendChild(box);
    /* 別の人を選んでから足す */
    if (!state.staff.some(s => s.name === 'ほかの 太郎')) state.staff.push({ id: 'stO', name: 'ほかの 太郎' });
    const box2 = document.createElement('div'); box2.innerHTML = PitFlowLog.addHtml(state.cards[0], 'cv');
    box.remove(); document.body.appendChild(box2);
    const sel = box2.querySelector('#cv-flow-staff');
    sel.value = 'ほかの 太郎';
    PitFlowLog.add('card1', '部品を発注した', 'cv');
    const e = state.cards[0].log[0];
    box2.remove();
    return { staff: e.staff, manual: !!e.manual, label: e.label };
  });
  ok('選んだ人がそのまま入る', r.staff === 'ほかの 太郎', r);
  ok('手で足した印は付いたまま', r.manual === true);
  ok('言葉もそのまま', r.label === '部品を発注した');
  /* 次に開いた時は「前に選んだ人」が残る（今までどおり） */
  const r2 = await p.evaluate(() => {
    const box = document.createElement('div'); box.innerHTML = PitFlowLog.addHtml(state.cards[0], 'cv'); document.body.appendChild(box);
    const v = box.querySelector('#cv-flow-staff').value; box.remove(); return v;
  });
  ok('前に選んだ人が次も選ばれている（今までどおり）', r2 === 'ほかの 太郎', r2);
}

console.log('\n── 過去のフローは書き換えない ──');
{
  const r = await p.evaluate(() => {
    const c = { id: 'old', log: [
      { label: '昔の記録（担当なし）', at: 1700000000000 },
      { type: 'phase', from: 'contact', to: 'parts', at: 1700000001000, by: '' }
    ] };
    return c.log.map(e => PitFlowLog.byOf(e));
  });
  ok('🔴 すでに入っている記録の担当は空のまま（勝手に埋めない）', r[0] === '' && r[1] === '', r);
}

console.log('\n── 同じ死んだ変数を見ていた他の3か所も直っている ──');
{
  const cv = fs.readFileSync('js/card-view.js', 'utf8');
  const sh = fs.readFileSync('js/shaken.js', 'utf8');
  const ct = fs.readFileSync('js/card-tabs.js', 'utf8');
  ok('🔴 工程移動の記録が bnMe を見ていない', !/by:\s*\(window\.bnMe/.test(ct));
  ok('仮予約／本予約の記録も直っている', !/本予約に確定した[\s\S]{0,160}window\.bnMe/.test(cv));
  ok('詳細からの工程移動の記録も直っている', !/に移動'[\s\S]{0,160}window\.bnMe/.test(cv));
  ok('完TEL担当の自動記入も直っている', !/coverCall\.staff\s*=\s*\(window\.bnMe/.test(cv));
  ok('実績担当の既定も直っている（車検ビュー）', !/resultStaff\|\|window\.bnMe/.test(sh) && !/resultStaff\|\|window\.bnMe/.test(cv));
  ok('名前の作り方は1か所（pitFlowMe）に集めてある',
     /pitFlowMe\s*=/.test(fs.readFileSync('js/flow-pit.js', 'utf8')) &&
     /pitFlowMe\(\)/.test(ct) && /pitFlowMe\(\)/.test(cv) && /pitFlowMe\(\)/.test(sh));
  const ix = fs.readFileSync('index.html', 'utf8');
  const vs = [ (ix.match(/app-version" content="([\d.]+)"/) || [])[1],
               (ix.match(/login-ver">v([\d.]+)</) || [])[1],
               (ix.match(/class="ver">v([\d.]+)</) || [])[1] ];
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  ok('直した4本にキャッシュ番号が付いている',
     /flow-pit\.js\?v=\d+/.test(ix) && /card-tabs\.js\?v=\d+/.test(ix) && /card-view\.js\?v=\d+/.test(ix) && /shaken\.js\?v=\d+/.test(ix));
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
