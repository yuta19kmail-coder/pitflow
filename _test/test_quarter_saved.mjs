/* PitFlow v2.7.0 ── 残した結果も「走らせた直後と同じカード」で出す
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-24）
     「PDFチェックの保存が古いままなのかな？ 一回閉じると 前の表示スタイルにもどっちゃう」
   ◎なにが起きていたか
     走らせた直後は `card()`（v2.1.0 のカード）で出るのに、
     閉じて開き直したあとの「残してある結果」は `savedTable()`（昔の素の表）で出ていた。
     ＝**同じ画面が2つの顔を持っていた。**
   ◎この試験がやること
     🔴 ① 残した結果（新しい形＝_v>=2）が **カード**で出ること（表ではない）
     🔴 ② 中身がちゃんと出ること（お客様・ナンバー・車種・車体番号・両方の金額・担当）
     🔴 ③ **直すボタンは出さない**こと（残した結果からは直せない＝押せて効かないボタンを作らない）
           代わりに「カードを開く」が出ること
     🔴 ④ 古い形（_v が無い）で残した結果は、**今までの表のまま**出ること（黙って空にしない）
     🔴 ⑤ 「整備ソフトだけ」「PitFlowだけ」も片側カードで出ること
     🔴 ⑥ 残す時の項目（quarter-store.js の slim*）と、戻す時（quarter.js の saved*）が食い違っていないこと
   ◎使い方
     node /tmp/srv.js（別ウィンドウ・8991番）
     node test_quarter_saved.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ================= ① コードを機械で読む ================= */
console.log('\n── 🔍 残す側と戻す側が食い違っていないか ──');
{
  const dir = path.join(process.cwd(), 'js');
  const store = fs.readFileSync(path.join(dir, 'quarter-store.js'), 'utf8');
  const view  = fs.readFileSync(path.join(dir, 'quarter.js'), 'utf8');
  /* 🧾 v2.9.8 版の印は 2 と 3 の2段になった。
       2 … 直す行の写しだけ（この試験が見ている道）
       3 … **伝票の行そのもの**を持っている＝開き直したら、もう一度突き合わせる
     ⚠ この試験は「写しの道」の見張り。3 の道は test_quarter_replay.mjs が見ている。 */
  ok('残す側に版の印（_v）がある', /_v:\s*\(?伝票OK\s*\?\s*3\s*:\s*2\)?|_v:\s*[23]/.test(store));
  ok('画面側が版の印を見ている', /\+R\._v\s*>=\s*2|R\._v/.test(view));
  ok('🧾 v2.9.8 伝票の行を持つ道（_v:3）もある', /_v:\s*\(伝票OK/.test(store));

  /* slimPair が書くキー ⊇ savedPair が読むキー、を機械で見る */
  const block = (src, name) => {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (!d) return src.slice(j, k + 1); }
    }
    return '';
  };
  const pairs = [['slimPair', 'savedPair'], ['slimSoftOnly', 'savedSoftOnly'], ['slimPitOnly', 'savedPitOnly']];
  for (const [w, r] of pairs) {
    const wrote = new Set((block(store, w).match(/([^\s{,]+)\s*:/g) || []).map(x => x.replace(/\s*:$/, '')));
    /* ⚠ 「ナンバー」「カード…」の長音符（ー）を字の仲間に入れておくこと。入れないと途中で切れる */
    const read  = new Set((block(view, r).match(/r\.([A-Za-z_0-9ぁ-んァ-ヶー々一-龠]+)/g) || []).map(x => x.slice(2)));
    const miss = [...read].filter(k => !wrote.has(k));
    ok('🔴 ' + r + ' が読む項目は、すべて ' + w + ' が残している', miss.length === 0, miss);
  }
}

