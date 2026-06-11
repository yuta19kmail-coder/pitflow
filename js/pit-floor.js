/* ========================================
   pit-floor.js  -  PIT配置図エディタ v3（v0.48.0 / 第1段v3）
   ----------------------------------------
   ・縮尺＝「横のマス数」（マスの細かさ）。細かくするほど工場の横幅により多くの
     PIT＋通路が収まる。1マス＝カード1枚＝PIT1枠（1台）の基準。PiPの基準倍率にもなる。
   ・新規PITは「1台ぶん（1マス）」。必要な時だけリサイズで広げられる。
   ・ドア／シャッターは“壁の線の上”に乗る（縦の壁・横の壁どちらにも・線に沿う）。
   ・重ね順（最前面/最背面）＋ノードのロック（固定して下のものを触れるように）。
   データ：state.bays（PIT枠）＋state.floorPlan{cols,rows,shapes[]}
     枠   : {id,name,icon,kind,division,gx,gy,gw,gh,locked}
     建物 : {type:'building',gx,gy,gw,gh,locked}
     壁   : {type:'wall',x1,y1,x2,y2,locked}
     扉   : {type:'door'|'shutter', wallId, t, locked}   ※壁に付属（tは0〜1の位置）
   ======================================== */
(function () {
  'use strict';

  var ICONS = [
    { v: '', lb: 'アイコンなし' }, { v: '🔧', lb: '🔧 整備' }, { v: '🛞', lb: '🛞 タイヤ' },
    { v: '🎨', lb: '🎨 板金・塗装' }, { v: '🔍', lb: '🔍 点検' }, { v: '⚡', lb: '⚡ 電装' },
    { v: '🧰', lb: '🧰 一般' }, { v: '🚗', lb: '🚗 一時置き' }
  ];
  var TOOLS = [
    { id: 'select', lb: '選択・移動' }, { id: 'flat', lb: '平PIT' }, { id: 'lift', lb: 'リフトPIT' },
    { id: 'building', lb: '建物' }, { id: 'door', lb: 'ドア' }, { id: 'shutter', lb: 'シャッター' }, { id: 'wall', lb: '壁・通路' }
  ];

  var cell = 30;
  var tool = 'select';
  var sel = null;       // { kind:'bay'|'shape', id }
  var drag = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function save() { if (window.PitDB) PitDB.save(true); }
  function divColor(d) { return d === 'div1' ? '#1db97a' : (d === 'div2' ? '#ec4899' : '#7b8794'); }

  function fp() {
    if (!state.floorPlan || typeof state.floorPlan !== 'object') state.floorPlan = {};
    var f = state.floorPlan;
    if (typeof f.cols !== 'number') f.cols = 16;
    if (typeof f.rows !== 'number') f.rows = Math.max(4, Math.round(f.cols / 1.7));
    if (!Array.isArray(f.shapes)) f.shapes = [];
    return f;
  }
  function bays() { if (!Array.isArray(state.bays)) state.bays = []; return state.bays; }
  function shapes() { return fp().shapes; }
  function walls() { return shapes().filter(function (s) { return s.type === 'wall'; }); }
  function getBay(id) { return bays().find(function (b) { return b.id === id; }); }
  function getShape(id) { return shapes().find(function (s) { return s.id === id; }); }
  function isSel(kind, id) { return sel && sel.kind === kind && sel.id === id; }
  function selObj() { return sel ? (sel.kind === 'bay' ? getBay(sel.id) : getShape(sel.id)) : null; }

  function ensureModel() {
    var f = fp(), C = f.cols, R = f.rows;
    // 旧自由ドア/シャッター（壁に付かない箱）は破棄（v2の試作分）
    f.shapes = f.shapes.filter(function (s) { return !((s.type === 'door' || s.type === 'shutter') && !s.wallId); });
    bays().forEach(function (b, i) {
      if (typeof b.gx !== 'number') {
        if (typeof b.x === 'number') {
          b.gx = clamp(Math.round(b.x / 100 * C), 0, C - 1); b.gy = clamp(Math.round(b.y / 100 * R), 0, R - 1);
          b.gw = 1; b.gh = 1;
        } else { b.gx = i % C; b.gy = 0; b.gw = 1; b.gh = 1; }
      }
      if (!b.kind) b.kind = /リフト|lift/i.test(b.name || '') ? 'lift' : 'flat';
      if (b.division == null) b.division = '';
      if (b.icon == null) b.icon = '';
      clampBox(b);
    });
    f.shapes.forEach(function (s) { if (s.gx != null) clampBox(s); });
  }
  function clampBox(o) {
    var f = fp();
    o.gw = clamp(o.gw || 1, 1, f.cols); o.gh = clamp(o.gh || 1, 1, f.rows);
    o.gx = clamp(o.gx, 0, f.cols - o.gw); o.gy = clamp(o.gy, 0, f.rows - o.gh);
  }

  // ===== 開閉 =====
  function open() {
    ensureModel();
    var ov = document.getElementById('pf-overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'pf-overlay'; document.body.appendChild(ov); }
    ov.className = 'pf-overlay'; ov.innerHTML = buildChrome(); ov.style.display = 'flex';
    document.getElementById('pf-stage').addEventListener('pointerdown', onPointerDown);
    var sc = document.getElementById('pf-scale');
    if (sc) sc.addEventListener('input', function () { setScale(parseInt(sc.value, 10)); });
    if (window.__appBusy !== undefined) window.__appBusy = true;
    render(); paintProps();
  }
  function close() {
    var ov = document.getElementById('pf-overlay'); if (ov) ov.style.display = 'none';
    save();
    if (window.__appBusy !== undefined) window.__appBusy = false;
    if (typeof renderSettings === 'function' && state.currentView === 'settings') renderSettings();
  }
  function setScale(cols) {
    var f = fp();
    f.cols = clamp(cols, 8, 30);
    f.rows = Math.max(4, Math.round(f.cols / 1.7));
    bays().forEach(clampBox); shapes().forEach(function (s) { if (s.gx != null) clampBox(s); });
    var lb = document.getElementById('pf-scale-lb'); if (lb) lb.textContent = '横' + f.cols + 'マス';
    save(); render(); paintProps();
  }

  function buildChrome() {
    var f = fp(), h = '';
    h += '<div class="pf-bar"><span class="pf-bar-title">🏭 PIT配置図</span><div class="pf-tools">';
    TOOLS.forEach(function (t) { h += '<button class="pf-tool' + (tool === t.id ? ' on' : '') + '" data-tool="' + t.id + '" onclick="PitFloorEditor.setTool(\'' + t.id + '\')">' + t.lb + '</button>'; });
    h += '</div>';
    h += '<span class="pf-scale-wrap">縮尺<input type="range" id="pf-scale" min="8" max="30" step="1" value="' + f.cols + '"><span id="pf-scale-lb">横' + f.cols + 'マス</span></span>';
    h += '<button class="pf-sample" onclick="PitFloorEditor.loadSample()">🏭 サンプル工場</button>';
    h += '<button class="pf-done" onclick="PitFloorEditor.close()">完了して閉じる</button></div>';
    h += '<div class="pf-hint" id="pf-hint">' + toolHint() + '</div>';
    h += '<div class="pf-stage" id="pf-stage"><div class="pf-grid" id="pf-grid"></div></div>';
    h += '<div class="pf-props" id="pf-props"></div>';
    return h;
  }
  function toolHint() {
    if (tool === 'select') return '枠＝ドラッグで移動・右下で大きさ変更。クリックで選択して下で編集（重ね順・ロックもここ）。鍵マークで固定／解除。';
    if (tool === 'wall') return '壁・通路：ドラッグで線を引く（角度15°刻み）。';
    if (tool === 'door' || tool === 'shutter') return (tool === 'door' ? 'ドア' : 'シャッター') + 'は「壁の線の上」をクリックして付けます（縦横どちらの壁にも乗ります）。';
    return '置きたい場所をクリックで「' + (TOOLS.filter(function (t) { return t.id === tool; })[0] || {}).lb + '」を配置。平PIT/リフトは1マス（1台）から。';
  }
  function setTool(t) {
    tool = t; sel = null;
    document.querySelectorAll('.pf-tool').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === t); });
    var hn = document.getElementById('pf-hint'); if (hn) hn.textContent = toolHint();
    render(); paintProps();
  }

  // ===== 描画 =====
  function render() {
    var grid = document.getElementById('pf-grid'), stage = document.getElementById('pf-stage');
    if (!grid || !stage) return;
    var f = fp();
    var sw = (stage.clientWidth || 900) - 40;
    cell = Math.max(20, Math.floor(sw / f.cols));
    var W = f.cols * cell, H = f.rows * cell;
    grid.style.width = W + 'px'; grid.style.height = H + 'px';
    grid.style.backgroundSize = cell + 'px ' + cell + 'px';

    // SVG（壁＋壁付属のドア/シャッター）
    var s = '<svg class="pf-walls" width="' + W + '" height="' + H + '">';
    walls().forEach(function (w) {
      var on = isSel('shape', w.id), col = on ? '#f59e0b' : '#94a3b8';
      s += '<line x1="' + (w.x1 * cell) + '" y1="' + (w.y1 * cell) + '" x2="' + (w.x2 * cell) + '" y2="' + (w.y2 * cell) + '" stroke="' + col + '" stroke-width="6" stroke-linecap="round"' + (w.locked ? '' : ' data-wall="' + w.id + '"') + '/>';
      if (!w.locked) {
        s += '<circle cx="' + (w.x1 * cell) + '" cy="' + (w.y1 * cell) + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="2" data-wpt="' + w.id + '|1"/>';
        s += '<circle cx="' + (w.x2 * cell) + '" cy="' + (w.y2 * cell) + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="2" data-wpt="' + w.id + '|2"/>';
      }
    });
    shapes().filter(function (x) { return x.type === 'door' || x.type === 'shutter'; }).forEach(function (a) {
      s += attachMarker(a);
    });
    s += '</svg>';
    grid.innerHTML = s;

    shapes().filter(function (x) { return x.type === 'building'; }).forEach(function (b) { grid.appendChild(makeBuildingEl(b)); });
    bays().forEach(function (b) { grid.appendChild(makeBayEl(b)); });
  }

  function attachMarker(a) {
    var w = getShape(a.wallId); if (!w) return '';
    var px = (w.x1 + (w.x2 - w.x1) * a.t) * cell, py = (w.y1 + (w.y2 - w.y1) * a.t) * cell;
    var deg = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI;
    var on = isSel('shape', a.id), col = on ? '#f59e0b' : (a.type === 'door' ? '#3b82f6' : '#b45309');
    var H = cell * 0.5, L = cell * 0.9;
    var attr = a.locked ? '' : ' data-attach="' + a.id + '"';
    var g = '<g transform="translate(' + px + ',' + py + ') rotate(' + deg + ')" style="cursor:pointer"' + attr + '>';
    g += '<rect x="' + (-H) + '" y="-7" width="' + (cell) + '" height="14" fill="var(--bg2)"/>';
    if (a.type === 'door') {
      g += '<line x1="' + (-H) + '" y1="-5" x2="' + (-H) + '" y2="5" stroke="' + col + '" stroke-width="3"/>';
      g += '<line x1="' + H + '" y1="-5" x2="' + H + '" y2="5" stroke="' + col + '" stroke-width="3"/>';
      g += '<line x1="' + (-H) + '" y1="0" x2="' + (-H) + '" y2="' + (-L) + '" stroke="' + col + '" stroke-width="2.5"/>';
      g += '<path d="M ' + (-H) + ' ' + (-L) + ' A ' + L + ' ' + L + ' 0 0 1 ' + H + ' 0" fill="none" stroke="' + col + '" stroke-width="1.5" stroke-dasharray="3 3"/>';
    } else {
      g += '<rect x="' + (-cell * 0.7) + '" y="-6" width="' + (cell * 1.4) + '" height="12" rx="2" fill="' + col + '" fill-opacity="0.18" stroke="' + col + '" stroke-width="2"/>';
      for (var k = -2; k <= 2; k++) g += '<line x1="' + (k * cell * 0.28) + '" y1="-5" x2="' + (k * cell * 0.28) + '" y2="5" stroke="' + col + '" stroke-width="1.4"/>';
    }
    g += '</g>';
    return g;
  }

  function pos(el, o) { el.style.left = (o.gx * cell) + 'px'; el.style.top = (o.gy * cell) + 'px'; el.style.width = (o.gw * cell) + 'px'; el.style.height = (o.gh * cell) + 'px'; }
  function lockChip(kind, o) { return '<span class="pf-lock' + (o.locked ? ' on' : '') + '" data-lock="' + kind + '|' + o.id + '" title="' + (o.locked ? 'ロック中（クリックで解除）' : 'ロックする') + '">' + (o.locked ? '🔒' : '🔓') + '</span>'; }
  function liftSvg() {
    // 2柱リフトの“上から見た平面図”＝左右の柱＋内側に伸びる4本のスイングアーム＋先端パッド
    return '<svg class="pf-lift-ill" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid meet">'
      + '<rect x="7" y="27" width="11" height="26" rx="2" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2.5"/>'
      + '<rect x="102" y="27" width="11" height="26" rx="2" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2.5"/>'
      + '<path d="M18 36 Q39 23 52 21" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
      + '<path d="M18 44 Q39 57 52 59" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
      + '<path d="M102 36 Q81 23 68 21" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
      + '<path d="M102 44 Q81 57 68 59" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
      + '<rect x="49" y="18" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="49" y="55" width="7" height="7" rx="1.5" fill="currentColor"/>'
      + '<rect x="64" y="18" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="64" y="55" width="7" height="7" rx="1.5" fill="currentColor"/></svg>';
  }
  function makeBayEl(b) {
    var d = document.createElement('div');
    d.className = 'pf-box pf-pit pf-' + b.kind + (isSel('bay', b.id) ? ' sel' : '') + (b.locked ? ' locked' : '');
    pos(d, b); d.style.borderColor = divColor(b.division); d.style.color = divColor(b.division);
    d.setAttribute('data-bay', b.id);
    var h = '<div class="pf-box-hd"><span class="pf-box-nm">' + esc((b.icon ? b.icon + ' ' : '') + (b.name || '')) + '</span>' + lockChip('bay', b) + '</div>';
    var cap = 1;
    if (b.kind === 'lift') { h += liftSvg(); }
    else {
      // カードは“横長カード”を【1列5枚】で積む。箱の高さに合わせて1枚の高さを詰めるので
      // 縦長になりすぎない。幅が広い枠だけ複数列になる（2.5マスごとに1列）。
      var per = 5, gap = 3;
      var ncol = Math.max(1, Math.round(b.gw / 2.5));
      var innerH = Math.max(34, b.gh * cell - 22);
      var barH = clamp(Math.floor((innerH - (per - 1) * gap) / per), 7, 26);
      cap = ncol * per;
      h += '<div class="pf-cards">';
      for (var col = 0; col < ncol; col++) {
        h += '<div class="pf-cardcol">';
        for (var r = 0; r < per; r++) h += '<span class="pf-cardbar" style="height:' + barH + 'px"></span>';
        h += '</div>';
      }
      h += '</div>';
    }
    h += '<span class="pf-cap" style="background:' + divColor(b.division) + '">' + (b.kind === 'lift' ? '1台' : cap + '枚') + '</span>';
    if (!b.locked) h += '<span class="pf-resize" data-rz="' + b.id + '"></span>';
    d.innerHTML = h; return d;
  }
  function makeBuildingEl(s) {
    var d = document.createElement('div');
    d.className = 'pf-box pf-building' + (isSel('shape', s.id) ? ' sel' : '') + (s.locked ? ' locked' : '');
    pos(d, s); d.setAttribute('data-shape', s.id);
    d.innerHTML = '<span class="pf-box-tag">建物</span>' + lockChip('shape', s) + (s.locked ? '' : '<span class="pf-resize" data-rzs="' + s.id + '"></span>');
    return d;
  }

  // ===== 編集パネル =====
  function paintProps() {
    var p = document.getElementById('pf-props'); if (!p) return;
    var o = selObj();
    if (sel && sel.kind === 'bay' && o) {
      var icons = ICONS.map(function (x) { return '<option value="' + x.v + '"' + (o.icon === x.v ? ' selected' : '') + '>' + x.lb + '</option>'; }).join('');
      var dop = function (v, l) { return '<option value="' + v + '"' + (o.division === v ? ' selected' : '') + '>' + l + '</option>'; };
      p.innerHTML = '<span class="pf-prop-t">PIT枠</span>'
        + '<input class="pf-in pf-in-name" value="' + esc(o.name || '') + '" placeholder="名前" onchange="PitFloorEditor.edit(\'name\',this.value)">'
        + '<select class="pf-in" onchange="PitFloorEditor.edit(\'icon\',this.value)">' + icons + '</select>'
        + '<select class="pf-in" onchange="PitFloorEditor.edit(\'kind\',this.value)"><option value="flat"' + (o.kind === 'flat' ? ' selected' : '') + '>平PIT</option><option value="lift"' + (o.kind === 'lift' ? ' selected' : '') + '>リフトPIT</option></select>'
        + '<select class="pf-in" onchange="PitFloorEditor.edit(\'division\',this.value)">' + dop('', '共通') + dop('div1', '1課') + dop('div2', '2課') + '</select>'
        + '<span class="pf-cap-note">' + (o.kind === 'lift' ? 'リフト＝1台' : ('横' + o.gw + '列・縦に積む（枚数は縮尺で変化）')) + '</span>'
        + zlockBtns() + '<button class="pf-del" onclick="PitFloorEditor.removeSel()">🗑 削除</button>';
    } else if (sel && sel.kind === 'shape' && o) {
      var nm = o.type === 'building' ? '建物' : (o.type === 'door' ? 'ドア' : (o.type === 'shutter' ? 'シャッター' : '壁・通路'));
      p.innerHTML = '<span class="pf-prop-t">' + nm + '</span>'
        + '<span class="pf-cap-note">' + (o.type === 'wall' ? '両端の●をドラッグ（15°刻み）' : (o.type === 'building' ? 'ドラッグで移動・右下で大きさ' : '壁の上をドラッグで位置調整')) + '</span>'
        + zlockBtns() + '<button class="pf-del" onclick="PitFloorEditor.removeSel()">🗑 削除</button>';
    } else {
      p.innerHTML = '<span class="pf-prop-empty">枠・建物・線をクリックすると、ここで編集（名前／課／種類／重ね順／ロック／削除）できます。</span>';
    }
  }
  function zlockBtns() {
    var o = selObj(); var locked = o && o.locked;
    return '<button class="pf-zbtn" onclick="PitFloorEditor.toFront()" title="最前面へ">⬆ 前面</button>'
      + '<button class="pf-zbtn" onclick="PitFloorEditor.toBack()" title="最背面へ">⬇ 背面</button>'
      + '<button class="pf-zbtn' + (locked ? ' on' : '') + '" onclick="PitFloorEditor.toggleLock()">' + (locked ? '🔒 解除' : '🔓 ロック') + '</button>';
  }

  // ===== 追加・編集・並び =====
  function placeAt(cx, cy) {
    var f = fp(), gx = clamp(Math.floor(cx), 0, f.cols - 1), gy = clamp(Math.floor(cy), 0, f.rows - 1);
    if (tool === 'flat' || tool === 'lift') {
      var b = { id: uid('bay'), name: tool === 'lift' ? 'リフト' : 'PIT ' + (bays().length + 1), icon: '', kind: tool, division: '', gx: gx, gy: gy, gw: 1, gh: 1 };
      bays().push(b); sel = { kind: 'bay', id: b.id };
    } else if (tool === 'building') {
      var bw = Math.min(4, f.cols - gx), bh = Math.min(3, f.rows - gy);
      var s = { id: uid('sh'), type: 'building', gx: gx, gy: gy, gw: bw, gh: bh };
      shapes().push(s); sel = { kind: 'shape', id: s.id };
    }
    save(); setTool('select');
  }
  function placeAttach(type, cx, cy) {
    var nw = nearestWall(cx, cy);
    if (!nw || nw.d > 0.8) { flashHint('壁の線の上をクリックしてください'); return; }
    var a = { id: uid('sh'), type: type, wallId: nw.w.id, t: nw.t };
    shapes().push(a); sel = { kind: 'shape', id: a.id };
    save(); setTool('select');
  }
  function flashHint(msg) { var hn = document.getElementById('pf-hint'); if (hn) { hn.textContent = msg; setTimeout(function () { hn.textContent = toolHint(); }, 1800); } }
  function edit(field, val) {
    if (!sel || sel.kind !== 'bay') return; var b = getBay(sel.id); if (!b) return;
    b[field] = val; save(); render(); paintProps();
  }
  function removeSel() {
    if (!sel) return;
    if (sel.kind === 'bay') { var i = bays().findIndex(function (b) { return b.id === sel.id; }); if (i >= 0) bays().splice(i, 1); }
    else {
      var id = sel.id; var j = shapes().findIndex(function (s) { return s.id === id; }); if (j >= 0) shapes().splice(j, 1);
      // 壁を消したら、その壁に付いた扉も消す
      state.floorPlan.shapes = shapes().filter(function (s) { return !(s.wallId && s.wallId === id); });
    }
    sel = null; save(); render(); paintProps();
  }
  function moveZ(dir) {
    var arr = sel && sel.kind === 'bay' ? bays() : shapes(); if (!sel) return;
    var i = arr.findIndex(function (x) { return x.id === sel.id; }); if (i < 0) return;
    var it = arr.splice(i, 1)[0]; if (dir > 0) arr.push(it); else arr.unshift(it);
    save(); render(); paintProps();
  }
  function toggleLock() { var o = selObj(); if (!o) return; o.locked = !o.locked; save(); render(); paintProps(); }

  // ===== 幾何 =====
  function nearestWall(cx, cy) {
    var best = null;
    walls().forEach(function (w) {
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1, len2 = dx * dx + dy * dy;
      var t = len2 ? (((cx - w.x1) * dx + (cy - w.y1) * dy) / len2) : 0; t = clamp(t, 0, 1);
      var px = w.x1 + dx * t, py = w.y1 + dy * t, d = Math.hypot(cx - px, cy - py);
      if (!best || d < best.d) best = { w: w, t: t, d: d };
    });
    return best;
  }
  function snapWall(sx, sy, ex, ey) {
    var f = fp();
    sx = clamp(Math.round(sx), 0, f.cols); sy = clamp(Math.round(sy), 0, f.rows);
    var dx = Math.round(ex) - sx, dy = Math.round(ey) - sy;
    if (dx === 0 && dy === 0) return { x1: sx, y1: sy, x2: sx, y2: sy };
    var ang = Math.atan2(dy, dx), step = Math.PI / 12, sa = Math.round(ang / step) * step, len = Math.sqrt(dx * dx + dy * dy);
    return { x1: sx, y1: sy, x2: clamp(Math.round(sx + Math.cos(sa) * len), 0, f.cols), y2: clamp(Math.round(sy + Math.sin(sa) * len), 0, f.rows) };
  }
  function cellAt(e) { var g = document.getElementById('pf-grid'), r = g.getBoundingClientRect(); return { cx: (e.clientX - r.left) / cell, cy: (e.clientY - r.top) / cell }; }

  // ===== ポインタ =====
  function onPointerDown(e) {
    var t = e.target, c = cellAt(e);
    var lk = t.getAttribute && t.getAttribute('data-lock');
    if (lk) { var pr = lk.split('|'); sel = { kind: pr[0], id: pr[1] }; var o = selObj(); if (o) { o.locked = !o.locked; } save(); render(); paintProps(); e.preventDefault(); return; }

    if (tool === 'flat' || tool === 'lift' || tool === 'building') { e.preventDefault(); placeAt(c.cx, c.cy); return; }
    if (tool === 'door' || tool === 'shutter') { e.preventDefault(); placeAttach(tool, c.cx, c.cy); return; }
    if (tool === 'wall') {
      e.preventDefault();
      var w = { id: uid('sh'), type: 'wall', x1: Math.round(c.cx), y1: Math.round(c.cy), x2: Math.round(c.cx), y2: Math.round(c.cy) };
      shapes().push(w); sel = { kind: 'shape', id: w.id }; drag = { type: 'wallnew', w: w, sx: c.cx, sy: c.cy };
      bind(); render(); paintProps(); return;
    }
    // 選択ツール
    var at = t.closest && (t.closest('[data-attach]') ? t.closest('[data-attach]').getAttribute('data-attach') : null);
    if (at) { var a = getShape(at); if (a) { sel = { kind: 'shape', id: a.id }; drag = { type: 'attach', a: a }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    var wpt = t.getAttribute && t.getAttribute('data-wpt');
    if (wpt) { var p2 = wpt.split('|'); var ws = getShape(p2[0]); if (ws) { sel = { kind: 'shape', id: ws.id }; drag = { type: 'wallpt', w: ws, n: p2[1] }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    var wl = t.getAttribute && t.getAttribute('data-wall');
    if (wl) { sel = { kind: 'shape', id: wl }; render(); paintProps(); return; }
    var rz = t.getAttribute && t.getAttribute('data-rz');
    if (rz) { var b = getBay(rz); if (b) { sel = { kind: 'bay', id: b.id }; drag = { type: 'resize', o: b }; bind(); } e.preventDefault(); return; }
    var rzs = t.getAttribute && t.getAttribute('data-rzs');
    if (rzs) { var sb = getShape(rzs); if (sb) { sel = { kind: 'shape', id: sb.id }; drag = { type: 'resize', o: sb }; bind(); } e.preventDefault(); return; }
    var pb = t.closest && t.closest('.pf-pit');
    if (pb) { var bb = getBay(pb.getAttribute('data-bay')); if (bb && !bb.locked) { sel = { kind: 'bay', id: bb.id }; drag = { type: 'move', o: bb, ox: c.cx - bb.gx, oy: c.cy - bb.gy }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    var bd = t.closest && t.closest('.pf-building');
    if (bd) { var ss = getShape(bd.getAttribute('data-shape')); if (ss && !ss.locked) { sel = { kind: 'shape', id: ss.id }; drag = { type: 'move', o: ss, ox: c.cx - ss.gx, oy: c.cy - ss.gy }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    sel = null; render(); paintProps();
  }
  function bind() { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }
  function unbind() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
  function onMove(e) {
    if (!drag) return; var f = fp(), c = cellAt(e);
    if (drag.type === 'move') { var o = drag.o; o.gx = clamp(Math.round(c.cx - drag.ox), 0, f.cols - o.gw); o.gy = clamp(Math.round(c.cy - drag.oy), 0, f.rows - o.gh); }
    else if (drag.type === 'resize') { var r = drag.o; r.gw = clamp(Math.round(c.cx) - r.gx, 1, f.cols - r.gx); r.gh = clamp(Math.round(c.cy) - r.gy, 1, f.rows - r.gy); }
    else if (drag.type === 'attach') { var nw = nearestWall(c.cx, c.cy); if (nw) { drag.a.wallId = nw.w.id; drag.a.t = nw.t; } }
    else if (drag.type === 'wallpt') { var w = drag.w; var ot = (drag.n === '1') ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 }; var sn = snapWall(ot.x, ot.y, c.cx, c.cy); if (drag.n === '1') { w.x1 = sn.x2; w.y1 = sn.y2; } else { w.x2 = sn.x2; w.y2 = sn.y2; } }
    else if (drag.type === 'wallnew') { var s2 = snapWall(drag.sx, drag.sy, c.cx, c.cy); drag.w.x1 = s2.x1; drag.w.y1 = s2.y1; drag.w.x2 = s2.x2; drag.w.y2 = s2.y2; }
    render();
  }
  function onUp() {
    if (drag) {
      if (drag.type === 'wallnew' && drag.w.x1 === drag.w.x2 && drag.w.y1 === drag.w.y2) { var i = shapes().findIndex(function (s) { return s.id === drag.w.id; }); if (i >= 0) shapes().splice(i, 1); }
      drag = null; save(); render(); paintProps(); if (tool === 'wall') setTool('select');
    }
    unbind();
  }

  // サンプル工場（建物の外壁＋シャッター＋PIT＝1列5枚を2列に並べる）を一発で入れる
  function loadSample() {
    if (!confirm('サンプルの工場レイアウトを読み込みます。今の配置は置き換わります。よろしいですか？')) return;
    var W = 20, H = 12, m = 0.4;
    var f = fp(); f.cols = W; f.rows = H;
    f.shapes = [
      { id: 'w_top', type: 'wall', x1: m, y1: m, x2: W - m, y2: m },
      { id: 'w_bot', type: 'wall', x1: m, y1: H - m, x2: W - m, y2: H - m },
      { id: 'w_left', type: 'wall', x1: m, y1: m, x2: m, y2: H - m },
      { id: 'w_right', type: 'wall', x1: W - m, y1: m, x2: W - m, y2: H - m },
      { id: 'sh_in', type: 'shutter', wallId: 'w_bot', t: 0.46 }
    ];
    var xs = [1.5, 6, 10.5, 15];
    var list = [];
    xs.forEach(function (x, i) { list.push({ id: uid('bay'), name: (i === 3 ? 'リフト' : 'PIT ' + (i + 1)), icon: '', kind: (i === 3 ? 'lift' : 'flat'), division: 'div1', gx: x, gy: 1.4, gw: 3, gh: 4 }); });
    xs.forEach(function (x, i) { list.push({ id: uid('bay'), name: (i === 0 ? 'リフト' : 'PIT ' + (i + 4)), icon: '', kind: (i === 0 ? 'lift' : 'flat'), division: 'div2', gx: x, gy: 6.6, gw: 3, gh: 4 }); });
    state.bays = list; sel = null; save();
    var sc = document.getElementById('pf-scale'); if (sc) sc.value = W;
    var lb = document.getElementById('pf-scale-lb'); if (lb) lb.textContent = '横' + W + 'マス';
    render(); paintProps();
  }

  window.PitFloorEditor = {
    open: open, close: close, setTool: setTool, edit: edit, removeSel: removeSel,
    toFront: function () { moveZ(1); }, toBack: function () { moveZ(-1); }, toggleLock: toggleLock,
    loadSample: loadSample,
    countPits: function () { ensureModel(); return bays().length; }
  };
  console.log('[pit-floor] v3 ready');
})();
