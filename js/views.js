/* ========================================
   views.js
   ビュー切替、共通ユーティリティ
   ※ openDetail/closeDetail は card-detail.js に分離
   ======================================== */

function showView(viewId){
  state.currentView = viewId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.si-item').forEach(i => i.classList.remove('active'));

  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.si-item[data-view="' + viewId + '"]')
    .forEach(i => i.classList.add('active'));

  if (viewId === 'today')   renderToday();
  if (viewId === 'reserve') renderReserve();
  if (viewId === 'return')  renderReturn();
  if (viewId === 'task')    renderTask();
  if (viewId === 'work')    renderWork();
  if (viewId === 'result')  renderResult();
  if (viewId === 'loaner')  renderLoaner();
}

function toggleTheme(){
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  document.querySelector('.theme-toggle').textContent = next === 'dark' ? '🌙' : '☀️';
}

function statusLabel(s){
  const map = {
    reserved: '予約',
    check:    '点検待ち',
    estim:    '見積り中',
    contact:  '連絡中',
    parts:    'パーツ待ち',
    work:     '作業待ち',
    workDone: '作業完了',
    returned: '返車完了',
    scrap:    '廃車・乗替',
  };
  return map[s] || s;
}

function statusColor(s){
  const map = {
    reserved: '#64748b',
    check:    '#3b82f6',
    estim:    '#f59e0b',
    contact:  '#a855f7',
    parts:    '#06b6d4',
    work:     '#26a269',
    workDone: '#1db97a',
    returned: '#10b981',
    scrap:    '#6b7280',
  };
  return map[s] || '#64748b';
}

function ymd(d){ return d.toISOString().slice(0,10); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; }

function openNewReserve(){
  alert('新規予約フォームは段階3で実装予定です。\n\n（既存カードをクリックすると新フォームが開きます）');
}
function goToday(){
  state.reserveDate = new Date();
  if (state.currentView === 'reserve') renderReserve();
}
function addBoard(){    alert('看板の追加は次フェーズで実装予定です'); }
function editBays(){    alert('PIT枠の編集は次フェーズで実装予定です'); }
function editLoaners(){ alert('代車の編集は次フェーズで実装予定です'); }
function prevMonth(){   state.resultMonth.setMonth(state.resultMonth.getMonth()-1); renderResult(); }
function nextMonth(){   state.resultMonth.setMonth(state.resultMonth.getMonth()+1); renderResult(); }
function closeMonth(){  alert('月次集計締めは次フェーズで実装予定です'); }
