/* PitFlow ── 📊 分析用の書き出し（analytics-pit.js）の見張り（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-10-05）
     🗣「ありとあらゆるデータをあなたに渡すってのがイメージの全容」
     決まり＝`..\..\_記録\仕様\分析用の書き出し_全アプリ共通の決まり.md`

   ◎ここで見張ること
     🔴🔴 名前（フル）・下の名前・電話・ナンバー・メールが表に**1文字も出ない**
     🔴🔴 呼び名＝苗字＋車種。姓と名が分けられない名前は「（苗字不明）」（下の名前を出さない）
     🔴  原価は予約番号で伝票と結ぶ。伝票が無い車は原価・粗利が**空**（0 にしない）
     🔴  金額・区分は売上画面の集め方（pitSalesMonthCollect）と同じ
     🔴  MINI のまとめ方・原価の引き方は1本（AIレポートも同じ物を借りる）
     ・何回目（キャンセルは数えない）／担当の「なし」と未入力／保険の実績日＝入金日／CSV のくくり

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_analytics.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

/* ---- サーバーと同じ順で読み込む（_サーバー\functions\analytics.js の FILES と揃える） ---- */
const FILES = ['pit-share.js', 'state.js', 'intern-pit.js', 'sales-date.js', 'mech-pick.js', 'customers.js', 'veh-merge.js',
  'insurance-pit.js', 'sales-count.js', 'analytics-pit.js', 'sales-ai.js', 'db-pit.js', 'views.js', 'sales.js', 'members-pit.js'];
/* 🔴 サーバーの並びと同じか（片方だけ直すと、手元では通るのに夜中に落ちる） */
const SRV = fs.readFileSync(path.join(process.cwd(), '..', '..', '_サーバー', 'functions', 'analytics.js'), 'utf8');
const SRV_FILES = JSON.parse((/const PIT_FILES = (\[[\s\S]*?\]);/.exec(SRV) || [, '[]'])[1].replace(/'/g, '"'));
const noop = () => {};
const el = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : el, apply: () => el, construct: () => el });
const ctx = { console: { log: noop, warn: noop, error: console.error }, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop,
  document: el, localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, navigator: { userAgent: 'node' },
  location: { hash: '', search: '', hostname: 'node', href: '' }, addEventListener: noop, removeEventListener: noop,
  matchMedia: () => ({ matches: false, addListener: noop, addEventListener: noop }), requestAnimationFrame: noop };
ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
console.log('\n── 読み込み（サーバーと同じ組み合わせ）──');
let loaded = true;
for (const f of FILES) {
  try { vm.runInContext(JS(f), ctx, { filename: f }); } catch (e) { loaded = false; console.log('     ' + f + ' → ' + e); }
}
ok('画面用のファイルを、そのままサーバーで読み込める', loaded);
ok('書き出しの入口がある', typeof ctx.pitAnalyticsTable === 'function');
ok('🔴 読み込むファイルがサーバー（_サーバー\functions\analytics.js）と同じ', JSON.stringify(SRV_FILES) === JSON.stringify(FILES), SRV_FILES);
ok('🔴 AIレポートは MINI・原価を analytics-pit.js から借りている（写しを持たない）',
  !/function isMini/.test(JS('sales-ai.js')) && /w\.pitCardMaker\(c\)/.test(JS('sales-ai.js')) && /w\.pitCardCost\(c\)/.test(JS('sales-ai.js')));

/* ---- 作り物のデータ ---- */
const st = ctx.state;
st.customers = [
  { id: 'cu1', name: '鈴木 一郎', kana: 'スズキイチロウ', phone: '090-1111-2222',
    vehicles: [{ id: 'v1', plate: '野田 300 あ 12-34', car: 'プリウス', vin: 'ZVW30-111',
      伝票: [{ 予約番号: 'R1', 伝票: 'T001', 原価: 30000, 明細: [{ 種: '部品', 金額: 40000, 原価: 30000 }, { 種: '作業', 金額: 60000, 原価: 0 }] }] }] },
  { id: 'cu2', name: '田中花子', vehicles: [{ id: 'v2', plate: '野田 500 い 56-78', car: 'ミニ' }] }
];
const base = { boardId: 'default', division: 'div1', dropType: 'drop', workType: 'general', workTypes: ['general'], repeat: 'repeater', frontStaff: '専務' };
const card = (o) => Object.assign({}, base, o);
st.cards = [
  card({ id: 'k1', resNo: 'R1', customer: '鈴木 一郎', sei: '鈴木', mei: '一郎', kana: 'スズキ イチロウ', tel: '090-1111-2222', customerId: 'cu1', vehId: 'v1',
         plate: '野田 300 あ 12-34', car: 'プリウス', maker: 'トヨタ', status: 'returned', reserveDate: '2026-09-01', actualInAt: '2026-09-01',
         returnDateFinal: '2026-09-03', completedAt: '2026-09-03', amountFinal: 100000, mechanics: ['山田'], inspectorsNone: true }),
  card({ id: 'k2', resNo: 'R2', customer: '田中花子', customerId: 'cu2', plate: '野田 500 い 56-78', car: 'ミニ', maker: 'BMW', division: 'div2',
         status: 'returned', reserveDate: '2026-09-05', actualInAt: '2026-09-05', returnDateFinal: '2026-09-05', completedAt: '2026-09-05', amountFinal: 8800 }),
  card({ id: 'k3', resNo: 'R3', customer: '㈱テスト商事', car: 'ハイエース', maker: 'トヨタ', status: 'returned', workSpecials: ['insurance'],
         reserveDate: '2026-09-10', actualInAt: '2026-09-10', returnDateFinal: '2026-09-15', completedAt: '2026-09-28', paymentSeparate: true, paymentDate: '2026-09-28', amountFinal: 300000 }),
  card({ id: 'k4', resNo: 'R4', customer: '鈴木 一郎', sei: '鈴木', customerId: 'cu1', car: 'プリウス', status: 'cancelled', cancelled: true, reserveDate: '2026-08-01' }),
  card({ id: 'k5', resNo: 'R5', customer: '鈴木 一郎', sei: '鈴木', customerId: 'cu1', car: 'プリウス', status: 'reserved', reserveDate: '2026-10-20', amountFinal: '' }),
  card({ id: 'k7', resNo: 'R7', customer: 'メフロ　バフシュ　アーヴィン', sei: 'メフロ　バフシュ　アーヴィン', car: 'プリウス', status: 'reserved', reserveDate: '2026-10-21' }),
  card({ id: 'k8', resNo: 'R8', customer: '(有)ユウキオート', sei: '(有)ユウキオート', car: 'キャリイ', status: 'reserved', reserveDate: '2026-10-22' }),
  card({ id: 'k6', resNo: 'R6', customer: '佐藤,"ジョー"', car: 'カローラ', status: 'returned', reserveDate: '2026-09-02', actualInAt: '2026-09-02',
         returnDateFinal: '2026-09-02', completedAt: '2026-09-02', amountFinal: 5000 })
];

