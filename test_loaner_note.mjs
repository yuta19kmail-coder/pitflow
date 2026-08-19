// ============================================================
// test_loaner_note.mjs ― 当日メモに出る「代車：ハスラー」の見張り（PitFlow v1.112.0・2026-08-17）
//
//   🗣 ゆうた「当日ビューの代車バッジに代車名（ハスラー等）を欲しい」
//      → モックで詰めて **バッジではなく1行メモに出す**ことに決まった。
//
//   🔴🔴 守るきまり（ここが崩れたら落とす）
//     ・当日メモが **空っぽ** → 代車名を出す
//     ・**書いてある**       → それをそのまま出す
//     ・**全部消した**       → また空っぽなので **代車名に戻る**（誤って消しても救われる）
//     ・見た目は打った文字と **まったく同じ**（薄くしない・点線も付けない）＝ゆうた指定
//     ・番号は付けない（「ハスラー」であって「ハスラー（5）」ではない）
//     ・🔴 文字を作る所は **pit-share.js 1本**。PitFlow と MHS で1文字も違わないこと
//
//   使い方（PitFlow のフォルダで）:
//     python3 -m http.server 8996 --directory .   （別ウィンドウ）
//     PORT=8996 node test_loaner_note.mjs
//   ⚠ MHS の場所は MHS_DIR で渡せる（既定＝ ../../MHS）
// ============================================================
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const PORT = process.env.PORT || 8996;
const MHS_DIR = process.env.MHS_DIR || path.resolve('../../MHS');
let ok = 0, ng = 0;
const t = (n, c, x) => { c ? (ok++, console.log('  OK  ' + n))
                           : (ng++, console.log('  NG  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : ''))); };

/* ── 代車マスタ（車種あり／車種が未登録／存在しない）───────────────── */
const LOANERS = [
  { id: 'L5', name: '代車5', model: 'ハスラー', number: 5 },
  { id: 'L2', name: '代車2', model: 'タント',   number: 2 },
  { id: 'L9', name: '代車9' }                                  /* 車種が未登録 */
];

console.log('\n── ① 物差し（pit-share.js）を素で動かす ────────────');
const src = fs.readFileSync('js/pit-share.js', 'utf8');
const box = { console };
/* pit-share.js は (function(w){…})(window) の形。node では window を作って渡す */
new Function('window', 'console', src)(box, console);
box.PitShare.use({ loaners: () => LOANERS });
/* ⚠ 代車を出している車＝needLoaner が true。**id だけでは足りない**（下の②で見張る） */
const N = c => box.pitTodayNoteText(Object.assign({ needLoaner: true }, c));

t('空っぽなら代車名が出る',                 N({ loanerId: 'L5', todayNote: '' }) === '代車：ハスラー', N({ loanerId: 'L5', todayNote: '' }));
t('書いてあればそれを出す',                 N({ loanerId: 'L5', todayNote: '部品待ち' }) === '部品待ち');
t('🔴 一部だけ消した形もそのまま通る',       N({ loanerId: 'L5', todayNote: 'ハスラー・遅れるかも' }) === 'ハスラー・遅れるかも');
t('🔴 全部消したら代車名に戻る',             N({ loanerId: 'L5', todayNote: '' }) === '代車：ハスラー');
t('🔴 空白だけでも「空っぽ」扱い＝戻る',      N({ loanerId: 'L5', todayNote: '　  ' }) === '代車：ハスラー', N({ loanerId: 'L5', todayNote: '　  ' }));
t('代車を入れ替えると追従する',             N({ loanerId: 'L2', todayNote: '' }) === '代車：タント');
t('代車がまだ決まっていなければ出さない',   N({ loanerId: '',   todayNote: '' }) === '');
t('消えた代車を指していても出さない',       N({ loanerId: 'Lxx', todayNote: '' }) === '');
t('🔴 車種が未登録でも「代車：代車9」にしない', N({ loanerId: 'L9', todayNote: '' }) === '代車9', N({ loanerId: 'L9', todayNote: '' }));
t('🔴 番号は付けない（ハスラー（5）にしない）', !/[（(]\s*5\s*[）)]/.test(N({ loanerId: 'L5', todayNote: '' })), N({ loanerId: 'L5', todayNote: '' }));
t('「自動で出しているぶん」を答えられる',    box.pitTodayNoteIsAuto({ needLoaner:true, loanerId: 'L5', todayNote: '' }) === true
                                          && box.pitTodayNoteIsAuto({ needLoaner:true, loanerId: 'L5', todayNote: 'あ' }) === false);
t('代車マスタを渡さなければ何も出さない（借りる側が渡し忘れても壊れない）', (() => {
  const b2 = { console }; new Function('window', 'console', src)(b2, console);
  return b2.pitTodayNoteText({ needLoaner: true, loanerId: 'L5', todayNote: '' }) === '';
})());

/* ══════════════════════════════════════════════════════════════════════════
   🔴🔴 v1.112.1（2026-08-17 ゆうた報告）**「代車だしてない人に代車のメモが入ってる」**
   ── 原因＝`loanerId` だけを見ていた。
      「代車：必要 → 不要」に戻しても **`loanerId` は消えない**（貸出の取り消しは代車カレンダー側）。
      アプリ全体は `needLoaner` で判断しているのに、ここだけ見ていなかった。
   🔴 **この5件は二度と落とさないこと。落ちたら同じ苦情が現場から出る。**
   ══════════════════════════════════════════════════════════════════════════ */
const RAW = c => box.pitTodayNoteText(c);
t('🔴 代車を出していない車には出さない（不要に戻したが id が残っている）',
   RAW({ needLoaner: false, loanerId: 'L5', todayNote: '' }) === '',
   RAW({ needLoaner: false, loanerId: 'L5', todayNote: '' }));
t('🔴 needLoaner を持っていない古いカードにも出さない',
   RAW({ loanerId: 'L5', todayNote: '' }) === '', RAW({ loanerId: 'L5', todayNote: '' }));
t('🔴 出していない車でも、人が書いたメモは今までどおり出る',
   RAW({ needLoaner: false, loanerId: 'L5', todayNote: '部品待ち' }) === '部品待ち');
t('🔴 「出しているか」を聞く所は1本（pitLoanerOf）',
   typeof box.pitLoanerOf === 'function'
   && box.pitLoanerOf({ needLoaner: true,  loanerId: 'L5' }) === 'ハスラー'
   && box.pitLoanerOf({ needLoaner: false, loanerId: 'L5' }) === '');
t('🔴 pitLoanerNote も needLoaner を通っている（素通りの道を作っていない）',
   box.pitLoanerNote({ needLoaner: false, loanerId: 'L5' }) === '');

/* ══════════════════════════════════════════════════════════════════════════
   🔴🔴 v1.112.2（2026-08-17 ゆうた「まだ治ってないな」／具体例 X76098）
   ── **自動で出していた文字が、カードに本当に書き込まれてしまっていた。**
      押して、何も打たずに閉じるだけで確定する作りなので、「代車：ハスラー」が焼き付く。
      こうなると表示の直し（v1.112.1）では消えない。
   🔴 ① 保存する前に空にする ／ ② すでに焼き付いたものは自動ぶんとして読み替える
   🔴 **この9件は二度と落とさないこと。**
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── ①-2 焼き付いた文字を残さない（v1.112.2）──────────');
t('🔴 代車なしなのに焼き付いた文字＝出さない',
   RAW({ needLoaner: false, loanerId: 'L5', todayNote: '代車：ハスラー' }) === '',
   RAW({ needLoaner: false, loanerId: 'L5', todayNote: '代車：ハスラー' }));
t('🔴 代車の記録すら無いのに焼き付いた文字＝出さない',
   RAW({ todayNote: '代車：ハスラー' }) === '', RAW({ todayNote: '代車：ハスラー' }));
t('🔴 車種未登録の焼き付き（代車9）も読み替える',
   RAW({ todayNote: '代車9' }) === '', RAW({ todayNote: '代車9' }));
t('🔴 代車を入れ替えたら、焼き付いた古い名前ではなく今の代車を出す',
   RAW({ needLoaner: true, loanerId: 'L2', todayNote: '代車：ハスラー' }) === '代車：タント',
   RAW({ needLoaner: true, loanerId: 'L2', todayNote: '代車：ハスラー' }));
t('🔴 人が後ろに足した文字は触らない（完全一致だけ読み替える）',
   RAW({ needLoaner: false, loanerId: 'L5', todayNote: '代車：ハスラー・遅れるかも' }) === '代車：ハスラー・遅れるかも');
t('🔴 ふつうのメモは触らない', RAW({ todayNote: '部品待ち' }) === '部品待ち');
t('🔴 押して閉じただけでは保存しない（自動ぶんそのまま→空）',
   box.pitTodayNoteToSave('代車：ハスラー') === '' && box.pitTodayNoteToSave('代車9') === '');
t('🔴 人が書いた文字はちゃんと保存する',
   box.pitTodayNoteToSave('代車：ハスラー・遅れるかも') === '代車：ハスラー・遅れるかも'
   && box.pitTodayNoteToSave('部品待ち') === '部品待ち');
t('🔴 焼き付いた文字を「自動ぶん」と答えられる',
   box.pitTodayNoteIsAuto({ needLoaner: true, loanerId: 'L5', todayNote: '代車：ハスラー' }) === true
   && box.pitTodayNoteIsAuto({ needLoaner: true, loanerId: 'L5', todayNote: '部品待ち' }) === false);

/* ══════════════════════════════════════════════════════════════════════════
   🏷 v1.113.0（2026-08-17 ゆうた指定）ナンバーの場所に「初回顧客」「初回車両」
   　 初回＝ナンバーが入らないので、その場所が空欄だった。そこに札を出す。
   🔴 **「まだ選んでいない」を初回だと決めつけない**（v1.88.0 の決めごと）。
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── ①-3 ナンバーの場所（初回顧客・初回車両）v1.113.0 ──');
const P = c => box.pitTodayPlate(c);
t('🔴 初回にチェック → 初回顧客',
   P({ repeat:'first', plate:'' }).text === '初回顧客', P({ repeat:'first', plate:'' }));
t('🔴 リピーター＋ナンバー無し → 初回車両',
   P({ repeat:'repeater', plate:'' }).text === '初回車両', P({ repeat:'repeater', plate:'' }));
t('リピーター＋ナンバー有り → ナンバーそのまま',
   P({ repeat:'repeater', plate:'野田 501 ぬ 4152' }).text === '野田 501 ぬ 4152');
t('🔴 まだ選んでいない＋ナンバー無し → 何も出さない（初回と決めつけない）',
   P({ repeat:'', plate:'' }).text === '' && P({ plate:'' }).text === '', P({ plate:'' }));
t('まだ選んでいない＋ナンバー有り → ナンバーそのまま',
   P({ plate:'習志野 480 う 77-88' }).text === '習志野 480 う 77-88');
t('初回でナンバーが入っていても初回顧客を優先（ゆうた指定）',
   P({ repeat:'first', plate:'品川 300 あ 12-34' }).text === '初回顧客');
t('空白だけのナンバーは「無し」扱い',
   P({ repeat:'repeater', plate:'　 ' }).text === '初回車両');
t('見分けの種類を返す（色分けに使う）',
   P({ repeat:'first', plate:'' }).kind === 'first'
   && P({ repeat:'repeater', plate:'' }).kind === 'firstcar'
   && P({ repeat:'repeater', plate:'あ' }).kind === 'plate');

console.log('\n── ② 写しを作っていないか（ソースの見張り）──────────');
const today = fs.readFileSync('js/today.js', 'utf8');
t('🔴 当日ビューは pitTodayNoteText を通している', /pitTodayNoteText\(/.test(today));
t('🔴 当日ビューで「代車：」を組み立てていない',   !/代車：'\s*\+|'代車：'/.test(today), (today.match(/代車：[^\n]*/g) || []).slice(0, 2));
t('🔴 入力欄の初期値も画面に出ている文字',         /inp\.value = _todNoteText\(c\)/.test(today));
t('🔴 保存する前に物差しを通している（焼き付き止め）', /pitTodayNoteToSave\(inp\.value\)/.test(today));
t('🔴 当日ビューは pitTodayPlate を通している',        /pitTodayPlate\(c\)/.test(today));
t('🔴 当日ビューで「初回顧客」を組み立てていない',      !/'初回顧客'|初回顧客</.test(today));
t('🔴 素の inp.value.trim() で保存していない',        !/todayNote = inp\.value\.trim\(\)/.test(today));
const loaner = fs.readFileSync('js/loaner.js', 'utf8');
t('🔴 loaner.js に pitLoanerModel の写しが残っていない', !/window\.pitLoanerModel\s*=/.test(loaner));
t('pit-share.js が pitLoanerModel の本家になっている',   /w\.pitLoanerModel\s*=/.test(src));
const idx = fs.readFileSync('index.html', 'utf8');
/* ⚠ 2026-08-19：ここは「その時の番号ぴったり」を見ていたので、**次に版を上げるたびに落ちて**いた。
   　 見たいのは「上がっているか」なので、**その時以上か**で見る。 */
