/* PitFlow v1.122.0 ── 受注（連絡中 → パーツ待ち）の窓で洗車を先に決める
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-18）
     「タスクボード内、**連絡中→パーツ待ちへの移動時のポップアップ**で
       **車販部門への依頼の上に**、車販への依頼と同じ感じで**もうひと枠**作成し
       中に **洗車 要 不要 1行メモ** を入れる。
       フォロー文として『既に決まっていれば入力してください。洗車依頼枠に表示されます。
       後から変更もできます。』も伝える。
       スイッチでの挙動はあくまで**カード詳細のスイッチ操作で**、完TEL依頼でも同様に、
       **同じスイッチでいずれからでも同じスイッチをいじる**イメージ」
     「これは**お知らせにも**入れてほしい。早い段階で洗車を確定させて、車販のスケジュールを楽にするイメージ」

   ◎決めごと
     🔴 中身は `needWash` / `washNote` ＝**カード詳細・完TELの窓とまったく同じ入れ物**
     🔴 **押されていなければ書き換えない**（既定で「不要」を光らせない）
        ＝まだ決まっていない車を勝手に「洗車しない」で確定させないため
     🔴 すでに決まっている車は、その状態を光らせて開く（入れ直させない）
     🔴 置き場所は**車販部門への依頼の上**

   ◎使い方
     python3 -m http.server 8981      ← 別ウィンドウ
     node test_order_wash.mjs                                          */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8981;
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
await p.waitForFunction('window.state && window.PitPhasePopup', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(900);

/* 連絡中の車を1台置いて、パーツ待ちへの移動を横取りさせる（＝受注の窓が開く） */
const open = async (over) => p.evaluate(async (over) => {
  window.__committed = false;
  state.cards = [Object.assign({
    id:'W1', boardId:'default', status:'contact', workTypes:['shaken'],
    customer:'洗車', car:'テスト車', plate:'',
    coverCall:{done:false,at:'',staff:''}, inspSchedule:{mode:'manual',slots:{},history:[]}
  }, over || {})];
  showView('course1');
  await new Promise(r => setTimeout(r, 300));
  const c = state.cards[0];
  PitPhasePopup.maybeIntercept(c, 'contact', 'parts', function(){ window.__committed = true; });
  await new Promise(r => setTimeout(r, 400));
}, over);

/* ===== ① 枠があるか・車販依頼の「上」か ===== */
await open();
const box = await p.evaluate(() => {
  const body = document.querySelector('#pp-backdrop .modal-body');
  const kids = Array.from(body.children).map(e => e.id);
  const wf = document.getElementById('pp-wash-field');
  return {
    ある: !!wf && wf.style.display !== 'none',
    見出し: wf ? (wf.querySelector('.pp-saleshd')||{}).textContent.trim() : '',
    要不要: wf ? Array.from(wf.querySelectorAll('.rp-chip')).map(e => e.textContent) : null,
    メモ: !!document.getElementById('pp-washnote'),
    メモの吹き出し: (document.getElementById('pp-washnote')||{}).placeholder || '',
    フォロー文: wf ? (wf.querySelector('.pp-washhint')||{}).textContent.trim() : '',
    洗車の位置: kids.indexOf('pp-wash-field'),
    車販の位置: kids.indexOf('pp-sales-field'),
    車販も出ている: (document.getElementById('pp-sales-field')||{}).style.display !== 'none',
    箱の見た目が同じ: wf ? wf.classList.contains('pp-sales') : false
  };
});
console.log('\n■ 枠ができているか');
ok('洗車の枠が出る',                              box.ある, box);
ok('見出しが「洗車」',                            box.見出し === '洗車', box.見出し);
ok('「要」「不要」の2つがある',                   JSON.stringify(box.要不要) === JSON.stringify(['要','不要']), box.要不要);
ok('1行メモがある',                               box.メモ && /1行/.test(box.メモの吹き出し), box.メモの吹き出し);
ok('🔴 車販部門への依頼の「上」にある',            box.洗車の位置 >= 0 && box.洗車の位置 < box.車販の位置, box);
ok('車販部門への依頼も今までどおり出る',          box.車販も出ている, box);
ok('箱の見た目が車販依頼と同じ',                  box.箱の見た目が同じ, box);
ok('🔴 フォロー文がそのまま出ている',
   box.フォロー文 === '既に決まっていれば入力してください。洗車依頼枠に表示されます。後から変更もできます。', box.フォロー文);

/* ===== ② まだ決まっていない車＝どちらも光らない ===== */
const none = await p.evaluate(() => ({
  要: document.getElementById('pp-wash-1').classList.contains('on'),
  不要: document.getElementById('pp-wash-0').classList.contains('on')
}));
console.log('\n■ まだ決まっていない車');
ok('🔴 どちらのボタンも光らない',                 !none.要 && !none.不要, none);

/* ===== ③ 押さずに進めたら、洗車は書き換えない ===== */
const untouched = await p.evaluate(async () => {
  PitPhasePopup.close(true);
  await new Promise(r => setTimeout(r, 300));
  const c = state.cards[0];
  return { needWash: c.needWash, washNote: c.washNote, 進んだ: window.__committed };
});
ok('🔴 押さなければ洗車は書き換わらない',          untouched.needWash === undefined, untouched);
ok('移動そのものは今までどおり進む',              untouched.進んだ === true, untouched);

/* ===== ④ 「要」を押して備考を入れると保存される ===== */
await open();
const saved = await p.evaluate(async () => {
  PitPhasePopup.onWash('1');
  document.getElementById('pp-washnote').value = '内装も軽く';
  const on = { 要: document.getElementById('pp-wash-1').classList.contains('on'),
               不要: document.getElementById('pp-wash-0').classList.contains('on') };
  PitPhasePopup.close(true);
  await new Promise(r => setTimeout(r, 300));
  const c = state.cards[0];
  return { on, needWash: c.needWash, washNote: c.washNote };
});
console.log('\n■ 押して保存する');
ok('押したボタンだけ光る',                        saved.on.要 && !saved.on.不要, saved.on);
ok('洗車「要」が保存される',                      saved.needWash === true, saved);
ok('備考が保存される',                            saved.washNote === '内装も軽く', saved);

/* ===== ⑤ 「不要」も選べる ===== */
await open();
const no = await p.evaluate(async () => {
  PitPhasePopup.onWash('0');
  PitPhasePopup.close(true);
  await new Promise(r => setTimeout(r, 300));
  return state.cards[0].needWash;
});
ok('洗車「不要」も選べる',                        no === false, no);

/* ===== ⑥ すでに決まっている車は、その状態で開く（入れ直させない） ===== */
await open({ needWash: true, washNote: 'ホイールも' });
const pre = await p.evaluate(() => ({
  要: document.getElementById('pp-wash-1').classList.contains('on'),
  不要: document.getElementById('pp-wash-0').classList.contains('on'),
  メモ: document.getElementById('pp-washnote').value
}));
console.log('\n■ すでに決まっている車');
ok('「要」が光った状態で開く',                    pre.要 && !pre.不要, pre);
ok('備考も入った状態で開く',                      pre.メモ === 'ホイールも', pre);
await p.evaluate(() => PitPhasePopup.close(false));

/* 完TELを通った車（returnStage あり）は「不要」も決まっている扱い */
await open({ returnStage: 'returnWait', needWash: false });
const pre2 = await p.evaluate(() => ({
  要: document.getElementById('pp-wash-1').classList.contains('on'),
  不要: document.getElementById('pp-wash-0').classList.contains('on')
}));
ok('完TELを通った車は「不要」も光った状態で開く',  !pre2.要 && pre2.不要, pre2);
await p.evaluate(() => PitPhasePopup.close(false));

/* ===== ⑦ カード詳細・完TELの窓と「同じ1つのスイッチ」 ===== */
const same = await p.evaluate(async () => {
  state.cards = [{ id:'W2', boardId:'default', status:'contact', workTypes:['shaken'],
    customer:'同じ', car:'テスト車', plate:'', needWash:false, washNote:'',
    coverCall:{done:false,at:'',staff:''}, inspSchedule:{mode:'manual',slots:{},history:[]} }];
  showView('today');
  openDetail('W2');
  await new Promise(r => setTimeout(r, 500));
  /* カード詳細の洗車のスイッチ（「要」のチップ）を実際に押す */
  const row = Array.from(document.querySelectorAll('.cv-pickrow'))
    .find(r => (r.querySelector('.cv-pk')||{}).textContent === '洗車');
  Array.from(row.querySelectorAll('.cv-chip')).find(e => e.textContent === '要').click();
  await new Promise(r => setTimeout(r, 200));
  const 詳細で要 = state.cards[0].needWash;
  closeDetail();
  await new Promise(r => setTimeout(r, 300));
  /* その状態で受注の窓を開くと「要」が光っている＝同じスイッチ */
  PitPhasePopup.maybeIntercept(state.cards[0], 'contact', 'parts', function(){});
  await new Promise(r => setTimeout(r, 400));
  const 窓で要 = document.getElementById('pp-wash-1').classList.contains('on');
  /* 窓で「不要」に変えると、カードも不要になる */
  PitPhasePopup.onWash('0');
  PitPhasePopup.close(true);
  await new Promise(r => setTimeout(r, 300));
  return { 詳細で要, 窓で要, 窓で不要にしたあと: state.cards[0].needWash };
});
console.log('\n■ どこから触っても同じ1つのスイッチ');
ok('カード詳細で「要」にできる',                  same.詳細で要 === true, same);
ok('🔴 その状態が受注の窓にそのまま出る',          same.窓で要 === true, same);
ok('🔴 窓で変えるとカードのほうも変わる',          same.窓で不要にしたあと === false, same);

/* ===== ⑧ お知らせに入っているか ===== */
const news = await p.evaluate(() => {
  const n = (window.PIT_NEWS || [])[0] || {};
  return { id: n.id, version: n.version, date: n.date, title: n.title || '',
           body: (n.body || '').replace(/\s+/g, ' '), 件数: (window.PIT_NEWS||[]).length };
});
console.log('\n■ お知らせ');
ok('お知らせのいちばん上に足してある',            news.id === 'n-20260818-washorder', news.id);
ok('版と日付が入っている',                        news.version === '1.122.0' && news.date === '2026-08-18', news);
ok('題に洗車と受注のことが書いてある',            /洗車/.test(news.title) && /パーツ待ち/.test(news.title), news.title);
ok('🔴 ねらい（車販のスケジュールを楽に）が書いてある', /車販の(スケジュール|段取り)/.test(news.body), news.body.slice(0,120));
ok('押さなければ変わらないことが書いてある',      /押さなければ/.test(news.body), news.body.slice(0,200));
ok('同じスイッチであることが書いてある',          /同じ1つのスイッチ/.test(news.body), news.body.slice(0,200));

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
