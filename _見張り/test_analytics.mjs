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
ok('電話・ナンバーが表のどこにも無い', !/090-1111|12-34|56-78/.test(T.csv));
/* 🆕 v3 車台番号は「アプリをまたぐ車の鍵」（決まり §7）＝末尾の「車台番号」の列にだけ出す */
ok('🆕 v3 車台番号は「車台番号」の列にだけ（車両番号の車から）', v('k1', '車台番号') === 'ZVW30-111' && T.csv.split('ZVW30-111').length === 2, v('k1', '車台番号'));
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

console.log('\n── 🆕 v2 受付の列（予約受付日・予約担当・代車・取消） ──');
{
  st.cards = [
    card({ id: 'u1', resNo: 'U1', customer: '鈴木 一郎', sei: '鈴木', car: 'プリウス', status: 'reserved', reserveDate: '2026-10-20',
           bookedAt: '2026-10-01', reserveStaff: '箱崎', needLoaner: true }),
    card({ id: 'u2', resNo: 'U2', customer: '鈴木 一郎', sei: '鈴木', car: 'プリウス', status: 'cancelled', cancelled: true, archived: true,
           reserveDate: '2026-10-10', bookedAt: '2026-09-20', cancelledAt: '2026-10-03', cancelReason: '日程変更\nまた電話する' }),
    card({ id: 'u3', resNo: 'U3', customer: '鈴木 一郎', sei: '鈴木', car: 'プリウス', status: 'cancelled', noShow: true, noShowAt: '2026-10-06',
           reserveDate: '2026-10-05', cancelledAt: '2026-10-06', cancelReason: '' })
  ];
  const U = ctx.pitAnalyticsTable({ today: '2026-10-12' });
  const UH = U.cols, uv = (id, col) => (U.rows.find((r) => r[1] === id) || [])[UH.indexOf(col)];
  ok('🔴 前の列の並びは変えていない（入金日までが同じ位置）', UH.indexOf('入金日') === 40 && UH[0] === 'アプリ' && UH[1] === 'ID', UH.slice(38, 42));
  ok('予約受付日と、受付から入庫までの日数', uv('u1', '予約受付日') === '2026-10-01' && uv('u1', '受付から入庫まで') === 19, [uv('u1', '予約受付日'), uv('u1', '受付から入庫まで')]);
  ok('予約担当・代車', uv('u1', '予約担当') === '箱崎' && uv('u1', '代車') === 1);
  ok('取り消していない予約は取消の列が空', uv('u1', '取消の種類') === '' && uv('u1', '取消日') === '');
  ok('人が押したキャンセル＝キャンセル・日・理由（改行は1行に）', uv('u2', '取消の種類') === 'キャンセル' && uv('u2', '取消日') === '2026-10-03' && uv('u2', '取消理由') === '日程変更 また電話する', [uv('u2', '取消の種類'), uv('u2', '取消理由')]);
  ok('🔴 来なかった＝来店なし（キャンセルと分ける）', uv('u3', '取消の種類') === '来店なし' && uv('u3', '取消日') === '2026-10-06', uv('u3', '取消の種類'));
  ok('辞書に新しい列が載っている', ['予約受付日', '受付から入庫まで', '予約担当', '代車', '取消の種類', '取消日', '取消理由'].every((h) => U.dict.indexOf('| ' + h + ' |') >= 0));
}

