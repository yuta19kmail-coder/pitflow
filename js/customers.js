/* ========================================
   customers.js  -  顧客レコード（車両ごと・入力補助＋軽い管理）／PitFlow v0.37.0
   ----------------------------------------
   ◎位置づけ（重要）
     ・整備専用ソフトが「顧客の正式な台帳・履歴・DM」の本家。乗っ取らない。
     ・これは PitFlow 内の“現場で使える控え＋来店履歴ビュー”。1台＝1レコード。
       入庫カードを保存すると自動で育ち、次回は名前/ナンバーで一発入力できる。
   ◎覚える項目（v0.37.0で拡張）：名前/TEL/メーカー/車種/ナンバー＋国産輸入(boardId)/課(division)/フロント担当(frontStaff)
   ◎来店履歴：state.cards のうち同じナンバー（無ければ名前+車種）のカードを「履歴」ボタンで一覧（実質的な履歴）
   保存：state.customers（db-pit.js が localStorage に永続化）
   ======================================== */
(function () {
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  // 空白除去＋カタカナ→ひらがな統一＋小文字化。これで「や」(ひらがな)でも「ヤマダ」(カナ)に当たる。
  function norm(s){ return (s||'').replace(/\s+/g,'').replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60)).toLowerCase(); }
  function keyOf(r){ return norm(r.plate) || ('n:'+norm(r.name)+'|c:'+norm(r.car)); }
  function list(){ if(!Array.isArray(state.customers)) state.customers=[]; return state.customers; }
  function courseLabel(div){ const d=(state.divisions||[]).find(x=>x.id===div); return d?d.label:''; }
  /* 国産/輸入＋課 の表示情報（色つき） */
  function teamInfo(r){
    const course=courseLabel(r.division);
    if(r.boardId==='import')  return { label:'輸入車', course:course||'2課', color:'#ec4899' };
    if(r.boardId==='default') return { label:'国産車', course:course||'1課', color:'#1db97a' };
    return { label:'', course:course||'', color:'#64748b' };
  }
  /* フロント業務ありのスタッフ（フロント担当の候補） */
  function frontStaffList(){ return (state.staff||[]).filter(s=>s.front).map(s=>s.name); }

  /* 入庫カードから控えを upsert（ナンバー優先で重複判定） */
  function upsertCustomerFromCard(c){
    if(!c) return;
    const name=(c.customer||'').trim();
    const plate=(c.plate||'').trim();
    if(!name && !plate) return;                 // 空は登録しない
    const rec={
      name, kana:(c.kana||'').trim(), tel:(c.tel||'').trim(), maker:(c.maker||'').trim(), car:(c.car||'').trim(), plate,
      boardId:c.boardId||'', division:c.division||'', frontStaff:(c.frontStaff||'').trim(),
      staff:(c.staff||'').trim(), updatedAt:Date.now()
    };
    const arr=list();
    const k=keyOf(rec);
    const ex=arr.find(r=>keyOf(r)===k);
    if(ex){
      ex.name=rec.name||ex.name; ex.kana=rec.kana||ex.kana; ex.tel=rec.tel||ex.tel; ex.maker=rec.maker||ex.maker; ex.car=rec.car||ex.car;
      ex.plate=rec.plate||ex.plate; ex.staff=rec.staff||ex.staff;
      ex.boardId=rec.boardId||ex.boardId; ex.division=rec.division||ex.division; ex.frontStaff=rec.frontStaff||ex.frontStaff;
      ex.updatedAt=rec.updatedAt;
    } else {
      rec.id='cu'+Date.now()+Math.floor(Math.random()*1000);
      arr.push(rec);
    }
    if(window.PitDB) PitDB.save();
  }
  window.upsertCustomerFromCard=upsertCustomerFromCard;

  function match(r,q){ return norm(r.name).includes(q)||norm(r.kana).includes(q)||norm(r.plate).includes(q)||norm(r.car).includes(q)||norm(r.maker).includes(q); }
  function search(q){
    q=norm(q); if(!q) return [];
    return list().filter(r=>match(r,q))
      .sort((a,b)=> norm(a.kana+a.name).localeCompare(norm(b.kana+b.name),'ja'))
      .slice(0,8);
  }
  window.searchCustomers=search;

  /* === カード詳細フォームの「呼び出し」＝名前/ナンバーで候補→クリックで自動補完 === */
  window.custSuggest=function(q){
    const box=document.getElementById('cf-recall-list'); if(!box) return;
    const res=search(q);
    if(!res.length){ box.innerHTML=''; box.style.display='none'; return; }
    box.innerHTML=res.map(r=>{
      const t=teamInfo(r);
      const tag=t.label?(' <i style="color:'+t.color+'">●</i>'+esc(t.label)+(t.course?'/'+esc(t.course):'')):'';
      return '<button type="button" class="cf-recall-item" onclick="custPick(\''+r.id+'\')">'+
        '<b>'+esc(r.name||'(無名)')+'</b> <span>'+esc(((r.maker?r.maker+' ':'')+ (r.car||'')).trim())+(r.plate?' / '+esc(r.plate):'')+tag+'</span>'+
      '</button>';
    }).join('');
    box.style.display='block';
  };
  window.custPick=function(id){
    const r=list().find(x=>x.id===id); if(!r) return;
    const c=state.cards.find(x=>x.id===_editingCardId); if(!c) return;
    c.customer=r.name||c.customer; c.kana=r.kana||c.kana; c.tel=r.tel||c.tel; c.maker=r.maker||c.maker; c.car=r.car||c.car; c.plate=r.plate||c.plate;
    // 国産輸入・課・フロント担当は、未選択なら控えから補完（既に選んでいれば尊重）
    if(!c.boardId && r.boardId)        c.boardId=r.boardId;
    if(!c.division && r.division)       c.division=r.division;
    if(!c.frontStaff && r.frontStaff)   c.frontStaff=r.frontStaff;
    if(!c.staff) c.staff=r.staff||'';
    renderCardForm(c);
  };

  /* === 顧客リスト ビュー（1行テーブル＋ラベルでソート） === */
  let _q='';
  let _sortKey='updatedAt', _sortDir='desc';   // 既定＝最終入庫が新しい順
  function fmtDate(ms){ if(!ms) return '—'; const d=new Date(ms); return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate(); }
  function sortVal(r,k){
    switch(k){
      case 'name':  return norm(r.kana)||norm(r.name);
      case 'kana':  return norm(r.kana);
      case 'maker': return norm(r.maker);
      case 'car':   return norm(r.car);
      case 'plate': return norm(r.plate);
      case 'tel':   return (r.tel||'');
      case 'board': return r.boardId==='default'?'1':(r.boardId==='import'?'2':'9');
      case 'div':   return r.division||'z';
      case 'front': return norm(r.frontStaff);
      case 'updatedAt': return r.updatedAt||0;
    }
    return '';
  }
  // 列フィルタ（空＝すべて）。例：担当→社長だけ
  const _filters = { board:'', div:'', front:'', maker:'' };
  function _distinct(key){ const s=new Set(); list().forEach(r=>{ const v=(r[key]||'').trim(); if(v) s.add(v); }); return Array.from(s).sort((a,b)=>norm(a).localeCompare(norm(b),'ja')); }
  function _rows(){
    const q=norm(_q);
    let rows=list().filter(r=>{
      if(q && !match(r,q)) return false;
      if(_filters.board && (r.boardId||'')!==_filters.board) return false;
      if(_filters.div   && (r.division||'')!==_filters.div) return false;
      if(_filters.front && (r.frontStaff||'')!==_filters.front) return false;
      if(_filters.maker && (r.maker||'')!==_filters.maker) return false;
      return true;
    });
    const dir=_sortDir==='asc'?1:-1;
    rows.sort((a,b)=>{ const va=sortVal(a,_sortKey), vb=sortVal(b,_sortKey); if(va<vb) return -dir; if(va>vb) return dir; return (b.updatedAt||0)-(a.updatedAt||0); });
    return rows;
  }
  window.custSort=function(k){
    if(_sortKey===k){ _sortDir=_sortDir==='asc'?'desc':'asc'; }
    else { _sortKey=k; _sortDir=(k==='updatedAt')?'desc':'asc'; }
    renderCustTable();
  };
  window.custSetFilter=function(kind,val){ _filters[kind]=val; renderCustTable(); };
  // 外枠（検索＋フィルタ＋テーブル器）。検索欄は再生成しない＝IME(変換)中も壊れない
  window.renderCustomers=function(){
    const wrap=document.getElementById('view-customers-body'); if(!wrap) return;
    const opt=(arr,sel,ph)=>'<option value="">'+ph+'</option>'+arr.map(v=>'<option value="'+esc(v)+'"'+(sel===v?' selected':'')+'>'+esc(v)+'</option>').join('');
    let h='';
    h+='<div class="cust-head">'+
       '<input class="cust-search" placeholder="🔍 名前・カナ(ひらがなOK)・ナンバー・車で絞り込み" value="'+esc(_q)+'" oninput="custFilter(this.value)">'+
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
       '<select class="cust-fsel" onchange="custSetFilter(\'front\',this.value)">'+opt(_distinct('frontStaff'),_filters.front,'担当：すべて')+'</select>'+
       '<select class="cust-fsel" onchange="custSetFilter(\'maker\',this.value)">'+opt(_distinct('maker'),_filters.maker,'メーカー：すべて')+'</select>'+
       '</div>';
    h+='<div id="cust-thost"></div>';
    wrap.innerHTML=h;
    renderCustTable();
  };
  // テーブル本体だけ更新（検索・フィルタ欄は触らない）
  window.renderCustTable=function(){
    const host=document.getElementById('cust-thost'); if(!host) return;
    const rows=_rows();
    const cnt=document.getElementById('cust-count'); if(cnt) cnt.textContent=rows.length+' 件 / 全 '+list().length+' 件';
    if(!rows.length){ host.innerHTML='<div class="cust-empty">'+(list().length?'該当なし':'まだ登録がありません。入庫カードを保存すると自動で貯まります。')+'</div>'; return; }
    const cols=[ ['name','名前'],['kana','カナ'],['maker','メーカー'],['car','車種'],['plate','ナンバー'],['tel','TEL'],['board','区分'],['div','課'],['front','担当'],['updatedAt','最終入庫'] ];
    const arrow=k=> _sortKey===k?(_sortDir==='asc'?' ▲':' ▼'):'';
    let h='<div class="ct-wrap"><table class="ct"><thead><tr>';
    cols.forEach(c=>{ h+='<th class="ct-th'+(_sortKey===c[0]?' on':'')+'" onclick="custSort(\''+c[0]+'\')">'+esc(c[1])+arrow(c[0])+'</th>'; });
    h+='<th class="ct-th ct-acth">操作</th></tr></thead><tbody>';
    rows.slice(0,300).forEach(r=>{
      const t=teamInfo(r);
      const pill=s=>s?'<span class="ct-pill" style="background:'+t.color+'22;color:'+t.color+';border-color:'+t.color+'66">'+esc(s)+'</span>':'—';
      h+='<tr>'+
         '<td class="ct-name">'+esc(r.name||'(無名)')+'</td>'+
         '<td class="ct-mut">'+esc(r.kana||'—')+'</td>'+
         '<td>'+esc(r.maker||'—')+'</td>'+
         '<td>'+esc(r.car||'—')+'</td>'+
         '<td class="ct-mut">'+esc(r.plate||'—')+'</td>'+
         '<td class="ct-mut">'+esc(r.tel||'—')+'</td>'+
         '<td>'+pill(t.label)+'</td>'+
         '<td>'+pill(t.course)+'</td>'+
         '<td>'+esc(r.frontStaff||'—')+'</td>'+
         '<td class="ct-mut">'+fmtDate(r.updatedAt)+'</td>'+
         '<td class="ct-act"><button class="ct-b" onclick="custHistory(\''+r.id+'\')" title="履歴">🕒</button>'+
           '<button class="ct-b" onclick="custEdit(\''+r.id+'\')" title="編集">✏</button>'+
           '<button class="ct-b ct-bd" onclick="custDelete(\''+r.id+'\')" title="削除">🗑</button></td>'+
         '</tr>';
    });
    h+='</tbody></table></div>';
    if(rows.length>300) h+='<div class="cust-empty">（先頭300件を表示）絞り込みで探してください</div>';
    host.innerHTML=h;
  };
  window.custFilter=function(v){ _q=v; renderCustTable(); };  // 検索欄は据え置き＝IME(変換)が壊れない
  window.custDelete=function(id){
    const arr=list(); const i=arr.findIndex(r=>r.id===id);
    if(i<0) return;
    if(!confirm('この控えを削除しますか？\n（整備ソフトの台帳には影響しません）')) return;
    arr.splice(i,1); if(window.PitDB) PitDB.save(); renderCustomers();
  };
  window.custReseed=function(){
    if(!confirm('サンプル顧客を入れ替えます（今の控えは消えます）。よろしいですか？')) return;
    if(window.seedSampleCustomers) seedSampleCustomers(500,true);
  };

  /* === モーダル（編集 / 履歴）共通 === */
  function openModal(html){
    let m=document.getElementById('cust-modal');
    if(!m){ m=document.createElement('div'); m.id='cust-modal'; m.className='cm-overlay'; document.body.appendChild(m); }
    m.innerHTML='<div class="cm-box">'+html+'</div>';
    m.classList.add('show');
    m.onclick=function(e){ if(e.target===m) closeModal(); };
  }
  function closeModal(){ const m=document.getElementById('cust-modal'); if(m){ m.classList.remove('show'); m.innerHTML=''; } }
  window.custCloseModal=closeModal;

  /* === 編集 === */
  window.custEdit=function(id){
    const r=list().find(x=>x.id===id); if(!r) return;
    const boardOpt=function(v){ return '<option value=""'+(!r.boardId?' selected':'')+'>—</option>'+
      '<option value="default"'+(r.boardId==='default'?' selected':'')+'>国産</option>'+
      '<option value="import"'+(r.boardId==='import'?' selected':'')+'>輸入</option>'; };
    const divOpt='<option value=""'+(!r.division?' selected':'')+'>—</option>'+(state.divisions||[]).map(d=>'<option value="'+d.id+'"'+(r.division===d.id?' selected':'')+'>'+esc(d.label)+'</option>').join('');
    const frontOpt='<option value="">—</option>'+frontStaffList().map(n=>'<option value="'+esc(n)+'"'+(r.frontStaff===n?' selected':'')+'>'+esc(n)+'</option>').join('');
    let h='<div class="cm-head">✏ 顧客の控えを編集 <button class="cm-x" onclick="custCloseModal()">✕</button></div>';
    h+='<div class="cm-body">';
    h+='<div class="cm-2"><div class="cm-f"><label>お客様名</label><input id="cm-name" value="'+esc(r.name||'')+'"></div>'+
       '<div class="cm-f"><label>カナ</label><input id="cm-kana" value="'+esc(r.kana||'')+'"></div></div>';
    h+='<div class="cm-f"><label>TEL</label><input id="cm-tel" value="'+esc(r.tel||'')+'"></div>';
    h+='<div class="cm-2"><div class="cm-f"><label>メーカー</label><input id="cm-maker" value="'+esc(r.maker||'')+'"></div>'+
       '<div class="cm-f"><label>車種</label><input id="cm-car" value="'+esc(r.car||'')+'"></div></div>';
    h+='<div class="cm-f"><label>ナンバー</label><input id="cm-plate" value="'+esc(r.plate||'')+'"></div>';
    h+='<div class="cm-3"><div class="cm-f"><label>国産／輸入</label><select id="cm-board">'+boardOpt()+'</select></div>'+
       '<div class="cm-f"><label>課</label><select id="cm-div">'+divOpt+'</select></div>'+
       '<div class="cm-f"><label>フロント担当</label><select id="cm-front">'+frontOpt+'</select></div></div>';
    h+='</div>';
    h+='<div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">キャンセル</button><button class="cm-save" onclick="custSaveEdit(\''+id+'\')">保存</button></div>';
    openModal(h);
  };
  window.custSaveEdit=function(id){
    const r=list().find(x=>x.id===id); if(!r) return;
    const g=i=>{ const e=document.getElementById(i); return e?e.value.trim():''; };
    r.name=g('cm-name'); r.kana=g('cm-kana'); r.tel=g('cm-tel'); r.maker=g('cm-maker'); r.car=g('cm-car'); r.plate=g('cm-plate');
    r.boardId=g('cm-board'); r.division=g('cm-div'); r.frontStaff=g('cm-front');
    r.updatedAt=Date.now();
    if(window.PitDB) PitDB.save();
    closeModal(); renderCustomers();
  };

  /* === 履歴（このナンバー＝同一車のカードを時系列で） === */
  function cardsForCustomer(r){
    const arr=Array.isArray(state.cards)?state.cards:[];
    const p=norm(r.plate);
    if(p) return arr.filter(c=>norm(c.plate)===p);
    const nm=norm(r.name), cr=norm(r.car);
    return arr.filter(c=>norm(c.customer)===nm && norm(c.car)===cr);
  }
  function cardDate(c){ return c.returnDate || c.reserveDate || ''; }
  window.custHistory=function(id){
    const r=list().find(x=>x.id===id); if(!r) return;
    const cards=cardsForCustomer(r).slice().sort((a,b)=>(cardDate(b)||'').localeCompare(cardDate(a)||''));
    const carTxt=((r.maker?r.maker+' ':'')+(r.car||'')).trim();
    let h='<div class="cm-head">🕒 来店履歴 <span class="cm-sub">'+esc(r.name||'(無名)')+(carTxt?' / '+esc(carTxt):'')+(r.plate?' / '+esc(r.plate):'')+'</span><button class="cm-x" onclick="custCloseModal()">✕</button></div>';
    h+='<div class="cm-body">';
    if(!cards.length){
      h+='<div class="cust-empty">このナンバーの入庫カードはまだありません。<br>（整備ソフトに正式履歴があります）</div>';
    } else {
      h+='<div class="cm-hist">';
      cards.forEach(c=>{
        const wt=(state.workTypes||[]).find(w=>w.id===c.workType);
        const wl=wt?wt.label:(c.workType||'—');
        const st=(typeof statusLabel==='function')?statusLabel(c.status):(c.status||'');
        const amt=(c.estAmount!=null&&c.estAmount!=='')?('¥'+Number(c.estAmount).toLocaleString()):'—';
        const dt=cardDate(c)||'日付未定';
        h+='<div class="cm-hrow"><div class="cm-hdt">'+esc(dt)+'</div>'+
           '<div class="cm-hmid"><b>'+esc(wl)+'</b>'+(c.frontStaff?' ・ 担当 '+esc(c.frontStaff):'')+'<div class="cm-hsub">'+esc(st)+(c.menu?' ・ '+esc(String(c.menu).split('\n')[0]):'')+'</div></div>'+
           '<div class="cm-hamt">'+esc(amt)+'</div></div>';
      });
      h+='</div>';
      h+='<div class="cust-note" style="margin-top:10px">確定売上・台数の実績集計（当月予測→月末締め）は今後ここに足していく予定。いまは入庫カードの概算金額を表示しています。</div>';
    }
    h+='</div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">閉じる</button></div>';
    openModal(h);
  };
})();
