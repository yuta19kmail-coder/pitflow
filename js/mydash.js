/* ========================================
   mydash.js  -  マイダッシュボード（ビルダー）／PitFlow v0.125.0
   ----------------------------------------
   ◎コンセプト
     役割別の固定ダッシュボードではなく、PitFlowの全要素を「BOX」化して
     ユーザーが自分で組めるビルダー。配置はアカウント単位で保存（state.settings.myDash）。
     ・検索バーと付箋（全体タスク）は先頭に常時固定＝OFF不可。
     ・各要素は 小/中/大/特大 の複数サイズで提供し、サイズごとに情報量を出し分ける。
     ・すべて「本物のデータ」を描画（サンプル乱数は使わない）。
     ・クリック挙動：
        - 閲覧時、BOX本体クリック＝下に展開（more＝深掘り情報）。もう一度で畳む。枠外クリックで畳む。
        - BOX内の行・カード・カレンダーのコマは個別にクリック＝そのカードを開く / その日のポップアップ。
        - フッターの「『○○』を開く →」＝そのビューへジャンプ。
        - 特大(xl)は本物の表/カレンダーを枠内に埋め込み（BOX内スクロール）＝展開不要。
     ・編集モード：⠿並べ替え（↑↓＋ドラッグ）・サイズ変更・✕削除・「＋ボックス追加」。
   ======================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------
  // 汎用ヘルパー
  // ---------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function teamOf(c) { return c && c.boardId === 'import' ? 'import' : 'default'; }
  function teamColor(c) { return teamOf(c) === 'import' ? '#ec4899' : '#1db97a'; }
  function nm(c) { return (window.pitSurname ? pitSurname(c.customer) : (c && c.customer)) || '（未入力）'; }
  function carOf(c) { return c && c.car ? String(c.car) : ''; }
  // 金額（確定＞受注＞概算＞タイプ平均）
  function amt(c) {
    if (!c) return 0;
    if (c.amountFinal != null) return +c.amountFinal || 0;
    if (c.amountOrder != null) return +c.amountOrder || 0;
    if (c.estAmount != null) return +c.estAmount || 0;
    var wt = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
    return window.pitEstAmount ? (pitEstAmount(wt, teamOf(c)) || 0) : 0;
  }
  function yen(n) { return '¥' + (Math.round(+n || 0)).toLocaleString('ja-JP'); }
  function man(n) {   // 円 → 「◯◯万」（1万未満はそのまま円）
    n = Math.round(+n || 0);
    if (Math.abs(n) >= 10000) return (Math.round(n / 1000) / 10) + '万';
    return n.toLocaleString('ja-JP');
  }
  function manUnit(n) { return Math.abs(Math.round(+n || 0)) >= 10000 ? '万' : '円'; }
  // 作業タイプの先頭ラベル＋色
  function wtChip(c) {
    var id = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
    var w = (state.workTypes || []).find(function (x) { return x.id === id; });
    if (!w) return '';
    return '<span class="md-wt" style="color:' + w.color + '">' + esc(w.label) + '</span>';
  }
  function daysAgo(dateStr) {   // dateStr から今日までの経過日数（過去=正）
    if (!dateStr) return null;
    var d = new Date(dateStr + 'T00:00:00'); if (isNaN(d)) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((t - d) / 86400000);
  }

  // ---------------------------------------------------------
  // 表示部品
  // ---------------------------------------------------------
  function kpi(n, u, sub, cls) {
    return '<div class="md-kpi ' + (cls || '') + '"><div class="md-n">' + n +
      (u ? '<small>' + u + '</small>' : '') + '</div>' +
      (sub ? '<div class="md-sub">' + sub + '</div>' : '') + '</div>';
  }
  // クリックで開ける行（card）。id を渡すと openDetail。
  function rowCard(id, main, right, rcls) {
    var oc = id ? ' onclick="event.stopPropagation();openDetail(\'' + esc(id) + '\')"' : '';
    return '<div class="md-row md-int' + (id ? ' md-click' : '') + '"' + oc + '>' +
      '<span class="md-row-m">' + main + '</span>' +
      (right ? '<span class="md-row-r ' + (rcls || '') + '">' + right + '</span>' : '') + '</div>';
  }
  function bigCard(id, l1, l2, color) {
    var oc = id ? ' onclick="event.stopPropagation();openDetail(\'' + esc(id) + '\')"' : '';
    return '<div class="md-card md-int md-click" style="border-left-color:' + (color || 'var(--brand,#26a269)') + '"' + oc + '>' +
      '<div class="md-c1">' + l1 + '</div>' + (l2 ? '<div class="md-c2">' + l2 + '</div>' : '') + '</div>';
  }
  function empty(msg) { return '<div class="md-empty">' + esc(msg || '該当なし') + '</div>'; }
  // 実データのスパークライン（数値配列）。cap を渡すと満杯ラインを赤で。
  function spark(vals, cap) {
    var mx = Math.max.apply(null, vals.concat(cap ? [cap] : [1]));
    if (mx <= 0) mx = 1;
    var h = vals.map(function (v) {
      var pct = Math.max(4, Math.round(v / mx * 100));
      var over = (cap && v >= cap);
      return '<i style="height:' + pct + '%;' + (over ? 'background:var(--red,#ef4444);opacity:.9' : '') + '" title="' + v + '"></i>';
    }).join('');
    return '<div class="md-spark">' + h + '</div>';
  }
  // 「そのビューを開く」フッター
  function openFoot(view, label) {
    return '<div class="md-open md-int" onclick="event.stopPropagation();showView(\'' + view + '\')">↳ 「' + esc(label) + '」を開く</div>';
  }
  // 予約の埋まり（本物）を横スクロールで n 日ぶん
  function calStrip(n) {
    var cols = window._dashCalCols ? _dashCalCols(0, n, C.today, C.tStr) : '';
    return '<div class="md-tiny" style="margin-top:8px">今後' + Math.round(n / 7) + '週間の空き（<span style="color:#1db97a">可</span>＝空きあり／<span style="color:#ef4444">終了</span>＝満枠／超過／休）</div>' +
      '<div class="md-cal-scroll"><div class="drc-grid"><div class="drc-col drc-lab"><div class="drc-h"></div><div class="drc-c">🚗 国産</div><div class="drc-c">🌍 輸入</div></div>' + cols + '</div></div>';
  }

  // ---------------------------------------------------------
  // 描画コンテキスト（1描画で1回計算）
  // ---------------------------------------------------------
  var C = null;
  function buildCtx() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var y = today.getFullYear(), m = today.getMonth();
    var wkS = (window.startOfWeek ? startOfWeek(today) : today);
    var closed = (state.settings && state.settings.closedDow) || [];
    // 次の営業日
    var nb = new Date(today);
    do { nb.setDate(nb.getDate() + 1); } while (closed.indexOf(nb.getDay()) >= 0);
    C = {
      cards: state.cards || [],
      today: today, tStr: ymd(today), y: y, m: m,
      moS: ymd(new Date(y, m, 1)), moE: ymd(new Date(y, m + 1, 0)),
      wkS: ymd(wkS), wkE: ymd(addDays(wkS, 6)),
      nextBiz: ymd(nb),
      cap: (window._dashCap ? _dashCap() : ((state.settings && state.settings.lotCapacity) || 28)),
      _md: null
    };
    return C;
  }
  // 整備の生産集計（両課合算・メモ化）
  function mdTot() {
    if (C._md) return C._md;
    var t = { mC: 0, mA: 0, wC: 0, wA: 0, rC: 0, rA: 0, d1: null, d2: null };
    if (window._mdCalc) {
      var d1 = _mdCalc('div1', C.cards, C.moS, C.moE, C.wkS, C.wkE);
      var d2 = _mdCalc('div2', C.cards, C.moS, C.moE, C.wkS, C.wkE);
      ['mC', 'mA', 'wC', 'wA', 'rC', 'rA'].forEach(function (k) { t[k] = (d1[k] || 0) + (d2[k] || 0); });
      t.d1 = d1; t.d2 = d2;
    }
    C._md = t; return t;
  }
  // 車検判定
  function isShaken(c) {
    var arr = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : [c.workType];
    return arr.indexOf('shaken') >= 0;
  }
  function shakenStat() {
    var cnt = { decided: 0, done: 0, recheck: 0, cand: 0, unset: 0, decidedList: [], candList: [] };
    C.cards.forEach(function (c) {
      if (!isShaken(c) || c.status === 'scrap') return;
      var s = c.inspSchedule || {};
      if (s.result === 'done') { cnt.done++; return; }
      (s.history || []).forEach(function (h) { if (h && h.result === 'recheck') cnt.recheck++; });
      if (s.decided) { cnt.decided++; cnt.decidedList.push(c); return; }
      var hasSlot = s.slots && Object.keys(s.slots).some(function (k) { return (s.slots[k] || []).length; });
      if (hasSlot) { cnt.cand++; cnt.candList.push(c); return; }
      if (c.status !== 'reserved' && c.status !== 'returned') cnt.unset++;
    });
    return cnt;
  }
  // 車検履歴レコード（done / recheck）
  function shakenRecords() {
    var recs = [];
    C.cards.forEach(function (c) {
      if (!isShaken(c)) return;
      var s = c.inspSchedule || {};
      if (s.result === 'done') recs.push({ iso: s.resultDate || s.decided, c: c, result: 'done', staff: s.resultStaff || '' });
      (s.history || []).forEach(function (h) {
        if (h && h.result === 'recheck' && h.date) recs.push({ iso: h.date, c: c, result: 'recheck', staff: h.staff || '' });
      });
    });
    recs.sort(function (a, b) { return (b.iso || '').localeCompare(a.iso || ''); });
    return recs;
  }
  // 代車の稼働／空き
  function loanerStat(dStr) {
    var loaners = state.loaners || [], asg = state.loanerAssigns || [];
    var busy = function (l, ds) { return asg.some(function (a) { return a.loanerId === l.id && a.fromDate <= ds && a.toDate >= ds; }); };
    var freeList = loaners.filter(function (l) { return !busy(l, dStr); });
    return { total: loaners.length, free: freeList.length, busy: loaners.length - freeList.length, freeList: freeList, busyFn: busy, loaners: loaners };
  }
  // 車販（各未完了件数）
  function csStat() {
    var active = function (c) { return c.status !== 'returned' && c.status !== 'scrap'; };
    var hasCoat = function (c) {
      var arr = [].concat(c.workTypes || [], c.workAddons || [], [c.workType]);
      return arr.indexOf('coat1y') >= 0 || arr.indexOf('coat3m') >= 0;
    };
    var wash = C.cards.filter(function (c) { return c.needWash && c.returnStage === 'returnWait' && active(c); });
    return {
      washToday: wash.filter(function (c) { return c.returnDate === C.tStr && !c.washSalesDone; }),
      washTomorrow: wash.filter(function (c) { return c.returnDate === C.nextBiz && !c.washSalesDone; }),
      washWeek: wash.filter(function (c) { return c.returnDate > C.nextBiz && c.returnDate <= C.wkE && !c.washSalesDone; }),
      headlight: C.cards.filter(function (c) { return c.headlight && !c.headlightDone && active(c); }),
      coatReq: C.cards.filter(function (c) { return hasCoat(c) && c.coatingOK && !c.coatingDone && active(c); }),
      salesReq: C.cards.filter(function (c) { return c.salesReq && !c.salesReqDone && active(c); })
    };
  }

  // ---------------------------------------------------------
  // 要素レジストリ
  //   sizes … 選べるサイズ／body(sz) … 畳んだ中身／more(sz) … 展開時の深掘り
  //   xl … 特大時の埋め込み（BOX内スクロール・本物のデータ）
  // ---------------------------------------------------------
  var EL = {

    /* 🅿️ 預かり中（混雑度） */
    hold: {
      title: '預かり中', icon: '🅿️', view: 'dashboard', jump: 'ダッシュボード', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var held = window.dashOccupancy ? dashOccupancy(C.tStr) : C.cards.filter(function (c) { return c.status !== 'returned' && c.status !== 'scrap'; }).length;
        var d = window._dashHeldOnTeam ? _dashHeldOnTeam('default', C.tStr) : 0;
        var i = window._dashHeldOnTeam ? _dashHeldOnTeam('import', C.tStr) : 0;
        var sub = '国産' + d + '・輸入' + i;
        if (sz === 's') return kpi(held, '台', sub, 'g');
        var ratio = C.cap ? held / C.cap : 0;
        var barCol = ratio >= 1 ? 'var(--red,#ef4444)' : ratio >= 0.9 ? '#f97316' : ratio >= 0.7 ? '#eab308' : 'var(--green,#1db97a)';
        var bar = '<div class="md-bar"><i style="width:' + Math.min(100, Math.round(ratio * 100)) + '%;background:' + barCol + '"></i></div>' +
          '<div class="md-tiny">置場 ' + C.cap + '台中 ' + held + '台（' + Math.round(ratio * 100) + '%）</div>';
        return '<div class="md-inline">' + kpi(held, '台', sub, 'g') + '</div>' + bar;
      },
      more: function () {
        var vals = []; for (var i = 0; i < 14; i++) vals.push(window.dashOccupancy ? dashOccupancy(ymd(addDays(C.today, i))) : 0);
        return '<div class="md-tiny">直近14日の預かり台数（赤＝満杯 ' + C.cap + '台）</div>' + spark(vals, C.cap) + openFoot('dashboard', 'ダッシュボード');
      }
    },

    /* 🚗 駐車場 */
    park: {
      title: '駐車場', icon: '🚗', view: 'parking', jump: '駐車場', sizes: ['s', 'l', 'xl'],
      body: function (sz) {
        var held = window.dashOccupancy ? dashOccupancy(C.tStr) : 0;
        var free = C.cap - held;
        var col = window.dashParkCol ? dashParkCol(free) : (free >= 0 ? 'var(--green,#1db97a)' : 'var(--red,#ef4444)');
        if (sz === 's') {
          return kpi(free >= 0 ? free : free, (free >= 0 ? '空き' : '超過'), 'キャパ' + C.cap + '・預り' + held, free >= 0 ? 'g' : 'r');
        }
        // 大／特大＝駐車場サマリー（本物）を埋め込み
        var sm = window.ParkingView && ParkingView.summaryHtml ? ParkingView.summaryHtml() : '';
        if (!sm) return '<div class="md-inline">' + kpi(Math.abs(free), free >= 0 ? '空き' : '超過', 'キャパ' + C.cap, free >= 0 ? 'g' : 'r') + '</div>';
        return '<div class="md-embed' + (sz === 'xl' ? ' md-embed-tall' : '') + '">' + sm + '</div>';
      },
      more: function () { return openFoot('parking', '駐車場'); }
    },

    /* ⏱ 最短入庫日 */
    earliest: {
      title: '最短入庫日', icon: '⏱', view: 'availcal', jump: '空きカレンダー', sizes: ['l', 'xl'],
      body: function (sz) {
        function cell(team, kind) {
          var d = window.dashEarliestIntake ? dashEarliestIntake(team, kind, C.today) : null;
          if (!d) return '<td><b class="md-el-d none">なし</b></td>';
          var isT = ymd(d) === C.tStr;
          return '<td><b class="md-el-d' + (isT ? ' ok' : '') + '">' + (isT ? '今日' : (d.getMonth() + 1) + '/' + d.getDate()) +
            '</b><span class="md-el-w">' + (isT ? 'OK' : '日月火水木金土'[d.getDay()] + '曜') + '</span></td>';
        }
        var tbl = '<table class="md-el"><tr><th></th><th>代車なし</th><th>代車あり</th><th>当日作業</th></tr>' +
          '<tr><td class="md-el-t">🚗 国産</td>' + cell('default', 'noLoaner') + cell('default', 'loaner') + cell('default', 'same') + '</tr>' +
          '<tr><td class="md-el-t">🌍 輸入</td>' + cell('import', 'noLoaner') + cell('import', 'loaner') + cell('import', 'same') + '</tr></table>';
        if (sz === 'xl') return tbl + calStrip(28) + openFoot('availcal', '空きカレンダー');
        return tbl;
      },
      more: function () { return calStrip(28) + openFoot('availcal', '空きカレンダー'); }
    },

    /* 🗓 予約の埋まり（横スクロール・無限カレンダー） */
    reservefill: {
      title: '予約の埋まり', icon: '🗓', view: 'dashboard', jump: 'ダッシュボード', sizes: ['l', 'xl'], noexp: true,
      body: function (sz) {
        var n = sz === 'xl' ? 42 : 21;
        var cols = window._dashCalCols ? _dashCalCols(0, n, C.today, C.tStr) : '';
        return '<div class="md-tiny">右へスクロールで先の空き状況（<span style="color:#1db97a">可</span>＝空きあり／<span style="color:#ef4444">終了</span>＝満枠／超過＝枠超え／休）</div>' +
          '<div class="md-cal-scroll"><div class="drc-grid"><div class="drc-col drc-lab"><div class="drc-h"></div><div class="drc-c">🚗 国産</div><div class="drc-c">🌍 輸入</div></div>' + cols + '</div></div>';
      }
    },

    /* 📥 今日の入庫 */
    intake: {
      title: '今日の入庫', icon: '📥', view: 'today', jump: '当日', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var list = C.cards.filter(function (c) { return c.reserveDate === C.tStr && c.status !== 'scrap'; })
          .sort(function (a, b) { return (a.reserveTime || '99').localeCompare(b.reserveTime || '99'); });
        var left = list.filter(function (c) { return c.status === 'reserved'; }).length;
        if (sz === 's') return kpi(list.length, '台', '未来店 ' + left + '台', 'g');
        if (!list.length) return empty('本日の入庫予定はありません');
        if (sz === 'm') return '<div class="md-list">' + list.slice(0, 6).map(function (c) {
          return rowCard(c.id, (c.reserveTime ? '<b>' + esc(c.reserveTime) + '</b> ' : '') + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c));
        }).join('') + (list.length > 6 ? '<div class="md-more-n">ほか ' + (list.length - 6) + '台</div>' : '') + '</div>';
        // 大／特大＝カード
        var lim = sz === 'xl' ? 40 : 8;
        var html = '<div class="md-scroll' + (sz === 'xl' ? ' md-scroll-tall' : '') + '">' + list.slice(0, lim).map(function (c) {
          var sub = (c.reserveTime ? esc(c.reserveTime) + '　' : '') + (teamOf(c) === 'import' ? '輸入' : '国産') +
            (c.needLoaner ? '・代車' : '') + (c.status === 'reserved' ? '' : '・入庫済');
          return bigCard(c.id, esc(nm(c)) + ' 様 ' + esc(carOf(c)) + '　' + wtChip(c), sub, teamColor(c));
        }).join('') + '</div>';
        return html + openFoot('today', '当日');
      },
      more: function () { return openFoot('today', '当日'); }
    },

    /* 📤 今日の返車 */
    returnout: {
      title: '今日の返車', icon: '📤', view: 'return', jump: '返車', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var list = C.cards.filter(function (c) { return c.returnDate === C.tStr && c.status !== 'scrap'; });
        var done = list.filter(function (c) { return c.status === 'returned'; }).length;
        if (sz === 's') return kpi(list.length, '台', '返車済 ' + done + '台', 'b');
        var pend = list.filter(function (c) { return c.status !== 'returned'; });
        if (!pend.length) return empty('本日の返車待ちはありません');
        return '<div class="md-list">' + pend.slice(0, 8).map(function (c) {
          return rowCard(c.id, (c.returnTime ? '<b>' + esc(c.returnTime) + '</b> ' : '') + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c));
        }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    /* 🔔 返車待ち（完TEL済） */
    returnwait: {
      title: '返車待ち', icon: '🔔', view: 'return', jump: '返車', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var list = C.cards.filter(function (c) { return c.returnStage === 'returnWait' && c.status !== 'returned' && c.status !== 'scrap'; })
          .sort(function (a, b) { return (a.returnDate || '9999').localeCompare(b.returnDate || '9999'); });
        if (sz === 's') return kpi(list.length, '件', '完TEL済・返車待ち', 'o');
        if (!list.length) return empty('返車待ちはありません');
        return '<div class="md-list">' + list.slice(0, sz === 'l' ? 12 : 6).map(function (c) {
          var when = c.returnDate ? (window.fmtMD ? fmtMD(c.returnDate) : c.returnDate) : '日未定';
          return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(when), 'tag');
        }).join('') + '</div>' + (sz === 'l' ? openFoot('return', '返車') : '');
      },
      more: function () { return openFoot('return', '返車'); }
    },

    /* 🔧 今月上げた（生産） */
    maintMonth: {
      title: '今月 上げた', icon: '🔧', view: 'maintdash', jump: '整備ダッシュボード', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var t = mdTot();
        if (sz === 's') return kpi(t.mC, '台', man(t.mA) + manUnit(t.mA), 'g');
        var rows = '<div class="md-inline">' + kpi(t.mC, '台', '今月の完成', 'g') + kpi(man(t.mA), manUnit(t.mA), '売上（見込込）', 'b') + '</div>';
        if (sz === 'l' && t.d1 && t.d2) {
          rows += '<div class="md-list" style="margin-top:8px">' +
            rowCard(null, '🚗 1課（国産）', t.d1.mC + '台 / ' + man(t.d1.mA) + manUnit(t.d1.mA), 'tag') +
            rowCard(null, '🌍 2課（輸入）', t.d2.mC + '台 / ' + man(t.d2.mA) + manUnit(t.d2.mA), 'tag') + '</div>';
        }
        return rows;
      },
      more: function () { return openFoot('maintdash', '整備ダッシュボード'); }
    },

    /* 📆 今週の生産（上げた／残り） */
    maintWeek: {
      title: '今週の生産', icon: '📆', view: 'maintdash', jump: '整備ダッシュボード', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var t = mdTot();
        if (sz === 's') return kpi(t.wC, '台', '残り ' + t.rC + '台', 'g');
        return '<div class="md-inline">' +
          kpi(t.wC, '台', '今週 上げた', 'g') +
          kpi(t.rC, '台', '今週 残り', t.rC > 0 ? 'o' : 'g') + '</div>' +
          '<div class="md-tiny" style="margin-top:6px">上げた ' + man(t.wA) + manUnit(t.wA) + '／残り ' + man(t.rA) + manUnit(t.rA) + '</div>' +
          (sz === 'l' ? openFoot('maintdash', '整備ダッシュボード') : '');
      },
      more: function () { return openFoot('maintdash', '整備ダッシュボード'); }
    },

    /* ⏳ 長期預かり */
    longhold: {
      title: '長期預かり', icon: '⏳', view: 'maintdash', jump: '整備ダッシュボード', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var lim = (state.settings && state.settings.longHoldDays) || 7;
        var list = C.cards.filter(function (c) {
          if (!(window._mdInShop ? _mdInShop(c) : (['check', 'estim', 'contact', 'parts', 'work'].indexOf(c.status) >= 0))) return false;
          var d = daysAgo(c.reserveDate); return d != null && d >= lim;
        }).sort(function (a, b) { return (daysAgo(b.reserveDate) || 0) - (daysAgo(a.reserveDate) || 0); });
        if (sz === 's') return kpi(list.length, '台', lim + '日以上', list.length ? 'r' : 'g');
        if (!list.length) return empty(lim + '日以上の長期預かりはありません');
        var lm = sz === 'xl' ? 40 : (sz === 'l' ? 12 : 5);
        var body = '<div class="md-' + (sz === 'xl' ? 'scroll md-scroll-tall' : 'list') + '">' + list.slice(0, lm).map(function (c) {
          var d = daysAgo(c.reserveDate);
          return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), d + '日目', d >= lim * 2 ? 'tag rd' : 'tag');
        }).join('') + (list.length > lm ? '<div class="md-more-n">ほか ' + (list.length - lm) + '台</div>' : '') + '</div>';
        return body + (sz !== 'm' ? openFoot('maintdash', '整備ダッシュボード') : '');
      },
      more: function () { return openFoot('maintdash', '整備ダッシュボード'); }
    },

    /* 💵 受注残（受注済・未返車） */
    order: {
      title: '受注残', icon: '💵', view: 'maintdash', jump: '整備ダッシュボード', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var IN = ['parts', 'work', 'workDone', 'outsource'];
        var list = C.cards.filter(function (c) { return IN.indexOf(c.status) >= 0 && c.status !== 'returned'; });
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(man(sum), manUnit(sum), '受注済・未返車 ' + list.length + '台', 'b');
        list.sort(function (a, b) { return amt(b) - amt(a); });
        if (!list.length) return empty('受注残はありません');
        return '<div class="md-inline">' + kpi(man(sum), manUnit(sum), '受注残 ' + list.length + '台', 'b') + '</div>' +
          '<div class="md-list" style="margin-top:8px">' + list.slice(0, sz === 'l' ? 8 : 4).map(function (c) {
            return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), yen(amt(c)), 'amt');
          }).join('') + '</div>' + (sz === 'l' ? openFoot('maintdash', '整備ダッシュボード') : '');
      },
      more: function () { return openFoot('maintdash', '整備ダッシュボード'); }
    },

    /* 🔎 車検予定 */
    shakenPlan: {
      title: '車検予定', icon: '🔎', view: 'shakencal', jump: '車検予定', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var s = shakenStat();
        if (sz === 's') return kpi(s.decided, '台', '候補 ' + s.cand + '・未設定 ' + s.unset, 'pu');
        var head = '<div class="md-inline">' + kpi(s.decided, '台', '決定', 'g') + kpi(s.cand, '台', '候補', 'o') + kpi(s.unset, '台', '未設定', s.unset ? 'r' : 'g') + '</div>';
        if (sz === 'm') return head;
        // 大／特大＝決定リスト＋候補リスト
        var mk = function (title, arr, lim) {
          if (!arr.length) return '';
          return '<div class="md-tiny" style="margin-top:8px">' + title + '</div><div class="md-list">' + arr.slice(0, lim).map(function (c) {
            var s2 = c.inspSchedule || {};
            var when = s2.decided ? (window.fmtMD ? fmtMD(s2.decided) : s2.decided) + (s2.decidedSlot === 'pm' ? ' 午後' : s2.decidedSlot === 'am' ? ' 午前' : '') : '候補あり';
            return rowCard(c.id, esc(nm(c)) + ' ' + esc(carOf(c)), esc(when), 'tag');
          }).join('') + '</div>';
        };
        var lim = sz === 'xl' ? 30 : 6;
        return head + '<div class="' + (sz === 'xl' ? 'md-scroll md-scroll-tall' : '') + '">' +
          mk('✅ 決定済み', s.decidedList, lim) + mk('🕒 行ける日候補', s.candList, lim) + '</div>' + openFoot('shakencal', '車検予定');
      },
      more: function () { return openFoot('shakencal', '車検予定'); }
    },

    /* 📇 車検履歴 */
    shakenLog: {
      title: '車検履歴', icon: '📇', view: 'shakenlog', jump: '車検履歴', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var recs = shakenRecords();
        var pre = C.moS.slice(0, 7);
        var mRecs = recs.filter(function (r) { return (r.iso || '').indexOf(pre) === 0; });
        var doneN = mRecs.filter(function (r) { return r.result === 'done'; }).length;
        var reN = mRecs.filter(function (r) { return r.result === 'recheck'; }).length;
        if (sz === 's') return kpi(doneN, '台', '今月 済・再検 ' + reN, 'g');
        if (sz === 'm') {
          return '<div class="md-tiny">直近の車検実績</div><div class="md-list">' + (recs.length ? recs.slice(0, 5).map(function (r) {
            return rowCard(r.c.id, (window.fmtMD ? fmtMD(r.iso) : r.iso) + ' ' + esc(nm(r.c)), r.result === 'done' ? '済' : '再検', r.result === 'done' ? 'tag gn' : 'tag rd');
          }).join('') : empty('履歴はまだありません')) + '</div>';
        }
        // 大＝担当別ランキング／特大＝直近履歴テーブル
        if (sz === 'l') {
          var by = {};
          mRecs.forEach(function (r) { if (r.result === 'done' && r.staff) by[r.staff] = (by[r.staff] || 0) + 1; });
          var arr = Object.keys(by).map(function (k) { return { n: k, v: by[k] }; }).sort(function (a, b) { return b.v - a.v; });
          return '<div class="md-inline">' + kpi(doneN, '台', '今月 済', 'g') + kpi(reN, '件', '今月 再検', reN ? 'o' : 'g') + '</div>' +
            '<div class="md-tiny" style="margin-top:8px">担当別（今月・済）</div><div class="md-list">' +
            (arr.length ? arr.map(function (x) { return rowCard(null, esc(x.n), x.v + '台', 'tag'); }).join('') : empty('実績なし')) + '</div>' +
            openFoot('shakenlog', '車検履歴');
        }
        return '<div class="md-scroll md-scroll-tall">' + (recs.length ? recs.slice(0, 40).map(function (r) {
          return rowCard(r.c.id, (window.fmtMD ? fmtMD(r.iso) : r.iso) + '　' + esc(nm(r.c)) + ' ' + esc(carOf(r.c)) + (r.staff ? '（' + esc(r.staff) + '）' : ''), r.result === 'done' ? '済' : '再検', r.result === 'done' ? 'tag gn' : 'tag rd');
        }).join('') : empty('履歴はまだありません')) + '</div>' + openFoot('shakenlog', '車検履歴');
      },
      more: function () { return openFoot('shakenlog', '車検履歴'); }
    },

    /* ✅ 当月実績 */
    resultMonth: {
      title: '当月実績', icon: '✅', view: 'result', jump: '実績', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var list = C.cards.filter(function (c) {
          return c.completedAt && c.completedAt >= C.moS && c.completedAt <= C.moE && (c.status === 'workDone' || c.status === 'returned');
        });
        var sum = list.reduce(function (a, c) { return a + amt(c); }, 0);
        if (sz === 's') return kpi(list.length, '台', man(sum) + manUnit(sum), 'g');
        if (sz === 'm') {
          var recent = list.slice().sort(function (a, b) { return (b.completedAt || '').localeCompare(a.completedAt || ''); });
          return '<div class="md-inline">' + kpi(list.length, '台', '当月 完成', 'g') + '</div>' +
            '<div class="md-list" style="margin-top:8px">' + (recent.length ? recent.slice(0, 5).map(function (c) {
              return rowCard(c.id, (window.fmtMD ? fmtMD(c.completedAt) : c.completedAt) + ' ' + esc(nm(c)) + ' ' + esc(carOf(c)), wtChip(c));
            }).join('') : empty('当月の実績はまだありません')) + '</div>';
        }
        // 大／特大＝本物の実績カレンダー（当月）を埋め込み
        var cells = window._resultMonthCells ? _resultMonthCells(C.y, C.m) : '';
        return '<div class="md-inline">' + kpi(list.length, '台', '当月完成 / ' + man(sum) + manUnit(sum), 'g') + '</div>' +
          '<div class="md-embed' + (sz === 'xl' ? ' md-embed-tall' : '') + '"><div class="reserve-month md-month">' + cells + '</div></div>' +
          openFoot('result', '実績');
      },
      more: function () { return openFoot('result', '実績'); }
    },

    /* 🚙 代車 */
    loaner: {
      title: '代車', icon: '🚙', view: 'loaner', jump: '代車カレンダー', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var st = loanerStat(C.tStr);
        var ef = window.dashLoanerEarliestFree ? dashLoanerEarliestFree(C.today) : null;
        var efStr = ef ? (ymd(ef) === C.tStr ? '今日' : (ef.getMonth() + 1) + '/' + ef.getDate()) : 'なし';
        if (sz === 's') return kpi(st.free, '台空き', '稼働 ' + st.busy + '/' + st.total, st.free > 0 ? 'g' : 'r');
        if (sz === 'm') {
          return '<div class="md-inline">' + kpi(st.free, '空き', '/' + st.total + '台', st.free > 0 ? 'g' : 'r') + kpi(efStr, '', '最短空き', 'b') + '</div>';
        }
        // 大／特大＝14日 稼働グリッド（本物・loanerAssigns）
        var days = sz === 'xl' ? 21 : 14;
        var head = '<div class="md-lg-row md-lg-head"><span class="md-lg-name"></span>';
        for (var i = 0; i < days; i++) { var d = addDays(C.today, i); head += '<span class="md-lg-c md-lg-hc">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>'; }
        head += '</div>';
        var rows = st.loaners.map(function (l) {
          var r = '<div class="md-lg-row"><span class="md-lg-name">' + esc(l.name) + '<small>' + esc(l.model || '') + '</small></span>';
          for (var i = 0; i < days; i++) { var ds = ymd(addDays(C.today, i)); var busy = st.busyFn(l, ds); r += '<span class="md-lg-c' + (busy ? ' busy' : ' free') + '"></span>'; }
          return r + '</div>';
        }).join('');
        return '<div class="md-inline">' + kpi(st.free, '空き', '/' + st.total + '台 ・ 最短空き ' + efStr, st.free > 0 ? 'g' : 'r') + '</div>' +
          '<div class="md-cal-scroll md-lg"><div class="md-lg-grid">' + head + rows + '</div></div>' + openFoot('loaner', '代車カレンダー');
      },
      more: function () { return openFoot('loaner', '代車カレンダー'); }
    },

    /* 💴 売上サマリー */
    sales: {
      title: '売上サマリー', icon: '💴', view: 'sales', jump: '売上', sizes: ['s', 'm', 'l', 'xl'],
      body: function (sz) {
        var act = C.cards.filter(function (c) {
          if (c.status !== 'returned') return false;
          var rd = c.returnDateFinal || c.returnDate || ''; return rd >= C.moS && rd <= C.moE;
        });
        var sum = act.reduce(function (a, c) { return a + amt(c); }, 0);
        var tg = (state.settings && state.settings.target) || { monthMin: 15000000, monthMax: 20000000 };
        var pct = tg.monthMin ? Math.round(sum / tg.monthMin * 100) : 0;
        if (sz === 's') return kpi(man(sum), manUnit(sum), '当月実績 ' + act.length + '台', 'g');
        var barCol = pct >= 100 ? 'var(--green,#1db97a)' : pct >= 75 ? '#eab308' : '#f97316';
        var bar = '<div class="md-bar"><i style="width:' + Math.min(100, pct) + '%;background:' + barCol + '"></i></div>' +
          '<div class="md-tiny">最低目標 ' + man(tg.monthMin) + '万 に対して ' + pct + '%（' + act.length + '台）</div>';
        var head = '<div class="md-inline">' + kpi(man(sum), manUnit(sum), '当月実績', 'g') + kpi(pct, '%', '目標達成', pct >= 100 ? 'g' : 'o') + '</div>' + bar;
        if (sz === 'm') return head;
        // 大／特大＝作業グループ別の内訳テーブル
        var groups = [{ k: 'shaken', n: '車検' }, { k: '12pt', n: '12点' }, { k: 'general', n: '一般' }, { k: 'oil', n: 'オイル' }, { k: 'bp', n: 'B.P' }];
        var gmap = {}; groups.forEach(function (g) { gmap[g.k] = { n: g.n, c: 0, a: 0 }; });
        var other = { n: 'その他', c: 0, a: 0 };
        act.forEach(function (c) {
          var w = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes[0] : c.workType;
          var g = gmap[w] || other; g.c++; g.a += amt(c);
        });
        var all = groups.map(function (g) { return gmap[g.k]; }).concat([other]).filter(function (g) { return g.c; });
        var rowsH = all.map(function (g) {
          return '<tr><td class="t">' + esc(g.n) + '</td><td>' + g.c + '台</td><td class="amt">' + yen(g.a) + '</td><td>' + yen(g.c ? Math.round(g.a / g.c) : 0) + '</td></tr>';
        }).join('');
        return head + '<div class="md-embed' + (sz === 'xl' ? ' md-embed-tall' : '') + '"><table class="md-tbl"><tr><th>作業</th><th>台数</th><th>売上</th><th>平均単価</th></tr>' +
          (rowsH || '<tr><td colspan="4">当月実績なし</td></tr>') + '</table></div>' + openFoot('sales', '売上');
      },
      more: function () { return openFoot('sales', '売上'); }
    },

    /* 🧽 車販作業 */
    carsales: {
      title: '車販作業', icon: '🧽', view: 'carsales', jump: '車販作業', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var s = csStat();
        if (sz === 's') return kpi(s.washToday.length, '台', '今日の洗車', s.washToday.length ? 'o' : 'g');
        var grid = '<div class="md-grid2">' +
          miniStat('☀️ 今日 洗車', s.washToday.length) + miniStat('🌙 明日 洗車', s.washTomorrow.length) +
          miniStat('📅 今週 洗車', s.washWeek.length) + miniStat('💡 ヘッドライト', s.headlight.length) +
          miniStat('✨ コーティング', s.coatReq.length) + miniStat('📝 その他依頼', s.salesReq.length) + '</div>';
        return grid + (sz === 'l' ? openFoot('carsales', '車販作業') : '');
      },
      more: function () { return openFoot('carsales', '車販作業'); }
    },

    /* 📋 課別タスク滞留 */
    course: {
      title: '課別タスク', icon: '📋', view: 'course1', jump: '1課', sizes: ['s', 'm', 'l'],
      body: function (sz) {
        var STAT = [{ k: 'check', n: '点検', i: '🔍' }, { k: 'estim', n: '見積', i: '🧮' }, { k: 'contact', n: '連絡', i: '📞' }, { k: 'parts', n: '部品', i: '📦' }, { k: 'work', n: '作業', i: '🔧' }];
        var cnt = function (board) {
          var o = {}; STAT.forEach(function (s) { o[s.k] = 0; });
          C.cards.forEach(function (c) { if (c.boardId === board && o[c.status] != null) o[c.status]++; });
          o._t = STAT.reduce(function (a, s) { return a + o[s.k]; }, 0); return o;
        };
        var d1 = cnt('default'), d2 = cnt('import');
        if (sz === 's') return kpi(d1._t + d2._t, '台', '作業中（両課）', 'b');
        var line = function (label, o, view) {
          return '<div class="md-course md-int" onclick="event.stopPropagation();showView(\'' + view + '\')"><span class="md-course-n">' + label + '</span>' +
            STAT.map(function (s) { return '<span class="md-course-c" title="' + s.n + '">' + s.i + '<b>' + o[s.k] + '</b></span>'; }).join('') + '</div>';
        };
        return line('🚗 1課', d1, 'course1') + line('🌍 2課', d2, 'course2');
      },
      more: function () { return openFoot('maintdash', '整備ダッシュボード'); }
    }
  };
  function miniStat(label, n) {
    return '<div class="md-mini' + (n ? ' on' : '') + '"><div class="md-mini-n">' + n + '</div><div class="md-mini-l">' + label + '</div></div>';
  }

  var ELN = {};
  Object.keys(EL).forEach(function (k) { ELN[k] = EL[k].title; });
  var SZL = { s: '小', m: '中', l: '大', xl: '特大' };

  // ---------------------------------------------------------
  // レイアウト（アカウント統一・state.settings.myDash）
  // ---------------------------------------------------------
  var DEFAULT_LAYOUT = [
    { e: 'earliest', s: 'l' },
    { e: 'hold', s: 's' }, { e: 'park', s: 's' }, { e: 'intake', s: 's' }, { e: 'returnout', s: 's' },
    { e: 'returnwait', s: 's' }, { e: 'longhold', s: 's' },
    { e: 'maintWeek', s: 'm' }, { e: 'shakenPlan', s: 'm' },
    { e: 'sales', s: 'm' }, { e: 'order', s: 'm' },
    { e: 'resultMonth', s: 'l' }
  ];
  function getLayout() {
    var md = state.settings && state.settings.myDash;
    if (md && Array.isArray(md.layout) && md.layout.length) {
      return md.layout.filter(function (it) { return it && EL[it.e]; });
    }
    return DEFAULT_LAYOUT.slice();
  }
  function setLayout(arr) {
    if (!state.settings) state.settings = {};
    state.settings.myDash = { v: 1, layout: arr };
  }
  function saveLayout(silent) {
    if (window.PitDB && PitDB.save) PitDB.save(true);
    if (!silent) toast('配置を保存しました（このアカウント）');
  }

  // ---------------------------------------------------------
  // 描画
  // ---------------------------------------------------------
  function renderMyDash() {
    var host = $('view-mydash-body');
    if (!host) return;
    buildCtx();

    // 固定：検索＋付箋（初回のみ器を作る＝付箋のイベントを壊さない）
    var pinned = $('mydash-pinned');
    if (!pinned) {
      host.innerHTML =
        '<div id="mydash-pinned">' +
        '  <div class="md-pin-tag"><span class="lk">🔒</span> 常時表示（消せません）</div>' +
        '  <div id="mydash-search-wrap" class="md-search">' +
        '    <input id="mydash-search-input" type="search" autocomplete="off" placeholder="🔍 検索（顧客・名前・車・ナンバー・予約番号・代車・日付…）"' +
        '      onfocus="pitSearchBind(\'mydash-search-wrap\',\'mydash-search-input\',\'mydash-search-results\')" oninput="pitSearchInput(this.value)">' +
        '    <div id="mydash-search-results" class="pit-search-results"></div>' +
        '  </div>' +
        '  <div id="mydash-notes-area"></div>' +
        '</div>' +
        '<div class="md-flow" id="mydash-flow"></div>';
      bindFlow();
    }
    // 付箋を自分の器に描画
    window.PIT_BN_TARGET = 'mydash-notes-area';
    if (window.renderBoardNotes) renderBoardNotes();

    renderFlow();
  }
  window.renderMyDash = renderMyDash;

  function renderFlow() {
    var flow = $('mydash-flow'); if (!flow) return;
    var layout = getLayout();
    flow.innerHTML = layout.map(function (it, idx) {
      var def = EL[it.e]; if (!def) return '';
      var sizes = def.sizes;
      var chips = ['s', 'm', 'l', 'xl'].map(function (sz) {
        var ok = sizes.indexOf(sz) >= 0;
        return '<span class="md-szchip' + (ok ? '' : ' na') + (it.s === sz ? ' on' : '') + '"' +
          (ok ? ' onclick="mydResize(event,' + idx + ',\'' + sz + '\')"' : '') + '>' + SZL[sz] + '</span>';
      }).join('');
      var noexp = def.noexp || it.s === 'xl';
      return '<section class="md-box md-' + it.s + (noexp ? ' md-noexp' : '') + '" data-idx="' + idx + '" draggable="true">' +
        '<div class="md-bh">' +
        '<span class="md-grip">⠿</span>' +
        '<span class="md-ic">' + def.icon + '</span><h3>' + esc(def.title) + '</h3>' +
        '<span class="md-sztag">' + SZL[it.s] + '</span>' +
        (noexp ? '' : '<span class="md-caret">▾ 展開</span>') +
        '<span class="md-tools">' + chips +
        '<span class="md-tbtn" onclick="mydMove(event,' + idx + ',-1)">↑</span>' +
        '<span class="md-tbtn" onclick="mydMove(event,' + idx + ',1)">↓</span>' +
        '<span class="md-tbtn del" onclick="mydRemove(event,' + idx + ')">✕</span>' +
        '</span>' +
        '</div>' +
        '<div class="md-body">' + safe(def.body, it.s) + '</div>' +
        (noexp ? '' : '<div class="md-more">' + safe(def.more, it.s) + '</div>') +
        '</section>';
    }).join('');
    bindDrag();
  }
  function safe(fn, sz) {
    try { return fn ? fn(sz) : ''; }
    catch (e) { console.error('[mydash] render error', e); return '<div class="md-empty">表示エラー</div>'; }
  }

  // ---------------------------------------------------------
  // 挙動：展開・編集・並べ替え・サイズ・追加削除
  // ---------------------------------------------------------
  function bindFlow() {
    var flow = $('mydash-flow');
    // 展開/畳み（閲覧モード）
    flow.addEventListener('click', function (e) {
      if (document.body.classList.contains('md-edit')) return;
      if (e.target.closest('.md-tools, .md-int, a, button')) return;   // 内側の操作は素通し
      var box = e.target.closest('.md-box'); if (!box) return;
      if (box.classList.contains('md-noexp')) return;
      if (box.classList.contains('md-exp')) { box.classList.remove('md-exp'); }
      else { collapseAll(); box.classList.add('md-exp'); }
    });
    // 枠外クリックで畳む
    document.addEventListener('click', function (e) {
      if (document.body.classList.contains('md-edit')) return;
      if (!e.target.closest('#mydash-flow') && !e.target.closest('.md-pal')) collapseAll();
    });
  }
  function collapseAll() { document.querySelectorAll('.md-box.md-exp').forEach(function (b) { b.classList.remove('md-exp'); }); }

  window.mydToggleEdit = function () {
    var on = document.body.classList.toggle('md-edit');
    var b = $('myd-edit-btn'); if (b) b.classList.toggle('on', on);
    collapseAll();
    if (!on) saveLayout();   // 編集を抜けたら保存
  };
  window.mydRefresh = function () { renderMyDash(); };

  window.mydResize = function (e, idx, sz) {
    if (e) e.stopPropagation();
    var l = getLayout(); if (!l[idx]) return;
    if (EL[l[idx].e].sizes.indexOf(sz) < 0) return;
    l[idx].s = sz; setLayout(l); renderFlow(); saveLayout(true);
  };
  window.mydMove = function (e, idx, dir) {
    if (e) e.stopPropagation();
    var l = getLayout(); var j = idx + dir; if (j < 0 || j >= l.length) return;
    var t = l[idx]; l[idx] = l[j]; l[j] = t; setLayout(l); renderFlow(); saveLayout(true);
  };
  window.mydRemove = function (e, idx) {
    if (e) e.stopPropagation();
    var l = getLayout(); l.splice(idx, 1); setLayout(l); renderFlow(); saveLayout(true);
  };

  // ドラッグ並べ替え（PC・編集モードのみ）
  var dragIdx = null;
  function bindDrag() {
    document.querySelectorAll('#mydash-flow .md-box').forEach(function (el) {
      el.addEventListener('dragstart', function (e) {
        if (!document.body.classList.contains('md-edit')) { e.preventDefault(); return; }
        dragIdx = +el.dataset.idx; e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragover', function (e) { if (dragIdx == null) return; e.preventDefault(); el.classList.add('md-dragover'); });
      el.addEventListener('dragleave', function () { el.classList.remove('md-dragover'); });
      el.addEventListener('drop', function (e) {
        e.preventDefault(); el.classList.remove('md-dragover');
        var to = +el.dataset.idx; if (dragIdx == null || dragIdx === to) return;
        var l = getLayout(); var mv = l.splice(dragIdx, 1)[0]; l.splice(to, 0, mv); dragIdx = null;
        setLayout(l); renderFlow(); saveLayout(true);
      });
      el.addEventListener('dragend', function () { dragIdx = null; document.querySelectorAll('.md-box').forEach(function (b) { b.classList.remove('md-dragover'); }); });
    });
  }

  // パレット（追加）
  window.mydOpenPalette = function () {
    var b = $('myd-pal-body');
    b.innerHTML = Object.keys(EL).map(function (k) {
      var d = EL[k];
      var chips = ['s', 'm', 'l', 'xl'].map(function (sz) {
        var ok = d.sizes.indexOf(sz) >= 0;
        return '<span class="md-szchip' + (ok ? '' : ' na') + '"' + (ok ? ' onclick="mydAdd(\'' + k + '\',\'' + sz + '\')"' : '') + '>' + SZL[sz] + '</span>';
      }).join('');
      return '<div class="md-pe"><span class="md-pe-ic">' + d.icon + '</span><span class="md-pe-n">' + esc(d.title) + '</span><span class="md-pe-sz">' + chips + '</span></div>';
    }).join('');
    $('myd-pal').classList.add('show');
  };
  window.mydClosePalette = function () { $('myd-pal').classList.remove('show'); };
  window.mydAdd = function (e, s) {
    var l = getLayout(); l.push({ e: e, s: s }); setLayout(l); renderFlow(); saveLayout(true);
    toast(ELN[e] + '（' + SZL[s] + '）を追加しました');
  };

  // トースト
  var _tt;
  function toast(m) {
    var t = $('myd-toast');
    if (!t) { t = document.createElement('div'); t.id = 'myd-toast'; t.className = 'md-toast'; document.body.appendChild(t); }
    t.textContent = m; t.classList.add('show'); clearTimeout(_tt);
    _tt = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  if (window.pitToast) { toast = function (m) { pitToast(m); }; }

})();
