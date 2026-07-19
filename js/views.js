/* ========================================
   views.js
   ビュー切替、共通ユーティリティ
   ※ openDetail/closeDetail は card-detail.js に分離
   ======================================== */

function showView(viewId){
  state.currentView = viewId;
  // 付箋の表示先を既定（ダッシュボード）へ戻す。マイダッシュボードは renderMyDash 内で自分の器へ切替。
  window.PIT_BN_TARGET = 'board-notes-area';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.si-item').forEach(i => i.classList.remove('active'));

  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.si-item[data-view="' + viewId + '"]')
    .forEach(i => i.classList.add('active'));

  // フライアウト：開いていたら閉じる＋アクティブな子を持つ親グループを淡くハイライト
  if (window.closeFlyoutNow) closeFlyoutNow();
  document.querySelectorAll('.si-flyout.has-active').forEach(g => g.classList.remove('has-active'));
  const activeChild = document.querySelector('.si-flyout-panel .si-item.active');
  if (activeChild){
    const grp = activeChild.closest('.si-flyout');
    if (grp) grp.classList.add('has-active');
  }

  if (viewId === 'today')   renderToday();
  if (viewId === 'availcal' && window.renderAvail) renderAvail();
  if (viewId === 'reserve') renderReserve();
  if (viewId === 'return')  renderReturn();
  if (viewId === 'carsales' && window.renderCarSales) renderCarSales();
  if (viewId === 'task')    renderTask();
  if (viewId === 'course1' && window.renderCourse) renderCourse('default', 'kanban-cols-1');
  if (viewId === 'course2' && window.renderCourse) renderCourse('import',  'kanban-cols-2');
  if (viewId === 'work')    renderWork();
  if (viewId === 'outsource' && window.renderOutsource) renderOutsource();
  if (viewId === 'result')  renderResult();
  if (viewId === 'loaner')  renderLoaner();
  if (viewId === 'customers' && window.renderCustomers) renderCustomers();
  if (viewId === 'dashboard' && window.renderMyDash) renderMyDash();   // ダッシュボード＝ビルダー（旧ダッシュ/整備ダッシュを統合）
  if (viewId === 'help' && window.renderHelp) renderHelp();
  if (viewId === 'shakencal' && window.renderShaken) renderShaken();
  if (viewId === 'shakenlog' && window.renderShakenLog) renderShakenLog();
  if (viewId === 'sales' && window.renderSales) renderSales();
  if (viewId === 'parking' && window.renderParking) renderParking();
  if (viewId === 'fleet' && window.renderFleet) renderFleet();
  if (viewId === 'settings' && window.renderSettings) renderSettings();
  if (viewId === 'rules' && window.renderRules) renderRules();
}

/* 📅 予約カレンダー（その日）へ飛ぶ（顧客履歴・検索結果から） */
function pitGotoReserveDate(dateStr){
  if (window.custCloseModal) custCloseModal();
  if (window.pitSearchClose) pitSearchClose();
  if (dateStr){
    const d = new Date(String(dateStr) + 'T00:00:00');
    if (!isNaN(d)){ state.reserveDate = d; state.reserveRange = 'day'; }
  }
  showView('reserve');
}
window.pitGotoReserveDate = pitGotoReserveDate;

/* 📊 実績カレンダー（その月）へ飛ぶ（返車済みから） */
function pitGotoResultMonth(dateStr){
  if (window.custCloseModal) custCloseModal();
  if (window.pitSearchClose) pitSearchClose();
  const d = dateStr ? new Date(String(dateStr) + 'T00:00:00') : new Date();
  if (!isNaN(d)) state.resultMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  showView('result');
}
window.pitGotoResultMonth = pitGotoResultMonth;

/* 🗂 カードを詳細で開く（モーダル等を閉じてから） */
function pitOpenCardDetail(cardId){
  if (window.custCloseModal) custCloseModal();
  if (window.pitSearchClose) pitSearchClose();
  if (window.openDetail) openDetail(cardId);
}
window.pitOpenCardDetail = pitOpenCardDetail;

/* ===== サイドバー フライアウト（親をホバー/タップ→右に小メニュー・StockFlow流用を汎用化）v0.33.0 =====
   HTML側：<div class="si-flyout" id="fly-<key>" onmouseenter="openFlyout('<key>')" onmouseleave="scheduleCloseFlyout()">
             <div class="si-item si-has-flyout" onclick="toggleFlyout(event,'<key>')">…<span class="si-caret">▸</span></div>
             <div class="si-flyout-panel" id="flypanel-<key>" onmouseenter="openFlyout('<key>')" onmouseleave="scheduleCloseFlyout()">…子…</div>
           </div> */