/* ================= ② 実際に描かせる ================= */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 200)); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitQuarterHtml', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* 残した結果を1つ作って画面に置く（クラウドは使わない＝画面の描き方だけを見る） */
const mkSaved = (v) => ({
  _v: v,
  期間: { from: '2026-08-01', to: '2026-08-07' },
  走らせた日時: '2026-08-08T09:30:00.000Z', 走らせた人: 'ゆうた', PDF: '売上チェックリスト.pdf',
  整備ソフト: { 枚数: 12, 金額: 1200000 }, PitFlow: { 台数: 11, 金額: 1150000 },
  差: { 台数: -1, 金額: -50000 },
  内訳: { 整備ソフトだけ: { 台数: 1, 金額: 50000 }, PitFlowだけ: { 台数: 0, 金額: 0 },
          期間の外: { 台数: 0, 金額: 0 }, 金額ちがい: { 台数: 1, 金額: 0 } },
  検算: { 合う: true }, まとめ返車: [],
  直すもの: {
    期間の外: [], 月またぎ: [], Qまたぎ: [], 売上日ちがい: [], 担当ちがい: [],
    金額ちがい: [{
      ナンバー: '習志野 500 あ 12-34', お客様: '井上 健', 伝票: 'D-1001', 売上日: '2026-08-03',
      数える日: '2026-08-03', 予約番号: 'R-2401', カード売上日: '2026-08-03', 売上日ちがい: false,
      カードid: 'card-1', 日付: '同じQ内', 日付の種類: 'sameQ',
      整備ソフト: 120000, PitFlow: 100000, 差: 20000, 結び方: 'ナンバー',
      受付担当: '蓮沼', フロント: '椎名',
      車種: 'ノア', カード車種: 'ノア', 車体番号: 'ZRR80-1234567', カード車体番号: 'ZRR80-1234567',
      同一性: 'vinOK', 同じ車: true, 期間の外: false,
      売上日差kind: 'same', 売上日差label: '売上日は同じ',
      金額一致: false, 担当一致: false
    }],
    整備ソフトだけ: [{
      売上日: '2026-08-05', 伝票: 'D-1009', ナンバー: '習志野 500 あ 55-55', お客様: '大野 里美',
      金額: 50000, 受付担当: '林', カード: '作業は終わっている', カードid: 'card-9',
      車種: 'フィット', 車体番号: 'GK3-7654321',
      カード状態: 'workDone', カード返車日: '', カード予約番号: 'R-2409'
    }],
    PitFlowだけ: [{
      数える日: '2026-08-06', 予約番号: 'R-2411', ナンバー: '習志野 300 か 77-77', お客様: '木村 亮',
      金額: 88000, フロント: '蓮沼', カードid: 'card-11', 車種: 'ハスラー', 車体番号: 'MR52-9999999'
    }]
  }
});

/* 🗂 v2.8.6 残した結果も**走らせた直後と同じ4つの箱**（データ／金額／日付／OK）で出す。
   ＝ 選ぶのは `tab`（4つ）。`savedTab`（昔の8つ）は **`_v` が無い古い保存の道でだけ**使う。 */
const render = async (saved, tab, oldTab) => p.evaluate(([sv, tb, ot]) => {
  const U = (window._insp = window._insp || {});
  U.q = U.q || {};
  Object.assign(U.q, { res: null, pdf: null, saved: sv, savedId: 'qrun',
                       tab: tb, savedTab: ot || '金額ちがい', list: [], groups: [] });
  return window.pitQuarterHtml();
}, [saved, tab, oldTab]);

console.log('\n── 🃏 新しい形（_v:2）＝カードで出る ──');
{
  const h = await render(mkSaved(2), 'money');
  ok('🔴 カードで出る（q-c）', /class="q-c[ "]/.test(h));
  ok('🔴 昔の表（q-t）では出ない', !/class="q-t"/.test(h));
  ok('お客様の名前が出る', h.includes('井上 健'), h.slice(0, 0));
  ok('ナンバーが出る', h.includes('習志野 500 あ 12-34'));
  ok('車種が出る', h.includes('ノア'));
  ok('車体番号が出る', h.includes('ZRR80-1234567'));
  ok('フロントマン側の金額が出る', h.includes('120,000'));
  ok('PitFlow 側の金額が出る', h.includes('100,000'));
  ok('担当が両方出る', h.includes('蓮沼') && h.includes('椎名'));
  ok('金額のちがいが出る', h.includes('+20,000') || h.includes('20,000'));
  ok('🔴 直すボタンは出さない', !/pitQDo\(|pitQMk\(/.test(h));
  ok('🔴 代わりに「カードを開く」が出る', h.includes('カードを開く') && h.includes('card-1'));
  ok('直せない理由が1行出る', h.includes('もう一度PDFを読ませて'));
}

console.log('\n── 🚗 片側だけの1件もカードで出る ──');
{
  const hs = await render(mkSaved(2), 'data');
  ok('整備ソフトだけ＝カードで出る', /class="q-c[ "]/.test(hs) && !/class="q-t"/.test(hs));
  ok('　中身が出る（お客様・車種）', hs.includes('大野 里美') && hs.includes('フィット'));
  ok('　カードは有るので黄色あつかい', /gone-y/.test(hs), hs.match(/gone-?y?/g));

  const hp = await render(mkSaved(2), 'data');
  ok('PitFlowだけ＝カードで出る', /class="q-c[ "]/.test(hp) && !/class="q-t"/.test(hp));
  ok('　中身が出る（お客様・車種）', hp.includes('木村 亮') && hp.includes('ハスラー'));
  ok('　赤あつかい（伝票が無い）', /gone/.test(hp));
}