const vOf = (name) => { const m = new RegExp(name.replace('.', '\\.') + '\\?v=(\\d+)').exec(idx); return m ? +m[1] : -1; };
t('pit-share.js の ?v= が上がっている',   vOf('pit-share.js') >= 7,  vOf('pit-share.js'));
t('today.js の ?v= が上がっている',        vOf('today.js')     >= 41, vOf('today.js'));
t('loaner.js の ?v= が上がっている',       vOf('loaner.js')    >= 71, vOf('loaner.js'));

console.log('\n── ③ MHS 側が同じ物差しを通しているか ──────────────');
const mhsPath = path.join(MHS_DIR, 'index.html');
if (!fs.existsSync(mhsPath)) {
  t('MHS の index.html が読める（MHS_DIR で場所を渡せる）', false, mhsPath);
} else {
  const mhs = fs.readFileSync(mhsPath, 'utf8');
  t('🔴 MHS も pitTodayNoteText を通している',        /function pitNoteText\(c\)\{[^\n]*pitTodayNoteText/.test(mhs));
  t('🔴 MHS で「代車：」を組み立てていない',           !/'代車：'/.test(mhs.replace(/^.*v1\.21\.0.*$/gm, '')), (mhs.match(/'代車：'/g) || []).length);
  t('🔴 MHS の入力欄の初期値も画面に出ている文字',     /inp\.value=pitNoteText\(c\)/.test(mhs));
  t('🔴 MHS が代車マスタ（pitLoaners）を購読している', /collection\('pitLoaners'\)/.test(mhs));
  t('🔴 MHS が差し込み口から代車マスタを渡している',   /loaners:\s*function\(\)\{\s*return PIT_LOANERS/.test(mhs));
  t('🔴 MHS 側も needLoaner の判断を自前で書いていない（物差し任せ）',
     !/needLoaner/.test(mhs.split('function pitNoteSpan')[0].split('function pitTodayNoteFallback')[1] || ''));
  t('🔴 借りる一覧に新しい7つが入っている（古い PitFlow を掴んだら写しに戻れる）',
     ['pitLoanerModel','pitLoanerOf','pitLoanerNote','pitTodayNoteText','pitTodayNoteIsAuto',
      'pitTodayNoteAutoLike','pitTodayNoteToSave'].every(k => mhs.includes("'" + k + "'")));
  t('🔴 MHS も保存する前に物差しを通している（焼き付き止め）', /pitTodayNoteToSave\(inp\.value\)/.test(mhs));
  t('🔴 MHS も pitTodayPlate を通している',            /_pl=window\.pitTodayPlate\?pitTodayPlate\(c\)/.test(mhs));
  t('🔴 MHS で「初回顧客」を組み立てていない',          !/'初回顧客'/.test(mhs));
  t('🔴 借りる一覧に pitTodayPlate が入っている',       mhs.includes("'pitTodayPlate'"));
  t('読めなかった時の予備がある（メモだけは今までどおり動く）', /function pitTodayNoteFallback/.test(mhs));
}

console.log('\n── ④ 実物のブラウザ：見た目が打った文字と1つも違わないか ──');
const chrome = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find(c => { try { return fs.existsSync(c); } catch (_) { return false; } });
const b = await chromium.launch(chrome ? { executablePath: chrome } : {});
const p = await b.newPage({ viewport: { width: 1280, height: 700 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
/* 本物の views.css に、当日ビューと同じ形の行を2つ流し込む（自動で出た文字／人が打った文字） */
const css = fs.readFileSync('css/views.css', 'utf8');
await p.setContent(`<!doctype html><meta charset="utf-8"><style>
  :root{--bg:#0f1117;--bg2:#1a1d27;--bg3:#222536;--border:#333650;--text:#e8eaf6;--text2:#9fa8c7;--text3:#5c6490;--orange:#f59e0b;--team:#1db97a;--brand:#26a269}
  body{background:var(--bg);color:var(--text);font-family:sans-serif}
  ${css}</style>
  <div class="today-row"><div class="tr-time">09:00</div><div class="tr-front"></div>
    <div class="tr-main"><div class="tr-headline"><span class="tr-customer">田中 様</span></div>
    <div class="tr-plateline"><span class="tr-plate">品川 300</span><span class="tr-note" id="auto">代車：ハスラー</span></div></div>
    <div class="tr-tags"></div></div>
  <div class="today-row"><div class="tr-time">10:30</div><div class="tr-front"></div>
    <div class="tr-main"><div class="tr-headline"><span class="tr-customer">鈴木 様</span></div>
    <div class="tr-plateline"><span class="tr-plate">品川 330</span><span class="tr-note" id="typed">部品待ち</span></div></div>
    <div class="tr-tags"></div></div>`);
await p.waitForTimeout(200);
const look = await p.evaluate(() => {
  const g = id => { const s = getComputedStyle(document.getElementById(id));
    return [s.color, s.opacity, s.fontWeight, s.fontSize, s.borderBottomStyle, s.textDecorationLine].join('|'); };
  return { auto: g('auto'), typed: g('typed') };
});
t('🔴 自動で出た文字と、人が打った文字の見た目が完全に同じ', look.auto === look.typed, look);
t('薄くしていない（opacity が 1）',      /\|1\|/.test(look.auto), look.auto);
t('点線を付けていない',                  /\|none\|/.test(look.auto), look.auto);
t('JSエラー0', errs.length === 0, errs.slice(0, 3));
await b.close();

console.log(`\n===== ${ok} OK / ${ng} NG =====`);
process.exit(ng ? 1 : 0);
