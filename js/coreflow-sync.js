/* ============================================
   coreflow-sync.js  ―  同期ランプ（全アプリ共通）
   v1.0（2026-08-01）：PitFlow で作った「同期中／同期済み／受信／保存エラー」の
     ランプを、CoreFlow系の他アプリにもそのまま持ってくるための共通部品。

   ◎ 何をするもの
     画面のどこかにある同期ランプ（.sync-indicator）の色と文字を、
     いまの保存の状態に合わせて出し分ける。
       ・同期済み   … 書き終わって、みんなと同じ状態（緑・脈打つ）
       ・同期中     … クラウドへ書いている最中（黄・点滅）
       ・受信       … 他の人の変更が入ってきた（青くひと呼吸）
       ・オフライン … ネットが切れている（赤・止まる）
       ・保存エラー … 書き込みに失敗した（赤・点滅）
       ・キャッシュ … サーバー未確認の表示（黄）※CarFlow の従来表示を引き継ぐ用
     クリックすると、いつ同期したかを教える。

   ◎ アプリ側は何もしなくていい
     Firestore の読み書きそのものに相乗りするので、**各アプリの保存処理は無改修**。
     具体的には set / update / delete / add / batch.commit と onSnapshot に
     薄い皮をかぶせて、書き始め・書き終わり・失敗・受信を拾っている。

   ◎ 置き場所のルール
     本体は `_shared\coreflow-sync.js` だけ。各アプリの js\ にあるのは配られたコピー。
     直す時は _shared を直して sync-shared.ps1 を走らせる（?v= も自動で上がる）。

   ⚠ 読み込む場所：firebase の読み込みより後、かつアプリ本体のJSより後ろに置く。
      （CarFlow のように自前の setSyncStatus を持つアプリを上書きするため）
   ============================================ */
