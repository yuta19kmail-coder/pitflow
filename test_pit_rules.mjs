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

console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
