/* ========================================
   today.js
   当日ビュー（朝イチ全員で見る今日の段取り紙）
   ======================================== */

function renderToday(){
  const wrap = document.getElementById('view-today-body');
  if (!wrap) return;

  const today = new Date();
  const todayStr = ymd(today);
  const dow = '日月火水木金土'[today.getDay()];

  // 入庫リスト（今日が予約日のカード、返車前まで）
  const intake = state.cards
    .filter(c => c.reserveDate === todayStr && c.status !== 'returned')
    .sort((a, b) => a.reserveTime.localeCompare(b.reserveTime));

  // 返車リスト（今日が返車日 ＆ まだ返してない）
  const returns = state.cards
    .filter(c => c.returnDate === todayStr && c.status !== 'returned')
    .sort((a, b) => a.reserveTime.localeCompare(b.reserveTime));

  let html = '';

  // ヘッダー（日付＋当日担当）
  html += '<div class="today-head">';
  html += '<div class="today-date">';
  html += '<span class="big">' + (today.getMonth()+1) + '月 ' + today.getDate() + '日</span>';
  html += '<span class="dow">(' + dow + ')</span>';
  html += '</div>';

  html += '<div class="today-duties">';
  html += '<div class="duty-chip"><span class="duty-label">金庫</span><span class="duty-name">' + state.todayDuty.safe + '</span></div>';
  html += '<div class="duty-chip"><span class="duty-label">SNS</span><span class="duty-name">' + state.todayDuty.sns + '</span></div>';
  html += '<div class="duty-chip"><span class="duty-label">掃除</span><span class="duty-name">' + state.todayDuty.cleaning + '</span></div>';
  html += '</div>';

  html += '<div class="today-counts">';
  html += '<div class="count-chip"><span class="num">' + intake.length + '</span><span class="lbl">入庫</span></div>';
  html += '<div class="count-chip"><span class="num">' + returns.length + '</span><span class="lbl">返車</span></div>';
  html += '</div>';
  html += '</div>';

  // 2カラム
  html += '<div class="today-cols">';

  // 入庫カラム
  html += '<div class="today-col">';
  html += '<div class="today-col-head intake"><span class="ic">📥</span>入庫 <span class="cnt">' + intake.length + '</span></div>';
  html += '<div class="today-col-body">';
  if (intake.length === 0){
    html += '<div class="today-empty">本日の入庫予定なし</div>';
  } else {
    intake.forEach(c => html += todayRow(c));
  }
  html += '</div></div>';

  // 返車カラム
  html += '<div class="today-col">';
  html += '<div class="today-col-head return"><span class="ic">📤</span>返車 <span class="cnt">' + returns.length + '</span></div>';
  html += '<div class="today-col-body">';
  if (returns.length === 0){
    html += '<div class="today-empty">本日の返車予定なし</div>';
  } else {
    returns.forEach(c => html += todayRow(c, true));
  }
  html += '</div></div>';

  html += '</div>';

  wrap.innerHTML = html;
}

function todayRow(c, isReturn){
  const wt = state.workTypes.find(w => w.id === c.workType);
  const dt = state.dropTypes.find(d => d.id === c.dropType);
  let html = '';
  html += '<div class="today-row" onclick="openDetail(\'' + c.id + '\')">';
  html += '<div class="tr-time">' + c.reserveTime + '</div>';
  html += '<div class="tr-main">';
  html += '<div class="tr-customer">' + c.customer + ' 様</div>';
  html += '<div class="tr-car">' + c.car + (c.plate ? ' / ' + c.plate : '') + '</div>';
  if (c.memo) html += '<div class="tr-memo">' + c.memo + '</div>';
  html += '</div>';
  html += '<div class="tr-tags">';
  if (dt) html += '<span class="tag-drop tag-drop-' + dt.id + '" title="' + dt.desc + '">' + dt.label + '</span>';
  if (wt) html += '<span class="tag-work" style="background:' + wt.color + '20;color:' + wt.color + ';border-color:' + wt.color + ';">' + wt.label + '</span>';
  if (c.needLoaner) html += '<span class="tag-side loaner">代車</span>';
  if (c.needWash)   html += '<span class="tag-side wash">洗車</span>';
  if (c.urgent)     html += '<span class="tag-side urgent">緊急</span>';
  html += '</div>';
  html += '</div>';
  return html;
}
