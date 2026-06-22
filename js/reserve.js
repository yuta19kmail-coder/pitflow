/* ========================================
   reserve.js
   予約ビュー（当日／週／月／2ヶ月）
   ======================================== */

function renderReserve(){
  renderReserveNav();
  const range = state.reserveRange;
  if (range !== 'tbd'){ const _t = document.getElementById('reserve-tbd'); if (_t) _t.style.display = 'none'; }
  if (range === 'day')    return renderReserveDay();
  if (range === 'week')   return renderReserveWeek();
  if (range === 'month')  return renderReserveMonth();
  if (range === '2month') return renderReserve2Month();
  if (range === 'tbd')    return renderReserveTbd();
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
  const _rt = document.getElementById('reserve-tbd'); if (_rt) _rt.style.display = 'none';

  const dateStr = ymd(state.reserveDate);
  const dow = state.reserveDate.getDay();
  const isClosed = state.settings.closedDow.includes(dow);

  const slots = [];
  for (let h = 9; h <= 18; h++){
    slots.push(String(h).padStart(2,'0') + ':00');
  }

  const todays = state.cards.filter(c =>
    c.reserveDate === dateStr && c.status === 'reserved'   // 入庫済み以降は予約から外れる
  );

  let html = '';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;color:var(--text2);">';
  if (isClosed) html += '<span style="color:var(--red);">🔴 定休日</span>　';
  const holDay = (window.Holidays && Holidays.name(dateStr)) || null;
  if (holDay) html += '<span class="hol-badge">🎌 ' + holDay + '</span>　';
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
    html += '<div class="reserve-slot-cards" data-drop="reserveTime" data-drop-val="' + time + '">';
    if (inSlot.length === 0){
      html += '<span style="color:var(--text3);font-size:11px;align-self:center;">空き</span>';
    } else {
      html += inSlot.map(c => cardHtml(c, { compact: true })).join('');
    }
    html += '</div></div>';
  });

  list.innerHTML = html;
}

/* 週ビュー用ミニカード（C案）＝当日タブのタスクカードを週グリッド向けに縮めた版。
   左ライン＝国産緑/輸入ピンク／1段目=客名様＋代車・作業バッジ（設定色）／2段目=車種＋担当。時刻はスロット行で分かるので出さない。 */
function weekMiniCard(c){
  const at = (window.escAttr ? escAttr : function(s){ return String(s==null?'':s); });
  const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
  const wts = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
  let badges = '';
  if (c.needLoaner) badges += '<span class="rwk-lo" title="代車">代</span>';
  wts.slice(0, 3).forEach(function(id){
    const w = state.workTypes.find(x => x.id === id);
    if (w) badges += '<span class="rwk-wb" style="background:' + w.color + '22;color:' + w.color + ';border-color:' + w.color + '66;">' + at(w.label) + '</span>';
  });
  const staff = c.frontStaff || c.staff || '';
  let h = '<div class="rwk-card' + (c.codeRed ? ' rwk-claim' : '') + '" draggable="true" data-card-id="' + c.id + '" onclick="openDetail(\'' + c.id + '\')" style="border-left-color:' + teamColor + ';">';
  h += '<div class="rwk-r"><span class="rwk-name">' + (c.customer || '（未入力）') + ' 様</span><span class="rwk-badges">' + badges + '</span></div>';
  h += '<div class="rwk-r"><span class="rwk-car">' + (c.car || '') + '</span>' + (staff ? '<span class="rwk-front">' + at(staff) + '</span>' : '') + '</div>';
  h += '</div>';
  return h;
}
window.weekMiniCard = weekMiniCard;

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
    const hol = (window.Holidays && Holidays.name(dStr)) || null;
    html += '<div class="reserve-week-head' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (hol ? ' holiday' : '') + '">';
    html += '<span class="dow">' + dow + '</span>';
    html += '<span class="day">' + (d.getMonth()+1) + '/' + d.getDate() + '</span>';
    if (hol) html += '<span class="hol" title="' + hol + '">' + hol + '</span>';
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
        c.status === 'reserved'
      );
      html += '<div class="reserve-week-cell' + (isClosed ? ' closed' : '') + '" data-drop="reserveDateTime" data-drop-val="' + dStr + '|' + hh + ':00">';
      inCell.forEach(c => { html += weekMiniCard(c); });
      html += '</div>';
    });
  }

  wrap.innerHTML = html;
}

