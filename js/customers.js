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
  function courseColorOf(div){ const d=(state.divisions||[]).find(x=>x.id===div); return (d&&d.color)?d.color:'#64748b'; }
  /* 区分(国産/輸入)＝boardIdの色、課(1課/2課)＝divisionの色。両者は独立（国産車を2課が担当 等もある） */
  function teamInfo(v){
    const course=courseLabel(v && v.division);
    const courseColor=courseColorOf(v && v.division);
    if(v && v.boardId==='import')  return { label:'輸入車', course:course, color:'#ec4899', courseColor:courseColor };
    if(v && v.boardId==='default') return { label:'国産車', course:course, color:'#1db97a', courseColor:courseColor };
    return { label:'', course:course, color:'#64748b', courseColor:courseColor };
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
    const vehicle={ plate:(c.plate||'').trim(), maker:(c.maker||'').trim(), car:(c.car||'').trim(), boardId:c.boardId||'', division:c.division||'', frontStaff:(c.frontStaff||'').trim(), karteNo:(c.karteNo||'').trim() };
    if(!name && !vehicle.plate) return;
    const contacts = Array.isArray(c.contacts)
      ? c.contacts.filter(x=>(x.tel||'').trim()||(x.label||'').trim()).map(x=>({tel:(x.tel||'').trim(),label:(x.label||'').trim(),primary:!!x.primary}))
      : ((c.tel||'').trim() ? [{tel:(c.tel||'').trim(),label:'個人携帯',primary:true}] : []);
    if(contacts.length && !contacts.some(x=>x.primary)) contacts[0].primary=true;
    let p=_findPerson(c, vehicle);
    if(!p){ p={ id:'cu'+Date.now()+Math.floor(Math.random()*1000), name, kana:(c.kana||'').trim(), contacts, vehicles:[], updatedAt:Date.now() }; list().push(p); }
    else { p.name=name||p.name; p.kana=(c.kana||'').trim()||p.kana; if(contacts.length) p.contacts=contacts; }
    // v0.93.0 LINEは人単位で保持（カードに値があれば更新・無ければ既存維持）
    if(c.lineStatus) p.lineStatus=c.lineStatus;
    if((c.lstepId||'').trim()) p.lstepId=(c.lstepId||'').trim();
    if(!Array.isArray(p.vehicles)) p.vehicles=[];
    let v = vehicle.plate ? p.vehicles.find(x=>norm(x.plate)===norm(vehicle.plate)) : null;
    if(v){ v.plate=vehicle.plate||v.plate; v.maker=vehicle.maker||v.maker; v.car=vehicle.car||v.car; if(vehicle.boardId)v.boardId=vehicle.boardId; if(vehicle.division)v.division=vehicle.division; if(vehicle.frontStaff)v.frontStaff=vehicle.frontStaff; if(vehicle.karteNo)v.karteNo=vehicle.karteNo; v.updatedAt=Date.now(); }
    else if(vehicle.plate||vehicle.maker||vehicle.car){
      const base=p.vehicles[p.vehicles.length-1]||{};   // 新車両：未指定の担当/課/区分は既存からデフォ継承
      p.vehicles.push({ id:'v'+Date.now()+Math.floor(Math.random()*1000), plate:vehicle.plate, maker:vehicle.maker, car:vehicle.car,
        boardId:vehicle.boardId||base.boardId||'', division:vehicle.division||base.division||'', frontStaff:vehicle.frontStaff||base.frontStaff||'', karteNo:vehicle.karteNo||'', updatedAt:Date.now() });
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
    // v0.93.0 LINE（人単位）を引き継ぐ
    if(cust.lineStatus!=null) c.lineStatus=cust.lineStatus;
    if((cust.lstepId||'').trim()) c.lstepId=cust.lstepId;
    if(Array.isArray(cust.contacts)&&cust.contacts.length){
      c.contacts=cust.contacts.map(x=>({tel:x.tel,label:x.label,primary:!!x.primary}));
      const pri=c.contacts.find(x=>x.primary)||c.contacts[0]; c.tel=pri?(pri.tel||''):'';
    }
    const v=(cust.vehicles||[]).find(x=>x.id===vehId)||(cust.vehicles||[])[0];
    // フロント担当は「その車両に登録済みのものだけ」入れる（推測での自動入力はしない・ゆうた方針 2026-06-23）。
    if(v){ c.plate=v.plate||c.plate; c.maker=v.maker||c.maker; c.car=v.car||c.car; if(v.boardId)c.boardId=v.boardId; if(v.division)c.division=v.division; if(v.frontStaff)c.frontStaff=v.frontStaff; if(v.karteNo)c.karteNo=v.karteNo; }
    renderCardForm(c);
  };

  /* ===== 顧客ビュー（人の行＋展開で車両） ===== */
  let _q='', _sortKey='updatedAt', _sortDir='desc';
  let _detailFromSearch=false;   // 顧客詳細を検索結果から開いたか（閉じたら検索結果に戻す）
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
      case 'karte': return norm(v.karteNo);
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
    const cols=[ ['name','名前'],['kana','カナ'],['maker','メーカー'],['karte','カルテNo'],['car','車種'],['plate','ナンバー'],['tel','TEL'],['board','区分'],['div','課'],['front','担当'],['updatedAt','最終入庫'] ];
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
        const pillC=(s,col)=>s?'<span class="ct-pill" style="background:'+col+'22;color:'+col+';border-color:'+col+'66">'+esc(s)+'</span>':'—';
        h+='<tr class="'+(last?'ct-rb':'ct-norb')+(first?'':' ct-cont')+' ct-clickrow" onclick="custOpen(\''+cust.id+'\')" title="顧客詳細を開く">'+
           '<td class="ct-name">'+(first?esc(cust.name||'(無名)'):'')+'</td>'+
           '<td class="ct-mut">'+(first?esc(cust.kana||'—'):'')+'</td>'+
           '<td>'+(v?esc(v.maker||'—'):'—')+'</td>'+
           '<td class="ct-mut">'+(v?esc(v.karteNo||'—'):'—')+'</td>'+
           '<td>'+(v?esc(v.car||'—'):'—')+'</td>'+
           '<td class="ct-mut">'+(v?esc(v.plate||'—'):'—')+'</td>'+
           '<td class="ct-mut">'+(first?esc(primaryTel(cust)||'—'):'')+'</td>'+
           '<td>'+pillC(t.label,t.color)+'</td>'+
           '<td>'+pillC(t.course,t.courseColor)+'</td>'+
           '<td>'+(v?esc(v.frontStaff||'—'):'—')+'</td>'+
           '<td class="ct-mut">'+(v?fmtDate(v.updatedAt):(first?fmtDate(cust.updatedAt):''))+'</td>'+
           '<td class="ct-act">'+
             ((first && (cust.lineStatus||'')==='ok' && (cust.lstepId||'').trim() && window.pitLstepUrl)
               ? '<a class="ct-b ct-bline" href="'+esc(pitLstepUrl(cust.lstepId))+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Lステップを開く">🔗 Lステップ</a>'
               : '')+
             '<button class="ct-b ct-bnew" onclick="event.stopPropagation();custNewReserveFor(\''+cust.id+'\',\''+((v&&v.id)||'')+'\')" title="この車で新規予約">🆕 新規予約</button>'+
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
    arr.splice(i,1); _expanded.delete(id); if(window.PitDB) PitDB.save(); closeModal(); renderCustomers();
  };
  window.custReseed=function(){
    if(!confirm('サンプル顧客を入れ替えます（今の控えは消えます）。よろしいですか？')) return;
    if(window.seedSampleCustomers) seedSampleCustomers(400,true);
  };

  /* ===== モーダル共通 ===== */
  function openModal(html, boxClass){
    let m=document.getElementById('cust-modal');
    if(!m){ m=document.createElement('div'); m.id='cust-modal'; m.className='cm-overlay'; document.body.appendChild(m); }
    m.innerHTML='<div class="cm-box '+(boxClass||'')+'">'+html+'</div>';
    m.classList.add('show');
    m.onclick=function(e){ if(e.target===m) closeModal(); };
  }
  function closeModal(){
    const m=document.getElementById('cust-modal'); if(m){ m.classList.remove('show'); m.innerHTML=''; }
    if(_detailFromSearch){ _detailFromSearch=false; if(window.pitSearchReopen) pitSearchReopen(); }   // 検索結果に戻す
  }
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
    // LINE（新規予約欄と同じ：未案内/LINE NG/登録済＋Lステップ番号）
    const lineOpts=[['','未案内'],['ng','LINE NG'],['ok','登録済']].map(function(o){ return '<option value="'+o[0]+'"'+(((cust.lineStatus||'')===o[0])?' selected':'')+'>'+o[1]+'</option>'; }).join('');
    const ceIsOk=((cust.lineStatus||'')==='ok');
    const ceUrl=(ceIsOk && (cust.lstepId||'').trim() && window.pitLstepUrl)?pitLstepUrl(cust.lstepId):'';
    h+='<div class="ce-sec">LINE</div><div class="ce-line">'+
       '<select id="ce-line-status" class="ce-line-sel" onchange="custEditSyncLine()">'+lineOpts+'</select>'+
       '<input id="ce-lstep" class="ce-line-id" value="'+esc(cust.lstepId||'')+'" placeholder="Lステップ番号 / URL貼付OK（登録済のとき）" oninput="custEditSyncLine()"'+(ceIsOk?'':' style="display:none"')+'>'+
       '<a id="ce-lstep-link" class="ct-bline" href="'+esc(ceUrl)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Lステップを開く"'+(ceUrl?'':' style="display:none"')+'>🔗 Lステップ</a>'+
       '</div>';
    // 車両
    h+='<div class="ce-sec">車両（複数台OK）</div><div id="ce-vehicles">';
    (cust.vehicles||[]).forEach(function(v){
      h+='<div class="ce-veh" data-vid="'+esc(v.id||'')+'"><div class="ce-veh-l">'+
         '<input class="ce-plate" value="'+esc(v.plate||'')+'" placeholder="野田 300 ひ 5555">'+
         '<input class="ce-maker" value="'+esc(v.maker||'')+'" placeholder="メーカー">'+
         '<input class="ce-car" value="'+esc(v.car||'')+'" placeholder="車種">'+
         '<input class="ce-karte" value="'+esc(v.karteNo||'')+'" placeholder="カルテNo">'+
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
    const lsel=document.getElementById('ce-line-status'); cust.lineStatus=lsel?lsel.value:'';
    cust.lstepId=g('ce-lstep');
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
      const ke=row.querySelector('.ce-karte'); const karteNo=ke?(ke.value||'').trim():'';
      const boardId=row.querySelector('.ce-board').value;
      const division=row.querySelector('.ce-div').value;
      const frontStaff=row.querySelector('.ce-front').value;
      if(plate||maker||car) vehicles.push({ id:row.dataset.vid||('v'+Date.now()+Math.floor(Math.random()*1000)), plate,maker,car,karteNo,boardId,division,frontStaff });
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
  // v0.96.1 編集画面のLINE欄：状態=登録済のときだけ番号入力を出し、番号→🔗Lステップリンクを自動生成（新規予約欄と同じ挙動）
  window.custEditSyncLine=function(){
    const sel=document.getElementById('ce-line-status');
    const inp=document.getElementById('ce-lstep');
    const link=document.getElementById('ce-lstep-link');
    if(!sel||!inp||!link) return;
    const ok=sel.value==='ok';
    inp.style.display=ok?'':'none';
    const url=(ok && inp.value.trim() && window.pitLstepUrl)?pitLstepUrl(inp.value.trim()):'';
    if(url){ link.href=url; link.style.display=''; }
    else { link.removeAttribute('href'); link.style.display='none'; }
  };
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
        let loa='';
        if(c.needLoaner){ const l=(state.loaners||[]).find(x=>x.id===c.loanerId); loa='🚙代車'+(l?('（'+l.name+'）'):''); }
        h+='<div class="cm-hrow"><div class="cm-hdt">'+esc(dt)+'</div>'+
           '<div class="cm-hmid"><b>'+esc(wl)+'</b>'+(c.plate?' ・ '+esc(c.plate):'')+(c.frontStaff?' ・ 担当 '+esc(c.frontStaff):'')+(loa?' ・ <span style="color:#1db97a">'+esc(loa)+'</span>':'')+'<div class="cm-hsub">'+esc(st)+(c.menu?' ・ '+esc(String(c.menu).split('\n')[0]):'')+'</div></div>'+
           '<div class="cm-hamt">'+esc(amt)+'</div></div>';
      });
      h+='</div><div class="cust-note" style="margin-top:10px">確定売上・台数の実績集計（当月予測→月末締め）は今後ここに足していく予定。いまは入庫カードの概算金額を表示しています。</div>';
    }
    h+='</div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">閉じる</button></div>';
    openModal(h);
  };

  /* ===== 顧客詳細（グラフィカル・一覧の名前クリックで開く／編集・削除もここから） ===== */
  function _statusLbl(c){
    if(c.status==='reserved') return '予約';
    if(c.status==='returned') return '返車済み';
    const b=(state.boards||[]).find(x=>x.id===c.boardId)||(state.boards||[])[0];
    const col=b&&(b.cols||[]).find(x=>x.id===c.status);
    return col?col.name:(c.status||'');
  }
  function _custCards(cust){
    const plates=(cust.vehicles||[]).map(v=>norm(v.plate)).filter(Boolean);
    return (Array.isArray(state.cards)?state.cards:[]).filter(function(c){
      return (c.customerId&&c.customerId===cust.id) || (c.plate&&plates.indexOf(norm(c.plate))>=0);
    }).slice().sort((a,b)=>(cardDate(b)||'').localeCompare(cardDate(a)||''));
  }
  /* v0.93.0 LINE状態→表示HTML（NG=地味ピル／登録済+番号=Lステップボタン）。未案内は出さない。 */
  function _lineHtml(o){
    var st=(o&&o.lineStatus)||'';
    if(st==='ng') return '<span class="cd-pill mut">LINE NG</span>';
    if(st==='ok'){
      var id=((o&&o.lstepId)||'').trim();
      var url=(id&&window.pitLstepUrl)?pitLstepUrl(id):'';
      return url?'<a class="cd-pill green cd-line-link" href="'+esc(url)+'" target="_blank" rel="noopener" draggable="true" onclick="event.stopPropagation()">🔗 Lステップ</a>':'<span class="cd-pill green">LINE登録済</span>';
    }
    return '';
  }
  window.custOpen=function(id){
    const cust=list().find(x=>x.id===id); if(!cust) return;
    _detailFromSearch = !!window._pitReturnToSearch; window._pitReturnToSearch=false;   // 検索由来かを取り込む
    const backLbl = _detailFromSearch ? '← 検索結果へ戻る' : '← 顧客一覧へ戻る';
    const vehicles=cust.vehicles||[];
    const cards=_custCards(cust);
    const visits=cards.length;
    const total=cards.reduce(function(s,c){ const a=(c.amountFinal!=null&&c.amountFinal!=='')?Number(c.amountFinal):(Number(c.estAmount)||0); return s+(isFinite(a)?a:0); },0);
    let last=cust.updatedAt||0; vehicles.forEach(function(v){ if((v.updatedAt||0)>last) last=v.updatedAt||0; });
    const yen=function(n){ return '¥'+Number(n||0).toLocaleString('ja-JP'); };

    let h='';
    // 上部バー
    h+='<div class="cd-top"><button class="cd-back" onclick="custCloseModal()">'+backLbl+'</button>'+
       '<div class="cd-acts"><button class="cd-btn" onclick="custEdit(\''+cust.id+'\')">✏️ 編集</button>'+
       '<button class="cd-btn danger" onclick="custDelete(\''+cust.id+'\')">🗑 削除</button></div></div>';
    // ヘッダー
    h+='<div class="cd-hero"><div class="cd-hmain">'+
       '<div class="cd-hname">'+esc(cust.name||'(無名)')+' <small>様</small></div>'+
       (cust.kana?'<div class="cd-hkana">'+esc(cust.kana)+'</div>':'')+
       '<div class="cd-hpills"><span class="cd-pill mut">最終入庫 '+fmtDate(last)+'</span>'+_lineHtml(cust)+'</div>'+
       '</div><div class="cd-stats"><div class="cd-statrow">'+
       '<div class="cd-stat"><b>'+visits+'</b><span>来店回数</span></div>'+
       '<div class="cd-stat"><b>'+vehicles.length+'</b><span>保有台数</span></div>'+
       '</div><div class="cd-total"><span>累計概算（合計金額）</span><b>'+yen(total)+'</b></div></div></div>';
    // 連絡先
    h+='<div class="cd-sec"><div class="cd-sech"><div class="cd-sect">📞 連絡先 <span class="cd-cnt">'+(cust.contacts||[]).length+'件</span></div></div>';
    if((cust.contacts||[]).length){
      h+='<div class="cd-contacts">';
      (cust.contacts||[]).forEach(function(ct){
        h+='<div class="cd-ct"><div class="cd-ctic">'+(ct.primary?'📱':'📞')+'</div><div class="cd-ctmain"><div class="cd-cttel">'+esc(ct.tel||'—')+'</div><div class="cd-ctlab">'+esc(ct.label||'')+'</div></div>'+(ct.primary?'<span class="cd-ctpri">優先</span>':'')+'</div>';
      });
      h+='</div>';
    } else { h+='<div class="cd-empty">連絡先は未登録です</div>'; }
    h+='</div>';
    // 車両
    h+='<div class="cd-sec"><div class="cd-sech"><div class="cd-sect">🚗 車両 <span class="cd-cnt">'+vehicles.length+'台</span></div></div>';
    if(vehicles.length){
      h+='<div class="cd-vehs">';
      vehicles.forEach(function(v){
        const t=teamInfo(v||{});
        // ベースルール：輸入＝ピンク／国産＝緑／未設定＝グレー
        const isImp=(v.boardId==='import');
        const isDom=(v.boardId==='default');
        const teamCls=isImp?' import':(isDom?'':' unset');
        const teamPill=isImp?'<span class="cd-pill pink">輸入車</span>':(isDom?'<span class="cd-pill green">国産車</span>':'<span class="cd-pill mut">未設定</span>');
        h+='<div class="cd-veh'+teamCls+'">'+
           '<div class="cd-vplate">'+esc(v.plate||'—')+'</div>'+
           '<div class="cd-vcar">'+esc(((v.maker?v.maker+' ':'')+(v.car||'')).trim()||'—')+'</div>'+
           '<div class="cd-vpills">'+teamPill+(t.course?'<span class="cd-pill mut">'+esc(t.course)+'</span>':'')+((v.karteNo||'').trim()?'<span class="cd-pill mut">カルテ '+esc(v.karteNo)+'</span>':'')+(v.frontStaff?'<span class="cd-vstaff" title="担当">'+esc(v.frontStaff)+'</span>':'')+'</div>'+
           '<div class="cd-vacts"><span class="cd-vb" onclick="custHistory(\''+cust.id+'\',\''+(v.id||'')+'\')">🕒 履歴</span>'+
           '<span class="cd-vb go" onclick="custNewReserveFor(\''+cust.id+'\',\''+(v.id||'')+'\')">🆕 この車で新規予約</span></div>'+
           '</div>';
      });
      h+='</div>';
    } else { h+='<div class="cd-empty">車両は未登録です</div>'; }
    h+='</div>';
    // 来店履歴
    h+='<div class="cd-sec"><div class="cd-sech"><div class="cd-sect">🕒 来店履歴 <span class="cd-cnt">'+(visits?('直近'+Math.min(visits,12)+'件'):'なし')+'</span></div></div>';
    if(visits){
      h+='<div class="cd-hist">';
      cards.slice(0,12).forEach(function(c){
        const wt=(state.workTypes||[]).find(w=>w.id===c.workType);
        const wl=wt?wt.label:(c.workType||'—'); const wc=wt?wt.color:'#64748b';
        const amt=(c.amountFinal!=null&&c.amountFinal!=='')?Number(c.amountFinal):(c.estAmount!=null&&c.estAmount!==''?Number(c.estAmount):null);
        const amtStr=(amt!=null&&isFinite(amt))?yen(amt):'—';
        let loa=''; if(c.needLoaner){ const l=(state.loaners||[]).find(x=>x.id===c.loanerId); loa=' ・ <span class="cd-loa">🚙代車'+(l?('（'+esc(l.name)+'）'):'')+'</span>'; }
        const menuTxt=c.menu?esc(String(c.menu).split('\n')[0]):'';
        // ステータスバッジ：予約→予約カレンダー／返車済み→実績カレンダー（行クリックは予約詳細）
        const isResv=(c.status==='reserved'), isRet=(c.status==='returned');
        const stClick=isResv?("event.stopPropagation();pitGotoReserveDate('"+esc(c.reserveDate||'')+"')")
                    :isRet?("event.stopPropagation();pitGotoResultMonth('"+esc(c.returnDate||c.reserveDate||'')+"')"):'';
        const stBadge='<span class="cd-hst'+((isResv||isRet)?' clickable':'')+'"'+(stClick?(' onclick="'+stClick+'" title="'+(isResv?'予約カレンダーへ':'実績カレンダーへ')+'"'):'')+'>'+esc(_statusLbl(c))+(isResv?' 📅':isRet?' 📊':'')+'</span>';
        h+='<div class="cd-hrow clickable" onclick="pitOpenCardDetail(\''+esc(c.id)+'\')" title="クリックで予約詳細">'+
           '<div class="cd-hdt">'+esc(cardDate(c)||'日付未定')+'</div>'+
           '<div class="cd-hwt" style="background:'+wc+'">'+esc(wl)+'</div>'+
           '<div class="cd-hmid"><b>'+esc(c.car||'')+'</b>'+(c.plate?' ・ '+esc(c.plate):'')+(c.frontStaff?' ・ 担当 '+esc(c.frontStaff):'')+loa+(menuTxt?'<div class="cd-hsub">'+menuTxt+'</div>':'')+'</div>'+
           stBadge+
           '<div class="cd-hamt">'+amtStr+'</div></div>';
      });
      h+='</div>';
    } else { h+='<div class="cd-empty">入庫カードの履歴はまだありません（整備ソフトに正式履歴があります）</div>'; }
    h+='</div>';

    openModal(h, 'cd-box');
  };
  /* この車で新規予約＝新規予約カードを作ってこの顧客＋車両で埋める */
  window.custNewReserveFor=function(custId, vehId){
    window._pitReturnToSearch=false;           // 新規予約へ進む＝検索には戻らない
    _detailFromSearch=false;
    custCloseModal();
    if(window.openNewReserve){ openNewReserve(); if(window.custPick) custPick(custId, vehId); }
  };

  /* ===== カード→顧客の橋渡し（検索結果の「顧客情報」「新規予約」用） ===== */
  // カードから顧客レコードを探す（customerId 優先・無ければナンバー一致）
  window.custFindForCard=function(c){
    if(!c) return null;
    if(c.customerId){ const byId=list().find(x=>x.id===c.customerId); if(byId) return byId; }
    const p=norm(c.plate);
    if(p){ const byP=list().find(x=>(x.vehicles||[]).some(v=>norm(v.plate)===p)); if(byP) return byP; }
    return null;
  };
  // 顧客情報を開く＝そのカードのお客様の詳細（控えが無ければカードから作ってから開く）
  window.custOpenForCard=function(cardId){
    const c=(state.cards||[]).find(x=>x.id===cardId); if(!c) return;
    window._pitReturnToSearch=true;            // 戻れるように検索ワードは残す
    if(window.pitSearchHide) pitSearchHide();
    let cust=custFindForCard(c);
    if(!cust && window.upsertCustomerFromCard){ upsertCustomerFromCard(c); cust=custFindForCard(c); }
    if(cust) custOpen(cust.id);
  };
  // そのカードのお客様＋車両で新規予約を開始
  window.custNewReserveForCardId=function(cardId){
    const c=(state.cards||[]).find(x=>x.id===cardId); if(!c) return;
    window._pitReturnToSearch=false;           // 新規予約へ進む＝検索には戻らない
    if(window.pitSearchClose) pitSearchClose();
    let cust=custFindForCard(c);
    if(!cust && window.upsertCustomerFromCard){ upsertCustomerFromCard(c); cust=custFindForCard(c); }
    if(!cust){ if(window.openNewReserve) openNewReserve(); return; }
    const v=(cust.vehicles||[]).find(x=>norm(x.plate)===norm(c.plate))||(cust.vehicles||[])[0];
    custNewReserveFor(cust.id, v?v.id:'');
  };
})();
