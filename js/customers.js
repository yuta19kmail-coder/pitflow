/* ========================================
   customers.js  -  顧客（人）＋車両（複数台）／PitFlow v0.38.0
   ----------------------------------------
   ◎位置づけ：整備ソフトが正式台帳。ここは現場の控え＋来店履歴ビュー。乗っ取らない。
   ◎モデル（v0.38.0で人主体に）：
     顧客(人) = { id, name, kana, contacts:[{tel,label,primary}],
                  vehicles:[{ id, plate, maker, car, boardId, division, frontStaff }], updatedAt }
     ・連絡先は人ごと。担当/課/区分は車両ごと（同じ人でも国産/輸入で変わるので）。
     ・新規車両は既存車両から担当/課/区分をデフォ継承（普段は同じ・たまに違うを両取り）。
   ◎呼び出し：名前→人→車を選ぶ／ナンバー→その車と人が一発（候補は車両単位）。
   ◎履歴：その人の全車両ナンバーに一致する入庫カードを時系列表示。
   ======================================== */
(function () {
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s){ return (s||'').replace(/\s+/g,'').replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60)).toLowerCase(); }
  function list(){ if(!Array.isArray(state.customers)) state.customers=[]; return state.customers; }
  function courseLabel(div){ const d=(state.divisions||[]).find(x=>x.id===div); return d?d.label:''; }
  function teamInfo(v){
    const course=courseLabel(v && v.division);
    if(v && v.boardId==='import')  return { label:'輸入車', course:course||'2課', color:'#ec4899' };
    if(v && v.boardId==='default') return { label:'国産車', course:course||'1課', color:'#1db97a' };
    return { label:'', course:course||'', color:'#64748b' };
  }
  function frontStaffList(){ return (state.staff||[]).filter(s=>s.front).map(s=>s.name); }
  function primaryTel(cust){ const cs=(cust&&cust.contacts)||[]; const p=cs.find(x=>x.primary)||cs[0]; return p?(p.tel||''):''; }
  function vehLabel(v){ return ((v.maker?v.maker+' ':'')+(v.car||'')).trim() || (v.plate||'—'); }

  /* ===== 入庫カードから upsert（人を特定→車両を upsert） ===== */
  function _findPerson(c, vehicle){
    const arr=list();
    if(c.customerId){ const p=arr.find(x=>x.id===c.customerId); if(p) return p; }
    if(vehicle.plate){ const p=arr.find(x=>Array.isArray(x.vehicles)&&x.vehicles.some(v=>norm(v.plate)===norm(vehicle.plate))); if(p) return p; }
    const nm=norm(c.customer), pt=norm((c.contacts&&c.contacts.find(x=>x.primary)||{}).tel||c.tel);
    if(nm){ const p=arr.find(x=>norm(x.name)===nm && (pt ? norm(primaryTel(x))===pt : true)); if(p) return p; }
    return null;
  }
  function upsertCustomerFromCard(c){
    if(!c) return;
    const name=(c.customer||'').trim();
    const vehicle={ plate:(c.plate||'').trim(), maker:(c.maker||'').trim(), car:(c.car||'').trim(), boardId:c.boardId||'', division:c.division||'', frontStaff:(c.frontStaff||'').trim() };
    if(!name && !vehicle.plate) return;
    const contacts = Array.isArray(c.contacts)
      ? c.contacts.filter(x=>(x.tel||'').trim()||(x.label||'').trim()).map(x=>({tel:(x.tel||'').trim(),label:(x.label||'').trim(),primary:!!x.primary}))
      : ((c.tel||'').trim() ? [{tel:(c.tel||'').trim(),label:'個人携帯',primary:true}] : []);
    if(contacts.length && !contacts.some(x=>x.primary)) contacts[0].primary=true;
    let p=_findPerson(c, vehicle);
    if(!p){ p={ id:'cu'+Date.now()+Math.floor(Math.random()*1000), name, kana:(c.kana||'').trim(), contacts, vehicles:[], updatedAt:Date.now() }; list().push(p); }
    else { p.name=name||p.name; p.kana=(c.kana||'').trim()||p.kana; if(contacts.length) p.contacts=contacts; }
    if(!Array.isArray(p.vehicles)) p.vehicles=[];
    let v = vehicle.plate ? p.vehicles.find(x=>norm(x.plate)===norm(vehicle.plate)) : null;
    if(v){ v.plate=vehicle.plate||v.plate; v.maker=vehicle.maker||v.maker; v.car=vehicle.car||v.car; if(vehicle.boardId)v.boardId=vehicle.boardId; if(vehicle.division)v.division=vehicle.division; if(vehicle.frontStaff)v.frontStaff=vehicle.frontStaff; v.updatedAt=Date.now(); }
    else if(vehicle.plate||vehicle.maker||vehicle.car){
      const base=p.vehicles[p.vehicles.length-1]||{};   // 新車両：未指定の担当/課/区分は既存からデフォ継承
      p.vehicles.push({ id:'v'+Date.now()+Math.floor(Math.random()*1000), plate:vehicle.plate, maker:vehicle.maker, car:vehicle.car,
        boardId:vehicle.boardId||base.boardId||'', division:vehicle.division||base.division||'', frontStaff:vehicle.frontStaff||base.frontStaff||'', updatedAt:Date.now() });
    }
    p.updatedAt=Date.now();
    c.customerId=p.id;
    if(window.PitDB) PitDB.save();
  }
  window.upsertCustomerFromCard=upsertCustomerFromCard;

  /* ===== 検索 ===== */
  function match(cust,q){
    if(norm(cust.name).includes(q)||norm(cust.kana).includes(q)) return true;
    if((cust.contacts||[]).some(ct=>norm(ct.tel).includes(q))) return true;
    if((cust.vehicles||[]).some(v=>norm(v.plate).includes(q)||norm(v.car).includes(q)||norm(v.maker).includes(q))) return true;
    return false;
  }

  /* ===== カードの「呼び出し」＝候補は車両単位（名前で引けば人の全車両・ナンバーでその車） ===== */
  window.custSuggest=function(qstr){
    const box=document.getElementById('cf-recall-list'); if(!box) return;
    const q=norm(qstr);
    if(!q){ box.innerHTML=''; box.style.display='none'; return; }
    const entries=[];
    list().forEach(function(cust){
      const pm = norm(cust.name).includes(q)||norm(cust.kana).includes(q)||(cust.contacts||[]).some(ct=>norm(ct.tel).includes(q));
      (cust.vehicles||[]).forEach(function(v){
        const vm = norm(v.plate).includes(q)||norm(v.car).includes(q)||norm(v.maker).includes(q);
        if(pm||vm) entries.push({cust:cust, v:v});
      });
      if(pm && !(cust.vehicles||[]).length) entries.push({cust:cust, v:null});
    });
    entries.sort((a,b)=>norm(a.cust.kana+a.cust.name).localeCompare(norm(b.cust.kana+b.cust.name),'ja'));
    const shown=entries.slice(0,10);
    if(!shown.length){ box.innerHTML=''; box.style.display='none'; return; }
    box.innerHTML=shown.map(function(e){
      const t=e.v?teamInfo(e.v):{label:'',color:'#64748b'};
      const tag=t.label?(' <i style="color:'+t.color+'">●</i>'+esc(t.label)):'';
      const vtxt=e.v?(esc(vehLabel(e.v))+(e.v.plate?' / '+esc(e.v.plate):'')):'（車両なし）';
      return '<button type="button" class="cf-recall-item" onclick="custPick(\''+e.cust.id+'\',\''+(e.v?e.v.id:'')+'\')">'+
        '<b>'+esc(e.cust.name||'(無名)')+'</b> <span>'+vtxt+tag+'</span></button>';
    }).join('');
    box.style.display='block';
  };
  window.custPick=function(custId,vehId){
    const cust=list().find(x=>x.id===custId); if(!cust) return;
    const c=state.cards.find(x=>x.id===_editingCardId); if(!c) return;
    c.customer=cust.name||c.customer; c.kana=cust.kana||c.kana; c.customerId=cust.id;
    c.repeat='repeater';   // 呼び出した＝必ずリピーター（初回/リピーターを自動でリピーターに）
    if(Array.isArray(cust.contacts)&&cust.contacts.length){
      c.contacts=cust.contacts.map(x=>({tel:x.tel,label:x.label,primary:!!x.primary}));
      const pri=c.contacts.find(x=>x.primary)||c.contacts[0]; c.tel=pri?(pri.tel||''):'';
    }
    const v=(cust.vehicles||[]).find(x=>x.id===vehId)||(cust.vehicles||[])[0];
    if(v){ c.plate=v.plate||c.plate; c.maker=v.maker||c.maker; c.car=v.car||c.car; if(v.boardId)c.boardId=v.boardId; if(v.division)c.division=v.division; if(v.frontStaff)c.frontStaff=v.frontStaff; }
    renderCardForm(c);
  };

  /* ===== 顧客ビュー（人の行＋展開で車両） ===== */
  let _q='', _sortKey='updatedAt', _sortDir='desc';
  const _filters={ board:'', div:'', front:'', maker:'' };
  const _expanded=new Set();
  function fmtDate(ms){ if(!ms) return '—'; const d=new Date(ms); return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate(); }
  function _distinctVeh(key){ const s=new Set(); list().forEach(cust=>(cust.vehicles||[]).forEach(v=>{ const x=(v[key]||'').trim(); if(x) s.add(x); })); return Array.from(s).sort((a,b)=>norm(a).localeCompare(norm(b),'ja')); }
  function custMatchFilter(cust){
    const vs=cust.vehicles||[];
    if(_filters.board && !vs.some(v=>(v.boardId||'')===_filters.board)) return false;
    if(_filters.div   && !vs.some(v=>(v.division||'')===_filters.div)) return false;
    if(_filters.front && !vs.some(v=>(v.frontStaff||'')===_filters.front)) return false;
    if(_filters.maker && !vs.some(v=>(v.maker||'')===_filters.maker)) return false;
    return true;
  }
  function firstVeh(cust){ return (cust.vehicles||[])[0]||{}; }
  function sortVal(cust,k){
    const v=firstVeh(cust);
    switch(k){
      case 'name':  return norm(cust.kana)||norm(cust.name);
      case 'kana':  return norm(cust.kana);
      case 'maker': return norm(v.maker);
      case 'car':   return norm(v.car);
      case 'plate': return norm(v.plate);
      case 'tel':   return norm(primaryTel(cust));
      case 'board': return v.boardId==='default'?'1':(v.boardId==='import'?'2':'9');
      case 'div':   return v.division||'z';
      case 'front': return norm(v.frontStaff);
      case 'updatedAt': return cust.updatedAt||0;
    }
    return '';
  }
  function _rows(){
    const q=norm(_q);
    let rows=list().filter(cust=>{ if(q&&!match(cust,q)) return false; if(!custMatchFilter(cust)) return false; return true; });
    const dir=_sortDir==='asc'?1:-1;
    rows.sort((a,b)=>{ const va=sortVal(a,_sortKey), vb=sortVal(b,_sortKey); if(va<vb) return -dir; if(va>vb) return dir; return (b.updatedAt||0)-(a.updatedAt||0); });
    return rows;
  }
  window.custSort=function(k){ if(_sortKey===k){_sortDir=_sortDir==='asc'?'desc':'asc';} else {_sortKey=k;_sortDir=(k==='updatedAt')?'desc':'asc';} renderCustTable(); };
  window.custSetFilter=function(kind,val){ _filters[kind]=val; renderCustTable(); };
  window.custToggleExpand=function(id){ if(_expanded.has(id)) _expanded.delete(id); else _expanded.add(id); renderCustTable(); };

  window.renderCustomers=function(){
    const wrap=document.getElementById('view-customers-body'); if(!wrap) return;
    const opt=(arr,sel,ph)=>'<option value="">'+ph+'</option>'+arr.map(v=>'<option value="'+esc(v)+'"'+(sel===v?' selected':'')+'>'+esc(v)+'</option>').join('');
    let h='';
    h+='<div class="cust-head">'+
       '<input class="cust-search" placeholder="🔍 名前・カナ(ひらがなOK)・ナンバー・車・電話で絞り込み" value="'+esc(_q)+'" oninput="custFilter(this.value)">'+
       '<span class="cust-count" id="cust-count"></span>'+
       '<button class="vh-btn" onclick="custReseed()" title="サンプルを入れ替え">🎲 サンプル入替</button>'+
       '<button class="vh-btn" onclick="clearCustomers()" title="控えを全削除">🗑 全削除</button>'+
       '</div>';
    h+='<div class="cust-filters">'+
       '<select class="cust-fsel" onchange="custSetFilter(\'board\',this.value)"><option value="">区分：すべて</option>'+
         '<option value="default"'+(_filters.board==='default'?' selected':'')+'>国産車</option>'+
         '<option value="import"'+(_filters.board==='import'?' selected':'')+'>輸入車</option></select>'+
       '<select class="cust-fsel" onchange="custSetFilter(\'div\',this.value)"><option value="">課：すべて</option>'+
         (state.divisions||[]).map(d=>'<option value="'+d.id+'"'+(_filters.div===d.id?' selected':'')+'>'+esc(d.label)+'</option>').join('')+'</select>'+
       '<select class="cust-fsel" onchange="custSetFilter(\'front\',this.value)">'+opt(_distinctVeh('frontStaff'),_filters.front,'担当：すべて')+'</select>'+
       '<select class="cust-fsel" onchange="custSetFilter(\'maker\',this.value)">'+opt(_distinctVeh('maker'),_filters.maker,'メーカー：すべて')+'</select>'+
       '</div>';
    h+='<div id="cust-thost"></div>';
    wrap.innerHTML=h;
    renderCustTable();
  };
  window.renderCustTable=function(){
    const host=document.getElementById('cust-thost'); if(!host) return;
    const rows=_rows();
    const cnt=document.getElementById('cust-count'); if(cnt) cnt.textContent=rows.length+' 人 / 全 '+list().length+' 人';
    if(!rows.length){ host.innerHTML='<div class="cust-empty">'+(list().length?'該当なし':'まだ登録がありません。入庫カードを保存すると自動で貯まります。')+'</div>'; return; }
    // 以前の1行テーブル。基本1人1行＝先頭車両を表示。2台目以降は「車の欄だけ」を下に増やす（人の欄は空）
    const cols=[ ['name','名前'],['kana','カナ'],['maker','メーカー'],['car','車種'],['plate','ナンバー'],['tel','TEL'],['board','区分'],['div','課'],['front','担当'],['updatedAt','最終入庫'] ];
    const arrow=k=> _sortKey===k?(_sortDir==='asc'?' ▲':' ▼'):'';
    let h='<div class="ct-wrap"><table class="ct"><thead><tr>';
    cols.forEach(c=>{ h+='<th class="ct-th'+(_sortKey===c[0]?' on':'')+'" onclick="custSort(\''+c[0]+'\')">'+esc(c[1])+arrow(c[0])+'</th>'; });
    h+='<th class="ct-th ct-acth">操作</th></tr></thead><tbody>';
    let shownRows=0;
    for(let ri=0; ri<rows.length && shownRows<400; ri++){
      const cust=rows[ri];
      const vs=(cust.vehicles&&cust.vehicles.length)?cust.vehicles:[null];
      vs.forEach(function(v,vi){
        const first=vi===0, last=vi===vs.length-1;
        const t=teamInfo(v||{});
        const pill=s=>s?'<span class="ct-pill" style="background:'+t.color+'22;color:'+t.color+';border-color:'+t.color+'66">'+esc(s)+'</span>':'—';
        h+='<tr class="'+(last?'ct-rb':'ct-norb')+(first?'':' ct-cont')+'">'+
           '<td class="ct-name">'+(first?esc(cust.name||'(無名)'):'')+'</td>'+
           '<td class="ct-mut">'+(first?esc(cust.kana||'—'):'')+'</td>'+
           '<td>'+(v?esc(v.maker||'—'):'—')+'</td>'+
           '<td>'+(v?esc(v.car||'—'):'—')+'</td>'+
           '<td class="ct-mut">'+(v?esc(v.plate||'—'):'—')+'</td>'+
           '<td class="ct-mut">'+(first?esc(primaryTel(cust)||'—'):'')+'</td>'+
           '<td>'+pill(t.label)+'</td>'+
           '<td>'+pill(t.course)+'</td>'+
           '<td>'+(v?esc(v.frontStaff||'—'):'—')+'</td>'+
           '<td class="ct-mut">'+(v?fmtDate(v.updatedAt):(first?fmtDate(cust.updatedAt):''))+'</td>'+
           '<td class="ct-act">'+
             (v?'<button class="ct-b" onclick="custHistory(\''+cust.id+'\',\''+v.id+'\')" title="この車の履歴">🕒</button>':'')+
             (first?('<button class="ct-b" onclick="custEdit(\''+cust.id+'\')" title="編集">✏</button>'+
               '<button class="ct-b ct-bd" onclick="custDelete(\''+cust.id+'\')" title="削除">🗑</button>'):'')+
           '</td>'+
           '</tr>';
        shownRows++;
      });
    }
    h+='</tbody></table></div>';
    if(rows.length>300) h+='<div class="cust-empty">（先頭の方を表示）絞り込みで探してください</div>';
    host.innerHTML=h;
  };
  window.custFilter=function(v){ _q=v; renderCustTable(); };   // 検索欄は据え置き＝IME(変換)が壊れない
  window.custDelete=function(id){
    const arr=list(); const i=arr.findIndex(r=>r.id===id);
    if(i<0) return;
    if(!confirm('この顧客（控え）を削除しますか？\n（整備ソフトの台帳には影響しません）')) return;
    arr.splice(i,1); _expanded.delete(id); if(window.PitDB) PitDB.save(); renderCustomers();
  };
  window.custReseed=function(){
    if(!confirm('サンプル顧客を入れ替えます（今の控えは消えます）。よろしいですか？')) return;
    if(window.seedSampleCustomers) seedSampleCustomers(400,true);
  };

  /* ===== モーダル共通 ===== */
  function openModal(html){
    let m=document.getElementById('cust-modal');
    if(!m){ m=document.createElement('div'); m.id='cust-modal'; m.className='cm-overlay'; document.body.appendChild(m); }
    m.innerHTML='<div class="cm-box">'+html+'</div>';
    m.classList.add('show');
    m.onclick=function(e){ if(e.target===m) closeModal(); };
  }
  function closeModal(){ const m=document.getElementById('cust-modal'); if(m){ m.classList.remove('show'); m.innerHTML=''; } }
  window.custCloseModal=closeModal;

  /* ===== 編集（人＋連絡先＋車両） ===== */
  function _boardSel(v){ return '<select class="ce-board"><option value="">—</option><option value="default"'+(v==='default'?' selected':'')+'>国産</option><option value="import"'+(v==='import'?' selected':'')+'>輸入</option></select>'; }
  function _divSel(v){ return '<select class="ce-div"><option value="">—</option>'+(state.divisions||[]).map(d=>'<option value="'+d.id+'"'+(v===d.id?' selected':'')+'>'+esc(d.label)+'</option>').join('')+'</select>'; }
  function _frontSel(v){ return '<select class="ce-front"><option value="">—</option>'+frontStaffList().map(n=>'<option value="'+esc(n)+'"'+(v===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select>'; }
  function _renderEdit(cust){
    let h='<div class="cm-head">✏ 顧客を編集 <span class="cm-sub">'+esc(cust.name||'')+'</span><button class="cm-x" onclick="custCloseModal()">✕</button></div><div class="cm-body">';
    h+='<div class="cm-2"><div class="cm-f"><label>お客様名</label><input id="ce-name" value="'+esc(cust.name||'')+'"></div>'+
       '<div class="cm-f"><label>カナ</label><input id="ce-kana" value="'+esc(cust.kana||'')+'"></div></div>';
    // 連絡先
    h+='<div class="ce-sec">連絡先</div><div id="ce-contacts">';
    (cust.contacts||[]).forEach(function(ct){
      h+='<div class="ce-ct"><label class="cf-ct-pri"><input type="radio" name="ce-pri" '+(ct.primary?'checked':'')+'> 優先</label>'+
         '<input class="ce-ctel" value="'+esc(ct.tel||'')+'" placeholder="090-1234-5678">'+
         '<input class="ce-clabel" value="'+esc(ct.label||'')+'" placeholder="ラベル">'+
         '<button type="button" class="cf-ct-del" onclick="custEditDelContact(this)">🗑</button></div>';
    });
    h+='</div><button class="ce-add" onclick="custEditAddContact()">＋ 連絡先</button>';
    // 車両
    h+='<div class="ce-sec">車両（複数台OK）</div><div id="ce-vehicles">';
    (cust.vehicles||[]).forEach(function(v){
      h+='<div class="ce-veh" data-vid="'+esc(v.id||'')+'"><div class="ce-veh-l">'+
         '<input class="ce-plate" value="'+esc(v.plate||'')+'" placeholder="野田 300 ひ 5555">'+
         '<input class="ce-maker" value="'+esc(v.maker||'')+'" placeholder="メーカー">'+
         '<input class="ce-car" value="'+esc(v.car||'')+'" placeholder="車種">'+
         '</div><div class="ce-veh-r">'+_boardSel(v.boardId)+_divSel(v.division)+_frontSel(v.frontStaff)+
         '<button type="button" class="cf-ct-del" onclick="custEditDelVehicle(this)">🗑</button></div></div>';
    });
    h+='</div><button class="ce-add" onclick="custEditAddVehicle()">＋ 車両を追加</button>';
    h+='</div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">キャンセル</button><button class="cm-save" onclick="custSaveEdit(\''+cust.id+'\')">保存</button></div>';
    openModal(h);
  }
  function _readEdit(cust){
    const g=id=>{ const e=document.getElementById(id); return e?e.value.trim():''; };
    cust.name=g('ce-name'); cust.kana=g('ce-kana');
    const contacts=[];
    document.querySelectorAll('#ce-contacts .ce-ct').forEach(function(row){
      const tel=(row.querySelector('.ce-ctel').value||'').trim();
      const label=(row.querySelector('.ce-clabel').value||'').trim();
      const primary=row.querySelector('input[name="ce-pri"]').checked;
      if(tel||label) contacts.push({tel,label,primary});
    });
    if(contacts.length && !contacts.some(x=>x.primary)) contacts[0].primary=true;
    cust.contacts=contacts;
    const vehicles=[];
    document.querySelectorAll('#ce-vehicles .ce-veh').forEach(function(row){
      const plate=(row.querySelector('.ce-plate').value||'').trim();
      const maker=(row.querySelector('.ce-maker').value||'').trim();
      const car=(row.querySelector('.ce-car').value||'').trim();
      const boardId=row.querySelector('.ce-board').value;
      const division=row.querySelector('.ce-div').value;
      const frontStaff=row.querySelector('.ce-front').value;
      if(plate||maker||car) vehicles.push({ id:row.dataset.vid||('v'+Date.now()+Math.floor(Math.random()*1000)), plate,maker,car,boardId,division,frontStaff });
    });
    cust.vehicles=vehicles;
  }
  window.custEdit=function(id){ const cust=list().find(x=>x.id===id); if(!cust) return; _renderEdit(cust); };
  window.custSaveEdit=function(id){
    const cust=list().find(x=>x.id===id); if(!cust) return;
    _readEdit(cust); cust.updatedAt=Date.now();
    if(window.PitDB) PitDB.save(); closeModal(); renderCustomers();
  };
  window.custEditAddContact=function(){ const cust=_editTarget(); if(!cust) return; _readEdit(cust); cust.contacts.push({tel:'',label:'',primary:!cust.contacts.length}); _renderEdit(cust); };
  window.custEditDelContact=function(btn){ const cust=_editTarget(); if(!cust) return; _readEdit(cust); const row=btn.closest('.ce-ct'); const rows=[].slice.call(document.querySelectorAll('#ce-contacts .ce-ct')); const i=rows.indexOf(row); if(i>=0) cust.contacts.splice(i,1); _renderEdit(cust); };
  window.custEditAddVehicle=function(){ const cust=_editTarget(); if(!cust) return; _readEdit(cust); const base=cust.vehicles[cust.vehicles.length-1]||{}; cust.vehicles.push({ id:'v'+Date.now()+Math.floor(Math.random()*1000), plate:'',maker:'',car:'', boardId:base.boardId||'', division:base.division||'', frontStaff:base.frontStaff||'' }); _renderEdit(cust); };
  window.custEditDelVehicle=function(btn){ const cust=_editTarget(); if(!cust) return; _readEdit(cust); const row=btn.closest('.ce-veh'); const rows=[].slice.call(document.querySelectorAll('#ce-vehicles .ce-veh')); const i=rows.indexOf(row); if(i>=0) cust.vehicles.splice(i,1); _renderEdit(cust); };
  function _editTarget(){ const head=document.querySelector('#cust-modal .cm-save'); if(!head) return null; const m=head.getAttribute('onclick')||''; const id=(m.match(/custSaveEdit\('([^']+)'\)/)||[])[1]; return id?list().find(x=>x.id===id):null; }

  /* ===== 履歴（車両＝そのナンバー単位） ===== */
  function cardDate(c){ return c.returnDate || c.reserveDate || ''; }
  window.custHistory=function(custId, vehId){
    const cust=list().find(x=>x.id===custId); if(!cust) return;
    const v=(cust.vehicles||[]).find(x=>x.id===vehId);
    const plate=v?(v.plate||''):'';
    const arr=Array.isArray(state.cards)?state.cards:[];
    const cards=(plate?arr.filter(c=>norm(c.plate)===norm(plate)):[]).slice().sort((a,b)=>(cardDate(b)||'').localeCompare(cardDate(a)||''));
    const vlabel=v?(vehLabel(v)+(plate?' / '+plate:'')):'（車両不明）';
    let h='<div class="cm-head">🕒 来店履歴 <span class="cm-sub">'+esc(cust.name||'(無名)')+' ・ '+esc(vlabel)+'</span><button class="cm-x" onclick="custCloseModal()">✕</button></div><div class="cm-body">';
    if(!cards.length){
      h+='<div class="cust-empty">この車の入庫カードはまだありません。<br>（整備ソフトに正式履歴があります）</div>';
    } else {
      h+='<div class="cm-hist">';
      cards.forEach(c=>{
        const wt=(state.workTypes||[]).find(w=>w.id===c.workType);
        const wl=wt?wt.label:(c.workType||'—');
        const st=(typeof statusLabel==='function')?statusLabel(c.status):(c.status||'');
        const amt=(c.estAmount!=null&&c.estAmount!=='')?('¥'+Number(c.estAmount).toLocaleString()):'—';
        const dt=cardDate(c)||'日付未定';
        h+='<div class="cm-hrow"><div class="cm-hdt">'+esc(dt)+'</div>'+
           '<div class="cm-hmid"><b>'+esc(wl)+'</b>'+(c.plate?' ・ '+esc(c.plate):'')+(c.frontStaff?' ・ 担当 '+esc(c.frontStaff):'')+'<div class="cm-hsub">'+esc(st)+(c.menu?' ・ '+esc(String(c.menu).split('\n')[0]):'')+'</div></div>'+
           '<div class="cm-hamt">'+esc(amt)+'</div></div>';
      });
      h+='</div><div class="cust-note" style="margin-top:10px">確定売上・台数の実績集計（当月予測→月末締め）は今後ここに足していく予定。いまは入庫カードの概算金額を表示しています。</div>';
    }
    h+='</div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">閉じる</button></div>';
    openModal(h);
  };
})();
