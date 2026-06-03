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
  if (viewId === 'customers' && window.renderCustomers) renderCustomers();
  if (viewId === 'samplepat' && window.renderSamplePatterns) renderSamplePatterns();
  if (viewId === 'dashboard' && window.renderDashboard) renderDashboard();
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

function ymd(d){
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; }

function openNewReserve(){
  const id = 'c' + Date.now();
  const card = {
    id, status: 'reserved', boardId: state.currentBoardId || 'default', bayId: null,
    log: [{ label: '予約作成', at: Date.now() }],
    customer: '', tel: '', car: '', plate: '',
    reserveDate: ymd(new Date()), reserveTime: '', returnDate: '',
    menu: '', workType: null, dropType: null,
    needLoaner: false, needWash: false, urgent: false, memo: ''
  };
  state.cards.push(card);
  if (window.PitDB) PitDB.save();
  openCard(id, 'page');   // 新規入庫予約＝全画面
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
