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
let _loCats = { kei:false, normal:false, import:false };   // 区分の絞り込み（OR）
let _loSortKey = null;   // 並べ替え（低い順）：'height'|'width'|'length'|'seats'|null
let _loVehBound = false;

const LO_CAT = { kei:'軽', normal:'普通車', import:'輸入車' };

/* ===== 下書きモード（動かした瞬間に突入＝保存はしない。一括実行で確定／破棄／やり直し） ===== */
let _loDraftOrig = null;   // 下書き開始時のスナップショット {aid:{loanerId,fromDate,toDate}}
let _loApplySnap = null;   // 直前の一括実行のやり直し用スナップショット
function _loStartDraft(){
  if (_loDraftOrig) return;
  _loDraftOrig = {};
  (state.loanerAssigns || []).forEach(function(a){ _loDraftOrig[a.id] = { loanerId:a.loanerId, fromDate:a.fromDate, toDate:a.toDate }; });
}
function _loAssignChanged(a){ const o = _loDraftOrig && _loDraftOrig[a.id]; return !!o && (o.loanerId!==a.loanerId || o.fromDate!==a.fromDate || o.toDate!==a.toDate); }
function _loChangedList(){ return _loDraftOrig ? (state.loanerAssigns||[]).filter(_loAssignChanged) : []; }
/* 重複（同じ代車で期間が重なる）割当idの集合 */
function _loConflictSet(){
  const bad = new Set(), byLo = {};
  (state.loanerAssigns || []).forEach(function(a){ (byLo[a.loanerId] = byLo[a.loanerId] || []).push(a); });
  Object.keys(byLo).forEach(function(lo){
    const arr = byLo[lo].slice().sort(function(x,y){ return x.fromDate < y.fromDate ? -1 : 1; });
    for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++){
      if (!(arr[j].fromDate > arr[i].toDate || arr[j].toDate < arr[i].fromDate)){ bad.add(arr[i].id); bad.add(arr[j].id); }
    }
  });
  return bad;
}
function _loAssignLabel(a){
  const card = a.cardId ? (state.cards||[]).find(function(c){return c.id===a.cardId;}) : null;
  return card ? ((window.pitSurname?pitSurname(card.customer):(card.customer||''))||'予約') : (a.customer || '予約');
}
function _loName(id){ const l=(state.loaners||[]).find(function(x){return x.id===id;}); return l?l.name:id; }
function _loMD(s){ const p=String(s).split('-'); return (+p[1])+'/'+(+p[2]); }

function _loPd(s){ const p = String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function _loEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }

/* 代車の装備/寸法（ETC/ナビ/ISO/高さ/幅/長さ/区分/定員）が未設定なら、デモ用に変化を付けて初期化（実車は編集で上書き） */
function _loEnsureOpts(){
  (state.loaners || []).forEach(function(l, i){
    if (l.etc === undefined)  l.etc  = (i % 2 === 0);
    if (l.navi === undefined) l.navi = (i % 3 !== 0);
    if (l.iso === undefined)  l.iso  = (i % 4 === 0);
    if (l.height === undefined || l.height === null) l.height = 150 + (i % 6) * 3;    // 150〜165cm
    if (l.width  === undefined || l.width  === null) l.width  = 148 + (i % 5) * 4;    // 148〜164cm
    if (l.length === undefined || l.length === null) l.length = 340 + (i % 8) * 20;   // 340〜480cm
    if (l.category === undefined) l.category = ['kei','normal','import'][i % 3];
    if (l.seats === undefined || l.seats === null) l.seats = [4,4,5,5,5,7,8][i % 7];
    if (l.number === undefined || l.number === null){ const n = parseInt(String(l.name||'').replace(/[^0-9]/g,''),10); l.number = isNaN(n)?(i+1):n; }
    if (l.color === undefined) l.color = '';
  });
}
/* 入替予定の確定：入替日を過ぎたら 旧車を「引退」にして新車を正式番号(「(仮)」を外す)に。
   ※旧車の予約・履歴は消さない（retiredでカレンダー表示から外すだけ）＝新車へ未来の予約を入れていける運用。 */