/* 月ビュー（v0.26.0 ゆうた指示で刷新）＝左に日付・右にその日の予約を時間順で左詰め・下へ無限スクロール。
   月をまたぐと月見出しを挟んで永遠に続く。行へのドラッグ＝入庫日変更（×日は警告）。 */
function renderReserveMonth(){
  document.getElementById('reserve-day-list').style.display = 'none';
  document.getElementById('reserve-week').style.display = 'none';
  document.getElementById('reserve-2month').style.display = 'none';
  const wrap = document.getElementById('reserve-month');
  wrap.classList.add('rml-host');   // グリッド用CSSを無効化してリスト表示に
  wrap.style.display = '';

  const base = new Date(state.reserveDate.getFullYear(), state.reserveDate.getMonth(), 1);
  window._rmlStart = base;
  window._rmlN = 42;   // 初期6週間ぶん
  wrap.innerHTML = '<div class="rml-scroll" id="rml-scroll"><div id="rml-list">' + _rmlRows(0, window._rmlN) + '</div></div>';

  const sc = document.getElementById('rml-scroll');
  if (sc){
    sc.addEventListener('scroll', function(){
      if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 320){
        const from = window._rmlN;
        window._rmlN += 21;
        const list = document.getElementById('rml-list');
        if (list) list.insertAdjacentHTML('beforeend', _rmlRows(from, window._rmlN));
      }
    });
    // 今月を開いた時は今日の行まで自動スクロール
    const t = sc.querySelector('.rml-date.today');
    if (t) sc.scrollTop = Math.max(0, t.closest('.rml-row').offsetTop - 8);
  }
}

