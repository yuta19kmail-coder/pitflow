/* ========================================
   state.js
   モック段階の状態（後でFirestoreに置き換え）
   ======================================== */

window.state = {
  currentView: 'today',

  // 予約ビュー
  reserveRange: 'day',
  reserveDate: new Date(),

  // 返車ビュー
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

  settings: {
    closedDow:   [0],
    spotClosed:  [],
    spotHoliday: [],
    cutoffTime:  '17:00',
    openTime:    '09:00',
  },

  workTypes: [
    { id: 'shaken',  label: '車検',  color: '#ef4444' },
    { id: 'general', label: '一般',  color: '#84cc16' },
    { id: 'oil',     label: 'オイル', color: '#eab308' },
    { id: '12pt',    label: '12点',  color: '#f97316' },
    { id: 'used',    label: '中古',  color: '#3b82f6' },
    { id: 'bp',      label: 'B.P',   color: '#ec4899' },
    { id: '3m',      label: '3M',    color: '#a855f7' },
  ],

  dropTypes: [
    { id: 'wait',    label: '待', desc: 'お客様待ち' },
    { id: 'sameDay', label: '当', desc: '当日返車' },
    { id: 'drop',    label: '預', desc: '預かり' },
    { id: 'first',   label: '初', desc: '初来店' },
  ],
};
