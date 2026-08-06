/* ========================================
   return-popup.js
   作業完了後 → 返車へ進めるポップアップ（PitReturnPopup）。
   2モード：
     ・callDone（完TEL済）：確定金額／返車予定日／返車時間／洗車(要不要+備考)／お礼LINE不要
        → c.returnStage='returnWait'（返車日があれば返車カレンダーへ・無ければ返車未定へ）
     ・callReq （完TEL依頼）：確定金額／洗車(要不要+備考)／お礼LINE不要
        → c.returnStage='callWait'（返車ビュー未定「完TEL待ち」へ）
   どちらも：タスクボードから外れ（returnStage がつくと盤面の filter で除外）、
            PIT枠(bayId)も外す。入力内容は予約詳細(表紙)と同じ項目に保存され相互反映。
   タスクボードのドラッグエリア(dnd.js)と、返車ビュー「完TEL待ち」カードのクリックから開く。
   ======================================== */
(function(){
  'use strict';

  var pending = null;   // { card, mode }
  var built = false;

  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function digits(s){ return String(s==null?'':s).replace(/[^\d]/g,'').replace(/^0+(?=\d)/,'').slice(0,9); }
  function comma(s){ var d=digits(s); return d ? Number(d).toLocaleString() : ''; }
  function todayISO(){ var d=new Date(); var p=function(n){return(n<10?'0':'')+n;}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }

  function build(){
    if (built) return; built = true;
    var bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.id = 'rp-backdrop';
    bd.innerHTML =
      '<div class="modal-box pp-box rp-box">'
      + '<div class="modal-head"><div class="modal-title" id="rp-title">返車へ</div>'
      + '<button class="modal-close" onclick="PitReturnPopup.close(false)"><i data-ic=close data-ics=16></i></button></div>'
      + '<div class="modal-body">'
      + '  <div class="pp-move" id="rp-move"></div>'
      + '  <div class="pp-field">'
      + '    <label class="pp-lb">確定金額（請求額）</label>'
      + '    <div class="pp-moneywrap"><span class="pp-yen">¥</span>'
      + '      <input class="pp-money" id="rp-amt" type="text" inputmode="numeric" placeholder="0" oninput="PitReturnPopup.onAmt(this)"></div>'
      + '  </div>'
      + '  <div class="pp-field" id="rp-date-field">'
      + '    <label class="pp-lb">返車予定日</label>'
      + '    <input class="pp-date" id="rp-date" type="date">'
      + '    <div class="pp-ref">空のままにすると「返車未定」に入ります（あとで日付を入れられます）。</div>'
      + '  </div>'
      + '  <div class="pp-field" id="rp-time-field">'
      + '    <label class="pp-lb">返車時間</label>'
      + '    <input class="rp-time" id="rp-time" type="text" autocomplete="off" placeholder="900 / 9時半 / 9:00-10:00 など" onblur="PitReturnPopup.onTime(this)">'
      + '  </div>'
      + '  <div class="pp-field">'
      + '    <label class="pp-lb">洗車</label>'
      + '    <div class="rp-chips"><button type="button" class="rp-chip" id="rp-wash-1" onclick="PitReturnPopup.onWash(\'1\')">要</button>'
      + '      <button type="button" class="rp-chip" id="rp-wash-0" onclick="PitReturnPopup.onWash(\'0\')">不要</button></div>'
      + '    <input class="rp-text" id="rp-washnote" type="text" placeholder="洗車の備考（1行・任意）" style="margin-top:6px">'
      + '  </div>'
      + '  <div class="pp-field">'
      + '    <label class="pp-lb">お礼LINE</label>'
      + '    <div class="rp-chips"><button type="button" class="rp-chip" id="rp-line-1" onclick="PitReturnPopup.onLine(\'1\')">要</button>'
      + '      <button type="button" class="rp-chip" id="rp-line-0" onclick="PitReturnPopup.onLine(\'0\')">不要</button></div>'
      + '  </div>'
      + '  <div class="pp-actions">'
      + '    <button class="vh-btn" onclick="PitReturnPopup.close(false)">キャンセル</button>'
      + '    <button class="vh-btn primary" id="rp-ok" onclick="PitReturnPopup.close(true)">返車へ</button>'
      + '  </div>'
      + '</div></div>';
    document.body.appendChild(bd);
    bd.addEventListener('click', function(e){ if (e.target.id==='rp-backdrop') PitReturnPopup.close(false); });
  }

  function setWash(on){   // 洗車備考は要/不要にかかわらず常時表示
    var a = el('rp-wash-1'), b = el('rp-wash-0');
    if (a) a.classList.toggle('on', !!on);
    if (b) b.classList.toggle('on', !on);
  }
  function setLine(on){   // on=お礼LINE「要」
    var a = el('rp-line-1'), b = el('rp-line-0');
    if (a) a.classList.toggle('on', !!on);
    if (b) b.classList.toggle('on', !on);
  }

  function openModal(card, mode){
    build();
    var isDone = (mode === 'callDone');
    el('rp-title').textContent = isDone ? '完TEL済 → 返車予定へ': '完TEL依頼（先に金額だけ）';
    el('rp-ok').textContent = isDone ? '返車予定に入れる' : '完TEL待ちへ';
    el('rp-move').innerHTML = '<span class="pp-to">'+esc((card.customer||'（未入力）')+' 様')+'</span>'
      + (card.car ? '<span class="pp-who">'+esc(card.car)+'</span>' : '');

    // 金額プレフィル＝確定→受注→見積→概算
    var amt = [card.amountFinal, card.amountOrder, card.amountQuote, card.estAmount].find(function(v){ return v!=null && v!==''; });
    el('rp-amt').value = (amt!=null && amt!=='') ? Number(amt).toLocaleString() : '';

    // 日付・時間（完TEL済のみ）
    el('rp-date-field').style.display = isDone ? '' : 'none';
    el('rp-time-field').style.display = isDone ? '' : 'none';
    if (isDone){
      el('rp-date').value = '';   // 返車予定日はデフォルト空（その場で決めて入れる）
      el('rp-time').value = card.returnTime || '';
    }

    // 洗車＝デフォ要／お礼LINE＝デフォ要（初回＝盤面からのドラッグ時は必ず要。再編集時は保存値を尊重）
    setWash(card.returnStage ? (card.needWash !== false) : true);
    el('rp-washnote').value = card.washNote || '';
    setLine(card.returnStage ? !card.noThanksLine : true);

    el('rp-backdrop').classList.add('show');
    setTimeout(function(){ try{ el('rp-amt').focus(); }catch(e){} }, 30);
  }

  window.PitReturnPopup = {
    open: function(cardOrId, mode){
      var card = (typeof cardOrId === 'string')
        ? (window.state && state.cards || []).find(function(x){ return x.id === cardOrId; })
        : cardOrId;
      if (!card) return;
      pending = { card: card, mode: mode || 'callDone' };
      openModal(card, pending.mode);
    },
    onAmt: function(input){ input.value = comma(input.value); },
    onTime: function(input){ if (window._normTime) input.value = _normTime(input.value); },
    onWash: function(v){ setWash(v === '1'); },
    onLine: function(v){ setLine(v === '1'); },
    close: function(ok){
      var p = pending;
      if (!ok){
        hide(); pending = null;
        if (p && window.pitToast) pitToast('やめました');
        return;
      }
      if (!p){ hide(); return; }

      /* ===================================================================
         🔴 v1.57.0（ゆうた指定）**完TEL済で、返車予定日が過去だったら1回聞く。**
         -------------------------------------------------------------------
         ◎なぜ
           もう渡し終わった車を、あとから記録することがある。そのまま入れると
           **過ぎた日の返車カレンダーに置かれて、誰も見に行かない**。
         ◎聞いた結果
           ・「実績に登録する」… **返車カレンダーを通さず、その日付でそのまま実績へ**（返車済み扱い）
           ・「日付を直す」　… ポップアップは閉じずに、日付欄へ戻す
         ⚠ **今日は過去ではない。今日より前**だけが対象。
         ⚠ 「完TEL依頼」には日付の欄が無いので、こちらは今までどおり（ゆうた確認済み）。
         =================================================================== */
      if (p.mode === 'callDone'){
        var dChk = el('rp-date') ? el('rp-date').value : '';
        if (dChk && dChk < todayISO()){
          var msg = '過去の日付です。このまま実績に登録しますか？';
          var det = '返車予定日が ' + dChk + '（今日より前）になっています。'
                  + '「実績に登録する」を選ぶと、返車カレンダーには置かず、その日付でそのまま実績（売上）に入れます。';
          var ask = (window.UI && UI.confirm)
            ? UI.confirm(msg, { title: '過去の日付です', detail: det, ok: '実績に登録する', cancel: '日付を直す' })
            : Promise.resolve(window.confirm(msg + '\n\n' + det));
          ask.then(function (yes){
            if (!yes){ try { el('rp-date').focus(); } catch (e) {} return; }   /* 開けたまま直してもらう */
            hide(); pending = null; apply(p, true);
          });
          return;
        }
      }
      hide(); pending = null; apply(p, false);
    }
  };

  function hide(){ var bd = el('rp-backdrop'); if (bd) bd.classList.remove('show'); }

  /* 入力された内容をカードに書き込む。
     toResult=true ＝ 返車カレンダーを通さず、その日付でそのまま実績に入れる（v1.57.0） */
  function apply(p, toResult){
      var c = p.card;
      var isDone = (p.mode === 'callDone');

      // 確定金額
      var amt = digits(el('rp-amt') ? el('rp-amt').value : '');
      if (amt !== '') c.amountFinal = Number(amt);
      // 洗車（要/不要）＋備考（不要でも備考は保存）
      c.needWash = !!(el('rp-wash-1') && el('rp-wash-1').classList.contains('on'));
      c.washNote = (el('rp-washnote') && el('rp-washnote').value.trim()) || '';
      // お礼LINE（要/不要）。要=on → noThanksLine=false
      c.noThanksLine = !(el('rp-line-1') && el('rp-line-1').classList.contains('on'));

      // 作業は完了扱いに（盤面からは returnStage で外れる）。PIT枠も外す。
      c.status = 'workDone';
      c.testDrive = false;
      c.bayId = null; c.baySlot = null;
      c.returnTbd = false;   // 旧フラグは使わない（returnStage に一本化）

      if (isDone){
        var d = el('rp-date') ? el('rp-date').value : '';
        var t = window._normTime ? _normTime(el('rp-time') ? el('rp-time').value : '') : (el('rp-time') ? el('rp-time').value : '');
        c.returnDate = d || '';
        c.returnDateFinal = d || c.returnDateFinal || null;
        c.returnTime = t || '';
        c.returnStage = 'returnWait';
        c.completeCallAt = c.completeCallAt || todayISO();
        if (c.coverCall && typeof c.coverCall === 'object'){ c.coverCall.done = true; if(!c.coverCall.at){ var dd=new Date(); c.coverCall.at=(dd.getMonth()+1)+'/'+dd.getDate(); } }

        if (toResult && d){
          /* 🔴 v1.57.0 過去の日付＋ゆうたOK＝**返車カレンダーを通さず、その日で実績に入れる**。
             ⚠ 当日ビューの「返車済みにする」（today.js の pitTodayReturn）と**同じ形に揃える**こと。
                揃っていないと、実績ビュー・売上・来店履歴のどれかで見え方が食い違う。
                　status='returned' ／ completedAt＝実績に乗る日 ／ amountFinal＝売上を固める */
          c.status = 'returned';
          c.completedAt = d;
          if (c.amountFinal == null || c.amountFinal === ''){
            c.amountFinal = (window.pitEstAmount ? (c.estAmount || pitEstAmount(c.workType)) : (c.estAmount || 0));
          }
          if (window.logFlow) logFlow(c, '完TEL済 → 過去の日付なので、そのまま実績へ（' + d + '）');
          if (window.pitLog) pitLog('過去の日付で実績に登録', { cardId: c.id, kind: 'out',
            label: ((window.pitCustName?pitCustName(c):c.customer) || '') + ' 様' + (c.car ? ' / ' + c.car : '')
                 + ' / 実績日 ' + d + (c.amountFinal ? ' / ¥' + Number(c.amountFinal).toLocaleString() : '') });
        } else {
          if (window.logFlow) logFlow(c, d ? ('完TEL済 → 返車予定 '+d) : '完TEL済 → 返車未定');
        }
      } else {
        c.returnStage = 'callWait';
        if (window.logFlow) logFlow(c, '完TEL依頼（金額入力・完TEL待ちへ）');
      }

      if (window.PitDB) PitDB.save();
      if (state.currentView) showView(state.currentView);
      if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
      if (window.pitToast){
        pitToast(!isDone ? '完TEL待ちに入れました'
               : (c.status === 'returned' ? ('実績に登録しました（' + c.completedAt + '）')
               : (c.returnDate ? '返車予定に入れました' : '返車未定に入れました')));
      }
  }
})();
