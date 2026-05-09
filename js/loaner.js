/* ========================================
   loaner.js
   代車ビュー（縦軸=代車、横軸=日付、セルに使用者バー）
   ======================================== */

function renderLoaner(){
  const grid = document.getElementById('loaner-grid');
  if (!grid) return;

  // 今日から14日分
  const today = new Date();
  const days = [];
  for (let i = 0; i < 14; i++){
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  let html = '';

  // 左上の空セル
  html += `<div class="loaner-cell loaner-head">代車</div>`;

  // 日付ヘッダ
  days.forEach(d => {
    const dow = '日月火水木金土'[d.getDay()];
    html += `<div class="loaner-cell loaner-head">${d.getMonth()+1}/${d.getDate()}<br><span style="font-size:10px;color:var(--text3);">${dow}</span></div>`;
  });

  // 各代車の行
  state.loaners.forEach(l => {
    html += `
      <div class="loaner-cell loaner-car-name" title="${l.plate}">
        <span style="font-size:14px;">🚙</span>
        <div>
          <div>${l.name}</div>
          <div style="font-size:10px;color:var(--text3);">${l.model}</div>
        </div>
      </div>
    `;
    days.forEach(d => {
      const dStr = ymd(d);
      const assign = state.loanerAssigns.find(a =>
        a.loanerId === l.id && a.fromDate <= dStr && a.toDate >= dStr
      );
      if (assign){
        const card = state.cards.find(c => c.id === assign.cardId);
        const isStart = assign.fromDate === dStr;
        html += `
          <div class="loaner-cell">
            ${isStart || (d.getDay() === 0)
              ? `<div class="loaner-bar" onclick="openDetail('${assign.cardId}')" title="${card ? card.customer + ' 様' : ''}">${card ? card.customer : ''}</div>`
              : `<div class="loaner-bar" style="opacity:.6">･･･</div>`
            }
          </div>
        `;
      } else {
        html += `<div class="loaner-cell"></div>`;
      }
    });
  });

  grid.innerHTML = html;
}
