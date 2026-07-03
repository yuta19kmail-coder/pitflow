/* ========================================
   shaken.js  -  車検予定（整備の俯瞰）/ PitFlow v0.110.0
   ・上＝決定カレンダー（各日を🌅午前｜🌇午後に縦割り／予定決定・完了・再検）
   ・下＝可能性ガント（行＝車、帯＝「行ける枠」＝予約詳細 inspSchedule.slots）
   ・帯 or 決定チップをドラッグ→決定枠へドロップで確定/移動。決定チップのタップで完了/再検/取消。
   ・配車（誰が運ぶ）は扱わない＝MHSの領分。ここは整備が段取りを目で見る場所。
   フィールド：inspSchedule.slots{iso:['am','pm']}（候補）/ decided+decidedSlot / result 'done'+resultSlot / history[{date,slot,result:'recheck'}]
   ======================================== */
(function(){
  'use strict';
  var DOW='日月火水木金土', DAYS=12;
  function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function surname(c){ return (window.pitSurname?pitSurname(c.customer):(c.customer||''))||'（未入力）'; }
  function team(c){ return c.boardId==='import'?'#ec4899':'#1db97a'; }
  function carLabel(c){ return (c.car||c.maker||c.plate||'').toString(); }
  function isShaken(c){ var ids=(Array.isArray(c.workTypes)&&c.workTypes.length)?c.workTypes:(c.workType?[c.workType]:[]); return ids.indexOf('shaken')>=0; }
  function ins(c){ if(!c.inspSchedule||typeof c.inspSchedule!=='object') c.inspSchedule={mode:'manual',slots:{},cutBefore:''}; if(!c.inspSchedule.slots) c.inspSchedule.slots={}; if(!Array.isArray(c.inspSchedule.history)) c.inspSchedule.history=[]; return c.inspSchedule; }
  function shakenCars(){ return (state.cards||[]).filter(function(c){ return c && isShaken(c) && c.status!=='scrap'; }); }
  function card(id){ return (state.cards||[]).find(function(c){ return c.id===id; }); }
  function save(){ if(window.PitDB) PitDB.save(); }
  function todayIso(){ var t=new Date(); t.setHours(0,0,0,0); return ymdL(t); }
  function shopClosed(iso){ var arr=(window.state&&state.settings&&state.settings.closedDow)||[3]; return arr.indexOf(new Date(iso+'T00:00:00').getDay())>=0; }
  function isOff(iso){ var w=new Date(iso+'T00:00:00').getDay(); if(w===0||w===6) return true; if(window.Holidays&&Holidays.is&&Holidays.is(iso)) return true; if(shopClosed(iso)) return true; return false; }
  function offLabel(iso){ var w=new Date(iso+'T00:00:00').getDay(); if(w!==0&&w!==6&&!(window.Holidays&&Holidays.is&&Holidays.is(iso))&&shopClosed(iso)) return '定休'; return '休'; }
  function fmtMD(iso){ var d=new Date(iso+'T00:00:00'); return (d.getMonth()+1)+'/'+d.getDate(); }

  function rangeDays(){
    if(!window._shakenBase){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7)); window._shakenBase=t; } // 週の月曜
    var base=new Date(window._shakenBase); base.setHours(0,0,0,0);
    var out=[]; for(var i=0;i<DAYS;i++){ var d=new Date(base); d.setDate(base.getDate()+i); out.push({iso:ymdL(d),date:d,w:d.getDay(),off:isOff(ymdL(d))}); }
    return out;
  }

  function isArrived(c){ return c.status!=='reserved' && c.status!=='returned' && c.status!=='scrap'; }
  function collect(){
    var decCell={};
    function push(iso,slot,c,kind){ var k=iso+'|'+(slot==='pm'?'pm':'am'); (decCell[k]=decCell[k]||[]).push({c:c,kind:kind}); }
    var cands=[], empties=[], unsched=[], cnt={decided:0,done:0,recheck:0,cand:0,unset:0};
    shakenCars().forEach(function(c){ var s=ins(c);
      (s.history||[]).forEach(function(h){ if(h&&h.result==='recheck'&&h.date){ push(h.date,h.slot,c,'recheck'); cnt.recheck++; } });
      if(s.result==='done'){ cnt.done++; var dd=s.resultDate||s.decided; if(dd) push(dd,(s.resultSlot||s.decidedSlot),c,'done'); return; }
      if(s.decided){ cnt.decided++; push(s.decided,s.decidedSlot,c,'decided'); return; }
      var slotDays=Object.keys(s.slots||{}).filter(function(k){ return (s.slots[k]||[]).length; });
      if(slotDays.length){ cnt.cand++; cands.push(c); return; }
      if(isArrived(c)){ cnt.unset++; empties.push(c); return; }   // 入庫済みで予定なし＝未設定→予定欄に空行
      unsched.push(c);                                            // 未入庫（予約中）で予定なし→ストリップ
    });
    return {decCell:decCell, cands:cands, empties:empties, unsched:unsched, cnt:cnt};
  }

  function decChip(c, kind){ var car=carLabel(c);
    return '<div class="shk-chip shk-'+kind+'" draggable="true" data-card-id="'+c.id+'"'
      + ' ondragstart="shkDragStart(event,\''+c.id+'\')" ondragend="shkDragEnd(event)"'
      + ' onclick="shkChipMenu(\''+c.id+'\')" style="border-left-color:'+team(c)+'">'
      + '<div class="shk-nm">'+esc(surname(c))+'様</div><div class="shk-car">'+(car?esc(car):'<span class="shk-nocar">車種未登録</span>')+'</div></div>';
  }

  function renderShaken(){
    var host=document.getElementById('shakencal-body'); if(!host) return;
    var days=rangeDays(), tIso=todayIso();
    var subs=[]; days.forEach(function(d){ subs.push({iso:d.iso,slot:'am',off:d.off}); subs.push({iso:d.iso,slot:'pm',off:d.off}); });
    var data=collect(), decCell=data.decCell, cnt=data.cnt;
    var h='';
    // ヘッダ操作
    h+='<div class="shk-head"><div class="shk-nav"><button onclick="shkShift(-7)">◀ 前週</button><b>'+fmtMD(days[0].iso)+' 〜</b><button onclick="shkShift(7)">次週 ▶</button><button class="shk-now" onclick="shkShift(0)">今週</button></div>';
    h+='<div class="shk-legend"><span class="shk-lg dc">決定</span><span class="shk-lg dn">完了</span><span class="shk-lg re">再検</span><span class="shk-lg cd">予定枠</span></div>';
    h+='<div class="shk-sum">決定'+cnt.decided+'／完了'+cnt.done+'／再検'+cnt.recheck+'／候補'+cnt.cand+'／未設定'+cnt.unset+'</div></div>';
    // 未予定
    if(data.unsched.length){
      h+='<div class="shk-un">🕗 未入庫の予約（車検・予定は入庫後に）：'+data.unsched.map(function(c){ return '<span class="shk-uchip" data-card-id="'+c.id+'" onclick="openDetail(\''+c.id+'\')" style="border-left-color:'+team(c)+'">'+esc(surname(c))+'様 '+esc(carLabel(c)||'')+'</span>'; }).join('')+'</div>';
    }
    // スクロール表
    h+='<div class="shk-scroll"><div class="shk-tbl">';
    // 日付ヘッダ
    h+='<div class="shk-row"><div class="shk-gut hgut"></div>'+days.map(function(x){ var isT=x.iso===tIso; var n=0; ['am','pm'].forEach(function(s){ n+=(decCell[x.iso+'|'+s]||[]).length; });
      return '<div class="shk-day'+(x.off?' dayoff':'')+'"><div class="shk-dh'+(isT?' today':'')+(x.off?' off':'')+'"><span class="d">'+x.date.getDate()+'</span> <span class="w '+(x.w===0?'sun':x.w===6?'sat':'wd')+'">'+DOW[x.w]+'</span>'+(x.off?'<div class="cn">休</div>':'<div class="cn">決'+n+'</div>')+'</div></div>'; }).join('')+'</div>';
    // 午前午後
    h+='<div class="shk-row"><div class="shk-gut hgut bb"></div>'+days.map(function(x){ if(x.off) return '<div class="shk-off2 apoff"><span class="shk-ap off">'+offLabel(x.iso)+'</span></div>'; return '<div class="shk-sc"><div class="shk-ap am">🌅午前</div></div><div class="shk-sc pm"><div class="shk-ap pm">🌇午後</div></div>'; }).join('')+'</div>';
    // 決定バンド
    h+='<div class="shk-row shk-bandrow"><div class="shk-band">📌 決定</div><div class="shk-bandfill"></div></div>';
    h+='<div class="shk-row"><div class="shk-gut glabel">行く車</div>'+days.map(function(x){
      if(x.off) return '<div class="shk-off2"></div>';
      return ['am','pm'].map(function(slot){
        var arr=decCell[x.iso+'|'+slot]||[];
        var inner=arr.length?arr.map(function(o){ return decChip(o.c,o.kind); }).join(''):'<span class="shk-empty">－</span>';
        return '<div class="shk-sc'+(slot==='pm'?' pm':'')+'"><div class="shk-decell" data-iso="'+x.iso+'" data-slot="'+slot+'" ondragover="shkOver(event)" ondragleave="shkLeave(event)" ondrop="shkDrop(event,\''+x.iso+'\',\''+slot+'\')">'+inner+'</div></div>';
      }).join('');
    }).join('')+'</div>';
    // 可能性ガント
    h+='<div class="shk-row shk-bandrow"><div class="shk-band">🕘 予定</div><div class="shk-bandfill"></div></div>';
    window._shkSubs = subs;
    var ganttCars = data.cands.concat(data.empties);
    ganttCars.forEach(function(c){ var s=ins(c); var isEmpty=data.empties.indexOf(c)>=0;
      function son(di,slot){ var day=days[di]; if(!day||day.off) return false; return (s.slots[day.iso]||[]).indexOf(slot)>=0; }
      var attr=[]; if(isEmpty)attr.push('未設定'); var dr=Array.isArray(c.drive)?c.drive:[]; if(dr.indexOf('leftHand')>=0)attr.push('左'); if(dr.indexOf('mt')>=0)attr.push('MT');
      var ids=(Array.isArray(c.workTypes)&&c.workTypes.length)?c.workTypes:[]; if(ids.indexOf('12pt')>=0)attr.push('12点');
      var rc=(s.history||[]).filter(function(x){return x.result==='recheck';}).length; if(rc)attr.push('再'+rc);
      h+='<div class="shk-row shk-gcar'+(isEmpty?' unset':'')+'" data-card-id="'+c.id+'"><div class="shk-gut gcar"><div class="shk-gcar-nm">'+esc(surname(c))+'様 '+esc(carLabel(c))+'</div><div class="shk-gcar-sub">'+attr.map(function(x){return '<span class="shk-ca'+(x==='未設定'?' unset':'')+'">'+x+'</span>';}).join('')+'</div></div>'
        + days.map(function(x,di){ if(x.off) return '<div class="shk-off2"></div>';
            return ['am','pm'].map(function(slot){
              var idx=di*2+(slot==='am'?0:1), on=son(di,slot);
              if(!on) return '<div class="shk-gsc paintable'+(slot==='pm'?' pm':'')+'" data-car="'+c.id+'" data-idx="'+idx+'" onmousedown="shkPaintStart(event,\''+c.id+'\','+idx+')" onmouseenter="shkPaintMove(\''+c.id+'\','+idx+')" title="ドラッグで行ける枠を選択"></div>';
              var pOn = slot==='am'? son(di-1,'pm') : son(di,'am');
              var nOn = slot==='am'? son(di,'pm') : son(di+1,'am');
              return '<div class="shk-gsc'+(slot==='pm'?' pm':'')+'"><div class="shk-bar'+(c.boardId==='import'?' imp':'')+(pOn?'':' l')+(nOn?'':' r')+'" draggable="true" data-card-id="'+c.id+'" ondragstart="shkDragStart(event,\''+c.id+'\')" ondragend="shkDragEnd(event)" onclick="shkFix(\''+c.id+'\',\''+x.iso+'\',\''+slot+'\')" title="'+fmtMD(x.iso)+' '+(slot==='am'?'午前':'午後')+'で決定"></div></div>';
            }).join('');
          }).join('')+'</div>';
    });
    if(!ganttCars.length) h+='<div class="shk-row"><div class="shk-gut gcar"><span class="shk-empty">対象車なし</span></div>'+days.map(function(x){ return x.off?'<div class="shk-off2"></div>':'<div class="shk-gsc"></div><div class="shk-gsc pm"></div>'; }).join('')+'</div>';
    h+='</div></div>';
    host.innerHTML=h;
  }

  // ===== ドラッグ =====
  var _drag=null;
  window.shkDragStart=function(e,id){ _drag=id; try{ e.dataTransfer.setData('text',id); e.dataTransfer.effectAllowed='move'; }catch(_){}; if(e.target&&e.target.classList) e.target.classList.add('dragging'); };
  window.shkDragEnd=function(e){ if(e.target&&e.target.classList) e.target.classList.remove('dragging'); };
  window.shkOver=function(e){ e.preventDefault(); e.currentTarget.classList.add('drop'); };
  window.shkLeave=function(e){ e.currentTarget.classList.remove('drop'); };
  window.shkDrop=function(e,iso,slot){ e.preventDefault(); e.currentTarget.classList.remove('drop'); var id=(e.dataTransfer&&e.dataTransfer.getData('text'))||_drag; _drag=null; assign(id,iso,slot); };
  window.shkFix=function(id,iso,slot){ assign(id,iso,slot); };
  function assign(id,iso,slot){ var c=card(id); if(!c) return; var s=ins(c); s.decided=iso; s.decidedSlot=(slot==='pm'?'pm':'am'); s.result=''; s.resultDate=''; s.resultSlot=''; save(); renderShaken(); }

  // ===== 範囲ドラッグで「行ける枠」を塗る（空セル→予定） =====
  var _paint=null;
  window.shkPaintStart=function(e,carId,idx){ if(e.button!==0) return; e.preventDefault(); _paint={car:carId,a:idx,b:idx}; paintHi(); };
  window.shkPaintMove=function(carId,idx){ if(!_paint||_paint.car!==carId) return; _paint.b=idx; paintHi(); };
  function paintHi(){ if(!_paint) return; var lo=Math.min(_paint.a,_paint.b),hi=Math.max(_paint.a,_paint.b);
    var els=document.querySelectorAll('.shk-gsc.paintable[data-car="'+_paint.car+'"]');
    Array.prototype.forEach.call(els,function(el){ var i=+el.getAttribute('data-idx'); el.classList.toggle('paintsel', i>=lo&&i<=hi); }); }
  document.addEventListener('mouseup', function(){ if(!_paint) return; var p=_paint; _paint=null; paintCommit(p); });
  function paintCommit(p){ var c=card(p.car); if(!c) return; var s=ins(c); var subs=window._shkSubs||[];
    var lo=Math.min(p.a,p.b),hi=Math.max(p.a,p.b), any=false;
    for(var i=lo;i<=hi;i++){ var sub=subs[i]; if(!sub||sub.off) continue; if(!s.slots[sub.iso]) s.slots[sub.iso]=[]; if(s.slots[sub.iso].indexOf(sub.slot)<0){ s.slots[sub.iso].push(sub.slot); any=true; } }
    if(any) save(); renderShaken();
  }

  // 決定チップのメニュー
  window.shkChipMenu=function(id){
    var c=card(id); if(!c) return; var s=ins(c);
    var slName=s.decidedSlot==='pm'?'午後':'午前';
    var body='<div class="shk-pinfo">'+esc(surname(c))+'様 / '+esc(c.car||'')+(c.plate?' / '+esc(c.plate):'')+'</div>';
    if(s.result==='done'){
      body+='<div class="shk-pnote">完了：'+(s.resultDate?fmtMD(s.resultDate):'')+' '+slName+'</div><button class="shk-pbtn" onclick="shkAct(\''+id+'\',\'reopen\')">予定に戻す</button>';
    } else if(s.decided){
      body+='<div class="shk-pnote">予定決定：'+fmtMD(s.decided)+' '+slName+'</div>'
        + '<button class="shk-pbtn ok" onclick="shkAct(\''+id+'\',\'done\')">✓ 完了（受かった）</button>'
        + '<button class="shk-pbtn re" onclick="shkAct(\''+id+'\',\'recheck\')">↺ 再検（落ちた・候補へ戻す）</button>'
        + '<button class="shk-pbtn" onclick="shkAct(\''+id+'\',\'flip\')">'+(s.decidedSlot==='pm'?'午前':'午後')+'に変更</button>'
        + '<button class="shk-pbtn" onclick="shkAct(\''+id+'\',\'cancel\')">予定を取り消す</button>';
    } else {
      body+='<div class="shk-pnote">この車の再検記録です。</div><button class="shk-pbtn" onclick="shkClosePop()">閉じる</button>';
    }
    body+='<button class="shk-pbtn ghost" onclick="openDetail(\''+id+'\');shkClosePop()">カードを開く</button>';
    pop('車検の予定', body);
  };
  window.shkAct=function(id,act){ var c=card(id); if(!c) return; var s=ins(c);
    if(act==='done'){ s.result='done'; s.resultDate=s.decided||todayIso(); s.resultSlot=s.decidedSlot||'am'; }
    else if(act==='recheck'){ s.history.push({date:s.decided||todayIso(), slot:s.decidedSlot||'am', result:'recheck'}); s.decided=''; s.decidedSlot=''; s.result=''; s.resultDate=''; s.resultSlot=''; }
    else if(act==='cancel'){ s.decided=''; s.decidedSlot=''; s.result=''; s.resultDate=''; s.resultSlot=''; }
    else if(act==='reopen'){ s.result=''; s.resultDate=''; s.resultSlot=''; }
    else if(act==='flip'){ s.decidedSlot=(s.decidedSlot==='pm'?'am':'pm'); }
    save(); closePop(); renderShaken();
  };

  function pop(title, body){
    var back=document.getElementById('shk-pop');
    if(!back){ back=document.createElement('div'); back.id='shk-pop'; back.className='modal-backdrop'; back.addEventListener('click',function(e){ if(e.target.id==='shk-pop') closePop(); }); document.body.appendChild(back); }
    back.innerHTML='<div class="pdp-box shk-box"><div class="pdp-head"><span>'+title+'</span><button class="pdp-x" onclick="shkClosePop()">✕</button></div><div class="shk-popbody">'+body+'</div></div>';
    back.classList.add('show');
  }
  function closePop(){ var b=document.getElementById('shk-pop'); if(b) b.classList.remove('show'); }
  window.shkClosePop=closePop;
  window.renderShaken=renderShaken;
  window.shkShift=function(dir){ var t; if(dir===0){ t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7)); } else { t=new Date(window._shakenBase); t.setDate(t.getDate()+dir); } window._shakenBase=t; renderShaken(); };
})();
