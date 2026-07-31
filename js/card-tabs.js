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
/* フローでワンタップ追加できる「よくあるアクション」。現場の言葉で。 */
const FLOW_QUICK = [
  '<i data-ic=phone data-ics=16></i> こちらから電話 → 留守（折り返し待ち）',
  '<i data-ic=phone data-ics=16></i> こちらから電話 → つながった',
  '<i data-ic=phone data-ics=16></i> お客様から入電',
  '<i data-ic=car data-ics=16></i> 来店・相談',
  '<i data-ic=comment data-ics=16></i> 見積りを連絡',
  '<i data-ic=check data-ics=16></i> 承認 OK',
  '<i data-ic=hourglass data-ics=15></i> 部品待ち',
  '<i data-ic=calendar data-ics=16></i> 日程を調整'
];
function _flowEsc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
/* タイムライン1行。delIdx を渡すと ✕（手動記録の削除）が付く。 */
function _flowRow(title, detail, delIdx){
  let r = '<div class="cf-flowrow"><span class="cf-flowdot"></span><div class="cf-flowmain"><div class="cf-flowt">' + _flowEsc(title) + '</div>';
  if (detail) r += '<div class="cf-flowd">' + _flowEsc(detail) + '</div>';
  r += '</div>';
  if (delIdx !== null && delIdx !== undefined){
    r += '<button type="button" class="cf-flowdel" title="この記録を消す" onclick="cfFlowDel(' + delIdx + ')"><i data-ic=close data-ics=16></i></button>';
  }
  return r + '</div>';
}
function cfFlowHtml(c){
  let h = sec('フロー（進捗ログ）', '<i data-ic=clock data-ics=16></i>');

  /* === タイムライン === */
  h += '<div class="cf-flow">';
  if (c.bookedAt)    h += _flowRow('予約受付', c.bookedAt);
  if (c.reserveDate) h += _flowRow('入庫予定', c.reserveDate + (c.reserveTime ? ' ' + c.reserveTime : ''));
  (c.log || []).forEach(function(l, i){
    const det = fmtFlowTime(l.at) + (l.staff ? '　・　' + l.staff : '');
    h += _flowRow(l.label, det, l.manual ? i : null);
  });
  if (c.returnDate)  h += _flowRow('返車予定', c.returnDate + (c.returnTime ? ' ' + c.returnTime : ''));
  h += '<div class="cf-flowrow now"><span class="cf-flowdot"></span><div class="cf-flowmain"><div class="cf-flowt">現在：' + statusLabel(c.status) + '</div></div></div>';
  h += '</div>';

  /* === 手動でアクションを残す（ある程度イージーに） === */
  h += '<div class="cf-flowadd">';
  h += '<div class="cf-label">アクションを記録（チップをタップ／自由入力で追加）</div>';
  /* 担当・時刻（既定＝前回の担当＋今。触らなければそのまま） */
  h += '<div class="cf-flowmeta">';
  h += '<select id="cf-flow-staff" class="cf-input" title="担当者"><option value="">担当 ―</option>';
  (state.staff || []).forEach(function(s){
    h += '<option value="' + _flowEsc(s.name) + '"' + (s.name === _lastFlowStaff ? ' selected' : '') + '>' + _flowEsc(s.name) + '</option>';
  });
  h += '</select>';
  h += '<input id="cf-flow-when" class="cf-input cf-flowwhen" type="datetime-local" value="' + _dtLocalNow() + '" title="記録時刻（既定は今・昨日の留守などはここを変更）">';
  h += '<button type="button" class="cf-flownow" onclick="cfFlowNow()" title="時刻を今に戻す">今</button>';
  h += '</div>';
  h += '<div class="cf-flowquick">';
  FLOW_QUICK.forEach(function(q, i){
    h += '<button type="button" class="cf-flowchip" onclick="cfFlowAddQuick(' + i + ')">' + _flowEsc(q) + '</button>';
  });
  h += '</div>';
  h += '<div class="cf-flowcustom">';
  h += '<input id="cf-flow-input" class="cf-input" placeholder="その他（自由入力）例：代車の件で連絡待ち" onkeydown="if(event.key===\'Enter\'){event.preventDefault();cfFlowAddCustom();}">';
  h += '<button type="button" class="cf-flowaddbtn" onclick="cfFlowAddCustom()">＋ 追加</button>';
  h += '</div>';
  h += '</div>';

  h += '<div class="cf-hint">工程を動かす（タスクのドラッグ／「次へ」）と自動でも記録されます。担当・時刻は触らなければ「前回の担当＋今」で入り、手動メモは <i data-ic=close data-ics=16></i> で消せます。</div>';
  h += secEnd();
  return h;
}
/* ===== 手動アクションログ：追加・削除 ===== */
let _lastFlowStaff = '';   // 次回の既定担当（同じ人が連続で記録するケースが多い）
function _flowCard(){ return state.cards.find(function(x){ return x.id === _editingCardId; }); }
/* いまの日時を datetime-local 用の "YYYY-MM-DDTHH:MM" に */
function _dtLocalNow(){
  const d = new Date(); d.setSeconds(0, 0);
  const p = function(n){ return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
/* 追加フォームの担当・時刻を読む（未入力なら担当なし＋今） */
function _flowMeta(){
  const staffEl = document.getElementById('cf-flow-staff');
  const whenEl  = document.getElementById('cf-flow-when');
  const staff = staffEl ? staffEl.value : '';
  let at = Date.now();
  if (whenEl && whenEl.value){ const t = new Date(whenEl.value).getTime(); if (!isNaN(t)) at = t; }
  return { staff: staff, at: at };
}
/* 時刻を今に戻すボタン */
function cfFlowNow(){ const el = document.getElementById('cf-flow-when'); if (el) el.value = _dtLocalNow(); }
function cfFlowAdd(label){
  const c = _flowCard(); if (!c) return;
  label = String(label || '').trim(); if (!label) return;
  const m = _flowMeta();
  if (!Array.isArray(c.log)) c.log = [];
  c.log.push({ label: label, at: m.at, manual: true, staff: m.staff || '' });
  _lastFlowStaff = m.staff || '';   // 次回の既定に記憶
  if (window.PitDB) PitDB.save();
  renderCardForm(c);
}
function cfFlowAddQuick(i){ cfFlowAdd(FLOW_QUICK[i]); }
function cfFlowAddCustom(){
  const inp = document.getElementById('cf-flow-input');
  if (!inp) return;
  const v = inp.value.trim();
  if (!v) { inp.focus(); return; }
  inp.value = '';
  cfFlowAdd(v);
}
function cfFlowDel(i){
  const c = _flowCard(); if (!c || !Array.isArray(c.log)) return;
  const l = c.log[i];
  if (!l || !l.manual) return;   // 手動記録のみ削除可（自動の工程ログは残す）
  c.log.splice(i, 1);
  if (window.PitDB) PitDB.save();
  renderCardForm(c);
}
window.cfFlowAdd = cfFlowAdd;
window.cfFlowAddQuick = cfFlowAddQuick;
window.cfFlowAddCustom = cfFlowAddCustom;
window.cfFlowDel = cfFlowDel;
window.cfFlowNow = cfFlowNow;

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
  let h = sec('作業チェック' + (wtLabel ? '（' + wtLabel + '）' : ''), '<i data-ic=wrench data-ics=16></i>');
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
  let h = sec('バックオフィス（返車後の後処理）', '<i data-ic=folder data-ics=16></i>');
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

/* ===== フェーズ移動ログ（誰が・いつ・どこから→どこへ）＋ phaseAt 更新 =====
   dnd.js（ドラッグ）／task.js（<i data-ic=chevLeft data-ics=16></i><i data-ic=chevRight data-ics=16></i>）から status を変える時に呼ぶ。
   card.phaseAt ＝ 今のフェーズに入った時刻（「このフェーズ何日目」のカウント起点）。 */
window.logPhaseMove = function(card, fromStatus, toStatus){
  /* 操作ログ（誰が・いつ・どのカードを動かしたか） */
  try{
    if (window.pitLog && card && fromStatus !== toStatus){
      var _sl = (typeof statusLabel === 'function') ? statusLabel : function(x){ return x; };
      pitLog('フェーズ移動 ' + _sl(fromStatus) + ' → ' + _sl(toStatus),
             { cardId: card.id, kind: 'phase', label: (card.customer? card.customer+' 様':'') + (card.car? ' / '+card.car:'') });
    }
  }catch(e){}
  if (!card) return;
  if (!Array.isArray(card.log)) card.log = [];
  var d = new Date();
  var pad = function(n){ return (n < 10 ? '0' : '') + n; };
  var entry = {
    type: 'phase',
    from: fromStatus || '',
    to:   toStatus || '',
    by:   (window.bnMe || ''),
    at:   d.getTime(),
    atTxt:(d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  };
  // 入力金額をフローにも記載（ポップアップで先にカードへ保存済み）。連絡中＝見積／パーツ待ち＝受注
  if (toStatus === 'contact'  && card.amountQuote != null && card.amountQuote !== ''){ entry.amount = card.amountQuote; entry.amountKind = '見積'; }
  if (toStatus === 'parts'    && card.amountOrder != null && card.amountOrder !== ''){ entry.amount = card.amountOrder; entry.amountKind = '受注'; }
  if (toStatus === 'workDone' && card.amountFinal != null && card.amountFinal !== ''){ entry.amount = card.amountFinal; entry.amountKind = '確定'; }
  card.log.push(entry);
  card.phaseAt = d.getTime();
};