console.log('\n── 🆕 v2 2枚目の表＝車検（1行＝1回の陸運局行き） ──');
{
  const shk = (o) => card(Object.assign({ workType: 'shaken', workTypes: ['shaken'], status: 'returned', car: 'タント', sei: '鈴木', customer: '鈴木 一郎', tel: '090-1111-2222', plate: '野田 300 あ 12-34' }, o));
  st.cards = [
    /* 不合格 → 不合格 → 再検で合格 */
    shk({ id: 's1', resNo: 'S1', reserveDate: '2026-09-01', inspSchedule: { result: 'done', resultDate: '2026-09-10', resultSlot: 'pm', resultStaff: '椎名', officeName: '野田', round: 2,
      history: [{ date: '2026-09-03', slot: 'am', result: 'recheck', staff: '箱崎', note: '光軸', officeName: '野田', round: 1 },
                { date: '2026-09-05', slot: 'am', result: 'recheck', staff: '箱崎', staff2: '菅谷', staff2Note: '研修', why: 'サイドスリップ' }] } }),
    /* 一発合格 */
    shk({ id: 's2', resNo: 'S2', reserveDate: '2026-09-02', inspSchedule: { result: 'done', resultDate: '2026-09-04', resultStaff: '椎名', history: [] } }),
    /* 再検合格（その場で直した） */
    shk({ id: 's3', resNo: 'S3', reserveDate: '2026-09-02', inspSchedule: { result: 'done', resultDate: '2026-09-06', resultStaff: '椎名', repass: true, repassNote: 'ブーツ', history: [] } }),
    /* マスター入力の合格の行（同じ日の done と重ねない） */
    shk({ id: 's4', resNo: 'S4', reserveDate: '2026-09-02', inspSchedule: { result: 'done', resultDate: '2026-09-07', resultStaff: '椎名', history: [{ date: '2026-09-07', slot: 'am', result: 'pass', staff: '椎名' }] } }),
    /* まだ行っていない予定だけ＝行に出ない */
    shk({ id: 's5', resNo: 'S5', status: 'reserved', reserveDate: '2026-10-20', inspSchedule: { decided: '2026-10-22', history: [] } }),
    /* 車検ではない入庫＝出ない */
    card({ id: 's6', resNo: 'S6', status: 'returned', reserveDate: '2026-09-01', inspSchedule: { result: 'done', resultDate: '2026-09-02', history: [] } })
  ];
  ok('入口がある', typeof ctx.pitAnalyticsShakenTable === 'function');
  const K = ctx.pitAnalyticsShakenTable({ today: '2026-10-12' });
  const KH = K.cols, rowsOf = (id) => K.rows.filter((r) => r[1] === id), kv = (r, col) => r[KH.indexOf(col)];
  ok('表の名前は pitflow.車検', K.name === 'pitflow.車検');
  ok('🔴 先頭3列は全アプリ共通（アプリ・ID・書き出した日）', KH[0] === 'アプリ' && KH[1] === 'ID' && KH[2] === '書き出した日' && /^\uFEFFアプリ,ID,書き出した日/.test(K.csv));
  const r1 = rowsOf('s1');
  ok('不合格2回＋合格1回＝3行・日付順', r1.length === 3 && r1.map((r) => kv(r, '行った日')).join() === '2026-09-03,2026-09-05,2026-09-10', r1.map((r) => kv(r, '行った日')));
  ok('結果の言葉（不合格・不合格・再検で合格）', r1.map((r) => kv(r, '結果')).join() === '不合格,不合格,再検で合格', r1.map((r) => kv(r, '結果')));
  ok('それまでの不合格・何回目の行き', r1.map((r) => kv(r, 'それまでの不合格')).join() === '0,1,2' && r1.map((r) => kv(r, '何回目の行き')).join() === '1,2,3');
  ok('落ちた理由（note も古い why も読む）', kv(r1[0], '落ちた理由') === '光軸' && kv(r1[1], '落ちた理由') === 'サイドスリップ', r1.map((r) => kv(r, '落ちた理由')));
  ok('回送担当・2人目・2人目の理由・陸運局・R・時間帯', kv(r1[1], '回送担当') === '箱崎' && kv(r1[1], '2人目') === '菅谷' && kv(r1[1], '2人目の理由') === '研修'
     && kv(r1[2], '陸運局') === '野田' && kv(r1[2], 'R') === 2 && kv(r1[2], '時間帯') === 'PM');
  ok('一発合格', rowsOf('s2').length === 1 && kv(rowsOf('s2')[0], '結果') === '一発合格');
  ok('再検合格（その場で直した）と落ちた所', kv(rowsOf('s3')[0], '結果') === '再検合格（その場で直した）' && kv(rowsOf('s3')[0], '落ちた理由') === 'ブーツ');
  ok('🔴 マスター入力の合格の行と同じ日の合格は1行にする', rowsOf('s4').length === 1, rowsOf('s4').length);
  ok('まだ行っていない予定・車検でない入庫は出ない', rowsOf('s5').length === 0 && rowsOf('s6').length === 0);
  ok('🔴🔴 名前（下の名前）・電話・ナンバーは出ない', !/一郎|090-1111|12-34/.test(K.csv));
  ok('数（行・台・不合格）', K.count.行 === 6 && K.count.台 === 4 && K.count.不合格 === 2, K.count);
  ok('辞書に全部の列が載っている', KH.every((h) => K.dict.indexOf('| ' + h + ' |') >= 0));
  const SRV2 = fs.readFileSync(path.join(process.cwd(), '..', '..', '_サーバー', 'functions', 'analytics.js'), 'utf8');
  ok('🔴 サーバーが2枚目を置く（latest と月末）', /pitAnalyticsShakenTable/.test(SRV2) && /latest\/\$\{K\.name\}\.csv/.test(SRV2) && /monthly\/\$\{J\.month\}\/\$\{K\.name\}\.csv/.test(SRV2));
}

