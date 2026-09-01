/* ============================================================
   test_cover_fix.mjs
   表紙印刷（カルテの表紙）の 2026-08-28 の直し5つを見張る。

   きっかけ：ゆうた 2026-08-28
     ・入庫日が2桁（11月・12月）になると「/」に被る
     ・代車の貸し出し期間に曜日を入れる（例：8/28(金)〜8/29(土)）
     ・代車貸出の場合、代車管理費の左の□にチェックをデフォルトで
     ・待or当のように複数チェックが入っている場合に1個しか印刷されない
     ・入庫日BOXの右上に小さく予約番号
     ＋（モックを見て）「預かり→預／当日→当返／待ち→待 でOK」

   ⚠ **本物の様式SVGに本物のコードで流し込んで、実寸で測る。**
      様式SVG（`images/様式_お客様情報.svg`）の座標が動いたら、ここが赤くなる＝そういう見張り。
      ・入庫日の箱   … rect x316.58 y17.84 w97.38 h89.88
      ・入庫日の「/」 … (367.34,38.88)→(332.97,73.25)
      ・受付タイプのマス … x334.76〜414.47
   使い方：
     python3 -m http.server 8969 --directory . &
     PORT=8969 node test_cover_fix.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8969;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
/* 様式SVGの実測値（ここを変えたら様式も変わったということ） */
const BOX   = { x: 316.58, y: 17.84, w: 97.38, h: 89.88 };   /* 入庫日の箱 */
const SLASH = { x1: 367.34, y1: 38.88, x2: 332.97, y2: 73.25 };
const DROP_CELL = { x0: 334.76, x1: 414.47 };

const b = await chromium.launch({ executablePath: cp });
const app = await b.newPage({ viewport: { width: 1300, height: 900 } });
const errs = [];
app.on('pageerror', e => errs.push(String(e)));
await app.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await app.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await app.waitForFunction('window.state && window.pitBuildCoverDoc', null, { timeout: 25000 });
await app.waitForTimeout(500);

/* カード1枚から表紙のHTMLを作る（本物の道を通す） */
async function build(over){
  return await app.evaluate(async (over) => {
    const c = Object.assign({
      id:'CV', resNo:'T02-673394', customer:'小林 大輔', maker:'トヨタ', car:'アクア',
      plate:'習志野 300 あ 12-34', tel:'090-1234-5678',
      reserveDate:'2026-11-28', reserveTime:'10:00', bookedAt:'2026-11-20',
      dropType:'drop', dropType2:'sameDay', repeat:'repeater',
      workType:'shaken', workTypes:['shaken'],
      needLoaner:true, loanerId:(state.loaners[0]||{}).id, loanerFrom:'2026-11-28', loanerTo:'2026-12-01',
      status:'reserved', boardId:'default'
    }, over || {});
    const svg = await fetch('images/様式_お客様情報.svg').then(r => r.text());
    return window.pitBuildCoverDoc(c, { formSvg: svg, noPrint: true });
  }, over);
}
/* 出来上がった紙を開いて、SVGの座標で測る */
async function sheet(doc){
  const p = await b.newPage({ viewport: { width: 1200, height: 860 } });
  const es = [];
  p.on('pageerror', e => es.push(String(e)));
  await p.setContent(doc, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    /* ⚠ `getBBox()` は**その字自身の座標**（transform をかける前）を返す。
       紙の上のどこに在るかを測りたいので、画面の座標を**様式SVGの座標に戻して**見る。 */
    const svg = document.querySelector('.pcv-sheet svg');
    const inv = svg.getScreenCTM().inverse();
    const toUser = (x, y) => { const pt = svg.createSVGPoint(); pt.x = x; pt.y = y; return pt.matrixTransform(inv); };
    const bb = id => { const e = document.getElementById(id); if (!e || !e.getBoundingClientRect) return null;
      const q = e.getBoundingClientRect(); const a = toUser(q.left, q.top), b2 = toUser(q.right, q.bottom);
      const tr = (e.getAttribute('transform')||'').match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/);
      return { x:a.x, y:a.y, w:b2.x-a.x, h:b2.y-a.y, t:(e.textContent||'').trim(),
        base: tr ? parseFloat(tr[2]) : null,          /* 字が乗っている線（ベースライン）＝ここまでしかインクは無い */
        anchor: e.getAttribute('text-anchor') || '', len: e.getComputedTextLength ? e.getComputedTextLength() : 0 }; };
    return { m: bb('pcv-m'), d: bb('pcv-d'), bm: bb('pcv-bm'), drop: bb('pcv-drop'),
             span: bb('pcv-loanerSpan'), resno: bb('pcv-resno'),
             fee: !!document.getElementById('pcv-loanerfee') };
  });
  await p.close();
  return { r, es };
}

