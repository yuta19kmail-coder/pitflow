/* ========================================
   fleet.js  -  代車・自社車両管理／PitFlow v0.12.0
   ----------------------------------------
   ・月次カレンダー：1列1ヶ月。右へスクロールすると**未来永劫**列が増える。
   ・**月ヘッダをクリック → その月の日別（1〜31日）表示**に切替（← 月表示で戻る）。
   ・車検🔴・12点🟠に加えて**自由イベント**（車検入庫・リースアップ/切替・その他）を登録できる。
     → 代車利用カレンダー（代車ビュー）にも重ねて表示される。
   ・セルをクリック＝その車両・その日付でイベント追加。イベントチップをクリック＝編集。
   ======================================== */
let _fleetEditId = null;
let _flMode = 'month';      // 'month' | 'day'
let _flMonths = 24;         // 月モードの列数（右スクロールで増殖）
let _flDay = null;          // 日モードの対象月（Date）

const FL_EVT_TYPES = {
  shakenIn: { label: '車検入庫',        color: '#ef4444' },
  tenken:   { label: '12ヶ月点検',      color: '#f59e0b' },
  lease:    { label: 'リースアップ/切替', color: '#a855f7' },
  other:    { label: 'その他',          color: '#3b82f6' }
};

function _fleetEsc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _flPd(s){ const p = String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function _flAllVehicles(){ return (state.loaners || []).concat(state.companyCars || []); }
function _flEvents(){ if (!Array.isArray(state.fleetEvents)) state.fleetEvents = []; return state.fleetEvents; }
function _fleetFind(id){
  let v = (state.loaners || []).find(function(x){ return x.id === id; });
  if (v) return { v: v, kind: 'loaner' };
  v = (state.companyCars || []).find(function(x){ return x.id === id; });
  if (v) return { v: v, kind: 'company' };
  return null;
}

function renderFleet(){
  const wrap = document.getElementById('view-fleet-body');
  if (!wrap) return;
  if (!Array.isArray(state.companyCars)) state.companyCars = [];
  if (typeof _loEnsureOpts === 'function') _loEnsureOpts();   // 代車の装備オプション初期化（未設定分）
  _flEvents();

  let h = '';

  /* ===== ① カレンダー（最上部） ===== */
  h += '<div class="fl-card">';
  if (_flMode === 'month'){
    h += '<div class="fl-h">📅 車両カレンダー（月をクリック＝日別表示／右へ無限）<span class="fl-note">🔴車検 🟠12点 ＋ イベント（セルをクリックで追加）</span></div>';
    h += flMonthCalHtml();
  } else {
    const y = _flDay.getFullYear(), m = _flDay.getMonth();
    h += '<div class="fl-h"><span><button class="vh-btn" onclick="flBackMonth()">← 月表示</button>　📅 ' + y + '年' + (m+1) + '月（日別）</span><span class="fl-note">セルをクリック＝イベント追加／チップ＝編集</span></div>';
    h += flDayCalHtml(y, m);
  }
  h += '</div>';

  /* ===== ② 車両リスト ===== */
  const groups = [
    { name: '🚙 代車', arr: state.loaners || [] },
    { name: '🚐 社用車', arr: state.companyCars || [] }
  ];
  groups.forEach(function(g, gi){
    h += '<div class="fl-card"><div class="fl-h">' + g.name + '（' + g.arr.length + '台）'
       + (gi === 0 ? '<button class="vh-btn primary" onclick="fleetOpenModal()">＋ 車両を追加</button>' : '') + '</div>';
    if (!g.arr.length){ h += '<div class="fl-empty">登録なし</div>'; }
    h += '<div class="fl-rows">';
    g.arr.forEach(function(v){
      h += '<div class="fl-row">'
         + '<div class="fl-main"><div class="fl-name">' + _fleetEsc(v.name) + (v.retired ? '<span class="fl-retired">引退</span>' : '') + (v.replaceDate ? '<span class="fl-retired plan">入替予定 ' + _fleetEsc(v.replaceDate) + '</span>' : '') + '</div>'
         + '<div class="fl-sub">' + _fleetEsc(v.model || '—') + (v.color ? '（' + _fleetEsc(v.color) + '）' : '') + (v.plate ? ' ・ ' + _fleetEsc(v.plate) : '')
         + (gi === 0 ? '<br>'
             + (v.category ? '<span class="fl-opttag cat">' + ({kei:'軽',normal:'普通車',import:'輸入車'}[v.category] || '') + '</span>' : '')
             + (v.etc ? '<span class="fl-opttag">ETC</span>' : '') + (v.navi ? '<span class="fl-opttag">ナビ</span>' : '') + (v.iso ? '<span class="fl-opttag">ISO</span>' : '')
             + (v.seats != null ? '<span class="fl-opttag h">定員' + _fleetEsc(v.seats) + '人</span>' : '')
             + (v.height != null ? '<span class="fl-opttag h">高' + _fleetEsc(v.height) + '</span>' : '')
             + (v.width  != null ? '<span class="fl-opttag h">幅' + _fleetEsc(v.width) + '</span>' : '')
             + (v.length != null ? '<span class="fl-opttag h">長' + _fleetEsc(v.length) + '</span>' : '')
           : '')
         + (v.shakenDate ? '<br>車検 ' + _fleetEsc(v.shakenDate) : '') + (v.tenkenDate ? ' ・ 12点 ' + _fleetEsc(v.tenkenDate) : '') + '</div></div>'
         + '<button class="fl-btn" onclick="fleetOpenModal(\'' + v.id + '\')">✏️</button>'
         + '<button class="fl-btn del" onclick="fleetDelete(\'' + v.id + '\')">🗑</button>'
         + '</div>';
    });
    h += '</div></div>';
  });

  wrap.innerHTML = h;

  // 月モード：右端付近までスクロールしたら列を増やす（未来永劫）
  const cw = document.getElementById('fl-cal-scroll');
  if (cw && _flMode === 'month'){
    cw.addEventListener('scroll', function(){
      if (cw.scrollLeft + cw.clientWidth > cw.scrollWidth - 300){
        const keep = cw.scrollLeft;
        _flMonths += 12;
        renderFleet();
        const cw2 = document.getElementById('fl-cal-scroll');
        if (cw2) cw2.scrollLeft = keep;
      }
    });
  }
}

/* 月モードのカレンダー */
function flMonthCalHtml(){
  const months = [];
  const base = new Date(); base.setDate(1); base.setHours(0,0,0,0);
  for (let i = 0; i < _flMonths; i++){ months.push(new Date(base.getFullYear(), base.getMonth() + i, 1)); }
  const vehicles = _flAllVehicles();
  let h = '<div class="fl-cal-wrap" id="fl-cal-scroll"><div class="fl-cal" style="grid-template-columns:120px repeat(' + months.length + ', minmax(86px,1fr))">';
  h += '<div class="fl-cal-h fl-cal-corner">車両</div>';
  months.forEach(function(m){
    h += '<div class="fl-cal-h fl-cal-m" onclick="flZoom(' + m.getFullYear() + ',' + m.getMonth() + ')" title="クリックで日別表示">'
       + (m.getMonth()+1) + '月' + (m.getMonth() === 0 || m.getTime() === months[0].getTime() ? '<span>' + m.getFullYear() + '</span>' : '') + '</div>';
  });
  vehicles.forEach(function(v){
    h += '<div class="fl-cal-name" title="' + _fleetEsc(v.model || '') + '">' + _fleetEsc(v.name) + '</div>';
    months.forEach(function(m){
      const y = m.getFullYear(), mo = m.getMonth();
      const ym = y + '-' + String(mo+1).padStart(2, '0');
      const first = ym + '-01';
      const last = ym + '-' + String(new Date(y, mo+1, 0).getDate()).padStart(2, '0');
      const sh = v.shakenDate && v.shakenDate.indexOf(ym) === 0;
      const tk = v.tenkenDate && v.tenkenDate.indexOf(ym) === 0;
      const evs = _flEvents().filter(function(e){ return e.vehicleId === v.id && e.fromDate <= last && e.toDate >= first; });
      h += '<div class="fl-cal-cell" onclick="flOpenEventModal(\'' + v.id + '\',\'' + first + '\')">';
      if (sh) h += '<span class="fl-bdg shaken" title="車検満了 ' + _fleetEsc(v.shakenDate) + '">車検</span>';
      if (tk) h += '<span class="fl-bdg tenken" title="12点 ' + _fleetEsc(v.tenkenDate) + '">12点</span>';
      evs.forEach(function(e){
        const t = FL_EVT_TYPES[e.type] || FL_EVT_TYPES.other;
        h += '<span class="fl-evt" style="background:' + t.color + '" title="' + _fleetEsc(e.fromDate + '〜' + e.toDate) + '" onclick="event.stopPropagation();flOpenEventModal(null,null,\'' + e.id + '\')">' + _fleetEsc(e.label || t.label) + '</span>';
      });
      h += '</div>';
    });
  });
  h += '</div></div>';
  return h;
}

/* 日モードのカレンダー（1列＝1日・代車の利用状況を透かし表示） */
function flDayCalHtml(y, mo){
  const last = new Date(y, mo+1, 0).getDate();
  const vehicles = _flAllVehicles();
  const closedDow = (state.settings && state.settings.closedDow) || [];
  const metas = [];
  for (let d = 1; d <= last; d++){
    const dt = new Date(y, mo, d);
    const dow = dt.getDay();
    const ds = y + '-' + String(mo+1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    metas.push({ d: d, ds: ds, dow: dow, hol: (window.Holidays && Holidays.name(ds)) || null, closed: closedDow.indexOf(dow) >= 0 });
  }
  let h = '<div class="fl-cal-wrap" id="fl-cal-scroll"><div class="fl-cal" style="grid-template-columns:120px repeat(' + last + ', minmax(56px,1fr))">';
  h += '<div class="fl-cal-h fl-cal-corner">車両</div>';
  metas.forEach(function(m){
    h += '<div class="fl-cal-h' + (m.dow === 0 ? ' sun' : (m.dow === 6 ? ' sat' : '')) + (m.hol ? ' fl-holh' : '') + (m.closed ? ' fl-closedh' : '') + '"' + (m.hol ? ' title="' + _fleetEsc(m.hol) + '"' : '') + '>' + m.d + '<span>' + '日月火水木金土'[m.dow] + (m.closed ? '・休' : '') + (m.hol ? '・祝' : '') + '</span></div>';
  });
  vehicles.forEach(function(v){
    const isLoanerVeh = (state.loaners || []).some(function(l){ return l.id === v.id; });
    h += '<div class="fl-cal-name" title="' + _fleetEsc(v.model || '') + '">' + _fleetEsc(v.name) + '</div>';
    metas.forEach(function(m){
      const ds = m.ds;
      const sh = v.shakenDate === ds;
      const tk = v.tenkenDate === ds;
      const evs = _flEvents().filter(function(e){ return e.vehicleId === v.id && e.fromDate <= ds && e.toDate >= ds; });
      // 代車の貸出状況（利用カレンダー）を透かして重ねる
      let useCls = '', useTag = '';
      if (isLoanerVeh){
        const a = (state.loanerAssigns || []).find(function(x){ return x.loanerId === v.id && x.fromDate <= ds && x.toDate >= ds; });
        if (a){ useCls = ' fl-use'; if (a.fromDate === ds) useTag = '<span class="fl-use-tag">' + _fleetEsc(a.customer || '貸出') + '</span>'; }
      }
      h += '<div class="fl-cal-cell fl-day' + useCls + (m.closed ? ' fl-closedc' : '') + (m.hol ? ' fl-holc' : '') + '" onclick="flOpenEventModal(\'' + v.id + '\',\'' + ds + '\')">';
      h += useTag;
      if (sh) h += '<span class="fl-bdg shaken">車検</span>';
      if (tk) h += '<span class="fl-bdg tenken">12点</span>';
      evs.forEach(function(e){
        const t = FL_EVT_TYPES[e.type] || FL_EVT_TYPES.other;
        h += '<span class="fl-evt" style="background:' + t.color + '" onclick="event.stopPropagation();flOpenEventModal(null,null,\'' + e.id + '\')">' + _fleetEsc((e.label || t.label).slice(0, 4)) + '</span>';
      });
      h += '</div>';
    });
  });
  h += '</div></div>';
  return h;
}

function flZoom(y, m){ _flMode = 'day'; _flDay = new Date(y, m, 1); renderFleet(); }
function flBackMonth(){ _flMode = 'month'; renderFleet(); }

/* ===== イベント 追加・編集ポップアップ ===== */
let _flEvtEditId = null;
function flOpenEventModal(vehicleId, dateStr, eventId){
  _flEvtEditId = eventId || null;
  const ev = eventId ? _flEvents().find(function(e){ return e.id === eventId; }) : null;
  const sel = document.getElementById('flev-vehicle');
  sel.innerHTML = _flAllVehicles().map(function(v){
    return '<option value="' + v.id + '"' + ((ev ? ev.vehicleId : vehicleId) === v.id ? ' selected' : '') + '>' + _fleetEsc(v.name) + '（' + _fleetEsc(v.model || '') + '）</option>';
  }).join('');
  document.getElementById('flev-type').value  = ev ? ev.type : 'shakenIn';
  document.getElementById('flev-label').value = ev ? (ev.label || '') : '';
  document.getElementById('flev-from').value  = ev ? ev.fromDate : (dateStr || '');
  document.getElementById('flev-to').value    = ev ? ev.toDate : (dateStr || '');
  document.getElementById('flev-title').textContent = ev ? '✏️ イベントを編集' : '＋ イベントを追加';
  document.getElementById('flev-del').style.display = ev ? '' : 'none';
  document.getElementById('fleet-event-modal').classList.add('show');
}
function flEventClose(){ _flEvtEditId = null; document.getElementById('fleet-event-modal').classList.remove('show'); }
function flEventSubmit(){
  const vehicleId = document.getElementById('flev-vehicle').value;
  const type  = document.getElementById('flev-type').value || 'other';
  const label = (document.getElementById('flev-label').value || '').trim();
  let from = document.getElementById('flev-from').value;
  let to   = document.getElementById('flev-to').value;
  if (!vehicleId || !from){ alert('車両と開始日を入れてください'); return; }
  if (!to || to < from) to = from;
  if (_flEvtEditId){
    const ev = _flEvents().find(function(e){ return e.id === _flEvtEditId; });
    if (ev){ ev.vehicleId = vehicleId; ev.type = type; ev.label = label; ev.fromDate = from; ev.toDate = to; }
  } else {
    _flEvents().push({ id: 'ev' + Date.now().toString(36), vehicleId: vehicleId, type: type, label: label, fromDate: from, toDate: to });
  }
  if (window.PitDB) PitDB.save();
  flEventClose();
  renderFleet();
}
function flEventDelete(){
  if (!_flEvtEditId) return;
  if (!confirm('このイベントを削除しますか？')) return;
  state.fleetEvents = _flEvents().filter(function(e){ return e.id !== _flEvtEditId; });
  if (window.PitDB) PitDB.save();
  flEventClose();
  renderFleet();
}

/* ===== 車両 登録・編集ポップアップ ===== */
function _flLoanerNum(l){ if (l.number != null) return l.number; const n = parseInt(String(l.name||'').replace(/[^0-9]/g,''),10); return isNaN(n)?0:n; }
function _flNextNum(){ let mx=0; (state.loaners||[]).forEach(function(l){ mx=Math.max(mx,_flLoanerNum(l)); }); return mx+1; }
function _flPlateParts(p){ const a=String(p||'').trim().split(/\s+/); return { region:a[0]||'', cls:a[1]||'', kana:a[2]||'', num:a[3]||'' }; }
function _flPlateJoin(){ const v=function(id){return (document.getElementById(id).value||'').trim();}; return [v('fl-pl-region'),v('fl-pl-cls'),v('fl-pl-kana'),v('fl-pl-num')].filter(Boolean).join(' '); }
function _flZ2H(s){ return String(s==null?'':s).replace(/[０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0xFEE0);}); }
/* ナンバー＝1BOX＋クリックでガイド（新規予約と同じcf-plate構造）。入力ブレ防止：全角→半角・分類3桁・一連4桁 */
window.flPlateToggle = function(){
  const box=document.getElementById('fl-plate'); if(!box) return;
  box.classList.toggle('open');
  if(box.classList.contains('open')){ const r=document.getElementById('fl-pl-region'); if(r) setTimeout(function(){ r.focus(); },0); }
};
window.flPlateSync = function(){
  const cls=document.getElementById('fl-pl-cls'); if(cls) cls.value=_flZ2H(cls.value).replace(/[^0-9]/g,'').slice(0,3);
  const num=document.getElementById('fl-pl-num'); if(num) num.value=_flZ2H(num.value).replace(/[^0-9]/g,'').slice(0,4);
  const main=document.getElementById('fl-pl-main'); if(main) main.value=_flPlateJoin();
};
document.addEventListener('mousedown', function(e){
  const box=document.getElementById('fl-plate');
  if(box && box.classList.contains('open') && !box.contains(e.target)) box.classList.remove('open');
});
/* 車検満了/12点 → カレンダーに自動でイベント（車両×種別で1件・上書き更新）。代車カレンダーにも出る。 */
function _flSyncVehEvent(vehicleId, type, date){
  const eid = 'auto_' + vehicleId + '_' + type;
  const evs = _flEvents();
  const i = evs.findIndex(function(e){ return e.id === eid; });
  if (!date){ if (i>=0) evs.splice(i,1); return; }
  const rec = { id:eid, vehicleId:vehicleId, type:type, label:(FL_EVT_TYPES[type]?FL_EVT_TYPES[type].label:''), fromDate:date, toDate:date, auto:true };
  if (i>=0) evs[i]=rec; else evs.push(rec);
}

function fleetOpenModal(id){
  _fleetEditId = id || null;
  const f = id ? _fleetFind(id) : null;
  const v = f ? f.v : {};
  document.getElementById('fl-modal-title').textContent = f ? '✏️ 車両を編集' : '＋ 車両を追加';
  document.getElementById('fl-kind').value  = f ? f.kind : 'loaner';
  document.getElementById('fl-number').value = f ? _flLoanerNum(v) : _flNextNum();   // 自動末番
  document.getElementById('fl-model').value = v.model || '';                          // 車種名
  document.getElementById('fl-color').value = v.color || '';                          // 色
  const pp = _flPlateParts(v.plate);
  document.getElementById('fl-pl-region').value = pp.region;
  document.getElementById('fl-pl-cls').value    = pp.cls;
  document.getElementById('fl-pl-kana').value   = pp.kana;
  document.getElementById('fl-pl-num').value    = pp.num;
  document.getElementById('fl-pl-main').value   = v.plate || '';
  const _pg = document.getElementById('fl-pl-guide'); if (_pg) _pg.style.display = 'none';
  document.getElementById('fl-shaken').value = v.shakenDate || '';
  document.getElementById('fl-tenken').value = v.tenkenDate || '';
  document.getElementById('fl-height').value = (v.height != null ? v.height : '');
  document.getElementById('fl-width').value  = (v.width  != null ? v.width  : '');
  document.getElementById('fl-length').value = (v.length != null ? v.length : '');
  document.getElementById('fl-cat').value    = v.category || 'kei';
  document.getElementById('fl-seats').value  = (v.seats != null ? v.seats : '');
  document.getElementById('fl-etc').checked  = !!v.etc;
  document.getElementById('fl-navi').checked = !!v.navi;
  document.getElementById('fl-iso').checked  = !!v.iso;
  document.getElementById('fl-repdate').value = v.replaceDate || '';
  flNumberCheck();
  document.getElementById('fleet-modal').classList.add('show');
  const n = document.getElementById('fl-model'); if (n) n.focus();
}
/* 番号入力時：その番号が他の代車で使用中なら「入替予定」欄を出す */
function flNumberCheck(){
  const num = Number(document.getElementById('fl-number').value);
  const row = document.getElementById('fl-rep-row');
  if (!row) return;
  const dup = num && (state.loaners||[]).some(function(l){ return _flLoanerNum(l)===num && l.id!==_fleetEditId; });
  row.style.display = dup ? 'block' : 'none';
}
window.flNumberCheck = flNumberCheck;
function fleetCloseModal(){
  _fleetEditId = null;
  document.getElementById('fleet-modal').classList.remove('show');
}
function fleetSubmit(){
  const kind   = document.getElementById('fl-kind').value || 'loaner';
  const number = Number(document.getElementById('fl-number').value) || _flNextNum();
  const model  = (document.getElementById('fl-model').value || '').trim();
  const color  = (document.getElementById('fl-color').value || '').trim();
  const plate  = _flPlateJoin();
  const shaken = document.getElementById('fl-shaken').value || '';
  const tenken = document.getElementById('fl-tenken').value || '';
  const _num = function(id){ const x = document.getElementById(id).value; return (x === '' || x == null) ? null : Number(x); };
  const height=_num('fl-height'), width=_num('fl-width'), length=_num('fl-length');
  const category = document.getElementById('fl-cat').value || 'kei';
  const seats = _num('fl-seats');
  const etc=!!document.getElementById('fl-etc').checked, navi=!!document.getElementById('fl-navi').checked, iso=!!document.getElementById('fl-iso').checked;
  if (!model){ alert('車種名を入れてください（例：タント）'); return; }
  if (!Array.isArray(state.companyCars)) state.companyCars = [];

  // 入替判定（新規で、その番号が既存の代車に使われている）
  const dupLoaner = (kind==='loaner') ? (state.loaners||[]).find(function(l){ return _flLoanerNum(l)===number && l.id!==_fleetEditId; }) : null;
  const repDate = (dupLoaner && !_fleetEditId) ? (document.getElementById('fl-repdate').value || '') : '';

  const labelName = (kind === 'loaner') ? ('代車' + number + (repDate ? '(仮)' : '')) : (model || '社用車');
  if (_fleetEditId){
    const f = _fleetFind(_fleetEditId);
    if (f){
      if (f.kind !== kind){ const fromArr=f.kind==='loaner'?state.loaners:state.companyCars, toArr=kind==='loaner'?state.loaners:state.companyCars; fromArr.splice(fromArr.indexOf(f.v),1); toArr.push(f.v); }
      f.v.name = (kind==='loaner'?'代車'+number:(model||f.v.name)); f.v.number = number; f.v.model = model; f.v.color = color; f.v.plate = plate;
      f.v.shakenDate = shaken; f.v.tenkenDate = tenken;
      f.v.height=height; f.v.width=width; f.v.length=length; f.v.category=category; f.v.seats=seats; f.v.etc=etc; f.v.navi=navi; f.v.iso=iso;
      _flSyncVehEvent(f.v.id, 'shakenIn', shaken);
      _flSyncVehEvent(f.v.id, 'tenken', tenken);
    }
  } else {
    const id = (kind === 'loaner' ? 'L' : 'C') + Date.now().toString(36);
    const rec = { id:id, name:labelName, number:number, model:model, color:color, plate:plate, shakenDate:shaken, tenkenDate:tenken,
      height:height, width:width, length:length, category:category, seats:seats, etc:etc, navi:navi, iso:iso };
    if (dupLoaner && repDate){ rec.replaceOf = dupLoaner.id; rec.replaceDate = repDate; }
    (kind === 'loaner' ? state.loaners : state.companyCars).push(rec);
    _flSyncVehEvent(id, 'shakenIn', shaken);
    _flSyncVehEvent(id, 'tenken', tenken);
    // 入替予定＝旧車のカレンダーに「代車入替」イベント（〜入替日）＋新車にも開始予定
    if (dupLoaner && repDate){
      _flEvents().push({ id:'rep_'+id, vehicleId:dupLoaner.id, type:'lease', label:'代車'+number+'入替→新車へ', fromDate:ymd(new Date()), toDate:repDate });
    }
  }
  if (window.PitDB) PitDB.save();
  fleetCloseModal();
  renderFleet();
}
function fleetDelete(id){
  const f = _fleetFind(id);
  if (!f) return;
  const isLoaner = (f.kind === 'loaner');
  const cnt = isLoaner ? (state.loanerAssigns || []).filter(function(a){ return a.loanerId === id; }).length : 0;
  if (!confirm('「' + f.v.name + '」を削除しますか？' + (cnt ? '\n（この代車の予約 ' + cnt + ' 件も一緒に消えます）' : ''))) return;
  const arr = isLoaner ? state.loaners : state.companyCars;
  arr.splice(arr.indexOf(f.v), 1);
  if (isLoaner) state.loanerAssigns = (state.loanerAssigns || []).filter(function(a){ return a.loanerId !== id; });
  state.fleetEvents = _flEvents().filter(function(e){ return e.vehicleId !== id; });
  if (_fleetEditId === id) _fleetEditId = null;
  if (window.PitDB) PitDB.save();
  renderFleet();
}
