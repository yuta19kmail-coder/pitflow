/* ========================================
   work.js
   作業ビュー（PIT枠にカードがハマる）
   ======================================== */

function renderWork(){
  const grid = document.getElementById('pit-grid');
  if (!grid) return;

  // 今日 + 数日中の作業対象（status: work or workDone前）
  const today = ymd(new Date());
  const targets = state.cards.filter(c =>
    (c.status === 'work' || c.status === 'check' || c.status === 'estim' || c.status === 'parts')
  );

  grid.innerHTML = state.bays.map(bay => {
    const inBay = targets.filter(c => c.bayId === bay.id);
    return `
      <div class="pit-bay" data-drop="bay" data-drop-val="${bay.id}">
        <div class="pit-bay-head">
          <span class="bay-icon">${bay.icon}</span>
          <span>${bay.name}</span>
          <span class="bay-meta">${bay.note}</span>
        </div>
        ${inBay.length === 0
          ? '<div class="pit-bay-empty">空き枠</div>'
          : inBay.map(c => cardHtml(c, { compact: true })).join('')
        }
      </div>
    `;
  }).join('');

  // 未割当の作業もリストアップ
  const unassigned = targets.filter(c => !c.bayId);
  if (unassigned.length > 0){
    grid.innerHTML += `
      <div class="pit-bay" data-drop="bay" data-drop-val="" style="grid-column:1 / -1;border-style:solid;border-color:var(--border);">
        <div class="pit-bay-head">
          <span class="bay-icon">📥</span>
          <span>未割当（PIT枠未指定）</span>
          <span class="bay-meta">${unassigned.length} 件</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${unassigned.map(c => cardHtml(c, { compact: true })).join('')}
        </div>
      </div>
    `;
  }
}
