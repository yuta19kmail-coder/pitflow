/* ========================================
   members-pit.js  -  メンバー（PitFlow）
   ----------------------------------------
   ◎考え方
     ・「誰が居るか」は CoreFlow の名簿（portalMembers）が唯一の正。
       名前・写真・在籍・並び順は CoreMembers → CoreFlow で管理する。ここでは直せない。
     ・**部署（1課／2課／受付課／その他）は CoreMembers が正**。PitFlow では直せない＝表示だけ。
       CoreMembers の「主所属・課・兼任（subDeptIds）」を読んで、PitFlow の4つに自動で振り分ける。
       兼任の人は複数の課に同時に入る（付箋の「1課ぜんぶ」等でも両方に出る）。
     ・PitFlow 側で持つのは **できること3つ（フロント・受付・メカ）だけ**。
       保存先は companies/kobayashi_motors/pitSettings/staffProps。
     ⚠ v1.4.0：「区分（スタッフ/幹部/メカのみ）」を廃止（幹部は何の動きにも効いていなかった）。
     ⚠ v1.6.0：部署の手動設定も廃止。人と組織の真実は CoreMembers に一本化。
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
  var _props = {};        // { memberId: {front, reception, mech} }
  var _members = [];      // portalMembers の生データ（PitFlow が使える人だけ）
  var _unsub = null;
  var _coreMembers = [];  // CoreMembers の社員名簿
  var _coreDepts = [];    // CoreMembers の組織（部・課）
  var _unsubCM = null, _unsubCD = null;

  /* PitFlow の中での部署の分け方。CoreMembers の部署名から自動で振り分ける。
     ⚠ ここが「1課/2課/受付課/その他」の唯一の定義。増やす時はここに足す。 */
  var PIT_DIVS = [
    { id: 'div1',   label: '1課',   test: /(^|[^0-9０-９])(1|１|一)\s*課/ },
    { id: 'div2',   label: '2課',   test: /(^|[^0-9０-９])(2|２|二)\s*課/ },
    { id: 'recept', label: '受付課', test: /受付/ },
    { id: 'other',  label: 'その他', test: null }
  ];
  window.PIT_DIVS = PIT_DIVS;
  window.pitDivLabel = function (id) {
    var d = PIT_DIVS.find(function (x) { return x.id === id; });
    return d ? d.label : '';
  };

  /* 新しく名簿に載った人の初期値。
     ⚠ ここを「全部オフ」にすると担当の候補に出てこなくて気づけないので、
       まずは出るようにしておいて、メンバー画面で絞ってもらう。 */
  function defaultProps() {
    return { front: true, reception: true, mech: false };
  }

  /* 保存済みの値を読む。
     ⚠ v1.3.0 までは「区分（role）」で持っていたので、古い保存はここで新しい形に読み替える。
        role==='mech' だった人 → メカにチェック／フロント・受付はオフ。 */
  function propsOf(id) {
    var p = _props[id];
    if (!p) return defaultProps();
    var d = defaultProps();
    var oldMech = (p.mech === undefined && p.role === 'mech');
    return {
      front:     oldMech ? false : ((p.front     !== undefined) ? !!p.front     : d.front),
      reception: oldMech ? false : ((p.reception !== undefined) ? !!p.reception : d.reception),
      mech:      (p.mech !== undefined) ? !!p.mech : oldMech
    };
  }

  /* ---- CoreMembers（人と組織の真実）から部署を割り出す ---- */
  function deptById(id) {
    if (!id) return null;
    return _coreDepts.find(function (d) { return d.id === id; }) || null;
  }
  /* 部署名 → PitFlow の4分類。親（部）の名前もたどって判定する。 */
  function bucketOfDept(id, seen) {
    var d = deptById(id);
    if (!d) return null;
    seen = seen || {};
    if (seen[id]) return null;
    seen[id] = 1;
    var name = String(d.name || '');
    for (var i = 0; i < PIT_DIVS.length; i++) {
      var t = PIT_DIVS[i].test;
      if (t && t.test(name)) return PIT_DIVS[i].id;
    }
    return d.parentId ? bucketOfDept(d.parentId, seen) : null;
  }
  /* portalMember → CoreMembers の社員（portalMemberId で照合。無ければ名前で照合） */
  function coreOf(m) {
    var hit = _coreMembers.find(function (c) { return c.portalMemberId && c.portalMemberId === m.id; });
    if (hit) return hit;
    var k = keyOf(m.name);
    return k ? (_coreMembers.find(function (c) { return keyOf(c.name) === k || keyOf(c.dispName) === k; }) || null) : null;
  }
  /* その人の部署（兼任ぶんも全部）。返り値＝{ divisions:['div1',...], names:['整備1課',...] } */
  function divisionsOf(m) {
    var cm = coreOf(m);
    if (!cm) return { divisions: [], names: [] };
    var ids = [];
    if (cm.sectionDeptId) ids.push(cm.sectionDeptId);
    if (cm.primaryDeptId) ids.push(cm.primaryDeptId);
    (cm.subDeptIds || []).forEach(function (x) { ids.push(x); });
    var divs = [], names = [];
    ids.forEach(function (id) {
      var d = deptById(id);
      if (d && d.name && names.indexOf(d.name) < 0) names.push(d.name);
      var b = bucketOfDept(id);
      if (b && divs.indexOf(b) < 0) divs.push(b);
    });
    if (!divs.length && names.length) divs.push('other');   // 部署はあるが1課/2課/受付でない＝その他
    return { divisions: divs, names: names };
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
      var dv = divisionsOf(m);
      return {
        id: m.id,
        name: m.name || '(名前なし)',
        divisions: dv.divisions,            // ['div1','div2'...] 兼任ぶん全部（CoreMembers が正）
        division: dv.divisions[0] || '',    // 代表の1つ（今までの画面がこれを見ている）
        deptNames: dv.names,                // 実際の部署名（表示用）
        front: !!p.front,                   // フロント担当に出す
        reception: !!p.reception,           // 予約担当（電話を取る人）に出す
        mech: !!p.mech,                     // 点検・整備の担当者に出す
        photo: m.photo || '',
        email: m.email || ''
      };
    });
    window.PIT_MEMBERS_READY = true;
    /* 名簿が変わったら、お客様データの担当名も今の名前にそろえる（番号が入っている分だけ） */
    try { if (window.pitSyncCustomerStaffNames) window.pitSyncCustomerStaffNames(); } catch (e) { console.warn('[members] 担当名の追従でエラー', e); }
    if (window.pitRenderTopUser) { try { pitRenderTopUser(); } catch (e) {} }
    if (window.state && state.currentView === 'members') renderMembers();
  }
  window.pitRebuildStaff = rebuildStaff;

  /* =======================================================
     v1.5.0：お客様データの「担当者」をメンバーに結びつける
     -------------------------------------------------------
     ◎考え方
       これまで担当は「名前の文字」だけで持っていた（昔からの作り）。
       そこに **メンバーの番号（frontStaffId / picId）** を添えておく。
       名前の文字はそのまま残すので、既存の画面・絞り込み・印刷は無改修で動く。
       名簿が読めたら、番号を頼りに **名前の文字を今の名前へ自動で直す**
       ＝ CoreFlow で改名しても、お客様データの担当がズレない。
     ======================================================= */
  var VARIANT = { '﨑': '崎', '髙': '高', '冨': '富', '濵': '浜', '濱': '浜', '邊': '辺', '邉': '辺', '齋': '斎', '齊': '斉', '曻': '昇', '德': '徳', '瀨': '瀬' };
  function keyOf(name) {
    var t = String(name == null ? '' : name);
    try { t = t.normalize('NFKC'); } catch (e) {}
    t = t.replace(/[\s\u3000]/g, '');
    return t.replace(/[﨑髙冨濵濱邊邉齋齊曻德瀨]/g, function (c) { return VARIANT[c] || c; });
  }
  window.pitStaffKey = keyOf;

  window.pitStaffById = function (id) {
    if (!id) return null;
    return ((window.state && state.staff) || []).find(function (s) { return s.id === id; }) || null;
  };
  window.pitStaffByName = function (name) {
    var k = keyOf(name);
    if (!k) return null;
    return ((window.state && state.staff) || []).find(function (s) { return keyOf(s.name) === k; }) || null;
  };

  /* お客様データの担当名を、番号を頼りに今の名前へ直す。直した件数を返す。 */
  window.pitSyncCustomerStaffNames = function (save) {
    var list = (window.state && state.customers) || [];
    var n = 0;
    list.forEach(function (c) {
      var m = c.picId ? window.pitStaffById(c.picId) : null;
      if (m && c.pic !== m.name) { c.pic = m.name; n++; }
      (c.vehicles || []).forEach(function (v) {
        var vm = v.frontStaffId ? window.pitStaffById(v.frontStaffId) : null;
        if (vm && v.frontStaff !== vm.name) { v.frontStaff = vm.name; n++; }
      });
    });
    if (n) {
      console.log('[members] 担当の名前を', n, '箇所そろえました');
      if (save !== false && window.PitDB && window.PitDB._loaded !== false) PitDB.save();
    }
    return n;
  };

  /* ---- 読み込み（本番モード） ---- */
  function loadProps() {
    return window.fb.company().collection('pitSettings').doc(PROPS_DOC).get()
      .then(function (d) { _props = (d.exists && (d.data() || {}).props) || {}; })
      .catch(function (e) { console.warn('[members] PitFlow属性の読込に失敗（既定で続けます）', e); _props = {}; });
  }

  /* CoreMembers（社員と組織）を購読。変わったら部署の振り分けもやり直す。 */
  function watchCore() {
    var base = window.fb.company();
    if (!_unsubCD) {
      _unsubCD = base.collection('coreDepts').onSnapshot(function (snap) {
        var a = []; snap.forEach(function (d) { var x = d.data() || {}; x.id = d.id; a.push(x); });
        _coreDepts = a;
        console.log('[members] CoreMembers の組織', a.length, '件');
        rebuildStaff();
      }, function (e) { console.warn('[members] 組織(coreDepts)の購読に失敗（部署なしで続けます）', e); });
    }
    if (!_unsubCM) {
      _unsubCM = base.collection('coreMembers').onSnapshot(function (snap) {
        var a = []; snap.forEach(function (d) { var x = d.data() || {}; x.id = d.id; if (x.status === 'left' || x.active === false) return; a.push(x); });
        _coreMembers = a;
        console.log('[members] CoreMembers の社員', a.length, '人');
        rebuildStaff();
      }, function (e) { console.warn('[members] 社員(coreMembers)の購読に失敗（部署なしで続けます）', e); });
    }
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
      watchCore();
      /* 保存のクラウド接続（db-pit.js 側で用意する。まだ無ければ何もしない） */
      if (window.PitDB && typeof PitDB.connectCloud === 'function') {
        try { PitDB.connectCloud(user, member); } catch (e) { console.error('[members] クラウド接続でエラー', e); }
      }
    });
  };
  window.pitOnLogout = function () {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    if (_unsubCM) { try { _unsubCM(); } catch (e) {} _unsubCM = null; }
    if (_unsubCD) { try { _unsubCD(); } catch (e) {} _unsubCD = null; }
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
       + 'ここで直すのは「PitFlow の中でできること」（フロント・受付・メカ）だけ。'
       + '<b>部署は CoreMembers の所属から自動</b>で入ります（兼任もそのまま反映）。'
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
       + '<th class="mb-c-name">名前</th><th class="mb-c-div">部署<small>（CoreMembers）</small></th>'
       + '<th class="mb-c-ck">フロント</th><th class="mb-c-ck">受付</th><th class="mb-c-ck">メカ</th>'
       + '</tr></thead><tbody>';

    if (!list.length) {
      h += '<tr><td colspan="5" class="mb-empty">メンバーがいません。CoreFlow のメンバー管理で「PitFlow＝使える」をオンにしてください。</td></tr>';
    }

    list.forEach(function (s) {
      var dis = canEdit ? '' : ' disabled';
      /* 部署は CoreMembers から。見るだけ（兼任は並べて出す） */
      var dv = (s.divisions && s.divisions.length)
        ? s.divisions.map(function (id) { return '<span class="mb-div">' + esc(window.pitDivLabel(id)) + '</span>'; }).join('')
        : '<span class="mb-div is-none">未所属</span>';
      h += '<tr data-mid="' + esc(s.id) + '">'
        + '<td class="mb-c-name"><span class="mb-av">' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="">' : esc((s.name || '？').slice(0, 2))) + '</span>'
        + '<span class="mb-nm">' + esc(s.name) + '</span></td>'
        + '<td class="mb-c-div" title="' + esc((s.deptNames || []).join('／')) + '">' + dv + '</td>'
        + '<td class="mb-c-ck"><input type="checkbox"' + (s.front ? ' checked' : '') + dis
        + ' onchange="pitMbSet(\'' + esc(s.id) + '\',\'front\',this.checked)"></td>'
        + '<td class="mb-c-ck"><input type="checkbox"' + (s.reception ? ' checked' : '') + dis
        + ' onchange="pitMbSet(\'' + esc(s.id) + '\',\'reception\',this.checked)"></td>'
        + '<td class="mb-c-ck"><input type="checkbox"' + (s.mech ? ' checked' : '') + dis
        + ' onchange="pitMbSet(\'' + esc(s.id) + '\',\'mech\',this.checked)"></td>'
        + '</tr>';
    });

    h += '</tbody></table></div>';
    h += '<div class="mb-hint">'
       + '<b>部署</b>は <b>CoreMembers の所属から自動</b>です（ここでは直せません）。'
       + '兼任の人は<b>両方に入ります</b>。1課・2課はカードの課での絞り込みと、付箋の「1課ぜんぶ」「2課ぜんぶ」に使われます。'
       + '<b>受付課</b>・<b>その他</b>の人は、どの課の予約でも候補に出ます。部署を直すときは CoreMembers で。<br>'
       + '<b>フロント</b>＝予約カードのフロント欄に出る人。<b>受付</b>＝予約担当（電話を取る人）に出る人。'
       + '<b>メカ</b>＝整備タブの点検担当者・整備担当者に出る人。<br>'
       + '3つとも自由に組み合わせられます（フロントもやるメカ、受付もやるフロント、など）。'
       + '使える／管理などの権限は CoreFlow 側で決めます。'
       + '</div>';

    box.innerHTML = h;
    if (window.icoBoot) icoBoot(box);
  }
  window.renderMembers = renderMembers;

  /* 1項目ずつその場で保存（保存ボタンなし） */
  window.pitMbSet = function (id, key, val) {
    if (!_props[id]) _props[id] = defaultProps();
    _props[id][key] = val;
    delete _props[id].role;   /* v1.4.0：古い「区分」は保存し直さない */

    if (!window.PIT_CLOUD) {
      /* サンプルモードは state.staff を直接いじって、いつもの保存に乗せる */
      var s = (state.staff || []).find(function (x) { return x.id === id; });
      if (s) { s[key] = val; }
      if (window.PitDB) PitDB.save();
      renderMembers();
      return;
    }
    rebuildStaff();
    var _who = (_members.find(function (m) { return m.id === id; }) || {}).name || id;
    var _lb = { front: 'フロント', reception: '受付', mech: 'メカ' }[key] || key;
    if (window.pitLog) pitLog('メンバー設定を変更（' + _lb + '）', { kind: 'member', label: _who + ' → ' + val });
    saveProps().then(function (ok) {
      if (ok && window.showToast) showToast('メンバーの設定を保存しました');
    });
  };
})();
