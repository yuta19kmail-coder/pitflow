/* ========================================
   blank-cards.js  -  空の予約カードを残さない（PitFlow）
   v1.16.0（2026-08-02）
   ----------------------------------------
   ◎ なにを直すもの
     「＋ 新規予約」を押すと、**入力する前に**カードが1枚できて保存される作りになっている。
     （v0.87.1：入力の途中でスマホの入力が丸ごと消える事故があり、その対策で
       「開いた瞬間に保存」に変えた。この作り自体は正しい。）
     ところが**何も入れずにやめた時に捨てる処理が無く**、空のカードが永久に残っていた。

     残った空カードは
       ・入庫日＝作った日／状態＝予約  なので **「今日の入庫」「預かり中」に数えられる**
       ・時間が空なので**予約ビューのどの枠にも出ない**（「予約 2 件」とだけ出て中身が見えない）
     ＝画面から見つけられないまま数字だけ増える、という一番たちの悪い形になっていた。

   ◎ ここでやること（2つ）
     ① これから … 新規予約を**何も入れずに閉じたら、そのカードを黙って捨てる**。
        ⚠ 捨てるのは「このセッションで新規予約として作ったカード」だけ。
           もともとあったカードには絶対に触らない（下の _born を参照）。
     ② いままで … 設定に「空の予約カードを片付ける」を出す（管理・本番のみ）。
        件数を見せてから、押した時だけ消す。操作ログに残す。

   ◎ 「空」の決め方（pitIsBlankCard）
     **人が入れる項目を1つずつ並べて、全部カラなら空**とみなす（ホワイトリスト方式）。
     ⚠ 逆（「これ以外は無視」のブラックリスト）にしないこと。項目が増えた時に
        「新しい項目に入力があるのに空と判定して消す」事故になる。
     ⚠ 自動で入るもの（予約番号・入庫日・予約受付日・予約担当・作成ログ）は数に入れない。
        これらは開いた瞬間に勝手に入るので、あるからといって「人が入力した」ことにならない。

   公開：window.pitIsBlankCard(c) / window.pitCleanBlankCards() / window.pitOpenBlankClean()
   ======================================== */
