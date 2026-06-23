/* ========================================
   loaner.js  -  代車ビュー／PitFlow v0.11.0
   ----------------------------------------
   ・縦＝日付（下に無限スクロール）／横＝代車20台（横スクロール・日付列とヘッダ固定）。
   ・予約は「開始セルに客バッジ → 縦線が↓に伸びる → 返却予定日に▼矢印」。
   ・バッジを別の代車列へ**ドラッグで移動**できる（返せる/返せない/緊急対応の差し替え用）。
     移動先の期間が別予約とぶつかる場合は「◯日ぶつかる」警告を出して確認。
   ======================================== */
let _loStart = null, _loCount = 0, _loBound = false, _loDnd = false, _loDragAid = null, _loDragMode = 'move';
let _loFilters = { etc:false, navi:false, iso:false };
let _loVehBound = false;

function _loPd(s){ const p = String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function _loEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }

/* 代車の装備オプション（ETC/ナビ/ISO/高さ）が未設定なら、デモ用に変化を付けて初期化（実車は編集で上書き） */
function _loEnsureOpts(){
  (state.loaners || []).forEach(function(l, i){
    if (l.etc === undefined)  l.etc  = (i % 2 === 0);
    if (l.navi === undefined) l.navi = (i % 3 !== 0);
    if (l.iso === undefined)  l.iso  = (i % 4 === 0);
    if (l.height === undefined || l.height === null) l.height = 150 + (i % 6) * 3;   // 150〜165cm
  });
}
/* 絞り込みスイッチで該当オプションを持つ代車だけに */
function _loFiltered(){
  let ls = (state.loaners || []);
  if (_loFilters.etc)  ls = ls.filter(function(l){ return l.etc; });
  if (_loFilters.navi) ls = ls.filter(function(l){ return l.navi; });
  if (_loFilters.iso)  ls = ls.filter(function(l){ return l.iso; });
  return ls;
}
window.loToggleFilter = function(k){
  _loFilters[k] = !_loFilters[k];
  const b = document.querySelector('.lo-filter[data-k="' + k + '"]'); if (b) b.classList.toggle('on', _loFilters[k]);
  _loRefresh();
};

function renderLoaner(){
  const grid = document.getElementById('loaner-grid');
  if (!grid) return;
  // 代車割当に id が無いとドラッグ移動(data-aid)が効かない＝旧データ/サンプル救済で必ず採番
  (state.loanerAssigns || []).forEach(function(a, i){
    if (a && !a.id) a.id = 'la' + Date.now().toString(36) + i.toString(36);
  });
  const today = new Date(); today.setHours(0,0,0,0);
  _loStart = addDays(today, -7);
  loRebuild(42);

  const wrap = document.getElementById('loaner-scroll');
  if (wrap && !_loBound){
    _loBound = true;
    wrap.addEventListener('scroll', function(){
      if (wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 400) loAppendDays(30);
    });
  }
  if (!_loDnd){ _loDnd = true; loBindDnd(grid); }
  if (!_loVehBound){
    _loVehBound = true;
    document.addEventListener('mouseover', function(e){
      const hd = e.target.closest && e.target.closest('.lo-head[data-loid]');
      if (hd) loVehHover(hd);
    });
    document.addEventListener('mouseout', function(e){
      const hd = e.target.closest && e.target.closest('.lo-head[data-loid]');
      if (hd){ const to = e.relatedTarget; if (!to || !(to.closest && to.closest('.lo-head[data-loid]'))) loVehHide(); }
    });
    document.addEventListener('scroll', loVehHide, true);
  }
  setTimeout(loScrollToday, 0);
}

