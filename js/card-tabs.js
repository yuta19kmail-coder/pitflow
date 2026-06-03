/* ========================================
   card-tabs.js  -  入庫カードのタブ（基本/フロー/整備/バックオフィス）／PitFlow v0.6.0
   ----------------------------------------
   ・renderCardForm（card-detail.js）から呼ばれる。タブUIと各パネルのHTMLを供給。
   ・sec / secEnd / statusLabel は card-detail.js / views.js の関数を実行時に利用。
   ・_cardTab は card-detail.js 側で宣言（タブの現在地）。
   ======================================== */

function cfTabBtn(id, label){
  return '<button type="button" class="cf-tab' + (_cardTab === id ? ' on' : '') + '" data-tab="' + id + '" onclick="switchCardTab(\'' + id + '\')">' + label + '</button>';
}

function switchCardTab(id){
  _cardTab = id;
  const hostId = (typeof _cardBodyId !== 'undefined') ? _cardBodyId : 'md-body';
  const host = document.getElementById(hostId) || document;
  host.querySelectorAll('.cf-tab').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === id); });
  host.querySelectorAll('.cf-panel').forEach(function(p){ p.hidden = (p.getAttribute('data-tab') !== id); });
  // 切替時は上端へ（ブレ防止）
  const scroller = (hostId === 'md-body-modal') ? (host.closest('.modal-body') || host) : document.getElementById('main');
  if (scroller) scroller.scrollTop = 0;
}

/* ===== フロー（進捗ログ） ===== */
function fmtFlowTime(ms){
  const d = new Date(ms);
  return (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
function cfFlowHtml(c){
  const ev = [];
  if (c.bookedAt)    ev.push(['予約受付', c.bookedAt]);
  if (c.reserveDate) ev.push(['入庫予定', c.reserveDate + (c.reserveTime ? ' ' + c.reserveTime : '')]);
  (c.log || []).forEach(function(l){ ev.push([l.label, fmtFlowTime(l.at)]); });
  if (c.returnDate)  ev.push(['返車予定', c.returnDate + (c.returnTime ? ' ' + c.returnTime : '')]);

  let h = sec('フロー（進捗ログ）', '🕒');
  h += '<div class="cf-flow">';
  ev.forEach(function(e){
    h += '<div class="cf-flowrow"><span class="cf-flowdot"></span><div class="cf-flowmain"><div class="cf-flowt">' + e[0] + '</div>' + (e[1] ? '<div class="cf-flowd">' + e[1] + '</div>' : '') + '</div></div>';
  });
  h += '<div class="cf-flowrow now"><span class="cf-flowdot"></span><div class="cf-flowmain"><div class="cf-flowt">現在：' + statusLabel(c.status) + '</div></div></div>';
  h += '</div>';
  h += '<div class="cf-hint">工程を動かす（タスクのドラッグ／「次へ」ボタン）と、ここに自動で記録されます。</div>';
  h += secEnd();
  return h;
}

/* ===== 整備（作業チェックリスト） ===== */
function cfMaintItems(c){
  const base = ['オイル交換','オイルエレメント','空気圧調整','灯火類','洗車'];
  const extra = {
    shaken: ['下回り点検','ブレーキ','ライト光軸','排ガス','サイドスリップ'],
    '12pt': ['12ヶ月点検 一式'],
    bp:     ['板金・塗装 仕上げ確認']
  };
  return base.concat(extra[c.workType] || []);
}
function cfMaintHtml(c){
  c.maint = c.maint || {};
  const wtLabel = (state.workTypes.find(function(w){ return w.id === c.workType; }) || {}).label || '';
  const items = cfMaintItems(c);
  let h = sec('作業チェック' + (wtLabel ? '（' + wtLabel + '）' : ''), '🔧');
  h += '<div class="cf-checks">';
  items.forEach(function(it, i){
    const on = !!c.maint[i];
    h += '<div class="cf-chk' + (on ? ' on' : '') + '" onclick="cfMaintToggle(' + i + ')"><span class="cf-chkbox">' + (on ? '✓' : '') + '</span><span class="cf-chkl">' + it + '</span></div>';
  });
  h += '</div>';
  h += '<div class="cf-hint">タップで✓。項目は作業タイプごとに今は固定（将来は設定で編集できるように）。</div>';
  h += secEnd();
  return h;
}
function cfMaintToggle(i){
  const c = state.cards.find(function(x){ return x.id === _editingCardId; });
  if (!c) return;
  c.maint = c.maint || {};
  c.maint[i] = !c.maint[i];
  if (window.PitDB) PitDB.save();
  renderCardForm(c);
}

/* ===== バックオフィス（返車後の後処理） ===== */
const CF_OFFICE_STEPS = ['カルテ（点検結果）最終確認','原価チェック（部品・外注）','請求発行','入金確認','後処理 完了（締め）'];
function cfOfficeHtml(c){
  c.office = c.office || {};
  let h = sec('バックオフィス（返車後の後処理）', '🗂');
  h += '<div class="cf-checks">';
  CF_OFFICE_STEPS.forEach(function(s, i){
    const on = !!c.office[i];
    h += '<div class="cf-chk' + (on ? ' on' : '') + '" onclick="cfOfficeToggle(' + i + ')"><span class="cf-chkbox">' + (on ? '✓' : '') + '</span><span class="cf-chkl">' + s + '</span></div>';
  });
  h += '</div>';
  h += '<div class="cf-hint">返車 → 後処理（カルテ確認・原価・請求/入金・締め）→ 完了 まで。受付/事務向けの欄（現場には隠す等の出し分けは将来）。原価・請求は整備ソフト/会計と重複しない範囲で。</div>';
  h += secEnd();
  return h;
}
function cfOfficeToggle(i){
  const c = state.cards.find(function(x){ return x.id === _editingCardId; });
  if (!c) return;
  c.office = c.office || {};
  c.office[i] = !c.office[i];
  if (window.PitDB) PitDB.save();
  renderCardForm(c);
}

/* ===== 工程ログ記録（task.js / dnd.js / views.js から呼ぶ） ===== */
window.logFlow = function(card, label){
  if (!card) return;
  if (!Array.isArray(card.log)) card.log = [];
  card.log.push({ label: label, at: Date.now() });
};
