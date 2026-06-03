/* ========================================
   dashboard.js  -  ダッシュボード＋混雑度（置き場ベース）／PitFlow v0.7.0
   ----------------------------------------
   ◎混雑度の考え方（小林モータース＝預かり中心）
     ・各車は「入庫日〜返車日」まで置き場を1台分専有する（当日仕上げは1日だけ）。
     ・ある日の混雑度 ＝ その日に預かっている台数 ÷ 置ける台数(settings.lotCapacity)。
     ・最短入庫 ＝ 今日から順に、預かり期間ぶん足しても置き場が溢れない最初の日。
     ・工数(整備士)・PIT枠は将来の補助指標（今は置き場が主ボトルネック）。
   ======================================== */

function _dashCap(){ return (state.settings && state.settings.lotCapacity) || 20; }

// その車が置き場を占有しているか（返車・廃車は除く）
function _dashHeld(c){ return c.status !== 'returned' && c.status !== 'scrap'; }

// YYYY-MM-DD をローカル日付に
function _pd(s){ const p = String(s).split('-'); return new Date(+p[0], (+p[1]) - 1, +p[2]); }
// 占有の終了日：返車日が確定していればそれ／無ければ概算預かり日数での「見込み」
function _dashEnd(c){
  if (c.returnDate) return c.returnDate;
  const est = (c.estHoldDays != null) ? c.estHoldDays : (window.pitEstHold ? pitEstHold(c.workType, c.dropType) : 3);
  return ymd(addDays(_pd(c.reserveDate), est));
}
// 指定日(YYYY-MM-DD)の預かり台数（未来は概算日数での見込み＝予想）
function dashOccupancy(dStr){
  return state.cards.filter(function(c){
    if (!_dashHeld(c) || !c.reserveDate || c.reserveDate > dStr) return false;
    return _dashEnd(c) >= dStr;
  }).length;
}
// チーム別 その日の入庫（予約）台数
function dashIntake(team, dStr){
  return state.cards.filter(function(c){ return c.boardId === team && c.reserveDate === dStr && _dashHeld(c); }).length;
}

// チーム別の預かり台数（boardId: default＝国産 / import＝輸入）
function _dashHeldOnTeam(board, dStr){
  return state.cards.filter(function(c){
    if (!_dashHeld(c) || c.boardId !== board || !c.reserveDate || c.reserveDate > dStr) return false;
    return _dashEnd(c) >= dStr;
  }).length;
}
// 代車の最短空き（4台のうち1台でも空く最初の日）
function dashLoanerEarliestFree(today){
  const loaners = state.loaners || [];
  if (!loaners.length) return null;
  for (let i = 0; i < 120; i++){
    const dStr = ymd(addDays(today, i));
    const free = loaners.some(function(l){
      return !(state.loanerAssigns || []).some(function(a){ return a.loanerId === l.id && a.fromDate <= dStr && a.toDate >= dStr; });
    });
    if (free) return addDays(today, i);
  }
  return null;
}

// 混雑レベル → 色/ラベル
function _dashLevel(ratio){
  if (ratio >= 1)    return { c:'#ef4444', t:'満杯' };
  if (ratio >= 0.9)  return { c:'#f97316', t:'混雑' };
  if (ratio >= 0.7)  return { c:'#eab308', t:'やや混' };
  return { c:'#1db97a', t:'余裕' };
}

