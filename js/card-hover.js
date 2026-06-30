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
  var overRegion = false;          // カード or パネルの上にカーソルがあるか
  var hideTimer = null, saveTimer = null;

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

    // パネル自体にカーソルが乗っている間は消さない（カード→パネルへ移動できる）
    el.addEventListener('mouseenter', function(){ overRegion = true; cancelHide(); });
    el.addEventListener('mouseleave', function(){ overRegion = false; scheduleHide(); });

    // 引継ぎメモ：その場で入力＝自動保存（入力中はデバウンス・フォーカスを外したら即保存）
    el.addEventListener('input', function(e){
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('ph-hoinput')) return;
      var id = t.getAttribute('data-cid') || curId;
      if (!id || !window.state) return;
      var c = state.cards.find(function(x){ return x.id === id; });
      if (!c) return;
      c.handoffMemo = t.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function(){ if (window.PitDB && PitDB.save) PitDB.save(); }, 600);
    });
    el.addEventListener('focusout', function(e){
      var t = e.target;
      if (t && t.classList && t.classList.contains('ph-hoinput')){
        clearTimeout(saveTimer);
        if (window.PitDB && PitDB.save) PitDB.save(true);   // 確定保存
      }
      if (!overRegion) scheduleHide();
    });

    // 📞 完TEL/返車 のその場編集（returnStage カード）
    el.addEventListener('input', function(e){
      var t = e.target; if (!t || !t.classList) return;
      var c = curCard(); if (!c) return;
      if (t.classList.contains('ph-rt-amt')){
        var d = String(t.value).replace(/[^\d]/g,'').replace(/^0+(?=\d)/,'').slice(0,9);
        t.value = d ? Number(d).toLocaleString() : '';
        c.amountFinal = d ? Number(d) : '';
        saveDebounced();
      } else if (t.classList.contains('ph-rt-washnote')){
        c.washNote = t.value; saveDebounced();
      }
    });
    el.addEventListener('change', function(e){
      var t = e.target; if (!t || !t.classList) return;
      var c = curCard(); if (!c) return;
      if (t.classList.contains('ph-rt-date')){
        c.returnDate = t.value || '';
        if (c.returnDate){ c.returnStage = 'returnWait'; c.returnDateFinal = c.returnDate; }
        saveNow(); rerenderReturn();
      } else if (t.classList.contains('ph-rt-time')){
        c.returnTime = (window._normTime ? _normTime(t.value) : t.value) || '';
        t.value = c.returnTime; saveNow();
      }
    });
    el.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('.ph-rt-wash, .ph-rt-line');
      if (!b) return;
      var c = curCard(); if (!c) return;
      if (b.classList.contains('ph-rt-wash')){
        var on = b.getAttribute('data-w') === '1'; c.needWash = on;
        el.querySelectorAll('.ph-rt-wash').forEach(function(x){ x.classList.toggle('on', (x.getAttribute('data-w')==='1') === on); });
      } else {
        var lon = b.getAttribute('data-l') === '1'; c.noThanksLine = !lon;
        el.querySelectorAll('.ph-rt-line').forEach(function(x){ x.classList.toggle('on', (x.getAttribute('data-l')==='1') === lon); });
      }
      saveNow();
    });
    return el;
  }
  function curCard(){ return (window.state && curId) ? state.cards.find(function(x){ return x.id === curId; }) : null; }
  function saveDebounced(){ clearTimeout(saveTimer); saveTimer = setTimeout(function(){ if (window.PitDB && PitDB.save) PitDB.save(); }, 600); }
  function saveNow(){ clearTimeout(saveTimer); if (window.PitDB && PitDB.save) PitDB.save(true); }
  function rerenderReturn(){ if (window.state && state.currentView === 'return' && window.renderReturn) renderReturn(); }
  function cancelHide(){ clearTimeout(hideTimer); }
  function scheduleHide(){
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function(){
      if (overRegion) return;                                  // まだカード/パネル上
      if (el && el.contains(document.activeElement)) return;   // 引継ぎメモ編集中は閉じない
      hide();
    }, 280);
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

    // ===== バッジ（該当するものだけ全部）：作業タイプ／受付／代車・洗車・相談・緊急・クレーム・試運転・ライト磨き・コーティング・車販依頼 =====
    (function(){
      var bd = [];
      if (c.tentative) bd.push('<span class="ph-b ph-b-kari" title="仮予約">仮</span>');   // 仮予約は先頭に〇仮（v0.100.5）
      var wids = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
      wids.forEach(function(id){
        var w = (window.state && state.workTypes || []).find(function(x){ return x.id === id; });
        if (w){
          var _cd = ((id==='coat1y'||id==='coat3m') && c.coatingDone) ? ' ph-done' : '';   // コーティング完了＝済スタンプ
          bd.push('<span class="ph-b'+_cd+'" style="background:'+w.color+'22;color:'+w.color+';border-color:'+w.color+'88">'+esc(w.label)+'</span>');
        }
      });
      if (c.dropType){
        bd.push(window.pitDropBadges
          ? pitDropBadges(c, function(o){ return '<span class="ph-b ph-b-drop" title="'+esc(o.desc||'')+'">'+esc(o.label)+'</span>'; })
          : (function(){ var dt=(state.dropTypes||[]).find(function(x){return x.id===c.dropType;}); return dt?'<span class="ph-b ph-b-drop">'+esc(dt.label)+'</span>':''; })());
      }
      if (c.needLoaner) bd.push('<span class="ph-b ph-b-loaner">代車</span>');
      if (c.needWash)   bd.push('<span class="ph-b ph-b-wash'+(c.washSalesDone?' ph-done':'')+'">洗車</span>');
      if (c.consult)    bd.push('<span class="ph-b ph-b-consult">相談</span>');
      if (c.urgent)     bd.push('<span class="ph-b ph-b-urg">緊急</span>');
      if (c.codeRed)    bd.push('<span class="ph-b ph-b-red">クレーム</span>');
      if (c.testDrive)  bd.push('<span class="ph-b ph-b-td">試運転</span>');
      if (c.headlight)  bd.push('<span class="ph-b ph-b-hl'+(c.headlightDone?' ph-done':'')+'">ライト磨き</span>');
      if (c.coatingOK)  bd.push('<span class="ph-b ph-b-coat">コーティング受注</span>');
      if (c.salesReq)   bd.push('<span class="ph-b ph-b-sales'+(c.salesReqDone?' ph-done':'')+'">車販依頼</span>');
      if (bd.length) h += '<div class="ph-badges">'+bd.join('')+'</div>';
    })();

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
    // ===== 下部メモ群（代車条件・予約内容・引継ぎ）＝区切り線つきで統一表示 =====
    // 代車の車種固定・条件メモ（あれば）
    if (c.needLoaner && (c.loanerFixed || (c.loanerOther||'').trim())){
      h += '<div class="ph-sec ph-sec-loaner"><div class="ph-sec-lb">🚙 代車条件</div>'
        + '<div class="ph-sec-body">'
        + (c.loanerFixed ? '<span class="ph-fix">固定</span>' : '')
        + ((c.loanerOther||'').trim() ? '<span class="ph-lmemo">'+esc(c.loanerOther)+'</span>' : '')
        + '</div></div>';
    }
    // 予約内容メモ（読み取り専用）
    var _resmemo = (c.menu || c.memo || '').trim();
    h += '<div class="ph-sec"><div class="ph-sec-lb">📝 予約内容メモ</div>'
       + '<div class="ph-sec-body ph-memo">'
       + (_resmemo ? esc(_resmemo).replace(/\n/g,'<br>') : '<span class="ph-empty">（なし）</span>')
       + '</div></div>';
    // 引継ぎメモ（その場で入力＝自動保存）。data-cid で保存先カードを固定。※位置は従来どおり（メモ群の最後）
    h += '<div class="ph-sec"><div class="ph-sec-lb">🔁 引継ぎメモ <small>（入庫後・ここに直接入力できます）</small></div>'
       + '<textarea class="ph-hoinput" data-cid="'+esc(c.id)+'" rows="2" placeholder="引継ぎ・伝達を入力（自動で保存されます）">'+esc(c.handoffMemo||'')+'</textarea>'
       + '</div>';

    // 完TEL / 返車の入力（returnStage カード＝完TEL待ち/返車待ちのみ）＝最下部。ここで直接編集できる。クリックは予約詳細へ。
    if (c.returnStage){
      var _amtStr = (c.amountFinal!=null && c.amountFinal!=='') ? Number(c.amountFinal).toLocaleString() : '';
      var _washOn = (c.needWash !== false);
      var _lineOn = !c.noThanksLine;
      h += '<div class="ph-sec ph-rt">';
      h += '<div class="ph-sec-lb">📞 完TEL / 返車 <small>（ここで入力できます）</small></div>';
      h += '<div class="ph-rt-row"><span class="ph-rt-k">確定金額</span><span class="ph-rt-in"><span class="ph-rt-yen">¥</span><input class="ph-rt-amt" inputmode="numeric" value="'+esc(_amtStr)+'"></span></div>';
      h += '<div class="ph-rt-row"><span class="ph-rt-k">返車予定日</span><span class="ph-rt-in"><input class="ph-rt-date" type="date" value="'+esc(c.returnDate||'')+'"></span></div>';
      h += '<div class="ph-rt-row"><span class="ph-rt-k">返車時間</span><span class="ph-rt-in"><input class="ph-rt-time" type="text" placeholder="900 / 9時半" value="'+esc(c.returnTime||'')+'"></span></div>';
      h += '<div class="ph-rt-row"><span class="ph-rt-k">洗車</span><span class="ph-rt-chips"><button type="button" class="ph-rt-wash'+(_washOn?' on':'')+'" data-w="1">要</button><button type="button" class="ph-rt-wash'+(!_washOn?' on':'')+'" data-w="0">不要</button></span></div>';
      h += '<input class="ph-rt-washnote" type="text" placeholder="洗車の備考（1行）" value="'+esc(c.washNote||'')+'">';
      h += '<div class="ph-rt-row"><span class="ph-rt-k">お礼LINE</span><span class="ph-rt-chips"><button type="button" class="ph-rt-line'+(_lineOn?' on':'')+'" data-l="1">要</button><button type="button" class="ph-rt-line'+(!_lineOn?' on':'')+'" data-l="0">不要</button></span></div>';
      h += '</div>';
    }

    // 🛒 車販依頼メモ（バッジは上のバッジ行に出るので、ここはメモ本文だけ末尾に）
    if (c.salesReq && (c.salesReqMemo||'').trim()){
      h += '<div class="ph-sec"><div class="ph-sec-lb">🛒 車販依頼メモ</div><div class="ph-sec-body ph-sales-line">' + esc(c.salesReqMemo) + '</div></div>';
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
  function hide(){ curId=null; overRegion=false; if (el) el.classList.remove('show'); }

  // 出す対象：タスクボードのコンパクト（.pit-card.pcm）／PITリスト枠内（.pfv-card）／
  //   予約・返車の 月リスト(.rml-ev)・2ヶ月チップ(.reserve-month-event)・週ミニ(.rwk-card)。
  //   予約(status:reserved)は fill() 側で「予約専用（予約日だけ）」表示になる。
  var HOVER_SEL = '.pit-card.pcm, .pfv-card, .rml-ev, .reserve-month-event, .rwk-card, .lo-badge';
  document.addEventListener('mouseover', function(e){
    var card = e.target.closest && e.target.closest(HOVER_SEL);
    if (!card){ return; }
    if (!card.dataset || !card.dataset.cardId) return;   // 拡大カード等 id無しは無視
    overRegion = true; cancelHide();
    if (card.dataset.cardId === curId) return;   // 同じカード上の移動は無視
    show(card);
  });
  document.addEventListener('mouseout', function(e){
    var card = e.target.closest && e.target.closest(HOVER_SEL);
    if (!card) return;
    var to = e.relatedTarget;
    // 別カードへ＝そちらでshow／パネルへ＝パネルのmouseenterがcancel。それ以外は猶予つきで閉じる
    if (to && to.closest && (to.closest(HOVER_SEL) || (el && el.contains(to)))) return;
    overRegion = false; scheduleHide();
  });
  // スクロール／ドラッグ中は隠す（位置ズレ防止）。ただしパネル内スクロール・引継ぎ編集中は維持
  document.addEventListener('scroll', function(e){
    if (el && (el.contains(e.target) || el.contains(document.activeElement))) return;
    hide();
  }, true);
  document.addEventListener('dragstart', hide, true);
})();
