/* ========================================
   state.js
   モック段階の状態（後でFirestoreに置き換え）
   ======================================== */

window.state = {
  // 現在のビュー
  currentView: 'reserve',

  // 予約ビューのレンジ
  reserveRange: 'day',
  reserveDate: new Date(),

  // タスクビュー
  currentBoardId: 'default',
  boards: [
    {
      id: 'default',
      name: '一般',
      cols: [
        { id: 'check',   name: '点検待ち',  icon: '🔍' },
        { id: 'estim',   name: '見積り中',  icon: '🧮' },
        { id: 'contact', name: '連絡中',    icon: '📞' },
        { id: 'parts',   name: 'パーツ待ち', icon: '📦' },
        { id: 'work',    name: '作業待ち',  icon: '🔧' },
      ],
    },
    {
      id: 'import',
      name: '輸入車',
      cols: [
        { id: 'check',   name: '点検待ち',  icon: '🔍' },
        { id: 'estim',   name: '見積り中',  icon: '🧮' },
        { id: 'contact', name: '連絡中',    icon: '📞' },
        { id: 'parts',   name: 'パーツ待ち', icon: '📦' },
        { id: 'work',    name: '作業待ち',  icon: '🔧' },
      ],
    },
  ],

  // 作業ビューのPIT枠
  bays: [
    { id: 'bay1', name: 'PIT 1',   icon: '🛠️', note: '車検対応' },
    { id: 'bay2', name: 'PIT 2',   icon: '🛠️', note: '一般整備' },
    { id: 'bay3', name: 'PIT 3',   icon: '🛠️', note: '板金・塗装' },
    { id: 'bay4', name: 'リフト',  icon: '⬆️',  note: 'タイヤ交換' },
  ],

  // 実績ビューの月
  resultMonth: new Date(),

  // 代車一覧（横軸）
  loaners: [
    { id: 'L01', name: '代車1', model: 'タント',     plate: '○○ 0001' },
    { id: 'L02', name: '代車2', model: 'N-WGN',      plate: '○○ 0002' },
    { id: 'L03', name: '代車3', model: 'デイズ',     plate: '○○ 0003' },
    { id: 'L04', name: '代車4', model: 'ムーブ',     plate: '○○ 0004' },
  ],

  // 入庫カード一覧（PitFlowの中心データ）
  // 1台の入庫＝1カード。状態はビューを跨いで進む
  // status: 'reserved' | 'check' | 'estim' | 'contact' | 'parts' | 'work' | 'workDone' | 'returned'
  cards: [],

  // 代車割当
  // { loanerId, cardId, fromDate, toDate }
  loanerAssigns: [],

  // 設定（モック）
  settings: {
    closedDow: [0],   // 日曜定休
    spotClosed: [],   // スポット定休（YYYY-MM-DD配列）
    cutoffTime: '17:00',
    openTime: '09:00',
  },
};