function renderDashboard(){
  const wrap = document.getElementById('view-dashboard-body');
  if (!wrap) return;
  const cap = _dashCap();
  const today = new Date(); today.setHours(0,0,0,0);
  const tStr = ymd(today);
  const dow = '日月火水木金土'[today.getDay()];

  const inToday   = state.cards.filter(function(c){ return c.reserveDate === tStr && _dashHeld(c); }).length;
  const outToday  = state.cards.filter(function(c){ return c.returnDate === tStr && _dashHeld(c); }).length;
  const heldNow   = dashOccupancy(tStr, tStr);
  const free      = Math.max(0, cap - heldNow);
  const todayRatio = heldNow / cap;
  const lv = _dashLevel(todayRatio);

  // 2週間の混雑
  const days = [];
  for (let i = 0; i < 14; i++){
    const d = addDays(today, i);
    const occ = dashOccupancy(ymd(d), tStr);
    days.push({ d: d, occ: occ });
  }
  const maxOcc = Math.max(cap, days.reduce(function(m,x){ return Math.max(m, x.occ); }, 0));

  // 最短入庫（預かり既定3日／当日仕上げ）
  const holdDays = (state.settings && state.settings.holdDaysDefault) || 3;
  let earliest = null;
  for (let i = 0; i < 45 && !earliest; i++){
    let ok = true;
    for (let j = 0; j < holdDays; j++){
      if (dashOccupancy(ymd(addDays(today, i + j)), tStr) + 1 > cap){ ok = false; break; }
    }
    if (ok) earliest = addDays(today, i);
  }
  const earliestStr = earliest ? (earliest.getMonth()+1) + '/' + earliest.getDate() + '（' + '日月火水木金土'[earliest.getDay()] + '）' : '今後3週間内になし';
  const earliestToday = earliest && ymd(earliest) === tStr;

  let h = '';

  // 見出し
  h += '<div class="dash-date">' + (today.getMonth()+1) + '月' + today.getDate() + '日（' + dow + '）の状況</div>';

  // KPI
  h += '<div class="dash-kpis">';
  h += dashKpi('📥', '今日の入庫', inToday, '台');
  h += dashKpi('📤', '今日の返車', outToday, '台');
  h += dashKpi('🅿️', '預かり中', heldNow, '台');
  h += dashKpi('🟢', '置き場の空き', free, '台');
  h += '</div>';

  // チーム別の状況（国産／輸入）
  const teams = [{ key:'default', name:'🚗 国産車チーム' }, { key:'import', name:'🌍 輸入車チーム' }];
  h += '<div class="dash-card"><div class="dash-h"><span>👥 チーム別の状況</span><span class="dash-note">国産 : 輸入 ＝ ざっくり 6 : 4</span></div><div class="dash-teams">';
  teams.forEach(function(t){
    const held = _dashHeldOnTeam(t.key, tStr, tStr);
    const tin  = state.cards.filter(function(c){ return c.boardId === t.key && c.reserveDate === tStr && _dashHeld(c); }).length;
    const tout = state.cards.filter(function(c){ return c.boardId === t.key && c.returnDate === tStr && _dashHeld(c); }).length;
    h += '<div class="dash-team"><div class="dash-team-n">' + t.name + '</div>'
       + '<div class="dash-team-stats"><span class="big"><b>' + held + '</b>台 預かり</span><span>本日入庫 ' + tin + '</span><span>本日返車 ' + tout + '</span></div></div>';
  });
  h += '</div></div>';

  // 今日の混雑度ゲージ
  const pct = Math.round(todayRatio * 100);
  h += '<div class="dash-card">';
  h += '<div class="dash-h"><span>🚦 今日の混雑度（置き場ベース）</span><span class="dash-lv" style="background:' + lv.c + '">' + lv.t + ' ' + pct + '%</span></div>';
  h += '<div class="dash-gauge"><div class="dash-gauge-fill" style="width:' + Math.min(100, pct) + '%;background:' + lv.c + '"></div></div>';
  h += '<div class="dash-sub">' + heldNow + ' 台 / 置ける ' + cap + ' 台' + (heldNow > cap ? '（' + (heldNow - cap) + '台オーバー）' : '') + '</div>';
  h += '</div>';

  // 最短入庫
  h += '<div class="dash-card dash-earliest' + (earliestToday ? ' ok' : '') + '">';
  h += '<div class="dash-h"><span>⏱ 最短で入庫できる日</span></div>';
  h += '<div class="dash-earliest-main">' + (earliestToday ? '✅ 今日OK' : earliestStr) + '</div>';
  const loanerFree = dashLoanerEarliestFree(today);
  const loanerStr = loanerFree ? ((loanerFree.getMonth()+1) + '/' + loanerFree.getDate() + '（' + '日月火水木金土'[loanerFree.getDay()] + '）') : '空きなし';
  h += '<div class="dash-loaner">🚙 代車の最短空き：<b>' + loanerStr + '</b><span>　代車予約が先行して埋まっています</span></div>';
  h += '<div class="dash-sub">' + holdDays + '日預かり想定で、置き場が溢れない最初の日。<br>※オイル等の当日仕上げ（預かりなし）は基本いつでもOK（置き場をほぼ使わない）。<br>※<b>代車が要る預かり</b>は「代車の最短空き」が実際のボトルネックになります。</div>';
  h += '</div>';

  // 2週間の混雑バー
  h += '<div class="dash-card">';
  h += '<div class="dash-h"><span>📅 これから2週間の混み具合（置き場）</span><span class="dash-note">点線＝置ける ' + cap + ' 台／薄いバー＝予想（概算日数）</span></div>';
  h += '<div class="dash-bars">';
  days.forEach(function(x){
    const ratio = x.occ / cap;
    const lvi = _dashLevel(ratio);
    const hpx = Math.round((x.occ / maxOcc) * 84);
    const isToday = ymd(x.d) === tStr;
    h += '<div class="dash-bar' + (isToday ? ' today' : '') + (ymd(x.d) > tStr ? ' is-forecast' : '') + '">';
    h += '<div class="dash-bar-n">' + x.occ + '</div>';
    h += '<div class="dash-bar-track"><div class="dash-bar-fill" style="height:' + Math.max(3, hpx) + 'px;background:' + lvi.c + '"></div><div class="dash-bar-cap" style="bottom:' + Math.round((cap / maxOcc) * 84) + 'px"></div></div>';
    h += '<div class="dash-bar-d">' + (x.d.getMonth()+1) + '/' + x.d.getDate() + '</div>';
    h += '<div class="dash-bar-w">' + '日月火水木金土'[x.d.getDay()] + '</div>';
    h += '</div>';
  });
  h += '</div>';
  h += '</div>';

  // 予約の埋まり（チーム別・1日の上限）
  const rc = (state.settings && state.settings.reserveCap) || { default:5, import:3 };
  const capD = rc.default || 5, capI = rc.import || 3;
  h += '<div class="dash-card"><div class="dash-h"><span>🗓 予約の埋まり（チーム別・1日の上限）</span><span class="dash-note">満＝打ち止め｜国産 ' + capD + ' ／ 輸入 ' + capI + '</span></div>';
  h += '<div class="dash-cap">';
  [{ key:'default', name:'🚗 国産', cap:capD }, { key:'import', name:'🌍 輸入', cap:capI }].forEach(function(t){
    h += '<div class="dash-cap-row"><div class="dash-cap-name">' + t.name + '</div><div class="dash-cap-cells">';
    days.forEach(function(x){
      const cnt = dashIntake(t.key, ymd(x.d));
      const full = cnt >= t.cap;
      const near = !full && cnt >= t.cap - 1;
      h += '<div class="dash-cap-cell' + (full ? ' full' : (near ? ' near' : '')) + (ymd(x.d) === tStr ? ' today' : '') + '" title="' + (x.d.getMonth()+1) + '/' + x.d.getDate() + '：' + cnt + '/' + t.cap + '">' + (full ? '満' : cnt) + '</div>';
    });
    h += '</div></div>';
  });
  h += '<div class="dash-cap-row"><div class="dash-cap-name dash-cap-axis"></div><div class="dash-cap-cells">';
  days.forEach(function(x){ h += '<div class="dash-cap-d">' + x.d.getDate() + '</div>'; });
  h += '</div></div>';
  h += '</div></div>';

  h += '<div class="dash-foot">「置き場・代車・予約上限」は確定して読める部分。<b>未来の置き場は概算預かり日数による“予想（不確定）”</b>＝診断・見積もりが進むほど精度が上がる前提。置ける台数・1日の上限・概算日数は後で設定から変更できるようにする。</div>';

  wrap.innerHTML = h;
}

function dashKpi(icon, label, num, unit){
  return '<div class="dash-kpi"><div class="dash-kpi-ic">' + icon + '</div><div class="dash-kpi-num">' + num + '<span>' + unit + '</span></div><div class="dash-kpi-l">' + label + '</div></div>';
}
