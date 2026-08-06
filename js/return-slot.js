/* ========================================
   return-slot.js  ── PitFlow v1.60.0
   「返車の車が、いま画面のどこに出るか」を決める**たった1本の物差し**と、
   返車時間の**入力ガイド（ピッカー＋ショートカット）の共通部品**。
   ----------------------------------------
   ◎なぜ作ったか（ゆうた報告）
     「**完TEL待ちのエリアで日時を入れたのに返車カレンダーに移動しない**」
     正体は、入れる場所ごとに“行き先の決め方”がバラバラで、しかも入れたあと
     画面を描き直していなかったこと。行き先の判断を**ここ1か所**に集めて、
     どこから入れても同じ結論・同じ描き直し・同じお知らせになるようにした。

   ◎行き先は4つだけ（pitReturnPlace）
     'callWait'  … 完TEL待ち   （完TEL依頼ぶん・まだお客さんに電話していない）
     'dateTbd'   … 返車日未定  （完TEL済だが返車日がまだ）
     'timeTbd'   … 返車時間未定（日は決まったが時間がまだ＝「未定」か空）
     'calendar'  … 返車予定カレンダー（日と時間がそろった）
     null        … 返車の待ち行列にいない（実績・廃車など）
     ⚠ 'timeTbd' の車は**返車カレンダーの「時刻未定」にも同時に出る**（ゆうた指定）。
        カレンダー側のふるい（return.js）は returnDate があるかどうかで見ているので、
        こちらを足しても向こうは触らなくてよい。

   ◎「時刻不明」と「時間未定」は別もの（ここを混ぜない）
     決まり次第・レッカー・勝手に取る … **決めた上での時刻不明** → カレンダーの「時刻未定」へ
     未定・空                          … **まだ決めていない**     → 「返車時間未定」に残る
     判定は state.js の pitTimeTbd（表は PIT_TIME_ALL の1本）。
   ======================================== */
