/* PitFlow v1.93.0 ── 予約詳細の代車は「入庫済み」から数える
   -------------------------------------------------------------------
   ◎ゆうた指摘（2026-08-13）
     「予約詳細で代車が **貸し出し開始したカウント** になってる。
       これは **入庫済みになってからカウント** するようにしてほしい」

   ◎正体
     予約詳細の代車メーターは、**カードが予約のままでも**
     「今日 − 返却予定日」を引き算していた。
     だからカレンダー上で貸出期間に入った時点から「あと◯日」が減りはじめ、
     過ぎると **赤く「超過◯日」**。
     ＝**お客様はまだ来ていないのに、代車が返ってきていないように見える。**

   ◎ここで見張ること
     🔴 予約（入庫前）＝「入庫待ち」。日数を数えない・警告色にしない
     🔴 入庫済み（予約でなくなったら）＝今までどおり「あと◯日／超過◯日」
     🔴 返却済みは、予約のままでも「返却済」と言い切る（先に代車だけ戻った時）
     🔴 代車なしのカードは今までどおり何も変わらない

   ◎使い方
     python3 -m http.server 8989      ← 別ウィンドウ
     node test_loaner_wait.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8989;
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
await p.waitForFunction('window.state && window.renderCardView', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 予約詳細を開いて、代車ブロックだけ読む */
const openAndRead = card => p.evaluate(c => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const at = n => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
  const full = Object.assign({
    id: 'cLW', customer: 'テスト 太郎', kana: 'テスト タロウ', tel: '090-0000-0000',
    boardId: 'default', division: 'div1', workType: 'general', dropType: 'drop', repeat: 'new',
    needLoaner: true, loanerId: (state.loaners && state.loaners[0] ? state.loaners[0].id : 'L1')
  }, c);
  /* 日付は「今日からのずれ」で指定する（試験がいつ走っても同じ結果になるように） */
  ['reserveDate', 'loanerFrom', 'loanerTo', 'returnDate'].forEach(k => {
    if (typeof full[k] === 'number') full[k] = at(full[k]);
  });
  state.cards = [full];
  state.loanerAssigns = [];
  const host = document.getElementById('md-body-modal') || (function () {
    const d = document.createElement('div'); d.id = 'md-body-modal'; document.body.appendChild(d); return d;
  })();
  renderCardView(full, 'md-body-modal');
  const box = host.querySelector('.cv-lo');
  if (!box) return { none: true };
  return {
    cls:  box.className,
    lead: (box.querySelector('.cv-lorem')  || {}).textContent || '',
    days: (box.querySelector('.cv-lodays') || {}).textContent || '',
    due:  (box.querySelector('.cv-lodue')  || {}).textContent || '',
    meter: ((box.querySelector('.cv-lometer i') || {}).style || {}).width || ''
  };
}, card);

console.log('\n── 🔵 まだ入庫していない予約（＝今回の直し） ──');
{
  /* 貸出期間にもう入っているのに、まだ来ていない予約 */
  const r = await openAndRead({ status: 'reserved', reserveDate: -3, loanerFrom: -3, loanerTo: 1 });
  ok('🔴 日数を数えない（「入庫待ち」と出る）', r.days.trim() === '入庫待ち', r);
  ok('🔴 「超過」「あと◯日」を出さない', !/超過|あと/.test(r.days), r.days);
  ok('🔴 警告の色にしない（赤・橙・緑にならない）',
     /cv-lev-none/.test(r.cls) && !/cv-lev-(red|dead|amber|green)/.test(r.cls), r.cls);
  ok('見出しが「代車 貸出予定」', r.lead.trim() === '代車 貸出予定', r.lead);
  ok('いつからいつまで貸す予定かが出る', /の予定/.test(r.due), r.due);
  ok('メーターは伸ばさない', r.meter === '0%', r.meter);
}
{
  /* 返却予定日をとっくに過ぎた予約＝直す前はここが真っ赤に「超過」だった */
  const r = await openAndRead({ status: 'reserved', reserveDate: -10, loanerFrom: -10, loanerTo: -4 });
  ok('🔴 返却予定を過ぎていても、入庫前なら赤くしない',
     r.days.trim() === '入庫待ち' && !/cv-lev-(red|dead)/.test(r.cls), r);
}
{
  /* これから貸す予約（まだ期間にも入っていない） */
  const r = await openAndRead({ status: 'reserved', reserveDate: 5, loanerFrom: 5, loanerTo: 8 });
  ok('先の予約も「入庫待ち」', r.days.trim() === '入庫待ち', r);
}