/* 代車ヘッダのホバー＝代車の詳細カード（車種・ETC/ナビ/ISO/高さ） */
function loVehHover(headEl){
  const id = headEl.dataset.loid;
  const l = (state.loaners || []).find(function(x){ return x.id === id; });
  if (!l) return;
  let el = document.getElementById('lo-veh-hover');
  if (!el){ el = document.createElement('div'); el.id = 'lo-veh-hover'; document.body.appendChild(el); }
  const opt = function(on, label){ return '<span class="lvh-opt ' + (on ? 'on' : 'off') + '">' + (on ? '✓' : '✕') + ' ' + label + '</span>'; };
  el.innerHTML =
      '<div class="lvh-head"><span class="lvh-name">' + _loEsc(l.name || '') + '</span>'
        + (l.plate ? '<span class="lvh-plate">' + _loEsc(l.plate) + '</span>' : '') + '</div>'
    + '<div class="lvh-model">' + _loEsc(l.model || '（車種未登録）') + '</div>'
    + '<div class="lvh-opts">' + opt(l.etc, 'ETC') + opt(l.navi, 'ナビ') + opt(l.iso, 'ISO') + '</div>'
    + '<div class="lvh-h">高さ <b>' + (l.height != null ? _loEsc(l.height) + ' cm' : '—') + '</b></div>'
    + (l.shakenDate ? '<div class="lvh-sub">車検 ' + _loEsc(l.shakenDate) + (l.tenkenDate ? '　12点 ' + _loEsc(l.tenkenDate) : '') + '</div>' : '');
  el.classList.add('show');
  const r = headEl.getBoundingClientRect();
  const w = 220, vw = document.documentElement.clientWidth;
  let left = r.left; if (left + w > vw - 8) left = vw - w - 8;
  el.style.left = Math.max(8, left) + 'px';
  el.style.top = (r.bottom + 6) + 'px';
}
function loVehHide(){ const el = document.getElementById('lo-veh-hover'); if (el) el.classList.remove('show'); }

function loRebuild(days){
  const grid = document.getElementById('loaner-grid');
  if (!grid) return;
  _loEnsureOpts();
  const ls = _loFiltered();
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = '64px repeat(' + Math.max(1, ls.length) + ', minmax(48px, 1fr))';   // 列を詰めて横スクロール軽減（詳細はホバーで）
  let h = '<div class="lo-cell lo-head lo-corner">日付</div>';
  ls.forEach(function(l){
    const num = String(l.name || '').replace('代車', '') || l.name;
    h += '<div class="lo-cell lo-head" data-loid="' + l.id + '"><div class="lo-car">' + num + '</div><div class="lo-model">' + _loEsc(l.model || '') + '</div></div>';
  });
  grid.insertAdjacentHTML('beforeend', h);
  _loCount = 0;
  loAppendDays(days);
}

function loScrollToday(){
  const wrap = document.getElementById('loaner-scroll');
  const t = document.querySelector('.lo-date.lo-today');
  if (wrap && t) wrap.scrollTop = Math.max(0, t.offsetTop - 60);
}

