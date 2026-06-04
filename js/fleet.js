/* ========================================
   fleet.js  -  代車・自社車両管理／PitFlow v0.11.0
   ----------------------------------------
   ・最上部＝車検🔴・12点🟠の月次カレンダー（1列1ヶ月×18ヶ月・エクセル風・縦横スクロール・行列固定）。
   ・下に車両リスト（代車20台＋社用車）。登録/編集は**ポップアップ**（項目は今後拡張前提）。
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

  let h = '';

  /* ===== ① 月次カレンダー（最上部・大きく） ===== */
  const months = [];
  const base = new Date(); base.setDate(1); base.setHours(0,0,0,0);
  for (let i = 0; i < 18; i++){ months.push(new Date(base.getFullYear(), base.getMonth() + i, 1)); }
  const groups = [
    { name: '🚙 代車', arr: state.loaners || [] },
    { name: '🚐 社用車', arr: state.companyCars || [] }
  ];
  h += '<div class="fl-card">';
  h += '<div class="fl-h">📅 車検・12ヶ月点検カレンダー（18ヶ月）<span class="fl-note">🔴車検 ／ 🟠12点 ｜ ⏭将来：期日が近づくと自動で入庫 or 通知</span></div>';
  h += '<div class="fl-cal-wrap"><div class="fl-cal" style="grid-template-columns:120px repeat(18, minmax(72px,1fr))">';
  h += '<div class="fl-cal-h fl-cal-corner">車両</div>';
  months.forEach(function(m){
    h += '<div class="fl-cal-h">' + (m.getMonth()+1) + '月' + ((m.getMonth() === 0 || m === months[0]) ? '<span>' + m.getFullYear() + '</span>' : '') + '</div>';
  });
  groups.forEach(function(g){
    g.arr.forEach(function(v){
      h += '<div class="fl-cal-name" title="' + _fleetEsc(v.model || '') + (v.plate ? ' ' + _fleetEsc(v.plate) : '') + '">' + _fleetEsc(v.name) + '</div>';
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
  });
  h += '</div></div>';
  h += '</div>';

  /* ===== ② 車両リスト ===== */
  groups.forEach(function(g, gi){
    h += '<div class="fl-card"><div class="fl-h">' + g.name + '（' + g.arr.length + '台）'
       + (gi === 0 ? '<button class="vh-btn primary" onclick="fleetOpenModal()">＋ 車両を追加</button>' : '') + '</div>';
    if (!g.arr.length){ h += '<div class="fl-empty">登録なし</div>'; }
    h += '<div class="fl-rows">';
    g.arr.forEach(function(v){
      h += '<div class="fl-row">'
         + '<div class="fl-main"><div class="fl-name">' + _fleetEsc(v.name) + '</div>'
         + '<div class="fl-sub">' + _fleetEsc(v.model || '—') + (v.plate ? ' ・ ' + _fleetEsc(v.plate) : '')
         + (v.shakenDate ? '<br>車検 ' + _fleetEsc(v.shakenDate) : '') + (v.tenkenDate ? ' ・ 12点 ' + _fleetEsc(v.tenkenDate) : '') + '</div></div>'
         + '<button class="fl-btn" onclick="fleetOpenModal(\'' + v.id + '\')">✏️</button>'
         + '<button class="fl-btn del" onclick="fleetDelete(\'' + v.id + '\')">🗑</button>'
         + '</div>';
    });
    h += '</div></div>';
  });

  wrap.innerHTML = h;
}

/* ===== 登録・編集ポップアップ ===== */
function fleetOpenModal(id){
  _fleetEditId = id || null;
  const f = id ? _fleetFind(id) : null;
  const v = f ? f.v : {};
  document.getElementById('fl-modal-title').textContent = f ? '✏️ 車両を編集' : '＋ 車両を追加';
  document.getElementById('fl-kind').value  = f ? f.kind : 'loaner';
  document.getElementById('fl-name').value  = v.name || '';
  document.getElementById('fl-model').value = v.model || '';
  document.getElementById('fl-plate').value = v.plate || '';
  document.getElementById('fl-shaken').value = v.shakenDate || '';
  document.getElementById('fl-tenken').value = v.tenkenDate || '';
  document.getElementById('fleet-modal').classList.add('show');
  const n = document.getElementById('fl-name'); if (n) n.focus();
}
function fleetCloseModal(){
  _fleetEditId = null;
  document.getElementById('fleet-modal').classList.remove('show');
}

function fleetSubmit(){
  const kind   = document.getElementById('fl-kind').value || 'loaner';
  const name   = (document.getElementById('fl-name').value || '').trim();
  const model  = (document.getElementById('fl-model').value || '').trim();
  const plate  = (document.getElementById('fl-plate').value || '').trim();
  const shaken = document.getElementById('fl-shaken').value || '';
  const tenken = document.getElementById('fl-tenken').value || '';
  if (!name){ alert('名前を入れてください（例：代車21／積載車）'); return; }
  if (!Array.isArray(state.companyCars)) state.companyCars = [];

  if (_fleetEditId){
    const f = _fleetFind(_fleetEditId);
    if (f){
      if (f.kind !== kind){
        const fromArr = f.kind === 'loaner' ? state.loaners : state.companyCars;
        const toArr   = kind === 'loaner' ? state.loaners : state.companyCars;
        fromArr.splice(fromArr.indexOf(f.v), 1);
        toArr.push(f.v);
      }
      f.v.name = name; f.v.model = model; f.v.plate = plate;
      f.v.shakenDate = shaken; f.v.tenkenDate = tenken;
    }
  } else {
    const id = (kind === 'loaner' ? 'L' : 'C') + Date.now().toString(36);
    (kind === 'loaner' ? state.loaners : state.companyCars).push(
      { id: id, name: name, model: model, plate: plate, shakenDate: shaken, tenkenDate: tenken }
    );
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
  if (_fleetEditId === id) _fleetEditId = null;
  if (window.PitDB) PitDB.save();
  renderFleet();
}
