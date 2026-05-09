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

  const cols = document.getElementById('kanban-cols');
  cols.innerHTML = board.cols.map(col => {
    const inCol = state.cards.filter(c =>
      c.status === col.id && c.boardId === board.id
    );
    let colClass = 'kanban-col';
    if (col.terminal) colClass += ' terminal';
    if (col.side)     colClass += ' side';
    let html = '';
    html += '<div class="' + colClass + '">';
    html += '<div class="kanban-col-head">';
    html += '<span>' + col.icon + '</span>';
    html += '<span>' + col.name + '</span>';
    html += '<span class="count">' + inCol.length + '</span>';
    html += '</div>';
    html += '<div class="kanban-col-body">';
    if (inCol.length === 0){
      html += '<div class="kanban-empty">なし</div>';
    } else {
      html += inCol.map(c => cardHtml(c)).join('');
    }
    html += '</div></div>';
    return html;
  }).join('');
}

function switchBoard(boardId){
  state.currentBoardId = boardId;
  renderTask();
}
