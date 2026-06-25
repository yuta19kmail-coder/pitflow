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
    h += '<div class="wc-lbls"><span class="l1">部位</span><span class="l2">症状</span><span>補足</span></div>';
    h += '<div class="wc-wheel"><div class="wc-band"></div>'
      + '<div class="wc-col" id="wc-w1"></div><div class="wc-col" id="wc-w2"></div><div class="wc-col" id="wc-w3"></div></div>';
    h += '<div class="wc-build"><div class="wc-prev" id="wc-prev"><small>回して選ぶ…</small></div>'
      + '<button type="button" class="wc-add" onclick="WorkContent.addPhrase()">＋ 入れる</button></div>';
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

  let W1, W2, W3;
  function fill(col, arr) {
    col.innerHTML = '<div class="wc-pad"></div>' + arr.map(function (t, i) { return '<div class="wc-wi" data-i="' + i + '">' + esc(t) + '</div>'; }).join('') + '<div class="wc-pad"></div>';
    col.scrollTop = 0; markCol(col);
  }
  function idxOf(col) { return Math.max(0, Math.round(col.scrollTop / IH)); }
  function itemsOf(col) { return [].slice.call(col.querySelectorAll('.wc-wi')); }
  function markCol(col) { const k = idxOf(col); itemsOf(col).forEach(function (el, i) { el.classList.toggle('on', i === k); }); }
  function valOf(col) { const el = itemsOf(col)[idxOf(col)]; return el ? el.textContent : ''; }
  function symsFor(part) { return cfg().symptoms.filter(function (s) { return s.parts === 'all' || (Array.isArray(s.parts) && s.parts.indexOf(part) >= 0); }); }
  function subsOf(sname) { const s = cfg().symptoms.find(function (x) { return x.name === sname; }); return ['（補足なし）'].concat((s && s.sub) ? s.sub : []); }
  function rebuild2() { if (W2) { fill(W2, symsFor(valOf(W1)).map(function (s) { return s.name; })); rebuild3(); } }
  function rebuild3() { if (W3) fill(W3, subsOf(valOf(W2))); }
  function phrase() {
    const p = valOf(W1), s = valOf(W2), sub = valOf(W3);
    if (!p || !s) return '';
    return p + ' ' + s + ((sub && sub !== '（補足なし）') ? '（' + sub + '）' : '');
  }
  function updPrev() {
    const el = document.getElementById('wc-prev'); if (!el) return;
    const p = phrase();
    el.innerHTML = p ? ('追加：' + esc(p)) : '<small>回して選ぶ…</small>';
  }
  function bindCol(col, after) {
    col.addEventListener('scroll', function () {
      markCol(col); updPrev();
      clearTimeout(col._t);
      col._t = setTimeout(function () { markCol(col); if (after) after(); updPrev(); }, 110);
    });
    col.addEventListener('click', function (e) {
      const el = e.target.closest('.wc-wi'); if (!el) return;
      col.scrollTo({ top: (+el.dataset.i) * IH, behavior: 'smooth' });
    });
  }
  function mount(root) {
    W1 = document.getElementById('wc-w1'); W2 = document.getElementById('wc-w2'); W3 = document.getElementById('wc-w3');
    if (!W1 || !W2 || !W3) return; // 内容セクションが無い画面（modal等）では何もしない
    fill(W1, cfg().parts); rebuild2();
    bindCol(W1, rebuild2); bindCol(W2, rebuild3); bindCol(W3, null);
    updPrev();
    syncChips();   // v0.88.0 既に内容に入っているタグは「押した見た目」で開く
  }
  window.WorkContent = window.WorkContent || {};
  window.WorkContent.builderHtml = builderHtml;
  window.WorkContent.mount = mount;
  window.WorkContent.addPhrase = function () { const p = phrase(); if (p) appendMenu(p); };
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
