/* ========================================
   cust-reg.js  -  顧客・車両の登録画面（PitFlow v1.52.0）
   ----------------------------------------
   ◎なにをするもの（ゆうた指定）
     ・顧客一覧の右上を「新規入庫（予約画面）」→ **「＋ 新規顧客登録」** に変えた、その行き先。
     ・**バラバラだった「新規顧客の登録」と「この顧客に車を足す」を1つの画面に統合**する。
       ① 顧客一覧の右上「＋ 新規顧客登録」 … お客様＋1台目の車をまとめて登録
       ② 顧客詳細の「車両を追加」        … その人に車を足す（人の欄は出さない）
       ③ 入庫カードの「＋ この顧客で新規車両（乗り換え／増車）」… 同じ画面で登録して、
          そのままカードの車の欄に入れる
     ・Lステップ（LINE）など**人につく情報も、この画面で最初から登録できる**。

   ◎🔴「都度車両変動」（ゆうた指定・この画面で入れる印）
     同業の法人などで、定期的に依頼は来るが**入ってくる車は毎回ちがう**お客様のための扱い。
     いままでは「カルテNo.を1つだけ持って、毎回そこに車種を書く」という運用で回していた。
     - チェックを入れると **ナンバーは持たない**（欄も隠す）。
     - **カルテNo.・担当・課・区分は共通**（この1件でずっと使う）。
     - **車種名は予約のたびに手で入れる**。打った名前が
       予約カード・表紙印刷・実績ボード・履歴に**そのまま**出る。
     - 次の予約ではまた別の車種名を、**同じカルテNo.のまま**入れられる。
     ⚠ 車の側の名前は書き換えない（`lastCar` に前回の名前を控えるだけ）。
        だから**過去の予約は当時の車種名のまま**残る。

   ◎決めごと
     ⚠ 保存するのは `state.customers`（PitFlow の控え）。整備ソフトの台帳は乗っ取らない。
     ⚠ ナンバーは PitFlow 全体で「車を見分ける鍵」なので、**他の人と同じナンバーは登録させない**。
     ⚠ 画面の器は customers.js の `custShowModal` を借りる（同じ見た目・同じ閉じ方にするため）。
   ======================================== */
