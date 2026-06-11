/* ========================================
   work.js
   Pitリスト（PIT配置図にカードがハマる）
   ----------------------------------------
   エディタ（pit-floor.js）で作った工場の平面図そのものを読み取り専用で描画し、
   各PIT枠の固定スロットに実カード（state.cards）をはめ込む。
   ・対象＝作業工程のカード（点検待ち〜作業待ち）。bayId で枠に割り当て。
   ・ドラッグで枠へ割り当て（dnd.js の data-drop="bay"）。未割当は下のトレイに並ぶ。
   ======================================== */

var WORK_STATUSES = ['check', 'estim', 'contact', 'parts', 'work'];

function _workTargets(){
  return state.cards.filter(function(c){ return WORK_STATUSES.indexOf(c.status) >= 0; });
}

function renderWork(){
  var grid  = document.getElementById('pitlist-grid');
  var stage = document.getElementById('pitlist-stage');
  if (!grid) return;

  var targets = _workTargets();

  // 配置図エディタの枠が無い（未設定）場合は案内
  if (!window.PitFloorView || !Array.isArray(state.bays) || state.bays.length === 0){
    grid.style.width = ''; grid.style.height = '';
    grid.innerHTML = '<div class="pitlist-nofloor">まだPIT配置図がありません。<br>右上の「🏭 配置図を編集」から工場の平面図を作るか、保存済みの配置図を📂読み込みしてください。</div>';
    _renderUnassigned(targets, true);
    return;
  }

  // 枠ごとにカードをまとめる
  var byBay = {};
  targets.forEach(function(c){ if (c.bayId){ (byBay[c.bayId] = byBay[c.bayId] || []).push(c); } });

  PitFloorView.render(grid, { cardsByBay: byBay, stage: stage });

  // 未割当（PIT枠未指定）を下のトレイへ
  var unassigned = targets.filter(function(c){ return !c.bayId; });
  _renderUnassigned(unassigned);
}

function _renderUnassigned(list, hideIfEmpty){
  var tray = document.getElementById('pitlist-unassigned');
  if (!tray) return;
  if (!list || list.length === 0){
    tray.innerHTML = hideIfEmpty ? '' :
      '<div class="pitlist-tray-head"><span>📥 未割当</span><span class="pitlist-tray-meta">なし（作業工程のカードはすべて枠に配置済み）</span></div>';
    return;
  }
  var h = '<div class="pitlist-tray-head"><span>📥 未割当（PIT枠未指定）</span><span class="pitlist-tray-meta">' + list.length + ' 件・ドラッグで枠へ</span></div>';
  h += '<div class="pitlist-tray-body" data-drop="bay" data-drop-val="">';
  h += list.map(function(c){ return cardHtml(c, { compact: true }); }).join('');
  h += '</div>';
  tray.innerHTML = h;
}
