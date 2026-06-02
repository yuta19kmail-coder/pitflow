/* ========================================
   return.js
   返車ビュー（当日／週／月／2ヶ月）
   ※ reserve.js のミラー実装。フィルタは returnDate で行う
   ======================================== */

function renderReturn(){
  renderReturnNav();
  const range = state.returnRange;
  if (range === 'day')    return renderReturnDay();
  if (range === 'week')   return renderReturnWeek();
  if (range === 'month')  return renderReturnMonth();
  if (range === '2month') return renderReturn2Month();
  renderReturnDay();
}

function renderReturnNav(){
  const label = document.getElementById('return-label');
  if (!label) return;
  const d = state.returnDate;
  const range = state.returnRange;
  if (range === 'day'){
    const dow = '日月火水木金土'[d.getDay()];
    label.textContent = d.getFullYear() + '年 ' + (d.getMonth()+1) + '月 ' + d.getDate() + '日 (' + dow + ')';
  } else if (range === 'week'){
    const start = startOfWeek(d);
    const end = addDays(start, 6);
    label.textContent = (start.getMonth()+1) + '/' + start.getDate() + ' 〜 ' + (end.getMonth()+1) + '/' + end.getDate();
  } else if (range === 'month'){
    label.textContent = d.getFullYear() + '年 ' + (d.getMonth()+1) + '月';
  } else if (range === '2month'){
    const next = new Date(d); next.setMonth(next.getMonth()+1);
    label.textContent = d.getFullYear() + '年 ' + (d.getMonth()+1) + '月 〜 ' + (next.getMonth()+1) + '月';
  }
}

function renderReturnDay(){
  const list = document.getElementById('return-day-list');
  if (!list) return;
  list.style.display = '';
  document.getElementById('return-week').style.display = 'none';
  document.getElementById('return-month').style.display = 'none';
  document.getElementById('return-2month').style.display = 'none';

  const dateStr = ymd(state.returnDate);
  const dow = state.returnDate.getDay();
  const isClosed = state.settings.closedDow.includes(dow);

  const slots = [];
  for (let h = 9; h <= 18; h++){
    slots.push(String(h).padStart(2,'0') + ':00');
  }

  const todays = state.cards.filter(c =>
    c.returnDate === dateStr && c.status !== 'returned'
  );

  let html = '';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;color:var(--text2);">';
  if (isClosed) html += '<span style="color:var(--red);">🔴 定休日</span>　';
  html += '本日の返車予定 ' + todays.length + ' 件';
  html += '</div></div>';

  if (todays.length === 0){
    html += '<div style="text-align:center;color:var(--text3);padding:30px;">本日の返車予定はありません</div>';
  } else {
    const tkey = c => (c.returnTime || c.reserveTime || '');
    slots.forEach(time => {
      const hh = time.slice(0,2);
      const inSlot = todays.filter(c => tkey(c).startsWith(hh));
      html += '<div class="reserve-slot' + (isClosed ? ' closed' : '') + '">';
      html += '<div class="reserve-slot-time">' + time + '〜</div>';
      html += '<div class="reserve-slot-cards" data-drop="returnTime" data-drop-val="' + time + '">';
      if (inSlot.length === 0){
        html += '<span style="color:var(--text3);font-size:11px;align-self:center;">空き</span>';
      } else {
        html += inSlot.map(c => returnCardHtml(c)).join('');
      }
      html += '</div></div>';
    });
    // 時刻未定のカードを末尾に（ここへドロップで時刻を未定に戻せる）
    const noTime = todays.filter(c => !tkey(c).match(/^\d/));
    if (noTime.length > 0){
      html += '<div class="reserve-slot"><div class="reserve-slot-time">時刻未定</div><div class="reserve-slot-cards" data-drop="returnTime" data-drop-val="">';
      html += noTime.map(c => returnCardHtml(c)).join('');
      html += '</div></div>';
    }
  }

  list.innerHTML = html;
}

