/* ============================================
   coreflow-presence.js  ―  気配（プレゼンス）／全アプリ共通
   v1.0（2026-08-01）：CoreNote / CoreBoard の「完全リアルタイム同期」用。

   ◎ 何をするもの
     「いま誰がどのノート（ボード）を開いていて、どの部品を触っているか」だけを
     お互いに教え合う。**ノートやボードの中身には一切触らない。**

       companies/{cid}/corePresence/{uid}     ← 1人1件だけ
         { room  : 'corenote:<noteId>' | 'coreboard:<boardId>',
           uid, name, photo,
           sel   : [部品id, …]（最大20）      ← 選んでいるもの
           edit  : 部品id | null               ← いま書いている／動かしているもの
           since : 部屋に入った時刻（色の順番を決めるのに使う）
           at    : 生存確認の時刻 }

   ◎ 色の決まり
     自分＝ピンク（板の上には自分の気配は出さない）。
     他の人＝**部屋に入った順**に ブルー→グリーン→オレンジ→パープル→水色→赤。
     入った時刻はサーバーの時計で決まるので、**全員の画面で同じ色**になる。
     7人目からは先頭に戻る（顔が出ているので迷わない）。

   ◎ 通信量
     1人1件・数十バイト。書くのは「選び直した時」と「45秒に1回の生存確認」だけ。
     5人が8時間開きっぱなしでも 1日3〜4千回＝無料枠（1日2万回）の中に収まる。

   ◎ 置き場所のルール
     本体は `_shared\coreflow-presence.js` だけ。各アプリの js\ にあるのは配られたコピー。
     直す時は _shared を直して sync-shared.ps1 を走らせる（?v= も自動で上がる）。

   ⚠ Firestore のルールに corePresence の許可が要る（無いと気配だけ権限エラー）。
   ⚠ 絞り込みは room の**等値ひとつだけ**にしてある。2つ重ねると複合インデックスが要るため。
   ============================================ */
