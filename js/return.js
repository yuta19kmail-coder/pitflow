/* ========================================
   return.js
   返車ビュー（当日／週／月／2ヶ月）
   ※ reserve.js のミラー実装。フィルタは returnDate で行う
   ======================================== */

function renderReturn(){
  renderReturnNav();
  const range = state.returnRange;
  if (range !== 'tbd'){ const _t = document.getElementById('return-tbd'); if (_t) _t.style.display = 'none'; }
  if (range === 'day')    return renderReturnDay();
  if (range === 'week')   return renderReturnWeek();
  if (range === 'month')  return renderReturnMonth();
  if (range === '2month') return renderReturn2Month();
  if (range === 'tbd')    return renderReturnTbd();
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
  const holDay = (window.Holidays && Holidays.name(dateStr)) || null;
  if (holDay) html += '<span class="hol-badge">🎌 ' + holDay + '</span>　';
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
        html += inSlot.map(c => cardHtml(c, { compact: true })).join('');
      }
      html += '</div></div>';
    });
    // 時刻未定のカードを末尾に（ここへドロップで時刻を未定に戻せる）
    const noTime = todays.filter(c => !tkey(c).match(/^\d/));
    if (noTime.length > 0){
      html += '<div class="reserve-slot"><div class="reserve-slot-time">時刻未定</div><div class="reserve-slot-cards" data-drop="returnTime" data-drop-val="">';
      html += noTime.map(c => cardHtml(c, { compact: true })).join('');
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
    const hol = (window.Holidays && Holidays.name(dStr)) || null;
    html += '<div class="reserve-week-head' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (hol ? ' holiday' : '') + '">';
    html += '<span class="dow">' + dow + '</span>';
    html += '<span class="day">' + (d.getMonth()+1) + '/' + d.getDate() + '</span>';
    if (hol) html += '<span class="hol" title="' + hol + '">' + hol + '</span>';
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
        (c.returnTime || c.reserveTime || '').startsWith(hh) &&
        c.status !== 'returned'
      );
      html += '<div class="reserve-week-cell' + (isClosed ? ' closed' : '') + '" data-drop="returnDateTime" data-drop-val="' + dStr + '|' + hh + ':00">';
      inCell.forEach(c => { html += (window.weekMiniCard ? weekMiniCard(c) : ''); });
      html += '</div>';
    });
  }

  wrap.innerHTML = html;
}

/* 月ビュー（v0.45.0）＝入庫(予約)ビューと同じ日付リスト型（左に日付・右にその日の返車を時刻順・下へ無限スクロール）。
   reserve.js の renderReserveMonth のミラー。フィルタは returnDate。 */
function renderReturnMonth(){
  document.getElementById('return-day-list').style.display = 'none';
  document.getElementById('return-week').style.display = 'none';
  document.getElementById('return-2month').style.display = 'none';
  const wrap = document.getElementById('return-month');
  wrap.classList.add('rml-host');
  wrap.style.display = '';

  const base = new Date(state.returnDate.getFullYear(), state.returnDate.getMonth(), 1);
  window._rmlStartR = base;
  window._rmlNR = 42;   // 初期6週間ぶん
  wrap.innerHTML = '<div class="rml-scroll" id="rml-scroll-r"><div id="rml-list-r">' + _rmlRowsReturn(0, window._rmlNR) + '</div></div>';

  const sc = document.getElementById('rml-scroll-r');
  if (sc){
    sc.addEventListener('scroll', function(){
      if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 320){
        const from = window._rmlNR;
        window._rmlNR += 21;
        const list = document.getElementById('rml-list-r');
        if (list) list.insertAdjacentHTML('beforeend', _rmlRowsReturn(from, window._rmlNR));
      }
    });
    const t = sc.querySelector('.rml-date.today');
    if (t) sc.scrollTop = Math.max(0, t.closest('.rml-row').offsetTop - 8);
  }
}

function _rmlRowsReturn(from, to){
  const todayStr = ymd(new Date());
  let html = '';
  for (let i = from; i < to; i++){
    const d = addDays(window._rmlStartR, i);
    const ds = ymd(d);
    if (d.getDate() === 1 || i === 0){
      html += '<div class="rml-mhead">' + d.getFullYear() + '年 ' + (d.getMonth()+1) + '月</div>';
    }
    const dow = d.getDay();
    const isClosed = state.settings.closedDow.includes(dow);
    const hol = (window.Holidays && Holidays.name(ds)) || null;
    const cardsOfDay = state.cards
      .filter(c => c.returnDate === ds && c.status !== 'returned')
      .sort((a, b) => ((a.returnTime || a.reserveTime || '99:99') < (b.returnTime || b.reserveTime || '99:99') ? -1 : 1));

    let dCls = '';
    if (ds === todayStr) dCls += ' today';
    if (dow === 0 || hol) dCls += ' red';
    else if (dow === 6) dCls += ' sat';

    html += '<div class="rml-row' + (isClosed ? ' closed' : '') + '">';
    html += '<div class="rml-date' + dCls + '">' + (d.getMonth()+1) + '/' + d.getDate() + '<span>' + '日月火水木金土'[dow] + (ds === todayStr ? '・今日' : '') + '</span>'
         + (hol ? '<span class="rml-hol">🎌' + hol + '</span>' : '')
         + (isClosed ? '<span class="rml-hol">定休</span>' : '') + '</div>';
    html += '<div class="rml-cards" data-drop="returnDate" data-drop-val="' + ds + '">';
    if (!cardsOfDay.length){
      html += '<span class="rml-empty">' + (isClosed ? '休' : '—') + '</span>';
    } else {
      cardsOfDay.forEach(c => {
        const tt = (c.returnTime || c.reserveTime || '--:--');
        html += '<div class="rml-ev return' + (c.urgent ? ' urgent' : '') + '" draggable="true" data-card-id="' + c.id + '"'
             + ' onclick="openDetail(\'' + c.id + '\')"'
             + ' title="' + tt + ' ' + (c.customer || '') + '様 / ' + (c.car || '') + (c.menu ? ' / ' + c.menu : '') + '">'
             + '<b>' + tt + '</b> ' + (c.customer || '（未入力）') + (c.car ? ' ' + c.car : '')
             + (c.needLoaner ? '<span class="rml-wt">代車返却</span>' : '')
             + '</div>';
      });
    }
    html += '</div></div>';
  }
  return html;
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

    const hol = (window.Holidays && Holidays.name(dateStr)) || null;
    html += '<div class="reserve-month-cell' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (hol ? ' holiday' : '') + dowClass + '" data-drop="returnDate" data-drop-val="' + dateStr + '">';
    html += '<div class="day-num">' + dd + '</div>';
    if (hol) html += '<div class="hol-name" title="' + hol + '">' + hol + '</div>';
    visible.forEach(c => {
      const tt = (c.returnTime || c.reserveTime || '');
      html += '<div class="reserve-month-event return' + (c.urgent ? ' urgent' : '') + '" draggable="true" data-card-id="' + c.id + '"';
      html += ' onclick="openDetail(\'' + c.id + '\')"';
      html += ' title="' + tt + ' ' + c.customer + '様 / ' + (c.car || '') + ' / ' + c.menu + '">';
      html += (tt ? tt + ' ' : '') + c.customer + (c.car ? ' ' + c.car : '');
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

/* v0.45.0：返車カードを入庫(予約)ビューと同じリッチカードに統一。
   返車時刻を表示し、左アクセントは緑（返車アイデンティティを維持）。 */
function returnCardHtml(c){
  return (typeof cardHtml === 'function') ? cardHtml(c, { returnView: true }) : '';
}
