/* ========================================
   result.js
   実績ビュー（カレンダーベースで完了カードを表示）
   ======================================== */

function renderResult(){
  const cal = document.getElementById('result-cal');
  if (!cal) return;

  const m = state.resultMonth;
  const y = m.getFullYear();
  const mo = m.getMonth();

  document.getElementById('result-month-label').textContent = `${y}年 ${mo+1}月`;

  // 月初の曜日と月末
  const first = new Date(y, mo, 1);
  const last  = new Date(y, mo+1, 0);
  const startDow = first.getDay();
  const totalDays = last.getDate();

  let html = '';

  // 曜日ヘッダー
  ['日','月','火','水','木','金','土'].forEach(d =>
    html += `<div class="result-cell dow">${d}</div>`
  );

  // 月初の前空きセル
  for (let i = 0; i < startDow; i++){
    html += `<div class="result-cell"></div>`;
  }

  // 各日
  for (let d = 1; d <= totalDays; d++){
    const dateStr = `${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cardsOfDay = state.cards.filter(c =>
      (c.completedAt === dateStr) &&
      (c.status === 'workDone' || c.status === 'returned')
    );
    const hol = (window.Holidays && Holidays.name(dateStr)) || null;
    html += `
      <div class="result-cell${hol ? ' holiday' : ''}">
        <div class="day-num">${d}</div>
        ${hol ? `<div class="hol-name" title="${hol}">${hol}</div>` : ''}
        ${cardsOfDay.map(c => `
          <div class="result-card${c.status === 'returned' ? ' returned' : ''}"
               onclick="openDetail('${c.id}')"
               title="${c.customer} 様 / ${c.menu}">
            ${c.status === 'returned' ? '✅' : '🔧'} ${c.customer}
          </div>
        `).join('')}
      </div>
    `;
  }

  cal.innerHTML = html;
}
