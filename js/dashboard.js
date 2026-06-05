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
/* ===== ⏱ 最短入庫日（v0.24.0・チーム別×タイプ別） =====
   代車なし＝予約枠が空く最初の営業日（受付判定が×でない日）
   代車あり＝上に加えて、1台の代車が「預かり想定日数ぶん連続」で空く最初の日
   当日作業＝営業日ならOK（オイル等＝置き場・枠をほぼ使わない） */
function _vdTeam(ds, team){
  const v = window.pitVerdict ? pitVerdict(ds) : null;
  if (!v) return { mark: '○' };
  return team === 'import' ? v.import : v.default;
}
function _loanerFreeRun(startStr, days){
  const loaners = state.loaners || [];
  const assigns = state.loanerAssigns || [];
  return loaners.some(function(l){
    for (let j = 0; j < days; j++){
      const ds = ymd(addDays(_pd(startStr), j));
      const busy = assigns.some(function(a){ return a.loanerId === l.id && a.fromDate <= ds && a.toDate >= ds; });
      if (busy) return false;
    }
    return true;
  });
}
function dashEarliestIntake(team, kind, today){
  const hold = (state.settings && state.settings.holdDaysDefault) || 3;
  for (let i = 0; i < 180; i++){
    const d = addDays(today, i);
    const ds = ymd(d);
    const tv = _vdTeam(ds, team);
    if (tv.mark === '休') continue;                       // 定休・連休は受付なし
    if (kind === 'same') return d;                        // 当日作業＝営業日ならOK
    if (tv.mark === '×') continue;                        // 枠が埋まっている日は不可
    if (kind === 'noLoaner') return d;                    // 代車なし＝枠が空けばOK
    if (_loanerFreeRun(ds, hold)) return d;               // 代車あり＝代車の連続空きも必要
  }
  return null;
}

/* ===== 🗓 予約の埋まり＝横軸の無限カレンダー（v0.25.0） =====
   1日1列：日付／国産車／輸入車。セルは「埋まり/枠」＋ 可・終了・超過（黒）・休 のシンプル4種。
   右端近くまでスクロールすると30日ずつ継ぎ足し（初期60日・件数はその場で計算） */
window._dashCalN = window._dashCalN || 60;

function _dashCalCell(team, tgt, base, ds){
  const eff = window.pitEffective ? pitEffective(ds, tgt, base) : { value: base, closed: null, rules: [] };
  if (eff.closed) return '<div class="drc-c drc-closed" title="' + eff.closed + '＝受付なし">休</div>';
  const cnt = dashIntake(team, ds);
  const capEff = eff.value;
  if (capEff <= 0) return '<div class="drc-c drc-end" title="🧩ルールで受付停止">停</div>';
  if (cnt > capEff)  return '<div class="drc-c drc-over" title="枠を超えて受けています（人の最終判断で挿入）">' + cnt + '/' + capEff + '<span>超過</span></div>';
  if (cnt >= capEff) return '<div class="drc-c drc-end">' + cnt + '/' + capEff + '<span>終了</span></div>';
  return '<div class="drc-c drc-okk">' + cnt + '/' + capEff + '<span>可</span></div>';
}

