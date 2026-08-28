/* ============================================================
   test_dash_boxes.mjs
   ダッシュボードの**全部のBOXが、全部の大きさで、エラーなく描ける**ことを見張る。
   ＋ 🩺 データチェックBOX（v2.22.0）の中身を見張る。

   きっかけ：ゆうた 2026-08-28
     🗣「データチェックのBOXは作ろう」
     🗣「サンプルページを作り直して…**BOXサイズも全サイズ出したい**」
     🗣「俺確認できないから時間たっぷりでいいから**しっかり作りこんでほしい**」

   ◎なぜこの見張りが要るか
     BOXは34種・大きさは最大4つ＝**115通り**。人が全部見て回るのは無理。
     1つでも描けないと**その人のダッシュボードだけ真っ白**になる（他の人は気づけない）。
     ＝ 機械で全部描いて、**JSエラー0** と **中身が空でないこと**を確かめる。

   ◎データチェックBOXの決めごと（v2.22.0）
     🔴 判定は**1文字も書かない**。`pitInspectRun()` を呼ぶだけ
     　 （ここに条件を書き写すと、データチェックの画面と答えが違うという最悪の形になる）
     🔴 主役は「**いま動いている車**」の所見だけ。終わった記録は数だけ添える
     🔴 **規則ごとにまとめる**（同じ指摘が7行並ぶと何種類あるか読めない）
     🔴 並びは 要対応 → 確認 → 気づき
     　 ⚠ `INS_ORDER[lv] || 9` と書くと 要対応(0) が 9 になって**最下位に沈む**（実際に沈んだ）

   使い方：
     python3 -m http.server 8968 --directory . &
     PORT=8968 node test_dash_boxes.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8968;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const rd = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

console.log('\n── 🧭 物差しは1本か ──');
{
  const md = rd('js/mydash.js');
  const body = md.replace(/\/\*[\s\S]*?\*\//g, '');
  const ins = (body.match(/function insRun\(\)[\s\S]*?function insCatHtml[\s\S]*?\n  \}/) || [''])[0]
            + (body.match(/inspect:\s*\{[\s\S]*?\n    \},/) || [''])[0];
  ok('BOX データチェックがある', /inspect:\s*\{/.test(body));
  ok('🔴 判定は pitInspectRun を呼ぶだけ', /pitInspectRun\(\)/.test(ins));
  ok('🔴 判定の条件を書き写していない',
     !/ruleId\s*===\s*'/.test(ins) && !/level\s*===\s*'red'\s*&&/.test(ins), ins.length);
  ok('🔴 いま動いている車だけを主役にする', /scope\s*===\s*'live'/.test(ins));
  ok('🔴 重さの並びで 0 を falsy にしていない（insWeight）', /function insWeight/.test(body) && !/INS_ORDER\[[^\]]+\]\s*\|\|\s*9/.test(body));
  ok('BOXの一覧を外に出している（見張り・カタログ用）', /window\.PIT_DASH_EL\s*=/.test(body));
  const css = rd('css/mydash.css');
  ok('CSS に3段の札がある', /\.ins-lv\.ins-red/.test(css) && /\.ins-lv\.ins-amber/.test(css));
  ok('🔴 1行1規則の縦並びに戻している（題名が切れないように）', /\.ins-row\{[^}]*display:block/.test(css));
  ok('カタログを作る道具がある', fs.existsSync(path.join(process.cwd(), '_boxcatalog.mjs')));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderMyDash && window.PIT_DASH_EL', null, { timeout: 30000 });
await p.waitForTimeout(900);

console.log('\n── 🧱 全部のBOXを、全部の大きさで描く ──');
{
  const R = await p.evaluate(async () => {
    const EL = window.PIT_DASH_EL, keys = Object.keys(EL);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const bad = [], empty = [], seen = [];
    for (const k of keys) {
      const sizes = (EL[k].sizes && EL[k].sizes.length) ? EL[k].sizes : ['m'];
      for (const s of sizes) {
        seen.push(k + ':' + s);
        try {
          state.settings.myDash = { v: 2, active: 0, presets: [{ name: '試', layout: [{ e: k, s: s }] }] };
          showView('dashboard'); renderMyDash();
          await wait(15);
          const el = document.querySelector('#mydash-flow');
          const t = el ? (el.textContent || '').replace(/\s+/g, '') : '';
          if (!el || !el.querySelector('.md-box')) bad.push(k + ':' + s);
          else if (t.length < 3) empty.push(k + ':' + s);
        } catch (e) { bad.push(k + ':' + s + '（' + (e && e.message) + '）'); }
      }
    }
    return { n: keys.length, cells: seen.length, bad: bad, empty: empty,
             titles: keys.map(k => EL[k].title) };
  });
  ok('BOXは34種ある', R.n === 34, R.n);
  ok('大きさの組み合わせは115通り', R.cells === 115, R.cells);
  ok('🔴 描けなかったBOXが1つも無い', R.bad.length === 0, R.bad);
  ok('🔴 中身が空っぽのBOXが1つも無い', R.empty.length === 0, R.empty);
  ok('題名が全部そろっている', R.titles.every(t => t && t.length), R.titles.filter(t => !t));
  ok('🧯 ここまででJSエラー 0', errs.length === 0, errs.slice(0, 3));
}

console.log('\n── 🩺 データチェックBOXの中身 ──');
{
  const D = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const put = s => { state.settings.myDash = { v: 2, active: 0, presets: [{ name: '試', layout: [{ e: 'inspect', s: s }] }] };
                       showView('dashboard'); renderMyDash(); };
    const res = pitInspectRun();
    const live = (res.findings || []).filter(f => f.scope === 'live');
    const red  = live.filter(f => f.level === 'red').length;
    const rules = {}; live.forEach(f => { rules[f.ruleId] = 1; });
    put('l'); await wait(60);
    const box = document.querySelector('#mydash-flow');
    const rows = [...box.querySelectorAll('.ins-row')];
    const lv = rows.map(r => (r.querySelector('.ins-lv') || {}).textContent || '');
    const n = rows.map(r => +(((r.querySelector('.ins-n') || {}).textContent || '').replace(/[^\d]/g, '') || 0));
    put('s'); await wait(60);
    const sTxt = (document.querySelector('#mydash-flow') || {}).textContent || '';
    return { red: red, liveN: live.length, ruleN: Object.keys(rules).length,
             rows: rows.length, lv: lv, n: n,
             sum: n.reduce((a, x) => a + x, 0),
             sTxt: sTxt.replace(/\s+/g, ' ').trim(),
             past: (res.byScope && res.byScope.past && res.byScope.past.open) || 0,
             pastShown: /終わった記録/.test(box ? box.textContent : '') };
  });
  ok('見本データに「いま動いている車」の所見がある（試験になる）', D.liveN > 0, D);
  ok('🔴 規則ごとにまとまっている（行数＝規則の種類）',
     D.rows === Math.min(D.ruleN, 6), { rows: D.rows, ruleN: D.ruleN });
  ok('🔴 台数の合計が所見の数と合う', D.sum === D.liveN || D.rows === 6, { sum: D.sum, liveN: D.liveN });
  ok('🔴 要対応がいちばん上（0 が falsy になる罠を踏んでいない）',
     D.lv.length === 0 || D.lv[0] === '要対応' || D.red === 0, D.lv);
  ok('小さいBOXは要対応の数だけ', /要対応/.test(D.sTxt) && !/確認/.test(D.sTxt), D.sTxt.slice(0, 60));
}

console.log('\n── 🔗 押した時と、終わった記録の扱い ──');
{
  const C = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    state.settings.myDash = { v: 2, active: 0, presets: [{ name: '試', layout: [{ e: 'inspect', s: 'xl' }] }] };
    showView('dashboard'); renderMyDash(); await wait(60);
    const box = document.querySelector('#mydash-flow');
    const rows = [...box.querySelectorAll('.ins-row')];
    return {
      onclick: rows.map(r => r.getAttribute('onclick') || ''),
      past: !!box.querySelector('.ins-past'),
      pastGo: (box.querySelector('.ins-past') || {}).getAttribute ? box.querySelector('.ins-past').getAttribute('onclick') : '',
      foot: /データチェック.を開く/.test(box.textContent || ''),
      cats: box.querySelectorAll('.ins-cat').length
    };
  });
  ok('どの行も押せる', C.onclick.length > 0 && C.onclick.every(x => x.length > 0), C.onclick.slice(0, 2));
  ok('押すと 車を開く か データチェックへ行く',
     C.onclick.every(x => /openDetail\(|mydGo\('inspect'\)/.test(x)), C.onclick.slice(0, 2));
  ok('🔴 終わった記録は消さずに数だけ添える', C.past && /inspect/.test(C.pastGo || ''), C);
  ok('特大では区分ごとの内訳も出る', C.cats > 0, C.cats);
  ok('下から「データチェック」へ行ける', C.foot, C.foot);
}

console.log('\n── 🧯 JSエラー ──');
ok('画面のエラー 0', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n═══ ' + OK + ' OK / ' + NG + ' NG ═══');
process.exit(NG ? 1 : 0);