(function (w, d) {
  'use strict';
  if (w.CFPresence) return;

  /* ---------- 決め事 ---------- */
  var PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444'];
  var PALNAME = ['ブルー', 'グリーン', 'オレンジ', 'パープル', '水色', '赤'];
  var ME_COLOR = '#ec4899';          // 自分＝ピンク（CoreNote の選択枠と同じ色）
  var STALE_MS = 90000;              // これより古い気配は「もう居ない」とみなす
  var BEAT_MS  = 45000;              // 生存確認の間隔（画面が見えている時だけ）
  var SWEEP_MS = 15000;              // 古い気配の掃除を見に行く間隔
  var DEBOUNCE = 250;                // 選択・編集が変わってから書くまで
  var MAX_SEL  = 20;

  /* ---------- 内部の状態 ---------- */
  var _on = false, _db = null, _cid = 'kobayashi_motors', _uid = null, _me = null;
  var _room = null, _sel = [], _edit = null, _since = 0;
  var _unsub = null, _beat = null, _sweep = null, _deb = null;
  var _raw = [];                     // 受け取ったままの一覧（自分を除く）
  var _live = [];                    // 生きているものだけ＋色を付けたもの
  var _onChange = null;
  var _wrote = false;                // 一度でも書いたか（消す必要があるか）

  function col() {
    return _db.collection('companies').doc(_cid).collection('corePresence');
  }
  function myDoc() { return col().doc(_uid); }
  function now() { return Date.now(); }

  /* at / since は serverTimestamp なので、届くまでの一瞬は null になる。
     その間は「たった今」として扱う（消えたと誤判定しないため）。 */
  function ms(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (e) { return 0; } }
    if (v.seconds != null) return v.seconds * 1000;
    return 0;
  }

  /* ---------- 生きている人＋色を決める ---------- */
  function rebuild() {
    var t = now();
    var alive = _raw.filter(function (p) {
      var at = ms(p.at);
      return (at === 0) || (t - at < STALE_MS);      // 0＝まだサーバーに届いていない＝新しい
    });
    /* 部屋に入った順（サーバーの時計）。同着は uid で並べて、全員の画面で同じ並びにする。 */
    alive.sort(function (a, b) {
      var sa = ms(a.since) || ms(a.sinceMs) || 0, sb = ms(b.since) || ms(b.sinceMs) || 0;
      if (sa !== sb) return sa - sb;
      return (a.uid < b.uid) ? -1 : (a.uid > b.uid ? 1 : 0);
    });
    alive.forEach(function (p, i) {
      p.color = PALETTE[i % PALETTE.length];
      p.colorName = PALNAME[i % PALNAME.length];
      p.order = i;
    });
    var before = _live.map(function (p) { return p.uid + ':' + p.color + ':' + (p.edit || '') + ':' + (p.sel || []).join(','); }).join('|');
    _live = alive;
    var after = _live.map(function (p) { return p.uid + ':' + p.color + ':' + (p.edit || '') + ':' + (p.sel || []).join(','); }).join('|');
    if (before !== after && _onChange) { try { _onChange(_live); } catch (e) { } }
  }

  /* ---------- 書く ---------- */
  function payload() {
    var o = {
      room: _room || '',
      uid: _uid,
      name: (_me && _me.name) || '',
      photo: (_me && _me.photo) || '',
      sel: (_sel || []).slice(0, MAX_SEL),
      edit: _edit || null,
      sinceMs: _since,
      at: w.fb && w.fb.serverTimestamp ? w.fb.serverTimestamp() : new Date()
    };
    return o;
  }
  function writeNow(withSince) {
    if (!_on || !_db || !_uid || !_room) return;
    var o = payload();
    if (withSince) o.since = (w.fb && w.fb.serverTimestamp) ? w.fb.serverTimestamp() : new Date();
    _wrote = true;
    myDoc().set(o, { merge: !withSince }).catch(function (e) {
      /* 権限が無い等。気配が出ないだけで、ノートの読み書きには影響させない。 */
      if (w.console) console.warn('[CFPresence] write', e && (e.code || e.message));
    });
  }
  function writeSoon() {
    clearTimeout(_deb);
    _deb = setTimeout(function () { writeNow(false); }, DEBOUNCE);
  }
  function erase() {
    if (!_wrote || !_db || !_uid) return;
    _wrote = false;
    try { myDoc().delete(); } catch (e) { }
  }

  /* ---------- 読む ---------- */
  function listen() {
    if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
    if (!_on || !_db || !_room) { _raw = []; rebuild(); return; }
    var room = _room;
    _unsub = col().where('room', '==', room).onSnapshot(function (snap) {
      if (room !== _room) return;                     // 部屋を移った後に届いた分は捨てる
      var arr = [];
      snap.forEach(function (docu) {
        var o = docu.data() || {};
        o.uid = docu.id;
        if (o.uid === _uid) return;                   // 自分は出さない
        if (!Array.isArray(o.sel)) o.sel = [];
        arr.push(o);
      });
      _raw = arr;
      rebuild();
    }, function (e) {
      if (w.console) console.warn('[CFPresence] listen', e && (e.code || e.message));
      _raw = []; rebuild();
    });
  }

  /* ---------- 公開 ---------- */
  var API = {
    /* start({db, cid, uid, me:{name,photo}, onChange}) */
    start: function (opt) {
      opt = opt || {};
      _db = opt.db || (w.fb && w.fb.db);
      if (!_db) return false;
      _cid = opt.cid || _cid;
      _uid = opt.uid || (w.fb && w.fb.currentUser && w.fb.currentUser.uid);
      if (!_uid) return false;
      _me = opt.me || (w.fb && w.fb.currentMember) || {};
      _onChange = opt.onChange || null;
      _on = true;

      clearInterval(_beat);
      _beat = setInterval(function () {
        if (d.visibilityState === 'visible') writeNow(false);
      }, BEAT_MS);

      clearInterval(_sweep);
      _sweep = setInterval(rebuild, SWEEP_MS);

      /* すでに部屋が決まっていたら（起動より先にノートを開いていた場合）ここで貼り直す */
      if (_room) { if (!_since) _since = now(); listen(); writeNow(true); }

      if (!API._bound) {
        API._bound = true;
        w.addEventListener('beforeunload', function () { erase(); });
        w.addEventListener('pagehide', function () { erase(); });
        d.addEventListener('visibilitychange', function () {
          if (d.visibilityState === 'visible') writeNow(false);
        });
      }
      return true;
    },

    /* 部屋（ノート／ボード）を移る。null で「どこにも居ない」 */
    setRoom: function (roomId) {
      if (_room === roomId) return;
      erase();
      _room = roomId || null;
      _sel = []; _edit = null; _since = now();
      listen();
      if (_room) writeNow(true);
    },

    setSel: function (ids) {
      var a = (ids || []).slice(0, MAX_SEL);
      if (a.join(',') === (_sel || []).join(',')) return;
      _sel = a; writeSoon();
    },

    setEdit: function (id) {
      var v = id || null;
      if (v === _edit) return;
      _edit = v;
      /* 書き始め／書き終わりは待たずにすぐ知らせる（ぶつかり防止の効きが鈍るため） */
      clearTimeout(_deb); writeNow(false);
    },

    /* いま生きている他の人（色つき） */
    list: function () { return _live.slice(); },

    /* その部品を「書いている」人。居なければ null */
    editorOf: function (id) {
      if (!id) return null;
      for (var i = 0; i < _live.length; i++) if (_live[i].edit === id) return _live[i];
      return null;
    },

    /* その部品を「選んでいるだけ」の人たち（書いている人は含めない） */
    viewersOf: function (id) {
      if (!id) return [];
      return _live.filter(function (p) { return p.edit !== id && (p.sel || []).indexOf(id) >= 0; });
    },

    room: function () { return _room; },
    meColor: function () { return ME_COLOR; },
    palette: function () { return PALETTE.slice(); },

    stop: function () {
      erase();
      _on = false; _room = null; _raw = []; _live = [];
      clearTimeout(_deb); clearInterval(_beat); clearInterval(_sweep);
      if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
      if (_onChange) { try { _onChange(_live); } catch (e) { } }
    },

    /* テスト用：時間の決まりを外から見る */
    _const: { STALE_MS: STALE_MS, BEAT_MS: BEAT_MS, DEBOUNCE: DEBOUNCE, PALETTE: PALETTE }
  };

  w.CFPresence = API;
})(window, document);
