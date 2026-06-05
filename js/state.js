/* ========================================
   state.js
   モック段階の状態（後でFirestoreに置き換え）
   ======================================== */

window.state = {
  currentView: 'today',

  reserveRange: 'day',
  reserveDate: new Date(),

  returnRange: 'day',
  returnDate: new Date(),

  currentBoardId: 'default',
  boards: [
    {
      id: 'default',
      name: '国産車',
      cols: [
        { id: 'check',    name: '点検待ち',   icon: '🔍' },
        { id: 'estim',    name: '見積り中',   icon: '🧮' },
        { id: 'contact',  name: '連絡中',     icon: '📞' },
        { id: 'parts',    name: 'パーツ待ち', icon: '📦' },
        { id: 'work',     name: '作業待ち',   icon: '🔧' },
        { id: 'workDone', name: '作業完了済', icon: '✅', terminal: true },
        { id: 'scrap',    name: '廃車・乗替', icon: '🚫', terminal: true, side: true },
      ],
    },
    {
      id: 'import',
      name: '輸入車',
      cols: [
        { id: 'check',    name: '点検待ち',   icon: '🔍' },
        { id: 'estim',    name: '見積り中',   icon: '🧮' },
        { id: 'contact',  name: '連絡中',     icon: '📞' },
        { id: 'parts',    name: 'パーツ待ち', icon: '📦' },
        { id: 'work',     name: '作業待ち',   icon: '🔧' },
        { id: 'workDone', name: '作業完了済', icon: '✅', terminal: true },
        { id: 'scrap',    name: '廃車・乗替', icon: '🚫', terminal: true, side: true },
      ],
    },
  ],

  bays: [
    { id: 'bay1', name: 'PIT 1',   icon: '🛠️', note: '車検対応' },
    { id: 'bay2', name: 'PIT 2',   icon: '🛠️', note: '一般整備' },
    { id: 'bay3', name: 'PIT 3',   icon: '🛠️', note: '板金・塗装' },
    { id: 'bay4', name: 'リフト',  icon: '⬆️',  note: 'タイヤ交換' },
  ],

  resultMonth: new Date(),

  loaners: [
    { id: 'L01', name: '代車1',  model: 'タント',     plate: '○○ 0001', shakenDate: '2026-09-14', tenkenDate: '2026-07-10' },
    { id: 'L02', name: '代車2',  model: 'N-BOX',      plate: '○○ 0002', shakenDate: '2027-01-22', tenkenDate: '2026-08-05' },
    { id: 'L03', name: '代車3',  model: 'ワゴンR',    plate: '○○ 0003', shakenDate: '2026-11-30', tenkenDate: '2026-06-18' },
    { id: 'L04', name: '代車4',  model: 'ムーヴ',     plate: '○○ 0004', shakenDate: '2027-03-08', tenkenDate: '2026-10-02' },
    { id: 'L05', name: '代車5',  model: 'デイズ',     plate: '○○ 0005', shakenDate: '2026-08-25', tenkenDate: '2027-02-12' },
    { id: 'L06', name: '代車6',  model: 'スペーシア', plate: '○○ 0006', shakenDate: '2026-12-19', tenkenDate: '2026-07-28' },
    { id: 'L07', name: '代車7',  model: 'ハスラー',   plate: '○○ 0007', shakenDate: '2027-04-06', tenkenDate: '2026-09-21' },
    { id: 'L08', name: '代車8',  model: 'アルト',     plate: '○○ 0008', shakenDate: '2026-10-17', tenkenDate: '2027-01-30' },
    { id: 'L09', name: '代車9',  model: 'ミラ',       plate: '○○ 0009', shakenDate: '2027-02-14', tenkenDate: '2026-08-22' },
    { id: 'L10', name: '代車10', model: 'N-WGN',      plate: '○○ 0010', shakenDate: '2026-07-31', tenkenDate: '2026-11-26' },
    { id: 'L11', name: '代車11', model: 'ekワゴン',   plate: '○○ 0011', shakenDate: '2026-09-03', tenkenDate: '2027-03-19' },
    { id: 'L12', name: '代車12', model: 'キャスト',   plate: '○○ 0012', shakenDate: '2027-05-11', tenkenDate: '2026-10-29' },
    { id: 'L13', name: '代車13', model: 'タフト',     plate: '○○ 0013', shakenDate: '2026-11-08', tenkenDate: '2026-06-25' },
    { id: 'L14', name: '代車14', model: 'ウェイク',   plate: '○○ 0014', shakenDate: '2027-01-05', tenkenDate: '2026-09-17' },
    { id: 'L15', name: '代車15', model: 'パッソ',     plate: '○○ 0015', shakenDate: '2026-08-12', tenkenDate: '2026-12-03' },
    { id: 'L16', name: '代車16', model: 'フィット',   plate: '○○ 0016', shakenDate: '2026-12-27', tenkenDate: '2027-04-15' },
    { id: 'L17', name: '代車17', model: 'ヴィッツ',   plate: '○○ 0017', shakenDate: '2027-03-23', tenkenDate: '2026-07-16' },
    { id: 'L18', name: '代車18', model: 'ノート',     plate: '○○ 0018', shakenDate: '2026-10-04', tenkenDate: '2027-02-26' },
    { id: 'L19', name: '代車19', model: 'スイフト',   plate: '○○ 0019', shakenDate: '2027-04-29', tenkenDate: '2026-11-13' },
    { id: 'L20', name: '代車20', model: 'アクア',     plate: '○○ 0020', shakenDate: '2026-09-26', tenkenDate: '2027-01-08' },
  ],

  // 社用車（積載車・営業車など）＝代車・自社車両管理ページで管理
  companyCars: [
    { id: 'C01', name: '積載車',   model: 'キャンター', plate: '○○ 1001', shakenDate: '2026-08-20', tenkenDate: '2026-12-15' },
    { id: 'C02', name: '社用バン', model: 'ハイエース', plate: '○○ 1002', shakenDate: '2026-10-11', tenkenDate: '2027-02-01' },
    { id: 'C03', name: '軽トラ',   model: 'キャリイ',   plate: '○○ 1003', shakenDate: '2027-02-27', tenkenDate: '2026-09-09' },
    { id: 'C04', name: '営業車',   model: 'アクア',     plate: '○○ 1004', shakenDate: '2026-07-19', tenkenDate: '2027-01-13' },
  ],

  cards: [],
  loanerAssigns: [],
  fleetEvents: [],   // 車両イベント（車検入庫・リースアップ/切替・その他）＝車両管理で登録・代車ビューに重ねて表示
  customers: [],   // 顧客控え（車両ごと・入力補助／整備ソフトが正式台帳）

  todayDuty: {
    safe:    '林',
    sns:     '椎名',
    cleaning:'蓮沼',
  },

  // スタッフ一覧（select用）
  staff: [
    { id: 'shacho',  name: '社長',   role: 'owner' },
    { id: 'shiina',  name: '椎名',   role: 'staff' },
    { id: 'ichiya',  name: '壱谷',   role: 'staff' },
    { id: 'fukumitsu',name:'福光',   role: 'staff' },
    { id: 'hasunuma',name: '蓮沼',   role: 'staff' },
    { id: 'hakozaki',name: '箱崎',   role: 'staff' },
    { id: 'sugaya',  name: '菅谷',   role: 'staff' },
    { id: 'hayashi', name: '林',     role: 'staff' },
    { id: 'takagi',  name: '高橋',   role: 'staff' },
  ],

  divisions: [
    { id: 'div1', label: '1課' },
    { id: 'div2', label: '2課' },
  ],

  paymentMethods: [
    { id: 'cash',     label: '現金' },
    { id: 'card',     label: 'カード' },
    { id: 'transfer', label: '振込' },
    { id: 'collect',  label: '集金' },
    { id: 'finance',  label: 'ローン' },
    { id: 'later',    label: '後払い' },
  ],

  loanerConditions: [
    { id: 'etc',    label: 'ETC' },
    { id: 'navi',   label: 'ナビ' },
    { id: 'height', label: '高さ' },
    { id: 'iso',    label: 'ISO' },
  ],

  settings: {
    closedDow:   [3],  // 定休曜日（仮＝水曜。日曜は営業。将来は会社カレンダー＝MHSマスターから取得予定）
    spotClosed:  [],
    spotHoliday: [],
    cutoffTime:  '17:00',
    openTime:    '09:00',
    // 置き場の内訳（ピット内・自社敷地・駐車場・緊急+α＝最悪使える分）※数字は仮割り・実数はゆうたが設定画面で入れる
    lotCap: { pit: 4, yard: 12, parking: 8, extra: 4 },
    lotCapacity: 28,      // 同時に預かれる台数＝lotCapの合計（自動計算・各画面はこれを読む）
    // 🅿️ 駐車場オーバーの色分け（v0.25.2 ゆうた指定）＝ちょい超過は緊急+α・コインパで吸収できる「普通」
    //    空き0以上＝緑／超過1〜warn台＝オレンジ／warn超〜danger未満＝濃いオレンジ／danger台以上＝赤
    lotOver: { warn: 5, danger: 10 },
    holdDaysDefault: 3,   // 最短入庫の計算で使う「預かり想定日数」
    reserveCap: { default: 5, import: 3 },   // 1日の予約上限（default＝国産 / import＝輸入・人が別なのでチーム別）
    // 概算預かり日数の既定（作業タイプ別・入庫予約時の初期値。_default＝表にないタイプ用）
    estHold: { shaken:5, general:6, bp:12, oil:0, '12pt':0, coat1y:3, coat3m:2, _default:5 },
    // 💴 概算金額の既定（作業タイプ別・円）。カードの「概算金額」の初期値＝メニュー平均単価
    // 初期値は売上表Excelの実績（車検12.9万・点検5.6万・一般9.4万）＋仮置き。設定画面で調整可
    estAmount: { shaken:129000, '12pt':56000, general:94000, oil:8000, bp:120000, coat1y:35000, coat3m:20000, _default:100000 },
    // 売上目標（円/月）＝最低目標〜最高目標(天井)。クォーター換算は÷4（売上表Excel 4年分の実績から）
    target: { monthMin: 15000000, monthMax: 20000000 },
    // 平均単価の初期値（円・チーム別）。実績が貯まれば pitUnitPrice() が直近3ヶ月平均に自動切替
    unitPrice: { default: 83000, import: 130000 },
    // 🧩 ルール（ノーコード積み上げ式・rules.js）。rules=ルール配列／ruleDict=言葉→％の辞書
    rules: [],
    ruleDict: { increase: 20, decrease: -20, careful: -15, minimize: -50, allow: 15 },
    // 🏖 長期休み（お盆・年末年始・GW等）。期間中は入庫受付を自動0（預かり継続は可）。
    // 月目標は変わらないので「前1週間/明け1週間」ルールで補う運用。将来はMHS会社カレンダーから取得
    longBreaks: [],   // [{ label:'お盆', from:'2026-08-11', to:'2026-08-16' }, ...]
    // 🗣 肌感ルール（言葉のまま積む・AI判定の判断基準になる層／v0.23.0）
    // 計算式にできない現場の知恵を文章で登録。本番化後はClaude APIがこれを読んで日別の○△×を判定する
    fuzzyRules: [],   // [{ on:true, text:'高額な作業が3台以上重なる週はメカがしんどいので控えめに' }, ...]
  },

  // 🤖 AI判定の結果置き場（v0.23.0＝器のみ。本番化後にClaude APIが1日1回ここを更新する）
  // { '2026-06-05': { default:{mark:'△',reason:'...'}, import:{...}, by:'ai', at:171… }, ... }
  // 空のうちは計算式の仮判定（pitVerdict）がそのまま使われる
  aiVerdicts: {},

  // 作業タイプ（2026-06-05 ゆうた確定の7種。設定画面で増減可能＝settings.workTypes に保存され、ここを上書きする）
  workTypes: [
    { id: 'shaken',  label: '車検',           color: '#ef4444' },
    { id: '12pt',    label: '12点',           color: '#f97316' },
    { id: 'general', label: '一般',           color: '#84cc16' },
    { id: 'oil',     label: 'オイル',         color: '#eab308' },
    { id: 'bp',      label: 'B.P',            color: '#3b82f6' },
    { id: 'coat1y',  label: 'コーティング1Y', color: '#8b5cf6' },
    { id: 'coat3m',  label: 'コーティング3M', color: '#a855f7' },
  ],

  dropTypes: [
    { id: 'wait',    label: '待', desc: 'お客様待ち' },
    { id: 'sameDay', label: '当', desc: '当日返車' },
    { id: 'drop',    label: '預', desc: '預かり' },
  ],

  repeatTypes: [
    { id: 'first',   label: '初回' },
    { id: 'repeater',label: 'リピーター' },
  ],
};