function renderReturnWeek(){
  document.getElementById('return-day-list').style.display = 'none';
  document.getElementById('return-month').style.display = 'none';
  document.getElementById('return-2month').style.display = 'none';
  const wrap = document.getElementById('return-week');
  wrap.style.display = '';

  const start = startOfWeek(state.returnDate);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  const todayStr = ymd(new Date());

  let html = '<div class="reserve-week-head"></div>';
  days.forEach(d => {
    const dStr = ymd(d);
    const dow = '日月火水木金土'[d.getDay()];
    const isToday = dStr === todayStr;
    const isClosed = state.settings.closedDow.includes(d.getDay());
    const cnt = state.cards.filter(c =>
      c.returnDate === dStr && c.status !== 'returned'
    ).length;
    html += '<div class="reserve-week-head' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + '">';
    html += '<span class="dow">' + dow + '</span>';
    html += '<span class="day">' + (d.getMonth()+1) + '/' + d.getDate() + '</span>';
    if (cnt > 0) html += '<span style="font-size:10px;color:var(--green);font-weight:600;">' + cnt + '台</span>';
    html += '</div>';
  });

  for (let h = 9; h <= 18; h++){
    const hh = String(h).padStart(2,'0');
    html += '<div class="reserve-week-cell reserve-week-time">' + hh + ':00</div>';
    days.forEach(d => {
      const dStr = ymd(d);
      const isClosed = state.settings.closedDow.includes(d.getDay());
      const inCell = state.cards.filter(c =>
        c.returnDate === dStr &&
        (c.reserveTime || '').startsWith(hh) &&
        c.status !== 'returned'
      );
      html += '<div class="reserve-week-cell' + (isClosed ? ' closed' : '') + '">';
      inCell.forEach(c => {
        html += '<div class="reserve-week-event return' + (c.urgent ? ' urgent' : '') + '"';
        html += ' onclick="openDetail(\'' + c.id + '\')"';
        html += ' title="' + c.customer + '様 / ' + c.menu + '">';
        html += c.customer;
        html += '</div>';
      });
      html += '</div>';
    });
  }

  wrap.innerHTML = html;
}

function renderReturnMonth(){
  document.getElementById('return-day-list').style.display = 'none';
  document.getElementById('return-week').style.display = 'none';
  document.getElementById('return-2month').style.display = 'none';
  const wrap = document.getElementById('return-month');
  wrap.style.display = '';
  wrap.innerHTML = monthGridCellsReturn(state.returnDate);
}

function renderReturn2Month(){
  document.getElementById('return-day-list').style.display = 'none';
  document.getElementById('return-week').style.display = 'none';
  document.getElementById('return-month').style.display = 'none';
  const wrap = document.getElementById('return-2month');
  wrap.style.display = '';

  const m1 = new Date(state.returnDate);
  const m2 = new Date(state.returnDate); m2.setMonth(m2.getMonth()+1);

  let html = '';
  html += '<div>';
  html += '<div class="month-block-title">' + m1.getFullYear() + '年 ' + (m1.getMonth()+1) + '月</div>';
  html += '<div class="reserve-month">' + monthGridCellsReturn(m1) + '</div>';
  html += '</div>';
  html += '<div>';
  html += '<div class="month-block-title">' + m2.getFullYear() + '年 ' + (m2.getMonth()+1) + '月</div>';
  html += '<div class="reserve-month">' + monthGridCellsReturn(m2) + '</div>';
  html += '</div>';
  wrap.innerHTML = html;
}

