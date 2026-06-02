/* ========================================
   reserve.js
   予約ビュー（当日／週／月／2ヶ月）
   ======================================== */

function renderReserve(){
  renderReserveNav();
  const range = state.reserveRange;
  if (range === 'day')    return renderReserveDay();
  if (range === 'week')   return renderReserveWeek();
  if (range === 'month')  return renderReserveMonth();
  if (range === '2month') return renderReserve2Month();
  renderReserveDay();
}

function renderReserveNav(){
  const label = document.getElementById('reserve-label');
  if (!label) return;
  const d = state.reserveDate;
  const range = state.reserveRange;
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

function renderReserveDay(){
  const list = document.getElementById('reserve-day-list');
  if (!list) return;
  list.style.display = '';
  document.getElementById('reserve-week').style.display = 'none';
  document.getElementById('reserve-month').style.display = 'none';
  document.getElementById('reserve-2month').style.display = 'none';

  const dateStr = ymd(state.reserveDate);
  const dow = state.reserveDate.getDay();
  const isClosed = state.settings.closedDow.includes(dow);

  const slots = [];
  for (let h = 9; h <= 18; h++){
    slots.push(String(h).padStart(2,'0') + ':00');
  }

  const todays = state.cards.filter(c =>
    c.reserveDate === dateStr &&
    c.status !== 'returned' && c.status !== 'workDone'
  );

  let html = '';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;color:var(--text2);">';
  if (isClosed) html += '<span style="color:var(--red);">🔴 定休日</span>　';
  html += '受付 ' + state.settings.openTime + ' 〜 ' + state.settings.cutoffTime + '　／　予約 ' + todays.length + ' 件';
  html += '</div></div>';

  slots.forEach(time => {
    const hh = time.slice(0,2);
    const inSlot = todays.filter(c => c.reserveTime.startsWith(hh));
    const cutoffH = parseInt(state.settings.cutoffTime.slice(0,2), 10);
    const slotH = parseInt(hh, 10);
    const isCutoff = slotH >= cutoffH;
    html += '<div class="reserve-slot' + (isClosed ? ' closed' : '') + '">';
    html += '<div class="reserve-slot-time">' + time;
    if (isCutoff) html += ' <span style="color:var(--red);font-size:10px;">受付終了</span>';
    html += '</div>';
    html += '<div class="reserve-slot-cards">';
    if (inSlot.length === 0){
      html += '<span style="color:var(--text3);font-size:11px;align-self:center;">空き</span>';
    } else {
      html += inSlot.map(c => cardHtml(c)).join('');
    }
    html += '</div></div>';
  });

  list.innerHTML = html;
}

function renderReserveWeek(){
  document.getElementById('reserve-day-list').style.display = 'none';
  document.getElementById('reserve-month').style.display = 'none';
  document.getElementById('reserve-2month').style.display = 'none';
  const wrap = document.getElementById('reserve-week');
  wrap.style.display = '';

  const start = startOfWeek(state.reserveDate);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  const todayStr = ymd(new Date());

  let html = '<div class="reserve-week-head"></div>';
  days.forEach(d => {
    const dStr = ymd(d);
    const dow = '日月火水木金土'[d.getDay()];
    const isToday = dStr === todayStr;
    const isClosed = state.settings.closedDow.includes(d.getDay());
    html += '<div class="reserve-week-head' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + '">';
    html += '<span class="dow">' + dow + '</span>';
    html += '<span class="day">' + (d.getMonth()+1) + '/' + d.getDate() + '</span>';
    html += '</div>';
  });

  for (let h = 9; h <= 18; h++){
    const hh = String(h).padStart(2,'0');
    html += '<div class="reserve-week-cell reserve-week-time">' + hh + ':00</div>';
    days.forEach(d => {
      const dStr = ymd(d);
      const isClosed = state.settings.closedDow.includes(d.getDay());
      const inCell = state.cards.filter(c =>
        c.reserveDate === dStr &&
        c.reserveTime.startsWith(hh) &&
        c.status !== 'returned' && c.status !== 'workDone'
      );
      html += '<div class="reserve-week-cell' + (isClosed ? ' closed' : '') + '">';
      inCell.forEach(c => {
        html += '<div class="reserve-week-event' + (c.urgent ? ' urgent' : '') + '"';
        html += ' onclick="openDetail(\'' + c.id + '\')"';
        html += ' title="' + c.reserveTime + ' ' + c.customer + '様 / ' + c.menu + '">';
        html += c.reserveTime + ' ' + c.customer;
        html += '</div>';
      });
      html += '</div>';
    });
  }

  wrap.innerHTML = html;
}

function renderReserveMonth(){
  document.getElementById('reserve-day-list').style.display = 'none';
  document.getElementById('reserve-week').style.display = 'none';
  document.getElementById('reserve-2month').style.display = 'none';
  const wrap = document.getElementById('reserve-month');
  wrap.style.display = '';
  wrap.innerHTML = monthGridCells(state.reserveDate);
}

function renderReserve2Month(){
  document.getElementById('reserve-day-list').style.display = 'none';
  document.getElementById('reserve-week').style.display = 'none';
  document.getElementById('reserve-month').style.display = 'none';
  const wrap = document.getElementById('reserve-2month');
  wrap.style.display = '';

  const m1 = new Date(state.reserveDate);
  const m2 = new Date(state.reserveDate); m2.setMonth(m2.getMonth()+1);

  let html = '';
  html += '<div>';
  html += '<div class="month-block-title">' + m1.getFullYear() + '年 ' + (m1.getMonth()+1) + '月</div>';
  html += '<div class="reserve-month">' + monthGridCells(m1) + '</div>';
  html += '</div>';
  html += '<div>';
  html += '<div class="month-block-title">' + m2.getFullYear() + '年 ' + (m2.getMonth()+1) + '月</div>';
  html += '<div class="reserve-month">' + monthGridCells(m2) + '</div>';
  html += '</div>';
  wrap.innerHTML = html;
}

function monthGridCells(refDate){
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
      c.reserveDate === dateStr &&
      c.status !== 'returned' && c.status !== 'workDone'
    );

    const visible = cardsOfDay.slice(0, 3);
    const remaining = cardsOfDay.length - visible.length;

    html += '<div class="reserve-month-cell' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + dowClass + '">';
    html += '<div class="day-num">' + dd + '</div>';
    visible.forEach(c => {
      html += '<div class="reserve-month-event' + (c.urgent ? ' urgent' : '') + '"';
      html += ' onclick="openDetail(\'' + c.id + '\')"';
      html += ' title="' + c.reserveTime + ' ' + c.customer + '様 / ' + c.menu + '">';
      html += c.reserveTime + ' ' + c.customer;
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

function startOfWeek(d){
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function reservePrev(){
  const range = state.reserveRange;
  const d = new Date(state.reserveDate);
  if (range === 'day')    d.setDate(d.getDate() - 1);
  if (range === 'week')   d.setDate(d.getDate() - 7);
  if (range === 'month')  d.setMonth(d.getMonth() - 1);
  if (range === '2month') d.setMonth(d.getMonth() - 1);
  state.reserveDate = d;
  renderReserve();
}
function reserveNext(){
  const range = state.reserveRange;
  const d = new Date(state.reserveDate);
  if (range === 'day')    d.setDate(d.getDate() + 1);
  if (range === 'week')   d.setDate(d.getDate() + 7);
  if (range === 'month')  d.setMonth(d.getMonth() + 1);
  if (range === '2month') d.setMonth(d.getMonth() + 1);
  state.reserveDate = d;
  renderReserve();
}

function cardHtml(c, opts){
  opts = opts || {};
  const wt = state.workTypes.find(w => w.id === c.workType);
  const dt = state.dropTypes.find(d => d.id === c.dropType);
  const accent = wt ? wt.color : 'var(--brand)';
  let html = '';
  html += '<div class="pit-card' + (c.urgent ? ' is-urgent' : '') + '" onclick="openDetail(\'' + c.id + '\')" style="min-width:200px;border-left-color:' + accent + ';">';
  html += '<div class="pc-line1">';
  html += '<span class="pc-time">' + (c.reserveTime || '') + '</span>';
  html += '<span class="pc-status" style="--sc:' + statusColor(c.status) + ';">' + statusLabel(c.status) + '</span>';
  if (c.urgent) html += '<span class="pc-urg">緊急</span>';
  html += '</div>';
  html += '<div class="pc-customer">' + (c.customer || '（未入力）') + ' 様</div>';
  html += '<div class="pc-car">' + (c.car || '') + (c.menu ? ' ／ ' + c.menu : '') + '</div>';
  html += '<div class="pc-tags">';
  if (wt) html += '<span class="tag-work" style="background:' + wt.color + '22;color:' + wt.color + ';border-color:' + wt.color + ';">' + wt.label + '</span>';
  if (dt) html += '<span class="pc-tag drop">' + dt.label + '</span>';
  if (c.needLoaner) html += '<span class="pc-tag soft loaner">代車</span>';
  if (c.needWash)   html += '<span class="pc-tag soft wash">洗車</span>';
  if (c.staff)      html += '<span class="pc-tag staff">' + c.staff + '</span>';
  html += '</div>';
  if (opts.kanban){
    html += '<div class="pc-kbtns" onclick="event.stopPropagation()">';
    html += '<button class="pc-kbtn" title="前の工程へ" onclick="advanceCard(\'' + c.id + '\',-1)">◀</button>';
    html += '<button class="pc-kbtn next" title="次の工程へ" onclick="advanceCard(\'' + c.id + '\',1)">次へ ▶</button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}
window.cardHtml = cardHtml;
