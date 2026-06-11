/* ========================================
   pit-floor.js  -  PIT配置図エディタ（v0.46.0 / 第1段）
   ----------------------------------------
   設定画面に「工場の簡易平面図」を描くエディタを提供する。
   ・PIT枠（箱）を置く／ドラッグで移動／右下で大きさ変更／クリックで選択
   ・選択中の枠：名前・アイコン・課(共通/1課/2課)・削除
   ・壁/通路の線：追加して端点をドラッグ
   座標は全てキャンバスに対する % （0〜100）。解像度に依存しないので
   後で Pitリスト本体・PiP窓でもそのまま同じ図を描ける。
   保存は state.bays / state.floorPlan を変更して PitDB.save。
   ======================================== */
(function () {
  'use strict';

  var MOUNT = null;     // マウント先コンテナID
  var sel = null;       // 選択中 { kind:'frame'|'line', id }
  var drag = null;      // ドラッグ中の状態

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function bays() { if (!Array.isArray(state.bays)) state.bays = []; return state.bays; }
  function shapes() {
    if (!state.floorPlan || typeof state.floorPlan !== 'object') state.floorPlan = { shapes: [] };
    if (!Array.isArray(state.floorPlan.shapes)) state.floorPlan.shapes = [];
    return state.floorPlan.shapes;
  }
  function save() { if (window.PitDB) PitDB.save(true); }
  function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function divColor(d) { return d === 'div1' ? '#1db97a' : (d === 'div2' ? '#ec4899' : '#64748b'); }
  function divLabel(d) { return d === 'div1' ? '1課' : (d === 'div2' ? '2課' : '共通'); }
  function findBay(id) { return bays().find(function (b) { return b.id === id; }); }
  function findShape(id) { return shapes().find(function (s) { return s.id === id; }); }

  // 座標の無い既存枠を自動で横並び配置
  function ensureDefaults() {
    var bs = bays();
    bs.forEach(function (b, idx) {
      if (typeof b.x !== 'number') {
        var col = idx % 4, row = Math.floor(idx / 4);
        b.x = 5 + col * 23; b.y = 8 + row * 30; b.w = 20; b.h = 26;
      }
      if (b.division == null) b.division = '';
    });
  }

  function mount(containerId) {
    MOUNT = containerId;
    ensureDefaults();
    render();
  }

  function host() { return document.getElementById(MOUNT); }

  function render() {
    var h = host(); if (!h) return;
    var html = '';
    html += '<div class="pf-toolbar">';
    html += '<button class="vh-btn" onclick="PitFloorEditor.addFrame()">＋ PIT枠</button>';
    html += '<button class="vh-btn" onclick="PitFloorEditor.addLine()">＋ 壁・通路線</button>';
    html += '<span class="pf-tip">枠＝ドラッグで移動／右下角で大きさ変更／クリックで選択。線＝両端の●をドラッグ。</span>';
    html += '</div>';
    html += '<div class="pf-canvas" id="pf-canvas">';
    html += '<svg class="pf-svg" id="pf-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>';
    html += '</div>';
    html += '<div class="pf-props" id="pf-props"></div>';
    h.innerHTML = html;
    paint();
    paintProps();
    var cv = document.getElementById('pf-canvas');
    if (cv) cv.addEventListener('pointerdown', onPointerDown);
  }

  // 枠と線を描き直す
  function paint() {
    var cv = document.getElementById('pf-canvas'); if (!cv) return;
    // 既存の枠DOMを除去（svgは残す）
    Array.prototype.slice.call(cv.querySelectorAll('.pf-frame')).forEach(function (n) { n.remove(); });
    bays().forEach(function (b) {
      var d = document.createElement('div');
      d.className = 'pf-frame' + (sel && sel.kind === 'frame' && sel.id === b.id ? ' sel' : '');
      d.style.left = b.x + '%'; d.style.top = b.y + '%';
      d.style.width = b.w + '%'; d.style.height = b.h + '%';
      d.style.borderColor = divColor(b.division);
      d.setAttribute('data-bay', b.id);
      d.innerHTML =
        '<span class="pf-frame-name">' + esc(b.icon || '') + ' ' + esc(b.name || '') + '</span>' +
        '<span class="pf-frame-div" style="background:' + divColor(b.division) + '">' + divLabel(b.division) + '</span>' +
        '<span class="pf-resize" data-resize="' + b.id + '"></span>';
      cv.appendChild(d);
    });
    var svg = document.getElementById('pf-svg'); if (!svg) return;
    var s = '';
    shapes().forEach(function (sh) {
      var on = (sel && sel.kind === 'line' && sel.id === sh.id);
      var col = on ? '#f59e0b' : '#94a3b8';
      s += '<line x1="' + sh.x1 + '" y1="' + sh.y1 + '" x2="' + sh.x2 + '" y2="' + sh.y2 + '"'
        + ' stroke="' + col + '" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"'
        + ' data-line="' + sh.id + '"/>';
      s += '<circle cx="' + sh.x1 + '" cy="' + sh.y1 + '" r="2.2" fill="#fff" stroke="' + col + '"'
        + ' stroke-width="1.2" vector-effect="non-scaling-stroke" data-lpt="' + sh.id + '|1"/>';
      s += '<circle cx="' + sh.x2 + '" cy="' + sh.y2 + '" r="2.2" fill="#fff" stroke="' + col + '"'
        + ' stroke-width="1.2" vector-effect="non-scaling-stroke" data-lpt="' + sh.id + '|2"/>';
    });
    svg.innerHTML = s;
  }

  // 選択中アイテムの編集パネル
  function paintProps() {
    var p = document.getElementById('pf-props'); if (!p) return;
    if (sel && sel.kind === 'frame') {
      var b = findBay(sel.id);
      if (!b) { sel = null; p.innerHTML = ''; return; }
      var opt = function (v, lb) { return '<option value="' + v + '"' + (b.division === v ? ' selected' : '') + '>' + lb + '</option>'; };
      p.innerHTML =
        '<div class="pf-prop-row"><span class="pf-prop-t">選択中の枠</span>' +
        '<input class="pf-in pf-in-icon" maxlength="2" value="' + esc(b.icon || '') + '" title="アイコン" onchange="PitFloorEditor.edit(\'icon\',this.value)">' +
        '<input class="pf-in pf-in-name" value="' + esc(b.name || '') + '" placeholder="枠の名前" onchange="PitFloorEditor.edit(\'name\',this.value)">' +
        '<select class="pf-in" onchange="PitFloorEditor.edit(\'division\',this.value)">' + opt('', '共通') + opt('div1', '1課') + opt('div2', '2課') + '</select>' +
        '<button class="vh-btn danger" onclick="PitFloorEditor.removeFrame()">🗑 枠を削除</button>' +
        '</div>';
    } else if (sel && sel.kind === 'line') {
      p.innerHTML =
        '<div class="pf-prop-row"><span class="pf-prop-t">選択中の線</span>' +
        '<span class="pf-tip">両端の●をドラッグして向き・長さを調整</span>' +
        '<button class="vh-btn danger" onclick="PitFloorEditor.removeLine()">🗑 線を削除</button>' +
        '</div>';
    } else {
      p.innerHTML = '<div class="pf-prop-row pf-prop-empty">枠か線をクリックすると、ここで名前・課・削除ができます。</div>';
    }
  }

  // ===== 追加・削除・編集 =====
  function addFrame() {
    var n = bays().length + 1;
    var b = { id: uid('bay'), name: 'PIT ' + n, icon: '🛠️', note: '', x: 38, y: 38, w: 22, h: 26, division: '' };
    // 既存と重ならないよう少しずらす
    var off = (bays().length % 5) * 3;
    b.x = clamp(38 + off, 0, 100 - b.w); b.y = clamp(38 + off, 0, 100 - b.h);
    bays().push(b);
    sel = { kind: 'frame', id: b.id };
    save(); paint(); paintProps();
  }
  function addLine() {
    var sh = { id: uid('ln'), type: 'line', x1: 30, y1: 50, x2: 70, y2: 50 };
    shapes().push(sh);
    sel = { kind: 'line', id: sh.id };
    save(); paint(); paintProps();
  }
  function removeFrame() {
    if (!sel || sel.kind !== 'frame') return;
    var i = bays().findIndex(function (b) { return b.id === sel.id; });
    if (i >= 0) bays().splice(i, 1);
    sel = null; save(); paint(); paintProps();
  }
  function removeLine() {
    if (!sel || sel.kind !== 'line') return;
    var i = shapes().findIndex(function (s) { return s.id === sel.id; });
    if (i >= 0) shapes().splice(i, 1);
    sel = null; save(); paint(); paintProps();
  }
  function edit(field, val) {
    if (!sel || sel.kind !== 'frame') return;
    var b = findBay(sel.id); if (!b) return;
    b[field] = val;
    save(); paint(); paintProps();
  }

  // ===== ドラッグ操作 =====
  function pctFromEvent(e) {
    var cv = document.getElementById('pf-canvas'); var r = cv.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100)
    };
  }

  function onPointerDown(e) {
    var t = e.target;
    // 線の端点
    var pt = t.getAttribute && t.getAttribute('data-lpt');
    if (pt) {
      var parts = pt.split('|'); var sh = findShape(parts[0]);
      if (sh) { sel = { kind: 'line', id: sh.id }; drag = { type: 'lpt', sh: sh, n: parts[1] }; startDrag(e); }
      return;
    }
    // 線そのもの（選択のみ）
    var ln = t.getAttribute && t.getAttribute('data-line');
    if (ln) { sel = { kind: 'line', id: ln }; paint(); paintProps(); return; }
    // 枠のリサイズハンドル
    var rz = t.getAttribute && t.getAttribute('data-resize');
    if (rz) {
      var b = findBay(rz);
      if (b) { sel = { kind: 'frame', id: b.id }; drag = { type: 'resize', b: b }; startDrag(e); }
      return;
    }
    // 枠本体
    var frame = t.closest ? t.closest('.pf-frame') : null;
    if (frame) {
      var bid = frame.getAttribute('data-bay'); var bb = findBay(bid);
      if (bb) {
        sel = { kind: 'frame', id: bb.id };
        var p = pctFromEvent(e);
        drag = { type: 'move', b: bb, offx: p.x - bb.x, offy: p.y - bb.y };
        startDrag(e);
      }
      return;
    }
    // 何もない所＝選択解除
    sel = null; paint(); paintProps();
  }

  function startDrag(e) {
    e.preventDefault();
    paint(); paintProps();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag) return;
    var p = pctFromEvent(e);
    if (drag.type === 'move') {
      drag.b.x = clamp(p.x - drag.offx, 0, 100 - drag.b.w);
      drag.b.y = clamp(p.y - drag.offy, 0, 100 - drag.b.h);
    } else if (drag.type === 'resize') {
      drag.b.w = clamp(p.x - drag.b.x, 6, 100 - drag.b.x);
      drag.b.h = clamp(p.y - drag.b.y, 6, 100 - drag.b.y);
    } else if (drag.type === 'lpt') {
      if (drag.n === '1') { drag.sh.x1 = p.x; drag.sh.y1 = p.y; }
      else { drag.sh.x2 = p.x; drag.sh.y2 = p.y; }
    }
    paint();
  }

  function onPointerUp() {
    if (drag) { drag = null; save(); paintProps(); }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  window.PitFloorEditor = {
    mount: mount,
    addFrame: addFrame,
    addLine: addLine,
    removeFrame: removeFrame,
    removeLine: removeLine,
    edit: edit
  };
  console.log('[pit-floor] ready');
})();
