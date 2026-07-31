/* ========================================
   task.js
   タスクビュー（看板：列ごとにカードが並ぶ）
   ======================================== */

function renderTask(){
  const tabs = document.getElementById('board-tabs');
  if (tabs){
    tabs.innerHTML = state.boards.map(b =>
      '<div class="board-tab' + (b.id === state.currentBoardId ? ' active' : '') + '"' +
      ' onclick="switchBoard(\'' + b.id + '\')">' + b.name + '</div>'
    ).join('');
  }

  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (!board) return;
  _renderKanban(board, document.getElementById('kanban-cols'));
}

/* 課別タスク看板（board固定・タブなし）。1課＝国産(default)／2課＝輸入(import） */
function renderCourse(boardId, colsElId){
  const board = state.boards.find(b => b.id === boardId);
  _renderKanban(board, document.getElementById(colsElId));
}

/* 看板の列＋カードを描画（renderTask／renderCourse 共通） */
function _renderKanban(board, cols){
  if (!board || !cols) return;

  function renderCol(col){
    // returnStage（完TEL待ち/返車待ち）が付いたカードは盤面から外れ、返車ビューへ移る
    const inCol = state.cards.filter(c => c.status === col.id && c.boardId === board.id && !c.returnStage);
    const hasTD = !col.terminal && !col.side;   // 試運転エリアを付ける＝完了以外のフロー列
    let colClass = 'kanban-col';
    if (col.terminal) colClass += ' terminal';
    if (col.side)     colClass += ' side';
    const stage = stageColor(col.id);
    let html = '<div class="' + colClass + '" style="--stage:' + stage + ';">';
    html += '<div class="kanban-col-head"><span>' + icoE(col.icon) + '</span><span>' + col.name + '</span><span class="count">' + inCol.length + '</span></div>';
    if (hasTD){
      const main = inCol.filter(c => !c.testDrive);
      const td   = inCol.filter(c => c.testDrive);
      html += '<div class="kanban-col-body" data-drop="status" data-drop-val="' + col.id + '">';
      html += main.length ? main.map(c => cardHtml(c, { kanban:true, compact:true })).join('') : '<div class="kanban-empty">なし</div>';
      html += '</div>';
      // 試運転を「選ぶ」2枠（上＝通常/無タイトル・下＝🚗試運転）。どちらに落とすかで試運転の要否が直感的に分かる
      html += '<div class="kanban-td2">';
      html += '<div class="kanban-td2-box kanban-td2-normal" data-drop="status" data-drop-val="' + col.id + '"><div class="kanban-td2-ph">ここにドラッグ</div></div>';
      html += '<div class="kanban-td2-box kanban-td2-test' + (td.length ? ' has' : '') + '" data-drop="testdrive" data-drop-val="' + col.id + '">';
      html += '<div class="kanban-td2-lb"><i data-ic=car data-ics=16></i> 試運転</div>';
      html += td.length ? td.map(c => cardHtml(c, { kanban:true, compact:true })).join('') : '<div class="kanban-td2-ph">ここにドラッグ</div>';
      html += '</div>';
      html += '</div>';
    } else {
      html += '<div class="kanban-col-body" data-drop="status" data-drop-val="' + col.id + '">';
      html += inCol.length ? inCol.map(c => cardHtml(c, { kanban: !col.side, compact:true })).join('') : '<div class="kanban-empty">なし</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  const mainCols = board.cols.filter(c => !c.side);
  const sideCols = board.cols.filter(c => c.side);
  let out = mainCols.map(renderCol).join('');
  if (sideCols.length) out += '<div class="kanban-side-stack">' + sideCols.map(renderCol).join('') + '</div>';
  cols.innerHTML = out;
}

/* ◀▶やボード操作後の再描画先＝今見ているビューに合わせる（課ビューでも正しく更新） */
function _rerenderActiveBoard(){
  if (state.currentView === 'course1')      renderCourse('default', 'kanban-cols-1');
  else if (state.currentView === 'course2') renderCourse('import',  'kanban-cols-2');
  else renderTask();
}

function stageColor(id){
  const map = {
    check:'#3b82f6', estim:'#f59e0b', contact:'#a855f7', parts:'#06b6d4',
    work:'#26a269', workDone:'#1db97a', scrap:'#6b7280', outsource:'#f59e0b',
  };
  return map[id] || 'var(--brand)';
}

/* カードを前後の工程へ移動（◀／次へ▶） */
function advanceCard(cardId, dir){
  const c = state.cards.find(x => x.id === cardId);
  if (!c) return;
  const board = state.boards.find(b => b.id === c.boardId)
             || state.boards.find(b => b.id === state.currentBoardId);
  if (!board) return;
  const flow = board.cols.filter(col => !col.side).map(col => col.id);
  let i = flow.indexOf(c.status);
  if (i < 0){
    if (dir > 0){ const _from = c.status; c.status = flow[0];
      if (window.logPhaseMove) logPhaseMove(c, _from, flow[0]);
      else if (window.logFlow) logFlow(c, statusLabel(flow[0]) + 'へ');
      if (window.PitDB) PitDB.save(); _rerenderActiveBoard(); }
    return;
  }
  const ni = i + dir;
  if (ni < 0 || ni >= flow.length) return;
  const _from = c.status;
  const _to = flow[ni];
  const _commit = function(){
    c.status = _to;
    if (window.logPhaseMove) logPhaseMove(c, _from, _to);
    else if (window.logFlow) logFlow(c, statusLabel(_to) + 'へ');
    if (window.PitDB) PitDB.save();
    _rerenderActiveBoard();
  };
  // 見積中→連絡中／連絡中→パーツ待ち は入力ポップアップを挟む
  if (window.PitPhasePopup && PitPhasePopup.maybeIntercept(c, _from, _to, _commit)) return;
  _commit();
}

function switchBoard(boardId){
  state.currentBoardId = boardId;
  renderTask();
}