function loAppendDays(n){
  const grid = document.getElementById('loaner-grid');
  if (!grid || !_loStart) return;
  const ls = _loFiltered();
  const todayStr = ymd(new Date());
  let h = '';
  for (let i = 0; i < n; i++){
    const d = addDays(_loStart, _loCount + i);
    const dStr = ymd(d);
    const dow = d.getDay();
    const hol = (window.Holidays && Holidays.name(dStr)) || null;
    const isToday = dStr === todayStr;
    const isClosed = ((state.settings && state.settings.closedDow) || []).indexOf(dow) >= 0;
    const dayMods = (isClosed ? ' lo-closed' : '') + (hol ? ' lo-holiday' : '');

    h += '<div class="lo-cell lo-date' + (isToday ? ' lo-today' : '') + (dow === 0 ? ' sun' : (dow === 6 ? ' sat' : '')) + (isClosed ? ' closed' : '') + '">'
       + (d.getDate() === 1 || (_loCount + i) === 0 ? '<div class="lo-month">' + (d.getMonth()+1) + '月</div>' : '')
       + (d.getMonth()+1) + '/' + d.getDate() + ' <span>' + '日月火水木金土'[dow] + '</span>'
       + (hol ? '<div class="lo-hol">' + hol + '</div>' : '')
       + (isClosed ? '<div class="lo-closed-tag">定休</div>' : '')
       + '</div>';

    ls.forEach(function(l){
      const attrs = ' data-lo="' + l.id + '" data-ld="' + dStr + '"';
      // 車両イベント（車検入庫・リースアップ等）のオーバーレイ
      let ov = '';
      const evs = (state.fleetEvents || []).filter(function(e){ return e.vehicleId === l.id && e.fromDate <= dStr && e.toDate >= dStr; });
      if (evs.length){
        const t = (typeof FL_EVT_TYPES !== 'undefined' ? FL_EVT_TYPES[evs[0].type] : null) || { color:'#3b82f6', label:'予定' };
        ov += '<span class="lo-evs" style="background:' + t.color + '" title="' + evs[0].fromDate + '〜' + evs[0].toDate + '：' + (evs[0].label || t.label) + '"></span>';
        if (evs[0].fromDate === dStr) ov += '<span class="lo-evt-tag" style="background:' + t.color + '">' + ((evs[0].label || t.label).slice(0, 5)) + '</span>';
      }
      const a = (state.loanerAssigns || []).find(function(x){ return x.loanerId === l.id && x.fromDate <= dStr && x.toDate >= dStr; });
      if (a){
        const isStart = (a.fromDate === dStr);
        const isEnd = (a.toDate === dStr);
        const card = a.cardId ? state.cards.find(function(c){ return c.id === a.cardId; }) : null;
        // 国産緑/輸入ピンク（車ごと）。バー線・▼・バッジに反映（CSS変数 --lo-team）。
        const teamColor = card ? (card.boardId === 'import' ? '#ec4899' : '#1db97a') : 'var(--brand)';
        // メイン表示＝苗字＋様＋車種（長い場合は…）。情報はホバー情報カードへ（古いtitleは廃止）。
        const _nm = card ? ((window.pitSurname ? pitSurname(card.customer) : (card.customer || '')) || '予約') : (a.customer || '予約');
        const label = _nm + (card ? ' 様' : '') + (card && card.car ? ' ' + card.car : (a.car ? ' ' + a.car : ''));
        h += '<div class="lo-cell lo-bk' + (isStart ? ' bk-start' : '') + (isEnd ? ' bk-end' : '') + (isStart && isEnd ? ' bk-single' : '') + (isToday ? ' lo-today' : '') + dayMods + '"' + attrs
           + ' style="--lo-team:' + teamColor + '">';
        if (isStart){
          h += '<span class="lo-badge" draggable="true" data-aid="' + (a.id || '') + '"' + (card ? ' data-card-id="' + card.id + '" onclick="openDetail(\'' + card.id + '\')"' : '') + '>' + label + '</span>';
        }
        if (isEnd){
          h += '<span class="lo-end" draggable="true" data-aid="' + (a.id || '') + '">▼</span>';
        }
        h += ov + '</div>';
      } else {
        h += '<div class="lo-cell lo-free' + (isToday ? ' lo-today' : '') + dayMods + '"' + attrs + '>' + ov + '</div>';
      }
    });
  }
  _loCount += n;
  grid.insertAdjacentHTML('beforeend', h);
}

/* ===== 代車間ドラッグ移動 ===== */
function loBindDnd(grid){
  grid.addEventListener('dragstart', function(e){
    const b = e.target.closest('.lo-badge[data-aid], .lo-end[data-aid]');
    if (!b || !b.dataset.aid){ return; }
    _loDragAid = b.dataset.aid;
    _loDragMode = b.classList.contains('lo-end') ? 'resize' : 'move';
    _loPrevKey = null;
    if (e.dataTransfer){ e.dataTransfer.effectAllowed = 'move'; try{ e.dataTransfer.setData('text/plain', _loDragAid); }catch(_){} }
  });
  grid.addEventListener('dragover', function(e){
    if (!_loDragAid) return;
    const c = e.target.closest('[data-lo]');
    if (c){
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      // ゴーストプレビュー：落としたらどうなるかを透けて表示（競合は赤）
      const key = c.getAttribute('data-lo') + '|' + c.getAttribute('data-ld');
      if (key !== _loPrevKey){
        _loPrevKey = key;
        loPreview(c.getAttribute('data-lo'), c.getAttribute('data-ld'));
      }
    }
  });
  grid.addEventListener('drop', function(e){
    const c = e.target.closest('[data-lo]');
    loClearPreview();
    if (!c || !_loDragAid) return;
    e.preventDefault();
    if (_loDragMode === 'resize') loResizeAssign(_loDragAid, c.getAttribute('data-ld'));
    else loMoveAssignTo(_loDragAid, c.getAttribute('data-lo'), c.getAttribute('data-ld'));
    _loDragAid = null;
  });
  grid.addEventListener('dragend', function(){ _loDragAid = null; loClearPreview(); });
}

/* ===== ドラッグ中のゴーストプレビュー ===== */
let _loPrevKey = null;

