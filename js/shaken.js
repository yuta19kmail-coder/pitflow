/* ========================================
   shaken.js  -  車検予定カレンダー（整備）/ PitFlow v0.109.0
   ・直近2週間（既定 今日-2日から16日）を縦アジェンダ。各日を「🌅午前／🌇午後」の2列に分けて表示。
   ・ベース＝予約詳細カードの車検スケジュール inspSchedule：
       slots{iso:['am','pm']}（いつ行けるか＝候補）／decided+decidedSlot（予定決定日・午前午後）／
       result 'done'+resultSlot（完了）／history[{date,slot,result:'recheck'}]（再検の記録）
   ・状態：予定(候補) / 予定決定 / 完了 / 再検。候補チップ→その枠で確定／決定→完了・再検・取消／空き枠→割当。
   ======================================== */
(function(){
  'use strict';
  var DAYCAP=5;   // 1枠(午前/午後)あたりの表示上限
  var SLABEL={am:'🌅 午前', pm:'🌇 午後'};
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

  function chip(c, stt, iso, slot){
    var t={cand:'予定',decided:'決定',done:'完了',recheck:'再検'}[stt]||'';
    return '<span class="sk-chip sk-'+stt+'" onclick="event.stopPropagation();shakenChip(\''+c.id+'\',\''+stt+'\',\''+iso+'\',\''+slot+'\')" style="border-left-color:'+team(c)+'" title="'+esc(nm(c))+' 様 '+esc(c.car||'')+'">'
      + '<span class="sk-badge">'+t+'</span><span class="sk-nm">'+esc(nm(c))+'様'+(c.car?' '+esc(c.car):'')+'</span></span>';
  }

  function collect(){
    // byDay[iso] = { am:[{c,stt}], pm:[...] }
    var byDay={}; function slot(iso){ return (byDay[iso]=byDay[iso]||{am:[],pm:[]}); }
    var cnt={cand:0,decided:0,done:0,recheck:0}, unscheduled=[];
    var tIso=todayIso();
    shakenCars().forEach(function(c){ var s=ins(c);
      (s.history||[]).forEach(function(h){ if(h&&h.result==='recheck'&&h.date){ slot(h.date)[h.slot==='pm'?'pm':'am'].push({c:c,stt:'recheck'}); cnt.recheck++; } });
      if(s.result==='done'){ cnt.done++; var dd=s.resultDate||s.decided||''; if(dd) slot(dd)[(s.resultSlot||s.decidedSlot)==='pm'?'pm':'am'].push({c:c,stt:'done'}); return; }
      if(s.decided){ cnt.decided++; slot(s.decided)[s.decidedSlot==='pm'?'pm':'am'].push({c:c,stt:'decided'}); return; }
      var slotDays=Object.keys(s.slots||{}).filter(function(k){ return (s.slots[k]||[]).length; }).sort();
      if(slotDays.length){ cnt.cand++; var pick=slotDays.filter(function(d){return d>=tIso;})[0]||slotDays[slotDays.length-1];
        var sl=s.slots[pick]||[]; var hasAm=sl.indexOf('am')>=0, hasPm=sl.indexOf('pm')>=0; if(!hasAm&&!hasPm) hasAm=true;
        if(hasAm) slot(pick).am.push({c:c,stt:'cand'}); if(hasPm) slot(pick).pm.push({c:c,stt:'cand'}); return; }
      unscheduled.push(c);
    });
    return {byDay:byDay, cnt:cnt, unscheduled:unscheduled};
  }

  function renderShaken(){
    var host=document.getElementById('shakencal-body'); if(!host) return;
    if(!window._shakenBase){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-2); window._shakenBase=t; }
    var base=new Date(window._shakenBase); base.setHours(0,0,0,0);
    var DAYS=16, tIso=todayIso();
    var data=collect(), byDay=data.byDay, cnt=data.cnt;
    var h='';
    h+='<div class="sk-head"><div class="sk-nav"><button onclick="shakenShift(-14)">◀ 前2週</button><b>'+(base.getMonth()+1)+'/'+base.getDate()+' 〜</b><button onclick="shakenShift(14)">次2週 ▶</button><button class="sk-now" onclick="shakenShift(0)">今日</button></div>';
    h+='<div class="sk-legend"><span class="sk-lg cand">予定(候補)</span><span class="sk-lg decided">予定決定</span><span class="sk-lg done">完了</span><span class="sk-lg recheck">再検</span></div></div>';
    h+='<div class="sk-sum"><div class="sk-sc"><b>'+cnt.cand+'</b>予定</div><div class="sk-sc"><b>'+cnt.decided+'</b>決定</div><div class="sk-sc"><b>'+cnt.done+'</b>完了</div><div class="sk-sc sk-sc-re"><b>'+cnt.recheck+'</b>再検</div></div>';
    if(data.unscheduled.length){
      h+='<div class="sk-un"><div class="sk-un-h">🕗 未予定の車検（'+data.unscheduled.length+'）＝カードで「いつ行く？」設定、または枠をクリックで割当</div><div class="sk-un-list">'
        + data.unscheduled.map(function(c){ var rc=(ins(c).history||[]).filter(function(x){return x.result==='recheck';}).length; return '<span class="sk-uchip" onclick="shakenPick(\''+c.id+'\')" style="border-left-color:'+team(c)+'">'+esc(nm(c))+'様'+(c.car?' '+esc(c.car):'')+(rc?'<i class="sk-re">再'+rc+'</i>':'')+'</span>'; }).join('')
        + '</div></div>';
    }
    h+='<div class="sk-days">';
    for(var i=0;i<DAYS;i++){ var d=new Date(base); d.setDate(base.getDate()+i); var iso=ymdL(d); var dow=d.getDay(); var off=isRikuunOff(iso);
      var day=byDay[iso]||{am:[],pm:[]}; var tot=day.am.length+day.pm.length;
      h+='<div class="sk-day'+(iso===tIso?' today':'')+(off?' off':'')+'">';
      h+='<div class="sk-dnum"><b>'+d.getDate()+'</b><span'+(dow===0?' class="sun"':dow===6?' class="sat"':'')+'>'+'日月火水木金土'[dow]+'</span>'+(tot?'<em class="sk-cn">'+tot+'台</em>':(off?'<em>陸運休</em>':''))+'</div>';
      h+='<div class="sk-slots">';
      ['am','pm'].forEach(function(sl){
        var ents=day[sl]; var shown=ents.slice(0,DAYCAP).map(function(e){ return chip(e.c,e.stt,iso,sl); }).join('');
        var more=ents.length-DAYCAP;
        h+='<div class="sk-slot'+(off?' off':'')+'" onclick="if(event.target.closest(\'.sk-chip\'))return; shakenDayAssign(\''+iso+'\',\''+sl+'\')">';
        h+='<div class="sk-slb">'+SLABEL[sl]+'<i>'+(ents.length||'')+'</i></div>';
        h+='<div class="sk-chips">'+(shown||'<span class="sk-empty">＋</span>')+(more>0?'<span class="sk-more" onclick="event.stopPropagation();shakenDayPopup(\''+iso+'\')">+'+more+'</span>':'')+'</div>';
        h+='</div>';
      });
      h+='</div></div>';
    }
    h+='</div>';
    host.innerHTML=h;
  }

  // ===== ポップアップ =====
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

  window.shakenChip=function(id, stt, iso, slot){
    var c=card(id); if(!c) return;
    var info='<div class="sk-pinfo">'+esc(nm(c))+' 様'+(c.car?' / '+esc(c.car):'')+(c.plate?' / '+esc(c.plate):'')+'</div>';
    var slName=slot==='pm'?'午後':'午前'; var b='';
    if(stt==='cand'){
      b=info+'<div class="sk-pnote">候補：'+fmtMD(iso)+' '+slName+'</div>'
        + '<button class="sk-pbtn primary" onclick="shakenDo(\''+id+'\',\'confirm\',\''+iso+'\',\''+slot+'\')">この枠（'+fmtMD(iso)+' '+slName+'）で予定決定</button>'
        + '<button class="sk-pbtn" onclick="openDetail(\''+id+'\');shakenClosePop()">カードで車検スケジュールを編集</button>';
    } else if(stt==='decided'){
      b=info+'<div class="sk-pnote">予定決定：'+fmtMD(iso)+' '+slName+'</div>'
        + '<button class="sk-pbtn ok" onclick="shakenDo(\''+id+'\',\'done\')">✓ 完了（受かった）</button>'
        + '<button class="sk-pbtn re" onclick="shakenDo(\''+id+'\',\'recheck\')">↺ 再検（落ちた・また行く）</button>'
        + '<button class="sk-pbtn swap" onclick="shakenDo(\''+id+'\',\'confirm\',\''+iso+'\',\''+(slot==='pm'?'am':'pm')+'\')">'+(slot==='pm'?'午前':'午後')+'に変更</button>'
        + '<button class="sk-pbtn" onclick="shakenDo(\''+id+'\',\'cancel\')">予定を取り消す</button>';
    } else if(stt==='done'){
      b=info+'<div class="sk-pnote">完了：'+fmtMD(iso)+' '+slName+'</div><button class="sk-pbtn" onclick="shakenDo(\''+id+'\',\'reopen\')">予定に戻す</button>';
    } else if(stt==='recheck'){
      b=info+'<div class="sk-pnote">再検（落ち）：'+fmtMD(iso)+' '+slName+'</div><button class="sk-pbtn" onclick="shakenDo(\''+id+'\',\'delRecheck\',\''+iso+'\',\''+slot+'\')">この再検記録を削除</button>';
    }
    pop('車検の予定', b);
  };

  window.shakenPick=function(id){
    var c=card(id); if(!c) return;
    var base=new Date(); base.setHours(0,0,0,0); var rows='';
    for(var i=0;i<21;i++){ var d=new Date(base); d.setDate(base.getDate()+i); var iso=ymdL(d); if(isRikuunOff(iso)) continue;
      rows+='<div class="sk-drow"><span class="sk-dlbl">'+fmtMD(iso)+'('+'日月火水木金土'[d.getDay()]+')</span>'
        + '<button class="sk-dbtn" onclick="shakenDo(\''+id+'\',\'confirm\',\''+iso+'\',\'am\')">午前</button>'
        + '<button class="sk-dbtn" onclick="shakenDo(\''+id+'\',\'confirm\',\''+iso+'\',\'pm\')">午後</button></div>'; }
    pop('車検日を決める：'+esc(nm(c))+'様', '<div class="sk-pinfo">'+(c.car?esc(c.car):'')+(c.plate?' / '+esc(c.plate):'')+'</div><div class="sk-drows">'+rows+'</div>');
  };

  window.shakenDayAssign=function(iso, slot){
    var list=shakenCars().filter(function(c){ var s=ins(c); return s.result!=='done' && !s.decided; });
    if(!list.length){ return; }
    var slName=slot==='pm'?'午後':'午前';
    var body='<div class="sk-pnote">'+fmtMD(iso)+'（'+'日月火水木金土'[new Date(iso+'T00:00:00').getDay()]+'）'+slName+' に入れる車を選ぶ'+(isRikuunOff(iso)?'<b class="sk-warn">※陸運局休</b>':'')+'</div><div class="sk-alist">'
      + list.map(function(c){ return '<button class="sk-abtn" style="border-left-color:'+team(c)+'" onclick="shakenDo(\''+c.id+'\',\'confirm\',\''+iso+'\',\''+slot+'\')">'+esc(nm(c))+'様'+(c.car?' '+esc(c.car):'')+'</button>'; }).join('')
      + '</div>';
    pop('この枠に車検を割当', body);
  };

  window.shakenDayPopup=function(iso){
    var data=collect(); var day=data.byDay[iso]||{am:[],pm:[]};
    function sec(sl){ var ents=day[sl]; return '<div class="sk-pslot"><div class="sk-slb">'+SLABEL[sl]+'</div><div class="sk-alist">'
      + (ents.length? ents.map(function(e){ return '<button class="sk-abtn sk-'+e.stt+'" style="border-left-color:'+team(e.c)+'" onclick="shakenChip(\''+e.c.id+'\',\''+e.stt+'\',\''+iso+'\',\''+sl+'\')">'+esc(nm(e.c))+'様'+(e.c.car?' '+esc(e.c.car):'')+'</button>'; }).join('') : '<span class="sk-empty">なし</span>')
      + '</div></div>'; }
    pop(fmtMD(iso)+'（'+'日月火水木金土'[new Date(iso+'T00:00:00').getDay()]+'）の車検 '+(day.am.length+day.pm.length)+'台', sec('am')+sec('pm'));
  };

  window.shakenDo=function(id, act, iso, slot){
    var c=card(id); if(!c) return; var s=ins(c);
    if(act==='confirm'){ s.decided=iso; s.decidedSlot=(slot==='pm'?'pm':'am'); s.result=''; s.resultDate=''; s.resultSlot=''; }
    else if(act==='done'){ s.result='done'; s.resultDate=s.decided||todayIso(); s.resultSlot=s.decidedSlot||'am'; }
    else if(act==='recheck'){ s.history.push({date:s.decided||todayIso(), slot:s.decidedSlot||'am', result:'recheck'}); s.recheckCount=(s.recheckCount||0)+1; s.decided=''; s.decidedSlot=''; s.result=''; s.resultDate=''; s.resultSlot=''; }
    else if(act==='cancel'){ s.decided=''; s.decidedSlot=''; s.result=''; s.resultDate=''; s.resultSlot=''; }
    else if(act==='reopen'){ s.result=''; s.resultDate=''; s.resultSlot=''; }
    else if(act==='delRecheck'){ s.history=(s.history||[]).filter(function(h){ return !(h.result==='recheck'&&h.date===iso&&(h.slot||'am')===(slot||'am')); }); }
    save(); closePop(); renderShaken();
  };
})();
