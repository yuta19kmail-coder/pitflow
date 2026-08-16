/* PitFlow v1.104.0 ── 表示まわり3点（ゆうた指定 2026-08-16）
   -------------------------------------------------------------------
   ◎ゆうたの言葉
     ① 「フロントや受付担当を**小林モータース**で選んだ時に、枠として十分幅がある予約詳細とかの画面以外では
         **コバモ** 表示にしてほしい。**各カードや当日ボードの縦書き部分**を含む」
     ② 「**1課2課の選択がされていない場合**には当日ボードの**担当者の背景帯をグレー**にしてほしい」
     ③ 「**〇時〜〇時の表示**の時に当日ボードは 10:00 / 〜 / 11:00 みたいに**改行の3段**にできないかな？
         いまだと右側が結構かくれちゃってる」

   ◎ここで見張ること
     🔴 ①の物差しは `pit-share.js` の `pitStaffShort` 1本。狭い枠の5か所が全部それを通っているか
        （当日ボード／コンパクトカード／週カード／PIT配置図／予約詳細の日別リスト）
     🔴 **幅のある画面（予約詳細カード・ホバー情報カード）はフルのまま**＝短くしていないこと
     🔴 ②の色は `pitDivisionColorOr` 1本。**車（国産／輸入）から色を作っていない**こと（v1.92.0の決めごと）
     🔴 ③の折る判断は `pitTimeLines` 1本。言葉（AM・レッカー）は折らないこと

   ◎使い方
     python3 -m http.server 8996      ← 別ウィンドウ
     node test_disp3.mjs                                                 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8996;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };
const read = f => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

/* ══════════════════════════════════════════════════════════════
   Ⅰ 物差しそのもの（pit-share.js を node で直接動かす）
   ══════════════════════════════════════════════════════════════ */
console.log('\n── ① 狭い枠の担当者名（自社＝コバモ）──');
const shareSrc = read('pit-share.js');
const W = {};
new Function('window', shareSrc)(W);

ok('pitStaffShort が公開されている', typeof W.pitStaffShort === 'function');
[
  ['小林モータース',           'コバモ'],
  ['小林モータース株式会社',   'コバモ'],
  ['小林モータース 株式会社',  'コバモ'],
  ['株式会社小林モータース',   'コバモ'],
  ['(株)小林モータース',       'コバモ'],
  ['（株）小林モータース',     'コバモ'],
  ['小林モータース㈱',         'コバモ'],
  ['コバモ',                   'コバモ'],
  ['　小林モータース　',       'コバモ']
].forEach(([inp, want]) => ok('「' + inp + '」→ コバモ', W.pitStaffShort(inp) === want, W.pitStaffShort(inp)));

console.log('  ── 人・よその会社は今までどおり ──');
[
  ['小林 勇太',        '小林'],
  ['チーフ',           'チーフ'],
  ['山田（太）',       '山田（太）'],
  ['○○自動車株式会社', '○○自動車㈱'],
  ['',                 ''],
  [null,               '']
].forEach(([inp, want]) => ok('「' + inp + '」→ ' + (want || '（空）'), W.pitStaffShort(inp) === want, W.pitStaffShort(inp)));

/* 🔴 お客様としての「小林モータース」は今までどおりフル（短くしない） */
ok('🔴 お客様名には効かない（pitCustSurname はフルのまま）',
   W.pitCustSurname({ customer: '小林モータース株式会社' }) === '小林モータース㈱',
   W.pitCustSurname({ customer: '小林モータース株式会社' }));
ok('よその「◯◯モータース」を巻き込まない', W.pitStaffShort('田中モータース') === '田中モータース㈱' || W.pitStaffShort('田中モータース') === '田中モータース',
   W.pitStaffShort('田中モータース'));

console.log('\n── ② 課が空なら色はグレー ──');
W.PitShare.use({ divisions: () => [{ id:'div1', label:'1課', color:'#1db97a' }, { id:'div2', label:'2課', color:'#ec4899' }] });
ok('1課＝緑',                    W.pitDivisionColorOr({ division:'div1' }) === '#1db97a', W.pitDivisionColorOr({ division:'div1' }));
ok('2課＝ピンク',                W.pitDivisionColorOr({ division:'div2' }) === '#ec4899', W.pitDivisionColorOr({ division:'div2' }));
ok('🔴 課が空＝グレー',          W.pitDivisionColorOr({ division:'' })     === W.PIT_DIV_NONE_COLOR, W.pitDivisionColorOr({ division:'' }));
ok('🔴 輸入の車でも課が空ならグレー（車から色を作らない）',
   W.pitDivisionColorOr({ division:'', boardId:'import' }) === W.PIT_DIV_NONE_COLOR);
ok('表に無い課もグレー（勝手に1課にしない）', W.pitDivisionColorOr({ division:'div9' }) === W.PIT_DIV_NONE_COLOR);
ok('カードが無くてもグレー',     W.pitDivisionColorOr(null) === W.PIT_DIV_NONE_COLOR);

