/* ============================================================
   test_return_plan_week.mjs
   ダッシュボードの「今週の返車予定」BOX を見張る。

   きっかけ：ゆうた 2026-08-28
     「前回のお礼LINEの一覧的な感じで、**今週の返車予定一覧**。
       **確定返車ではなくて　暫定返車予定が今週になっている車**を一覧表示するBOXを作成。
       1週間分のカレンダーで**常に先の6日分**出るイメージ。繰り返しになる。
         月火水木金土日
         10 11 12 休 ／ 今8  9
       みたいに**追いかけてくる**イメージ。**昨日だけ斜線で無効扱い**」
     「**チェックなどはいらない**　国産車輸入車関係なく一覧で表示　**上部に総件数**かな」

   いまの決めごと（v2.21.0）：
     🔴 拾うのは **`plan`（暫定＝受注のときのお客様への約束）だけ**。
        確定(fixed)・未完(pending)・待や当(sameday)・未定(tbd) は**入れない**。
        物差しは _shared の `pitReturnPlanKind` / `pitReturnPlanDate` **1本**。
        ⚠ 「日付があれば暫定」と mydash.js に書き写さないこと（v1.153.0 の線引きが崩れる）。
     ・曜日の見出しは **月火水木金土日 で固定**。そこへ **昨日〜5日先の7日**を入れる
       ＝ 7日はちょうど全曜日に1つずつ入るので、日付だけが日々ずれていく。
     ・**昨日のマスは斜線（.past）で無効扱い。ただし中の車は消さない**
       （過ぎたのに約束のままの車＝いちばん見たいもの）。
     ・休みの日は 休（.closed）。今日は .today。
     ・上に総件数（○台）。チェックボックスは付けない。

   使い方：
     python3 -m http.server 8968 --directory . &
     PORT=8968 node test_return_plan_week.mjs
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

console.log('\n── 🧭 物差しは1本か ──');
{
  const md = fs.readFileSync(path.join(process.cwd(), 'js', 'mydash.js'), 'utf8');
  const body = md.replace(/\/\*[\s\S]*?\*\//g, '');           /* 説明文は外して中身だけ見る */
  const rp = (body.match(/function rpDays\(\)[\s\S]*?function rpCalHtml[\s\S]*?\n  \}/) || [''])[0]
           + (body.match(/returnPlanWeek\s*:[\s\S]*?\n    \}/) || [''])[0];
  ok('BOX 今週の返車予定がある', /returnPlanWeek\s*:/.test(body));
  ok('🔴 拾う物差しが共通部品（pitReturnPlanKind）', /pitReturnPlanKind\(c\)\s*===\s*'plan'/.test(rp), rp.slice(0,120));
  ok('🔴 日付も共通部品（pitReturnPlanDate）', /pitReturnPlanDate\(/.test(body));
  ok('🔴 「日付があれば暫定」と書き写していない',
     rp.length > 200 && !/returnDatePlan/.test(rp) && !/returnStage/.test(rp) && !/c\.returnDate/.test(rp), rp.length);
  ok('🔴 待・当を自前で判定していない', !/dropType/.test(rp));
  ok('日のずらし方が1本（mdShift）', /function mdShift/.test(body) && /mdShift\(C\.tStr, i\)/.test(body));
  ok('休みは共通の PitCal で見ている', /PitCal\.isClosed/.test(body));
  ok('チェックボックスは付けていない', !/rp-[a-z]*chk|type="checkbox"[\s\S]{0,80}rp-/.test(body));
  const css = fs.readFileSync(path.join(process.cwd(), 'css', 'mydash.css'), 'utf8');
  ok('CSS に斜線（.rp-cell.past）がある', /\.rp-cell\.past/.test(css));
  ok('CSS に今日（.rp-cell.today）がある', /\.rp-cell\.today/.test(css));
  ok('CSS に休み（.rp-cell.closed）がある', /\.rp-cell\.closed/.test(css));
  const ix = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  ok('版が3か所そろっている（2.21.0）',
     (ix.match(/2\.21\.0/g) || []).length >= 3, (ix.match(/2\.21\.0/g) || []).length);
  ok('触った mydash.js / mydash.css に ?v= が付いている',
     /js\/mydash\.js\?v=\d+/.test(ix) && /css\/mydash\.css\?v=\d+/.test(ix));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderMyDash && window.pitReturnPlanKind', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* 土台。5段階＋売上なし＋窓の外を1枚ずつ置いて、暫定だけが出るか見る。
   ⚠ 日付は決め打ちしない。今日から数える。 */
const T = await p.evaluate(() => {
  const ymdL = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const sh = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymdL(d); };
  const base = (id, name, car) => ({ id: id, resNo: id, customer: name, car: car,
    plate: '習志野 300 あ 12-34', reserveDate: sh(-3), boardId: 'default',
    workType: 'shaken', workTypes: ['shaken'] });

  state.cards = [];                     /* 見本データを外して、置いた駒だけで見る */
  const add = o => { state.cards.push(o); return o; };

  /* 暫定（plan）＝盤面にいて・待/当でない・返車日を持っている */
  const plan = (id, name, car, day) => add(Object.assign(base(id, name, car),
    { status: 'partsWait', returnDate: sh(day) }));

  plan('RPW-y', '昨日 太郎', 'CAR-Y', -1);
  plan('RPW-t1', '今日 一郎', 'CAR-T1', 0);
  plan('RPW-t2', '今日 二郎', 'CAR-T2', 0);
  plan('RPW-p1', '明日 三郎', 'CAR-P1', 1);
  plan('RPW-p5', '五日先 四郎', 'CAR-P5', 5);

  /* 出てはいけないもの */
  add(Object.assign(base('RPW-fixed', '確定 五郎', 'CAR-FIXED'),
      { status: 'callDone', returnStage: 'callDone', returnDate: sh(1) }));      /* 確定 */
  add(Object.assign(base('RPW-pend', '未完 六郎', 'CAR-PEND'),
      { status: 'workDone', returnDate: sh(1) }));                              /* 未完 */
  add(Object.assign(base('RPW-same', '当日 七郎', 'CAR-SAME'),
      { status: 'partsWait', dropType: 'sameDay', reserveDate: sh(1) }));        /* 待・当 */
  add(Object.assign(base('RPW-tbd', '未定 八郎', 'CAR-TBD'),
      { status: 'callDone', returnStage: 'callDone', returnDate: '' }));         /* 未定 */
  add(Object.assign(base('RPW-nosale', '売上なし 九郎', 'CAR-NOSALE'),
      { status: 'partsWait', returnDate: sh(0), noSale: true }));                /* 社内・売上なし */
  plan('RPW-out1', '窓の外 十郎', 'CAR-OUT1', -2);                                  /* おととい */
  plan('RPW-out2', '窓の外 十一', 'CAR-OUT2', 6);                                   /* 6日先 */

  const kinds = {};
  state.cards.filter(c => String(c.id).indexOf('RPW-') === 0)
             .forEach(c => { kinds[c.id] = pitReturnPlanKind(c); });

  state.settings.myDash = { v: 2, active: 0, presets: [{ name: '試験', layout: [{ e: 'returnPlanWeek', s: 'l' }] }] };
  showView('dashboard'); renderMyDash();
  return { kinds: kinds, today: ymdL(new Date()), yest: sh(-1) };
});
await p.waitForTimeout(400);

