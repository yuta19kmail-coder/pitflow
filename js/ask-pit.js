/* ========================================
   ask-pit.js  -  「聞く・知らせる」を1本に（v1.75.0）
   ----------------------------------------
   ◎なぜ作ったか（ゆうた報告 2026-08-10）
     「定休日に予約を入れようとすると **ブラウザ純正ポップアップ使用してる**」
     → 直したら、**ほかにも 45か所ほど残っていた**（付箋・代車・車両・設定・サンプル…）。
     全アプリの決めごと（2026-07-28）＝**ブラウザ標準の alert / confirm / prompt はやめる**。
     理由は3つ：
       ① 出ている間 **JS が止まる**ので「固まった・反応が悪い」と感じる
       ② 見た目がアプリと別物（どのサイトか分からない素っ気ない窓）
       ③ スマホでは URL が頭に出て**業務アプリらしくない**

   ◎使い方（この3つだけ覚えればいい）
     pitAlert('保存できませんでした', { title:'エラー' })           … 知らせるだけ
     pitAsk('この付箋を消しますか？', { danger:true }).then(ok => { if (!ok) return; …消す… })
     pitAskText('追加する部位名は？', '').then(v => { if (v == null) return; …足す… })

   ◎🔴 いちばん大事な注意
     **答えが返るのは「後」になる（非同期）。**
     だから `if (!confirm(...)) return;` のように**その場で分岐できない**。
     続きは必ず `.then()` の中に入れること。
     ⚠ 続きが長い時は、**先に関数へ切り出してから** `.then(fn)` で呼ぶ。
        `.then` の中に本文を丸ごとコピーすると、聞く道と聞かない道で**写しができる**。

   ◎ui-dialog.js（全アプリ共通部品）が無い時だけ、純正に落ちる（保険）。
     ⚠ 保険の側を先に書かないこと。ふだんは必ずアプリ内ダイアログが出る。
   ======================================== */
(function () {
  'use strict';

  function _has(){ return !!(window.UI && UI.confirm && UI.alert); }

  /* 知らせるだけ（OKボタン1つ）。戻り値は Promise だが、待たなくてよい場面がほとんど。 */
  window.pitAlert = function (msg, opt) {
    if (_has()) return UI.alert(msg, opt || {});
    try { window.alert(msg + (opt && opt.detail ? '\n\n' + opt.detail : '')); } catch (e) {}
    return Promise.resolve(true);
  };

  /* はい／いいえ。**必ず .then で受ける**（true＝はい） */
  window.pitAsk = function (msg, opt) {
    if (_has()) return UI.confirm(msg, opt || {});
    return Promise.resolve(!!window.confirm(msg + (opt && opt.detail ? '\n\n' + opt.detail : '')));
  };

  /* 文字を入れてもらう。**やめたら null**（空文字と区別すること） */
  window.pitAskText = function (msg, value, opt) {
    if (window.UI && UI.prompt) return UI.prompt(msg, value == null ? '' : value, opt || {});
    var v = window.prompt(msg, value == null ? '' : value);
    return Promise.resolve(v == null ? null : v);
  };

})();