(function (w, d) {
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s){ return String(s||'').replace(/\s+/g,'').replace(/[ァ-ヶ]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-0x60);}).toLowerCase(); }
  function custs(){ if(!Array.isArray(w.state&&state.customers)) state.customers=[]; return state.customers; }
  function findCust(id){ return custs().find(function(x){ return x && x.id===id; })||null; }
  function toast(m){ if(w.pitToast) pitToast(m); }
  function newId(p){ return p+Date.now()+Math.floor(Math.random()*1000); }
  function frontStaffList(){ return ((w.state&&state.staff)||[]).filter(function(s){return s.front;}).map(function(s){return s.name;}); }

  /* いま開いている登録画面の状態。onSaved は呼び出し元が入れる（入庫カードから開いた時に使う） */
  var _reg = null;

  /* ---------- 画面 ---------- */
  function selBoard(v){
    return '<select id="cr-board" class="cr-in"><option value="">—</option>'+
      '<option value="default"'+(v==='default'?' selected':'')+'>国産車</option>'+
      '<option value="import"'+(v==='import'?' selected':'')+'>輸入車</option></select>';
  }
  function selDiv(v){
    return '<select id="cr-div" class="cr-in"><option value="">—</option>'+
      (((w.state&&state.divisions)||[]).map(function(dv){ return '<option value="'+esc(dv.id)+'"'+(v===dv.id?' selected':'')+'>'+esc(dv.label)+'</option>'; }).join(''))+
      '</select>';
  }
  function selFront(v){
    return '<select id="cr-front" class="cr-in"><option value="">—</option>'+
      frontStaffList().map(function(n){ return '<option value="'+esc(n)+'"'+(v===n?' selected':'')+'>'+esc(n)+'</option>'; }).join('')+
      '</select>';
  }
  function contactRow(ct, first){
    ct = ct || {};
    return '<div class="cr-ct">'+
      '<label class="cr-ctpri"><input type="radio" name="cr-pri" class="ui-cb"'+((ct.primary||first)?' checked':'')+'> 優先</label>'+
      '<input class="cr-ctel cr-in" value="'+esc(ct.tel||'')+'" placeholder="090-1234-5678">'+
      '<input class="cr-clabel cr-in" value="'+esc(ct.label||'')+'" placeholder="ラベル（個人携帯 など）">'+
      '<button type="button" class="cr-ctdel" onclick="crDelContact(this)" title="この連絡先を消す"><i data-ic=trash data-ics=15></i></button>'+
      '</div>';
  }

  function render(){
    var isNew = (_reg.mode === 'new');
    var cust  = isNew ? null : findCust(_reg.custId);
    var base  = _reg.base || {};
    var h = '';

    h += '<div class="cm-head"><i data-ic=plus data-ics=16></i> '+(isNew?'新規顧客登録':'車両を追加')+
         (cust?' <span class="cm-sub">'+esc(cust.name||'(無名)')+' 様</span>':'')+
         '<button class="cm-x" onclick="crCancel()" title="閉じる"><i data-ic=close data-ics=16></i></button></div>';
    h += '<div class="cm-body cr-body">';

    /* ── お客様（新規のときだけ入力／車両追加のときは相手を出すだけ） ── */
    if (isNew){
      h += '<div class="cr-sec"><i data-ic=user data-ics=15></i> お客様</div>';
      h += '<div class="cr-row2">'+
             '<div class="cr-f"><label>お客様名 <b class="cr-req">必須</b></label><input id="cr-name" class="cr-in" placeholder="小林 太郎" autocomplete="off"></div>'+
             '<div class="cr-f"><label>カナ</label><input id="cr-kana" class="cr-in" placeholder="コバヤシ タロウ" autocomplete="off"></div>'+
           '</div>';
      h += '<div class="cr-sub">連絡先</div><div id="cr-contacts">'+contactRow(null,true)+'</div>';
      h += '<button type="button" class="cr-add" onclick="crAddContact()">＋ 連絡先を足す</button>';
      /* LINE（Lステップ）＝人につく情報。ここで最初から登録できる（ゆうた指定） */
      h += '<div class="cr-sub">LINE / Lステップ</div>'+
           '<div class="cr-line">'+
             '<select id="cr-line-status" class="cr-in cr-line-sel" onchange="crSyncLine()">'+
               '<option value="">未案内</option><option value="ng">LINE NG</option><option value="ok">登録済</option></select>'+
             '<input id="cr-lstep" class="cr-in cr-line-id" placeholder="Lステップ番号 / URL貼付OK" oninput="crSyncLine()" style="display:none">'+
             '<a id="cr-lstep-link" class="ct-bline" target="_blank" rel="noopener" style="display:none"><i data-ic=link data-ics=15></i> Lステップ</a>'+
           '</div>';
    } else {
      h += '<div class="cr-who"><i data-ic=user data-ics=15></i> '+esc(cust?(cust.name||'(無名)'):'')+' 様に車を足します'+
           '<span class="cr-whosub">お客様の名前・連絡先・LINE はそのままです</span></div>';
    }

    /* ── 車両 ── */
    h += '<div class="cr-sec"><i data-ic=car data-ics=15></i> 車両</div>';
    /* 🔴 都度車両変動のスイッチ。ONにするとナンバー・メーカー・車種を隠す */
    h += '<label class="cr-pvbox"><input type="checkbox" id="cr-pv" class="ui-cb" onchange="crTogglePV()">'+
         '<span class="cr-pvmain">都度車両変動（毎回ちがう車で入ってくる）</span></label>';
    h += '<div class="cr-pvnote" id="cr-pvnote" style="display:none">'+
         '同業の法人など、<b>依頼は定期的に来るけれど入る車は毎回ちがう</b>お客様向けの扱いです。'+
         '<br>・<b>カルテNo.・担当・課・区分は共通</b>で、この1件をずっと使います'+
         '<br>・<b>ナンバーは持ちません</b>'+
         '<br>・<b>車種名は予約のたびに入力</b>します。打った名前が予約カード・表紙・実績ボード・履歴にそのまま出ます'+
         '</div>';
    h += '<div id="cr-plainveh">'+
           '<div class="cr-row2">'+
             '<div class="cr-f"><label>ナンバー</label><input id="cr-plate" class="cr-in" placeholder="野田 300 ひ 5555" autocomplete="off"></div>'+
             '<div class="cr-f"><label>メーカー</label><input id="cr-maker" class="cr-in" value="'+esc(base.maker||'')+'" placeholder="トヨタ" autocomplete="off"></div>'+
           '</div>'+
           '<div class="cr-row2">'+
             '<div class="cr-f"><label>車種（グレード）</label><input id="cr-car" class="cr-in" value="'+esc(base.car||'')+'" placeholder="アクア Gz" autocomplete="off"></div>'+
             '<div class="cr-f"></div>'+
           '</div>'+
         '</div>';
    h += '<div class="cr-row3">'+
           '<div class="cr-f"><label>カルテNo. <b class="cr-req" id="cr-karte-req" style="display:none">必須</b></label><input id="cr-karte" class="cr-in" placeholder="例 1234" autocomplete="off"></div>'+
           '<div class="cr-f"><label>国産／輸入</label>'+selBoard(base.boardId||'')+'</div>'+
           '<div class="cr-f"><label>課</label>'+selDiv(base.division||'')+'</div>'+
           '<div class="cr-f"><label>フロント担当</label>'+selFront(base.frontStaff||'')+'</div>'+
         '</div>';
    if (isNew) h += '<div class="cr-hint">車がまだ決まっていなければ、車の欄は空のままでも登録できます（あとから足せます）。</div>';

    h += '</div>';
    h += '<div class="cm-foot"><button class="cm-cancel" onclick="crCancel()">やめる</button>'+
         '<button class="cm-save" onclick="crSave()">'+(isNew?'登録する':'この車を追加する')+'</button></div>';

    if (w.custShowModal) custShowModal(h, 'cr-box');
    if (w.icHydrate) try{ icHydrate(); }catch(e){}
    if (w.pitIconsHydrate) try{ pitIconsHydrate(); }catch(e){}
    setTimeout(function(){ var f=d.getElementById(isNew?'cr-name':'cr-plate'); if(f) f.focus(); }, 30);
  }

  /* ---------- 画面の操作 ---------- */
  w.crTogglePV = function(){
    var on = !!(d.getElementById('cr-pv')||{}).checked;
    var box = d.getElementById('cr-plainveh'); if(box) box.style.display = on ? 'none' : '';
    var note= d.getElementById('cr-pvnote');   if(note) note.style.display = on ? '' : 'none';
    var req = d.getElementById('cr-karte-req');if(req) req.style.display  = on ? '' : 'none';
    if(on){ var k=d.getElementById('cr-karte'); if(k) k.focus(); }
  };
  w.crAddContact = function(){
    var box=d.getElementById('cr-contacts'); if(!box) return;
    var wrap=d.createElement('div'); wrap.innerHTML=contactRow(null,false);
    if(wrap.firstElementChild) box.appendChild(wrap.firstElementChild);
    if(w.icHydrate) try{ icHydrate(); }catch(e){}
  };
  w.crDelContact = function(btn){
    var row=btn.closest('.cr-ct'); if(!row) return;
    var box=d.getElementById('cr-contacts');
    if(box && box.querySelectorAll('.cr-ct').length<=1){ /* 最後の1行は空にするだけ */
      row.querySelector('.cr-ctel').value=''; row.querySelector('.cr-clabel').value=''; return;
    }
    row.remove();
  };
  w.crSyncLine = function(){
    var sel=d.getElementById('cr-line-status'), inp=d.getElementById('cr-lstep'), link=d.getElementById('cr-lstep-link');
    if(!sel||!inp||!link) return;
    var ok = sel.value==='ok';
    inp.style.display = ok ? '' : 'none';
    var url = (ok && inp.value.trim() && w.pitLstepUrl) ? pitLstepUrl(inp.value.trim()) : '';
    if(url){ link.href=url; link.style.display=''; } else { link.removeAttribute('href'); link.style.display='none'; }
  };
  w.crCancel = function(){
    var back = _reg && _reg.back, id = _reg && _reg.custId;
    _reg = null;
    if (back==='detail' && id && w.custOpen) custOpen(id);
    else if (w.custCloseModal) custCloseModal();
  };

  /* ---------- 保存 ---------- */
  function readContacts(){
    var out=[];
    d.querySelectorAll('#cr-contacts .cr-ct').forEach(function(row){
      var tel=(row.querySelector('.cr-ctel').value||'').trim();
      var label=(row.querySelector('.cr-clabel').value||'').trim();
      var primary=!!row.querySelector('input[name="cr-pri"]').checked;
      if(tel||label) out.push({tel:tel,label:label,primary:primary});
    });
    if(out.length && !out.some(function(x){return x.primary;})) out[0].primary=true;
    return out;
  }
  /* 同じナンバーが他所に登録されていないか（PitFlow はナンバーで車を見分けるので重複は禁止） */
  function plateOwner(plate, skipCustId){
    var pl=norm(plate); if(!pl) return null;
    var hit=null;
    custs().forEach(function(c){
      (c.vehicles||[]).forEach(function(v){
        if(norm(v.plate)===pl && !(skipCustId && c.id===skipCustId && false)) hit = hit || c;
      });
    });
    return hit;
  }

  w.crSave = function(){
    if(!_reg) return;
    var g=function(id){ var e=d.getElementById(id); return e?String(e.value||'').trim():''; };
    var isNew=(_reg.mode==='new');
    var pv = !!(d.getElementById('cr-pv')||{}).checked;

    var plate = pv?'':g('cr-plate'), maker = pv?'':g('cr-maker'), car = pv?'':g('cr-car');
    var karteNo=g('cr-karte'), boardId=g('cr-board'), division=g('cr-div'), frontStaff=g('cr-front');
    var hasVeh = !!(pv || plate || maker || car || karteNo);

    if(isNew && !g('cr-name')){ toast('お客様名を入れてください'); var n=d.getElementById('cr-name'); if(n) n.focus(); return; }
    if(pv && !karteNo){ toast('都度車両変動は、共通で使うカルテNo.が要ります'); var k=d.getElementById('cr-karte'); if(k) k.focus(); return; }
    if(!isNew && !hasVeh){ toast('車の内容を入れてください'); return; }
    if(plate){
      var owner=plateOwner(plate);
      if(owner && (isNew || owner.id!==_reg.custId)){ toast('そのナンバーは「'+(owner.name||'(無名)')+'」様で登録済みです'); return; }
      if(owner && !isNew && owner.id===_reg.custId){ toast('そのナンバーはこのお客様にもう登録されています'); return; }
    }

    var _fm = w.pitStaffByName ? pitStaffByName(frontStaff) : null;
    var veh = hasVeh ? { id:newId('v'), plate:plate, maker:maker, car:car, karteNo:karteNo,
                         boardId:boardId, division:division, frontStaff:frontStaff, frontStaffId:(_fm?_fm.id:''),
                         updatedAt:Date.now() } : null;
    if(veh && pv) veh.perVisit = true;

    var cust;
    if(isNew){
      cust = { id:newId('cu'), name:g('cr-name'), kana:g('cr-kana'), contacts:readContacts(),
               vehicles: veh?[veh]:[], updatedAt:Date.now() };
      var ls=d.getElementById('cr-line-status');
      if(ls && ls.value) cust.lineStatus=ls.value;
      if(g('cr-lstep')) cust.lstepId=g('cr-lstep');
      custs().push(cust);
    } else {
      cust = findCust(_reg.custId);
      if(!cust){ toast('お客様が見つかりません'); return; }
      if(!Array.isArray(cust.vehicles)) cust.vehicles=[];
      if(veh) cust.vehicles.push(veh);
      cust.updatedAt=Date.now();
    }
    if(w.PitDB) PitDB.save();
    if(w.pitOpLog) try{ pitOpLog(isNew?'顧客を登録':'車両を追加', (cust.name||'')+(veh?(' / '+(pv?'都度車両変動':(veh.plate||veh.car||''))):'')); }catch(e){}
    toast(isNew?'登録しました':'車両を追加しました');

    var after=_reg.onSaved, back=_reg.back, cid=cust.id;
    _reg=null;
    if(typeof after==='function'){ after(cust, veh); return; }     /* 入庫カードから開いた時はカードに入れて終わり */
    if(back==='detail' || isNew){ if(w.custOpen) custOpen(cid); if(w.renderCustTable) renderCustTable(); return; }
    if(w.custCloseModal) custCloseModal();
    if(w.renderCustomers) renderCustomers();
  };

  /* ---------- 入口 ---------- */
  function open(opts){
    opts = opts || {};
    _reg = { mode: opts.mode||'new', custId: opts.custId||'', base: opts.base||{}, back: opts.back||'', onSaved: opts.onSaved||null };
    render();
  }
  w.PitCustReg = { open: open };
  /* 顧客一覧の右上「＋ 新規顧客登録」 */
  w.custNewCustomer = function(){ open({ mode:'new' }); };
  /* 顧客詳細の「車両を追加」 */
  w.custAddVehicleFor = function(custId, base){ open({ mode:'vehicle', custId:custId, base:base||{}, back:'detail' }); };

  console.log('[cust-reg] ready（顧客・車両の登録画面 v1.52.0）');
})(window, document);
