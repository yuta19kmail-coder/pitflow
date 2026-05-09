/* ========================================
   reserve.js
   予約ビュー（モック・当日タイムスロット表示）
   ======================================== */

function renderReserve(){
  const list = document.getElementById('reserve-day-list');
  if (!list) return;

  const dateStr = ymd(state.reserveDate);
  const dow = state.reserveDate.getDay();
  const isClosed = state.settings.closedDow.includes(dow);

  // 9:00〜18:00を1時間刻み
  const slots = [];
  for (let h = 9; h <= 18; h++){
    slots.push(String(h).padStart(2,'0') + ':00');
  }

  // 各スロットに該当する予約を割り振る
  const todays = state.cards.filter(c =>
    c.reserveDate === dateStr &&
    c.status !== 'returned' && c.status !== 'workDone'
  );

  let html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <div style="font-size:15px;font-weight:600;">
        ${state.reserveDate.getFullYear()}年 ${state.reserveDate.getMonth()+1}月 ${state.reserveDate.getDate()}日
        (${'日月火水木金土'[dow]})
        ${isClosed ? '<span style="color:var(--red);margin-left:8px;">🔴 定休日</span>' : ''}
      </div>
      <div style="margin-left:auto;font-size:12px;color:var(--text3);">
        受付 ${state.settings.openTime} 〜 ${state.settings.cutoffTime} ／ 予約 ${todays.length} 件
      </div>
    </div>
  `;

  slots.forEach(time => {
    const inSlot = todays.filter(c => c.reserveTime.startsWith(time.slice(0,2)));
    const cutoffH = parseInt(state.settings.cutoffTime.slice(0,2),10);
    const slotH = parseInt(time.slice(0,2),10);
    const isCutoff = slotH >= cutoffH;
    html += `
      <div class="reserve-slot${isClosed ? ' closed' : ''}">
        <div class="reserve-slot-time">${time}${isCutoff ? ' <span style="color:var(--red);font-size:10px;">受付終了</span>' : ''}</div>
        <div class="reserve-slot-cards">
          ${inSlot.map(c => cardHtml(c)).join('') || '<span style="color:var(--text3);font-size:11px;align-self:center;">空き</span>'}
        </div>
      </div>
    `;
  });

  list.innerHTML = html;
}

function cardHtml(c){
  return `
    <div class="pit-card" onclick="openDetail('${c.id}')" style="min-width:200px;">
      <div class="pc-line1">
        <span class="pc-time">${c.reserveTime}</span>
        <span style="color:var(--text3);">${statusLabel(c.status)}</span>
      </div>
      <div class="pc-customer">${c.customer} 様</div>
      <div class="pc-car">${c.car} ／ ${c.menu}</div>
      <div class="pc-tags">
        ${c.staff ? `<span class="pc-tag staff">${c.staff}</span>` : ''}
        ${c.urgent ? `<span class="pc-tag urgent">緊急</span>` : ''}
      </div>
    </div>
  `;
}

// グローバル化（他ビューからも使う）
window.cardHtml = cardHtml;
