/* ========================================
   loaner.js  -  代車ビュー（縦＝日付・横＝代車・無限スクロール）／PitFlow v0.10.0
   ----------------------------------------
   ・縦にカレンダー（日ごと）が伸び、横軸に代車が並ぶ。
   ・下へスクロールすると日付がどこまでも追加される（無限スクロール）。
   ・予約は連続ブロックで表示。先頭セルにお客様名（無ければ「代車予約」）。
   ・初期表示は1週間前から・自動で今日の位置へスクロール。
   ======================================== */
let _loStart = null;   // 表示開始日（今日-7）
let _loCount = 0;      // 追加済みの日数
let _loBound = false;  // スクロールイベント二重バインド防止

function renderLoaner(){
  const grid = document.getElementById('loaner-grid');
  if (!grid) return;
  const ls = state.loaners || [];
  const today = new Date(); today.setHours(0,0,0,0);
  _loStart = addDays(today, -7);
  _loCount = 0;

  grid.innerHTML = '';
  grid.style.gridTemplateColumns = '92px repeat(' + Math.max(1, ls.length) + ', minmax(110px, 1fr))';

  // ヘッダ（sticky）
  let h = '<div class="lo-cell lo-head lo-corner">日付</div>';
  ls.forEach(function(l){
    h += '<div class="lo-cell lo-head"><div class="lo-car">🚙 ' + l.name + '</div><div class="lo-model">' + (l.model || '') + (l.plate ? '・' + l.plate : '') + '</div></div>';
  });
  grid.insertAdjacentHTML('beforeend', h);

  loAppendDays(42);

  const wrap = document.getElementById('loaner-scroll');
  if (wrap && !_loBound){
    _loBound = true;
    wrap.addEventListener('scroll', function(){
      if (wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 400) loAppendDays(30);
    });
  }
  // 今日の行へ
  setTimeout(loScrollToday, 0);
}

function loScrollToday(){
  const wrap = document.getElementById('loaner-scroll');
  const t = document.querySelector('.lo-date.lo-today');
  if (wrap && t) wrap.scrollTop = Math.max(0, t.offsetTop - 64);
}

function loAppendDays(n){
  const grid = document.getElementById('loaner-grid');
  if (!grid || !_loStart) return;
  const ls = state.loaners || [];
  const todayStr = ymd(new Date());
  let h = '';
  for (let i = 0; i < n; i++){
    const d = addDays(_loStart, _loCount + i);
    const dStr = ymd(d);
    const dow = d.getDay();
    const hol = (window.Holidays && Holidays.name(dStr)) || null;
    const isToday = dStr === todayStr;

    h += '<div class="lo-cell lo-date' + (isToday ? ' lo-today' : '') + (dow === 0 ? ' sun' : (dow === 6 ? ' sat' : '')) + '">'
       + (d.getDate() === 1 || (_loCount + i) === 0 ? '<div class="lo-month">' + (d.getMonth()+1) + '月</div>' : '')
       + (d.getMonth()+1) + '/' + d.getDate() + ' <span>' + '日月火水木金土'[dow] + '</span>'
       + (hol ? '<div class="lo-hol">' + hol + '</div>' : '')
       + '</div>';

    ls.forEach(function(l){
      const a = (state.loanerAssigns || []).find(function(x){ return x.loanerId === l.id && x.fromDate <= dStr && x.toDate >= dStr; });
      if (a){
        const isStart = (a.fromDate === dStr);
        const card = a.cardId ? state.cards.find(function(c){ return c.id === a.cardId; }) : null;
        const label = card ? (card.customer || '') + ' 様' : '代車予約';
        h += '<div class="lo-cell lo-booked' + (isToday ? ' lo-today' : '') + (isStart ? ' start' : '') + '"'
           + (card ? ' onclick="openDetail(\'' + card.id + '\')"' : '')
           + ' title="' + a.fromDate + ' 〜 ' + a.toDate + (card ? '：' + label : '') + '">'
           + (isStart ? label : '')
           + '</div>';
      } else {
        h += '<div class="lo-cell lo-free' + (isToday ? ' lo-today' : '') + '"></div>';
      }
    });
  }
  _loCount += n;
  grid.insertAdjacentHTML('beforeend', h);
}
