/* ========================================
   card-hover.js
   タスクボードのコンパクトカード（.pit-card.pcm）をホバーすると、
   カードの右側に「情報カード」を固定表示する（バッジ位置に関係なく常に同じ場所）。
   ・基本：予約番号／客名様／カナ／メーカー車種／ナンバー／国産輸入／課／担当（省略なし）
   ・経過日数3つ：①預かり何日目 ②このフェーズ何日目（c.phaseAt 起点）③代車リミット（既存）
   既存ヘルパー流用：statusLabel / fmtMD / daysFromToday / loanerRem / loanerLevel。
   ======================================== */
(function(){
  'use strict';

  var DRIVE_LABELS = { leftHand:'左ハンドル', mt:'M/T', lowCar:'車高低い', noShoes:'土足禁止' };
  var el = null, curId = null;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }

  /* 今のフェーズに入った時刻(ms)。phaseAt 優先→ログの最後のフェーズ移動→入庫日 の順でフォールバック */
  function phaseStartMs(c){
    if (c.phaseAt) return c.phaseAt;
    var log = c.log || [];
    for (var i=log.length-1; i>=0; i--){
      if (log[i] && log[i].type==='phase' && log[i].to===c.status && log[i].at) return log[i].at;
    }
    if (c.reserveDate){ var d=new Date(c.reserveDate+'T00:00:00'); if(!isNaN(d)) return d.getTime(); }
    return null;
  }
  function daysSinceMs(ms){
    if (ms==null) return null;
    var t=new Date(); t.setHours(0,0,0,0);
    var d=new Date(ms); d.setHours(0,0,0,0);
    return Math.round((t - d)/86400000);
  }

  function ensureEl(){
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pit-hovercard';
    document.body.appendChild(el);
    return el;
  }

  function fill(c){
    var team = (c.boardId==='import') ? 'y' : 'k';
    var teamLabel = (team==='y') ? '輸入車' : '国産車';
    var ku = (c.division==='div2') ? '2課' : (c.division==='div1' ? '1課' : (c.boardId==='import' ? '2課' : '1課'));
    var staff = c.frontStaff || c.staff || '';
    var carTxt = (c.maker ? esc(c.maker)+' ' : '') + esc(c.car||'（車種未入力）');

    var h = '';
    h += '<div class="ph-head">';
    if (c.resNo) h += '<span class="ph-resno">'+esc(c.resNo)+'</span>';
    h += '<span class="ph-pill ph-team '+team+'">'+teamLabel+'</span>';
    h += '<span class="ph-pill ph-div">'+ku+'</span>';
    if (staff) h += '<span class="ph-staffwrap"><span class="ph-stafflb">担当</span><span class="ph-staff">'+esc(staff)+'</span></span>';
    h += '</div>';
    h += '<div class="ph-name">'+esc(c.customer||'（未入力）')+' <small>様</small></div>';
    if (c.kana) h += '<div class="ph-kana">'+esc(c.kana)+'</div>';
    h += '<div class="ph-car">'+carTxt+'</div>';
    if (c.plate || (c.karteNo||'').trim()) h += '<div class="ph-plate-row">'+(c.plate?'<span class="ph-plate">'+esc(c.plate)+'</span>':'')+((c.karteNo||'').trim()?'<span class="ph-karte">'+esc(c.karteNo.trim())+'</span>':'')+'</div>';

    // ===== 経過日数（預かり後）。ただし予約（入庫前）は予約日だけ =====
    var _resv = (c.status === 'reserved');
    h += '<div class="ph-stats' + (_resv ? (c.needLoaner ? ' ph-stats-2' : ' ph-stats-1') : '') + '">';

    if (_resv){
      // 予約専用：まだ入庫前なので 預かり/フェーズ/代車リミット は出さない。予約日と予約まで(から)の日数だけ。
      var rd = c.reserveDate;
      var rmd = (rd && window.fmtMD) ? fmtMD(rd) : (rd || '未定');
      var rn = (rd && window.daysFromToday) ? daysFromToday(rd) : null;
      var rsub = (rn==null) ? '日付未定' : (rn>0 ? ('あと'+rn+'日') : (rn===0 ? '今日' : (Math.abs(rn)+'日前')));
      h += '<div class="ph-stat s-resv"><div class="ph-stat-lb">予約</div>'
         + '<div class="ph-stat-num">'+esc(rmd)+'</div>'
         + '<div class="ph-stat-sub">'+rsub+'</div></div>';
      if (c.needLoaner){
        // 代車あり＝2分割：何の代車(名)を何日〜か（リミット＝残日数は入庫後の話なので出さない）
        var _lo = (window.state && Array.isArray(state.loaners)) ? state.loaners.find(function(x){ return x.id === c.loanerId; }) : null;
        // 車種名をメイン・代車番号は小さく添える（連番）＋期間
        var _loMain = (_lo && _lo.model) ? _lo.model : (_lo ? _lo.name : (c.loanerId || '代車'));
        var _loNo = _lo ? (_lo.name || '') : '';
        var _loSub = (_loNo ? _loNo + '　' : '') + (c.loanerFrom && window.fmtMD ? (fmtMD(c.loanerFrom) + '〜') : '期間未定');
        h += '<div class="ph-stat s-resv-loaner"><div class="ph-stat-lb">代車</div>'
           + '<div class="ph-stat-num" style="font-size:14px">'+esc(_loMain)+'</div>'
           + '<div class="ph-stat-sub">'+esc(_loSub)+'</div></div>';
      }
    } else {

    // ① 預かり
    var holdN = (function(){ var n = window.daysFromToday ? daysFromToday(c.reserveDate) : null; return (n==null)?null:(1-n); })();
    h += '<div class="ph-stat s-hold"><div class="ph-stat-lb">預かり</div>'
       + '<div class="ph-stat-num">'+(holdN!=null?holdN:'—')+'<span class="u">日目</span></div>'
       + '<div class="ph-stat-sub">'+(c.reserveDate&&window.fmtMD?(fmtMD(c.reserveDate)+'〜'):'未定')+'</div></div>';

    // ② このフェーズ（外注の時は「完了予定 〇/〇 ・ 〇日目」）
    var pms = phaseStartMs(c);
    var phaseN = (function(){ var n=daysSinceMs(pms); return (n==null)?null:(n+1); })();
    if (c.status === 'outsource'){
      var dueTxt = c.outsourceDue ? (function(){ var p=String(c.outsourceDue).split('-'); return (+p[1])+'/'+(+p[2]); })() : '未定';
      h += '<div class="ph-stat s-phase"><div class="ph-stat-lb">外注作業</div>'
         + '<div class="ph-stat-num">'+(phaseN!=null?phaseN:'—')+'<span class="u">日目</span></div>'
         + '<div class="ph-stat-sub">〜'+esc(dueTxt)+'</div></div>';
    } else {
      var phaseLb = window.statusLabel ? statusLabel(c.status) : (c.status||'');
      var phaseSub = pms!=null ? (function(){ var d=new Date(pms); return (d.getMonth()+1)+'/'+d.getDate()+'〜'; })() : '—';
      h += '<div class="ph-stat s-phase"><div class="ph-stat-lb">このフェーズ<br>（'+esc(phaseLb)+'）</div>'
         + '<div class="ph-stat-num">'+(phaseN!=null?phaseN:'—')+'<span class="u">日目</span></div>'
         + '<div class="ph-stat-sub">'+phaseSub+'</div></div>';
    }

    // ③ 代車リミット
    if (!c.needLoaner){
      h += '<div class="ph-stat s-loaner lv-none"><div class="ph-stat-lb">代車</div>'
         + '<div class="ph-stat-num">なし</div><div class="ph-stat-sub">&nbsp;</div></div>';
    } else {
      var rem = window.loanerRem ? loanerRem(c) : null;
      var lv  = window.loanerLevel ? loanerLevel(rem).key : 'amber';
      var due = c.loanerTo || c.returnDateFinal || c.returnDate || '';
      var dueTxt = due && window.fmtMD ? ('〜'+fmtMD(due)) : '期限未設定';
      var numHtml, pct;
      if (rem==null){ numHtml='返却日<br>未定'; pct=0; }
      else if (rem<0){ numHtml=Math.abs(rem)+'<span class="u">日超過</span>'; pct=100; }
      else { numHtml='あと'+rem+'<span class="u">日</span>'; pct=Math.max(6,Math.min(100,Math.round(rem/7*100))); }
      h += '<div class="ph-stat s-loaner lv-'+lv+'"><div class="ph-stat-lb">代車リミット</div>'
         + '<div class="ph-stat-num">'+numHtml+'</div><div class="ph-stat-sub">'+esc(dueTxt)+'</div>'
         + '<div class="ph-meter"><i style="width:'+pct+'%"></i></div></div>';
    }
    }
    h += '</div>'; // .ph-stats

    // ===== 注意（外注先・車両注意など） =====
    if (c.status === 'outsource'){
      h += '<div class="ph-note">🤝 外注先：'+esc(c.outsourceTo||'未定')+(c.outsourceNote?'（'+esc(c.outsourceNote)+'）':'')+'</div>';
    }
    var dr = Array.isArray(c.drive) ? c.drive : [];
    if (dr.length){
      h += '<div class="ph-note">⚠️ 車両注意：'+dr.map(function(k){return DRIVE_LABELS[k]||k;}).join('・')+'</div>';
    }

    ensureEl().innerHTML = h;
  }

  function position(cardEl){
    var ic = ensureEl();
    var r = cardEl.getBoundingClientRect();
    var w = 300, gap = 10;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var left = r.right + gap;
    if (left + w > vw - 8){            // 右にはみ出す→カードの左へ
      left = r.left - w - gap;
      if (left < 8) left = 8;
    }
    ic.style.left = left + 'px';
    ic.style.top  = r.top + 'px';
    var hh = ic.offsetHeight;
    var top = r.top;
    if (top + hh > vh - 8){            // 下にはみ出す→持ち上げ
      top = vh - hh - 8;
      if (top < 58) top = 58;
    }
    ic.style.top = top + 'px';
  }

  function show(cardEl){
    var id = cardEl.dataset.cardId;
    if (!id || !window.state) return;
    var c = state.cards.find(function(x){ return x.id===id; });
    if (!c) return;
    curId = id;
    fill(c);
    ensureEl().classList.add('show');
    position(cardEl);
  }
  function hide(){ curId=null; if (el) el.classList.remove('show'); }

  // 出す対象：タスクボードのコンパクト（.pit-card.pcm）／PITリスト枠内（.pfv-card）／
  //   予約・返車の 月リスト(.rml-ev)・2ヶ月チップ(.reserve-month-event)・週ミニ(.rwk-card)。
  //   予約(status:reserved)は fill() 側で「予約専用（予約日だけ）」表示になる。
  var HOVER_SEL = '.pit-card.pcm, .pfv-card, .rml-ev, .reserve-month-event, .rwk-card, .lo-badge';
  document.addEventListener('mouseover', function(e){
    var card = e.target.closest && e.target.closest(HOVER_SEL);
    if (!card){ return; }
    if (!card.dataset || !card.dataset.cardId) return;   // 拡大カード等 id無しは無視
    if (card.dataset.cardId === curId) return;   // 同じカード上の移動は無視
    show(card);
  });
  document.addEventListener('mouseout', function(e){
    var card = e.target.closest && e.target.closest(HOVER_SEL);
    if (!card) return;
    var to = e.relatedTarget;
    if (!to || !(to.closest && to.closest(HOVER_SEL))) hide();
  });
  // スクロール／ドラッグ中は隠す（位置ズレ防止）
  document.addEventListener('scroll', hide, true);
  document.addEventListener('dragstart', hide, true);
})();
