/* ========================================
   members-pit.js  -  メンバー（PitFlow）
   ----------------------------------------
   ◎考え方
     ・「誰が居るか」は CoreFlow の名簿（portalMembers）が唯一の正。
       名前・写真・在籍・並び順は CoreMembers → CoreFlow で管理する。ここでは直せない。
     ・「その人が PitFlow の中でどういう人か」＝ 課（1課/2課）・フロント担当・受付・メカのみ、
       は PitFlow 側で持つ。保存先は companies/kobayashi_motors/pitSettings/staffProps。
     ・この2つを合わせて state.staff を作る。state.staff の形はいままでと同じなので、
       担当セレクト・付箋・ダッシュボードなど既存の画面はそのまま動く。

   ◎大事なところ
     ・カードに入っている担当は「名前の文字」で持っている（昔からの作り）。
       名簿から作り直しても、名前が同じなら過去のカードはそのまま繋がる。
     ・サンプルモード（github.io・デモ版）では名簿を読まない＝いままでのサンプル名簿のまま。
   ======================================== */
(function () {
  'use strict';

  var PROPS_DOC = 'staffProps';
  var _props = {};        // { memberId: {division, front, reception, role} }
  var _members = [];      // portalMembers の生データ（PitFlow が使える人だけ）
  var _unsub = null;

  /* 新しく名簿に載った人の初期値。
     ⚠ ここを「全部オフ」にすると担当の候補に出てこなくて気づけないので、
       まずは出るようにしておいて、メンバー画面で絞ってもらう。 */
  function defaultProps() {
    return { division: '', front: true, reception: true, role: 'staff' };
  }

  function propsOf(id) {
    var p = _props[id];
    if (!p) return defaultProps();
    var d = defaultProps();
    return {
      division:  (p.division  !== undefined) ? p.division  : d.division,
      front:     (p.front     !== undefined) ? !!p.front     : d.front,
      reception: (p.reception !== undefined) ? !!p.reception : d.reception,
      role:      p.role || d.role
    };
  }

  /* 名簿＋PitFlow属性 → state.staff を作り直す */
  function rebuildStaff() {
    var list = _members.slice().sort(function (a, b) {
      var sa = (a.pitflow && a.pitflow.sortOrder != null) ? a.pitflow.sortOrder : (a.sortOrder != null ? a.sortOrder : 9999);
      var sb = (b.pitflow && b.pitflow.sortOrder != null) ? b.pitflow.sortOrder : (b.sortOrder != null ? b.sortOrder : 9999);
      if (sa !== sb) return sa - sb;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
    });
    window.state.staff = list.map(function (m) {
      var p = propsOf(m.id);
      return {
        id: m.id,
        name: m.name || '(名前なし)',
        role: p.role,                       // owner / staff / mech
        division: p.division,               // '' / 'div1' / 'div2'
        front: (p.role === 'mech') ? false : !!p.front,
        reception: (p.role === 'mech') ? false : !!p.reception,
        photo: m.photo || '',
        email: m.email || ''
      };
    });
    window.PIT_MEMBERS_READY = true;
    if (window.pitRenderTopUser) { try { pitRenderTopUser(); } catch (e) {} }
    if (window.state && state.currentView === 'members') renderMembers();
  }
  window.pitRebuildStaff = rebuildStaff;

  /* ---- 読み込み（本番モード） ---- */
  function loadProps() {
    return window.fb.company().collection('pitSettings').doc(PROPS_DOC).get()
      .then(function (d) { _props = (d.exists && (d.data() || {}).props) || {}; })
      .catch(function (e) { console.warn('[members] PitFlow属性の読込に失敗（既定で続けます）', e); _props = {}; });
  }

  function watchMembers() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    _unsub = window.fb.company().collection('portalMembers')
      .onSnapshot(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var m = doc.data() || {}; m.id = doc.id;
          if (m.active === false) return;
          var usable = (m.master === true) || !!(m.pitflow && m.pitflow.on === true);
          if (!usable) return;
          out.push(m);
        });
        _members = out;
        console.log('[members] CoreFlowの名簿から', out.length, '人');
        rebuildStaff();
      }, function (e) {
        console.error('[members] 名簿の購読に失敗', e);
      });
  }

  /* auth-pit.js から呼ばれる（ログイン直後） */
  window.pitOnLogin = function (member, user) {
    loadProps().then(function () {
      watchMembers();
      /* 保存のクラウド接続（db-pit.js 側で用意する。まだ無ければ何もしない） */
      if (window.PitDB && typeof PitDB.connectCloud === 'function') {
        try { PitDB.connectCloud(user, member); } catch (e) { console.error('[members] クラウド接続でエラー', e); }
      }
    });
  };
  window.pitOnLogout = function () {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    if (window.PitDB && typeof PitDB.disconnectCloud === 'function') {
      try { PitDB.disconnectCloud(); } catch (e) {}
    }
  };

  /* ---- 保存（PitFlow属性だけ） ---- */
  function saveProps() {
    if (!window.PIT_CLOUD) { if (window.PitDB) PitDB.save(); return Promise.resolve(true); }
    return window.fb.company().collection('pitSettings').doc(PROPS_DOC)
      .set({ props: _props, updatedAt: window.fb.serverTimestamp() }, { merge: true })
      .then(function () { return true; })
      .catch(function (e) {
        console.error('[members] 保存に失敗', e);
        if (window.showToast) showToast('メンバーの設定を保存できませんでした');
        return false;
      });
  }

  /* =======================================================
     メンバー画面
     ======================================================= */
  var DIVS = [['', '課なし'], ['div1', '1課（国産）'], ['div2', '2課（輸入）']];
  var ROLES = [['staff', 'スタッフ'], ['owner', '幹部'], ['mech', 'メカのみ']];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderMembers() {
    var box = document.getElementById('members-body');
    if (!box) return;
    var cloud = !!window.PIT_CLOUD;
    var canEdit = !cloud || (window.pitIsAdmin && pitIsAdmin());
    var list = (window.state && state.staff) || [];

    var h = '';

    h += '<div class="mb-note">'
       + '<span class="mb-note-ic"><i data-ic=users data-ics=18></i></span>'
       + '<div><b>名前・写真・在籍は CoreFlow のメンバー管理が元</b>です。'
       + 'ここで直すのは「PitFlow の中での役どころ」（課・フロント担当・受付・メカのみ）だけ。'
       + '人の追加や退職の反映は CoreFlow 側でお願いします。</div>'
       + '<a class="mb-openportal" href="https://coreflow.kobayashi-motors.com" target="_blank" rel="noopener">'
       + '<i data-ic=external data-ics=15></i> CoreFlowのメンバー管理を開く</a>'
       + '</div>';

    if (!cloud) {
      h += '<div class="mb-warn"><i data-ic=info data-ics=15></i> いまはサンプルの名簿です。本番のアドレスで開くと CoreFlow の実メンバーになります。</div>';
    }
    if (cloud && !canEdit) {
      h += '<div class="mb-warn"><i data-ic=lock data-ics=15></i> 見るだけの権限です。変更できるのは PitFlow の役割が「管理」の人だけです。</div>';
    }

    h += '<div class="mb-table-wrap"><table class="mb-table"><thead><tr>'
       + '<th class="mb-c-name">名前</th><th>区分</th><th>課</th>'
       + '<th class="mb-c-ck">フロント担当</th><th class="mb-c-ck">受付</th><th class="mb-c-mail">メール</th>'
       + '</tr></thead><tbody>';

    if (!list.length) {
      h += '<tr><td colspan="6" class="mb-empty">メンバーがいません。CoreFlow のメンバー管理で「PitFlow＝使える」をオンにしてください。</td></tr>';
    }

    list.forEach(function (s) {
      var dis = canEdit ? '' : ' disabled';
      var isMech = s.role === 'mech';
      h += '<tr data-mid="' + esc(s.id) + '">'
        + '<td class="mb-c-name"><span class="mb-av">' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="">' : esc((s.name || '？').slice(0, 2))) + '</span>'
        + '<span class="mb-nm">' + esc(s.name) + '</span></td>'
        + '<td><select class="mb-sel" onchange="pitMbSet(\'' + esc(s.id) + '\',\'role\',this.value)"' + dis + '>'
        + ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (s.role === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('')
        + '</select></td>'
        + '<td><select class="mb-sel" onchange="pitMbSet(\'' + esc(s.id) + '\',\'division\',this.value)"' + dis + '>'
        + DIVS.map(function (d) { return '<option value="' + d[0] + '"' + (s.division === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('')
        + '</select></td>'
        + '<td class="mb-c-ck"><input type="checkbox"' + (s.front ? ' checked' : '') + (isMech || !canEdit ? ' disabled' : '')
        + ' onchange="pitMbSet(\'' + esc(s.id) + '\',\'front\',this.checked)"></td>'
        + '<td class="mb-c-ck"><input type="checkbox"' + (s.reception ? ' checked' : '') + (isMech || !canEdit ? ' disabled' : '')
        + ' onchange="pitMbSet(\'' + esc(s.id) + '\',\'reception\',this.checked)"></td>'
        + '<td class="mb-c-mail">' + esc(s.email || '') + '</td>'
        + '</tr>';
    });

    h += '</tbody></table></div>';
    h += '<div class="mb-hint">'
       + '<b>区分</b>：メカのみ＝担当の候補に出さない（作業者として実績にだけ乗る）。<br>'
       + '<b>課</b>：1課＝国産／2課＝輸入。課を選ぶと、その課の予約で候補が絞られます。課なしの人（社長・受付など）は常に候補に出ます。<br>'
       + '<b>フロント担当</b>＝予約カードのフロント欄に出る人。<b>受付</b>＝予約担当（電話を取る人）に出る人。'
       + '</div>';

    box.innerHTML = h;
    if (window.icoBoot) icoBoot(box);
  }
  window.renderMembers = renderMembers;

  /* 1項目ずつその場で保存（保存ボタンなし） */
  window.pitMbSet = function (id, key, val) {
    if (!_props[id]) _props[id] = defaultProps();
    _props[id][key] = val;
    if (key === 'role' && val === 'mech') { _props[id].front = false; _props[id].reception = false; }

    if (!window.PIT_CLOUD) {
      /* サンプルモードは state.staff を直接いじって、いつもの保存に乗せる */
      var s = (state.staff || []).find(function (x) { return x.id === id; });
      if (s) {
        s[key] = val;
        if (key === 'role' && val === 'mech') { s.front = false; s.reception = false; }
      }
      if (window.PitDB) PitDB.save();
      renderMembers();
      return;
    }
    rebuildStaff();
    var _who = (_members.find(function (m) { return m.id === id; }) || {}).name || id;
    var _lb = { role: '区分', division: '課', front: 'フロント担当', reception: '受付' }[key] || key;
    if (window.pitLog) pitLog('メンバー設定を変更（' + _lb + '）', { kind: 'member', label: _who + ' → ' + val });
    saveProps().then(function (ok) {
      if (ok && window.showToast) showToast('メンバーの設定を保存しました');
    });
  };
})();
