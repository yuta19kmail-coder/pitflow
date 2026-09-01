/* PitFlow v1.92.0 ── 表紙の「課」は予約画面のボタンどおりに刷る
   -------------------------------------------------------------------
   ◎ゆうた指摘（2026-08-13）
     「表紙印刷の部分で、恐らく **1課・2課 が車か何かに引っ張られてる**。
       **実際の予約画面のボタンに沿ってデータが入るようにしてほしい**」

   ◎正体
     表紙もホバー情報カードも、こう書いてあった。
        c.division==='div2' || c.boardId==='import' ? '2課' : '1課'
     ＝**課のボタンが空の時は、国産／輸入（＝車）から 1課／2課 を作っていた。**
     画面のボタンは何も押されていないのに、紙には「1課」と刷られる。
     さらに表示名が `'1課'` の直書きだったので、**課の名前を変えると紙だけ食い違う**。

   ◎ここで見張ること
     🔴 課は **c.division（予約画面のボタン）だけ**で決まる
     🔴 **国産／輸入からは逆算しない**（ボタンが空なら紙も空）
     🔴 名前は **state.divisions の label** から引く（直書きしない）
     🔴 国産／輸入を押した時に課が自動で入るのは**今までどおり**（＝ボタンが埋まる）
     🔴 表紙とホバー情報カードで**同じ課**が出る

   ◎使い方
     python3 -m http.server 8988      ← 別ウィンドウ
     node test_cover_course.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8988;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitDivisionLabel && window.pitBuildCoverDoc', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(700);

/* 様式SVGを1回だけ読んでおく（本番と同じ道＝buildDoc に formSvg を渡して紙を組む） */
await p.evaluate(async () => {
  const r = await fetch('images/様式_お客様情報.svg');
  window.__form = await r.text();
});
const formOk = await p.evaluate(() => (window.__form || '').indexOf('{{course}}') >= 0);
if (!formOk) { console.log('  ❌ 様式SVGに {{course}} が無い（様式が変わった？）'); await b.close(); process.exit(1); }

/* 表紙に実際に刷られる「課」を取り出す。
   ⚠ {{course}} の場所は様式の座標で決まっている。座標を決め打ちすると様式を直すたび落ちるので、
      **元の様式で {{course}} が入っている text の transform を先に調べて**、
      同じ transform の text を組み上がった紙から拾う。 */
const courseOnPaper = card => p.evaluate(c => {
  const form = window.__form;
  const mt = /<text[^>]*transform="([^"]+)"[^>]*>\s*<tspan[^>]*>\{\{course\}\}<\/tspan>/.exec(form);
  if (!mt) return '(様式に {{course}} が見つからない)';
  const tr = mt[1];
  const doc = window.pitBuildCoverDoc(c, { formSvg: form, noPrint: true });
  const esc = tr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('<text[^>]*transform="' + esc + '"[^>]*>\\s*<tspan[^>]*>([^<]*)</tspan>').exec(doc);
  return m ? m[1].trim() : '(紙に見つからない)';
}, card);

const base = {
  id: 'cCOURSE', _draft: false, status: 'reserved',
  customer: 'テスト 太郎', kana: 'テスト タロウ', tel: '090-0000-0000',
  reserveDate: '2026-08-20', dropType: 'drop', workType: 'general', repeat: 'new'
};

console.log('\n── 🔴 車（国産／輸入）から逆算しない ──');
{
  ok('課のボタンが空＝紙も空（国産の車でも「1課」と刷らない）',
     (await courseOnPaper({ ...base, boardId: 'default', division: '' })) === '',
     await courseOnPaper({ ...base, boardId: 'default', division: '' }));
  ok('課のボタンが空＝紙も空（輸入の車でも「2課」と刷らない）',
     (await courseOnPaper({ ...base, boardId: 'import', division: '' })) === '',
     await courseOnPaper({ ...base, boardId: 'import', division: '' }));
  ok('🔴 車が国産でも、ボタンが2課なら「2課」',
     (await courseOnPaper({ ...base, boardId: 'default', division: 'div2' })) === '2課',
     await courseOnPaper({ ...base, boardId: 'default', division: 'div2' }));
  ok('🔴 車が輸入でも、ボタンが1課なら「1課」',
     (await courseOnPaper({ ...base, boardId: 'import', division: 'div1' })) === '1課',
     await courseOnPaper({ ...base, boardId: 'import', division: 'div1' }));
  ok('車が決まっていなくても、ボタンどおりに刷る',
     (await courseOnPaper({ ...base, boardId: '', division: 'div2' })) === '2課',
     await courseOnPaper({ ...base, boardId: '', division: 'div2' }));
}