function _loProcessReplacements(){
  const today = ymd(new Date());
  let changed = false;
  (state.loaners || []).forEach(function(nv){
    if (nv.replaceOf && nv.replaceDate && nv.replaceDate <= today){
      const old = (state.loaners||[]).find(function(l){ return l.id === nv.replaceOf; });
      if (old){ old.retired = true; old.retiredAt = today; }   // 撤去せず引退（予約/履歴は保持）
      state.fleetEvents = (state.fleetEvents||[]).filter(function(e){ return e.id !== ('rep_'+nv.id); });
      nv.name = '代車' + nv.number; delete nv.replaceOf; delete nv.replaceDate;
      changed = true;
    }
  });
  if (changed && window.PitDB) PitDB.save();
}
/* 絞り込み（装備＋区分）＆並べ替え（低い順） */
function _loFiltered(){
  let ls = (state.loaners || []).slice().filter(function(l){ return !l.retired; });   // 引退した代車は出さない（予約/履歴は残る）
  if (_loFilters.etc)  ls = ls.filter(function(l){ return l.etc; });
  if (_loFilters.navi) ls = ls.filter(function(l){ return l.navi; });
  if (_loFilters.iso)  ls = ls.filter(function(l){ return l.iso; });
  const anyCat = _loCats.kei || _loCats.normal || _loCats.import;
  if (anyCat) ls = ls.filter(function(l){ return _loCats[l.category]; });
  if (_loSortKey) ls.sort(function(a, b){ return (a[_loSortKey] != null ? a[_loSortKey] : 99999) - (b[_loSortKey] != null ? b[_loSortKey] : 99999); });
  return ls;
}
window.loToggleFilter = function(k){
  _loFilters[k] = !_loFilters[k];
  const b = document.querySelector('.lo-filter[data-k="' + k + '"]'); if (b) b.classList.toggle('on', _loFilters[k]);
  _loRefresh();
};
window.loToggleCat = function(cat){
  _loCats[cat] = !_loCats[cat];
  const b = document.querySelector('.lo-filter[data-cat="' + cat + '"]'); if (b) b.classList.toggle('on', _loCats[cat]);
  _loRefresh();
};
window.loToggleSort = function(key){
  _loSortKey = (_loSortKey === key) ? null : key;   // 並べ替えは1つだけ（再押下で解除）
  document.querySelectorAll('.lo-filter[data-sort]').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-sort') === _loSortKey); });
  _loRefresh();
};

function renderLoaner(){
  const grid = document.getElementById('loaner-grid');
  if (!grid) return;
  // 代車割当に id が無いとドラッグ移動(data-aid)が効かない＝旧データ/サンプル救済で必ず採番
  (state.loanerAssigns || []).forEach(function(a, i){
    if (a && !a.id) a.id = 'la' + Date.now().toString(36) + i.toString(36);
  });
  _loEnsureOpts();
  _loProcessReplacements();   // 入替日を過ぎた予定を確定
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
  setTimeout(loScrollToday, 0);
}

/* 代車の詳細ホバーは「常時・どのビューでも」効くようグローバルに1回だけ紐付け。
   対象＝[data-loid] を持つ要素（代車カレンダーの列ヘッダ／空きカレンダー・新規予約の代車ガントのヘッダ）。 */
(function(){
  if (_loVehBound) return; _loVehBound = true;
  document.addEventListener('mouseover', function(e){
    const hd = e.target.closest && e.target.closest('[data-loid]');
    if (hd) loVehHover(hd);
  });
  document.addEventListener('mouseout', function(e){
    const hd = e.target.closest && e.target.closest('[data-loid]');
    if (hd){ const to = e.relatedTarget; if (!to || !(to.closest && to.closest('[data-loid]'))) loVehHide(); }
  });
  document.addEventListener('scroll', loVehHide, true);
})();

