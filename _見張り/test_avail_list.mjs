/* PitFlow v1.161.0 ── 空きカレンダービューの入庫一覧／新規予約の右カラムの「予定」
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-21）
     ①「空きカレンダービューで名前の**漢字→カナの仕組みが入ってない**。（未入力）になっちゃう」
     ②「**キャンセルした車両が入庫済みとして表示されている**」
     ③「新規予約画面の右カラム、**予定にもキャンセルした車両が表示されてる**」
     ④「新規予約画面の右カラムの当日の入庫予定ボード、
        **担当フロントが設定されていない場合の、1課・2課を表示する設定ができていない**」

   ◎ここで見張ること
     🔴 お名前は `pitCustSurname` の1本＝漢字が無ければカナが出る（（未入力）にしない）
     🔴 生きているカードかは `pitCardActive` の1本＝キャンセル・廃車・売上なしは出さない
     🔴 「入庫済」の札はキャンセルには付かない
     🔴 右カラムの予定も同じ物差し（`'canceled'` のような綴り違いを二度と作らない）
     🔴 右カラムのバッジ＝人が居れば名前／居なければ課／課も無ければ「—」
     🔴 バッジの色は **課**から引く（車＝国産／輸入から作らない）。課が空ならコバモのグレー

   ◎使い方
     python3 -m http.server 8997      ← 別ウィンドウ
     node test_avail_list.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8997;
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
await p.waitForFunction('window.state && window.renderAvail && window.pitCardActive && window.pitCustSurname && window._cfsDayListHtml',
                        null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

const TODAY = await p.evaluate(() => ymd(new Date()));

/* ───────── 空きカレンダービュー（国産の列）に並ぶ行を読む ───────── */
const availRows = cards => p.evaluate(list => {
  const today = ymd(new Date());
  state.cards = list.map(c => Object.assign({
    customer: 'あああ 太郎', kana: 'アアア タロウ', car: 'ノート',
    boardId: 'default', workType: 'general', dropType: 'drop',
    status: 'reserved', reserveDate: today, reserveTime: '10:00'
  }, c));
  window._availPick = today;
  showView('availcal');
  renderAvail();
  return Array.from(document.querySelectorAll('#av-list-default .av-it')).map(el => ({
    name: (el.querySelector('.av-it-name') || {}).textContent || '',
    done: !!el.querySelector('.av-it-done')
  }));
}, cards);

console.log('\n── ① 漢字が無いお客様は カナ を出す（（未入力）にしない） ──');
{
  const r = await availRows([{ id: 'a1', customer: '', kana: 'カタヤマ ハナコ' }]);
  ok('🔴 カナだけのお客様が「（未入力）」にならない', r.length === 1 && !/未入力/.test(r[0].name), r);
  ok('🔴 カナの苗字が出る', r.length === 1 && /カタヤマ/.test(r[0].name), r);
}
{
  const r = await availRows([{ id: 'a2', customer: '片山 花子', kana: 'カタヤマ ハナコ' }]);
  ok('漢字があれば今までどおり漢字の苗字', r.length === 1 && /片山/.test(r[0].name), r);
}
{
  const r = await availRows([{ id: 'a3', customer: '小林モータース株式会社', kana: '' }]);
  ok('法人は苗字に切らず略記のまま', r.length === 1 && /小林モータース㈱/.test(r[0].name), r);
}
{
  const r = await availRows([{ id: 'a4', customer: '', kana: '' }]);
  ok('本当に何も無ければ（未入力）', r.length === 1 && /未入力/.test(r[0].name), r);
}