(function (w, d) {
  'use strict';

  /* ---- 人が入れる項目（ここに無いものは判定に使わない） ---- */
  var TEXTS = [
    'customer', 'kana', 'tel', 'plate', 'maker', 'car', 'model',
    'menu', 'memo', 'karteNo', 'lstepId', 'lineId', 'lineStatus',
    'reserveTime', 'returnDate', 'returnDateFinal', 'decided',
    'boardId', 'division', 'frontStaff', 'workType', 'dropType', 'dropType2',
    'estHoldDays', 'repeat', 'customerId', 'outsource', 'outsourceDate',
    'loanerId', 'loanerModel', 'phase', 'bayId'
  ];
  var FLAGS = [
    'consult', 'needLoaner', 'needWash', 'urgent', 'tentative', 'testDrive',
    'headlight', 'coatingOK', 'salesReq', 'emergency'
  ];
  var NUMS = ['estAmount', 'amountQuote', 'amountOrder', 'amountFinal'];
  var LISTS = ['contacts', 'workSpecials', 'checks', 'slots'];

  function _has(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'boolean') return v === true;
    if (typeof v === 'number') return true;              /* 0 も「入れた」扱い */
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }

  /* このカードは「何も入力されていない新規予約」か？ */
  function isBlank(c) {
    if (!c || typeof c !== 'object') return false;
    if (c._sample) return false;                          /* サンプルは触らない */
    if (c.status && c.status !== 'reserved') return false;/* 動かしたカードは触らない */
    var i;
    for (i = 0; i < TEXTS.length; i++) if (_has(c[TEXTS[i]])) return false;
    for (i = 0; i < FLAGS.length; i++) if (_has(c[FLAGS[i]])) return false;
    for (i = 0; i < NUMS.length;  i++) if (_has(c[NUMS[i]]))  return false;
    for (i = 0; i < LISTS.length; i++) if (_has(c[LISTS[i]])) return false;
    /* ログが「予約作成」1件より多い＝人が何か操作している */
    if (Array.isArray(c.log) && c.log.length > 1) return false;
    return true;
  }
  w.pitIsBlankCard = isBlank;

  /* =========================================================
     ① これから：新規予約を空のまま閉じたら捨てる
     ========================================================= */

  /* このセッションで「新規予約」として作ったカードの id。
     ⚠ ここに入っている id しか自動では消さない。 */
  var _born = {};

  function _remember() {
    /* 直前に増えたカード＝いま作られたもの、を覚える */
    var arr = (w.state && w.state.cards) || [];
    if (arr.length) _born[arr[arr.length - 1].id] = 1;
  }

  /* 覚えている新規カードのうち、空のものを捨てる */
  function sweepBorn() {
    if (!w.state || !Array.isArray(w.state.cards)) return 0;
    var ids = Object.keys(_born);
    if (!ids.length) return 0;
    var gone = 0;
    w.state.cards = w.state.cards.filter(function (c) {
      if (!_born[c.id]) return true;
      if (!isBlank(c)) { delete _born[c.id]; return true; }  /* 入力されたので、もう見張らない */
      gone++; delete _born[c.id];
      return false;
    });
    if (gone) {
      try { if (w.PitDB) w.PitDB.save(true); } catch (e) { console.warn('[blank-cards] 保存でエラー', e); }
      console.log('[blank-cards] 空の新規予約を ' + gone + ' 枚捨てました');
    }
    return gone;
  }
  w.pitSweepBlankNew = sweepBorn;

  /* ---- 新規予約の入口を包んで、作った id を覚える ---- */
  function wrapOpeners() {
    ['openNewReserve', 'custNewReserveFor', 'custNewReserveFromCard'].forEach(function (nm) {
      var f = w[nm];
      if (typeof f !== 'function' || f.__blankWrap) return;
      var g = function () {
        sweepBorn();                    /* 前に開きっぱなしの空カードがあれば、ここで片付く */
        var r = f.apply(this, arguments);
        try { _remember(); } catch (e) {}
        return r;
      };
      g.__blankWrap = 1;
      w[nm] = g;
    });
  }

  /* ---- 閉じる／別の画面へ移るタイミングで掃く ---- */
  function wrapClosers() {
    if (typeof w.closeDetail === 'function' && !w.closeDetail.__blankWrap) {
      var cd = w.closeDetail;
      var g = function () { var r = cd.apply(this, arguments); try { sweepBorn(); } catch (e) {} return r; };
      g.__blankWrap = 1; w.closeDetail = g;
    }
    if (typeof w.showView === 'function' && !w.showView.__blankWrap) {
      var sv = w.showView;
      var h = function (v) {
        /* カード画面から出る時だけ掃く（カード画面の中では消さない＝入力中に消えない） */
        if (v !== 'card') { try { sweepBorn(); } catch (e) {} }
        return sv.apply(this, arguments);
      };
      h.__blankWrap = 1; w.showView = h;
    }
  }

  /* タブを閉じる・リロードする時も一応（保存が間に合わない事はあるので設定の片付けが本命） */
  w.addEventListener('beforeunload', function () { try { sweepBorn(); } catch (e) {} });

  /* =========================================================
     ② いままで：設定に「空の予約カードを片付ける」
     ========================================================= */
  function isCloud() { return !!w.PIT_CLOUD; }
  function isAdmin() { return !w.pitIsAdmin || w.pitIsAdmin(); }
  function canShow() { return isCloud() && isAdmin(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function blanks() {
    return ((w.state && w.state.cards) || []).filter(isBlank);
  }

  function injectCSS() {
    if (d.getElementById('pit-blank-css')) return;
    var st = d.createElement('style');
    st.id = 'pit-blank-css';
    st.textContent =
      '.pit-blank-box{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-top:14px}' +
      '.pit-blank-box h4{margin:0 0 6px;font-size:14px;display:flex;align-items:center;gap:6px}' +
      '.pit-blank-box p{margin:0 0 12px;font-size:12px;color:var(--text2);line-height:1.7}' +
      '.pit-blank-box .pb-n{font-weight:800;color:var(--brand)}' +
      '.pit-blank-box .pb-go{padding:8px 14px;border-radius:8px;border:1px solid var(--border);' +
        'background:var(--bg3);color:var(--text);font-size:13px;font-weight:600;cursor:pointer}' +
      '.pit-blank-box .pb-go:disabled{opacity:.45;cursor:default}' +
      '.pit-blank-list{margin:0 0 12px;font-size:12px;color:var(--text3);line-height:1.8;max-height:150px;overflow:auto}';
    (d.head || d.documentElement).appendChild(st);
  }

  function appendBox() {
    var old = d.getElementById('pit-blank-box');
    if (!canShow()) { if (old && old.parentNode) old.parentNode.removeChild(old); return; }
    var host = d.getElementById('view-settings-body');
    if (!host) return;
    if (old && old.parentNode) old.parentNode.removeChild(old);   /* 件数を出すので毎回作り直す */
    injectCSS();
    var list = blanks();
    var rows = list.slice(0, 30).map(function (c) {
      return '・' + esc(c.resNo || '(番号なし)') + '　入庫日 ' + esc(c.reserveDate || '未設定');
    }).join('<br>');
    var box = d.createElement('div');
    box.id = 'pit-blank-box';
    box.className = 'pit-blank-box';
    box.innerHTML =
      '<h4><i data-ic=trash data-ics=16></i> 空の予約カードを片付ける</h4>' +
      '<p>「＋ 新規予約」を開いて<b>何も入れずにやめた</b>ぶんのカードです。' +
      'お客様も車も作業内容も入っていないのに、<b>「今日の入庫」「預かり中」に数えられて</b>しまいます。' +
      '予約ビューには時間が無いので出てこないため、ここから片付けます。<br>' +
      '<b>何か1つでも入力があるカードは対象になりません。</b></p>' +
      '<p>いま <span class="pb-n">' + list.length + '</span> 枚あります。</p>' +
      (rows ? '<div class="pit-blank-list">' + rows + (list.length > 30 ? '<br>ほか ' + (list.length - 30) + ' 枚' : '') + '</div>' : '') +
      '<button class="pb-go" onclick="pitOpenBlankClean()"' + (list.length ? '' : ' disabled') + '>' +
      (list.length ? 'この ' + list.length + ' 枚を片付ける…' : '片付けるものはありません') + '</button>';
    host.appendChild(box);
    try { if (w.icoBoot) w.icoBoot(box); } catch (e) {}
  }

  w.pitOpenBlankClean = function () {
    if (!canShow()) return;
    var list = blanks();
    if (!list.length) return;
    var msg = '空の予約カードを ' + list.length + ' 枚 片付けます。\n\n'
            + 'お客様・車・作業内容など、何か1つでも入っているカードは含まれていません。\n'
            + '消したものは戻せません。よろしいですか？';
    var go = function (ok) {
      if (!ok) return;
      var ids = {}; list.forEach(function (c) { ids[c.id] = 1; });
      w.state.cards = w.state.cards.filter(function (c) { return !ids[c.id]; });
      try { if (w.PitDB) w.PitDB.save(true); } catch (e) { console.warn('[blank-cards] 保存でエラー', e); }
      try { if (w.pitLog) w.pitLog('空の予約カードを片付けた', { label: list.length + ' 枚', kind: 'clean' }); } catch (e) {}
      try { if (w.showToast) w.showToast('空の予約カードを ' + list.length + ' 枚 片付けました'); } catch (e) {}
      try { if (w.showView) w.showView('settings'); } catch (e) {}
      console.log('[blank-cards] 片付け完了：' + list.length + ' 枚');
    };
    /* アプリ内ダイアログがあればそれ、無ければ素の confirm */
    if (w.uiConfirm) { w.uiConfirm(msg, { title: '空の予約カードを片付ける', ok: '片付ける' }).then(go); }
    else { go(w.confirm(msg)); }
  };

  /* ---- 設定画面が描かれるたびに入口を足す（reset-pit.js と同じやり方） ---- */
  function hookRender() {
    if (typeof w.renderSettings !== 'function' || w.renderSettings.__pitBlank) return false;
    var orig = w.renderSettings;
    var f = function () {
      var r = orig.apply(this, arguments);
      try { appendBox(); } catch (e) { console.warn('[blank-cards] 入口の追加でエラー', e); }
      return r;
    };
    f.__pitBlank = 1;
    w.renderSettings = f;
    return true;
  }

  function boot() {
    wrapOpeners();
    wrapClosers();
    if (!hookRender()) setTimeout(boot, 300);
    try { appendBox(); } catch (e) {}
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
  console.log('[blank-cards] ready');
})(window, document);
