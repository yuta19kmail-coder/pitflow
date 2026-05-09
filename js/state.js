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
    { id: 'L01', name: '代車1', model: 'タント',     plate: '○○ 0001' },
    { id: 'L02', name: '代車2', model: 'N-WGN',      plate: '○○ 0002' },
    { id: 'L03', name: '代車3', model: 'デイズ',     plate: '○○ 0003' },
    { id: 'L04', name: '代車4', model: 'ムーブ',     plate: '○○ 0004' },
  ],

  cards: [],
  loanerAssigns: [],

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
    closedDow:   [0],
    spotClosed:  [],
    spotHoliday: [],
    cutoffTime:  '17:00',
    openTime:    '09:00',
  },

  workTypes: [
    { id: 'shaken',  label: '車検',         color: '#ef4444' },
    { id: 'general', label: '一般',         color: '#84cc16' },
    { id: 'oil',     label: 'オイル',       color: '#eab308' },
    { id: '12pt',    label: '12点',         color: '#f97316' },
    { id: 'used',    label: '中古',         color: '#3b82f6' },
    { id: 'bp',      label: 'B.P',          color: '#ec4899' },
    { id: '3m',      label: '3M',           color: '#a855f7' },
    { id: 'bring',   label: '持込',         color: '#06b6d4' },
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