console.log('\n── ③ 時間帯は3段に折る ──');
[
  ['09:00-10:00', ['09:00','〜','10:00']],
  ['9:00〜10:00', ['9:00','〜','10:00']],
  ['13:00 - 14:30', ['13:00','〜','14:30']],
  ['09:00',       ['09:00']],
  ['AM',          ['AM']],
  ['レッカー',    ['レッカー']],
  ['決まり次第',  ['決まり次第']],
  ['',            []]
].forEach(([inp, want]) => ok('「' + inp + '」→ ' + JSON.stringify(want),
   JSON.stringify(W.pitTimeLines(inp)) === JSON.stringify(want), W.pitTimeLines(inp)));
ok('🔴 言葉の中の「〜」で切らない（レッカーが折れない）', W.pitTimeLines('レッカー').length === 1);

/* ══════════════════════════════════════════════════════════════
   Ⅱ 配線（どの画面がどれを通しているか）
   ══════════════════════════════════════════════════════════════ */
console.log('\n── 🔌 狭い枠の5か所が pitStaffShort を通しているか ──');
[
  ['today.js',      '当日ボードの縦書きバッジ'],
  ['reserve.js',    'コンパクトカード・週カード'],
  ['pit-floor.js',  'PIT配置図のカード'],
  ['card-detail.js','予約詳細の日別リスト']
].forEach(([f, label]) => ok(label + ' が pitStaffShort を通している', /pitStaffShort\(/.test(read(f)), f));
ok('reserve.js は2か所とも通している（コンパクト＋週）',
   (read('reserve.js').match(/pitStaffShort\(/g) || []).length >= 2);
/* ⚠ 各画面には「pit-share.js が届かなかった時の保険」として pitSurname が残る。
      見張るのは**先に pitStaffShort を見ているか**（保険が先に来ていないか）。 */
[['today.js','当日ボード'],['reserve.js','カード'],['pit-floor.js','PIT配置図'],['card-detail.js','日別リスト']]
  .forEach(([f,label]) => ok(label + ' は pitStaffShort を先に見ている（pitSurname は保険）',
    /window\.pitStaffShort \? pitStaffShort\(/.test(read(f)), f));

console.log('\n── 🖼 幅のある画面はフルのまま（短くしない）──');
ok('予約詳細カード（card-view.js）は短くしていない', !/pitStaffShort/.test(read('card-view.js')));
ok('ホバー情報カード（card-hover.js）は短くしていない', !/pitStaffShort/.test(read('card-hover.js')));
ok('表紙印刷は今までどおり pitStaffPrintName', /pitStaffPrintName/.test(read('cover-print.js')) && !/pitStaffShort/.test(read('cover-print.js')));

console.log('\n── 🎨 当日ビューの色と時間の配線 ──');
{
  const td = read('today.js');
  ok('🔴 バッジの色は pitDivisionColorOr 1本', /pitDivisionColorOr\(c\)/.test(td));
  ok('🔴 人のバッジを車（国産／輸入）から塗っていない', !/isImp \? '#ec4899' : '#1db97a'/.test(td));
  ok('🔴 色を直に書いた分岐が残っていない', !/tr-front" style="background:' \+ \(isImp/.test(td));
  ok('🔴 時間は pitTimeLines を通している', /pitTimeLines\(time\)/.test(td));
  ok('3段の時は is-range を付ける', /tr-time is-range/.test(td));
  const css = fs.readFileSync('css/views.css', 'utf8');
  ok('3段用のCSSがある（.tr-time.is-range）', /\.tr-time\.is-range\{/.test(css));
  ok('3段は1行ずつ縦に積む', /\.tr-time\.is-range \.tt-l\{ display:block/.test(css));
  /* 🔴 v1.104.0（ゆうた指定）**左詰め**＝1行の時（10:00）と頭がそろう。真ん中寄せにしない */
  ok('🔴 3段は左詰め（1行の時と頭がそろう）', /\.tr-time\.is-range\{[^}]*text-align:left/.test(css));
  ok('真ん中寄せが残っていない', !/\.tr-time\.is-range\{[^}]*text-align:center/.test(css));
  const ix = fs.readFileSync('index.html', 'utf8');
  /* 🔴 CSSを直したら ?v= も必ず上げる。上げないと**ブラウザが古いCSSを使い続ける**
     （2026-08-16 実害：左詰めに直したのに ?v= が 45 のままで、PitFlow だけ真ん中寄せのままだった。
      MHS は index.html にCSSを書いているので、そちらだけ直って見えて原因が分かりにくかった）。 */
  ok('views.css の ?v= が上がっている（46 以降）',
     (((ix.match(/css\/views\.css\?v=(\d+)/) || [])[1] | 0) >= 46));
  ok('pit-share.js の ?v= が上がっている（2 以降）',
     (((ix.match(/js\/pit-share\.js\?v=(\d+)/) || [])[1] | 0) >= 2));
}

/* ══════════════════════════════════════════════════════════════
   Ⅲ 実画面（本物を開いて目で見えるところを確かめる）
   ══════════════════════════════════════════════════════════════ */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.renderToday && window.pitStaffShort', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

const row = card => p.evaluate(c => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const today = ymd(new Date());
  const full = Object.assign({
    id:'cD3', customer:'テスト 太郎', kana:'テスト タロウ', car:'ノート',
    boardId:'default', workType:'general', dropType:'drop', status:'reserved',
    reserveDate:today, reserveTime:'10:00'
  }, c);
  state.cards = [full];
  window._todayOffset = 0;
  showView('today'); renderToday();
  const f = document.querySelector('#view-today-body .tr-front');
  const t = document.querySelector('#view-today-body .tr-time');
  const cs = t ? getComputedStyle(t) : null;
  return {
    front: f ? (f.textContent||'').trim() : '', frontCls: f ? f.className : '',
    frontBg: f ? (f.style.background || f.style.backgroundColor || '') : '',
    timeTxt: t ? (t.textContent||'').trim() : '', timeCls: t ? t.className : '',
    lines: t ? Array.from(t.querySelectorAll('.tt-l')).map(x=>x.textContent) : [],
    timeW: t ? t.scrollWidth : 0, boxW: t ? t.clientWidth : 0,
    timeH: t ? t.scrollHeight : 0, rowH: t ? (t.closest('.today-row')||{}).clientHeight : 0,
    fs: cs ? cs.fontSize : '', align: cs ? cs.textAlign : ''
  };
}, card);

console.log('\n── 🖥 実画面：自社の担当は「コバモ」──');
{
  const r = await row({ frontStaff:'小林モータース', division:'div1' });
  ok('🔴 当日ボードの縦書きが「コバモ」', r.front === 'コバモ', r);
  const r2 = await row({ frontStaff:'小林 勇太', division:'div1' });
  ok('人は今までどおり姓だけ', r2.front === '小林', r2);
}

console.log('\n── 🖥 実画面：課が空なら担当者の帯がグレー ──');
{
  const g = await p.evaluate(() => window.PIT_DIV_NONE_COLOR);
  const r = await row({ frontStaff:'小林 勇太', division:'' });
  ok('🔴 課が空＝グレーの帯', r.frontBg.replace(/\s/g,'').includes('131,144,166') || r.frontBg.includes(g), r.frontBg);
  const r2 = await row({ frontStaff:'小林 勇太', division:'', boardId:'import' });
  ok('🔴 輸入の車でも課が空ならグレー', r2.frontBg.replace(/\s/g,'').includes('131,144,166') || r2.frontBg.includes(g), r2.frontBg);
  const r3 = await row({ frontStaff:'小林 勇太', division:'div1' });
  ok('1課なら今までどおり緑', /29, 185, 122|1db97a/.test(r3.frontBg), r3.frontBg);
  const r4 = await row({ frontStaff:'小林 勇太', division:'div2' });
  ok('2課なら今までどおりピンク', /236, 72, 153|ec4899/.test(r4.frontBg), r4.frontBg);
}

console.log('\n── 🖥 実画面：時間帯が3段になり、はみ出さない ──');
{
  const r = await row({ reserveTime:'09:00-10:00' });
  ok('🔴 3つに分かれている', JSON.stringify(r.lines) === JSON.stringify(['09:00','〜','10:00']), r.lines);
  ok('🔴 is-range が付く', /is-range/.test(r.timeCls), r.timeCls);
  /* 🔴 **本物の画面で**左詰めになっているか（CSSの字面だけ見ていると ?v= の上げ忘れに気づけない） */
  ok('🔴 実画面で左詰めになっている（1行の時と頭がそろう）', r.align === 'left', r.align);
  ok('🔴 横にはみ出していない（右が隠れない）', r.timeW <= r.boxW + 1, { w:r.timeW, box:r.boxW });
  ok('🔴 行の高さからもはみ出していない', r.timeH <= r.rowH, { h:r.timeH, row:r.rowH });
  const r2 = await row({ reserveTime:'10:00' });
  ok('1つの時刻は今までどおり1行・大きいまま', r2.lines.length === 0 && r2.timeTxt === '10:00' && r2.fs === '15px', r2);
  const r3 = await row({ reserveTime:'レッカー' });
  ok('言葉は折らない', r3.timeTxt === 'レッカー' && !/is-range/.test(r3.timeCls), r3);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  for (const v of ['today','reserve','return','board','floor','mydash']){
    await p.evaluate(x => { try { showView(x); } catch(e){} }, v);
    await p.waitForTimeout(180);
  }
  ok('見本データで各ビューを開いてもエラーなし', errs.length === 0, errs.slice(0,3).join(' | '));
}

await p.screenshot({ path:'shot_disp3.png' });
await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
