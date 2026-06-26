/* ========================================
   work-content.js  -  作業内容テンプレート（症状ホイール＋チップ）／PitFlow v0.70.0
   ----------------------------------------
   新規予約カードの「内容」欄に、時計式の3段ホイール（部位→症状→補足）＋
   単独メモ系のフラットチップを出す。電話しながらクルクル回して内容を組み立て、
   「＋ 入れる」で c.menu（内容テキスト）に1行ずつ追記する。

   データは state.settings.workContent に保持し、設定画面（settings.js）から
   部位・症状・補足・対象部位（組み合わせ/除外）・各チップを自由に編集できる。

   公開：window.WorkContent = {
     builderHtml(), mount(),                       // 新規予約フォーム側
     addPhrase(), chip(btn),                        // フォーム内ボタンから
     settingsCardHtml(), mountSettings(),           // 設定画面側
     wc* （設定編集の各操作）
   }
   ======================================== */
(function () {
  'use strict';

  const IH = 40; // ホイール1行の高さ

  // 既定値（設定が空の時に自動シード。以後は設定画面で編集）
  const DEFAULT = {
    parts: ['エンジン', 'ミッション', 'ブレーキ', 'タイヤ', '足回り', 'エアコン', 'クラッチ', '電装', 'マフラー', 'ボディ/外装'],
    symptoms: [
      { name: '異音', parts: 'all', sub: ['ガタガタ', 'キー', 'ガラガラ', 'ガシャガシャ', 'カラカラ', 'ウィーン'] },
      { name: '漏れ', parts: 'all', sub: ['オイル', 'クーラント(水)', 'ATF', 'ブレーキフルード'] },
      { name: '振動', parts: 'all', sub: ['アイドリング中', '走行中', 'ブレーキ時'] },
      { name: '調子が悪い', parts: 'all', sub: [] },
      { name: '警告灯点灯', parts: ['エンジン', '電装', 'ブレーキ', 'エアコン'], sub: ['エンジン', 'ABS', 'エアバッグ', 'バッテリー', '油圧'] },
      { name: '冷風が出ない', parts: ['エアコン'], sub: ['全く出ない', 'たまに', 'ぬるい'] },
      { name: '効きが悪い', parts: ['ブレーキ', 'クラッチ'], sub: ['甘い', '奥まで踏む', '引きずり'] },
      { name: '滑る', parts: ['ミッション', 'クラッチ'], sub: [] },
      { name: 'すり減り/パンク', parts: ['タイヤ'], sub: ['溝なし', '片減り', 'パンク'] },
      { name: 'ガタつき', parts: ['足回り', 'タイヤ'], sub: [] },
      { name: '白煙/黒煙', parts: ['エンジン', 'マフラー'], sub: ['白煙', '黒煙'] },
      { name: '凹み/ヒビ/割れ/傷', parts: ['ボディ/外装'], sub: ['凹み', 'ヒビ', '割れ', '傷'] }
    ],
    chipGroups: [
      { label: '🛠 作業・依頼', fill: false, items: ['点検', '車検も一緒に', 'テスター診断', '予防整備', 'トルコン太郎（ATF交換）', 'タイベル交換', 'コーティング', '板金'] },
      { label: '💬 来店・見積・連絡', fill: false, items: ['概算伝え済み', '点検料伝え済み', '他店見積あり', 'ディーラー見積あり', '現車見せに来店', 'ディーラー保証あり', '連絡は別の人へ'] },
      { label: '📦 部品 / 🚩 条件', fill: false, items: ['中古パーツ', 'リビルト品', '社外品', '持ち込み', 'もしかしたら無理かも', 'パーツ無いかも', '長期休み中の預かりOK', '直るなら依頼'] },
      { label: '⏳ 預かり期間', fill: false, items: ['当日仕上げ', '1week', '2week', '直り次第'] },
      { label: '🚗 車両情報（押すと「：」が入る→数値）', fill: true, items: ['車検満了日：', '年式：', '走行距離：', '購入時期：'] }
    ]
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cfg() {
    if (!state.settings) state.settings = {};
    const wc = state.settings.workContent;
    if (!wc || !Array.isArray(wc.parts) || !Array.isArray(wc.symptoms) || !Array.isArray(wc.chipGroups)) {
      state.settings.workContent = JSON.parse(JSON.stringify(DEFAULT));
    }
    return state.settings.workContent;
  }
  function save() { try { if (window.PitDB) PitDB.save(); } catch (e) {} }

  // 内容テキストエリア（c.menu）へ1行追記
  function appendMenu(t) {
    const ta = document.querySelector('textarea.cf-input[data-key="menu"]');
    if (!ta) return;
    const cur = (ta.value || '').replace(/\n+$/, '');
    ta.value = cur ? (cur + '\n' + t) : t;
    ta.dispatchEvent(new Event('input', { bubbles: true })); // 既存の自動保存を発火
    ta.focus();
  }

  // v0.88.0 タグチップのトグル用：内容(c.menu)テキストエリアの行操作
  function _menuTA(){ return document.querySelector('textarea.cf-input[data-key="menu"]'); }
  function _menuHasLine(t){ var ta=_menuTA(); if(!ta) return false; return (ta.value||'').split('\n').some(function(l){ return l.trim()===t; }); }
  function removeMenuLine(t){
    var ta=_menuTA(); if(!ta) return;
    var removed=false;
    var out=(ta.value||'').split('\n').filter(function(l){ if(!removed && l.trim()===t){ removed=true; return false; } return true; });
    ta.value=out.join('\n').replace(/\n+$/,'');
    ta.dispatchEvent(new Event('input',{bubbles:true}));
  }
  // タグチップ（fillでないもの）の押下状態を、いま内容に入っているかで同期（再描画後も保つ）
  function syncChips(){
    var ta=_menuTA(); if(!ta) return;
    var lines=(ta.value||'').split('\n').map(function(l){ return l.trim(); });
    [].slice.call(document.querySelectorAll('.wc-chip[data-fill="0"]')).forEach(function(b){
      b.classList.toggle('wc-on', lines.indexOf(b.textContent.trim())>=0);
    });
  }

  // =========================================
  // 新規予約フォーム側：ビルダー
  // =========================================
  function builderHtml() {
    const c = cfg();
    let h = '<div class="wc-tpl">';
    // v0.90.0 内容テンプレ＝ボタンクリックで右カラムに大きく開く（クリックで開閉・固定）。3列一覧（部位→症状→補足）。
    h += '<div class="wc-trigrow"><button type="button" class="wc-trigger" onclick="WorkContent.togglePanel(this)">🧰 内容テンプレを選ぶ<span class="wc-arr">クリックで右に開く ▸</span></button></div>';
    h += '<div class="wc-panel" id="wc-panel">';
    h += '<div class="wc-panel-h"><span>🧰 内容テンプレ（部位 → 症状 → 補足）</span><button type="button" class="wc-x" onclick="WorkContent.closePanel()" title="閉じる">✕</button></div>';
    h += '<div class="wc-cols">'
       + '<div class="wc-listcol"><div class="wc-lh">部位</div><div class="wc-list" id="wc-c1"></div></div>'
       + '<div class="wc-listcol"><div class="wc-lh">症状</div><div class="wc-list" id="wc-c2"></div></div>'
       + '<div class="wc-listcol"><div class="wc-lh">補足</div><div class="wc-list" id="wc-c3"></div></div>'
       + '</div>';
    h += '<div class="wc-foot"><div class="wc-prev2" id="wc-prev2">症状を選んでください</div>'
       + '<button type="button" class="wc-ins" id="wc-ins" onclick="WorkContent.insert()" disabled>挿入する</button></div>';
    h += '</div>';
    // タグチップ群（従来どおりインライン・内容欄の下に続く）
    c.chipGroups.forEach(function (g) {
      h += '<div class="wc-flat-h">' + esc(g.label) + '</div><div class="wc-chips">';
      g.items.forEach(function (it) {
        h += '<button type="button" class="wc-chip' + (g.fill ? ' fill' : '') + '" data-fill="' + (g.fill ? 1 : 0) + '" onclick="WorkContent.chip(this)">' + esc(it) + '</button>';
      });
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  // ===== v0.89.0 テンプレ3列一覧（部位/症状/補足）＝クリックで選択（緑アクティブ）→挿入 =====
  var _selP = '', _selS = '', _selSub = '';
  function symsFor(part) { return cfg().symptoms.filter(function (s) { return s.parts === 'all' || (Array.isArray(s.parts) && s.parts.indexOf(part) >= 0); }); }
  function subsOf(sname) { var s = cfg().symptoms.find(function (x) { return x.name === sname; }); return (s && s.sub) ? s.sub : []; }
  function _qq(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function _li(text, on, onclick, dim) { return '<div class="wc-li' + (on ? ' on' : '') + (dim ? ' dim' : '') + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' + esc(text) + '</div>'; }
  function _renderC1() { var el = document.getElementById('wc-c1'); if (!el) return; el.innerHTML = cfg().parts.map(function (p) { return _li(p, p === _selP, "WorkContent.pickPart('" + _qq(p) + "')"); }).join(''); }
  function _renderC2() { var el = document.getElementById('wc-c2'); if (!el) return; var list = _selP ? symsFor(_selP) : cfg().symptoms; el.innerHTML = list.map(function (s) { return _li(s.name, s.name === _selS, "WorkContent.pickSym('" + _qq(s.name) + "')"); }).join(''); }
  function _renderC3() { var el = document.getElementById('wc-c3'); if (!el) return; var subs = _selS ? subsOf(_selS) : []; if (!subs.length) { el.innerHTML = _li(_selS ? '（補足なし）' : '症状を選ぶと出ます', false, '', true); return; } el.innerHTML = subs.map(function (x) { return _li(x, x === _selSub, "WorkContent.pickSub('" + _qq(x) + "')"); }).join(''); }
  function _phrase() { if (!_selS) return ''; return (_selP ? _selP + ' ' : '') + _selS + (_selSub ? '（' + _selSub + '）' : ''); }
  function _updPrev2() { var el = document.getElementById('wc-prev2'); var ins = document.getElementById('wc-ins'); var p = _phrase(); if (el) el.innerHTML = p ? ('追加：<b>' + esc(p) + '</b>') : '症状を選んでください'; if (ins) ins.disabled = !p; }
  function renderTpl() { _renderC1(); _renderC2(); _renderC3(); _updPrev2(); }

  function mount(root) {
    if (!document.getElementById('wc-c1')) return; // 内容セクションが無い画面（modal等）では何もしない
    _selP = ''; _selS = ''; _selSub = '';
    renderTpl();
    syncChips();   // v0.88.0 既に内容に入っているタグは「押した見た目」で開く
  }
  window.WorkContent = window.WorkContent || {};
  window.WorkContent.builderHtml = builderHtml;
  window.WorkContent.mount = mount;
  window.WorkContent.pickPart = function (p) { _selP = (_selP === p) ? '' : p; if (_selP && !symsFor(_selP).some(function (s) { return s.name === _selS; })) { _selS = ''; _selSub = ''; } renderTpl(); };
  window.WorkContent.pickSym = function (s) { _selS = (_selS === s) ? '' : s; _selSub = ''; _renderC2(); _renderC3(); _updPrev2(); };
  window.WorkContent.pickSub = function (x) { _selSub = (_selSub === x) ? '' : x; _renderC3(); _updPrev2(); };
  window.WorkContent.insert = function () { var p = _phrase(); if (!p) return; appendMenu(p); _selS = ''; _selSub = ''; _renderC2(); _renderC3(); _updPrev2(); };

  // v0.90.0 パネル開閉（クリックで固定）。開いた時は右カラム(.cfp-side)にぴったり重ねて「右カラムに大きく表示」されているように見せる。
  // v0.97.2 パネルは「トリガーボタンの上下中央」に合わせて配置し、左カラム(.cfp-main)スクロールに追従する。
  function _placePanel(p){
    var btn = document.querySelector('.wc-trigger');
    var br  = btn ? btn.getBoundingClientRect() : null;
    var side = document.querySelector('.cfp-side');
    var clamp = function(top, hh){ return Math.max(8, Math.min(top, window.innerHeight - hh - 8)); };
    if (side){
      var r = side.getBoundingClientRect();
      var hh = Math.round(r.height * 0.5);   // 大きさ（高さ約50%）は据え置き
      var top = br ? (br.top + br.height / 2 - hh / 2) : (r.top + (r.height - hh) / 2);
      p.style.right = ''; p.style.bottom = '';
      p.style.left = r.left + 'px'; p.style.top = clamp(top, hh) + 'px'; p.style.width = r.width + 'px'; p.style.height = hh + 'px';
    } else {
      // 右カラムが無い画面（既存カードのモーダル等）＝ボタンの高さ中央・画面右に出すフォールバック
      var hh2 = Math.round(window.innerHeight * 0.5);
      var top2 = br ? (br.top + br.height / 2 - hh2 / 2) : (window.innerHeight * 0.25);
      p.style.left = ''; p.style.bottom = ''; p.style.right = '24px'; p.style.top = clamp(top2, hh2) + 'px'; p.style.width = 'min(420px, 92vw)'; p.style.height = hh2 + 'px';
    }
  }
  // 左カラムスクロール／リサイズでパネル位置を追従させる（開いている間だけ）
  var _wcReposition = null;
  function _bindReposition(p){
    _unbindReposition();
    _wcReposition = function(){ if (p.classList.contains('open')) _placePanel(p); else _unbindReposition(); };
    var main = document.querySelector('.cfp-main');
    if (main) main.addEventListener('scroll', _wcReposition, { passive: true });
    window.addEventListener('resize', _wcReposition);
    window.addEventListener('scroll', _wcReposition, { passive: true });
  }
  function _unbindReposition(){
    if (!_wcReposition) return;
    var main = document.querySelector('.cfp-main');
    if (main) main.removeEventListener('scroll', _wcReposition);
    window.removeEventListener('resize', _wcReposition);
    window.removeEventListener('scroll', _wcReposition);
    _wcReposition = null;
  }
  window.WorkContent.togglePanel = function (btn) {
    var p = document.getElementById('wc-panel'); if (!p) return;
    if (p.classList.contains('open')) { p.classList.remove('open'); if (btn) btn.classList.remove('on'); _unbindReposition(); return; }
    p.style.right = ''; _placePanel(p);
    p.classList.add('open');
    if (btn) btn.classList.add('on');
    _bindReposition(p);
    renderTpl();
  };
  window.WorkContent.closePanel = function () {
    var p = document.getElementById('wc-panel'); if (p) p.classList.remove('open');
    var b = document.querySelector('.wc-trigger'); if (b) b.classList.remove('on');
    _unbindReposition();
  };
  // v0.88.0 タグチップ＝トグル。押すと内容に入り「押した見た目(wc-on)」に／もう一度押すと内容から消えて戻る。
  //   ※「車検満了日：」等の fill チップは後から値を打つので従来どおり挿入のみ。
  window.WorkContent.chip = function (btn) {
    if (!btn) return;
    var t = btn.textContent.trim();
    if (btn.dataset.fill === '1'){ appendMenu(t); return; }
    if (_menuHasLine(t)){ removeMenuLine(t); btn.classList.remove('wc-on'); }
    else { appendMenu(t); btn.classList.add('wc-on'); }
  };
  window.WorkContent.syncChips = syncChips;

  // =========================================
  // 設定画面側：編集UI
  // =========================================
  function settingsCardHtml() {
    return '<div class="ps-card"><div class="ps-h">🧰 作業内容テンプレート（症状ホイール）</div>'
      + '<div class="ps-desc">新規予約の「内容」で使う <b>部位・症状・補足</b>（時計式ホイール）と <b>各チップ</b> を編集します。症状は「対象部位」を限定でき、変な組み合わせ（例：エンジンに冷風が出ない）を自動で出さなくできます。</div>'
      + '<div id="wc-settings"></div></div>';
  }
  function inp(val, ph, oninput, cls, w) {
    return '<input class="wc-i ' + (cls || '') + '" ' + (w ? 'style="width:' + w + '" ' : '') + 'value="' + esc(val) + '" placeholder="' + esc(ph || '') + '" ' + oninput + '>';
  }
  function renderEditor() {
    const box = document.getElementById('wc-settings'); if (!box) return;
    const c = cfg();
    let h = '';

    // 部位
    h += '<div class="wc-s-h">🔧 部位<button class="wc-s-add" onclick="WorkContent.wcAddPart()">＋ 追加</button></div>';
    h += '<div class="wc-s-chips">';
    c.parts.forEach(function (p, i) {
      h += '<span class="wc-s-chip">' + esc(p) + '<button onclick="WorkContent.wcDelPart(' + i + ')">✕</button></span>';
    });
    h += '</div>';

    // 症状
    h += '<div class="wc-s-h" style="margin-top:14px">⚠ 症状（対象部位・補足）<button class="wc-s-add" onclick="WorkContent.wcAddSym()">＋ 追加</button></div>';
    h += '<div class="wc-s-syms">';
    c.symptoms.forEach(function (s, i) {
      const all = (s.parts === 'all');
      h += '<div class="wc-s-sym">';
      h += '<div class="wc-s-row">' + inp(s.name, '症状名', 'onchange="WorkContent.wcSymName(' + i + ',this.value)"', 'name', '8em');
      h += '<select class="wc-i" onchange="WorkContent.wcSymScope(' + i + ',this.value)"><option value="all"' + (all ? ' selected' : '') + '>全部位</option><option value="some"' + (all ? '' : ' selected') + '>限定</option></select>';
      if (!all) h += inp((s.parts || []).join('、'), '対象部位（、区切り）', 'onchange="WorkContent.wcSymParts(' + i + ',this.value)"', 'parts', '14em');
      h += '<button class="wc-s-del" onclick="WorkContent.wcDelSym(' + i + ')">✕ 削除</button></div>';
      h += '<div class="wc-s-row"><span class="wc-s-lab">補足</span>' + inp((s.sub || []).join('、'), '補足（、区切り・任意）', 'onchange="WorkContent.wcSymSub(' + i + ',this.value)"', 'sub', '100%') + '</div>';
      h += '</div>';
    });
    h += '</div>';

    // チップ群
    c.chipGroups.forEach(function (g, gi) {
      h += '<div class="wc-s-h" style="margin-top:14px">' + esc(g.label) + '<button class="wc-s-add" onclick="WorkContent.wcAddChip(' + gi + ')">＋ 追加</button></div>';
      h += '<div class="wc-s-chips">';
      g.items.forEach(function (it, ii) {
        h += '<span class="wc-s-chip">' + esc(it) + '<button onclick="WorkContent.wcDelChip(' + gi + ',' + ii + ')">✕</button></span>';
      });
      h += '</div>';
    });

    box.innerHTML = h;
  }
  function mountSettings() { renderEditor(); }

  // ---- 編集操作（すべて cfg() を書き換え→保存→再描画）----
  const W = window.WorkContent;
  W.settingsCardHtml = settingsCardHtml;
  W.mountSettings = mountSettings;
  W.wcAddPart = function () { const v = (prompt('追加する部位名は？') || '').trim(); if (!v) return; cfg().parts.push(v); save(); renderEditor(); };
  W.wcDelPart = function (i) { cfg().parts.splice(i, 1); save(); renderEditor(); };
  W.wcAddSym = function () { const v = (prompt('追加する症状名は？') || '').trim(); if (!v) return; cfg().symptoms.push({ name: v, parts: 'all', sub: [] }); save(); renderEditor(); };
  W.wcDelSym = function (i) { const s = cfg().symptoms[i]; if (!confirm('症状「' + (s ? s.name : '') + '」を削除しますか？')) return; cfg().symptoms.splice(i, 1); save(); renderEditor(); };
  W.wcSymName = function (i, v) { v = (v || '').trim(); if (v) { cfg().symptoms[i].name = v; save(); } };
  W.wcSymScope = function (i, v) { cfg().symptoms[i].parts = (v === 'all') ? 'all' : []; save(); renderEditor(); };
  W.wcSymParts = function (i, v) { cfg().symptoms[i].parts = String(v || '').split(/[、,]/).map(function (x) { return x.trim(); }).filter(Boolean); save(); };
  W.wcSymSub = function (i, v) { cfg().symptoms[i].sub = String(v || '').split(/[、,]/).map(function (x) { return x.trim(); }).filter(Boolean); save(); };
  W.wcAddChip = function (gi) { const v = (prompt('追加するチップの文言は？') || '').trim(); if (!v) return; cfg().chipGroups[gi].items.push(v); save(); renderEditor(); };
  W.wcDelChip = function (gi, ii) { cfg().chipGroups[gi].items.splice(ii, 1); save(); renderEditor(); };

  console.log('[work-content] ready');
})();