console.log('\n── 📀 土台（4段階が意図どおりに出来ているか） ──');
ok('暫定の駒が plan になっている',
   ['RPW-y','RPW-t1','RPW-t2','RPW-p1','RPW-p5','RPW-out1','RPW-out2'].every(k => T.kinds[k] === 'plan'), T.kinds);
ok('確定の駒が fixed', T.kinds['RPW-fixed'] === 'fixed', T.kinds['RPW-fixed']);
ok('未完の駒が pending', T.kinds['RPW-pend'] === 'pending', T.kinds['RPW-pend']);
ok('待・当の駒が sameday', T.kinds['RPW-same'] === 'sameday', T.kinds['RPW-same']);
ok('未定の駒が tbd', T.kinds['RPW-tbd'] === 'tbd', T.kinds['RPW-tbd']);

const V = await p.evaluate(() => {
  const box = document.querySelector('#mydash-flow .rp-cal');
  if (!box) return { none: true };
  const heads = [...box.querySelectorAll('.rp-h')].map(e => e.textContent.trim());
  const cells = [...box.querySelectorAll('.rp-cell')].map(e => ({
    d: (e.querySelector('.rp-d') || {}).textContent || '',
    past: e.classList.contains('past'),
    today: e.classList.contains('today'),
    closed: e.classList.contains('closed'),
    names: [...e.querySelectorAll('.rp-n')].map(x => x.textContent.trim()),
    cars: [...e.querySelectorAll('.rp-c')].map(x => x.textContent.trim()),
    more: (e.querySelector('.rp-more') || {}).textContent || ''
  }));
  const host = box.closest('.md-box') || box.parentElement;
  return {
    heads: heads, cells: cells,
    text: (host.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    chk: host.querySelectorAll('input[type=checkbox]').length,
    title: !!(host.textContent || '').match(/今週の返車予定/)
  };
});

console.log('\n── 🗓 かたち ──');
ok('BOX が出ている', !V.none && V.title, V.text);
ok('曜日は 月火水木金土日 で固定', JSON.stringify(V.heads) === JSON.stringify(['月','火','水','木','金','土','日']), V.heads);
ok('マスは7つ', V.cells.length === 7, V.cells.length);
{
  const nums = V.cells.map(c => (c.d.match(/\d+/) || [''])[0]);
  const want = [];
  for (let i = -1; i <= 5; i++) { const d = new Date(T.today + 'T00:00:00'); d.setDate(d.getDate() + i); want.push(String(d.getDate())); }
  /* 曜日の位置に置かれているので、並びは月曜始まりに並べ替えてから見る */
  const got = V.cells.map((c, i) => ({ col: i, n: (c.d.match(/\d+/) || [''])[0] }));
  ok('昨日〜5日先の7日がそろっている', want.every(n => got.some(g => g.n === n)), { want, got: got.map(g => g.n) });
  const yd = String(new Date(T.yest + 'T00:00:00').getDate());
  const ydCol = (new Date(T.yest + 'T00:00:00').getDay() + 6) % 7;
  ok('昨日はその曜日の列にいる', (V.cells[ydCol].d.match(/\d+/) || [''])[0] === yd, { ydCol, cell: V.cells[ydCol].d });
  ok('斜線（無効）は昨日のマスだけ', V.cells.filter(c => c.past).length === 1 && V.cells[ydCol].past,
     V.cells.map(c => c.past));
  const tCol = (new Date(T.today + 'T00:00:00').getDay() + 6) % 7;
  ok('今日のマスだけ today', V.cells.filter(c => c.today).length === 1 && V.cells[tCol].today, V.cells.map(c => c.today));
  ok('今日のマスに「今」が付く', /今/.test(V.cells[tCol].d), V.cells[tCol].d);
  ok('昨日の車は消えていない（斜線でも残す）', V.cells[ydCol].cars.indexOf('CAR-Y') >= 0, V.cells[ydCol].cars);
}

console.log('\n── 🔎 拾い方（暫定だけ） ──');
{
  const all = V.cells.flatMap(c => c.cars);
  const has = x => all.indexOf(x) >= 0;
  ok('暫定は出る（昨日・今日×2・明日・5日先）',
     ['CAR-Y','CAR-T1','CAR-T2','CAR-P1','CAR-P5'].every(has), all);
  ok('🔴 確定は出ない', !has('CAR-FIXED'), all);
  ok('🔴 未完は出ない', !has('CAR-PEND'), all);
  ok('🔴 待・当は出ない', !has('CAR-SAME'), all);
  ok('🔴 未定は出ない', !has('CAR-TBD'), all);
  ok('売上なしは出ない', !has('CAR-NOSALE'), all);
  ok('おとといは窓の外', !has('CAR-OUT1'), all);
  ok('6日先は窓の外', !has('CAR-OUT2'), all);
}

console.log('\n── 🧮 総件数 ──');
{
  const N = await p.evaluate(() => {
    const host = document.querySelector('#mydash-flow .rp-cal').closest('.md-box');
    const m = (host.textContent || '').replace(/\s+/g, ' ').match(/(\d+)\s*台/);
    return m ? +m[1] : -1;
  });
  const shown = V.cells.reduce((a, c) => a + c.names.length + (+(c.more.match(/\d+/) || [0])[0]), 0);
  ok('上に総件数（○台）が出ている', N > 0, N);
  ok('総件数 = マスの中の台数の合計', N === shown, { N, shown });
  ok('チェックボックスは無い', V.chk === 0, V.chk);
}

console.log('\n── 👆 押したら開くか ──');
{
  const r = await p.evaluate(() => {
    const car = [...document.querySelectorAll('#mydash-flow .rp-car')]
      .find(e => /CAR-T1/.test(e.textContent));
    if (!car) return 'no-car';
    car.click();
    return 'clicked';
  });
  await p.waitForTimeout(500);
  const open = await p.evaluate(() => {
    const m = document.getElementById('modal-detail');
    return !!(m && m.classList.contains('show')) && /CAR-T1/.test((m.textContent || '') + (document.getElementById('card-title-modal') || {}).textContent);
  });
  ok('車を押すとカードが開く', r === 'clicked' && open, { r, open });
}

console.log('\n── 🧹 かさ（s は数だけ） ──');
{
  const s = await p.evaluate(() => {
    state.settings.myDash = { v: 2, active: 0, presets: [{ name: '試験', layout: [{ e: 'returnPlanWeek', s: 's' }] }] };
    renderMyDash();
    const host = document.querySelector('#mydash-flow .md-box');
    return { cal: !!document.querySelector('#mydash-flow .rp-cal'), t: (host.textContent || '').replace(/\s+/g, ' ').trim() };
  });
  ok('s は数だけ（カレンダーは出さない）', !s.cal && /\d+\s*台/.test(s.t), s.t.slice(0, 60));
}

console.log('\n── 🧯 JSエラー ──');
ok('画面のエラー 0', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log('\n═══ ' + OK + ' OK / ' + NG + ' NG ═══');
process.exit(NG ? 1 : 0);