console.log('\n── 🟢 入庫済み＝今までどおり数える ──');
{
  const r = await openAndRead({ status: 'work', reserveDate: -1, loanerFrom: -1, loanerTo: 3 });
  ok('🔴 入庫したら「あと◯日」に変わる', /^あと\d+日$/.test(r.days.trim()), r);
  ok('見出しが「代車 返却まで」に戻る', r.lead.trim() === '代車 返却まで', r.lead);
  ok('メーターが伸びる', r.meter !== '0%' && r.meter !== '', r.meter);
}
{
  const r = await openAndRead({ status: 'work', reserveDate: -8, loanerFrom: -8, loanerTo: -2 });
  ok('🔴 入庫済みで返却予定を過ぎていたら、今までどおり赤く「超過」',
     /超過\d+日/.test(r.days) && /cv-lev-(red|dead)/.test(r.cls), r);
}
{
  const r = await openAndRead({ status: 'check', reserveDate: -1, loanerFrom: -1, loanerTo: 2 });
  ok('点検待ちでも数える（予約でなくなったら数えはじめる）', /^あと\d+日$/.test(r.days.trim()), r);
}

console.log('\n── ⚪ そのほか ──');
{
  /* 予約のまま代車だけ先に返してもらった時 */
  const r = await p.evaluate(() => {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const at = n => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
    const c = {
      id: 'cLW2', customer: 'テスト 花子', kana: 'テスト ハナコ', boardId: 'default',
      workType: 'general', dropType: 'drop', status: 'reserved',
      reserveDate: at(-3), needLoaner: true,
      loanerId: (state.loaners && state.loaners[0] ? state.loaners[0].id : 'L1'),
      loanerFrom: at(-3), loanerTo: at(1)
    };
    state.cards = [c];
    /* 代車カレンダー側で「返却確定」＝返ってきた印 */
    /* ⚠ 返ってきた印は loaner-free.js の backOf が見る `returned` フラグ（returnedAt は日付だけ） */
    state.loanerAssigns = [{ cardId: c.id, loanerId: c.loanerId, fromDate: c.loanerFrom, toDate: at(-1),
                             returned: true, returnedAt: at(-1) }];
    renderCardView(c, 'md-body-modal');
    const box = document.getElementById('md-body-modal').querySelector('.cv-lo');
    return box ? { days: (box.querySelector('.cv-lodays') || {}).textContent || '', cls: box.className } : { none: true };
  });
  ok('予約のままでも、代車が戻っていれば「返却済」', /返却済/.test(r.days || ''), r);

  const none = await openAndRead({ status: 'reserved', reserveDate: 1, needLoaner: false });
  ok('代車なしのカードは今までどおり（代車の枠を出さない）', none.none === true, none);
}

console.log('\n── 🧭 まわりが壊れていないか ──');
{
  const src = fs.readFileSync('js/card-view.js', 'utf8');
  ok("🔴 数えはじめの印が「予約でなくなった時」になっている",
     /const waiting = !back && \(c\.status === 'reserved'\);/.test(src), '');
  const css = fs.readFileSync('css/card-view.css', 'utf8');
  ok('入庫待ちの見た目（cv-lev-none）が用意してある', /\.cv-lo\.cv-lev-none\{/.test(css), '');
  ok('赤いエラーが出ていない', errs.length === 0, errs.slice(0, 5));
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