const T = ctx.pitAnalyticsTable({ today: '2026-10-05' });
const H = T.cols, row = (id) => T.rows.find((r) => r[1] === id), v = (id, col) => row(id)[H.indexOf(col)];

console.log('\n── 🔴🔴 個人を特定できる物は出さない ──');
ok('下の名前（一郎・花子）が表のどこにも無い', !/一郎|イチロウ|花子/.test(T.csv), T.csv.match(/.*(一郎|花子).*/));
ok('電話・ナンバー・車台番号が表のどこにも無い', !/090-1111|12-34|56-78|ZVW30/.test(T.csv));
ok('呼び名＝苗字＋車種（姓の欄から）', v('k1', '呼び名') === '鈴木 プリウス', v('k1', '呼び名'));
ok('🔴 姓と名が分けられない名前は（苗字不明）', v('k2', '呼び名') === '（苗字不明） ミニ', v('k2', '呼び名'));
ok('🔴 姓の欄にフルネームが空白区切りで入っていても、最初の区切りまで（本番で1件あった）', v('k7', '呼び名') === 'メフロ プリウス' && !/アーヴィン/.test(T.csv), v('k7', '呼び名'));
ok('姓の欄の会社名（(有)など）は丸ごと', v('k8', '呼び名') === '(有)ユウキオート キャリイ', v('k8', '呼び名'));
ok('法人は会社名で出す', v('k3', '呼び名') === '㈱テスト商事 ハイエース', v('k3', '呼び名'));

console.log('\n── 原価・粗利（伝票と予約番号で結ぶ）──');
ok('伝票と結んだ車は原価・粗利が入る', v('k1', '原価') === 30000 && v('k1', '粗利') === 70000 && v('k1', '粗利率') === 70, row('k1'));
ok('部品・工賃の内わけ', v('k1', '部品売上') === 40000 && v('k1', '部品原価') === 30000 && v('k1', '工賃') === 60000);
ok('1日あたり粗利＝粗利÷預かり日数', v('k1', '預かり日数') === 2 && v('k1', '1日あたり粗利') === 35000, [v('k1', '預かり日数'), v('k1', '1日あたり粗利')]);
ok('🔴 伝票が無い車は原価・粗利が空（0 にしない）', v('k2', '原価') === '' && v('k2', '粗利') === '' && v('k2', '1日あたり粗利') === '');
ok('数えた台数が辞書に出る', T.count.伝票あり === 1 && /伝票と結びついた 1/.test(T.dict), T.count);

console.log('\n── 物差しは画面と同じ ──');
ok('MINI はまとめて MINI', v('k2', 'メーカー') === 'MINI');
ok('売上画面と同じ区分（返車済み＝実績）', v('k1', '売上の区分') === '実績', v('k1', '売上の区分'));
const C = ctx.pitSalesMonthCollect('2000-01-01', '2099-12-31').rows.find((r) => r.c.id === 'k1');
ok('売上画面と同じ金額', v('k1', '金額') === C.amt, [v('k1', '金額'), C.amt]);
ok('保険の実績日＝入金日（返車日ではない）', v('k3', '実績日') === '2026-09-28' && v('k3', '返車日') === '2026-09-15' && v('k3', '付加') === '保険');
ok('当日返しは預かり0日・1日あたりは1日で割る', v('k2', '預かり日数') === 0);

console.log('\n── そのほか ──');
ok('何回目（キャンセルは数えない）', v('k1', '何回目') === 1 && v('k5', '何回目') === 2 && v('k4', '何回目') === '', [v('k1', '何回目'), v('k4', '何回目'), v('k5', '何回目')]);
ok('担当の「なし」と未入力を分ける', v('k1', '点検担当') === 'なし' && v('k1', '整備担当') === '山田' && v('k2', '点検担当') === '');
ok('キャンセルも行として残る', !!row('k4') && /キャンセル/.test(v('k4', '状態')), v('k4', '状態'));
ok('CSV は Excel で開ける形（BOM・改行 CRLF）', T.csv.charCodeAt(0) === 0xFEFF && /\r\n/.test(T.csv));
ok('カンマ・引用符の入った値はくくる', /"（苗字不明） カローラ"|（苗字不明） カローラ/.test(T.csv));
ok('列の数がそろっている', T.rows.every((r) => r.length === H.length));
ok('辞書に全部の列が載っている', H.every((h) => T.dict.indexOf('| ' + h + ' |') >= 0));

console.log('\n─────────────────────────────');
console.log((fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
