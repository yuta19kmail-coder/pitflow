/* ========================================
   oplog-pit.js  -  操作ログ（PitFlow）
   ----------------------------------------
   ◎なにをするもの
     「誰が・いつ・何をしたか」を1行ずつ残す。CarFlow / StockFlow と同じ考え方。
     あとから書き換えられない（作るだけ・消せるのはマスターのみ）。

   ◎どこに残るか
     本番：companies/kobayashi_motors/pitAuditLogs（全員で共有・直近1000件を表示）
     サンプル：この端末の中だけ（localStorage・直近500件）

   ◎使い方（他のファイルから）
     pitLog('予約を作成', { cardId:c.id, label:'山田 様 / タント' })
     ・ログを残すこと自体で操作を止めない。失敗しても黙って捨てる（画面の邪魔をしない）。

   ◎🔴 v1.84.0 「1件だけ消す」（マスター限定・ゆうた依頼 2026-08-12）
     各行の右はしに ゴミ箱 を出す。押した**その1件だけ**が消える。
     ⚠ **全消しは作っていない**（ゆうた決定）。CarFlow には全消しがあるが、こちらは付けない。

     ・出る人＝`pitIsMaster()`（auth-pit.js）が true の人だけ。本番はマスター（ゆうた）1人。
       練習用サイト（サンプル／デモ版）は**この端末の中だけの記録**なので全員に出る。
     ・Firestore のルールも `pitAuditLogs` の delete＝`_isMaster()` で締めてある
       （`CarFlow\carflow\firestore.rules`）。**画面側だけ広げてもサーバーが拒否する**＝
       「押せるのに消えないボタン」になるので、権限を変えたい時は必ず両方直すこと。
     ・消したこと自体は「操作ログを1件消去」として**ログに残る**。
       残すのは**消した行の時刻だけ**（中身は残さない）＝
       「ログは黙って書き換えられない」という約束を保ちつつ、消したかった中身は復活させない。
   ======================================== */