console.log('\n── ① 入庫日が2桁でも「/」に被らない ──');
{
  const s = await sheet(await build({ reserveDate:'2026-11-28' }));
  const m = s.r.m;
  /* 「/」の左端＝**字が乗っている線（ベースライン）**の高さで見る。
     ⚠ 字の下端（bbox の底）で見ると、インクの無い descender のぶんだけ厳しく出て嘘の赤になる。
        数字のインクはベースラインで終わっているので、そこで測るのが本当。棒の太さ（約3）は引く。 */
  const yb = m.base != null ? m.base : (m.y + m.h);
  const slashX = SLASH.x1 - (yb - SLASH.y1) - 3;
  ok('🔴 2桁の月が「/」に刺さらない', (m.x + m.w) <= slashX, { right: m.x + m.w, slashX: slashX });
  ok('🔴 箱の中に収まっている（左にはみ出さない）', m.x >= BOX.x, { left: m.x, box: BOX.x });
  ok('2桁の時は右そろえにしている', s.r.m.anchor === 'end', s.r.m.anchor);
  ok('日（28）は今までどおり', s.r.d && s.r.d.t === '28', s.r.d && s.r.d.t);
  ok('予約受付日の月も直っている（2桁）', (s.r.bm.x + s.r.bm.w) <= 396, s.r.bm);
}
{
  const s = await sheet(await build({ reserveDate:'2026-05-28', bookedAt:'2026-05-20' }));
  ok('🔴 1桁の月は**今までと1pxも変えない**（触っていない）', s.r.m.anchor === '', s.r.m);
}

console.log('\n── ② 代車の期間に曜日 ──');
{
  const s = await sheet(await build({}));
  ok('🔴 曜日が入る（11/28(土) 〜 12/1(火)）', s.r.span.t === '11/28(土) 〜 12/1(火)', s.r.span.t);
  ok('マスからはみ出さない（150以内）', s.r.span.len <= 150, s.r.span.len);
  const s2 = await sheet(await build({ loanerTo:'' }));
  ok('片方だけの時は、無い側に「(　)」を作らない', s2.r.span.t.indexOf('()') < 0 && /^11\/28\(土\) 〜\s*$/.test(s2.r.span.t), s2.r.span.t);
}

console.log('\n── ③ 代車管理費のチェック ──');
{
  const on  = await sheet(await build({}));
  const off = await sheet(await build({ needLoaner:false }));
  ok('🔴 代車ありならチェックが入る', on.r.fee === true);
  ok('代車なしなら入らない', off.r.fee === false);
}

console.log('\n── ④ 受付タイプは2つとも・短い言葉 ──');
{
  const two = await sheet(await build({ dropType:'drop', dropType2:'sameDay' }));
  ok('🔴 2つとも刷る（預・当返）', two.r.drop.t === '預・当返', two.r.drop.t);
  ok('🔴 マス（79.7）からはみ出さない', two.r.drop.len <= (DROP_CELL.x1 - DROP_CELL.x0), two.r.drop.len);
  const one = await sheet(await build({ dropType:'wait', dropType2:null }));
  ok('1つの時は1つだけ（待）', one.r.drop.t === '待', one.r.drop.t);
  const two2 = await sheet(await build({ dropType:'wait', dropType2:'drop' }));
  ok('待＋預も両方出る', two2.r.drop.t === '待・預', two2.r.drop.t);
  const none = await sheet(await build({ dropType:null, dropType2:null }));
  ok('選んでいない時は空（「・」だけ出さない）', none.r.drop.t === '', none.r.drop.t);
}

console.log('\n── ⑤ 予約番号を入庫日ボックスの右上に ──');
{
  const s = await sheet(await build({}));
  const r = s.r.resno;
  ok('🔴 予約番号が刷られる', !!r && r.t === 'T02-673394', r && r.t);
  ok('🔴 入庫日の箱の中にある', r.x >= BOX.x && (r.x + r.w) <= (BOX.x + BOX.w) && r.y >= BOX.y, r);
  ok('右上にある（箱の右寄り・上寄り）',
     (r.x + r.w) >= (BOX.x + BOX.w - 8) && r.y <= (BOX.y + 12), r);
  ok('小さい字（6px前後）', r.h <= 8, r.h);
  const no = await sheet(await build({ resNo:'' }));
  ok('予約番号が無いカードには何も出さない', no.r.resno === null);
}

console.log('\n── 🧭 コードの決めごと ──');
{
  const js = fs.readFileSync(path.join(process.cwd(), 'js', 'cover-print.js'), 'utf8');
  const src = js.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('🔴 受付タイプは主・副の2つを見ている', /\[c\.dropType,\s*c\.dropType2\]/.test(src));
  ok('🔴 紙の言い方の表が1本ある（DROP_PRINT）', /DROP_PRINT\s*=\s*\{[^}]*当返/.test(src));
  ok('🔴 月の直しは1本（fitDate）＋座標の表（DATE_FIT）', /function fitDate/.test(src) && /DATE_FIT/.test(src));
  ok('🔴 曜日つきの期間も1本（mdDow）', /function mdDow/.test(src));
}

console.log('\n── 🧯 JSエラー ──');
ok('アプリ側のJSエラー0', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n===== ' + OK + ' OK / ' + NG + ' NG =====');
process.exit(NG ? 1 : 0);
