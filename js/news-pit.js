/* ========================================
   news-pit.js  -  お知らせ（PitFlow）
   ----------------------------------------
   ◎なにをするもの
     更新情報や社内連絡を出す所。CarFlow のお知らせと同じ考え方。
     ・読めるのは全員／書けるのは管理（CoreFlow で PitFlow＝管理 の人とマスター）
     ・未読の数をサイドバーの「お知らせ」に赤い丸で出す
     ・既読は個人ごとに覚える（userPrefs／サンプルではこの端末）

   ◎どこに残るか
     本番：companies/kobayashi_motors/pitAnnouncements
     サンプル：この端末の中だけ（localStorage）
   ======================================== */
(function () {
  'use strict';

  var LS_KEY = 'pitflow_news_v1';
  var LS_READ = 'pitflow_news_read_v1';
  var _list = null;
  var _read = null;      // 既読の id の入れ物
  var _editing = null;   // 編集中のお知らせ（null＝新規）

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function fmt(ms) {
    if (!ms) return '';
    var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function canEdit() { return !window.PIT_CLOUD || (window.pitIsAdmin && pitIsAdmin()); }
  function cloud() { return window.PIT_CLOUD && window.fb && window.fb.ready && window.fb.currentUser; }

  /* ---- 既読 ---- */
  function loadRead() {
    if (_read) return Promise.resolve(_read);
    if (cloud()) {
      return window.fb.company().collection('userPrefs').doc(window.fb.currentUser.uid).get()
        .then(function (d) { _read = ((d.exists && (d.data() || {}).pitNewsRead) || []).slice(); return _read; })
        .catch(function () { _read = []; return _read; });
    }
    try { _read = JSON.parse(localStorage.getItem(LS_READ) || '[]'); } catch (e) { _read = []; }
    return Promise.resolve(_read);
  }
  function markRead(ids) {
    if (!_read) _read = [];
    var added = false;
    ids.forEach(function (id) { if (_read.indexOf(id) < 0) { _read.push(id); added = true; } });
    if (!added) return;
    if (cloud()) {
      window.fb.company().collection('userPrefs').doc(window.fb.currentUser.uid)
        .set({ pitNewsRead: _read }, { merge: true })
        .catch(function (e) { console.warn('[news] 既読の記録に失敗', e); });
    } else {
      try { localStorage.setItem(LS_READ, JSON.stringify(_read)); } catch (e) {}
    }
    paintBadge();
  }

  /* ---- 読み込み ---- */
  function load() {
    if (cloud()) {
      return window.fb.company().collection('pitAnnouncements').orderBy('at', 'desc').limit(100).get()
        .then(function (snap) {
          var out = [];
          snap.forEach(function (d) { var o = d.data() || {}; o.id = d.id; out.push(o); });
          _list = out; return out;
        })
        .catch(function (e) { console.error('[news] 読み込みに失敗', e); _list = []; return _list; });
    }
    try { _list = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { _list = []; }
    return Promise.resolve(_list);
  }
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_list || [])); } catch (e) {}
  }

  /* ---- サイドバーの未読の丸 ---- */
  function paintBadge() {
    var item = document.querySelector('.si-item[data-view="news"]');
    if (!item) return;
    var n = 0;
    if (_list && _read) {
      n = _list.filter(function (x) { return _read.indexOf(x.id) < 0; }).length;
    }
    var b = item.querySelector('.si-newsbadge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'si-newsbadge'; item.appendChild(b); }
    b.textContent = n > 99 ? '99+' : String(n);
  }
  window.pitNewsRefreshBadge = function () {
    Promise.all([_list ? Promise.resolve(_list) : load(), loadRead()]).then(paintBadge);
  };

  /* ---- 画面 ---- */
  function renderNews() {
    var box = document.getElementById('news-body');
    if (!box) return;
    if (_list === null || _read === null) {
      box.innerHTML = '<div class="nw-loading">読み込んでいます…</div>';
      Promise.all([load(), loadRead()]).then(function () { renderNews(); });
      return;
    }

    var h = '';
    if (canEdit()) {
      h += '<div class="nw-bar"><button class="nw-add" onclick="pitNewsOpen()"><i data-ic=plus data-ics=15></i> お知らせを書く</button></div>';
    }
    if (!window.PIT_CLOUD) {
      h += '<div class="nw-note"><i data-ic=info data-ics=15></i> いまはこの端末の中だけです。本番では全員に届きます。</div>';
    }

    if (!_list.length) {
      h += '<div class="nw-empty">お知らせはまだありません。</div>';
    } else {
      h += '<div class="nw-list">';
      _list.forEach(function (n) {
        var unread = _read.indexOf(n.id) < 0;
        h += '<article class="nw-card' + (unread ? ' unread' : '') + '">'
          + '<header class="nw-h">'
          + (unread ? '<span class="nw-new">NEW</span>' : '')
          + '<h3>' + esc(n.title || '(無題)') + '</h3>'
          + '<span class="nw-meta">' + esc(fmt(n.at)) + ' ・ ' + esc(n.byName || '') + '</span>'
          + (canEdit()
              ? '<span class="nw-tools">'
                + '<button onclick="pitNewsOpen(\'' + esc(n.id) + '\')" title="直す"><i data-ic=pencil data-ics=15></i></button>'
                + '<button onclick="pitNewsDel(\'' + esc(n.id) + '\')" title="消す"><i data-ic=trash data-ics=15></i></button>'
                + '</span>'
              : '')
          + '</header>'
          + '<div class="nw-body">' + nl2br(n.body || '') + '</div>'
          + '</article>';
      });
      h += '</div>';
    }

    box.innerHTML = h;
    if (window.icoBoot) icoBoot(box);

    /* 開いたら全部既読にする */
    markRead(_list.map(function (x) { return x.id; }));
  }
  window.renderNews = renderNews;

  /* ---- 書く・直す ---- */
  window.pitNewsOpen = function (id) {
    if (!canEdit()) return;
    _editing = id ? (_list || []).find(function (x) { return x.id === id; }) : null;
    var m = document.getElementById('nw-modal');
    if (!m) return;
    document.getElementById('nw-modal-t').textContent = _editing ? 'お知らせを直す' : 'お知らせを書く';
    document.getElementById('nw-title').value = _editing ? (_editing.title || '') : '';
    document.getElementById('nw-text').value = _editing ? (_editing.body || '') : '';
    m.style.display = 'flex';
    setTimeout(function () { document.getElementById('nw-title').focus(); }, 30);
  };
  window.pitNewsClose = function () {
    var m = document.getElementById('nw-modal');
    if (m) m.style.display = 'none';
    _editing = null;
  };

  window.pitNewsSave = function () {
    var title = (document.getElementById('nw-title').value || '').trim();
    var body = (document.getElementById('nw-text').value || '').trim();
    if (!title && !body) { pitNewsClose(); return; }

    var meName = (window.pitCurrentStaffName && pitCurrentStaffName()) || '';
    if (!meName) {
      var _me = null; try { _me = localStorage.getItem('pitflow_bn_me'); } catch (e) {}
      var _l = (window.state && state.staff) || [];
      var _s = _l.find(function (x) { return x.id === _me; }) || _l.find(function (x) { return x.front; }) || _l[0];
      meName = (_s && _s.name) || '管理者';
    }
    if (cloud()) {
      var col = window.fb.company().collection('pitAnnouncements');
      var p = _editing
        ? col.doc(_editing.id).set({ title: title, body: body }, { merge: true })
        : col.add({ title: title, body: body, at: Date.now(), byName: meName,
                    by: window.fb.currentUser.uid });
      p.then(function () {
        if (window.pitLog) pitLog(_editing ? 'お知らせを直した' : 'お知らせを出した', { label: title, kind: 'news' });
        _list = null; pitNewsClose(); renderNews();
      }).catch(function (e) {
        console.error('[news] 保存に失敗', e);
        alert('お知らせを保存できませんでした。通信か権限を確認してください。');
      });
      return;
    }
    if (_editing) {
      _editing.title = title; _editing.body = body;
    } else {
      (_list = _list || []).unshift({
        id: 'nw_' + Date.now().toString(36), title: title, body: body,
        at: Date.now(), byName: meName
      });
    }
    saveLocal();
    if (window.pitLog) pitLog(_editing ? 'お知らせを直した' : 'お知らせを出した', { label: title, kind: 'news' });
    pitNewsClose(); renderNews();
  };

  window.pitNewsDel = function (id) {
    if (!canEdit()) return;
    var n = (_list || []).find(function (x) { return x.id === id; });
    if (!n) return;
    if (!confirm('このお知らせを消します。よろしいですか？\n\n' + (n.title || ''))) return;
    if (cloud()) {
      window.fb.company().collection('pitAnnouncements').doc(id).delete()
        .then(function () {
          if (window.pitLog) pitLog('お知らせを消した', { label: n.title || '', kind: 'news' });
          _list = null; renderNews();
        })
        .catch(function (e) { console.error('[news] 削除に失敗', e); alert('消せませんでした。'); });
      return;
    }
    _list = _list.filter(function (x) { return x.id !== id; });
    saveLocal();
    if (window.pitLog) pitLog('お知らせを消した', { label: n.title || '', kind: 'news' });
    renderNews();
  };
})();