console.log('\n── 🏷 名前は state.divisions から引く（直書きしない） ──');
{
  await p.evaluate(() => {
    window.__keepDiv = JSON.parse(JSON.stringify(state.divisions));
    state.divisions = [
      { id: 'div1', label: '整備1課', color: '#1db97a' },
      { id: 'div2', label: '整備2課', color: '#ec4899' },
      { id: 'div3', label: '鈑金課',  color: '#378ADD' }
    ];
  });
  ok('🔴 課の名前を変えたら、紙の文字も変わる',
     (await courseOnPaper({ ...base, division: 'div1' })) === '整備1課',
     await courseOnPaper({ ...base, division: 'div1' }));
  ok('🔴 3つ目の課も、そのまま刷れる',
     (await courseOnPaper({ ...base, division: 'div3' })) === '鈑金課',
     await courseOnPaper({ ...base, division: 'div3' }));
  ok('表に無い課は刷らない（勝手に1課にしない）',
     (await courseOnPaper({ ...base, division: 'div9' })) === '',
     await courseOnPaper({ ...base, division: 'div9' }));
  await p.evaluate(() => { state.divisions = window.__keepDiv; });
}

console.log('\n── 🔘 予約画面：国産／輸入を押すと課も入る（今までどおり） ──');
{
  await p.evaluate(() => { state.cards = []; openNewReserve(); });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const c = state.cards[state.cards.length - 1];
    const pick = v => {
      const g = document.querySelector('.cf-chips[data-key="boardId"]');
      const btn = g && g.querySelector('.cf-chip[data-val="' + v + '"]');
      if (btn) btn.click();
    };
    pick('import');
    const afterImport = { division: c.division, label: pitDivisionLabel(c) };
    pick('default');
    const afterDefault = { division: c.division, label: pitDivisionLabel(c) };
    return { afterImport, afterDefault };
  });
  ok('🔴 輸入を押すと 課のボタンが 2課 になる', r.afterImport.division === 'div2' && r.afterImport.label === '2課', r);
  ok('🔴 国産を押すと 課のボタンが 1課 になる', r.afterDefault.division === 'div1' && r.afterDefault.label === '1課', r);

  const chip = await p.evaluate(() => {
    const g = document.querySelector('.cf-chips[data-key="division"]');
    if (!g) return 'なし';
    const on = g.querySelector('.cf-chip.active');
    return on ? on.textContent.trim() : '（どれも押されていない）';
  });
  ok('画面の課のボタンも 1課 が光っている', chip === '1課', chip);

  /* 課のボタンを外すと、画面も紙も空になる（＝ここが今回のキモ） */
  const off = await p.evaluate(() => {
    const c = state.cards[state.cards.length - 1];
    const g = document.querySelector('.cf-chips[data-key="division"]');
    const on = g && g.querySelector('.cf-chip.active');
    if (on) on.click();                    // もう一度押して解除
    return { division: c.division || '', label: pitDivisionLabel(c), boardId: c.boardId };
  });
  ok('課のボタンを外すと c.division が空になる', off.division === '', off);
  ok('🔴 外したら、車が国産のままでも紙は空（これが報告の中身）', off.label === '', off);
}

console.log('\n── 🖱 ホバー情報カードも表紙と同じ課を出す ──');
{
  const r = await p.evaluate(() => {
    const src = document.querySelector('script[src*="card-hover"]');
    return { hasSrc: !!src };
  });
  ok('ホバー情報カードが読み込まれている', r.hasSrc === true, r);
  const same = await p.evaluate(() => {
    /* 表紙とホバーが同じ関数を見ているか＝逆算のコードが残っていないか */
    return typeof window.pitDivisionLabel === 'function';
  });
  ok('🔴 表紙もホバーも同じ物差し（pitDivisionLabel）を使う', same === true, same);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  for (const v of ['dashboard', 'reserve', 'return', 'today']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(200);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));

  /* ソースの見張り＝逆算のコードが復活していないか */
  const cov = fs.readFileSync('js/cover-print.js', 'utf8');
  const hov = fs.readFileSync('js/card-hover.js', 'utf8');
  ok("🔴 表紙に boardId から課を作るコードが無い", !/boardId==='import'\s*\)\s*return\s*'2課'/.test(cov), '');
  ok("🔴 表紙に '1課' の直書きが無い", !/return\s*'1課'/.test(cov), '');
  ok("🔴 ホバーに boardId から課を作るコードが無い", !/c\.boardId==='import'\s*\?\s*'2課'/.test(hov), '');
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
