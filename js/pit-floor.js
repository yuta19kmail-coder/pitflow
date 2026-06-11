/* ========================================
   pit-floor.js  -  PIT配置図エディタ v2（v0.47.0 / 第1段v2）
   ----------------------------------------
   設定の「PIT配置図を編集する」ボタンから専用の編集オーバーレイを開く。
   ・グリッドに吸着（位置・大きさが必ず揃う／自由な微調整はしない）
   ・道具：選択／平PIT／リフトPIT／建物／ドア／シャッター／壁・通路
   ・平PITは「カード何台ぶん」をグリッドのマス数で持つ＝枠内に台数と区画を表示
   ・リフトPITは2×2固定＋上から見たリフトの簡易イラスト
   ・壁/通路の線は角度を15°刻みにスナップ・端点はグリッドに吸着
   ・ズームで全体の引き寄りを調整
   データ：state.bays（PIT枠＝カードが入る）／state.floorPlan.shapes（建物/ドア/シャッター/壁）
           枠は gx,gy,gw,gh（グリッドのマス）＋ kind('flat'|'lift') ＋ icon ＋ division
   ======================================== */
(function () {
  'use strict';

  var ICONS = [
    { v: '', lb: 'アイコンなし' },
    { v: '🔧', lb: '🔧 整備' },
    { v: '🛞', lb: '🛞 タイヤ' },
    { v: '🎨', lb: '🎨 板金・塗装' },
    { v: '🔍', lb: '🔍 点検' },
    { v: '⚡', lb: '⚡ 電装' },
    { v: '🧰', lb: '🧰 一般' },
    { v: '🚗', lb: '🚗 一時置き' }
  ];
  var TOOLS = [
    { id: 'select',   lb: '選択・移動' },
    { id: 'flat',     lb: '平PIT' },
    { id: 'lift',     lb: 'リフトPIT' },
    { id: 'building', lb: '建物' },
    { id: 'door',     lb: 'ドア' },
    { id: 'shutter',  lb: 'シャッター' },
    { id: 'wall',     lb: '壁・通路' }
  ];

  var BASE = 30;        // 1マスの基準px（ズーム1）
  var zoom = 1;
  var cell = BASE;
  var tool = 'select';
  var sel = null;       // { kind:'bay'|'shape', id }
  var drag = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function save() { if (window.PitDB) PitDB.save(true); }
  function divColor(d) { return d === 'div1' ? '#1db97a' : (d === 'div2' ? '#ec4899' : '#7b8794'); }
  function divLabel(d) { return d === 'div1' ? '1課' : (d === 'div2' ? '2課' : '共通'); }

  function fp() {
    if (!state.floorPlan || typeof state.floorPlan !== 'object') state.floorPlan = {};
    var f = state.floorPlan;
    if (typeof f.cols !== 'number') f.cols = 24;
    if (typeof f.rows !== 'number') f.rows = 15;
    if (!Array.isArray(f.shapes)) f.shapes = [];
    return f;
  }
  function bays() { if (!Array.isArray(state.bays)) state.bays = []; return state.bays; }
  function shapes() { return fp().shapes; }
  function getBay(id) { return bays().find(function (b) { return b.id === id; }); }
  function getShape(id) { return shapes().find(function (s) { return s.id === id; }); }
  function isSel(kind, id) { return sel && sel.kind === kind && sel.id === id; }

  // 旧データ（%座標）→ グリッド(マス)へ移行＋種別/既定を補完
  function ensureModel() {
    var f = fp(), C = f.cols, R = f.rows;
    bays().forEach(function (b, i) {
      if (typeof b.gx !== 'number') {
        if (typeof b.x === 'number') {
          b.gx = clamp(Math.round(b.x / 100 * C), 0, C - 1);
          b.gy = clamp(Math.round(b.y / 100 * R), 0, R - 1);
          b.gw = clamp(Math.round((b.w || 20) / 100 * C), 1, C);
          b.gh = clamp(Math.round((b.h || 26) / 100 * R), 1, R);
        } else {
          b.gx = (i % 4) * 5 + 1; b.gy = 1 + Math.floor(i / 4) * 3; b.gw = 3; b.gh = 1;
        }
      }
      if (!b.kind) b.kind = /リフト|lift/i.test(b.name || '') ? 'lift' : 'flat';
      if (b.kind === 'lift') { b.gw = 2; b.gh = 2; }
      if (b.division == null) b.division = '';
      if (b.icon == null) b.icon = '';
      b.gw = clamp(b.gw, 1, C); b.gh = clamp(b.gh, 1, R);
      b.gx = clamp(b.gx, 0, C - b.gw); b.gy = clamp(b.gy, 0, R - b.gh);
    });
  }

  // ===== オーバーレイ開閉 =====
  function open() {
    ensureModel();
    var ov = document.getElementById('pf-overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'pf-overlay'; document.body.appendChild(ov); }
    ov.className = 'pf-overlay';
    ov.innerHTML = buildChrome();
    ov.style.display = 'flex';
    document.getElementById('pf-stage').addEventListener('pointerdown', onPointerDown);
    var zr = document.getElementById('pf-zoom');
    if (zr) zr.addEventListener('input', function () { zoom = parseFloat(zr.value); render(); });
    if (window.__appBusy !== undefined) window.__appBusy = true;
    render(); paintProps();
  }
  function close() {
    var ov = document.getElementById('pf-overlay');
    if (ov) ov.style.display = 'none';
    save();
    if (window.__appBusy !== undefined) window.__appBusy = false;
    if (typeof renderSettings === 'function' && state.currentView === 'settings') renderSettings();
  }

  function buildChrome() {
    var h = '';
    h += '<div class="pf-bar">';
    h += '<span class="pf-bar-title">🏭 PIT配置図</span>';
    h += '<div class="pf-tools">';
    TOOLS.forEach(function (t) {
      h += '<button class="pf-tool' + (tool === t.id ? ' on' : '') + '" data-tool="' + t.id + '" onclick="PitFloorEditor.setTool(\'' + t.id + '\')">' + t.lb + '</button>';
    });
    h += '</div>';
    h += '<span class="pf-zoom-wrap">🔍<input type="range" id="pf-zoom" min="0.6" max="1.8" step="0.1" value="' + zoom + '"></span>';
    h += '<button class="pf-done" onclick="PitFloorEditor.close()">完了して閉じる</button>';
    h += '</div>';
    h += '<div class="pf-hint" id="pf-hint">' + toolHint() + '</div>';
    h += '<div class="pf-stage" id="pf-stage"><div class="pf-grid" id="pf-grid"></div></div>';
    h += '<div class="pf-props" id="pf-props"></div>';
    return h;
  }
  function toolHint() {
    if (tool === 'select') return '枠をドラッグで移動／右下角で大きさ変更（グリッドに吸着）。クリックで選択して下で名前・課・種類・削除。';
    if (tool === 'wall') return '壁・通路：グリッド上をドラッグで線を引く（角度は15°刻み）。引いたら「選択」に戻ります。';
    return '配置したい場所をクリックすると「' + (TOOLS.filter(function(t){return t.id===tool;})[0]||{}).lb + '」を置きます。';
  }

  function setTool(t) {
    tool = t; sel = null;
    document.querySelectorAll('.pf-tool').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === t); });
    var hint = document.getElementById('pf-hint'); if (hint) hint.textContent = toolHint();
    render(); paintProps();
  }

  // ===== 描画 =====
  function render() {
    var grid = document.getElementById('pf-grid'); if (!grid) return;
    cell = Math.max(16, Math.round(BASE * zoom));
    var f = fp();
    grid.style.width = (f.cols * cell) + 'px';
    grid.style.height = (f.rows * cell) + 'px';
    grid.style.backgroundSize = cell + 'px ' + cell + 'px';

    var W = f.cols * cell, H = f.rows * cell;
    var s = '<svg class="pf-walls" width="' + W + '" height="' + H + '">';
    shapes().filter(function (x) { return x.type === 'wall'; }).forEach(function (w) {
      var col = isSel('shape', w.id) ? '#f59e0b' : '#94a3b8';
      s += '<line x1="' + (w.x1 * cell) + '" y1="' + (w.y1 * cell) + '" x2="' + (w.x2 * cell) + '" y2="' + (w.y2 * cell) + '" stroke="' + col + '" stroke-width="6" stroke-linecap="round" data-wall="' + w.id + '"/>';
      s += '<circle cx="' + (w.x1 * cell) + '" cy="' + (w.y1 * cell) + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="2" data-wpt="' + w.id + '|1"/>';
      s += '<circle cx="' + (w.x2 * cell) + '" cy="' + (w.y2 * cell) + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="2" data-wpt="' + w.id + '|2"/>';
    });
    s += '</svg>';
    grid.innerHTML = s;

    shapes().filter(function (x) { return x.type !== 'wall'; }).forEach(function (sh) { grid.appendChild(makeShapeEl(sh)); });
    bays().forEach(function (b) { grid.appendChild(makeBayEl(b)); });
  }

  function pos(el, o) {
    el.style.left = (o.gx * cell) + 'px'; el.style.top = (o.gy * cell) + 'px';
    el.style.width = (o.gw * cell) + 'px'; el.style.height = (o.gh * cell) + 'px';
  }
  function liftSvg() {
    return '<svg class="pf-lift-ill" viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet">'
      + '<rect x="14" y="22" width="72" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<rect x="14" y="40" width="72" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<line x1="50" y1="31" x2="50" y2="40" stroke="currentColor" stroke-width="2.5"/>'
      + '<circle cx="18" cy="26.5" r="3" fill="currentColor"/><circle cx="82" cy="26.5" r="3" fill="currentColor"/>'
      + '<circle cx="18" cy="44.5" r="3" fill="currentColor"/><circle cx="82" cy="44.5" r="3" fill="currentColor"/>'
      + '</svg>';
  }
  function makeBayEl(b) {
    var d = document.createElement('div');
    d.className = 'pf-box pf-pit pf-' + b.kind + (isSel('bay', b.id) ? ' sel' : '');
    pos(d, b);
    d.style.borderColor = divColor(b.division);
    d.style.color = divColor(b.division);
    d.setAttribute('data-bay', b.id);
    var cap = (b.kind === 'lift') ? 1 : (b.gw * b.gh);
    var h = '';
    h += '<div class="pf-box-hd"><span class="pf-box-nm">' + esc((b.icon ? b.icon + ' ' : '') + (b.name || '')) + '</span>'
       + '<span class="pf-cap" style="background:' + divColor(b.division) + '">' + cap + '台</span></div>';
    if (b.kind === 'lift') {
      h += liftSvg();
    } else {
      h += '<div class="pf-slots" style="grid-template-columns:repeat(' + b.gw + ',1fr);grid-template-rows:repeat(' + b.gh + ',1fr)">';
      for (var i = 0; i < cap; i++) h += '<span class="pf-slot"></span>';
      h += '</div>';
      h += '<span class="pf-resize" data-rz="' + b.id + '"></span>';
    }
    d.innerHTML = h;
    return d;
  }
  function makeShapeEl(sh) {
    var d = document.createElement('div');
    pos(d, sh);
    d.setAttribute('data-shape', sh.id);
    var on = isSel('shape', sh.id) ? ' sel' : '';
    if (sh.type === 'building') {
      d.className = 'pf-box pf-building' + on;
      d.innerHTML = '<span class="pf-box-tag">建物</span><span class="pf-resize" data-rzs="' + sh.id + '"></span>';
    } else if (sh.type === 'door') {
      d.className = 'pf-box pf-door' + on;
      d.innerHTML = '<svg viewBox="0 0 40 40" class="pf-mini"><path d="M8 34 V8 H30" fill="none" stroke="currentColor" stroke-width="3"/><path d="M30 8 A22 22 0 0 1 8 30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/></svg><span class="pf-box-tag">ドア</span>';
    } else if (sh.type === 'shutter') {
      d.className = 'pf-box pf-shutter' + on;
      d.innerHTML = '<span class="pf-box-tag">シャッター</span>';
    }
    return d;
  }

  // ===== 編集パネル =====
  function paintProps() {
    var p = document.getElementById('pf-props'); if (!p) return;
    if (sel && sel.kind === 'bay') {
      var b = getBay(sel.id); if (!b) { sel = null; p.innerHTML = ''; return; }
      var icons = ICONS.map(function (o) { return '<option value="' + o.v + '"' + (b.icon === o.v ? ' selected' : '') + '>' + o.lb + '</option>'; }).join('');
      var dopt = function (v, lb) { return '<option value="' + v + '"' + (b.division === v ? ' selected' : '') + '>' + lb + '</option>'; };
      p.innerHTML =
        '<span class="pf-prop-t">選択中の枠</span>' +
        '<input class="pf-in pf-in-name" value="' + esc(b.name || '') + '" placeholder="枠の名前" onchange="PitFloorEditor.edit(\'name\',this.value)">' +
        '<select class="pf-in" onchange="PitFloorEditor.edit(\'icon\',this.value)">' + icons + '</select>' +
        '<select class="pf-in" onchange="PitFloorEditor.edit(\'kind\',this.value)"><option value="flat"' + (b.kind === 'flat' ? ' selected' : '') + '>平PIT（作業場）</option><option value="lift"' + (b.kind === 'lift' ? ' selected' : '') + '>リフトPIT</option></select>' +
        '<select class="pf-in" onchange="PitFloorEditor.edit(\'division\',this.value)">' + dopt('', '共通') + dopt('div1', '1課') + dopt('div2', '2課') + '</select>' +
        '<span class="pf-cap-note">' + (b.kind === 'lift' ? 'リフト＝1台固定' : ('この枠 ' + (b.gw * b.gh) + '台（横' + b.gw + '×縦' + b.gh + '）')) + '</span>' +
        '<button class="pf-del" onclick="PitFloorEditor.removeSel()">🗑 削除</button>';
    } else if (sel && sel.kind === 'shape') {
      var sh = getShape(sel.id); if (!sh) { sel = null; p.innerHTML = ''; return; }
      var nm = sh.type === 'building' ? '建物' : (sh.type === 'door' ? 'ドア' : (sh.type === 'shutter' ? 'シャッター' : '壁・通路'));
      p.innerHTML = '<span class="pf-prop-t">選択中：' + nm + '</span>' +
        (sh.type === 'wall' ? '<span class="pf-cap-note">両端の●をドラッグ（15°刻み）</span>' : '<span class="pf-cap-note">ドラッグで移動' + (sh.type === 'building' ? '・右下で大きさ変更' : '') + '</span>') +
        '<button class="pf-del" onclick="PitFloorEditor.removeSel()">🗑 削除</button>';
    } else {
      p.innerHTML = '<span class="pf-prop-empty">枠や建物をクリックすると、ここで名前・課・種類・削除ができます。</span>';
    }
  }

  // ===== 追加・編集・削除 =====
  function placeAt(cx, cy) {
    var f = fp(), C = f.cols, R = f.rows;
    var gx = clamp(Math.floor(cx), 0, C - 1), gy = clamp(Math.floor(cy), 0, R - 1);
    if (tool === 'flat') {
      var gw = Math.min(3, C - gx);
      bays().push({ id: uid('bay'), name: 'PIT ' + (bays().length + 1), icon: '', kind: 'flat', division: '', gx: gx, gy: gy, gw: gw, gh: 1 });
      sel = { kind: 'bay', id: bays()[bays().length - 1].id };
    } else if (tool === 'lift') {
      gx = clamp(gx, 0, C - 2); gy = clamp(gy, 0, R - 2);
      bays().push({ id: uid('bay'), name: 'リフト', icon: '', kind: 'lift', division: '', gx: gx, gy: gy, gw: 2, gh: 2 });
      sel = { kind: 'bay', id: bays()[bays().length - 1].id };
    } else if (tool === 'building') {
      var bw = Math.min(4, C - gx), bh = Math.min(3, R - gy);
      shapes().push({ id: uid('sh'), type: 'building', gx: gx, gy: gy, gw: bw, gh: bh });
      sel = { kind: 'shape', id: shapes()[shapes().length - 1].id };
    } else if (tool === 'door') {
      shapes().push({ id: uid('sh'), type: 'door', gx: gx, gy: gy, gw: 1, gh: 1 });
      sel = { kind: 'shape', id: shapes()[shapes().length - 1].id };
    } else if (tool === 'shutter') {
      var sw = Math.min(2, C - gx);
      shapes().push({ id: uid('sh'), type: 'shutter', gx: gx, gy: gy, gw: sw, gh: 1 });
      sel = { kind: 'shape', id: shapes()[shapes().length - 1].id };
    }
    save(); setTool('select');
  }
  function edit(field, val) {
    if (!sel || sel.kind !== 'bay') return;
    var b = getBay(sel.id); if (!b) return;
    if (field === 'kind' && val === 'lift') { b.gw = 2; b.gh = 2; }
    if (field === 'kind' && val === 'flat' && b.kind === 'lift') { b.gw = 3; b.gh = 1; }
    b[field] = val;
    var f = fp(); b.gx = clamp(b.gx, 0, f.cols - b.gw); b.gy = clamp(b.gy, 0, f.rows - b.gh);
    save(); render(); paintProps();
  }
  function removeSel() {
    if (!sel) return;
    if (sel.kind === 'bay') { var i = bays().findIndex(function (b) { return b.id === sel.id; }); if (i >= 0) bays().splice(i, 1); }
    else { var j = shapes().findIndex(function (s) { return s.id === sel.id; }); if (j >= 0) shapes().splice(j, 1); }
    sel = null; save(); render(); paintProps();
  }

  // ===== ポインタ操作 =====
  function cellAt(e) {
    var g = document.getElementById('pf-grid'); var r = g.getBoundingClientRect();
    return { cx: (e.clientX - r.left) / cell, cy: (e.clientY - r.top) / cell };
  }
  function snapWall(sx, sy, ex, ey) {
    var f = fp();
    sx = clamp(Math.round(sx), 0, f.cols); sy = clamp(Math.round(sy), 0, f.rows);
    var rex = Math.round(ex), rey = Math.round(ey);
    var dx = rex - sx, dy = rey - sy;
    if (dx === 0 && dy === 0) return { x1: sx, y1: sy, x2: sx, y2: sy };
    var ang = Math.atan2(dy, dx), step = Math.PI / 12;              // 15°
    var sa = Math.round(ang / step) * step;
    var len = Math.sqrt(dx * dx + dy * dy);
    var nx = clamp(Math.round(sx + Math.cos(sa) * len), 0, f.cols);
    var ny = clamp(Math.round(sy + Math.sin(sa) * len), 0, f.rows);
    return { x1: sx, y1: sy, x2: nx, y2: ny };
  }

  function onPointerDown(e) {
    var t = e.target;
    var c = cellAt(e);

    // 配置ツール
    if (tool !== 'select' && tool !== 'wall') { e.preventDefault(); placeAt(c.cx, c.cy); return; }
    if (tool === 'wall') {
      e.preventDefault();
      var w = { id: uid('sh'), type: 'wall', x1: Math.round(c.cx), y1: Math.round(c.cy), x2: Math.round(c.cx), y2: Math.round(c.cy) };
      shapes().push(w); sel = { kind: 'shape', id: w.id };
      drag = { type: 'wallnew', w: w, sx: c.cx, sy: c.cy };
      bind(); render(); paintProps(); return;
    }

    // 選択ツール
    var wpt = t.getAttribute && t.getAttribute('data-wpt');
    if (wpt) { var pr = wpt.split('|'); var ws = getShape(pr[0]); if (ws) { sel = { kind: 'shape', id: ws.id }; drag = { type: 'wallpt', w: ws, n: pr[1] }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    var wl = t.getAttribute && t.getAttribute('data-wall');
    if (wl) { sel = { kind: 'shape', id: wl }; render(); paintProps(); return; }
    var rz = t.getAttribute && t.getAttribute('data-rz');
    if (rz) { var b = getBay(rz); if (b) { sel = { kind: 'bay', id: b.id }; drag = { type: 'resize', o: b }; bind(); } e.preventDefault(); return; }
    var rzs = t.getAttribute && t.getAttribute('data-rzs');
    if (rzs) { var sb = getShape(rzs); if (sb) { sel = { kind: 'shape', id: sb.id }; drag = { type: 'resize', o: sb }; bind(); } e.preventDefault(); return; }
    var boxBay = t.closest && t.closest('.pf-pit');
    if (boxBay) { var bb = getBay(boxBay.getAttribute('data-bay')); if (bb) { sel = { kind: 'bay', id: bb.id }; drag = { type: 'move', o: bb, ox: c.cx - bb.gx, oy: c.cy - bb.gy }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    var boxShape = t.closest && t.closest('[data-shape]');
    if (boxShape) { var ss = getShape(boxShape.getAttribute('data-shape')); if (ss) { sel = { kind: 'shape', id: ss.id }; drag = { type: 'move', o: ss, ox: c.cx - ss.gx, oy: c.cy - ss.gy }; bind(); render(); paintProps(); } e.preventDefault(); return; }

    sel = null; render(); paintProps();
  }
  function bind() { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }
  function unbind() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }

  function onMove(e) {
    if (!drag) return;
    var f = fp(), c = cellAt(e);
    if (drag.type === 'move') {
      var o = drag.o;
      o.gx = clamp(Math.round(c.cx - drag.ox), 0, f.cols - o.gw);
      o.gy = clamp(Math.round(c.cy - drag.oy), 0, f.rows - o.gh);
    } else if (drag.type === 'resize') {
      var r = drag.o;
      r.gw = clamp(Math.round(c.cx) - r.gx, 1, f.cols - r.gx);
      r.gh = clamp(Math.round(c.cy) - r.gy, 1, f.rows - r.gy);
    } else if (drag.type === 'wallpt') {
      var w = drag.w;
      var other = (drag.n === '1') ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 };
      var sn = snapWall(other.x, other.y, c.cx, c.cy);
      if (drag.n === '1') { w.x1 = sn.x2; w.y1 = sn.y2; } else { w.x2 = sn.x2; w.y2 = sn.y2; }
    } else if (drag.type === 'wallnew') {
      var sn2 = snapWall(drag.sx, drag.sy, c.cx, c.cy);
      drag.w.x1 = sn2.x1; drag.w.y1 = sn2.y1; drag.w.x2 = sn2.x2; drag.w.y2 = sn2.y2;
    }
    render();
  }
  function onUp() {
    if (drag) {
      if (drag.type === 'wallnew' && drag.w.x1 === drag.w.x2 && drag.w.y1 === drag.w.y2) {
        var i = shapes().findIndex(function (s) { return s.id === drag.w.id; }); if (i >= 0) shapes().splice(i, 1);
      }
      drag = null; save(); render(); paintProps();
      if (tool === 'wall') setTool('select');
    }
    unbind();
  }

  window.PitFloorEditor = {
    open: open, close: close, setTool: setTool, edit: edit, removeSel: removeSel,
    countPits: function () { ensureModel(); return bays().length; }
  };
  console.log('[pit-floor] v2 ready');
})();