console.log('\n── 🆕 v3（A-70）在るのに出していなかった物：pitflow.csv の後ろの列＋表6枚 ──');
{
  const csvRows = (csv) => csv.replace(/^﻿/, '').trim().split('\r\n');
  st.customers = [
    { id: 'cu1', name: '鈴木 一郎', kana: 'スズキ イチロウ', phone: '090-1111-2222',
      vehicles: [{ id: 'v1', plate: '野田 300 あ 12-34', car: 'プリウス', maker: 'トヨタ', vin: 'ZVW30-111', karteNo: 'K77', division: 'div1', frontStaff: '専務', drive: ['土禁'],
                   伝票: [{ 予約番号: 'R1', 伝票: 'T001', 原価: 1, 明細: [] }] },
                 { id: 'v9', plate: '野田 500 い 99-99', car: 'ミニ', maker: 'BMW', archived: true, archivedAt: '2026-09-30T10:00:00.000Z', mergedInto: 'v1' }] }
  ];
  const T0 = Date.UTC(2026, 8, 1, 0, 0);   /* 日本時間 2026-09-01 09:00 */
  st.cards = [
    card({ id: 'p1', resNo: 'P1', customer: '鈴木 一郎', sei: '鈴木', mei: '一郎', kana: 'スズキ イチロウ', customerId: 'cu1', vehId: 'v1', car: 'プリウス', status: 'returned',
           reserveDate: '2026-09-01', completeCallAt: '2026-09-04', noSaleAt: '', thanksLineSent: true, needLoaner: true, loanerId: 'L1', loanerFrom: '2026-09-01', loanerTo: '2026-09-04',
           log: [{ type: 'phase', from: 'reserved', to: 'waiting', by: '椎名', at: T0 },
                 { type: 'phase', from: 'waiting', to: 'contact', by: '椎名', at: T0 + 3600e3, amount: 50000, amountKind: '見積' },
                 { type: 'phase', from: 'contact', to: 'parts', by: '箱崎', at: T0 + 86400e3, amount: 60000, amountKind: '受注' },
                 { label: '手で足したメモ 090-1111-2222', at: T0, manual: true },
                 { type: 'phase', from: 'parts', to: 'workDone', by: '', atTxt: '9/3 10:00' }] }),
    card({ id: 'p2', resNo: 'P2', customer: '田中花子', car: 'ミニ', status: 'reserved', reserveDate: '2026-10-20', noThanksLine: true, orderedAt: Date.UTC(2026, 9, 1, 3, 0) })
  ];
  st.loaners = [{ id: 'L1', name: '代車1', number: 1, model: 'タント', maker: 'ダイハツ', plate: '野田 480 わ 11-11', category: 'kei', shakenDate: '2027-03-01', custVehId: 'v1' },
                { id: 'L2', name: '代車2', model: 'ノート', lease: true, leaseUp: '2027-02', retired: true, retiredAt: '2026-09-20' }];
  st.companyCars = [{ id: 'C1', name: '社用車A', model: 'ハイエース', category: 'commercial' }];
  st.loanerAssigns = [
    { id: 'la1', loanerId: 'L1', cardId: 'p1', fromDate: '2026-09-01', toDate: '2026-09-03', toDateBefore: '2026-09-04', returned: true, returnedAt: '2026-09-03', autoReturned: true, washDone: 'L1' },
    { id: 'la2', loanerId: 'L2', cardId: null, customer: '山本 太郎', purpose: '山本 太郎様の事故 090-3333-4444', fromDate: '2026-09-05', toDate: '2026-09-06', manual: true },
    { id: 'lh1', loanerId: 'L1', cardId: null, hold: true, memo: '車検の予備', customer: '仮押さえ', fromDate: '2026-09-10', toDate: '2026-09-11', manual: true, createdAt: '2026-09-02T01:30:00.000Z' }
  ];
  st.settings = Object.assign({}, st.settings, { target: { monthMin: 16000000, monthMax: 21000000, ratioD: 60 } });
  /* 操作ログ＝サーバーが PIT_ANALYTICS_MORE_COLS を見て state._anAuditLogs に入れる（時刻は JSON にした Firestore の時刻） */
  st._anAuditLogs = [
    { id: 'a2', time: { _seconds: T0 / 1000 + 60, _nanoseconds: 0 }, timeStr: '9/1 09:01', uid: 'U_shiina', userName: '椎名', action: 'フェーズ移動 予約 → 点検待ち', label: '鈴木 一郎 様 / プリウス', cardId: 'p1', kind: 'phase' },
    { id: 'a1', time: { _seconds: T0 / 1000, _nanoseconds: 0 }, uid: 'U_hako', userName: '箱崎', action: '予約を編集（2か所）',
      label: '[P1] 鈴木 一郎 様 / プリウス / お客様名（漢字） 鈴木一郎 → 鈴木 一郎、TEL 090-1111-2222 → 090-1111-3333、受注金額 1 → 2', cardId: 'p1', kind: 'edit' },
    { id: 'a3', time: { _seconds: T0 / 1000 + 120 }, uid: 'U_hako', userName: '箱崎', action: '顧客を登録', label: '鈴木 一郎 / 野田 300 あ 12-34', cardId: '', kind: 'customer' },
    { id: 'a4', time: { _seconds: T0 / 1000 + 180 }, uid: 'U_cf', userName: '佐藤', action: '代車を洗った（CarFlow）', label: '[P1] 鈴木 一郎 様 / プリウス', cardId: 'p1', kind: 'sales' },
    { id: 'a5', time: { _seconds: T0 / 1000 + 240 }, uid: '', userName: '自動', auto: true, dev: '椎名', action: '来店なしにした', label: '田中花子 様 / ミニ', cardId: 'p2', kind: 'auto' },
    { id: 'a7', time: { _seconds: T0 / 1000 + 300 }, uid: 'U_hako', userName: '箱崎', action: '代車の予定を入れた', label: '代車1 山本 太郎 様 9/5〜9/6', kind: 'loaner' },
    { id: 'a6', timeStr: '3/1 10:00', uid: 'x@example.com', userName: '昔の人', action: '古い記録', label: 'メモ shiina@example.com', kind: '' }
  ];
  ok('サーバーが追加で読む入れ物は操作ログ（pitAuditLogs）だけ・画面の入れ物（PitDB._COLS）には入れない',
    JSON.stringify(ctx.PIT_ANALYTICS_MORE_COLS) === JSON.stringify({ _anAuditLogs: 'pitAuditLogs' }) && Object.values(ctx.PitDB._COLS).indexOf('pitAuditLogs') < 0);

  /* pitflow.csv の後ろの列 */
  const V = ctx.pitAnalyticsTable({ today: '2026-10-15' });
  const VH = V.cols, vv = (id, col) => (V.rows.find((r) => r[1] === id) || [])[VH.indexOf(col)];
  ok('🔴 前の列の並びは変えていない（取消理由までが同じ位置・新しい列は後ろ）', VH.indexOf('取消理由') === 47 && VH.slice(48).join() === '車台番号,完TEL日,受注日,売上なしにした日,お礼LINE', VH.slice(46));
  ok('完TEL日・お礼LINE（送った／不要）', vv('p1', '完TEL日') === '2026-09-04' && vv('p1', 'お礼LINE') === '送った' && vv('p2', 'お礼LINE') === '不要');
  ok('受注日＝パーツ待ちに入った最初の記録（無ければ orderedAt）＝売上画面の物差し', vv('p1', '受注日') === '2026-09-02' && vv('p2', '受注日') === '2026-10-01', [vv('p1', '受注日'), vv('p2', '受注日')]);
  ok('辞書の版が 3', /版 3/.test(V.dict) && VH.every((h) => V.dict.indexOf('| ' + h + ' |') >= 0));

  ok('入口がある', typeof ctx.pitAnalyticsMoreTables === 'function');
  const M = ctx.pitAnalyticsMoreTables({ today: '2026-10-15' });
  const by = {}; M.forEach((x) => { by[x.name] = x; });
  ok('表は6枚・名前は pitflow. で始まる', M.length === 6 && ['pitflow.操作ログ', 'pitflow.車', 'pitflow.代車', 'pitflow.代車の車', 'pitflow.工程', 'pitflow.目標'].every((n) => by[n]), M.map((x) => x.name));
  ok('🔴 どの表も先頭3列は全アプリ共通・BOM・CRLF', M.every((x) => /^﻿アプリ,ID,書き出した日/.test(x.csv) && /\r\n$/.test(x.csv)));
  ok('どの表も列の数がそろっている', M.every((x) => { const L = csvRows(x.csv); const n = L[0].split(',').length; return L.every((l) => l.replace(/"[^"]*"/g, '').split(',').length === n); }));
  ok('🔴 どの表も辞書に全部の列・版・PitFlow の版', M.every((x) => csvRows(x.csv)[0].split(',').every((h) => x.dict.indexOf('| ' + h + ' |') >= 0) && /版 3/.test(x.dict) && /PitFlow v?\d/.test(x.dict + ' PitFlow ' + (ctx.PIT_APP_VERSION || '0'))));
  const all = M.map((x) => x.csv).join('\n');
  ok('🔴🔴 下の名前・電話・ナンバー・メール・手で打ったお客様の名前が、6枚のどこにも無い', !/一郎|イチロウ|花子|太郎|090-|12-34|99-99|11-11|480|example\.com/.test(all),
    (all.match(/.*(一郎|イチロウ|花子|太郎|090-|12-34|99-99|11-11|480|example\.com).*/g) || []).slice(0, 4));

  const O = by['pitflow.操作ログ'], OL = csvRows(O.csv), OH = OL[0].split(',');
  const orow = (id) => { const l = OL.find((x) => x.split(',')[1] === id); return l ? l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) : []; };
  const ov = (id, col) => orow(id)[OH.indexOf(col)];
  ok('操作ログの列は共通の並び（アプリ・ID・書き出した日・日時・社員番号・社員・操作・対象の種類・対象ID・内容・どこから）', OH.slice(0, 11).join() === 'アプリ,ID,書き出した日,日時,社員番号,社員,操作,対象の種類,対象ID,内容,どこから', OH);
  ok('全件（7件）・古い順・時刻の読めない行は最後', O.count.行 === 7 && OL.slice(1).map((l) => l.split(',')[1]).join() === 'a1,a2,a3,a4,a5,a7,a6', OL.slice(1).map((l) => l.split(',')[1]));
  ok('日時は日本時間・Firestore の時刻（{_seconds}）を読む', ov('a2', '日時') === '2026-09-01 09:01', ov('a2', '日時'));
  ok('🔴 年の無い古い時刻は読まない（空）', ov('a6', '日時') === '' && O.count.時刻なし === 1);
  ok('予約の編集：名前・TEL の欄は前も後も伏せる・ほかの欄は残す・お客様は苗字', /お客様名（漢字） ［伏せた］/.test(ov('a1', '内容')) && /TEL ［伏せた］/.test(ov('a1', '内容')) && /受注金額 1 → 2/.test(ov('a1', '内容')) && /\[P1\] 鈴木 様/.test(ov('a1', '内容')), ov('a1', '内容'));
  ok('🔴 顧客台帳の記録（customer）は内容を伏せる・対象の種類＝顧客', ov('a3', '内容') === '［伏せた］' && ov('a3', '対象の種類') === '顧客');
  ok('よそのアプリから＝どこから（CarFlow）・操作から印を外す', ov('a4', 'どこから') === 'CarFlow' && ov('a4', '操作') === '代車を洗った' && ov('a2', 'どこから') === 'PitFlow');
  ok('自動の行＝社員は「自動」・どこから＝自動（端末）・社員番号は空', ov('a5', '社員') === '自動' && ov('a5', 'どこから') === '自動（椎名 の端末）' && ov('a5', '自動') === '1' && ov('a5', '社員番号') === '');
  ok('カードの名前は呼び名と同じ苗字（分けられない名前は（苗字不明））', ov('a5', '内容') === '（苗字不明） 様 / ミニ', ov('a5', '内容'));
  ok('カードに結びつかない記録の「〇〇 様」は伏せ字', ov('a7', '内容') === '代車1 〇〇 様 9/5〜9/6', ov('a7', '内容'));
  ok('社員番号＝uid・カードの番号＝対象ID', ov('a2', '社員番号') === 'U_shiina' && ov('a2', '対象ID') === 'p1' && ov('a2', '対象の種類') === 'カード');
  ok('🔴 万一メールが社員番号でも出さない・内容のメールは伏せ字', ov('a6', '社員番号') === '' && /［メール］/.test(ov('a6', '内容')));
  ok('辞書に「引用しない」', /引用しない/.test(O.dict));
  ctx.state._anAuditLogs = undefined;
  const O2 = ctx.pitAnalyticsMoreTables({ today: '2026-10-15' })[0];
  ok('操作ログを読めなかった晩は空の表＋辞書に「読めなかった」（止めない）', O2.count.行 === 0 && /読めなかった/.test(O2.dict));

  const VE = by['pitflow.車'], VL = csvRows(VE.csv);
  ok('車＝1台1行・車台番号・カルテ番号・課・車両注意・伝票の数', VE.count.行 === 2 && VL[1] === 'pitflow,v1,2026-10-15,cu1,ZVW30-111,トヨタ,プリウス,K77,1課（国産）,専務,土禁,1,,,'
     || VL[1].split(',').slice(0, 5).join() === 'pitflow,v1,2026-10-15,cu1,ZVW30-111', VL.slice(1));
  ok('アーカイブ・統合先・MINI', /^pitflow,v9,2026-10-15,cu1,,MINI,ミニ,.*,1,2026-09-30,v1$/.test(VL[2]), VL[2]);

  const LO = by['pitflow.代車'], LL = csvRows(LO.csv), LH = LL[0].split(',');
  const lv = (id, col) => (LL.find((x) => x.split(',')[1] === id) || '').split(',')[LH.indexOf(col)];
  ok('代車の札：種類（予約・予約以外・仮押さえ）', lv('la1', '種類') === '貸出（予約）' && lv('la2', '種類') === '貸出（予約以外）' && lv('lh1', '種類') === '仮押さえ' && LO.count.仮押さえ === 1);
  ok('返却（自動・元の予定）・洗車・呼び名（カードから）', lv('la1', '返却済み') === '1' && lv('la1', '返却日') === '2026-09-03' && lv('la1', '返却の付け方') === '自動（車の返車に合わせた）'
     && lv('la1', '元の返却予定日') === '2026-09-04' && lv('la1', '洗車済み') === '1' && lv('la1', '呼び名') === '鈴木 プリウス' && lv('la1', '代車の名前') === '代車1');
  ok('🔴 予約以外の札は呼び名を出さない・用途の名前と電話は伏せる', lv('la2', '呼び名') === '' && /〇〇 様/.test(lv('la2', '用途・メモ')) && /［電話］/.test(lv('la2', '用途・メモ')), lv('la2', '用途・メモ'));
  ok('仮押さえのメモ・作った日時', lv('lh1', '用途・メモ') === '車検の予備' && lv('lh1', '作った日時') === '2026-09-02 10:30', lv('lh1', '作った日時'));

  const FL = csvRows(by['pitflow.代車の車'].csv);
  ok('代車・社用車：1台1行・ナンバーは出さない・顧客台帳の車の車台番号', by['pitflow.代車の車'].count.行 === 3 && /^pitflow,L1,2026-10-15,代車,1,代車1,ダイハツ,タント,軽自動車,,,,,2027-03-01,,,,v1,ZVW30-111$/.test(FL[1])
     && /^pitflow,L2,.*,1,,2027-02,.*,1,2026-09-20,,$/.test(FL[2]) && /^pitflow,C1,2026-10-15,社用車,/.test(FL[3]), FL.slice(1));

  const PH = by['pitflow.工程'], PL = csvRows(PH.csv);
  ok('工程＝type:phase だけ（手のメモは入れない）・何回目・画面の言葉・金額', PH.count.行 === 4 && PH.count.台 === 1 && /^pitflow,p1,2026-10-15,P1,2,2026-09-01 10:00,[^,]+,[^,]+,椎名,50000,見積,$/.test(PL[2]) && !/手で足したメモ/.test(PH.csv), PL.slice(1));
  ok('工程の言葉は pitStatusJa（予約 → …）', PL[1].split(',')[6] === ctx.pitStatusJa('reserved') && PL[1].split(',')[7] === ctx.pitStatusJa('waiting'));
  ok('🔴 年の無い atTxt だけの行は日時が空', PL[4].split(',')[5] === '' && PH.count.時刻なし === 1, PL[4]);

  const G = csvRows(by['pitflow.目標'].csv);
  ok('目標＝全体・1課・2課（売上画面の pitSalesTarget／pitSalesDivTarget と同じ）', G.length === 4 && G[1] === 'pitflow,all,2026-10-15,全体,16000000,21000000,60,設定あり'
     && G[2] === 'pitflow,div1,2026-10-15,1課（国産）,' + ctx.pitSalesDivTarget('div1').min + ',' + ctx.pitSalesDivTarget('div1').max + ',60,設定あり', G);
  st.settings = Object.assign({}, st.settings, { target: {} });
  const G2 = csvRows(ctx.pitAnalyticsMoreTables({ today: '2026-10-15' })[5].csv);
  ok('目標を入れていない時は「既定値」と書く（数字は売上画面と同じ既定）', /,15000000,20000000,50,既定値$/.test(G2[1]), G2[1]);

  /* サーバーが読む・置く（_サーバー\functions\analytics.js）。🔴 サーバーの直しが入るまで赤＝出す前に必ず入れる */
  const SRV3 = fs.readFileSync(path.join(process.cwd(), '..', '..', '_サーバー', 'functions', 'analytics.js'), 'utf8');
  ok('🔴 サーバーが追加の入れ物（PIT_ANALYTICS_MORE_COLS）を読み、pitAnalyticsMoreTables の表を置く', /PIT_ANALYTICS_MORE_COLS/.test(SRV3) && /pitAnalyticsMoreTables/.test(SRV3));
}

console.log('\n─────────────────────────────');
console.log((fail ? '⚠ ' : '🎉 ') + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