function loPreview(lo, date){
  loClearPreview();
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === _loDragAid; });
  if (!a || !date) return;
  let targetLo, from, to;
  if (_loDragMode === 'resize'){
    targetLo = a.loanerId;
    from = a.fromDate;
    to = (date < a.fromDate) ? a.fromDate : date;
  } else {
    targetLo = lo;
    from = date;
    const dur = Math.round((_loPd(a.toDate) - _loPd(a.fromDate)) / 86400000);
    to = ymd(addDays(_loPd(date), dur));
  }
  let d = _loPd(from);
  while (ymd(d) <= to){
    const ds = ymd(d);
    const el = document.querySelector('[data-lo="' + targetLo + '"][data-ld="' + ds + '"]');
    if (el){
      const conflict = (state.loanerAssigns || []).some(function(x){ return x.loanerId === targetLo && x.id !== _loDragAid && x.fromDate <= ds && x.toDate >= ds; });
      el.classList.add(conflict ? 'lo-prev-bad' : 'lo-prev');
    }
    d = addDays(d, 1);
  }
}

function loClearPreview(){
  document.querySelectorAll('.lo-prev, .lo-prev-bad').forEach(function(el){
    el.classList.remove('lo-prev'); el.classList.remove('lo-prev-bad');
  });
}

// 期間中、移動先の別予約とぶつかる日数
function loConflictDays(loanerId, from, to, exceptAid){
  let n = 0, d = _loPd(from);
  while (ymd(d) <= to){
    const ds = ymd(d);
    if ((state.loanerAssigns || []).some(function(x){ return x.loanerId === loanerId && x.id !== exceptAid && x.fromDate <= ds && x.toDate >= ds; })) n++;
    d = addDays(d, 1);
  }
  return n;
}

function _loRefresh(){
  const wrap = document.getElementById('loaner-scroll');
  const st = wrap ? wrap.scrollTop : 0, sl = wrap ? wrap.scrollLeft : 0;
  loRebuild(Math.max(42, _loCount));
  if (wrap){ wrap.scrollTop = st; wrap.scrollLeft = sl; }
}

/* バッジのドラッグ＝期間まるごと移動（横＝別の代車／縦＝日付ずらし・両方OK） */
function loMoveAssignTo(aid, destLo, destDate){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a || !destLo || !destDate) return;
  const dur = Math.round((_loPd(a.toDate) - _loPd(a.fromDate)) / 86400000);
  const newFrom = destDate;
  const newTo = ymd(addDays(_loPd(destDate), dur));
  if (a.loanerId === destLo && a.fromDate === newFrom) return;
  const dest = (state.loaners || []).find(function(l){ return l.id === destLo; });
  const conf = loConflictDays(destLo, newFrom, newTo, aid);
  if (conf > 0){
    if (!confirm('⚠ 移動先（' + (dest ? dest.name : destLo) + '：' + newFrom + '〜' + newTo + '）は ' + conf + ' 日が別の予約とぶつかります（枠が足りません）。\nそれでも移動しますか？')) return;
  }
  a.loanerId = destLo; a.fromDate = newFrom; a.toDate = newTo;
  // ★紐づくカードの代車情報も同期（カード内の代車期日/リミットが合うように）
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  if (card){ card.loanerId = a.loanerId; card.loanerFrom = a.fromDate; card.loanerTo = a.toDate; }
  if (window.PitDB) PitDB.save();
  _loRefresh();
}

/* ▼のドラッグ＝返却日の伸縮 */
function loResizeAssign(aid, destDate){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a || !destDate) return;
  let newTo = destDate;
  if (newTo < a.fromDate) newTo = a.fromDate;
  if (newTo === a.toDate) return;
  let conf = 0;
  if (newTo > a.toDate) conf = loConflictDays(a.loanerId, ymd(addDays(_loPd(a.toDate), 1)), newTo, aid);
  if (conf > 0){
    if (!confirm('⚠ 延長した期間のうち ' + conf + ' 日が別の予約とぶつかります。\nそれでも変更しますか？')) return;
  }
  a.toDate = newTo;
  // ★紐づくカードの返却日も同期（カード内の代車リミットに反映）
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  if (card){ card.loanerTo = newTo; }
  if (window.PitDB) PitDB.save();
  _loRefresh();
}