(function () {
  'use strict';

  function _esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

  /* ---------------------------------------------------------------
     ① 行き先の物差し
     --------------------------------------------------------------- */
  function pitReturnPlace(c){
    if (!c) return null;
    if (!c.returnStage) return null;                                   // まだ作業中（盤面にいる）
    if (c.status === 'returned' || c.status === 'scrap') return null;  // もう実績・廃車
    if (c.returnStage === 'callWait') return 'callWait';
    if (!c.returnDate) return 'dateTbd';
    if (window.pitTimeTbd ? pitTimeTbd(c.returnTime) : !c.returnTime) return 'timeTbd';
    return 'calendar';
  }
  window.pitReturnPlace = pitReturnPlace;

  var PLACE_LABEL = {
    callWait: '完TEL待ち',
    dateTbd:  '返車日未定',
    timeTbd:  '返車時間未定',
    calendar: '返車予定カレンダー'
  };
  function pitReturnPlaceLabel(p){ return PLACE_LABEL[p] || ''; }
  window.pitReturnPlaceLabel = pitReturnPlaceLabel;

  /* ---------------------------------------------------------------
     ② 返車の日付・時間を書き込む**唯一の入口**
        date / time は「渡さなければ触らない」。空文字を渡せば消す。
        戻り値 { before, after, moved } … 行き先が変わったかどうか。
     🔴 **日付が入った＝完TEL済** とみなして returnStage を 'returnWait' に上げる。
        （完TEL待ちの車に返車日を入れたのに完TEL待ちのまま、が今までのバグ）
     --------------------------------------------------------------- */
  function pitReturnSetDateTime(c, date, time){
    if (!c) return null;
    var before = pitReturnPlace(c);

    if (date !== undefined){
      c.returnDate = date || '';
      if (c.returnDate){
        c.returnStage = 'returnWait';
        c.returnDateFinal = c.returnDate;
      }
    }
    if (time !== undefined){
      c.returnTime = (window._normTime ? _normTime(time || '') : (time || ''));
    }
    c.returnTbd = false;   // 旧フラグは使わない（returnStage / 日付 に一本化）

    var after = pitReturnPlace(c);
    return { before: before, after: after, moved: (before !== after) };
  }
  window.pitReturnSetDateTime = pitReturnSetDateTime;

  /* 書き込んだあとの後始末を1か所に。保存・描き直し・お知らせをまとめてやる。
     🔴 ここを通さないと「入れたのに画面が変わらない（＝移動しないように見える）」が起きる。 */
  function pitReturnCommit(c, res, opt){
    opt = opt || {};
    if (window.logFlow && res && res.moved && res.after){
      logFlow(c, '返車の予定を更新 → ' + pitReturnPlaceLabel(res.after)
              + (c.returnDate ? '（' + c.returnDate + (c.returnTime ? ' ' + c.returnTime : '') + '）' : ''));
    }
    if (window.PitDB && PitDB.save) PitDB.save(true);
    if (window.state && state.currentView && window.showView) showView(state.currentView);
    if (window.PitPip && PitPip.isOpen && PitPip.isOpen()) PitPip.refresh();
    if (!opt.silent && res && res.moved && res.after && window.pitToast){
      pitToast(pitReturnPlaceLabel(res.after) + 'へ移しました');
    }
    return res;
  }
  window.pitReturnCommit = pitReturnCommit;

  /* ---------------------------------------------------------------
     ③ 時間の入力ガイド（共通部品）
        見た目は新規予約の入庫時間とまったく同じ（css/polish.css の .cf-time を借りる）。
        🔴 **HTMLを書き写さないこと。** 予約も返車もここを呼ぶ。
        opt.list … ボタンに出す一覧（PIT_TIME_QUICK / PIT_RETURN_TIME_QUICK）
        opt.cls  … 外枠に足すクラス（見分け用）
     --------------------------------------------------------------- */
  /* 時間ピッカー(input type=time)に入れる値。単一の HH:MM の時だけ返す
     （範囲「09:00-10:00」やショートカットの言葉は空＝ピッカーは空表示）。
     🔴 予約側（card-detail.js の _timePickVal）もこれを呼ぶ。書き写さないこと。 */
  function _pickVal(v){
    var n = (window._normTime ? _normTime(v || '') : String(v || ''));
    var m = (String(n).split('-')[0] || '').match(/^\d{2}:\d{2}$/);
    return m ? m[0] : '';
  }
  window.pitTimePickVal = _pickVal;

  function pitTimeGuideHtml(cur, opt){
    opt = opt || {};
    var list = opt.list || window.PIT_TIME_QUICK || [];
    var val  = String(cur == null ? '' : cur);
    var h = '<div class="cf-time' + (opt.cls ? ' ' + opt.cls : '') + '">';
    h += '<input type="text" class="cf-input cf-time-main" value="' + _esc(val) + '" placeholder="'
       + _esc(opt.placeholder || '900 / 9時半 / 9:00-10:00 など') + '" autocomplete="off">';
    h += '<div class="cf-time-guide">';
    h += '<div class="cf-time-l">時間で選ぶ</div><input type="time" class="cf-input cf-time-pick" value="' + _esc(_pickVal(val)) + '">';
    h += '<div class="cf-time-l">ショートカット</div><div class="cf-time-quick">';
    /* ⚠ ボタンに出すのは**ラベルだけ**。（）内の時間は出さない（マウスを乗せた時の説明にだけ入れる）。 */
    list.forEach(function (it){
      var label = (typeof it === 'string') ? it : it.label;
      var q = (window.pitTimeQuick ? pitTimeQuick(label) : null) || {};
      var tip = q.tbd ? 'まだ決めていない扱い（「返車時間未定」に残ります）'
              : q.unknown ? '時間が決まっていない扱い（その日のいちばん後ろに並びます）'
              : (q.from ? ('目安 ' + q.from + '〜' + (q.to || '') + '（この時間で並びます）') : '');
      h += '<button type="button" class="cf-chip cf-chip-tm' + (q.unknown ? ' cf-chip-tbd' : '')
         + (val === label ? ' active' : '') + '" data-val="' + _esc(label) + '"'
         + (tip ? ' title="' + _esc(tip) + '"' : '') + '>' + _esc(label) + '</button>';
    });
    h += '</div></div></div>';
    return h;
  }
  window.pitTimeGuideHtml = pitTimeGuideHtml;

  /* ガイドの配線。wrap＝pitTimeGuideHtml が作った .cf-time の要素。
       onInput (v)  … 打っている最中（保存はしない）
       onCommit(v)  … 確定した（整形済み。ここで保存する）
     二重配線しないよう、済んだ枠には印（data-tgbound）を付ける。 */
  function pitTimeGuideBind(wrap, o){
    if (!wrap || wrap.getAttribute('data-tgbound') === '1') return;
    wrap.setAttribute('data-tgbound', '1');
    o = o || {};
    var mainEl = wrap.querySelector('.cf-time-main');
    var pickEl = wrap.querySelector('.cf-time-pick');
    var sync = function (v){
      wrap.querySelectorAll('.cf-time-quick .cf-chip').forEach(function (b){ b.classList.toggle('active', b.dataset.val === v); });
      if (pickEl) pickEl.value = _pickVal(v);
    };
    var commit = function (v){ if (mainEl) mainEl.value = v; sync(v); if (o.onCommit) o.onCommit(v); };

    if (mainEl){
      mainEl.addEventListener('focus', function (){ wrap.classList.add('open'); });
      mainEl.addEventListener('input', function (){
        var v = (window._timeHalf ? _timeHalf(mainEl.value) : mainEl.value);
        if (mainEl.value !== v) mainEl.value = v;
        sync(v);
        if (o.onInput) o.onInput(v);
      });
      mainEl.addEventListener('change', function (){
        commit(window._normTime ? _normTime(mainEl.value) : mainEl.value);
      });
    }
    if (pickEl){
      pickEl.addEventListener('change', function (){ if (pickEl.value) commit(pickEl.value); });
    }
    wrap.querySelectorAll('.cf-time-quick .cf-chip').forEach(function (btn){
      btn.addEventListener('mousedown', function (e){ e.preventDefault(); });
      btn.addEventListener('click', function (){ commit(btn.dataset.val); if (mainEl) mainEl.focus(); });
    });
    wrap.addEventListener('focusout', function (e){ if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('open'); });
  }
  window.pitTimeGuideBind = pitTimeGuideBind;

  /* いま枠に入っている時間（整形済み）を読む。ポップアップの「返車へ」で使う。 */
  function pitTimeGuideValue(wrap){
    var m = wrap && wrap.querySelector('.cf-time-main');
    var v = m ? m.value : '';
    return window._normTime ? _normTime(v) : v;
  }
  window.pitTimeGuideValue = pitTimeGuideValue;
})();