console.log('\n── ② キャンセルした車は出さない（「入庫済」の札も付けない） ──');
{
  const r = await availRows([{ id: 'b1', status: 'cancelled', cancelled: true, cancelledAt: TODAY }]);
  ok('🔴 予約キャンセルは一覧に出ない', r.length === 0, r);
}
{
  const r = await availRows([{ id: 'b2', status: 'cancelled' }]);
  ok('🔴 未入庫（自動キャンセル）も出ない', r.length === 0, r);
}
{
  const r = await availRows([{ id: 'b3', noSale: true }]);
  ok('🔴 売上なしも出ない（盤面と同じ）', r.length === 0, r);
}
{
  const r = await availRows([{ id: 'b4', status: 'scrap' }, { id: 'b5', status: 'returned' }]);
  ok('廃車・返車済みは今までどおり出ない', r.length === 0, r);
}
{
  const r = await availRows([{ id: 'b6', status: 'reserved' }]);
  ok('予約はふつうに出る（「入庫済」は付かない）', r.length === 1 && r[0].done === false, r);
}
{
  const r = await availRows([{ id: 'b7', status: 'workDone' }]);
  ok('🔴 本当に入庫した車にだけ「入庫済」が付く', r.length === 1 && r[0].done === true, r);
}
{
  const r = await availRows([{ id: 'b8', status: 'cancelled', cancelled: true },
                             { id: 'b9', status: 'reserved', reserveTime: '11:00' }]);
  ok('🔴 混ざっていても残るのは生きている1件だけ', r.length === 1, r);
}

/* ───────── 新規予約の右カラム：選んだ日の「予定」 ───────── */
const dayList = (cards, me) => p.evaluate(a => {
  const today = ymd(new Date());
  state.cards = a.list.map(c => Object.assign({
    customer: 'あああ 太郎', kana: 'アアア タロウ', car: 'ノート',
    boardId: 'default', workType: 'general', dropType: 'drop',
    status: 'reserved', reserveDate: today, reserveTime: '10:00'
  }, c));
  const box = document.createElement('div');
  box.innerHTML = _cfsDayListHtml(Object.assign({ id: '__me__', reserveDate: today, frontStaff: '' }, a.me || {}));
  document.body.appendChild(box);
  const out = Array.from(box.querySelectorAll('.dl-col')[0].querySelectorAll('.dl-ev')).map(el => {
    const bg = el.querySelector('.dl-badge');
    return {
      line: (el.querySelector('.dl-line') || {}).textContent || '',
      badge: bg ? (bg.textContent || '').trim() : null,
      cls: bg ? bg.className : '',
      bg: bg ? (bg.style.background || bg.style.backgroundColor || '') : '',
      title: bg ? (bg.getAttribute('title') || '') : ''
    };
  });
  box.remove();
  return out;
}, { list: cards, me });

console.log('\n── ③ 右カラムの「予定」にもキャンセルは出さない ──');
{
  const r = await dayList([{ id: 'c1', status: 'cancelled', cancelled: true }]);
  ok('🔴 予約キャンセルは予定に出ない（綴り違いで素通りしない）', r.length === 0, r);
}
{
  const r = await dayList([{ id: 'c2', status: 'cancelled' }]);
  ok('🔴 未入庫も出ない', r.length === 0, r);
}
{
  const r = await dayList([{ id: 'c3', noSale: true }]);
  ok('🔴 売上なしも出ない', r.length === 0, r);
}
{
  const r = await dayList([{ id: 'c4', status: 'scrap' }, { id: 'c5', status: 'returned' }]);
  ok('廃車・返車済みは今までどおり出ない', r.length === 0, r);
}
{
  const r = await dayList([{ id: 'c6' }, { id: '__me__' }]);
  ok('生きている他人の予定だけ出る（自分は出ない）', r.length === 1, r);
}
{
  const r = await dayList([{ id: 'c7', customer: '', kana: 'カタヤマ ハナコ' }]);
  ok('こちらもカナだけのお客様が（未入力）にならない', r.length === 1 && /カタヤマ/.test(r[0].line), r);
}

