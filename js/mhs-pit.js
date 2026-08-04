/* ========================================
   mhs-pit.js  -  MHS の予定を読む（新規予約の「担当の予定」）  PitFlow v1.22.0
   ----------------------------------------
   ◎なにをするもの
     新規予約カードで**フロント担当を選ぶと、その人の入庫日の予定**が出る。
     「その日その人がつかまるか」を、予約を入れる前に見るためのもの。

   ◎どこから読むか
     companies/kobayashi_motors/appSummaries/mhsDigest-YYYY-MM
     ＝ MHS が **展開まで済ませて配ってくれる**「日×人」の一覧。
       { days: { '2026-08-10': { '<メンバーID>': [ {t,ty,l}, … ] } } }

   🔴 なぜ PitFlow で展開しないのか
     繰り返し・期間・ルーティン・当番・休日振替の計算は **MHS にしかない知識**。
     こちらに同じ計算を持つと、片方を直した時に必ずずれる。**読むだけにしてある。**

   ⚠ 配っているのは「MHSを開いている人」。誰も開かない日が続くと古くなるので、
      **最終更新（updatedAt）を画面に出す**。古ければ画面から分かる。
   ⚠ 🔒非公開の予定は MHS 側で除いてある（こちらには届かない）。
   ⚠ ルールの変更は不要（appSummaries は既に許可済みのコレクション）。
   ======================================== */
(function () {
  'use strict';

  var _cache = {};      // { 'YYYY-MM': { days:{…}, updatedAt: ms } }
  var _unsubs = {};     // 購読中の月
  var _wanted = {};     // 欲しがった月（重複購読しない）

  function _co(){
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db.collection('companies').doc(window.fb.currentCompanyId).collection('appSummaries');
  }
  function _ymOf(dateStr){ return String(dateStr || '').slice(0, 7); }

  /* その月を購読する（1回だけ）。届いたら、開いている画面を描き直す。 */
  function want(ym){
    if (!ym || _wanted[ym]) return;
    var co = _co();
    if (!co) return;                       /* ログイン前・サンプルモードは何もしない */
    _wanted[ym] = 1;
    try {
      _unsubs[ym] = co.doc('mhsDigest-' + ym).onSnapshot(function (d){
        if (!d.exists){ _cache[ym] = { days:{}, updatedAt:0, missing:true }; _redraw(); return; }
        var v = d.data() || {};
        var at = 0;
        try { at = (v.updatedAt && v.updatedAt.toMillis) ? v.updatedAt.toMillis() : 0; } catch(e){}
        _cache[ym] = { days: v.days || {}, updatedAt: at, missing:false };
        _redraw();
      }, function (err){
        console.warn('[mhs-pit] ' + ym + ' の予定を読めませんでした', err);
        _cache[ym] = { days:{}, updatedAt:0, error:true };
        _redraw();
      });
    } catch(e){ console.warn('[mhs-pit] 購読に失敗', e); }
  }

  /* 予定が届いたら、いま開いているカードだけ描き直す（画面全体は触らない）。
     ⚠ 描き直しの入口は card-detail.js の window.pitCardRepaint()。
        入力中の値は c（カード）側に随時入っているので、描き直しで消えることはない。 */
  var _rt = null;
  function _redraw(){
    clearTimeout(_rt);
    _rt = setTimeout(function (){
      try { if (window.pitCardRepaint) window.pitCardRepaint(); } catch(e){}
    }, 150);
  }

  /* 名前 → メンバーID。PitFlow の担当は「名前の文字」で持っているので、名簿で引き直す。
     ⚠ 通称・本名のどちらでも引けるように pitStaffAny → pitStaffByName の順で当たる。 */
  function _idOf(staffName){
    var n = String(staffName || '').trim();
    if (!n) return '';
    var s = null;
    try { if (window.pitStaffAny)    s = pitStaffAny(n); } catch(e){}
    try { if (!s && window.pitStaffByName) s = pitStaffByName(n); } catch(e){}
    if (!s && window.state && state.staff){
      s = state.staff.find(function (x){ return x && (x.name === n || (x.aliases || []).indexOf(n) >= 0); });
    }
    return (s && s.id) || '';
  }

  /* 🔌 card-detail.js が呼ぶフック。{t, type, label} の配列を返す（無ければ空） */
  window.pitMhsSchedule = function (staffName, dateStr){
    var ym = _ymOf(dateStr);
    if (!ym) return [];
    want(ym);                                   /* まだ読んでいない月ならここで購読を始める */
    var box = _cache[ym];
    if (!box) return [];                        /* 届くまでは空（届いたら描き直す） */
    var id = _idOf(staffName);
    if (!id) return [];
    var day = box.days && box.days[dateStr];
    var list = (day && day[id]) || [];
    /* card-detail.js が知っているキー名（t / type / label）に詰め替える */
    return list.map(function (x){
      return { t: x.t || '', type: _uiType(x.ty), label: x.l || '' };
    }).sort(function (a, b){
      var A = a.t || '~', B = b.t || '~';       /* 時刻なしは後ろ */
      return A < B ? -1 : (A > B ? 1 : 0);
    });
  };

  /* MHS の種別 → card-detail.js のアイコン（mtg / out / off / routine / duty）。
     知らない種別が来ても崩れないよう、既定は mtg（社内予定）に寄せる。 */
  function _uiType(ty){
    if (ty === 'out')     return 'out';
    if (ty === 'off')     return 'off';
    if (ty === 'duty')    return 'duty';
    if (ty === 'routine') return 'routine';
    return 'mtg';
  }

  /* 画面に出す「この予定はいつ時点のものか」。card-detail.js が使う。 */
  window.pitMhsStatus = function (dateStr){
    var ym = _ymOf(dateStr);
    if (!ym) return null;
    want(ym);
    var box = _cache[ym];
    if (!box) return { state:'loading' };
    if (box.error)   return { state:'error' };
    if (box.missing) return { state:'none' };
    var at = box.updatedAt || 0;
    var days = at ? Math.floor((Date.now() - at) / 86400000) : null;
    return { state:'ok', updatedAt:at, staleDays:days };
  };

  console.log('[mhs-pit] ready（MHSが配る appSummaries/mhsDigest-YYYY-MM を読みます）');
})();