let _flyCloseT = null;
let _flyCurrent = null;
function _isNarrowMenu(){ return window.matchMedia('(max-width:768px)').matches; }
function openFlyout(key){
  clearTimeout(_flyCloseT);
  if (_flyCurrent && _flyCurrent !== key) _closeFlyoutEl(_flyCurrent);
  _flyCurrent = key;
  const wrap = document.getElementById('fly-' + key);
  const panel = document.getElementById('flypanel-' + key);
  if (!wrap || !panel) return;
  wrap.classList.add('open-parent');
  const trig = wrap.querySelector('.si-has-flyout');
  const r = trig.getBoundingClientRect();
  panel.style.visibility = 'hidden';
  panel.classList.add('open');
  if (_isNarrowMenu()){
    panel.style.left = Math.max(8, r.left) + 'px';
    panel.style.top  = (r.bottom + 4) + 'px';
  } else {
    panel.style.left = (r.right + 2) + 'px';
    panel.style.top  = r.top + 'px';
    const ph = panel.offsetHeight;
    if (r.top + ph > window.innerHeight - 8){
      panel.style.top = Math.max(8, window.innerHeight - 8 - ph) + 'px';
    }
  }
  panel.style.visibility = '';
}
function _closeFlyoutEl(key){
  const wrap = document.getElementById('fly-' + key);
  const panel = document.getElementById('flypanel-' + key);
  if (wrap)  wrap.classList.remove('open-parent');
  if (panel) panel.classList.remove('open');
}
function scheduleCloseFlyout(){
  clearTimeout(_flyCloseT);
  _flyCloseT = setTimeout(function(){ if (_flyCurrent) _closeFlyoutEl(_flyCurrent); _flyCurrent = null; }, 180);
}
function closeFlyoutNow(){
  clearTimeout(_flyCloseT);
  if (_flyCurrent) _closeFlyoutEl(_flyCurrent);
  _flyCurrent = null;
}
function toggleFlyout(e, key){
  if (e) e.stopPropagation();
  const panel = document.getElementById('flypanel-' + key);
  if (panel && panel.classList.contains('open')) closeFlyoutNow();
  else openFlyout(key);
}
window.openFlyout = openFlyout;
window.scheduleCloseFlyout = scheduleCloseFlyout;
window.closeFlyoutNow = closeFlyoutNow;
window.toggleFlyout = toggleFlyout;

/* ☰ サイドバーをたたむ（v0.27.1・CarFlow/StockFlowと同じ操作感）。状態は端末に記憶 */
function toggleSidebar(){
  const app = document.getElementById('app');
  if (!app) return;
  const off = app.classList.toggle('sb-off');
  try { localStorage.setItem('pitflow_sb_off', off ? '1' : ''); } catch (e) {}
}
(function(){
  try {
    if (localStorage.getItem('pitflow_sb_off') === '1'){
      const app = document.getElementById('app');
      if (app) app.classList.add('sb-off');
    }
  } catch (e) {}
})();

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
    outsource:'外注',
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
    outsource:'#f59e0b',
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

/* ===== カードのホバー詳細用ヘルパー（共通） ===== */
function fmtMD(s){                                   // 'YYYY-MM-DD' → 'M/D'
  if (!s) return '';
  const p = String(s).split('-');
  return (p.length >= 3) ? (+p[1] + '/' + +p[2]) : s;
}
function daysFromToday(s){                            // s - 今日（整数日・未来=+）
  if (!s) return null;
  const d = new Date(s + 'T00:00:00'); if (isNaN(d)) return null;
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((d - t) / 86400000);
}
function loanerDueLabel(c){                           // 代車期限：〜7/4（あと3日）
  if (!c.needLoaner) return '';
  if (!c.returnDate) return '代車（返車日 未定）';
  const n = daysFromToday(c.returnDate);
  let tail = '';
  if (n != null) tail = n > 0 ? '（あと' + n + '日）' : (n === 0 ? '（本日）' : '（' + Math.abs(n) + '日超過）');
  return '代車期限　〜' + fmtMD(c.returnDate) + tail;
}
function holdDaysLabel(c, workLabel){                 // 預かり：6/10〜（5日目）
  const head = workLabel ? (workLabel + '　') : '';
  if (!c.reserveDate) return head + '預かり日 未定';
  const n = daysFromToday(c.reserveDate);             // 入庫日（過去=マイナス）
  const dayNo = (n == null) ? null : (1 - n);         // 入庫日当日＝1日目
  return head + '預かり ' + fmtMD(c.reserveDate) + '〜' + (dayNo ? '（' + dayNo + '日目）' : '');
}
function escAttr(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

function openNewReserve(){
  const id = 'c' + Date.now();
  const card = {
    id, resNo: (window.pitGenResNo ? pitGenResNo() : ''),   // 🔢 予約番号（ローマ字1＋5桁・例 K48201）
    status: 'reserved', boardId: null, bayId: null,   // 国産/輸入は未選択スタート（選ぶと片方のカレンダーが消える）
    division: null,   // 課は国産/輸入を選んだ瞬間に自動で入る
    log: [{ label: '予約作成', at: Date.now() }],
    customer: '', tel: '', maker: '', car: '', plate: '',
    reserveDate: ymd(new Date()), reserveTime: '', returnDate: '',
    bookedAt: ymd(new Date()),   // 予約受付日＝デフォルト今日（必要なら手で変更）v0.82.0
    // 予約担当＝ログインしている人の名前（本番ログイン接続後に自動入力）。今は空。v0.82.0
    reserveStaff: (typeof pitCurrentStaffName === 'function' ? (pitCurrentStaffName() || '') : ''),
    estHoldDays: '',   // 作業タイプ選択前は空欄（選ぶと自動で入る）
    estAmount: null,   // 概算金額＝作業タイプ選択で自動セット
    menu: '', workType: null, dropType: null, consult: false,
    needLoaner: false, needWash: false, urgent: false, memo: '',
    tentative: false,   // 仮予約フラグ（仮予約で登録ボタン／詳細の切替でON）v0.100.0
    workSpecials: []   // 特殊（保証/保険）＝作業タイプとセットの時だけ付く。予約詳細/ホバー/印刷にのみ表示 v0.116.0
  };
  state.cards.push(card);
  if (window.PitDB) PitDB.save(true);   // v0.87.1 作成した瞬間に即保存（デバウンス待ちで取りこぼさない）
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
