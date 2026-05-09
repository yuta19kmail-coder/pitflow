/* ========================================
   views.js
   ビュー切替、共通ユーティリティ、カード詳細モーダル
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

/* ===== カード詳細モーダル ===== */
function openDetail(cardId){
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  document.getElementById('md-title').textContent =
    card.customer + ' 様 / ' + card.car;

  const wt = state.workTypes ? state.workTypes.find(w => w.id === card.workType) : null;
  const dt = state.dropTypes ? state.dropTypes.find(d => d.id === card.dropType) : null;

  let h = '';
  h += '<div class="modal-row"><label>予約日時</label><div>' + card.reserveDate + ' ' + card.reserveTime + '</div></div>';
  h += '<div class="modal-row"><label>返車予定</label><div>' + (card.returnDate || '-') + '</div></div>';
  h += '<div class="modal-row"><label>状態</label><div>' + statusLabel(card.status) + '</div></div>';
  h += '<div class="modal-row"><label>お客様</label><div>' + card.customer + ' 様</div></div>';
  h += '<div class="modal-row"><label>車両</label><div>' + card.car + '</div></div>';
  h += '<div class="modal-row"><label>ナンバー</label><div>' + (card.plate || '-') + '</div></div>';
  h += '<div class="modal-row"><label>整備内容</label><div>' + card.menu + '</div></div>';
  h += '<div class="modal-row"><label>作業タイプ</label><div>' + (wt ? wt.label : '-') + '</div></div>';
  h += '<div class="modal-row"><label>受付タイプ</label><div>' + (dt ? dt.label + '（' + dt.desc + '）' : '-') + '</div></div>';
  h += '<div class="modal-row"><label>担当</label><div>' + (card.staff || '-') + '</div></div>';
  h += '<div class="modal-row"><label>代車</label><div>' + (card.needLoaner ? '🚙 必要' : 'なし') + '</div></div>';
  h += '<div class="modal-row"><label>洗車</label><div>' + (card.needWash ? '💧 必要' : 'なし') + '</div></div>';
  h += '<div class="modal-row"><label>メモ</label><div>' + (card.memo || '-') + '</div></div>';
  h += '<div class="modal-row"><label>緊急</label><div>' + (card.urgent ? '🔴 緊急対応' : '通常') + '</div></div>';
  h += '<div style="margin-top:8px;color:var(--text3);font-size:12px;">';
  h += '※ 詳細編集・進捗操作・写真・チェックリストなどは次フェーズで実装';
  h += '</div>';

  document.getElementById('md-body').innerHTML = h;
  document.getElementById('modal-detail').classList.add('show');
}

function closeDetail(){
  document.getElementById('modal-detail').classList.remove('show');
}

/* ===== 共通ヘルパー ===== */
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
  };
  return map[s] || s;
}

function ymd(d){
  return d.toISOString().slice(0,10);
}
function addDays(d, n){
  const x = new Date(d); x.setDate(x.getDate()+n); return x;
}

/* ===== 各種プレースホルダ ===== */
function openNewReserve(){
  alert('新規予約フォームは次フェーズで実装予定です。');
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