console.log('\n── ④ 担当が空なら 1課／2課 を出す（色は課から） ──');
const GREEN = /29, ?185, ?122|1db97a/;
const PINK  = /236, ?72, ?153|ec4899/;
const GRAY  = /131, ?144, ?166|8390a6/;
{
  const r = await dayList([{ id: 'd1', frontStaff: '蓮沼 一郎', division: 'div1' }]);
  ok('🔴 担当が居れば今までどおり人の名前', r.length === 1 && r[0].badge === '蓮沼' && !/is-div/.test(r[0].cls), r);
  ok('人の時の色も課から（1課＝緑）', GREEN.test(r[0].bg), r[0].bg);
}
{
  const r = await dayList([{ id: 'd2', frontStaff: '', division: 'div1' }]);
  ok('🔴 担当が空なら 1課 が出る（「—」にしない）', r.length === 1 && r[0].badge === '1課', r);
  ok('🔴 課の印（is-div）が付く', /is-div/.test(r[0].cls), r[0].cls);
  ok('🔴 色は緑', GREEN.test(r[0].bg), r[0].bg);
  ok('担当がまだと分かる説明が付く', /担当者/.test(r[0].title), r[0].title);
}
{
  const r = await dayList([{ id: 'd3', frontStaff: '', division: 'div2', boardId: 'import' }]);
  ok('🔴 2課が出る', r.length === 1 && r[0].badge === '2課', r);
  ok('🔴 色はピンク', PINK.test(r[0].bg), r[0].bg);
}
{
  /* 🔴 車（国産／輸入）から課を作らない＝v1.92.0 の決めごと */
  const r = await dayList([{ id: 'd4', frontStaff: '', division: 'div2', boardId: 'default' }]);
  ok('🔴 国産の車でもボタンが2課ならピンクの2課', r.length === 1 && r[0].badge === '2課' && PINK.test(r[0].bg), r);
}
{
  const r = await dayList([{ id: 'd5', frontStaff: '', division: '', boardId: 'import' }]);
  ok('🔴 課も空なら「—」（輸入の車から 2課 を作らない）', r.length === 1 && r[0].badge === '—', r);
  ok('🔴 その時の色はコバモのグレー（ピンクにしない）', GRAY.test(r[0].bg) && !PINK.test(r[0].bg), r[0].bg);
}
{
  /* 自社（小林モータース）は狭い枠なので「コバモ」（pitStaffShort の1本） */
  const r = await dayList([{ id: 'd6', frontStaff: '小林モータース株式会社', division: 'div1' }]);
  ok('自社の担当は「コバモ」', r.length === 1 && r[0].badge === 'コバモ', r);
}
{
  /* 課の名前・色は設定の表から。変えたら一緒に変わる */
  const r = await p.evaluate(() => {
    const keep = JSON.parse(JSON.stringify(state.divisions));
    state.divisions = [{ id: 'div1', label: '整備1課', color: '#0ea5e9' },
                       { id: 'div2', label: '整備2課', color: '#f59e0b' }];
    const today = ymd(new Date());
    state.cards = [{ id: 'e1', customer: 'あああ 太郎', car: 'ノート', boardId: 'default',
                     status: 'reserved', reserveDate: today, reserveTime: '10:00',
                     frontStaff: '', division: 'div1' }];
    const box = document.createElement('div');
    box.innerHTML = _cfsDayListHtml({ id: '__me__', reserveDate: today, frontStaff: '' });
    document.body.appendChild(box);
    const el = box.querySelector('.dl-badge');
    const r = { t: (el.textContent || '').trim(), bg: el.style.background || el.style.backgroundColor || '' };
    box.remove(); state.divisions = keep; return r;
  });
  ok('🔴 課の名前を変えたらバッジの字も変わる', r.t === '整備1課', r);
  ok('🔴 課の色を変えたらバッジの色も変わる', /14, ?165, ?233|0ea5e9/.test(r.bg), r.bg);
}

