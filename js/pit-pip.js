/* ========================================
   pit-pip.js  -  PIT配置 PiP窓（最前面の小窓・2画面連携）
   ----------------------------------------
   1課/2課のタスク看板を見ながら、PIT配置図を最前面の小窓で重ねて表示する。
   看板のカードを小窓のPIT枠へドラッグ＝そのまま枠へ配置（dnd.js が処理）。
   ・ドラッグでヘッダを掴んで移動／右下で大きさ変更。
   ・カード配置のたび PitPip.refresh() で小窓を最新化（dnd.js から呼ばれる）。
   ======================================== */
(function () {
  'use strict';

  var open = false;

  function ensureEl() {
    var el = document.getElementById('pitpip');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pitpip'; el.className = 'pitpip';
    el.innerHTML =
      '<div class="pitpip-bar" id="pitpip-bar">'
      + '<span class="pitpip-title">🏭 PIT配置</span>'
      + '<button class="pitpip-btn" title="更新" onclick="PitPip.refresh()">🔄</button>'
      + '<button class="pitpip-btn" title="閉じる" onclick="PitPip.close()">✕</button>'
      + '</div>'
      + '<div class="pitpip-body" id="pitpip-body"><div id="pitpip-grid" class="pf-grid"></div></div>'
      + '<span class="pitpip-resize" id="pitpip-resize"></span>';
    document.body.appendChild(el);
    wireDrag(el);
    wireResize(el);
    return el;
  }

  function show() {
    open = true;
    var el = ensureEl();
    el.style.display = 'flex';
    refresh();
  }
  function close() {
    open = false;
    var el = document.getElementById('pitpip');
    if (el) el.style.display = 'none';
  }
  function toggle() { open ? close() : show(); }
  function isOpen() { return open; }

  function refresh() {
    if (!open) return;
    var grid = document.getElementById('pitpip-grid');
    var body = document.getElementById('pitpip-body');
    if (!grid || !window.PitFloorView || !window.state) return;
    if (!Array.isArray(state.bays) || state.bays.length === 0) {
      grid.style.width = ''; grid.style.height = '';
      grid.innerHTML = '<div class="pitlist-nofloor" style="padding:24px">PIT配置図が未設定です。設定→🏭配置図を編集で作成してください。</div>';
      return;
    }
    var targets = state.cards.filter(function (c) {
      return ['check', 'estim', 'contact', 'parts', 'work'].indexOf(c.status) >= 0;
    });
    var byBay = {};
    targets.forEach(function (c) { if (c.bayId) { (byBay[c.bayId] = byBay[c.bayId] || []).push(c); } });
    PitFloorView.render(grid, { cardsByBay: byBay, stage: body, minCell: 40 });
  }

  // ===== ヘッダを掴んで移動 =====
  function wireDrag(el) {
    var bar = el.querySelector('#pitpip-bar');
    var st = null;
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.pitpip-btn')) return;
      var r = el.getBoundingClientRect();
      st = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      el.style.right = 'auto';
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    bar.addEventListener('pointermove', function (e) {
      if (!st) return;
      var x = clamp(e.clientX - st.dx, 0, window.innerWidth - 80);
      var y = clamp(e.clientY - st.dy, 0, window.innerHeight - 40);
      el.style.left = x + 'px'; el.style.top = y + 'px';
    });
    bar.addEventListener('pointerup', function () { st = null; });
  }

  // ===== 右下で大きさ変更 =====
  function wireResize(el) {
    var h = el.querySelector('#pitpip-resize');
    var st = null;
    h.addEventListener('pointerdown', function (e) {
      var r = el.getBoundingClientRect();
      st = { x: e.clientX, y: e.clientY, w: r.width, ht: r.height };
      h.setPointerCapture(e.pointerId);
      e.preventDefault(); e.stopPropagation();
    });
    h.addEventListener('pointermove', function (e) {
      if (!st) return;
      el.style.width = clamp(st.w + (e.clientX - st.x), 260, window.innerWidth - 20) + 'px';
      el.style.height = clamp(st.ht + (e.clientY - st.y), 200, window.innerHeight - 20) + 'px';
    });
    h.addEventListener('pointerup', function () { if (st) { st = null; refresh(); } });
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  window.PitPip = { show: show, close: close, toggle: toggle, refresh: refresh, isOpen: isOpen };
})();
