/* PitFlow v2.163.0 ── 当日ビュー：名前と車種は折り返さない（長い時は両方「…」）
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-10-08）
     「今日の当日ボード 13:00 入庫分の表示が下にズレてる」
     ＝ 長い法人名（㈱ デイジーコーポレーション）で車種が2行目に落ち、
        56px 固定の行に3段（名前／車種／ナンバー）が入らず、下にはみ出してナンバーが隠れていた。
     直し方＝ゆうた指定「名前、車種共にバランスよく…にしてほしい」

   ◎ここで見張ること
     🔴 長い名前でも、名前と車種は**同じ行**（車種が2行目に落ちない）
     🔴 ナンバーが行の中に**全部見えている**（行の下にはみ出さない）
     🔴 名前・車種の**両方**が縮む（片方だけが消えない）／「様」は縮めない
     🔴 短い名前の行は今までどおり（「…」にならない）

   ◎使い方
     python3 -m http.server 8996      ← 別ウィンドウ
     node test_today_headline.mjs                                            */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8996;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
/* 🔴 ゆうたの画面と同じくらいの幅（入庫の列が約540px）で見る */
const p = await b.newPage({ viewport: { width: 1288, height: 936 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.renderToday', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

const measure = card => p.evaluate(c => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = ymd(new Date());
  state.cards = [Object.assign({
    id: 'cHL', boardId: 'default', workType: 'general', dropType: 'drop', status: 'reserved',
    reserveDate: today, reserveTime: '13:00', plate: '習志野 536 つ 1211'
  }, c)];
  window._todayOffset = 0;
  showView('today');
  renderToday();
  const row = document.querySelector('#view-today-body .today-row');
  if (!row) return { none: true };
  const R = e => e ? e.getBoundingClientRect() : null;
  const rr = R(row), cn = row.querySelector('.tr-cn'), car = row.querySelector('.tr-carname'),
        sama = row.querySelector('.tr-sama'), pl = row.querySelector('.tr-plate');
  return {
    rowTop: rr.top, rowBot: rr.bottom,
    nameTop: R(cn).top, carTop: R(car).top,
    plateTop: R(pl).top, plateBot: R(pl).bottom,
    nameCut: cn.scrollWidth > cn.clientWidth + 1, carCut: car.scrollWidth > car.clientWidth + 1,
    nameW: R(cn).width, carW: R(car).width,
    sama: sama && sama.textContent, samaW: R(sama).width,
    name: cn.textContent
  };
}, card);

console.log('\n── 🏢 長い法人名（ゆうた報告の行） ──');
{
  const r = await measure({ customer: '㈱ デイジーコーポレーション', car: 'スマートフォーツー' });
  ok('🔴 名前と車種が同じ行（車種が2行目に落ちない）', Math.abs(r.nameTop - r.carTop) < 6, r);
  ok('🔴 ナンバーが行の中に全部見えている', r.plateTop >= r.rowTop && r.plateBot <= r.rowBot, r);
  ok('「様」は縮めずに出る', r.sama === '様' && r.samaW > 8, r);
}
{
  const r = await measure({ customer: '株式会社 とてもながいなまえのおきゃくさまコーポレーション', car: 'メルセデスベンツ Eクラス ステーションワゴン' });
  ok('🔴 両方長い時は、名前・車種の両方が「…」で縮む', r.nameCut && r.carCut, r);
  ok('🔴 片方だけが消えない（どちらも40px以上見える）', r.nameW > 40 && r.carW > 40, r);
  ok('🔴 それでもナンバーは見えている', r.plateTop >= r.rowTop && r.plateBot <= r.rowBot, r);
}

console.log('\n── 👤 ふつうの長さは今までどおり ──');
{
  /* ⚠ この幅（1288px）だと名前と車種の欄は約150〜190px。「池上 様 アルトラパンLC」でもぎりぎり縮む幅なので、短い例で見る */
  const r = await measure({ customer: '入江', car: 'LS500' });
  ok('「…」にならない', !r.nameCut && !r.carCut, r);
  ok('名前と車種が同じ行', Math.abs(r.nameTop - r.carTop) < 6, r);
}

ok('JSエラー0', errs.length === 0, errs);
await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail ? 1 : 0);
