/* ========================================
   dnd.js  -  カードのドラッグ＆ドロップ移動（PitFlow v0.2.0）
   ----------------------------------------
   ネイティブ HTML5 ドラッグ＆ドロップ（デスクトップ主体）。
   ・ドラッグできるカード：`.pit-card[data-card-id]`
   ・ドロップ先：`[data-drop][data-drop-val]`
       data-drop="status"      … タスク看板：工程(c.status)を変更
       data-drop="bay"         … 作業ビュー：PIT枠(c.bayId)を変更（空文字＝未割当）
       data-drop="reserveTime" … 予約・当日：入庫時刻(c.reserveTime)を変更
       data-drop="returnTime"  … 返車・当日：返車時刻(c.returnTime)を変更
   ・クリック（openDetail）はネイティブ仕様でドラッグと両立（ドラッグ中はclick不発）。
   ======================================== */
(function () {

  function applyCardDrop(cardId, kind, val) {
    const c = state.cards.find(x => x.id === cardId);
    if (!c) return;

    if (kind === 'status') {
      if (c.status === val) return;
      var _fromStatus = c.status;
      // 移動の本処理（ポップアップ確定後 or ポップアップ不要時に実行）
      var _commitStatus = function(){
        c.status = val;
        // 作業完了（workDone）にしたら、返車日が未定なら「返車・未定」へ自動で乗せる（完TEL待ち）
        if (val === 'workDone' && !c.returnDate) c.returnTbd = true;
        if (window.logPhaseMove) logPhaseMove(c, _fromStatus, val);
        else if (window.logFlow && typeof statusLabel === 'function') logFlow(c, statusLabel(val) + 'へ');
        if (window.PitDB) PitDB.save();
        if (state.currentView) showView(state.currentView);
        if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
      };
      // 見積中→連絡中／連絡中→パーツ待ち は入力ポップアップを挟む（確定で _commitStatus 実行）
      if (window.PitPhasePopup && PitPhasePopup.maybeIntercept(c, _fromStatus, val, _commitStatus)) return;
      _commitStatus();
      return;
    } else if (kind === 'bay') {
      const nv = val || null;
      if (c.bayId === nv) return;
      c.bayId = nv;
      c.baySlot = null;                       // 枠の空きエリアへ落とした＝末尾扱い
    } else if (kind === 'baycell') {
      const p = val.split('|');               // "bayId|スロット番号"
      reorderIntoBay(c, p[0], parseInt(p[1], 10));
    } else if (kind === 'reserveTime') {
      c.reserveTime = val;
      if (state.reserveDate) c.reserveDate = ymd(state.reserveDate);
    } else if (kind === 'returnTime') {
      c.returnTime = val;
      if (state.returnDate) c.returnDate = ymd(state.returnDate);
    } else if (kind === 'reserveDate') {        // 月カレンダー：日付だけ変更
      if (c.reserveDate === val) return;
      if (window.pitIntakeGuard && pitIntakeGuard(c, val, c.reserveDate) !== val) return;   // ×日は「それでも？」→やめたら動かさない
      c.reserveDate = val;
    } else if (kind === 'returnDate') {
      if (c.returnDate === val) return;
      c.returnDate = val;
    } else if (kind === 'reserveDateTime') {     // 週カレンダー：日付＋時刻
      const p = val.split('|');
      if (p[0] !== c.reserveDate && window.pitIntakeGuard && pitIntakeGuard(c, p[0], c.reserveDate) !== p[0]) return;
      c.reserveDate = p[0];
      if (p[1]) c.reserveTime = p[1];
    } else if (kind === 'returnDateTime') {
      const p = val.split('|');
      c.returnDate = p[0];
      if (p[1]) c.returnTime = p[1];
    } else {
      return;
    }

    if (window.PitDB) PitDB.save();
    if (state.currentView) showView(state.currentView);
    if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();  // PiP小窓も同期（2画面連携）
  }
  window.applyCardDrop = applyCardDrop;

  /* 同じPIT枠内の並べ替え／別枠からの差し込み。idx＝落としたスロット位置に入れて baySlot を振り直す */
  function reorderIntoBay(c, bid, idx) {
    if (!bid) return;
    const statuses = window.WORK_STATUSES || ['check', 'estim', 'contact', 'parts', 'work'];
    const list = state.cards
      .filter(function (x) { return x !== c && x.bayId === bid && statuses.indexOf(x.status) >= 0; })
      .sort(function (a, b) { return (a.baySlot == null ? 1e9 : a.baySlot) - (b.baySlot == null ? 1e9 : b.baySlot); });
    if (isNaN(idx) || idx < 0 || idx > list.length) idx = list.length;  // 空きスロット等は末尾へ
    c.bayId = bid;
    list.splice(idx, 0, c);
    list.forEach(function (x, i) { x.baySlot = i; });                   // 0,1,2… で確定
  }

  let draggingId = null;
  let draggingFromPip = false;   // PiP内のカードをドラッグ中か（PiP外へ落としたら枠から外す）

  document.addEventListener('dragstart', function (e) {
    const card = e.target.closest('[data-card-id][draggable="true"]');
    if (!card) return;
    draggingId = card.dataset.cardId;
    draggingFromPip = !!card.closest('#pitpip');
    card.classList.add('dnd-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', draggingId); } catch (_) {}
    }
  });

  document.addEventListener('dragend', function () {
    document.querySelectorAll('.dnd-dragging').forEach(el => el.classList.remove('dnd-dragging'));
    document.querySelectorAll('.dnd-over').forEach(z => z.classList.remove('dnd-over'));
    draggingId = null;
    draggingFromPip = false;
  });

  document.addEventListener('dragover', function (e) {
    // PiPのカードをPiPの外へ＝枠から外す操作。どこでもドロップ可（ゾーン強調はしない）
    if (draggingFromPip && !e.target.closest('#pitpip')) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.dnd-over').forEach(z => z.classList.remove('dnd-over'));
      return;
    }
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (!zone.classList.contains('dnd-over')) {
      document.querySelectorAll('.dnd-over').forEach(z => z.classList.remove('dnd-over'));
      zone.classList.add('dnd-over');
    }
  });

  document.addEventListener('dragleave', function (e) {
    const zone = e.target.closest('[data-drop]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('dnd-over');
  });

  document.addEventListener('drop', function (e) {
    let id = draggingId;
    if (!id && e.dataTransfer) { try { id = e.dataTransfer.getData('text/plain'); } catch (_) {} }
    // PiPのカードをPiPの外に落とした → PIT枠から外す（bayId=null）。看板のグレーアウトも解除。
    if (id && draggingFromPip && !e.target.closest('#pitpip')) {
      e.preventDefault();
      document.querySelectorAll('.dnd-over').forEach(z => z.classList.remove('dnd-over'));
      applyCardDrop(id, 'bay', '');
      return;
    }
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('dnd-over');
    if (id) applyCardDrop(id, zone.dataset.drop, zone.dataset.dropVal || '');
  });

})();