function _rmlRows(from, to){
  const todayStr = ymd(new Date());
  let html = '';
  for (let i = from; i < to; i++){
    const d = addDays(window._rmlStart, i);
    const ds = ymd(d);
    if (d.getDate() === 1 || i === 0){
      html += '<div class="rml-mhead">' + d.getFullYear() + '年 ' + (d.getMonth()+1) + '月</div>';
    }
    const dow = d.getDay();
    const isClosed = state.settings.closedDow.includes(dow);
    const hol = (window.Holidays && Holidays.name(ds)) || null;
    const cardsOfDay = state.cards
      .filter(c => c.reserveDate === ds && c.status === 'reserved')
      .sort((a, b) => (a.reserveTime || '99:99') < (b.reserveTime || '99:99') ? -1 : 1);

    let dCls = '';
    if (ds === todayStr) dCls += ' today';
    if (dow === 0 || hol) dCls += ' red';
    else if (dow === 6) dCls += ' sat';

    html += '<div class="rml-row' + (isClosed ? ' closed' : '') + '">';
    html += '<div class="rml-date' + dCls + '">' + (d.getMonth()+1) + '/' + d.getDate() + '<span>' + '日月火水木金土'[dow] + (ds === todayStr ? '・今日' : '') + '</span>'
         + (hol ? '<span class="rml-hol">🎌' + hol + '</span>' : '')
         + (isClosed ? '<span class="rml-hol">定休</span>' : '') + '</div>';
    html += '<div class="rml-cards" data-drop="reserveDate" data-drop-val="' + ds + '">';
    if (!cardsOfDay.length){
      html += '<span class="rml-empty">' + (isClosed ? '休' : '—') + '</span>';
    } else {
      cardsOfDay.forEach(c => {
        const wt = state.workTypes.find(w => w.id === c.workType);
        const ac = wt ? wt.color : 'var(--brand)';
        const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';   // 左ライン＝国産緑/輸入ピンク（他ビューと統一）
        html += '<div class="rml-ev' + (c.urgent ? ' urgent' : '') + '" draggable="true" data-card-id="' + c.id + '"'
             + ' style="border-left-color:' + teamColor + '"'
             + ' onclick="openDetail(\'' + c.id + '\')"'
             + ' title="' + (c.reserveTime || '') + ' ' + (c.customer || '') + ' 様 / ' + (c.car || '') + (c.menu ? ' / ' + c.menu : '') + '">'
             + '<b>' + (c.reserveTime || '--:--') + '</b> ' + (c.customer || '（未入力）') + ' 様' + (c.car ? ' ' + c.car : '')
             + (wt ? '<span class="rml-wt" style="color:' + ac + '">' + wt.label + '</span>' : '')
             + (c.needLoaner ? '<span class="rml-wt">代車</span>' : '')
             + '</div>';
      });
    }
    html += '</div></div>';
  }
  return html;
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
      c.reserveDate === dateStr && c.status === 'reserved'
    );

    const visible = cardsOfDay.slice(0, 3);
    const remaining = cardsOfDay.length - visible.length;

    const hol = (window.Holidays && Holidays.name(dateStr)) || null;
    html += '<div class="reserve-month-cell' + (isToday ? ' today' : '') + (isClosed ? ' closed' : '') + (hol ? ' holiday' : '') + dowClass + '" data-drop="reserveDate" data-drop-val="' + dateStr + '">';
    html += '<div class="day-num">' + dd + '</div>';
    if (hol) html += '<div class="hol-name" title="' + hol + '">' + hol + '</div>';
    visible.forEach(c => {
      html += '<div class="reserve-month-event' + (c.urgent ? ' urgent' : '') + '" draggable="true" data-card-id="' + c.id + '"';
      html += ' onclick="openDetail(\'' + c.id + '\')"';
      html += ' title="' + c.reserveTime + ' ' + c.customer + '様 / ' + (c.car || '') + ' / ' + c.menu + '">';
      html += c.reserveTime + ' ' + c.customer + (c.car ? ' ' + c.car : '');
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

  /* === コンパクト版（整備ビュー＝看板/作業で統一）：客名・車種・作業内容(最大2)・預かり・代車・フロントだけ。移動はドラッグのみ === */
  if (opts.compact){
    const DROP_COLOR = { wait: '#f59e0b', sameDay: '#3b82f6', drop: '#26a269' };
    /* 左ハイライト＝国産/輸入の色（国産グリーン / 輸入ピンク） */
    const teamColor = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
    const wts = (Array.isArray(c.workTypes) && c.workTypes.length)
      ? c.workTypes : (c.workType ? [c.workType] : []);
    // 右上＝左から：代車（ある時）→ 当/待（ある時・預かりは出さない）→ 作業内容（一番右固定）
    const at = (window.escAttr ? escAttr : function(s){ return String(s==null?'':s); });
    let top = '';
    if (c.needLoaner){
      var _lrem = (window.loanerRem ? loanerRem(c) : null);
      var _lk = (window.loanerLevel ? loanerLevel(_lrem) : {key:'amber'}).key;
      var _LC = { green:'#1db97a', amber:'#f59e0b', red:'#ef4444', none:'#9fa8c7' };
      var _ttl = at(window.loanerDueLabel ? loanerDueLabel(c) : '代車');
      if (_lk==='dead'){
        top += '<span class="pcm-loaner pcm-dead" title="' + _ttl + '">代車</span>';
      } else {
        var _lc = _LC[_lk] || '#f59e0b';
        top += '<span class="pcm-loaner" style="background:'+_lc+'22;color:'+_lc+';border-color:'+_lc+'66;" title="' + _ttl + '">代車</span>';
      }
    }
    if (dt && (dt.id === 'wait' || dt.id === 'sameDay')){
      const dc = DROP_COLOR[dt.id] || 'var(--text2)';
      top += '<span class="pcm-drop" title="' + at(dt.desc || '入庫区分') + '" style="background:' + dc + '22;color:' + dc + ';border-color:' + dc + '66;">' + dt.label + '</span>';
    }
    wts.slice(0, 2).forEach(function(id){
      const w = state.workTypes.find(x => x.id === id);
      if (w) top += '<span class="pcm-wt" title="' + at(window.holdDaysLabel ? holdDaysLabel(c, w.label) : w.label) + '" style="background:' + w.color + '22;color:' + w.color + ';border-color:' + w.color + '66;">' + w.label + '</span>';
    });
    const staff = c.frontStaff || c.staff || '';
    const placed = !!(opts.kanban && c.bayId && window.PitPip && PitPip.isOpen());   // PITボード(PiP)が開いている時だけグレーアウト（閉じてる時は普通表示）
    // PITカードと同じ2行構成：上=客名＋様／車種、右上=内容・代車、右下=担当。名前/車種はホバーでフル表示
    // 看板内はカード自体をドロップ先(reorder)にして同フェーズ内の並び替えに対応
    var _reorderAttr = opts.kanban ? (' data-drop="reorder" data-drop-val="' + c.id + '"') : '';
    let h = '<div class="pit-card pcm' + (c.codeRed ? ' pcm-claim' : '') + (c.resNo ? ' pcm-tab' : '') + (placed ? ' pcm-placed' : '') + '" draggable="true" data-card-id="' + c.id + '"' + _reorderAttr + ' onclick="openDetail(\'' + c.id + '\')" style="border-left-color:' + teamColor + ';">';
    h += (c.resNo ? '<div class="pcm-ear" style="border-left-color:' + (c.codeRed ? '#ef4444' : teamColor) + (c.codeRed ? ';border-top-color:#ef4444' : '') + '">' + at(c.resNo) + '</div><i class="pcm-ear-slide"></i>' : '');
    // 車両注意タブ（左/M/T/車高・左M/T合体・最大2・該当時のみ・耳の右の上辺）
    var _dr = Array.isArray(c.drive) ? c.drive : [], _ct = [];
    if (_dr.indexOf('leftHand') >= 0 && _dr.indexOf('mt') >= 0) _ct.push('左M/T');
    else { if (_dr.indexOf('leftHand') >= 0) _ct.push('左'); if (_dr.indexOf('mt') >= 0) _ct.push('M/T'); }
    if (_dr.indexOf('lowCar') >= 0) _ct.push('車高');
    if (_ct.length) h += '<div class="pcm-cau">' + _ct.slice(0, 2).map(function(x){ return '<span class="pcm-caut">' + x + '</span>'; }).join('') + '</div>';
    /* 名前・車種・担当の title は撤去（ホバー情報カード card-hover.js で全文表示するため二重ツールチップを防ぐ） */
    h += '<div class="pcm-r"><span class="pcm-name">' + (c.customer || '（未入力）') + ' 様</span><span class="pcm-badges">' + top + '</span></div>';
    h += '<div class="pcm-r"><span class="pcm-car">' + (c.car || '') + '</span>' + (staff ? '<span class="pcm-front">' + staff + '</span>' : '') + '</div>';
    // 外注フェーズ＝外注先名(＋メモ)＋そのフェーズに入ってからの日数ラベル
    if (c.status === 'outsource'){
      var _odN = c.phaseAt ? (Math.floor((Date.now() - c.phaseAt) / 86400000) + 1) : null;
      var _odTxt = (_odN != null) ? (_odN + '日目') : '';
      var _oName = (c.outsourceTo || '外注先未定') + (c.outsourceNote ? ' ' + c.outsourceNote : '');
      h += '<div class="pcm-out">🤝 <span class="pcm-outn">' + at(_oName) + '</span>' + (_odTxt ? '<span class="pcm-outd">' + _odTxt + '</span>' : '') + '</div>';
    }
    h += '</div>';
    return h;
  }

  /* === 返車ビュー（returnView）：入庫カードと同じ作りのまま、時刻＝返車時刻・左アクセント＝緑で統一 === */
  const isRet = !!opts.returnView;
  const accent2 = isRet ? 'var(--green)' : accent;
  const timeStr = isRet ? (c.returnTime || c.reserveTime || '') : (c.reserveTime || '');

  let html = '';
  html += '<div class="pit-card' + (isRet ? ' return' : '') + (c.urgent ? ' is-urgent' : '') + '" draggable="true" data-card-id="' + c.id + '" onclick="openDetail(\'' + c.id + '\')" style="min-width:200px;border-left-color:' + accent2 + ';">';
  html += '<div class="pc-line1">';
  html += '<span class="pc-time">' + timeStr + '</span>';
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
