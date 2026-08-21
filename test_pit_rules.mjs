/* PitFlow v1.162.0 ── 🔴 **横断の見張り**（全ファイルを機械が読む・ブラウザは使わない）
   ===================================================================
   ◎なぜ作ったか（2026-08-21・ゆうた指摘）
     🗣「**物差しに寄せた**のではなく**共通にする**ことはできないの？
        わからんけど今後もアップデート入るたびに恐らく同じような問題に直面するよね」

     そのとおりだった。**その画面を手で直しただけ**では、次に誰かが新しい画面を作った時に
     また同じ書き方ができてしまう。実際 v1.161.0 の直しのあと機械で全部を読んだら、
     **同じ「カナのお客様が消える」書き方が、報告に出ていない5か所に残っていた**
     （右クリックメニュー／実績の月カード／工程の窓／完TELの窓／長期預かりアラート）。

   ◎この見張りの役目
     🔴 **人の目でなく、機械が全ファイルを読んで、危ない書き方を見つけたら落とす。**
        ＝ 次のアップデートで誰かが同じ書き方をした**その場で**赤くなる。
        ゆうたのところに同じ報告が届く前に止めるのが目的。

   ◎3つの規則
     ① 状態の名前（'cancelled' など）を自分で綴らない  … **例外ゼロ**
     ② お客様名を自分で組み立てない（漢字だけ見ない）  … **例外ゼロ**（カード以外は下の表で許す）
     ③ 色（国産の緑・輸入のピンク）と「1課／2課」の直書き … **棚卸し方式＝いまの数を超えたら落ちる**
     ④ 「◯年◯月◯日」の決め打ち（見本データ・見張りの下ごしらえ）… 見本は**例外ゼロ**／見張りは**棚卸し方式**
     ⑤ カードの状態の言葉を、状態の文字だけで出さない … **例外ゼロ**

   ◎③が「ゼロ」でないわけ
     いま 100か所以上ある。**今日いっぺんに触ると事故る**（29ファイルに手が入る）ので、
     まず「**これ以上増やせない**」状態にしてから、あとで少しずつ減らす。
     🔴 **減らしたら下の表の数も一緒に減らすこと。**（減らさないと、また増やせてしまう）

   ◎使い方（ブラウザもサーバも要らない）
     node test_pit_rules.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + x : '')); } };

const JSDIR = 'js';
const files = fs.readdirSync(JSDIR).filter(f => f.endsWith('.js')).sort();

/* コメント（覚え書き）は見ない。「前はこう書いてあった」を残してあるため。
   ⚠ 行数がずれないように、コメントは空白に置き換える（消さない）。 */
const strip = s => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SRC = {};
files.forEach(f => { SRC[f] = strip(fs.readFileSync(path.join(JSDIR, f), 'utf8')).split('\n'); });

const scan = (re, cb) => files.forEach(f => SRC[f].forEach((L, i) => {
  re.lastIndex = 0; let m;
  while ((m = re.exec(L)) !== null) cb(f, i + 1, L, m);
}));

/* ==================================================================
   ① 状態の名前を自分で綴らない（例外ゼロ）
   ------------------------------------------------------------------
   🔴 v1.161.0 の実話：`x.status !== 'canceled'`（**L が1つ**）と書いてあり、
      本当の値は `'cancelled'`（L が2つ）。**1件も外していなかった**のに
      **JSエラーは1つも出ない**ので、書いた人も次の人も気づけなかった。
   🔴 使ってよい値は **views.js の `statusLabel` の表**から機械が読む。
      ＝ 状態を増やしたら、そこに足せば見張りも一緒に増える（表を2つ持たない）。
   ================================================================== */
console.log('\n── ① 状態の名前を自分で綴らない ──');

const viewsSrc = fs.readFileSync(path.join(JSDIR, 'views.js'), 'utf8');
const mapBlock = (viewsSrc.match(/function statusLabel\(s\)\{[\s\S]*?\n\}/) || [''])[0];
const OK_STATUS = new Set((mapBlock.match(/^\s*(\w+):/gm) || []).map(s => s.replace(/[^\w]/g, '')));
/* 🔴 `cancelled` は表に無いが本物（予約キャンセル／未入庫）。
   ⚠ 画面に出す言葉は archive-pit.js / search.js が別に持っている（`statusLabel` を通らない）。
      いつか statusLabel 側に入れるなら、この1行を消せばよい。 */
OK_STATUS.add('cancelled');