/* 代車ヘッダのホバー＝代車の詳細カード（車種・ETC/ナビ/ISO/高さ） */
function loVehHover(headEl){
  const id = headEl.dataset.loid;
  const l = (state.loaners || []).find(function(x){ return x.id === id; });
  if (!l) return;
  let el = document.getElementById('lo-veh-hover');
  if (!el){ el = document.createElement('div'); el.id = 'lo-veh-hover'; document.body.appendChild(el); }
  const opt = function(on, label){ return '<span class="lvh-opt ' + (on ? 'on' : 'off') + '">' + (on ? '✓' : '✕') + ' ' + label + '</span>'; };
  const dim = function(label, v){ return '<span class="lvh-dim">' + label + '<b>' + (v != null ? _loEsc(v) : '—') + '</b></span>'; };
  const catLb = LO_CAT[l.category] || '';
  const num = (l.number != null ? l.number : (parseInt(String(l.name||'').replace(/[^0-9]/g,''),10) || ''));
  el.innerHTML =
      '<div class="lvh-head">'
        + (num !== '' ? '<span class="lvh-no">代車' + _loEsc(num) + '</span>' : '')
        + '<span class="lvh-name">' + _loEsc(l.model || '（車種未登録）') + '</span>'   // 車種名＝メイン
        + (l.color ? '<span class="lvh-color">' + _loEsc(l.color) + '</span>' : '')        // 色＝添え（落とす）
      + '</div>'
    + '<div class="lvh-badges">'
        + (l.plate ? '<span class="lvh-plate-badge">' + _loEsc(l.plate) + '</span>' : '')   // ナンバー＝バッジ
        + (catLb ? '<span class="lvh-cat ' + _loEsc(l.category) + '">' + catLb + '</span>' : '')
        + (l.seats != null ? '<span class="lvh-seats">定員' + _loEsc(l.seats) + '人</span>' : '')
      + '</div>'
    + '<div class="lvh-opts">' + opt(l.etc, 'ETC') + opt(l.navi, 'ナビ') + opt(l.iso, 'ISO') + '</div>'
    + '<div class="lvh-dims">' + dim('高さ ', l.height != null ? l.height + 'cm' : null) + dim('幅 ', l.width != null ? l.width + 'cm' : null) + dim('長さ ', l.length != null ? l.length + 'cm' : null) + '</div>'
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
  grid.style.gridTemplateColumns = '64px repeat(' + Math.max(1, ls.length) + ', minmax(76px, 92px))';   // 「小池 様 ハイエース」が収まる幅に固定（1frで広がらない・それ以上は…）
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
  const confSet = _loDraftOrig ? _loConflictSet() : null;        // 下書き中だけ重複判定
  const changedList = _loChangedList();                          // 元位置ゴースト用
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
      // 車両イベント（車検・点検・修理等）の予定オーバーレイ＝日付枠で目立たせる（セル全体を色づけ＋ラベル）
      let ov = '', evCls = '';
      const evs = (state.fleetEvents || []).filter(function(e){ return e.vehicleId === l.id && e.fromDate <= dStr && e.toDate >= dStr; });
      if (evs.length){
        const e0 = evs[0];
        const t = (typeof FL_EVT_TYPES !== 'undefined' ? FL_EVT_TYPES[e0.type] : null) || { color:'#3b82f6', label:'予定' };
        evCls = ' lo-evday';
        ov += '<span class="lo-evbg" style="background:' + t.color + '22;box-shadow:inset 4px 0 0 ' + t.color + ',inset -4px 0 0 ' + t.color + '"></span>';
        if (e0.fromDate === dStr) ov += '<span class="lo-evt-tag" style="background:' + t.color + '">🔧 ' + _loEsc(e0.label || t.label) + '</span>';
      }
      // 元位置ゴースト（下書きで動かした割当の、元の代車・日付）＝列の左端に点線で並べる
      let gh = '';
      if (changedList.length){
        const g = changedList.find(function(x){ const o=_loDraftOrig[x.id]; return o.loanerId===l.id && o.fromDate<=dStr && o.toDate>=dStr; });
        if (g){ const o=_loDraftOrig[g.id];
          gh = '<span class="lo-gh-line' + (o.fromDate===dStr?' st':'') + (o.toDate===dStr?' en':'') + '"></span>'
             + (o.fromDate===dStr ? '<span class="lo-gh-tag">元 ' + _loEsc(_loAssignLabel(g)) + '</span>' : '');
        }
      }
      const a = (state.loanerAssigns || []).find(function(x){ return x.loanerId === l.id && x.fromDate <= dStr && x.toDate >= dStr; });
      if (a){
        const isStart = (a.fromDate === dStr);
        const isEnd = (a.toDate === dStr);
        const card = a.cardId ? state.cards.find(function(c){ return c.id === a.cardId; }) : null;
        const teamColor = card ? (card.boardId === 'import' ? '#ec4899' : '#1db97a') : 'var(--brand)';
        const _nm = card ? ((window.pitSurname ? pitSurname(card.customer) : (card.customer || '')) || '予約') : (a.customer || '予約');
        const label = _nm + (card ? ' 様' : '') + (card && card.car ? ' ' + card.car : (a.car ? ' ' + a.car : ''));
        const isBad = confSet && confSet.has(a.id);
        const isChg = _loAssignChanged(a);
        h += '<div class="lo-cell lo-bk' + (isStart ? ' bk-start' : '') + (isEnd ? ' bk-end' : '') + (isStart && isEnd ? ' bk-single' : '') + (isToday ? ' lo-today' : '') + (isBad?' lo-bad':(isChg?' lo-chg':'')) + evCls + dayMods + '"' + attrs
           + ' style="--lo-team:' + teamColor + '">' + gh;
        if (isStart){
          h += '<span class="lo-badge' + (isChg?' chg':'') + '" draggable="true" data-aid="' + (a.id || '') + '"' + (card ? ' data-card-id="' + card.id + '" onclick="openDetail(\'' + card.id + '\')"' : '') + '>' + label + '</span>';
        }
        if (isEnd){
          h += '<span class="lo-end" draggable="true" data-aid="' + (a.id || '') + '">▼</span>';
        }
        h += ov + '</div>';
      } else {
        h += '<div class="lo-cell lo-free' + (isToday ? ' lo-today' : '') + evCls + dayMods + '"' + attrs + '>' + gh + ov + '</div>';
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
  _loRenderDraftBar();
}

/* バッジのドラッグ＝期間まるごと移動。動かした瞬間に下書きへ（保存しない・重複は赤で警告） */
function loMoveAssignTo(aid, destLo, destDate){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a || !destLo || !destDate) return;
  const dur = Math.round((_loPd(a.toDate) - _loPd(a.fromDate)) / 86400000);
  const newFrom = destDate;
  const newTo = ymd(addDays(_loPd(destDate), dur));
  if (a.loanerId === destLo && a.fromDate === newFrom) return;
  _loStartDraft();
  a.loanerId = destLo; a.fromDate = newFrom; a.toDate = newTo;   // 下書きに反映のみ（確定は一括実行）
  _loRefresh();
}

