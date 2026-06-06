/* ========================================
   avail.js
   空きカレンダービュー（v0.32.0）
   新規予約画面の右パネル部品を読み取り専用で再利用し、
   「国産車の最短＋空きカレンダー」「輸入車の最短＋空きカレンダー」
   「代車カレンダー」を 3 カラムで一同に表示する。
   ※ クリックで入庫日に入れる等の編集はしない（見るためのビュー）。
   ======================================== */

function renderAvail(){
  const body = document.getElementById('view-availcal-body');
  if (!body) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tStr = ymd(today);
  if (!window._cfsYM){ window._cfsYM = { y: today.getFullYear(), m: today.getMonth() }; }

  // 読み取り専用の合成カード（実データは触らない）
  const c = { reserveDate: '', boardId: null, needLoaner: true };

  let h = '<div class="av-cols">';

  // 国産車
  h += '<div class="av-col">';
  h += _cfsShortHtml(c, 'default', today, tStr, true);
  h += _cfsCalHtml(c, 'default', tStr, true);
  h += '</div>';

  // 輸入車
  h += '<div class="av-col">';
  h += _cfsShortHtml(c, 'import', today, tStr, true);
  h += _cfsCalHtml(c, 'import', tStr, true);
  h += '</div>';

  // 代車カレンダー
  h += '<div class="av-col av-col-lg">';
  h += _cfsLoanerGanttHtml(today, tStr, c, true);
  h += '</div>';

  h += '</div>';

  body.innerHTML = h;
}
window.renderAvail = renderAvail;