/* カード以外の「状態」＝別の物のもの。ここに書いたものだけ許す（何の状態かも書く）。 */
const NOT_CARD = [
  ['board-notes.js',  'done', '付箋（note）の状態'],
  ['board-notes.js',  'open', '付箋（note）の状態'],
  ['sample-data.js',  'done', '見本の付箋の状態'],
  ['members-pit.js',  'left', 'CoreMembers の在籍（退職）'],
];
const allowed = (f, v) => NOT_CARD.some(x => x[0] === f && x[1] === v);

const badStatus = [];
scan(/[\w$\].]+\.status\s*(?:===|!==|==|!=|=)\s*'([^']*)'/g, (f, ln, L, m) => {
  const v = m[1];
  if (OK_STATUS.has(v) || allowed(f, v)) return;
  badStatus.push(f + ':' + ln + '  → ' + JSON.stringify(v) + '   ' + L.trim().slice(0, 90));
});
ok('🔴 知らない状態の名前が書かれていない（綴り違いはここで止まる）',
   badStatus.length === 0, badStatus.join('\n       → '));
ok('使ってよい状態の表を views.js から読めている', OK_STATUS.size >= 10, [...OK_STATUS].join(','));

/* ==================================================================
   ② お客様名を自分で組み立てない（例外ゼロ）
   ------------------------------------------------------------------
   🔴 新しいお客様は**電話だけで漢字が分からない**ことがあり、その時はカナだけ入れる運用。
      だから **漢字（c.customer）だけを見て出すと、その人が画面から消える**。
      出す時は必ず `pitCustName(c)`（フル）か `pitCustSurname(c)`（苗字だけ）を通す。
   ================================================================== */
console.log('\n── ② お客様名を自分で組み立てない ──');

/* 逃がしてよいもの＝「カードのお客様名」ではないもの。理由も一緒に書く。 */
const NAME_SKIP = [
  ['fleet.js',  '代車の貸出先（loanerAssigns.customer）＝カードではない'],
  ['rules.js',  '（未入力）は付箋の文言のことで、お名前ではない'],
  ['pit-share.js', 'ここが本体（1本の置き場所）'],
];
const nameSkip = f => NAME_SKIP.some(x => x[0] === f);