/* ▼のドラッグ＝返却日の伸縮。これも下書きへ。 */
function loResizeAssign(aid, destDate){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a || !destDate) return;
  let newTo = destDate;
  if (newTo < a.fromDate) newTo = a.fromDate;
  if (newTo === a.toDate) return;
  _loStartDraft();
  a.toDate = newTo;
  _loRefresh();
}

/* ===== 下書きバー（変更件数＋変更チップ＋破棄/やり直し/一括実行） ===== */
function _loRenderDraftBar(){
  const host = document.getElementById('lo-draft-bar');
  if (!host) return;
  const changed = _loChangedList();
  if (!_loDraftOrig || !changed.length){
    // 下書きなし＝バー非表示（やり直しボタンだけ applySnap があれば残す）
    host.innerHTML = _loApplySnap ? '<div class="lod-inner"><span class="lod-lbl">直前の一括実行：</span><button class="lod-btn warn" onclick="loDraftUndoApply()">↩ やり直す</button></div>' : '';
    host.style.display = (_loApplySnap) ? 'block' : 'none';
    return;
  }
  const bad = _loConflictSet();
  const chips = changed.map(function(a){
    const o = _loDraftOrig[a.id], ib = bad.has(a.id);
    return '<span class="lod-chip' + (ib?' bad':'') + '"><b>' + _loEsc(_loAssignLabel(a)) + '</b> '
      + _loName(o.loanerId) + ' ' + _loMD(o.fromDate) + '→' + _loName(a.loanerId) + ' ' + _loMD(a.fromDate) + '〜' + _loMD(a.toDate)
      + '<i onclick="loDraftUndoOne(\'' + a.id + '\')">✕</i></span>';
  }).join('');
  const hasBad = bad.size > 0;
  host.style.display = 'block';
  host.innerHTML = '<div class="lod-inner">'
    + '<span class="lod-lbl">📝 下書き <b>' + changed.length + '件</b>' + (hasBad ? '<span class="lod-warn"> ⚠ 重複あり</span>' : '') + '</span>'
    + '<div class="lod-chips">' + chips + '</div>'
    + '<button class="lod-btn" onclick="loDraftDiscard()">破棄</button>'
    + '<button class="lod-btn primary" ' + (hasBad ? 'disabled' : '') + ' onclick="loDraftApply()">' + (hasBad ? '⚠ 重複を直して' : '✓ 一括実行（' + changed.length + '）') + '</button>'
    + '</div>';
}
window.loDraftUndoOne = function(id){
  if (!_loDraftOrig) return;
  const o = _loDraftOrig[id], a = (state.loanerAssigns||[]).find(function(x){return x.id===id;});
  if (o && a){ a.loanerId=o.loanerId; a.fromDate=o.fromDate; a.toDate=o.toDate; }
  if (!_loChangedList().length) _loDraftOrig = null;   // 全部戻ったら下書き解除
  _loRefresh();
};
window.loDraftDiscard = function(){
  if (!_loDraftOrig || !_loChangedList().length) return;
  if (!confirm('下書き中の代車変更を全部破棄します。よろしいですか？')) return;
  (state.loanerAssigns||[]).forEach(function(a){ const o=_loDraftOrig[a.id]; if(o){ a.loanerId=o.loanerId; a.fromDate=o.fromDate; a.toDate=o.toDate; } });
  _loDraftOrig = null;
  _loRefresh();
};
window.loDraftApply = function(){
  if (!_loDraftOrig) return;
  const changed = _loChangedList(); if (!changed.length) return;
  if (_loConflictSet().size) { alert('重複している予約があります。重ならないように直してから一括実行してください。'); return; }
  if (!confirm(changed.length + ' 件の代車変更をまとめて反映します。よろしいですか？')) return;
  _loApplySnap = _loDraftOrig;   // 実行前の状態＝やり直し用
  // 紐づくカードの代車情報を同期
  changed.forEach(function(a){
    const card = a.cardId ? (state.cards||[]).find(function(c){return c.id===a.cardId;}) : null;
    if (card){ card.loanerId=a.loanerId; card.loanerFrom=a.fromDate; card.loanerTo=a.toDate; }
  });
  _loDraftOrig = null;
  if (window.PitDB) PitDB.save();
  _loRefresh();
  alert('反映しました（' + changed.length + '件）。直後なら「↩ やり直す」で実行前に戻せます。');
};
window.loDraftUndoApply = function(){
  if (!_loApplySnap) return;
  if (!confirm('直前の一括実行を取り消して、実行前の状態に戻します。よろしいですか？')) return;
  (state.loanerAssigns||[]).forEach(function(a){ const o=_loApplySnap[a.id]; if(o){ a.loanerId=o.loanerId; a.fromDate=o.fromDate; a.toDate=o.toDate; const card=a.cardId?(state.cards||[]).find(function(c){return c.id===a.cardId;}):null; if(card){card.loanerId=a.loanerId;card.loanerFrom=a.fromDate;card.loanerTo=a.toDate;} } });
  _loApplySnap = null;
  if (window.PitDB) PitDB.save();
  _loRefresh();
};
