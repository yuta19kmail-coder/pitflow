/* ========================================
   shaken.js  -  車検予定カレンダー（整備）/ PitFlow v0.108.0
   ・直近2週間（既定 今日-2日から16日）を縦アジェンダで表示。
   ・予約詳細カードの「車検スケジュール（inspSchedule）」がベース：
       slots（いつ行けるか＝候補）／decided（予定決定日）／result 'done'（完了）／history（再検の記録）
   ・状態：予定(候補) / 予定決定 / 完了 / 再検（落ちて再度行く）
   ・候補チップ→その日で確定／決定チップ→完了・再検・取消／空き枠クリック→未予定を割当
   新フィールド：inspSchedule.decided, .result('done'), .resultDate, .history[{date,result:'recheck'}], .recheckCount
   ======================================== */
(function(){
  'use strict';
  function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function nm(c){ return (window.pitSurname?pitSurname(c.customer):(c.customer||''))||'（未入力）'; }
  function team(c){ return c.boardId==='import'?'#ec4899':'#1db97a'; }
  function isShaken(c){ var ids=(Array.isArray(c.workTypes)&&c.workTypes.length)?c.workTypes:(c.workType?[c.workType]:[]); return ids.indexOf('shaken')>=0; }
  function ins(c){ if(!c.inspSchedule||typeof c.inspSchedule!=='object') c.inspSchedule={mode:'manual',slots:{},cutBefore:''}; if(!c.inspSchedule.slots) c.inspSchedule.slots={}; if(!Array.isArray(c.inspSchedule.history)) c.inspSchedule.history=[]; return c.inspSchedule; }
  function shakenCars(){ return (state.cards||[]).filter(function(c){ return c && isShaken(c) && c.status!=='scrap'; }); }
  function card(id){ return (state.cards||[]).find(function(c){ return c.id===id; }); }
  function save(){ if(window.PitDB) PitDB.save(); }
  function todayIso(){ var t=new Date(); t.setHours(0,0,0,0); return ymdL(t); }
  function isRikuunOff(iso){ var d=new Date(iso+'T00:00:00'); var w=d.getDay(); if(w===0||w===6) return true; if(window.Holidays&&Holidays.is&&Holidays.is(iso)) return true; return false; }
  function fmtMD(iso){ var d=new Date(iso+'T00:00:00'); return (d.getMonth()+1)+'/'+d.getDate(); }

  function chip(c, stt, iso){
    var t={cand:'予定',decided:'決定',done:'完了',recheck:'再検'}[stt]||'';
    return '<span class="sk-chip sk-'+stt+'" onclick="event.stopPropagation();shakenChip(\''+c.id+'\',\''+stt+'\',\''+iso+'\')" style="border-left-color:'+team(c)+'" title="'+esc(nm(c))+' 様 '+esc(c.car||'')+'">'
      + '<span class="sk-badge">'+t+'</span><span class="sk-nm">'+esc(nm(c))+'様'+(c.car?' '+esc(c.car):'')+'</span></span>';
  }

  function renderShaken(){
    var host=document.getElementById('shakencal-body'); if(!host) return;
    if(!window._shakenBase){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-2); window._shakenBase=t; }
    var base=new Date(window._shakenBase); base.setHours(0,0,0,0);
    var DAYS=16, tIso=todayIso();
    var cars=shakenCars();
    var byDay={}; function push(iso,html){ (byDay[iso]=byDay[iso]||[]).push(html); }
    var cnt={cand:0,decided:0,done:0,recheck:0}, unscheduled=[];
    cars.forEach(function(c){ var s=ins(c);
      (s.history||[]).forEach(function(h){ if(h&&h.result==='recheck'&&h.date){ push(h.date, chip(c,'recheck',h.date)); cnt.recheck++; } });
      if(s.result==='done'){ cnt.done++; var dd=s.resultDate||s.decided||''; if(dd) push(dd, chip(c,'done',dd)); return; }
      if(s.decided){ cnt.decided++; push(s.decided, chip(c,'decided',s.decided)); return; }
      var slotDays=Object.keys(s.slots||{}).filter(function(k){ return (s.slots[k]||[]).length; });
      if(slotDays.length){ cnt.cand++; slotDays.forEach(function(k){ push(k, chip(c,'cand',k)); }); return; }
      unscheduled.push(c);
    });
    var h='';
    h+='<div class="sk-head"><div class="sk-nav"><button onclick="shakenShift(-14)">◀ 前2週</button><b>'+(base.getMonth()+1)+'/'+base.getDate()+' 〜</b><button onclick="shakenShift(14)">次2週 ▶</button><button class="sk-now" onclick="shakenShift(0)">今日</button></div>';
    h+='<div class="sk-legend"><span class="sk-lg cand">予定(候補)</span><span class="sk-lg decided">予定決定</span><span class="sk-lg done">完了</span><span class="sk-lg recheck">再検</span></div></div>';
    h+='<div class="sk-sum"><div class="sk-sc"><b>'+cnt.cand+'</b>予定</div><div class="sk-sc"><b>'+cnt.decided+'</b>決定</div><div class="sk-sc"><b>'+cnt.done+'</b>完了</div><div class="sk-sc sk-sc-re"><b>'+cnt.recheck+'</b>再検</div></div>';
    if(unscheduled.length){
      h+='<div class="sk-un"><div class="sk-un-h">🕗 未予定の車検（'+unscheduled.length+'）＝カードで「いつ行く？」設定、または日付枠をクリックで割当</div><div class="sk-un-list">'
        + unscheduled.map(function(c){ var rc=(ins(c).history||[]).filter(function(x){return x.result==='recheck';}).length; return '<span class="sk-uchip" onclick="shakenPick(\''+c.id+'\')" style="border-left-color:'+team(c)+'">'+esc(nm(c))+'様'+(c.car?' '+esc(c.car):'')+(rc?'<i class="sk-re">再'+rc+'</i>':'')+'</span>'; }).join('')
        + '</div></div>';
    }
    h+='<div class="sk-days">';
    for(var i=0;i<DAYS;i++){ var d=new Date(base); d.setDate(base.getDate()+i); var iso=ymdL(d); var dow=d.getDay(); var off=isRikuunOff(iso);
      h+='<div class="sk-day'+(iso===tIso?' today':'')+(off?' off':'')+'" onclick="shakenDayAssign(\''+iso+'\')">';
      h+='<div class="sk-dnum"><b>'+d.getDate()+'</b><span'+(dow===0?' class="sun"':dow===6?' class="sat"':'')+'>'+'日月火水木金土'[dow]+'</span>'+(off?'<em>陸運休</em>':'')+'</div>';
      h+='<div class="sk-chips">'+((byDay[iso]||[]).join('')||'<span class="sk-empty">＋ 割当</span>')+'</div>';
      h+='</div>';
    }
    h+='</div>';
    host.innerHTML=h;
  }

  // ===== 軽量ポップアップ =====
  function pop(title, bodyHtml){
    var back=document.getElementById('sk-pop');
    if(!back){ back=document.createElement('div'); back.id='sk-pop'; back.className='modal-backdrop'; back.addEventListener('click',function(e){ if(e.target.id==='sk-pop') closePop(); }); document.body.appendChild(back); }
    back.innerHTML='<div class="pdp-box sk-box"><div class="pdp-head"><span>'+title+'</span><button class="pdp-x" onclick="shakenClosePop()">✕</button></div><div class="sk-popbody">'+bodyHtml+'</div></div>';
    back.classList.add('show');
  }
  function closePop(){ var b=document.getElementById('sk-pop'); if(b) b.classList.remove('show'); }
  window.shakenClosePop=closePop;

  window.renderShaken=renderShaken;
  window.shakenShift=function(dir){ var t; if(dir===0){ t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-2); } else { t=new Date(window._shakenBase); t.setDate(t.getDate()+dir); } window._shakenBase=t; renderShaken(); };

  // チップクリック＝状態別メニュー
  window.shakenChip=function(id, stt, iso){
    var c=card(id); if(!c) return; var s=ins(c);
    var info='<div class="sk-pinfo">'+esc(nm(c))+' 様'+(c.car?' / '+esc(c.car):'')+(c.plate?' / '+esc(c.plate):'')+'</div>';
    var b='';
    if(stt==='cand'){
      b=info+'<div class="sk-pnote">候補日：'+fmtMD(iso)+'</div>'
        + '<button class="sk-pbtn primary" onclick="shakenDo(\''+id+'\',\'confirm\',\''+iso+'\')">この日('+fmtMD(iso)+')で予定決定</button>'
        + '<button class="sk-pbtn" onclick="openDetail(\''+id+'\');shakenClosePop()">カードで車検スケジュールを編集</button>';
    } else if(stt==='decided'){
      b=info+'<div class="sk-pnote">予定決定：'+fmtMD(iso)+'</div>'
        + '<button class="sk-pbtn ok" onclick="shakenDo(\''+id+'\',\'done\')">✓ 完了（受かった）</button>'
        + '<button class="sk-pbtn re" onclick="shakenDo(\''+id+'\',\'recheck\')">↺ 再検（落ちた・また行く）</button>'
        + '<button class="sk-pbtn" onclick="shakenDo(\''+id+'\',\'cancel\')">予定を取り消す</button>';
    } else if(stt==='done'){
      b=info+'<div class="sk-pnote">完了：'+fmtMD(iso)+'</div><button class="sk-pbtn" onclick="shakenDo(\''+id+'\',\'reopen\')">予定に戻す</button>';
    } else if(stt==='recheck'){
      b=info+'<div class="sk-pnote">再検（落ち）：'+fmtMD(iso)+'</div><button class="sk-pbtn" onclick="shakenDo(\''+id+'\',\'delRecheck\',\''+iso+'\')">この再検記録を削除</button>';
    }
    pop('車検の予定', b);
  };

  // 未予定チップ→行ける日を選んで確定
  window.shakenPick=function(id){
    var c=card(id); if(!c) return;
    var base=new Date(); base.setHours(0,0,0,0); var days='';
    for(var i=0;i<21;i++){ var d=new Date(base); d.setDate(base.getDate()+i); var iso=ymdL(d); if(isRikuunOff(iso)) continue; days+='<button class="sk-dbtn" onclick="shakenDo(\''+id+'\',\'confirm\',\''+iso+'\')">'+fmtMD(iso)+'('+'日月火水木金土'[d.getDay()]+')</button>'; }
    pop('車検日を決める：'+esc(nm(c))+'様', '<div class="sk-pinfo">'+(c.car?esc(c.car):'')+(c.plate?' / '+esc(c.plate):'')+'</div><div class="sk-daybtns">'+days+'</div>');
  };

  // 日付枠クリック→未予定/未確定の車検車を割当
  window.shakenDayAssign=function(iso){
    var list=shakenCars().filter(function(c){ var s=ins(c); return s.result!=='done' && !s.decided; });
    if(!list.length){ return; }
    var body='<div class="sk-pnote">'+fmtMD(iso)+'（'+'日月火水木金土'[new Date(iso+'T00:00:00').getDay()]+'）に車検を入れる車を選ぶ'+(isRikuunOff(iso)?'<b class="sk-warn">※陸運局休の日です</b>':'')+'</div><div class="sk-alist">'
      + list.map(function(c){ return '<button class="sk-abtn" style="border-left-color:'+team(c)+'" onclick="shakenDo(\''+c.id+'\',\'confirm\',\''+iso+'\')">'+esc(nm(c))+'様'+(c.car?' '+esc(c.car):'')+'</button>'; }).join('')
      + '</div>';
    pop('この日に車検を割当', body);
  };

  // アクション
  window.shakenDo=function(id, act, iso){
    var c=card(id); if(!c) return; var s=ins(c);
    if(act==='confirm'){ s.decided=iso; s.result=''; s.resultDate=''; }
    else if(act==='done'){ s.result='done'; s.resultDate=s.decided||todayIso(); }
    else if(act==='recheck'){ s.history.push({date:s.decided||todayIso(), result:'recheck'}); s.recheckCount=(s.recheckCount||0)+1; s.decided=''; s.result=''; s.resultDate=''; }
    else if(act==='cancel'){ s.decided=''; s.result=''; s.resultDate=''; }
    else if(act==='reopen'){ s.result=''; s.resultDate=''; }
    else if(act==='delRecheck'){ s.history=(s.history||[]).filter(function(h){ return !(h.result==='recheck'&&h.date===iso); }); }
    save(); closePop(); renderShaken();
  };
})();