const ESC = '(?:esc|_pe|_avEsc|_mdEsc|_todEsc|_fleetEsc|escAttr|at|_cvEsc|_e)';
const reOut = new RegExp('\\b' + ESC + '\\s*\\(\\s*\\(?\\s*[\\w$]+\\.customer\\b');
const reCat = /['"][^'"]*['"]\s*\+\s*\(?\s*[\w$]+\.customer\b|\+\s*[\w$]+\.customer\s*\+/;
const reMi  = /（未入力）/;
const safe  = L => /pitCustName|pitCustSurname/.test(L);

const badName = [];
files.forEach(f => {
  if (nameSkip(f)) return;
  SRC[f].forEach((L, i) => {
    if (safe(L)) return;
    if (reMi.test(L)) badName.push(f + ':' + (i + 1) + '  （未入力）を自分で書いている  ' + L.trim().slice(0, 90));
    else if (reOut.test(L) || reCat.test(L)) badName.push(f + ':' + (i + 1) + '  .customer を直に出している  ' + L.trim().slice(0, 90));
  });
});
ok('🔴 お名前を直に組み立てている所が無い（カナだけのお客様が消えない）',
   badName.length === 0, badName.join('\n       → '));

/* 「1本」がちゃんと居るか（消されたら②が素通りになる） */
const shareSrc = fs.readFileSync(path.join(JSDIR, 'pit-share.js'), 'utf8');
ok('🔴 お名前の1本（pitCustName / pitCustSurname）が pit-share.js に居る',
   /w\.pitCustName\s*=/.test(shareSrc) && /w\.pitCustSurname\s*=/.test(shareSrc));
ok('🔴 生きているカードかの1本（pitCardActive）が pit-share.js に居る',
   /w\.pitCardActive\s*=/.test(shareSrc));
ok('🔴 課の1本（pitDivisionLabel / pitDivisionColorOr）が pit-share.js に居る',
   /w\.pitDivisionLabel\s*=/.test(shareSrc) && /w\.pitDivisionColorOr\s*=/.test(shareSrc));

/* ==================================================================
   ③ 棚卸し＝色と「1課／2課」の直書きは、いまの数を超えない
   ------------------------------------------------------------------
   🔴 **課の名前も色も、本当は state.divisions の表1本から引くもの**（v1.92.0 / v1.98.0 の決めごと）。
      直に書くと、設定で課の名前や色を変えた時に**そこだけ古いまま**になる。
   🔴 いまは下の数だけ残っている。**増やさない**のがこの規則の役目。
      ⚠ 減らしたら、**この表の数も一緒に減らすこと。**（減らさないとまた増やせる）
   ================================================================== */
console.log('\n── ③ 棚卸し：色と「1課／2課」の直書きは増やさない ──');

const BASE_COLOR = {
  'avail.js': 4, 'board-line.js': 2, 'card-detail.js': 9, 'card-view.js': 2,
  'coreflow-presence.js': 1, 'customers.js': 3, 'dashboard.js': 3, 'launcher.js': 2,
  'loaner.js': 3, 'maintdash.js': 2, 'mech-summary.js': 3, 'mydash.js': 5,
  'parking.js': 1, 'pit-floor.js': 6, 'reserve.js': 9, 'result.js': 2,
  'return.js': 4, 'rules.js': 4, 'sales.js': 22, 'search.js': 2, 'settings.js': 2,
  'shaken-log.js': 1, 'shaken.js': 1, 'state.js': 2, 'task.js': 1, 'today.js': 2,
  'ui-dialog.js': 2, 'undetermined.js': 2, 'views.js': 1,
};
const BASE_DIV = {
  'card-view.js': 2, 'maintdash.js': 2, 'members-pit.js': 2, 'mydash.js': 6,
  'myonly-pit.js': 2, 'pit-floor.js': 2, 'sales.js': 2, 'state.js': 2,
};

function census(re) {
  const out = {};
  files.forEach(f => { const n = (SRC[f].join('\n').match(re) || []).length; if (n) out[f] = n; });
  return out;
}
function check(name, now, base) {
  const over = [], gone = [];
  Object.keys(now).forEach(f => { if ((base[f] || 0) < now[f]) over.push(f + '  ' + (base[f] || 0) + ' → ' + now[f]); });
  Object.keys(base).forEach(f => { if ((now[f] || 0) < base[f]) gone.push(f + '  ' + base[f] + ' → ' + (now[f] || 0)); });
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  ok('🔴 ' + name + 'の直書きが増えていない（いま ' + sum(now) + ' か所）',
     over.length === 0, over.join('\n       → '));
  if (gone.length) {
    console.log('  🎉 ' + name + 'が減りました。**この見張りの表も同じ数に直してください**：');
    gone.forEach(g => console.log('       ・' + g));
  }
  return sum(now);
}

const nowColor = census(/#1db97a|#ec4899/gi);
const nowDiv   = census(/'1課'|'2課'|>1課<|>2課</g);
const cSum = check('国産の緑・輸入のピンク', nowColor, BASE_COLOR);
const dSum = check('「1課」「2課」という字', nowDiv, BASE_DIV);

console.log('\n  🎯 棚卸しの目標＝どちらも 0（設定の表から引くだけにする）。いま 色 ' + cSum + ' ／ 課 ' + dSum);

/* ==================================================================
   ④ 「◯年◯月◯日」を決め打ちしない
   ------------------------------------------------------------------
   🔴 2026-08-21 に**同じ形のこわれ方を2つ**踏んだので規則にした。
     ・見本データ（`sample-fleet.js`）が代車の予定を **「今年の 8/17 まで」** と書いていた。
       ＝ **8/18 を過ぎた日から翌年の春まで、デモ版の代車カレンダーが空っぽ**。
          しかもエラーは1つも出ない（「今日が8月18日以降だから」なので）。
     ・見張り（`test_resv_detail`）が入庫日に **`'2026-08-20'`** と書いていた。
       ＝ **翌日から「入庫日を過ぎた未入庫」**になり、カードが自動で移って毎回落ちる。
   🔴 **どちらも「今日からの日数」で書けば起きない。**
   ⚠ 見張りの下ごしらえは 59 か所ある。今日いっぺんに直すと事故るので**棚卸し方式**。
      減らしたら**下の表も一緒に減らす**こと。
   ================================================================== */
console.log('\n── ④ 「◯年◯月◯日」を決め打ちしない ──');

const reFixedYmd  = /'20\d\d-\d\d-\d\d'/g;
const reFixedMD   = /new Date\([^;\n]*?,\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/g;

/* ④-a 見本データ＝例外ゼロ（どの日に開いても同じ見え方になること） */
{
  const bad = [];
  files.filter(f => /^sample-/.test(f)).forEach(f => {
    SRC[f].forEach((L, i) => {
      reFixedYmd.lastIndex = 0; reFixedMD.lastIndex = 0;
      if (reFixedYmd.test(L) || reFixedMD.test(L))
        bad.push(f + ':' + (i + 1) + '  ' + L.trim().slice(0, 90));
    });
  });
  ok('🔴 見本データに決め打ちの日付・月日が無い（今日からの日数で作る）',
     bad.length === 0, bad.join('\n       → '));
}

/* ④-b 見張りの下ごしらえ＝棚卸し（増やさない）
   ⚠ 日付そのものを試している見張り（「8/20 の翌日は？」等）は決め打ちで正しい。
      危ないのは **カードの入庫日・返車日**＝「今日」と比べられる欄に決め打ちを入れること。 */
const BASE_TESTDATE = {
  'test_cover_course.mjs': 1, 'test_cover_edit.mjs': 3, 'test_cover_memo.mjs': 3,
  'test_custform.mjs': 6, 'test_demo.mjs': 1, 'test_kana_name.mjs': 1,
  'test_mydash_tbd.mjs': 3, 'test_no_native_dialog.mjs': 1, 'test_nosale.mjs': 19,
  'test_overdue.mjs': 1, 'test_phase_days.mjs': 2, 'test_resv_detail.mjs': 5,
  'test_return_chain.mjs': 1, 'test_return_slot.mjs': 10, 'test_save_menu.mjs': 1,
  'test_shaken_ops.mjs': 1,
};
{
  const reField = /(reserveDate|returnDate|loanerFrom|loanerTo|completedAt|cancelledAt|inDate|outDate)\s*:\s*'20\d\d-\d\d-\d\d'/g;
  const now = {};
  fs.readdirSync('.').filter(f => /^test_.*\.mjs$/.test(f)).forEach(f => {
    const n = (fs.readFileSync(f, 'utf8').match(reField) || []).length;
    if (n) now[f] = n;
  });
  check('見張りの下ごしらえの決め打ち日付', now, BASE_TESTDATE);
}

/* ==================================================================
   ⑤ カードの状態の言葉は「カードごと」渡す（例外ゼロ）
   ------------------------------------------------------------------
   🔴 2026-08-21（ゆうた指摘）**「予約キャンセル」と「未入庫」は意味合いが違う。**
      入れ物（`status`）は**どちらも `'cancelled'` の1つ**で、見分けは `c.cancelled` の印。
      ところが `statusLabel(s)` は**状態の文字しか受け取らない**ので見分けようがなく、
      画面の札に **英語で「cancelled」** と出ていた（カード詳細・予約カード・来店履歴ほか）。
   🔴 **`statusLabel(なにか.status)` と書かない。`pitCardStatusText(カード)` に渡す。**
   ⚠ 状態そのもの（フローの記録の from / to など、カードが手元に無い所）は今までどおりでよい。
   ================================================================== */
console.log('\n── ⑤ カードの状態の言葉は「カードごと」渡す ──');
{
  const bad = [];
  scan(/\bstatusLabel\s*\(\s*[\w$]+\.status\s*\)/g, (f, ln, L) => {
    if (f === 'pit-share.js') return;                  /* ここが本体（1本の中身） */
    if (/pitCardStatusText/.test(L)) return;           /* 1本を通したうえでの保険 */
    bad.push(f + ':' + ln + '  ' + L.trim().slice(0, 90));
  });
  ok('🔴 状態の文字だけで札を作っている所が無い（予約キャンセルと未入庫を言い分けられる）',
     bad.length === 0, bad.join('\n       → '));
  ok('🔴 状態の言葉の1本（pitCardStatusText / pitCancelText）が pit-share.js に居る',
     /w\.pitCardStatusText\s*=/.test(shareSrc) && /w\.pitCancelText\s*=/.test(shareSrc));
  /* ⚠ 「予約キャンセル」「未入庫」は**窓の見出し・タイルの名前・記録の理由**にも出てくる言葉なので、
        字が出ること自体は禁止しない。危ないのは **`c.cancelled ? A : B` で言い分けを組み立てる**形＝
        言葉が2か所に増えて、片方だけ直る。 */
  {
    const bad3 = [];
    /* 見る形＝`… .cancelled ? …` の**近くで「予約キャンセル／未入庫」の字を書いている**行。
       ⚠ 出し分けているのが**クラス名（見た目）**なら問題ない。危ないのは**言葉**が増えること。 */
    scan(/[\w$]+\.cancelled\s*\?/g, (f, ln, L) => {
      if (f === 'pit-share.js') return;                 /* ここが本体 */
      if (/pitCancelText/.test(L)) return;              /* 1本を通したうえでの保険 */
      if (!/['"][^'"]*(予約キャンセル|未入庫)[^'"]*['"]/.test(L)) return;   /* 言葉を書いていない＝見た目の出し分け */
      bad3.push(f + ':' + ln + '  ' + L.trim().slice(0, 90));
    });
    ok('🔴 「予約キャンセル／未入庫」の言い分けを自分で組み立てている所が無い',
       bad3.length === 0, bad3.join('\n       → '));
  }
}

console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
