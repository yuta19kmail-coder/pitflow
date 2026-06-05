/* ========================================
   customers.js  -  顧客レコード（車両ごと・入力補助）／PitFlow v0.4.0
   ----------------------------------------
   ◎位置づけ（重要）
     ・整備専用ソフトが「顧客の正式な台帳・履歴・DM」の本家。
     ・これは PitFlow 内の“入力を速くするための控え”。1台＝1レコード。
       入庫カードを保存すると自動で育ち、次回は名前/ナンバーで一発入力できる。
     ・履歴もDMも持たない＝整備ソフトと二重管理しない。
   保存：state.customers（db-pit.js が localStorage に永続化）
   レコード：{ id, name, tel, car, plate, staff, updatedAt }
   ======================================== */
(function () {
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s){ return (s||'').replace(/\s+/g,'').toLowerCase(); }
  function keyOf(r){ return norm(r.plate) || ('n:'+norm(r.name)+'|c:'+norm(r.car)); }
  function list(){ if(!Array.isArray(state.customers)) state.customers=[]; return state.customers; }

  /* 入庫カードから控えを upsert（ナンバー優先で重複判定） */
  function upsertCustomerFromCard(c){
    if(!c) return;
    const name=(c.customer||'').trim();
    const plate=(c.plate||'').trim();
    if(!name && !plate) return;                 // 空は登録しない
    const rec={ name, tel:(c.tel||'').trim(), maker:(c.maker||'').trim(), car:(c.car||'').trim(), plate, staff:(c.staff||'').trim(), updatedAt:Date.now() };
    const arr=list();
    const k=keyOf(rec);
    const ex=arr.find(r=>keyOf(r)===k);
    if(ex){
      ex.name=rec.name||ex.name; ex.tel=rec.tel||ex.tel; ex.maker=rec.maker||ex.maker; ex.car=rec.car||ex.car;
      ex.plate=rec.plate||ex.plate; ex.staff=rec.staff||ex.staff; ex.updatedAt=rec.updatedAt;
    } else {
      rec.id='cu'+Date.now()+Math.floor(Math.random()*1000);
      arr.push(rec);
    }
    if(window.PitDB) PitDB.save();
  }
  window.upsertCustomerFromCard=upsertCustomerFromCard;

  function search(q){
    q=norm(q); if(!q) return [];
    return list()
      .filter(r=> norm(r.name).includes(q) || norm(r.plate).includes(q) || norm(r.car).includes(q))
      .sort((a,b)=> (a.name+a.car).localeCompare(b.name+b.car,'ja'))
      .slice(0,8);
  }
  window.searchCustomers=search;

  /* === カード詳細フォームの「呼び出し」 === */
  window.custSuggest=function(q){
    const box=document.getElementById('cf-recall-list'); if(!box) return;
    const res=search(q);
    if(!res.length){ box.innerHTML=''; box.style.display='none'; return; }
    box.innerHTML=res.map(r=>(
      '<button type="button" class="cf-recall-item" onclick="custPick(\''+r.id+'\')">'+
        '<b>'+esc(r.name||'(無名)')+'</b> <span>'+esc(r.car||'')+(r.plate?' / '+esc(r.plate):'')+(r.tel?' / ☎'+esc(r.tel):'')+'</span>'+
      '</button>'
    )).join('');
    box.style.display='block';
  };
  window.custPick=function(id){
    const r=list().find(x=>x.id===id); if(!r) return;
    const c=state.cards.find(x=>x.id===_editingCardId); if(!c) return;
    c.customer=r.name||c.customer; c.tel=r.tel||c.tel; c.maker=r.maker||c.maker; c.car=r.car||c.car; c.plate=r.plate||c.plate;
    if(!c.staff) c.staff=r.staff||'';
    renderCardForm(c);
  };

  /* === 顧客リスト ビュー === */
  let _q='';
  window.renderCustomers=function(){
    const wrap=document.getElementById('view-customers-body'); if(!wrap) return;
    const arr=list().slice().sort((a,b)=>(a.name+a.car).localeCompare(b.name+b.car,'ja'));
    const q=norm(_q);
    const shown=q?arr.filter(r=>norm(r.name).includes(q)||norm(r.plate).includes(q)||norm(r.car).includes(q)):arr;
    let h='';
    h+='<div class="cust-head"><input class="cust-search" placeholder="🔍 名前・ナンバー・車で絞り込み" value="'+esc(_q)+'" oninput="custFilter(this.value)"><span class="cust-count">'+shown.length+' 件 / 全 '+arr.length+' 件</span></div>';
    h+='<div class="cust-note">整備ソフトが正式な顧客台帳です。ここは PitFlow の入力を速くするための控え（入庫カードを保存すると自動で育ちます）。履歴・DMは持ちません。</div>';
    if(!shown.length){
      h+='<div class="cust-empty">'+(arr.length?'該当なし':'まだ登録がありません。入庫カードを保存すると自動で貯まります。')+'</div>';
    } else {
      h+='<div class="cust-list">';
      shown.forEach(r=>{
        h+='<div class="cust-row"><div class="cust-main"><div class="cust-name">'+esc(r.name||'(無名)')+'</div>'+
           '<div class="cust-sub">'+esc(r.car||'—')+(r.plate?' ・ '+esc(r.plate):'')+(r.tel?' ・ ☎ '+esc(r.tel):'')+(r.staff?' ・ 担当 '+esc(r.staff):'')+'</div></div>'+
           '<button class="cust-del" onclick="custDelete(\''+r.id+'\')" title="削除">🗑</button></div>';
      });
      h+='</div>';
    }
    wrap.innerHTML=h;
  };
  window.custFilter=function(v){ _q=v; renderCustomers(); };
  window.custDelete=function(id){
    const arr=list(); const i=arr.findIndex(r=>r.id===id);
    if(i<0) return;
    if(!confirm('この控えを削除しますか？\n（整備ソフトの台帳には影響しません）')) return;
    arr.splice(i,1); if(window.PitDB) PitDB.save(); renderCustomers();
  };
})();