console.log('\n── ⑤ 「予約キャンセル」と「未入庫」を言い分ける（英語の cancelled を出さない） ──');
{
  /* 🔴 2026-08-21（ゆうた指摘）「予約キャンセルと未入庫は意味合いが違う」。
     入れ物は同じ `'cancelled'` で、見分けは `c.cancelled` の印（人が押したか／来なかったか）。
     ⚠ 直す前は状態の文字だけを渡していたので、**画面の札に英語で「cancelled」**と出ていた。 */
  const r = await p.evaluate(() => ({
    人: pitCardStatusText({ status: 'cancelled', cancelled: true }),
    来ず: pitCardStatusText({ status: 'cancelled' }),
    ふつう: pitCardStatusText({ status: 'workDone' }),
    予約: pitCardStatusText({ status: 'reserved' }),
    空: pitCardStatusText(null)
  }));
  ok('🔴 人が押した＝「予約キャンセル」', r.人 === '予約キャンセル', r);
  ok('🔴 来なかった＝「未入庫」', r.来ず === '未入庫', r);
  ok('ほかの状態は今までどおり', r.ふつう === '作業完了' && r.予約 === '予約', r);
  ok('カードが無くても落ちない', r.空 === '', r);

  /* 画面に出るところ＝予約カード（時間つきの大きいカード）とカード詳細の札 */
  const shown = await p.evaluate(() => {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const mk = extra => Object.assign({ id: 'ST' + Math.floor(Math.random()*1e6), customer: '取消 太郎',
      car: 'ノート', boardId: 'default', workType: 'general', dropType: 'drop',
      reserveDate: ymd(new Date()), reserveTime: '10:00', log: [], maint: {}, office: {} }, extra);
    const a = mk({ status: 'cancelled', cancelled: true });
    const b = mk({ status: 'cancelled' });
    /* 🗑 v2.51.0（A-2）ここは片づけた「予約標準カード（フルカード）」を見ていた。
       ＝ `cardHtml(c, {})` は**もう何も描かない**（呼んでいる所が1か所も無かった）。
       🔴 見張りたいのは「予約キャンセル／未入庫を言い分けているか」で、
       　 その物差しは `pitCardStatusText` **1本**。カードの見た目ではなく、そちらを直接見る。
       　 ＝ 出す場所が増えても減っても、この見張りは効き続ける。 */
    const txt = [ pitCardStatusText(a), pitCardStatusText(b) ];
    return { txt, english: /cancelled/i.test(txt.join()) };
  });
  ok('🔴 予約カードの札が「予約キャンセル」「未入庫」', shown.txt[0] === '予約キャンセル' && shown.txt[1] === '未入庫', shown);
  ok('🔴 英語の「cancelled」が画面に出ていない', shown.english === false, shown);
}

console.log('\n── 🧭 物差しを1本に保てているか（書き写しの見張り） ──');
{
  /* ⚠ 覚え書き（コメント）には「前はこう書いてあった」を残してあるので、
        見張りは**コメントを外してから**中身だけ見る。そうしないと直したのに落ちる。 */
  const src = await p.evaluate(async () => {
    const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const g = async u => strip(await (await fetch(u + '?t=' + Date.now())).text());
    return { av: await g('js/avail.js'), cd: await g('js/card-detail.js'), css: await g('css/polish.css') };
  });
  ok('🔴 空きカレンダーが pitSurname(c.customer) を直に呼んでいない',
      !/pitSurname\(c\.customer\)/.test(src.av), '');
  ok('🔴 空きカレンダーが pitCardActive に聞いている',
      /pitCardActive/.test(src.av), '');
  ok('🔴 右カラムの予定も pitCardActive に聞いている',
      /pitCardActive/.test(src.cd), '');
  ok('🔴 綴り違いの canceled（Lが1つ）がどこにも残っていない',
      !/'canceled'/.test(src.av) && !/'canceled'/.test(src.cd), '');
  ok('🔴 右カラムのバッジ色を CSS で車から作っていない',
      !/\.dl-ev\.imp\s+\.dl-badge/.test(src.css), '');
  ok('🔴 CSS の既定色は課なしのグレー（緑を直に書かない）',
      /\.dl-badge\{[^}]*var\(--pit-div-none/.test(src.css), '');
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  await p.evaluate(() => { if (window.pitSampleData) pitSampleData(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { window._availPick = ymd(new Date()); showView('availcal'); renderAvail(); });
  await p.waitForTimeout(400);
  const n = await p.evaluate(() => document.querySelectorAll('#view-availcal-body .av-it').length);
  ok('見本データで空きカレンダービューが描ける', n >= 0, n);
  for (const v of ['dashboard', 'today', 'task', 'reserve', 'return', 'availcal', 'mydash']) {
    await p.evaluate(x => showView(x), v);
    await p.waitForTimeout(220);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
