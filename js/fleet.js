/* ========================================
   fleet.js  -  代車・自社車両管理（管理）／PitFlow v0.10.0
   ----------------------------------------
   ・代車(state.loaners)と社用車(state.companyCars)の 登録・編集（入れ替え）・削除。
   ・横軸＝月次（1列1ヶ月×12ヶ月）のカレンダーに 車検🔴・12点🟠 の期日を表示。
   ・将来：期日が近づいたら自動で入庫カード作成 or 通知（現状は表示のみ）。
   ======================================== */
let _fleetEditId = null;

function _fleetEsc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
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
  const editing = _fleetEditId ? _fleetFind(_fleetEditId) : null;
  const ev = editing ? editing.v : {};
  const ekind = editing ? editing.kind : 'loaner';

  let h = '';

  /* ===== 登録・編集フォーム ===== */
  h += '<div class="fl-card">';
  h += '<div class="fl-h">' + (editing ? '✏️ 車両を編集（入れ替えは内容を書き換えて更新）' : '＋ 車両を追加') + '</div>';
  h += '<div class="fl-form">';
  h += '<select id="fl-kind" class="fl-in"><option value="loaner"' + (ekind==='loaner' ? ' selected' : '') + '>代車</option><option value="company"' + (ekind==='company' ? ' selected' : '') + '>社用車</option></select>';
  h += '<input id="fl-name" class="fl-in" placeholder="名前（例：代車5／積載車）" value="' + _fleetEsc(ev.name) + '">';
  h += '<input id="fl-model" class="fl-in" placeholder="車種" value="' + _fleetEsc(ev.model) + '">';
  h += '<input id="fl-plate" class="fl-in" placeholder="ナンバー" value="' + _fleetEsc(ev.plate) + '">';
  h += '<label class="fl-lb">車検満了 <input id="fl-shaken" type="date" class="fl-in" value="' + _fleetEsc(ev.shakenDate) + '"></label>';
  h += '<label class="fl-lb">12点予定 <input id="fl-tenken" type="date" class="fl-in" value="' + _fleetEsc(ev.tenkenDate) + '"></label>';
  h += '<button class="vh-btn primary" onclick="fleetSubmit()">' + (editing ? '✓ 更新' : '＋ 追加') + '</button>';
  if (editing) h += '<button class="vh-btn" onclick="fleetCancel()">キャンセル</button>';
  h += '</div></div>';

  /* ===== 車両リスト ===== */
  [{ key:'loaner', name:'🚙 代車', arr: state.loaners || [] }, { key:'company', name:'🚐 社用車', arr: state.companyCars || [] }].forEach(function(g){
    h += '<div class="fl-card"><div class="fl-h">' + g.name + '（' + g.arr.length + '台）</div>';
    if (!g.arr.length){ h += '<div class="fl-empty">登録なし</div>'; }
    g.arr.forEach(function(v){
      h += '<div class="fl-row' + (_fleetEditId === v.id ? ' editing' : '') + '">'
         + '<div class="fl-main"><div class="fl-name">' + _fleetEsc(v.name) + '</div>'
         + '<div class="fl-sub">' + _fleetEsc(v.model || '—') + (v.plate ? ' ・ ' + _fleetEsc(v.plate) : '')
         + (v.shakenDate ? ' ・ 車検 ' + _fleetEsc(v.shakenDate) : '') + (v.tenkenDate ? ' ・ 12点 ' + _fleetEsc(v.tenkenDate) : '') + '</div></div>'
         + '<button class="fl-btn" onclick="fleetEdit(\'' + v.id + '\')">✏️ 編集</button>'
         + '<button class="fl-btn del" onclick="fleetDelete(\'' + v.id + '\')">🗑</button>'
         + '</div>';
    });
    h += '</div>';
  });

  /* ===== 月次カレンダー（横軸＝月・1列1ヶ月） ===== */
  const months = [];
  const base = new Date(); base.setDate(1); base.setHours(0,0,0,0);
  for (let i = 0; i < 12; i++){ months.push(new Date(base.getFullYear(), base.getMonth() + i, 1)); }
  const all = (state.loaners || []).concat(state.companyCars || []);
  h += '<div class="fl-card">';
  h += '<div class="fl-h">📅 車検・12ヶ月点検カレンダー（12ヶ月）<span class="fl-note">🔴車検 ／ 🟠12点</span></div>';
  h += '<div class="fl-cal" style="grid-template-columns:110px repeat(12, 1fr)">';
  h += '<div class="fl-cal-h">車両</div>';
  months.forEach(function(m){ h += '<div class="fl-cal-h">' + (m.getMonth()+1) + '月' + (m.getMonth() === 0 ? '<span>' + m.getFullYear() + '</span>' : '') + '</div>'; });
  all.forEach(function(v){
    h += '<div class="fl-cal-name">' + _fleetEsc(v.name) + '</div>';
    months.forEach(function(m){
      const ym = m.getFullYear() + '-' + String(m.getMonth()+1).padStart(2, '0');
      const sh = v.shakenDate && v.shakenDate.indexOf(ym) === 0;
      const tk = v.tenkenDate && v.tenkenDate.indexOf(ym) === 0;
      h += '<div class="fl-cal-cell">'
         + (sh ? '<span class="fl-bdg shaken" title="車検満了 ' + _fleetEsc(v.shakenDate) + '">車検</span>' : '')
         + (tk ? '<span class="fl-bdg tenken" title="12ヶ月点検 ' + _fleetEsc(v.tenkenDate) + '">12点</span>' : '')
         + '</div>';
    });
  });
  h += '</div>';
  h += '<div class="fl-note" style="margin-top:10px">⏭ 将来：期日が近づいたら<b>自動で入庫カードを作成 or 通知</b>が来るようにする予定（今は表示のみ）。</div>';
  h += '</div>';

  wrap.innerHTML = h;
}