function monthGridCellsReturn(refDate){
  const y = refDate.getFullYear();
  const mo = refDate.getMonth();
  const first = new Date(y, mo, 1);
  const last = new Date(y, mo+1, 0);
  const startDow = first.getDay();
  const totalDays = last.getDate();
  const todayStr = ymd(new Date());

  let html = '';
  ['日','月','火','水','木','金','土'].forEach(d => {
    html += '<div class="reserve-month-cell dow">' + d + '</div>';
  });

  for (let i = 0; i < startDow; i++){
    const d = new Date(y, mo, i - startDow + 1);
    html += '<div class="reserve-month-cell other-month"><div class="day-num">' + d.getDate() + '</div></div>';
  }

  for (let dd = 1; dd <= totalDays; dd++){
    const dateObj = new Date(y, mo, dd);
    const dateStr = ymd(dateObj);
    const dow = dateObj.getDay();
    const isToday = dateStr === todayStr;
    const isClosed = state.settings.closedDow.includes(dow);
    let dowClass = '';
    if (dow === 0) dowClass = ' sun';
    if (dow === 6) dowClass = ' sat';

    const cardsOfDay = state.cards.filter(c =>
      c.returnDate === dateStr && c.status !== 'returned'
    );

    const visible = cardsOfDay.slice(0, 3);
    const remaining = cardsOfDay.length - visible.length;

    html += '<div class="reserve-month-cell' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + dowClass + '">';
    html += '<div class="day-num">' + dd + '</div>';
    visible.forEach(c => {
      html += '<div class="reserve-month-event return' + (c.urgent ? ' urgent' : '') + '"';
      html += ' onclick="openDetail(\'' + c.id + '\')"';
      html += ' title="' + c.customer + '様 / ' + c.menu + '">';
      html += c.customer;
      html += '</div>';
    });
    if (remaining > 0){
      html += '<div class="reserve-month-more">+' + remaining + ' 件</div>';
    }
    html += '</div>';
  }

  const cellsUsed = startDow + totalDays;
  const trailing = (7 - (cellsUsed % 7)) % 7;
  for (let i = 1; i <= trailing; i++){
    const d = new Date(y, mo+1, i);
    html += '<div class="reserve-month-cell other-month"><div class="day-num">' + d.getDate() + '</div></div>';
  }

  return html;
}

function returnPrev(){
  const range = state.returnRange;
  const d = new Date(state.returnDate);
  if (range === 'day')    d.setDate(d.getDate() - 1);
  if (range === 'week')   d.setDate(d.getDate() - 7);
  if (range === 'month')  d.setMonth(d.getMonth() - 1);
  if (range === '2month') d.setMonth(d.getMonth() - 1);
  state.returnDate = d;
  renderReturn();
}
function returnNext(){
  const range = state.returnRange;
  const d = new Date(state.returnDate);
  if (range === 'day')    d.setDate(d.getDate() + 1);
  if (range === 'week')   d.setDate(d.getDate() + 7);
  if (range === 'month')  d.setMonth(d.getMonth() + 1);
  if (range === '2month') d.setMonth(d.getMonth() + 1);
  state.returnDate = d;
  renderReturn();
}
function returnToday(){
  state.returnDate = new Date();
  renderReturn();
}

function returnCardHtml(c){
  const wt = state.workTypes.find(w => w.id === c.workType);
  const dt = state.dropTypes.find(d => d.id === c.dropType);
  let html = '';
  html += '<div class="pit-card return" draggable="true" data-card-id="' + c.id + '" onclick="openDetail(\'' + c.id + '\')" style="min-width:200px;border-left-color:var(--green);">';
  html += '<div class="pc-line1">';
  html += '<span style="color:var(--green);font-weight:600;">' + (c.reserveTime || '時刻未定') + '</span>';
  html += '<span style="color:var(--text3);">' + statusLabel(c.status) + '</span>';
  html += '</div>';
  html += '<div class="pc-customer">' + c.customer + ' 様</div>';
  html += '<div class="pc-car">' + c.car + ' ／ ' + c.menu + '</div>';
  html += '<div class="pc-tags">';
  if (dt) html += '<span class="pc-tag">' + dt.label + '</span>';
  if (wt) html += '<span class="pc-tag">' + wt.label + '</span>';
  if (c.needWash)   html += '<span class="pc-tag" style="background:rgba(59,130,246,.1);color:#3b82f6;border-color:#3b82f6;">洗車</span>';
  if (c.needLoaner) html += '<span class="pc-tag staff">代車返却</span>';
  html += '</div></div>';
  return html;
}
