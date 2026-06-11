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
      c.status = val;
      // 作業完了（workDone）にしたら、返車日が未定なら「返車・未定」へ自動で乗せる（完TEL待ち）
      if (val === 'workDone' && !c.returnDate) c.returnTbd = true;
      if (window.logFlow && typeof statusLabel === 'function') logFlow(c, statusLabel(val) + 'へ');
    } else if (kind === 'bay') {
      const nv = val || null;
      if (c.bayId === nv) return;
      c.bayId = nv;
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

  let draggingId = null;

  document.addEventListener('dragstart', function (e) {
    const card = e.target.closest('[data-card-id][draggable="true"]');
    if (!card) return;
    draggingId = card.dataset.cardId;
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
  });

  document.addEventListener('dragover', function (e) {
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
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    let id = draggingId;
    if (!id && e.dataTransfer) { try { id = e.dataTransfer.getData('text/plain'); } catch (_) {} }
    zone.classList.remove('dnd-over');
    if (id) applyCardDrop(id, zone.dataset.drop, zone.dataset.dropVal || '');
  });

})();