(function () {
  'use strict';

  var LS_KEY = 'pitflow_oplog_v1';
  var LIMIT = 1000;
  var _cache = null;      // 画面表示用（直近ぶん）
  var _q = '';
  var _seq = 0;           // 行を見分ける番号（画面の中だけ。保存データには入れない）
  var _busyKey = '';      // いま消している最中の行（連打よけ）

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nowStr(d) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function meName() {
    if (window.pitCurrentStaffName) {
      var n = pitCurrentStaffName();
      if (n) return n;
    }
    var me = null;
    try { me = localStorage.getItem('pitflow_bn_me'); } catch (e) {}
    var list = (window.state && state.staff) || [];
    var s = list.find(function (x) { return x.id === me; })
         || list.find(function (x) { return x.front; }) || list[0];
    return (s && s.name) || '—';
  }

  /* 🔴 v1.84.0 消せる人か。**判定はここ1か所**（画面のあちこちで書き直さない）。 */
  function canDelete() {
    return !!(window.pitIsMaster && window.pitIsMaster());
  }
  /* 行に画面用の番号を振る（保存データには入れない） */
  function stamp(arr) {
    (arr || []).forEach(function (e) { if (!e._k) e._k = 'k' + (++_seq); });
    return arr;
  }
  function indexOfKey(k) {
    if (!_cache) return -1;
    for (var i = 0; i < _cache.length; i++) if (_cache[i]._k === k) return i;
    return -1;
  }

  /* ---- 1件残す ---- */
  window.pitLog = function (action, opt) {
    if (!action) return;
    opt = opt || {};
    var entry = {
      at: Date.now(),
      timeStr: nowStr(),
      userName: opt.user || meName(),
      action: String(action),
      label: opt.label || '',
      cardId: opt.cardId || '',
      kind: opt.kind || ''
    };

    if (window.PIT_CLOUD && window.fb && window.fb.ready && window.fb.currentUser) {
      var doc = {
        time: window.fb.serverTimestamp(),
        timeStr: entry.timeStr,
        uid: window.fb.currentUser.uid,
        userName: entry.userName,
        action: entry.action,
        label: entry.label,
        cardId: entry.cardId,
        kind: entry.kind
      };
      window.fb.company().collection('pitAuditLogs').add(doc)
        /* 🔴 v1.84.0 いま作った行が「どのドキュメントか」を控える。
           これが無いと、**書いた直後の行だけ ゴミ箱 で消せない**（消し先が分からない）。 */
        .then(function (ref) { if (ref && ref.id) entry._id = ref.id; })
        .catch(function (e) { console.warn('[oplog] 記録に失敗（操作は続きます）', e); });
      if (_cache) { _cache.unshift(entry); if (state.currentView === 'oplog') renderOplog(); }
      return;
    }

    /* サンプルモード：この端末の中だけ */
    try {
      var arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      arr.unshift(entry);
      if (arr.length > 500) arr.length = 500;
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
      _cache = arr;
    } catch (e) {}
    if (window.state && state.currentView === 'oplog') renderOplog();
  };

  /* ---- 読み込み ---- */
  function load() {
    if (window.PIT_CLOUD && window.fb && window.fb.ready && window.fb.currentUser) {
      return window.fb.company().collection('pitAuditLogs')
        .orderBy('time', 'desc').limit(LIMIT).get()
        .then(function (snap) {
          var out = [];
          snap.forEach(function (d) {
            var o = d.data() || {};
            out.push({
              _id: d.id,                    /* v1.84.0 消し先（マスターの ゴミ箱 で使う） */
              at: (o.time && o.time.toMillis) ? o.time.toMillis() : 0,
              timeStr: o.timeStr || '', userName: o.userName || '—',
              action: o.action || '', label: o.label || '', cardId: o.cardId || '', kind: o.kind || ''
            });
          });
          _cache = out;
          return out;
        })
        .catch(function (e) {
          console.error('[oplog] 読み込みに失敗', e);
          _cache = [];
          return [];
        });
    }
    try { _cache = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { _cache = []; }
    return Promise.resolve(_cache);
  }

  /* ---- サンプル／デモ版：画面の並びをそのまま端末へ書き戻す ---- */
  function saveLocal() {
    try {
      var arr = (_cache || []).map(function (e) {
        var o = {};
        for (var k in e) {
          if (Object.prototype.hasOwnProperty.call(e, k) && k !== '_k' && k !== '_id') o[k] = e[k];
        }
        return o;
      });
      if (arr.length > 500) arr.length = 500;
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  /* ---- 画面 ---- */
  function renderOplog() {
    var box = document.getElementById('oplog-body');
    if (!box) return;

    if (_cache === null) {
      box.innerHTML = '<div class="op-loading">読み込んでいます…</div>';
      load().then(function () { renderOplog(); });
      return;
    }
    stamp(_cache);

    var del = canDelete();
    var q = _q.trim().toLowerCase();
    var list = _cache.filter(function (e) {
      if (!q) return true;
      return (e.userName + ' ' + e.action + ' ' + e.label).toLowerCase().indexOf(q) >= 0;
    });

    var h = '';
    h += '<div class="op-bar">'
       + '<span class="op-search"><i data-ic=search data-ics=15></i>'
       + '<input id="op-q" type="search" autocomplete="off" placeholder="名前・操作・車で絞り込み" value="' + esc(_q) + '" oninput="pitOplogSearch(this.value)"></span>'
       + '<span class="op-count">' + list.length + ' 件' + (q ? '（全' + _cache.length + '件中）' : '') + '</span>'
       + '<button class="op-reload" onclick="pitOplogReload()"><i data-ic=refresh data-ics=15></i> 最新に更新</button>'
       + '</div>';

    if (!window.PIT_CLOUD) {
      h += '<div class="op-note"><i data-ic=info data-ics=15></i> いまはこの端末の中だけの記録です（直近500件）。本番では全員ぶんが共有されます。</div>';
    }
    /* 🔴 v1.84.0 なぜ自分にだけゴミ箱が出ているのかを、その場で分かるようにしておく。 */
    if (del) {
      /* ⚠ .op-note は横並び（flex）。<b> を裸で置くと**1文字ずつ縦に折れる**ので、
         文章はかならず <span> ひとつにまとめて入れること（スマホ幅で実際に折れた）。 */
      h += '<div class="op-note"><i data-ic=trash data-ics=15></i>'
         + '<span>各行の <b>ゴミ箱</b> は、あなた（マスター）にだけ出ています。'
         + '押した1件だけを消せます（消したことは記録に残ります）。</span></div>';
    }

    if (!list.length) {
      h += '<div class="op-empty">まだ記録がありません。</div>';
    } else {
      h += '<div class="op-list">';
      list.forEach(function (e) {
        h += '<div class="op-row' + (del ? ' op-can-del' : '') + '">'
          + '<span class="op-time">' + esc(e.timeStr) + '</span>'
          + '<span class="op-user">' + esc(e.userName) + '</span>'
          + '<span class="op-act">' + esc(e.action) + '</span>'
          + '<span class="op-label">' + (e.cardId
              ? '<a href="javascript:void(0)" onclick="pitOpenCardDetail(\'' + esc(e.cardId) + '\')">' + esc(e.label) + '</a>'
              : esc(e.label)) + '</span>'
          + (del
              ? '<button class="op-del" type="button" title="この1件を消す" aria-label="この1件を消す"'
                + ' onclick="pitOplogDelete(\'' + esc(e._k) + '\')"><i data-ic=trash data-ics=14></i></button>'
              : '')
          + '</div>';
      });
      h += '</div>';
    }

    box.innerHTML = h;
    if (window.icoBoot) icoBoot(box);
  }
  window.renderOplog = renderOplog;

  window.pitOplogSearch = function (v) {
    _q = v || '';
    renderOplog();
    var i = document.getElementById('op-q');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  };
  window.pitOplogReload = function () {
    _cache = null;
    renderOplog();
  };

  /* ========================================
     🔴 v1.84.0 1件だけ消す（マスター限定）
     ⚠ 「聞く → 消す」の順。答えは**後から**返る（ask-pit.js は非同期）ので、
        続きは必ず .then の中に書くこと。その場で分岐しない。
     ======================================== */
  function toast(msg) {
    if (window.pitToast) { try { pitToast(msg); return; } catch (e) {} }
    if (window.showToast) { try { showToast(msg); } catch (e) {} }
  }

  window.pitOplogDelete = function (k) {
    if (!canDelete()) return;
    if (_busyKey) return;                       /* 連打よけ */
    var i = indexOfKey(k);
    if (i < 0) return;
    var e = _cache[i];

    var line = [e.timeStr, e.userName, e.action, e.label].filter(Boolean).join(' ／ ');
    var ask = window.pitAsk
      ? pitAsk('この1件を消しますか？', {
          detail: line + '\n\n消した記録は戻せません。' +
                  (window.PIT_CLOUD ? '全員の画面からも消えます。' : 'この端末の中だけの記録です。'),
          danger: true, ok: '消す', cancel: 'やめる'
        })
      : Promise.resolve(true);

    ask.then(function (ok) {
      if (!ok) return;
      /* 聞いている間に行が動いている（新しいログが増えた／更新した）かもしれないので取り直す */
      var j = indexOfKey(k);
      if (j < 0) { toast('その行はもうありません'); return; }
      var t = _cache[j];

      if (window.PIT_CLOUD && window.fb && window.fb.ready && window.fb.currentUser) {
        if (!t._id) { toast('いま書いたばかりの行です。［最新に更新］を押してからお試しください'); return; }
        _busyKey = k;
        window.fb.company().collection('pitAuditLogs').doc(t._id).delete()
          .then(function () { _busyKey = ''; done(k, t); })
          .catch(function (err) {
            _busyKey = '';
            console.error('[oplog] 1件消去に失敗', err);
            toast('消せませんでした（権限か通信の問題です）');
          });
        return;
      }

      /* サンプル／デモ版：この端末の中だけ */
      done(k, t);
    });
  };

  /* 消えたあとの後始末（画面から抜く → 消したことを記録する） */
  function done(k, t) {
    var j = indexOfKey(k);
    if (j >= 0) _cache.splice(j, 1);
    /* ⚠ 順番が大事。サンプルは**先に端末へ書き戻す**こと。
       あとの pitLog が localStorage を読み直して上書きするので、
       ここで書き戻す前にログを足すと**消したはずの行が復活する**。 */
    if (!(window.PIT_CLOUD && window.fb && window.fb.ready && window.fb.currentUser)) saveLocal();
    renderOplog();
    /* ⚠ 残すのは**消した行の時刻だけ**。中身（誰が何を）は残さない＝消したかったものを復活させない。 */
    try { if (window.pitLog) pitLog('操作ログを1件消去', { label: (t.timeStr || '') + ' の1件', kind: 'oplog' }); } catch (e) {}
    toast('1件消しました');
  }
})();
