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
  cols.innerHTML = board.cols.map(col => {
    const inCol = state.cards.filter(c =>
      c.status === col.id && c.boardId === board.id
    );
    let colClass = 'kanban-col';
    if (col.terminal) colClass += ' terminal';
    if (col.side)     colClass += ' side';
    const stage = stageColor(col.id);
    let html = '';
    html += '<div class="' + colClass + '" style="--stage:' + stage + ';">';
    html += '<div class="kanban-col-head">';
    html += '<span>' + col.icon + '</span>';
    html += '<span>' + col.name + '</span>';
    html += '<span class="count">' + inCol.length + '</span>';
    html += '</div>';
    html += '<div class="kanban-col-body" data-drop="status" data-drop-val="' + col.id + '">';
    if (inCol.length === 0){
      html += '<div class="kanban-empty">なし</div>';
    } else {
      html += inCol.map(c => cardHtml(c, { kanban: !col.side, compact: true })).join('');
    }
    html += '</div></div>';
    return html;
  }).join('');
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
    work:'#26a269', workDone:'#1db97a', scrap:'#6b7280',
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
    if (dir > 0){ c.status = flow[0]; if (window.logFlow) logFlow(c, statusLabel(flow[0]) + 'へ'); if (window.PitDB) PitDB.save(); _rerenderActiveBoard(); }
    return;
  }
  const ni = i + dir;
  if (ni < 0 || ni >= flow.length) return;
  c.status = flow[ni];
  if (window.logFlow) logFlow(c, statusLabel(flow[ni]) + 'へ');
  if (window.PitDB) PitDB.save();
  _rerenderActiveBoard();
}

function switchBoard(boardId){
  state.currentBoardId = boardId;
  renderTask();
}