console.log('\n── 🗄 古い形（_v なし）＝今までの表のまま ──');
{
  const old = mkSaved(2); delete old._v;
  const h = await render(old, 'money', '金額ちがい');
  ok('🔴 古い保存は表で出る（消さない）', /class="q-t"/.test(h));
  ok('🔴 なぜ表なのかを1行で言う', h.includes('古い形で残した結果'));
  ok('中身は読める', h.includes('井上 健'));
}

console.log('\n── 🧭 まわり ──');
{
  const h = await render(mkSaved(2), 'ok');
  ok('🔴 OKは「合っていた行は残していません」と言う（0件ですと嘘をつかない）',
     h.includes('残していません') && !h.includes('0件です'), h.slice(0, 0));
  /* 🗂 v2.8.6 顔がひとつになったこと＝4つの箱で出て、昔の8つのタブは出ない */
  ok('🔴 走らせた直後と同じ4つの箱で出る',
     h.includes('データがちがう') && h.includes('金額がちがう') && h.includes('日付がちがう'));
  ok('🔴 昔の8つのタブは出さない', !/pitQSavedTab\('期間の外'\)/.test(h));
  /* 🧹 v2.8.7 ゆうた「この辺りの表示が出るとややこしいから出さないで」「0件をシンプルに目指すように」 */
  ok('🔴 内訳は畳んである（押した時だけ開く）', /<details class="q-more"><summary>差額の内訳を見る<\/summary>/.test(h));
  ok('🔴 内訳より先に「差額の内訳を見る」が来る（本文にいきなり出さない）',
     h.indexOf('PitFlow に実績が無い') > h.indexOf('差額の内訳を見る'));
  ok('🔴 まとめ返車も畳みの中',
     !/まとめて返車済みにした日/.test(h.slice(0, h.indexOf('差額の内訳を見る'))));
  ok('大きく出るのは「まだ合っていない N件」', /まだ合っていない<\/span><b>\d+<\/b>件/.test(h),
     (h.match(/まだ合っていない<\/span><b>\d+<\/b>件/) || [])[0]);
  ok('🔴 昔の長い検算文は出さない', !h.includes('差額の内訳が、実際の差とぴったり合っていました'));
  ok('残してある結果の帯が出る', h.includes('残してある結果'));
  ok('走らせた日時・PDF名が出る', h.includes('売上チェックリスト.pdf'));
  await p.evaluate(() => { try { showView('inspect'); } catch (e) {} });
  await p.waitForTimeout(500);
  ok('エラーなし', errs.length === 0, errs.slice(0, 4));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v2.7.0 以降', vn[0] > 2 || (vn[0] === 2 && vn[1] >= 7), ver);
}

console.log('\n── 🎉 0件＝オールグリーン ──');
{
  /* 直すものが1件も無い保存＝残り0。ゆうた「とにかくオールグリーン」 */
  const z = mkSaved(2);
  z.直すもの = { 期間の外:[], 月またぎ:[], Qまたぎ:[], 売上日ちがい:[], 担当ちがい:[], 金額ちがい:[],
                 整備ソフトだけ:[], PitFlowだけ:[] };
  z.OK台数 = 67;
  const h = await render(z, 'ok');
  ok('🔴 オールグリーンと言う', h.includes('オールグリーン'), (h.match(/q-chk[^>]*>[^<]{0,50}/) || [])[0]);
  ok('　残りが0件と出る', /まだ合っていない<\/span><b>0<\/b>件/.test(h),
     (h.match(/まだ合っていない<\/span><b>\d+<\/b>件/) || [])[0]);
  ok('　0件は緑にする', /q-card q-diff zero/.test(h));
  ok('　内訳はやはり畳んだまま', /<details class="q-more">/.test(h));
  ok('　OKの件数は残してある数から出る', h.includes('67件'), (h.match(/合っていた <b>\d+件<\/b>/) || [])[0]);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail === 0 ? 0 : 1);