function _dashCalCols(from, to, today, tStr){
  const rc = (state.settings && state.settings.reserveCap) || { default: 5, import: 3 };
  const capD = rc.default != null ? rc.default : 5;
  const capI = rc.import  != null ? rc.import  : 3;
  let g = '';
  for (let i = from; i < to; i++){
    const d = addDays(today, i);
    const ds = ymd(d);
    const hol = (window.Holidays && Holidays.name) ? Holidays.name(ds) : null;
    const cls = (d.getDay() === 0 || hol) ? ' red' : (d.getDay() === 6 ? ' sat' : '');
    g += '<div class="drc-col' + (ds === tStr ? ' today' : '') + '">';
    g += '<div class="drc-h' + cls + '"' + (hol ? ' title="🎌' + hol + '"' : '') + '>' + (d.getMonth()+1) + '/' + d.getDate() + '<br>' + '日月火水木金土'[d.getDay()] + (ds === tStr ? '・今日' : '') + '</div>';
    g += _dashCalCell('default', 'capDefault', capD, ds);
    g += _dashCalCell('import',  'capImport',  capI, ds);
    g += '</div>';
  }
  return g;
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
  const freeSigned = cap - heldNow;   // 今日の駐車場空き（マイナス＝オーバー）
  const parkCol = (freeSigned <= 0) ? '#ef4444' : (freeSigned <= 3 ? '#f97316' : '#1db97a');

  // 2週間の混雑
  const days = [];
  for (let i = 0; i < 14; i++){
    const d = addDays(today, i);
    const occ = dashOccupancy(ymd(d), tStr);
    days.push({ d: d, occ: occ });
  }
  const maxOcc = Math.max(cap, days.reduce(function(m,x){ return Math.max(m, x.occ); }, 0));

  let h = '';

  // 見出し
  h += '<div class="dash-date">' + (today.getMonth()+1) + '月' + today.getDate() + '日（' + dow + '）の状況</div>';

  // KPI
  h += '<div class="dash-kpis">';
  h += dashKpi('📥', '今日の入庫', inToday, '台');
  h += dashKpi('📤', '今日の返車', outToday, '台');
  h += dashKpi('🅿️', '預かり中', heldNow, '台');
  h += '</div>';

  // ⏱ 最短入庫日（チーム別×代車なし/代車あり/当日作業・v0.24.0）
  const holdN = (state.settings && state.settings.holdDaysDefault) || 3;
  function elCell(team, kind){
    const d = dashEarliestIntake(team, kind, today);
    if (!d) return '<td><b class="dash-el-d none">なし</b><span class="dash-el-w">180日内</span></td>';
    const isT = ymd(d) === tStr;
    return '<td><b class="dash-el-d' + (isT ? ' ok' : '') + '">' + (isT ? '今日' : (d.getMonth()+1) + '/' + d.getDate()) + '</b><span class="dash-el-w">' + (isT ? 'OK' : '日月火水木金土'[d.getDay()] + '曜') + '</span></td>';
  }
  h += '<div class="dash-card">';
  h += '<div class="dash-h"><span>⏱ 最短入庫日</span><span class="dash-note">予約枠・定休・連休・代車の空きから自動計算（代車＝' + holdN + '日連続空きで判定）</span></div>';
  h += '<table class="dash-el"><tr><th></th><th>代車なし</th><th>代車あり</th><th>当日作業</th></tr>';
  h += '<tr><td class="dash-el-t">🚗 国産車</td>' + elCell('default','noLoaner') + elCell('default','loaner') + elCell('default','same') + '</tr>';
  h += '<tr><td class="dash-el-t">🌍 輸入車</td>' + elCell('import','noLoaner')  + elCell('import','loaner')  + elCell('import','same')  + '</tr>';
  h += '</table>';
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

  // 🅿️ 今日の駐車場空き（±をズバッと・v0.24.0）
  const lc = (state.settings && state.settings.lotCap) || null;
  const lcStr = lc ? '（内訳：ピット' + (lc.pit||0) + '・敷地' + (lc.yard||0) + '・駐車場' + (lc.parking||0) + '・緊急+α' + (lc.extra||0) + '）' : '';
  h += '<div class="dash-card">';
  h += '<div class="dash-h"><span>🅿️ 今日の駐車場空き</span></div>';
  h += '<div class="dash-park"><span class="dash-park-num" style="color:' + parkCol + '">' + (freeSigned > 0 ? '+' : '') + freeSigned + '</span><span class="dash-park-u">台</span>'
     + '<span class="dash-park-sub">' + heldNow + '台預かり中 / 置ける' + cap + '台' + lcStr + (freeSigned < 0 ? '<br><b style="color:#ef4444">⚠ ' + (-freeSigned) + '台オーバー（緊急コインパ行き）</b>' : '') + '</span></div>';
  h += '</div>';

  // 📅 直近2週間の駐車場予想（数字＝空き台数±）
  h += '<div class="dash-card">';
  h += '<div class="dash-h"><span>📅 直近2週間の駐車場予想</span><span class="dash-note">数字＝空き台数（マイナス＝オーバー）／点線＝満杯／薄いバー＝概算日数による予想</span></div>';
  h += '<div class="dash-bars">';
  days.forEach(function(x){
    const ratio = x.occ / cap;
    const lvi = _dashLevel(ratio);
    const hpx = Math.round((x.occ / maxOcc) * 84);
    const isToday = ymd(x.d) === tStr;
    const fs = cap - x.occ;
    h += '<div class="dash-bar' + (isToday ? ' today' : '') + (ymd(x.d) > tStr ? ' is-forecast' : '') + '">';
    h += '<div class="dash-bar-n" style="color:' + (fs <= 0 ? '#ef4444' : (fs <= 3 ? '#f97316' : '#1db97a')) + '">' + (fs > 0 ? '+' : '') + fs + '</div>';
    h += '<div class="dash-bar-track"><div class="dash-bar-fill" style="height:' + Math.max(3, hpx) + 'px;background:' + lvi.c + '"></div><div class="dash-bar-cap" style="bottom:' + Math.round((cap / maxOcc) * 84) + 'px"></div></div>';
    h += '<div class="dash-bar-d">' + (x.d.getMonth()+1) + '/' + x.d.getDate() + '</div>';
    h += '<div class="dash-bar-w">' + '日月火水木金土'[x.d.getDay()] + '</div>';
    h += '</div>';
  });
  h += '</div>';
  h += '</div>';

  // 🗓 予約の埋まり（横軸の無限カレンダー・v0.25.0 ゆうた指示のシンプル表示）
  //    可（緑）＝空きあり／終了（赤）＝満枠／超過（黒）＝人の判断で枠を超えて受けた分／休＝定休・連休
  h += '<div class="dash-card">';
  h += '<div class="dash-h"><span>🗓 予約の埋まり</span><span class="dash-note">右へスクロールで無限に先まで｜<span style="color:#1db97a">可</span>＝空きあり・<span style="color:#ef4444">終了</span>＝満枠・<b>超過(黒)</b>＝人の判断で枠超え</span></div>';
  h += '<div class="drc-scroll" id="drc-scroll"><div class="drc-grid" id="drc-grid">';
  h += '<div class="drc-col drc-lab"><div class="drc-h"></div><div class="drc-c">🚗 国産車</div><div class="drc-c">🌍 輸入車</div></div>';
  h += _dashCalCols(0, window._dashCalN, today, tStr);
  h += '</div></div>';
  h += '</div>';

  h += '<div class="dash-foot">「置き場・代車・予約上限」は確定して読める部分。<b>未来の置き場は概算預かり日数による“予想（不確定）”</b>＝診断・見積もりが進むほど精度が上がる前提。置ける台数・1日の上限・概算日数は <a href="javascript:showView(\'settings\')" style="color:inherit;font-weight:700">⚙️ 設定</a> から変更できます。</div>';

  wrap.innerHTML = h;

  // 🗓 予約の埋まり：右端近くで30日継ぎ足し（スクロール位置はそのまま＝カクつかない）
  const sc = document.getElementById('drc-scroll');
  if (sc && !sc._drcBound){
    sc._drcBound = true;
    sc.addEventListener('scroll', function(){
      if (sc.scrollLeft + sc.clientWidth > sc.scrollWidth - 260){
        const from = window._dashCalN;
        window._dashCalN += 30;
        const grid = document.getElementById('drc-grid');
        if (grid) grid.insertAdjacentHTML('beforeend', _dashCalCols(from, window._dashCalN, today, tStr));
      }
    });
  }
}

function dashKpi(icon, label, num, unit){
  return '<div class="dash-kpi"><div class="dash-kpi-ic">' + icon + '</div><div class="dash-kpi-num">' + num + '<span>' + unit + '</span></div><div class="dash-kpi-l">' + label + '</div></div>';
}