/* 概算預かり日数の既定（入庫予約時の初期値・後で手で調整できる）
   ※ 表は state.settings.estHold ＝ 設定画面から変更できる（v0.14.0〜） */
function pitEstHold(workType, dropType){
  if (dropType === 'wait' || dropType === 'sameDay') return 0;   // 待ち・当日仕上げ＝置き場を使わない
  const map = (state.settings && state.settings.estHold) || {};
  if (map[workType] != null) return map[workType];
  return (map._default != null) ? map._default : 5;
}
window.pitEstHold = pitEstHold;

/* 概算金額の初期値（作業タイプ別・円）＝カードの「概算金額」に自動で入る。後で手で直せる */
function pitEstAmount(workType){
  const map = (state.settings && state.settings.estAmount) || {};
  if (map[workType] != null) return map[workType];
  return (map._default != null) ? map._default : 100000;
}
window.pitEstAmount = pitEstAmount;

/* チーム別の平均単価（円）＝直近3ヶ月（92日）の返車完了カードに確定金額(amountFinal)が
   10台以上あれば実績平均を自動計算。足りないうちは設定の初期単価を使う */
function pitUnitPrice(team){
  const s = state.settings || {};
  const init = (s.unitPrice && s.unitPrice[team] != null) ? s.unitPrice[team] : 100000;
  try {
    const d = new Date(); d.setDate(d.getDate() - 92);
    const since = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const done = (state.cards || []).filter(function(c){
      return c.boardId === team && c.status === 'returned' && c.returnDate && c.returnDate >= since && c.amountFinal > 0;
    });
    if (done.length >= 10){
      const sum = done.reduce(function(a, c){ return a + c.amountFinal; }, 0);
      return Math.round(sum / done.length);
    }
  } catch (e) {}
  return init;
}
window.pitUnitPrice = pitUnitPrice;

/* 設定の初期値スナップショット（設定画面の「初期値に戻す」用） */
window.PIT_DEFAULT_SETTINGS = JSON.parse(JSON.stringify(state.settings));