function fleetEdit(id){ _fleetEditId = id; renderFleet(); const f = document.getElementById('fl-name'); if (f) f.focus(); }
function fleetCancel(){ _fleetEditId = null; renderFleet(); }

function fleetSubmit(){
  const kind  = (document.getElementById('fl-kind') || {}).value || 'loaner';
  const name  = ((document.getElementById('fl-name') || {}).value || '').trim();
  const model = ((document.getElementById('fl-model') || {}).value || '').trim();
  const plate = ((document.getElementById('fl-plate') || {}).value || '').trim();
  const shaken = (document.getElementById('fl-shaken') || {}).value || '';
  const tenken = (document.getElementById('fl-tenken') || {}).value || '';
  if (!name){ alert('名前を入れてください（例：代車5）'); return; }
  if (!Array.isArray(state.companyCars)) state.companyCars = [];

  if (_fleetEditId){
    const f = _fleetFind(_fleetEditId);
    if (f){
      // 種別が変わったら配列間で移動
      if (f.kind !== kind){
        const fromArr = f.kind === 'loaner' ? state.loaners : state.companyCars;
        const toArr   = kind === 'loaner' ? state.loaners : state.companyCars;
        fromArr.splice(fromArr.indexOf(f.v), 1);
        toArr.push(f.v);
      }
      f.v.name = name; f.v.model = model; f.v.plate = plate;
      f.v.shakenDate = shaken; f.v.tenkenDate = tenken;
    }
    _fleetEditId = null;
  } else {
    const id = (kind === 'loaner' ? 'L' : 'C') + Date.now().toString(36);
    const v = { id: id, name: name, model: model, plate: plate, shakenDate: shaken, tenkenDate: tenken };
    (kind === 'loaner' ? state.loaners : state.companyCars).push(v);
  }
  if (window.PitDB) PitDB.save();
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
  if (_fleetEditId === id) _fleetEditId = null;
  if (window.PitDB) PitDB.save();
  renderFleet();
}
