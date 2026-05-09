/* ========================================
   task.js
   タスクビュー（看板：列ごとにカードが並ぶ）
   ======================================== */

function renderTask(){
  // 看板タブ
  const tabs = document.getElementById('board-tabs');
  if (tabs){
    tabs.innerHTML = state.boards.map(b => `
      <div class="board-tab${b.id === state.currentBoardId ? ' active' : ''}"
           onclick="switchBoard('${b.id}')">${b.name}</div>
    `).join('');
  }

  // 看板の列
  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (!board) return;

  const cols = document.getElementById('kanban-cols');
  cols.innerHTML = board.cols.map(col => {
    const inCol = state.cards.filter(c =>
      c.status === col.id &&
      c.boardId === board.id
    );
    return `
      <div class="kanban-col">
        <div class="kanban-col-head">
          <span>${col.icon}</span>
          <span>${col.name}</span>
          <span class="count">${inCol.length}</span>
        </div>
        <div class="kanban-col-body">
          ${inCol.map(c => cardHtml(c)).join('') || '<div style="color:var(--text3);font-size:11px;text-align:center;padding:10px 0;">なし</div>'}
        </div>
      </div>
    `;
  }).join('');
}

function switchBoard(boardId){
  state.currentBoardId = boardId;
  renderTask();
}