(function (w, d) {
  'use strict';
  if (w.CFSync) return;

  var LABEL = {
    idle:    '同期済み',
    saving:  '同期中',
    recv:    '受信',
    offline: 'オフライン',
    error:   '保存エラー',
    cache:   'キャッシュ',
    local:   '端末保存'
  };

  var _state   = 'idle';   // idle | saving | recv | offline | error | cache | local
  var _lastAt  = 0;        // 最後に同期できた時刻
  var _lastSave= 0;        // 最後に自分が書き終わった時刻（自分の変更を「受信」と誤検知しないため）
  var _pending = 0;        // 書いている最中の数
  var _tRecv   = null;

  /* ---------- ランプの場所（アプリごとに id が違うので順に探す） ---------- */
  function lamp() {
    return d.getElementById('sync-indicator') ||
           d.getElementById('sync-ind') ||
           d.querySelector('.sync-indicator');
  }

  /* ---------- 見た目（アプリ側のCSSを触らずに、ここから流し込む） ---------- */
  function S(cls, sub) {
    var bases = ['.sync-indicator', '#sync-indicator', '#sync-ind'];
    var out = [];
    for (var i = 0; i < bases.length; i++) out.push(bases[i] + '.' + cls + (sub ? ' ' + sub : ''));
    return out.join(',');
  }
  function injectCSS() {
    if (d.getElementById('cf-sync-css')) return;
    var css =
      '.sync-indicator{cursor:pointer;transition:background .2s,border-color .2s,color .2s}' +
      S('sync-idle')   + '{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.32);color:#86efac}' +
      S('sync-idle','.sync-dot') + '{background:#22c55e;animation:cfSyncPulse 2.4s infinite}' +
      S('sync-saving') + '{background:rgba(234,179,8,.14);border-color:rgba(234,179,8,.42);color:#fde68a}' +
      S('sync-saving','.sync-dot') + '{background:#eab308;animation:cfSyncBlink .7s infinite}' +
      S('sync-cache')  + '{background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.4);color:#fcd34d}' +
      S('sync-cache','.sync-dot') + '{background:#f59e0b;animation:none}' +
      S('sync-recv')   + '{background:rgba(59,130,246,.14);border-color:rgba(59,130,246,.42);color:#93c5fd}' +
      S('sync-recv','.sync-dot') + '{background:#3b82f6;animation:cfSyncBlink .5s 2}' +
      S('sync-offline')+ '{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.4);color:#fca5a5}' +
      S('sync-offline','.sync-dot') + '{background:#ef4444;animation:none}' +
      S('sync-error')  + '{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.4);color:#fca5a5}' +
      S('sync-error','.sync-dot') + '{background:#ef4444;animation:cfSyncBlink .9s infinite}' +
      S('sync-local')  + '{background:var(--bg3);border-color:var(--border);color:var(--text2)}' +
      S('sync-local','.sync-dot') + '{background:#94a3b8;animation:none}' +
      '@keyframes cfSyncPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 5px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
      '@keyframes cfSyncBlink{0%,100%{opacity:1}50%{opacity:.25}}';
    var st = d.createElement('style');
    st.id = 'cf-sync-css';
    st.textContent = css;
    (d.head || d.documentElement).appendChild(st);
  }

  /* ---------- 描く ---------- */
  function fmt(ms) {
    if (!ms) return 'まだ同期していません';
    var t = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds());
  }
  function tipFor(s) {
    if (s === 'local')   return 'この端末の中だけに保存しています';
    if (s === 'offline') return 'ネットに繋がっていません。直した内容はこの画面には残っていますが、まだ全員には届いていません';
    if (s === 'error')   return '保存できませんでした。通信を確認してください';
    if (s === 'saving')  return 'クラウドへ保存しています…';
    if (s === 'cache')   return 'サーバーに確認できていない表示です（同期待ち）';
    if (s === 'recv')    return '他の人の変更が届きました';
    return '最後の同期 ' + fmt(_lastAt);
  }
  function paint() {
    injectCSS();
    var e = lamp();
    if (!e) return;
    var s = _state;
    if (s !== 'local' && !navigator.onLine) s = 'offline';
    e.className = 'sync-indicator sync-' + s;
    e.innerHTML = '<span class="sync-dot"></span><span class="sync-text">' + LABEL[s] + '</span>';
    e.title = tipFor(s);
  }

  /* ---------- 外向きの入口 ---------- */
  var API = {
    saving: function () {
      _pending++;
      if (_state !== 'offline' && _state !== 'local') { _state = 'saving'; paint(); }
    },
    saved: function () {
      _pending = Math.max(0, _pending - 1);
      _lastAt = _lastSave = Date.now();
      if (_pending === 0 && _state !== 'local') { _state = 'idle'; paint(); }
    },
    failed: function () {
      _pending = Math.max(0, _pending - 1);
      if (_state !== 'local') { _state = 'error'; paint(); }
    },
    received: function () {
      _lastAt = Date.now();
      if (_state === 'saving' || _state === 'local') return;
      if (_pending > 0) return;
      if (Date.now() - _lastSave < 1500) return;   /* 自分が書いた直後の跳ね返りは「受信」にしない */
      _state = 'recv'; paint();
      clearTimeout(_tRecv);
      _tRecv = setTimeout(function () { if (_state === 'recv') { _state = 'idle'; paint(); } }, 1200);
    },
    connected: function () {
      if (_state === 'local') return;
      if (_pending > 0) return;
      _state = 'idle'; _lastAt = Date.now(); paint();
    },
    set: function (s) { if (LABEL[s]) { _state = s; paint(); } },
    state: function () { return _state; },
    refresh: paint
  };
  w.CFSync = API;

  /* 各アプリが前から持っていたランプ操作を、このランプに繋ぎ替える
     （CarFlow＝setSyncStatus('online'|'cache'|'offline') ／ MHS・CoreMembers＝setSyncState(true|false)）
     ⚠ そのため、この部品はアプリ本体のJSより後ろで読み込むこと。 */
  function hookLegacy() {
    w.setSyncStatus = function (st) {
      if (st === 'offline') API.set('offline');
      else if (st === 'cache') API.set('cache');
      else API.connected();
    };
    w.setSyncState = function (on) {
      if (on === false) API.set('offline');
      else API.connected();
    };
  }

  /* ---------- クリックで状態を教える ---------- */
  function bindClick() {
    var e = lamp();
    if (!e || e.__cfClick) return;
    e.__cfClick = 1;
    if (e.getAttribute('onclick')) return;   /* アプリ側で既に決まっているなら触らない */
    e.addEventListener('click', function () {
      var msg;
      if (!navigator.onLine)        msg = 'ネットに繋がっていません。直した内容はこの画面には残っていますが、まだ全員には届いていません。';
      else if (_state === 'error')  msg = '保存できませんでした。通信を確認して、もう一度やってみてください。';
      else if (_state === 'local')  msg = 'この端末の中だけに保存しています。';
      else                          msg = '全員と共有中です（最後の同期 ' + fmt(_lastAt) + '）';
      var t = w.showToast || w.toast || w.pitToast;
      if (typeof t === 'function') t(msg);
    });
  }

  /* ---------- Firestore に薄い皮をかぶせる ---------- */
  function wrapWrite(proto, name) {
    if (!proto || typeof proto[name] !== 'function' || proto[name].__cf) return;
    var orig = proto[name];
    var f = function () {
      var p;
      try { p = orig.apply(this, arguments); }
      catch (e) { API.failed(); throw e; }
      if (p && typeof p.then === 'function') {
        API.saving();
        p.then(function () { API.saved(); }, function () { API.failed(); });
      }
      return p;
    };
    f.__cf = 1;
    proto[name] = f;
  }

  function wrapCb(cb) {
    var first = true;
    return function (snap) {
      try {
        var md = snap && snap.metadata;
        if (first) { first = false; if (md && md.fromCache === false) API.connected(); }
        else if (md && md.hasPendingWrites === false && md.fromCache === false) API.received();
      } catch (e) {}
      return cb.apply(this, arguments);
    };
  }
  function wrapSnap(proto, name) {
    if (!proto || typeof proto[name] !== 'function' || proto[name].__cf) return;
    var orig = proto[name];
    var f = function () {
      var args = Array.prototype.slice.call(arguments);
      var done = false;
      for (var i = 0; i < args.length && !done; i++) {
        if (typeof args[i] === 'function') { args[i] = wrapCb(args[i]); done = true; }
        else if (args[i] && typeof args[i].next === 'function') {
          var o = args[i], copy = {};
          for (var k in o) copy[k] = o[k];
          copy.next = wrapCb(o.next.bind(o));
          args[i] = copy; done = true;
        }
      }
      return orig.apply(this, args);
    };
    f.__cf = 1;
    proto[name] = f;
  }

  function patchFirestore() {
    var F = w.firebase && w.firebase.firestore;
    if (!F || !F.DocumentReference || !F.DocumentReference.prototype) return false;
    var DR = F.DocumentReference.prototype;
    wrapWrite(DR, 'set'); wrapWrite(DR, 'update'); wrapWrite(DR, 'delete');
    if (F.CollectionReference && F.CollectionReference.prototype) wrapWrite(F.CollectionReference.prototype, 'add');
    if (F.WriteBatch && F.WriteBatch.prototype) wrapWrite(F.WriteBatch.prototype, 'commit');
    wrapSnap(DR, 'onSnapshot');
    if (F.Query && F.Query.prototype) wrapSnap(F.Query.prototype, 'onSnapshot');
    if (F.CollectionReference && F.CollectionReference.prototype &&
        F.CollectionReference.prototype.onSnapshot !== DR.onSnapshot) {
      wrapSnap(F.CollectionReference.prototype, 'onSnapshot');
    }
    return true;
  }

  /* firebase の読み込みが後になる場合に備えて、少しの間だけ待って掛け直す */
  function tryPatch(times) {
    if (patchFirestore()) return;
    if (times <= 0) return;
    setTimeout(function () { tryPatch(times - 1); }, 200);
  }

  /* ---------- 起動 ---------- */
  w.addEventListener('online',  function () { if (_state === 'offline') _state = 'idle'; paint(); });
  w.addEventListener('offline', function () { paint(); });

  function boot() {
    injectCSS(); hookLegacy(); bindClick(); paint(); tryPatch(25);
  }
  boot();
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { hookLegacy(); bindClick(); paint(); });
  w.addEventListener('load', function () { hookLegacy(); bindClick(); paint(); });
})(window, document);
