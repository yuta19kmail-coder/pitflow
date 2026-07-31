/* ========================================
   phase-popup.js
   フェーズ移動時の入力ポップアップ（CarFlowの売約ポップアップ挙動を参照）。
   ・見積り中(estim) → 連絡中(contact)：見積金額を入力 → c.amountFinal
   ・連絡中(contact) → パーツ待ち(parts)＝受注完了：確定見積金額 + 客に伝えた返車予定日
       → c.amountFinal / c.returnDateFinal（returnDate 未設定なら同値も入れる）
   ・OKで移動を確定（呼び出し元の commit() を実行）、キャンセルで移動しない。
   既存の .modal-backdrop / .modal-box 流儀を流用。dnd.js / task.js から intercept。
   ======================================== */
(function(){
  'use strict';

  var pending = null;   // { card, from, to, commit, mode }
  var built = false;

  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function digits(s){ return String(s==null?'':s).replace(/[^\d]/g,'').replace(/^0+(?=\d)/,'').slice(0,9); }   /* 上限9桁＝¥999,999,999 */
  function comma(s){ var d=digits(s); return d ? Number(d).toLocaleString() : ''; }
  function todayISO(){ var d=new Date(); var p=function(n){return(n<10?'0':'')+n;}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  function addDaysISO(iso, n){ var d=iso?new Date(iso+'T00:00:00'):new Date(); d.setDate(d.getDate()+n); var p=function(x){return(x<10?'0':'')+x;}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  function yen(v){ return (v==null||v==='') ? '—' : ('¥'+Number(v).toLocaleString()); }

  function build(){
    if (built) return; built = true;
    var bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.id = 'pp-backdrop';
    bd.innerHTML =
      '<div class="modal-box pp-box">'
      + '<div class="modal-head"><div class="modal-title" id="pp-title">フェーズ移動</div>'
      + '<button class="modal-close" onclick="PitPhasePopup.close(false)"><i data-ic=close data-ics=16></i></button></div>'
      + '<div class="modal-body">'
      + '  <div class="pp-move" id="pp-move"></div>'
      + '  <div class="pp-field" id="pp-amt-field">'
      + '    <label class="pp-lb" id="pp-amt-lb">見積金額</label>'
      + '    <div class="pp-ref" id="pp-amt-ref"></div>'
      + '    <div class="pp-moneywrap"><span class="pp-yen">¥</span>'
      + '      <input class="pp-money" id="pp-amt" type="text" inputmode="numeric" placeholder="0" oninput="PitPhasePopup.onAmt(this)"></div>'
      + '  </div>'
      + '  <div class="pp-field" id="pp-ret-field" style="display:none">'
      + '    <label class="pp-lb">返車予定日</label>'
      + '    <input class="pp-date" id="pp-ret" type="date">'
      + '  </div>'
      + '  <div class="pp-field pp-sales" id="pp-sales-field" style="display:none"></div>'
      + '  <div class="pp-field" id="pp-partner-field" style="display:none">'
      + '    <label class="pp-lb">外注先</label>'
      + '    <select class="pp-date" id="pp-partner" onchange="PitPhasePopup.onPartner()"></select>'
      + '  </div>'
      + '  <div class="pp-field" id="pp-outnote-field" style="display:none">'
      + '    <label class="pp-lb">メモ（例：トヨタ〇〇店）</label>'
      + '    <input class="pp-date" id="pp-outnote" type="text" placeholder="店名など">'
      + '  </div>'
      + '  <div class="pp-field" id="pp-outdue-field" style="display:none">'
      + '    <label class="pp-lb">完了予定日（外注先との予定）</label>'
      + '    <input class="pp-date" id="pp-outdue" type="date">'
      + '  </div>'
      + '  <div class="pp-note" id="pp-note"></div>'
      + '  <div class="pp-actions">'
      + '    <button class="vh-btn" onclick="PitPhasePopup.close(false)">キャンセル</button>'
      + '    <button class="vh-btn primary" id="pp-ok" onclick="PitPhasePopup.close(true)">移動する</button>'
      + '  </div>'
      + '</div></div>';
    document.body.appendChild(bd);
    bd.addEventListener('click', function(e){ if (e.target.id==='pp-backdrop') PitPhasePopup.close(false); });
  }

  function statusName(s){ return (window.statusLabel ? statusLabel(s) : s); }

  function openModal(card, mode){
    build();
    var fromL = statusName(pending.from), toL = statusName(pending.to);
    el('pp-move').innerHTML = '<span class="pp-from">'+esc(fromL)+'</span><span class="pp-arrow">→</span><span class="pp-to">'+esc(toL)+'</span>'
      + '<span class="pp-who">'+esc((card.customer||'（未入力）')+' 様')+(card.car?' ／ '+esc(card.car):'')+'</span>';

    // 車販依頼フィールドは既定で隠す（order時のみ出す）
    var _sf = el('pp-sales-field'); if (_sf){ _sf.style.display = 'none'; _sf.innerHTML = ''; }

    // フィールドの出し分け
    var isOut = (mode === 'outsource');
    el('pp-amt-field').style.display = isOut ? 'none' : '';
    el('pp-partner-field').style.display = isOut ? '' : 'none';
    if (!isOut){ el('pp-outnote-field').style.display = 'none'; el('pp-outdue-field').style.display = 'none'; }

    if (isOut){
      // 外注先の選択
      var partners = (state.settings && state.settings.outsourcePartners) || [];
      var sel = el('pp-partner');
      sel.innerHTML = (partners.length ? partners : ['（設定で外注先を追加してください）'])
        .map(function(p){ return '<option value="'+esc(p)+'">'+esc(p)+'</option>'; }).join('');
      if (card.outsourceTo) sel.value = card.outsourceTo;
      el('pp-outnote').value = card.outsourceNote || '';
      el('pp-outdue').value = card.outsourceDue || addDaysISO(todayISO(), 5);
      el('pp-ret-field').style.display = 'none';
      el('pp-outdue-field').style.display = '';
      PitPhasePopup.onPartner();   // メモ欄の出し分け
      el('pp-title').textContent = '外注へ';
      el('pp-note').textContent = '外注先と、外注先との完了予定日を入れてください。外注先は設定で増減できます。';
      el('pp-ok').textContent = '外注へ移動';
      el('pp-backdrop').classList.add('show');
      return;
    }

    // 金額プレフィル＝直前段の金額を引き継ぐ（見積=quote→est／受注=order→quote→est／確定=final→order→quote→est）
    var firstOf = function(){ for (var i=0;i<arguments.length;i++){ var v=arguments[i]; if (v!=null && v!=='') return v; } return ''; };
    var amtPrefill = (mode==='estimate') ? firstOf(card.amountQuote, card.estAmount)
                   : (mode==='order')    ? firstOf(card.amountOrder, card.amountQuote, card.estAmount)
                                         : firstOf(card.amountFinal, card.amountOrder, card.amountQuote, card.estAmount);
    el('pp-amt').value = (amtPrefill!=='' && amtPrefill!=null) ? Number(amtPrefill).toLocaleString() : '';
    el('pp-amt-ref').innerHTML = (mode==='estimate') ? '概算 '+yen(card.estAmount)
                                : (mode==='order')    ? '概算 '+yen(card.estAmount)+'　見積 '+yen(card.amountQuote)
                                                      : '見積 '+yen(card.amountQuote)+'　受注 '+yen(card.amountOrder);

    if (mode === 'estimate'){
      el('pp-title').textContent = '見積金額の入力';
      el('pp-amt-lb').textContent = '見積金額';
      el('pp-ret-field').style.display = 'none';
      el('pp-note').textContent = 'お客様に伝える見積金額です。空のままでも進めます（あとから変更可）。';
      el('pp-ok').textContent = '連絡中へ';
    } else if (mode === 'order'){
      el('pp-title').textContent = '受注完了';
      el('pp-amt-lb').textContent = '確定見積金額';
      el('pp-ret-field').style.display = '';
      var retPrefill = card.returnDateFinal || card.returnDate || addDaysISO(todayISO(), 7);
      el('pp-ret').value = retPrefill;
      el('pp-note').textContent = '確定見積と、お客様に伝えた返車予定日を入れてください。';
      el('pp-ok').textContent = 'パーツ待ちへ';
      // 受注時に車販部門への依頼トリガーを設定（返車予定日の下）
      var _ids = (Array.isArray(card.workTypes) && card.workTypes.length) ? card.workTypes : (card.workType ? [card.workType] : []);
      var _isShaken = (card.workType === 'shaken' || _ids.indexOf('shaken') >= 0);
      var _hasCoat = (_ids.indexOf('coat1y') >= 0 || _ids.indexOf('coat3m') >= 0);
      var _sh = '<div class="pp-saleshd"><i data-ic=cart data-ics=16></i> 車販部門への依頼</div>';
      if (_isShaken) _sh += '<label class="pp-check"><input type="checkbox" id="pp-headlight"' + (card.headlight ? ' checked' : '') + '> <i data-ic=search data-ics=16></i> 車検ヘッドライト磨き</label>';
      if (_hasCoat)  _sh += '<label class="pp-check"><input type="checkbox" id="pp-coatingok"' + (card.coatingOK ? ' checked' : '') + '> <i data-ic=sparkle data-ics=16></i> コーティング受注OK</label>';
      _sh += '<label class="pp-check"><input type="checkbox" id="pp-salesreq"' + (card.salesReq ? ' checked' : '') + '> <i data-ic=cart data-ics=16></i> その他 車販依頼</label>';
      _sh += '<input class="pp-salesmemo" id="pp-salesmemo" type="text" placeholder="依頼メモ（1行・任意）" value="' + esc(card.salesReqMemo || '') + '">';
      if (_sf){ _sf.innerHTML = _sh; _sf.style.display = ''; }
    } else { // final（作業完了）
      el('pp-title').textContent = '作業完了 — 確定金額';
      el('pp-amt-lb').textContent = '確定金額（請求額）';
      el('pp-ret-field').style.display = 'none';
      el('pp-note').textContent = '作業完了です。お客様への確定金額（請求額）を入れてください。空でも進めます。';
      el('pp-ok').textContent = '作業完了へ';
    }
    el('pp-backdrop').classList.add('show');
    setTimeout(function(){ try{ el('pp-amt').focus(); }catch(e){} }, 30);
  }

  window.PitPhasePopup = {
    /* 移動を横取りすべきか判定。横取りしたら true（呼び出し元は return）。 */
    maybeIntercept: function(card, from, to, commit){
      var mode = null;
      if (from === 'estim'   && to === 'contact') mode = 'estimate';
      else if (from === 'contact' && to === 'parts') mode = 'order';
      // 作業完了(workDone)への移動は確定金額プロンプトを出さず単純移動（v0.99.34）。確定金額は完TELポップアップで入れる。
      else if (to === 'outsource') mode = 'outsource';
      if (!mode) return false;
      pending = { card: card, from: from, to: to, commit: commit, mode: mode };
      openModal(card, mode);
      return true;
    },
    onAmt: function(input){
      var c = comma(input.value);
      input.value = c;
    },
    onPartner: function(){
      var sel = el('pp-partner'); if (!sel) return;
      var need = (sel.value === '各ディーラー' || sel.value === 'その他');
      var f = el('pp-outnote-field'); if (f) f.style.display = need ? '' : 'none';
    },
    close: function(ok){
      var bd = el('pp-backdrop');
      if (bd) bd.classList.remove('show');
      var p = pending; pending = null;
      if (!p) return;
      if (!ok){ if (window.showToast) showToast('移動をキャンセルしました'); return; }
      var card = p.card;
      if (p.mode === 'outsource'){
        var sel = el('pp-partner');
        if (sel && sel.value && sel.value.indexOf('（') !== 0) card.outsourceTo = sel.value;
        var need = (card.outsourceTo === '各ディーラー' || card.outsourceTo === 'その他');
        card.outsourceNote = need ? ((el('pp-outnote') && el('pp-outnote').value.trim()) || '') : '';
        var due = el('pp-outdue') ? el('pp-outdue').value : '';
        if (due) card.outsourceDue = due;
      } else {
        // 金額（空なら据え置き）。見積 → amountQuote／受注 → amountOrder／確定 → amountFinal
        var amt = digits(el('pp-amt') ? el('pp-amt').value : '');
        if (amt !== ''){
          if (p.mode === 'estimate') card.amountQuote = Number(amt);
          else if (p.mode === 'order') card.amountOrder = Number(amt);
          else card.amountFinal = Number(amt);
        }
        // 返車予定日（order時のみ）＋車販依頼トリガー
        if (p.mode === 'order'){
          var r = el('pp-ret') ? el('pp-ret').value : '';
          if (r){ card.returnDateFinal = r; if (!card.returnDate) card.returnDate = r; }
          var _hl = el('pp-headlight'); if (_hl) card.headlight = _hl.checked;
          var _co = el('pp-coatingok'); if (_co) card.coatingOK = _co.checked;
          var _sr = el('pp-salesreq');  if (_sr) card.salesReq  = _sr.checked;
          var _sm = el('pp-salesmemo'); if (_sm) card.salesReqMemo = _sm.value.trim();
        }
      }
      try { p.commit(); } catch(e){ if (window.console) console.error(e); }
    }
  };
})();
