/* PitFlow v1.50.0 ── 会社の営業日カレンダー（MHS連携）のテスト
   -------------------------------------------------------------------
   ◎考え方
     本体は動かさない。**本物の js/cal-pit.js** を小さなページに載せ、
     偽の Firestore から「MHSが配るドキュメント」を流し込んで確かめる。
     あわせて **MHS/index.html の配る側**（mhsBuildCalendar など）が
     消えていないか・約束したキー（c / o / h / e / l / k / biz / dow）を
     使い続けているかも見張る。片側だけ直すと、ここが落ちる。

   ◎見張っていること（大事な順）
     ① 休みの判定が **曜日ではなく MHS の日付** で決まる（臨時休業・特別営業が効く）
     ② 「届いていない」と「休みでない」を **混ぜない**（誤予約の元）
     ③ 午前休み／午後休み／早締めが **営業時間** に出る
     ④ PitFlow 側に定休曜日の**入力欄が復活していない**（二重管理の再発防止）

   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8964      ← 別ウィンドウ
     node test_mhscal.mjs                                                  */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ===== 試験台を組み立てる ===== */
(function build(){
  const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="css/polish.css">
<style>
:root{--bg:#12161f;--bg2:#161c28;--bg3:#1e2634;--border:#2b3547;--border2:#39455c;--text:#dbe3ef;--text2:#93a2bb;--text3:#63718a;--brand:#1db97a;--red:#ef4444}
body{margin:0;background:var(--bg);color:var(--text);font-family:sans-serif;padding:16px}
</style><body>
<div id="out"></div>
<script src="js/coreflow-icons.js"><\/script>
<script>
/* ---- 本体から借りる最小の道具 ---- */
window.PIT_CAL_MIRROR=1;   /* 🔴 PitFlow だけが立てる印（CarFlow など他アプリでは写さない） */
window.state={ currentView:'settings', settings:{ closedDow:[3], openTime:'09:00', cutoffTime:'17:00' } };
window.__views=0; window.showView=function(){ window.__views++; };
window.__repaints=0; window.pitCardRepaint=function(){ window.__repaints++; };

/* ---- 偽の Firestore（onSnapshot を手で発火できるようにする） ---- */
window.__sub=null; window.__subCount=0; window.__docId='';
window.fb={ currentCompanyId:'kobayashi_motors', db:{
  collection:function(){ return { doc:function(){ return { collection:function(){ return {
    doc:function(id){ return { onSnapshot:function(okc,ng){
      window.__docId=id; window.__subCount++; window.__sub={ok:okc,ng:ng}; return function(){};
    } }; }
  }; } }; } }; }
}};
window.__push=function(v,ageDays){
  if(!window.__sub) return false;
  var at=Date.now()-(ageDays||0)*86400000;
  var d=JSON.parse(JSON.stringify(v)); d.updatedAt={ toMillis:function(){ return at; } };
  window.__sub.ok({ exists:true, data:function(){ return d; } });
  return true;
};
window.__pushMissing=function(){ if(!window.__sub) return false; window.__sub.ok({exists:false}); return true; };
window.__pushError  =function(){ if(!window.__sub) return false; window.__sub.ng(new Error('permission-denied')); return true; };
<\/script>
<script src="js/cal-pit.js"><\/script>
<script>window.__ready=1;<\/script>`;
  fs.writeFileSync(path.join(dir, 'test-mhscal.html'), page);
})();

/* ===== ① 配る側（MHS）が約束を守っているか＝ソースを直接見張る ===== */
console.log('\n── ① 配る側（MHS/index.html）が生きているか ──');
{
  const mhs = path.join(dir, '..', '..', 'MHS', 'index.html');
  if (!fs.existsSync(mhs)) {
    console.log('  ⚠ MHS/index.html が見つからないので配る側の見張りは省略（' + mhs + '）');
  } else {
    const s = fs.readFileSync(mhs, 'utf8');
    ok('配り先が appSummaries/mhsCalendar のまま', /doc\('mhsCalendar'\)/.test(s));
    ok('mhsBuildCalendar がある', /function mhsBuildCalendar\(/.test(s));
    ok('mhsPublishCalendar がある', /function mhsPublishCalendar\(/.test(s));
    ok('定期配信（mhsPublishSummary）から呼ばれている', /mhsPublishSummary[\s\S]{0,400}mhsPublishCalendar\(\)/.test(s));
    ok('🔴 定休日カレンダーを保存したら即配る（saveCal から）', /function saveCal\(\)[\s\S]{0,600}mhsSchedulePublishCalendar\(\)/.test(s));
    ok('約束したキーを使っている（c/o/h/e/l/k）', /\{c:1,k:k,l:l\}/.test(s) && /\{o:1,k:'date',l:'特別営業'\}/.test(s)
       && /h:String\(mk\.half\), e:String\(mk\.end\|\|''\), l:String\(mk\.note\|\|''\)/.test(s));
    ok('biz（営業時間）と dow（予備の定休曜日）を配る', /biz:\{ s:String\(CAL\.bizStart/.test(s) && /dow:_calWeeklyDow\(\)/.test(s));
    ok('🔴 祝日表が未着のうちは配らない（祝日が営業日に見えるのを防ぐ）', /ccalHolClose\(\)&&!Object\.keys\(SF_HOL\.map\|\|\{\}\)\.length/.test(s));
    ok('範囲は先月〜14ヶ月先（1年先の車検予約まで届く）', /TODAY\.getMonth\(\)-1, 1\)/.test(s) && /TODAY\.getMonth\(\)\+15, 0\)/.test(s));
  }
}

/* ===== ② PitFlow 側に定休の入力欄が復活していないか ===== */
console.log('\n── ② 二重管理の再発防止（PitFlowでは直せない） ──');
{
  const st = fs.readFileSync(path.join(dir, 'js', 'settings.js'), 'utf8');
  ok('🔴 設定に定休曜日のチェックボックスが無い', !/ps-dow-/.test(st));
  ok('🔴 設定に営業時間の入力欄が無い', !/id="ps-open"/.test(st) && !/id="ps-cutoff"/.test(st));
  ok('設定は PitCal のカード（見るだけ）を出している', /pitCalCardHtml\(\)/.test(st));
  const rl = fs.readFileSync(path.join(dir, 'js', 'rules.js'), 'utf8');
  ok('🔴 ルールページに長期休みの日付入力が無い', !/pitBreakEdit\(\d|pitBreakEdit\(' \+ i/.test(rl) && !/onchange="pitBreakEdit/.test(rl));
  ok('ルールの長期休みは PitCal.breaks() から', /_breaks\(cfg\) \{ return \(window\.PitCal \? PitCal\.breaks\(\) : \[\]\); \}/.test(rl));

  /* 営業日を見るファイルが、素の closedDow を見ていないこと */
  const watch = ['reserve.js','return.js','rules.js','card-view.js','fleet.js','loaner.js',
                 'parking.js','shaken.js','result.js','mydash.js','car-sales.js','dashboard.js'];
  const bad = watch.filter(f => /settings\s*(&&\s*state\.settings\s*)?\.?closedDow|settings\.closedDow/
                                 .test(fs.readFileSync(path.join(dir,'js',f),'utf8')));
  ok('🔴 営業日を見る12ファイルが closedDow を直に見ていない', bad.length === 0, bad);
  const nopit = watch.filter(f => !/PitCal\./.test(fs.readFileSync(path.join(dir,'js',f),'utf8')));
  ok('その12ファイルはすべて PitCal を通している', nopit.length === 0, nopit);
}

/* ===== ③ 読む側（cal-pit.js）を実際に動かす ===== */
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const b = await chromium.launch({ executablePath: cp });
const ctx = await b.newContext({ viewport: { width: 900, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:8964/test-mhscal.html');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForFunction('window.__ready===1');

const ev = (fn, arg) => p.evaluate(fn, arg);

/* 2026年8月：水曜定休（8/5,12,19,26）＋お盆 8/13〜8/16 ＋臨時休業 8/21
   ＋特別営業 8/26（水曜だけど開ける）＋午前休み 8/7 ＋早締め 8/28（15:00） */
const CAL = {
  ver: 1, from: '2026-07-01', to: '2027-10-31',
  biz: { s: '09:00', e: '18:00' },
  dow: [3],
  days: {
    '2026-08-05': { c: 1, k: 'weekly',  l: '定休' },
    '2026-08-12': { c: 1, k: 'weekly',  l: '定休' },
    '2026-08-13': { c: 1, k: 'range',   l: 'お盆休み' },
    '2026-08-14': { c: 1, k: 'range',   l: 'お盆休み' },
    '2026-08-15': { c: 1, k: 'range',   l: 'お盆休み' },
    '2026-08-16': { c: 1, k: 'range',   l: 'お盆休み' },
    '2026-08-19': { c: 1, k: 'weekly',  l: '定休' },
    '2026-08-21': { c: 1, k: 'date',    l: '臨時休業（棚卸し）' },
    '2026-08-26': { o: 1, k: 'date',    l: '特別営業' },
    '2026-08-07': { h: 'am', e: '',      l: '' },
    '2026-08-28': { h: 'end', e: '15:00', l: '' },
    '2026-12-29': { c: 1, k: 'range',   l: '年末年始' },
    '2026-12-30': { c: 1, k: 'range',   l: '年末年始' }
  }
};

console.log('\n── ③ まだ届いていない時（予備値で動く・でも黙らない） ──');
ok('mhsCalendar を1回だけ購読する', (await ev(() => window.__subCount)) === 1 && (await ev(() => window.__docId)) === 'mhsCalendar');
ok('届く前でも水曜は休みになる（予備の定休曜日）', await ev(() => PitCal.isClosed('2026-08-05')));
ok('届く前は臨時休業を知らない（木曜は営業のまま）', !(await ev(() => PitCal.isClosed('2026-08-21'))));
{
  const st = await ev(() => PitCal.status());
  ok('状態＝loading', st.state === 'loading', st);
  const nt = await ev(() => PitCal.notice());
  ok('読み込み中は注意を出さない（一瞬なので）', nt === null, nt);
}
ok('未配信になったら「まだ届いていない」と言う', await ev(() => window.__pushMissing()));
{
  const nt = await ev(() => PitCal.notice());
  ok('🔴 「届いていない」と分かる文言が出る', /まだ届いていません/.test(nt || ''), nt);
  ok('🔴 「臨時休業が反映されていない」と書いてある', /臨時休業|反映/.test(nt || ''), nt);
}

console.log('\n── ④ 届いた（ここからが本番） ──');
ok('流し込めた', await p.evaluate(c => window.__push(c, 0), CAL));
await p.waitForTimeout(220);
ok('届いたら画面を描き直す', (await ev(() => window.__views)) >= 1 && (await ev(() => window.__repaints)) >= 1);

ok('毎週の定休（水）＝休み', await ev(() => PitCal.isClosed('2026-08-05')));
ok('🔴 お盆（木曜）＝休み', await ev(() => PitCal.isClosed('2026-08-13')));
ok('🔴 臨時休業（金曜）＝休み', await ev(() => PitCal.isClosed('2026-08-21')));
ok('🔴 特別営業の水曜＝営業（曜日だけなら休みになる日）', !(await ev(() => PitCal.isClosed('2026-08-26'))));
ok('ふつうの営業日＝営業', !(await ev(() => PitCal.isClosed('2026-08-20'))));
ok('日曜は営業（この会社は日曜営業）', !(await ev(() => PitCal.isClosed('2026-08-09'))));

console.log('\n── ⑤ 画面に出す言葉 ──');
ok('お盆はその名前のまま出る', (await ev(() => PitCal.label('2026-08-13'))) === 'お盆休み');
ok('臨時休業は理由まで出る', (await ev(() => PitCal.label('2026-08-21'))) === '臨時休業（棚卸し）');
ok('ふつうの定休は「定休」', (await ev(() => PitCal.label('2026-08-05'))) === '定休');
ok('特別営業も分かる', (await ev(() => PitCal.label('2026-08-26'))) === '特別営業');
ok('午前休み', (await ev(() => PitCal.label('2026-08-07'))) === '午前休み');
ok('早締めは時刻つき', (await ev(() => PitCal.label('2026-08-28'))) === '〜15:00締');
ok('ふつうの日は何も出さない（空文字）', (await ev(() => PitCal.label('2026-08-20'))) === '');
ok('🔴 休業日は mark() に出さない（休みは別の見せ方をするため）', (await ev(() => PitCal.mark('2026-08-13'))) === '');
ok('半休は mark() に出る', (await ev(() => PitCal.mark('2026-08-07'))) === '午前休み');

console.log('\n── ⑥ 営業時間（半休・早締めが効く） ──');
{
  const h1 = await ev(() => PitCal.hours('2026-08-20'));
  ok('ふつうの日は 09:00〜18:00', h1.open === '09:00' && h1.close === '18:00', h1);
  const h2 = await ev(() => PitCal.hours('2026-08-07'));
  ok('🔴 午前休みは 13:00 から', h2.open === '13:00' && h2.half === 'am', h2);
  const h3 = await ev(() => PitCal.hours('2026-08-28'));
  ok('🔴 早締めは 15:00 まで', h3.close === '15:00' && h3.half === 'end', h3);
  ok('締切の「時」も合う（reserve.js が使う）', (await ev(() => PitCal.cutoffHour('2026-08-28'))) === 15);
  const h4 = await ev(() => PitCal.hours('2026-08-13'));
  ok('休みの日は closed が立つ', h4.closed === true, h4);
}

console.log('\n── ⑦ 長期休み（ルールページの「休み前/休み後」が使う） ──');
{
  const brs = await ev(() => PitCal.breaks());
  ok('2件になる（お盆・年末年始）', brs.length === 2, brs);
  ok('🔴 連続した4日を1つにまとめる', brs[0].from === '2026-08-13' && brs[0].to === '2026-08-16', brs[0]);
  ok('名前が付く', brs[0].label === 'お盆休み', brs[0]);
  ok('🔴 単発の臨時休業は長期休みに混ぜない', !brs.some(b => /棚卸し/.test(b.label)), brs);
  ok('🔴 毎週の定休も長期休みに混ぜない', !brs.some(b => b.label === '定休'), brs);
}

console.log('\n── ⑧ 配られた範囲の外 ──');
ok('範囲外（2028年）の水曜は予備の定休曜日で休み', await ev(() => PitCal.isClosed('2028-08-02')));
ok('範囲外の木曜は営業（知らないので曜日だけ）', !(await ev(() => PitCal.isClosed('2028-08-03'))));

console.log('\n── ⑨ 古い・読めない ──');
{
  let st = await ev(() => PitCal.status());
  ok('状態＝ok', st.state === 'ok', st);
  ok('古くない', st.stale === false, st);
  ok('届いている時は注意を出さない', (await ev(() => PitCal.notice())) === null);
  ok('最終更新が「8/5 09:12」の形で出る', /^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/.test(await ev(() => PitCal.updatedLabel())));

  await p.evaluate(c => window.__push(c, 9), CAL);   /* 9日前の配信 */
  await p.waitForTimeout(220);
  st = await ev(() => PitCal.status());
  ok('9日前なら「古い」', st.stale === true && st.staleDays === 9, st);
  const nt = await ev(() => PitCal.notice());
  ok('🔴 何日前かを書く', /9日前/.test(nt || ''), nt);
  ok('注意の帯が出る', /cal-warn/.test(await ev(() => PitCal.noticeHtml())));

  await ev(() => window.__pushError());
  await p.waitForTimeout(220);
  ok('読めない時は error', (await ev(() => PitCal.status())).state === 'error');
  ok('🔴 「読めなかった」と「休みが無い」を混ぜない', /読めませんでした/.test(await ev(() => PitCal.notice())));
}

console.log('\n── ⑩ 前に届いた内容を覚えている（予備値） ──');
{
  await p.evaluate(c => window.__push(c, 0), CAL);
  await p.waitForTimeout(220);
  await p.reload();
  await p.waitForFunction('window.__ready===1');
  ok('🔴 開き直しても（届く前から）お盆が休みのまま', await ev(() => PitCal.isClosed('2026-08-13')));
  ok('🔴 開き直しても臨時休業が休みのまま', await ev(() => PitCal.isClosed('2026-08-21')));
  const nt = await ev(() => PitCal.notice());
  ok('ただし「前回の内容」と断る', /前回届いた内容/.test(nt || ''), nt);
}

console.log('\n── ⑪ 予備値の写し（差し替え忘れた所の保険） ──');
{
  await p.evaluate(c => window.__push(c, 0), CAL);
  await p.waitForTimeout(220);
  const s = await ev(() => JSON.parse(JSON.stringify(state.settings)));
  ok('state.settings.closedDow に MHS の定休曜日が写る', JSON.stringify(s.closedDow) === '[3]', s.closedDow);
  ok('営業時間も写る', s.openTime === '09:00' && s.cutoffTime === '18:00', s);
  /* 🔴 印を立てていないアプリ（CarFlow など）では、よその設定を書き換えない */
  await p.evaluate(() => { window.PIT_CAL_MIRROR = 0; state.settings.closedDow = ['よそのもの']; });
  await p.evaluate(c => window.__push(c, 0), CAL);
  await p.waitForTimeout(220);
  ok('🔴 印が無いアプリでは state.settings を書き換えない',
     JSON.stringify(await ev(() => state.settings.closedDow)) === '["よそのもの"]',
     await ev(() => state.settings.closedDow));
  await p.evaluate(() => { window.PIT_CAL_MIRROR = 1; });
}

console.log('\n── ⑫ 設定ページのカード（見るだけ） ──');
{
  const h = await ev(() => window.pitCalCardHtml());
  ok('「MHSが基準」と書いてある', /MHSが基準/.test(h));
  ok('直す場所（管理▸定休日カレンダー）を案内している', /定休日カレンダー/.test(h));
  ok('🔴 入力欄が1つも無い（ここでは直せない）', !/<input/.test(h), (h.match(/<input[^>]*>/g) || []));
  /* ⚠ 2026-08-07 に判明：ここは「09:00〜18:00」と**日付を決め打ち**していたので、
       試験の仕込みで **8/7 を午前休み（13:00開き）**にしてあるのに、
       たまたま 8/7 に走らせると落ちる、という「その日だけ落ちる試験」だった。
       🔴 カードは **PitCal.hours(今日) が言うとおりに出ているか**を見る（＝いつ走らせても正しい）。 */
  const _hrs = await ev(() => {
    const d = new Date(), pad = n => (n < 10 ? '0' : '') + n;
    return PitCal.hours(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
  });
  ok('いまの営業時間が出る（今日が午前休み・早締めでも、その日の時間が出る）',
     h.indexOf(_hrs.open + ' 〜 ' + _hrs.close) >= 0, { hrs: _hrs, h: h.slice(0, 400) });
  ok('毎週の定休が出る', /水曜/.test(h));
  ok('長期休みの一覧が出る', /お盆休み/.test(h) && /年末年始/.test(h));
  ok('最終更新が出る', /MHS更新/.test(h));
}

console.log('\n── ⑬ 壊れた入力でも落ちない ──');
ok('空の日付', (await ev(() => PitCal.label(''))) === '' && (await ev(() => PitCal.isClosed(''))) === false);
ok('でたらめな日付', (await ev(() => PitCal.isClosed('あいうえお'))) === false);
ok('null', (await ev(() => PitCal.isClosed(null))) === false);
{
  await p.evaluate(() => window.__push({ ver: 1 }, 0));   /* days も biz も無い */
  await p.waitForTimeout(220);
  ok('中身が空のドキュメントでも落ちない', (await ev(() => PitCal.isClosed('2026-08-13'))) === false);
  ok('営業時間は予備値に落ちる', (await ev(() => PitCal.hours('2026-08-20'))).open === '09:00');
}

console.log('\n── ⑭ JSエラー ──');
ok('ページのJSエラーなし', errs.length === 0, errs.slice(0, 4));

await b.close();
try { fs.unlinkSync(path.join(dir, 'test-mhscal.html')); } catch (e) {}
console.log('\n' + pass + ' OK / ' + fail + ' NG\n');
process.exit(fail ? 1 : 0);
