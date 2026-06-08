/* ========================================
   card-detail.js
   入庫カード詳細フォーム（自動保存・現代的UI）
   ======================================== */

let _editingCardId = null;
let _returnView = 'today';   // 全画面カードを閉じたとき戻る先
let _cardTab = 'basic';      // カード内タブの現在地（card-tabs.js が参照）
let _cardMode = 'page';      // 'page'＝新規入庫(全画面) / 'modal'＝各ビューから(ポップアップ)
let _cardBodyId = 'md-body'; // フォームの描画先（card-tabs.js も参照）

function _cardTitleHtml(card){
  return '<span style="font-size:13px;color:var(--text3);font-weight:400;">入庫カード</span><br>' +
    (card.customer || '（未入力）') + ' 様 / ' + (card.car || '（車種未入力）');
}

/* mode: 'page'＝全画面（新規入庫予約） / 'modal'＝ポップアップ（各ビューから開く） */
function openCard(cardId, mode){
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  _editingCardId = cardId;
  _cardTab = 'basic';
  _cardMode = (mode === 'page') ? 'page' : 'modal';

  if (_cardMode === 'modal'){
    _cardBodyId = 'md-body-modal';
    document.getElementById('card-title-modal').innerHTML = _cardTitleHtml(card);
    renderCardForm(card);
    document.getElementById('modal-detail').classList.add('show');
  } else {
    _cardBodyId = 'md-body';
    window._cfsYM = null;    // 右パネルのカレンダーは今月から
    window._cfsLgN = null;   // 代車ガントは今日から28日ぶんで仕切り直し
    if (state.currentView && state.currentView !== 'card') _returnView = state.currentView;
    document.getElementById('card-title').innerHTML = _cardTitleHtml(card);
    renderCardForm(card);
    showView('card');
    const main = document.getElementById('main'); if (main) main.scrollTop = 0;
  }
}

// 各ビューのカードをクリック＝ポップアップで開く
function openDetail(cardId){ openCard(cardId, 'modal'); }

function closeDetail(){
  const modal = document.getElementById('modal-detail');
  const modalOpen = modal && modal.classList.contains('show');
  if (!modalOpen && state.currentView !== 'card') return;   // 何も開いていなければ無視（ESC誤爆防止）
  // 閉じる前に、このカードから顧客控えを更新（入力補助用）
  const _c = state.cards.find(x => x.id === _editingCardId);
  if (_c && window.upsertCustomerFromCard) upsertCustomerFromCard(_c);
  _editingCardId = null;
  if (window.PitDB) PitDB.save();
  if (modalOpen){
    modal.classList.remove('show');
    if (state.currentView) showView(state.currentView);   // 背後のビューを更新して反映
  } else {
    showView(_returnView || 'today');
  }
}

function renderCardForm(c){
  const body = document.getElementById(_cardBodyId || 'md-body');
  if (!body) return;

  /* 再描画前にスクロール位置を控える（ボタン操作で先頭に飛ばないように・v0.28.1） */
  const _pm = body.querySelector('.cfp-main');
  const _ps = body.querySelector('.cfp-side');
  const _pg = body.querySelector('#cfs-lg-scroll');
  const _keep = {
    main: _pm ? _pm.scrollTop : 0,
    side: _ps ? _ps.scrollTop : 0,
    gT: _pg ? _pg.scrollTop : 0,
    gL: _pg ? _pg.scrollLeft : 0,
  };

  let h = '';

  /* 新規予約（全画面）は右パネル付き2カラム（v0.27.0） */
  const withSide = (_cardMode === 'page');
  if (withSide) h += '<div class="cfp-wrap"><div class="cfp-main">';

  /* === 顧客呼び出し（入力補助・整備ソフトとは別の控え） === */
  h += '<div class="cf-recall">';
  h += '<input id="cf-recall-input" class="cf-input" placeholder="🔍 過去の顧客・ナンバーから呼び出し（名前/ナンバー）" oninput="custSuggest(this.value)" autocomplete="off">';
  h += '<div id="cf-recall-list" class="cf-recall-list" style="display:none"></div>';
  h += '</div>';

  /* === タブ === */
  if (!_cardTab) _cardTab = 'basic';
  h += '<div class="cf-tabs">'
     + cfTabBtn('basic',  '📋 基本情報')
     + cfTabBtn('flow',   '🕒 フロー')
     + cfTabBtn('maint',  '🔧 整備')
     + cfTabBtn('office', '🗂 バックオフィス')
     + '</div>';

  /* === 基本情報パネル === */
  h += '<div class="cf-panel" data-tab="basic"' + (_cardTab === 'basic' ? '' : ' hidden') + '>';

  /* === 基本情報（車両もここに統合・v0.27.0） === */
  h += sec('基本情報', '👤');
  h += '<div class="cf-row">';
  h += field('お客様名', textIn(c, 'customer', 'flex:2'));
  h += field('TEL',      textIn(c, 'tel',      'flex:1'));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('ナンバー', textIn(c, 'plate'));
  h += field('初回／リピーター', chips(c, 'repeat', state.repeatTypes));
  h += field('国産車／輸入車', chips(c, 'boardId', TEAM_ITEMS));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('メーカー', textIn(c, 'maker', 'placeholder="例 トヨタ" style="max-width:160px"'));
  h += field('車種（グレード）', textIn(c, 'car', 'placeholder="例 アクアGz"'));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('入庫日', dateIn(c, 'reserveDate'));
  h += field('入庫時刻', textIn(c, 'reserveTime', 'placeholder="例 09:30 / 09:00-10:00"'));
  h += field('予約受付日', dateIn(c, 'bookedAt'));
  h += '</div>';
  h += secEnd();

  /* === 作業内容（担当＝課/フロント/予約もここに統合・v0.34.4） === */
  h += sec('作業内容', '🔧');
  /* 1行目：作業タイプ（広め）＋ 課 */
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:3"><div class="cf-label">作業タイプ</div>' + chips(c, 'workType', state.workTypes, true) + '</div>';
  h += field('課', chips(c, 'division', state.divisions, true));
  h += '</div>';
  /* 2行目：受付タイプ＋相談＋担当を1行に詰める */
  h += '<div class="cf-row">';
  h += field('受付タイプ', chips(c, 'dropType', state.dropTypes, true));
  h += field('相談', '<div class="cf-chips"><button type="button" id="cf-consult-btn" class="cf-chip' + (c.consult ? ' active' : '') + '"' + (c.consult ? ' style="background:#eab308;color:#1c1917;border-color:#eab308;"' : '') + '>相談</button></div>');
  h += field('フロント担当', staffSelect(c, 'frontStaff'));
  h += field('予約担当',     staffSelect(c, 'reserveStaff'));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('概算 預かり日数', numIn(c, 'estHoldDays', 'placeholder="例 5（当日仕上げは0）"'));
  h += field('概算 金額（円）', numIn(c, 'estAmount', 'placeholder="作業タイプから自動"'));
  h += '</div>';
  h += '<div class="cf-hint" style="margin-top:0">※ 日数・金額とも作業タイプを選ぶと平均値が自動で入る概算。診断・見積もりで後から直せばOK。</div>';
  h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
  h += '<div class="cf-label">整備内容（自由記入）</div>';
  h += textareaIn(c, 'menu', 2);
  h += '</div></div>';
  h += secEnd();
  /* 旧「担当」セクションは作業内容へ統合（v0.34.4）＝以降のセクション（代車ほか）が一つ上がる */

  /* === 代車 === */
  h += sec('代車', '🚙');
  h += '<div class="cf-row">';
  h += field('代車', toggle(c, 'needLoaner', '必要', '不要'));
  h += '</div>';
  if (c.needLoaner){
    h += '<div class="cf-loaner-detail">';
    h += '<div class="cf-row">';
    h += field('使用代車', loanerSelect(c, 'loanerId'));
    h += field('', '<div class="cf-chips" style="margin-top:20px"><button type="button" id="cf-fixed-btn" class="cf-chip' + (c.loanerFixed ? ' active' : '') + '"' + (c.loanerFixed ? ' style="background:#1db97a;color:#fff;border-color:#1db97a;"' : '') + '>車種固定</button></div>');
    h += '</div>';
    h += '<div class="cf-row">';
    h += field('貸出 から', dateIn(c, 'loanerFrom'));
    h += field('まで',     dateIn(c, 'loanerTo'));
    h += '</div>';
    h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
    h += '<div class="cf-label">代車条件</div>';
    h += conditionChips(c);
    h += '</div></div>';
    h += '<div class="cf-row">';
    h += field('条件メモ', textIn(c, 'loanerOther', 'placeholder="その他"'));
    h += '</div>';
    h += '</div>';
  }
  h += secEnd();

  /* === 入庫時持ち物（車検時のみ） === */
  if (c.workType === 'shaken'){
    h += sec('入庫時持ち物確認（車検）', '📋');
    h += '<div class="cf-row" style="flex-wrap:wrap">';
    h += field('車検証',       toggle(c, 'hasShakenSho', 'あり', 'なし'));
    h += field('納税証明書',   toggle(c, 'hasTaxSho',    '有',   '無'));
    h += field('自賠責',       toggle(c, 'hasJibaiseki', 'あり', 'なし'));
    h += field('諸費用 ¥',     numIn(c, 'feeAmount'));
    h += '</div>';
    h += secEnd();
  }

  /* === 返車 === */
  h += sec('返車', '📤');
  h += '<div class="cf-row">';
  h += field('返車予定・希望', textIn(c, 'returnWish', 'placeholder="お客様希望や予定"'));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('返車日',   dateIn(c, 'returnDate'));
  h += field('返車時刻', textIn(c, 'returnTime', 'placeholder="例 17:00"'));
  h += field('洗車',     toggle(c, 'needWash', '要', '不要'));
  h += '</div>';
  h += secEnd();

  /* === 完了系（後で記入） === */
  h += sec('完了・支払い', '✅');
  h += '<div class="cf-row">';
  h += field('支払方法', paymentSelect(c, 'payment'));
  h += field('後日TEL',  toggle(c, 'followUpTel', '要', '不要'));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('完TEL日',     dateIn(c, 'completeCallAt'));
  h += field('完TEL担当',   staffSelect(c, 'completeCallStaff'));
  h += field('留守',         toggle(c, 'completeCallLeftMsg', 'あり', 'なし'));
  h += '</div>';
  h += secEnd();

  /* === メモ・緊急 === */
  h += sec('メモ', '📝');
  h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
  h += textareaIn(c, 'memo', 3);
  h += '</div></div>';
  h += '<div class="cf-row">';
  h += field('緊急対応', toggle(c, 'urgent', '緊急', '通常'));
  h += '</div>';
  h += secEnd();

  h += '</div>'; // /基本情報パネル
  h += '<div class="cf-panel" data-tab="flow"'   + (_cardTab === 'flow'   ? '' : ' hidden') + '>' + cfFlowHtml(c)   + '</div>';
  h += '<div class="cf-panel" data-tab="maint"'  + (_cardTab === 'maint'  ? '' : ' hidden') + '>' + cfMaintHtml(c)  + '</div>';
  h += '<div class="cf-panel" data-tab="office"' + (_cardTab === 'office' ? '' : ' hidden') + '>' + cfOfficeHtml(c) + '</div>';

  /* === 右パネル（新規予約・全画面のみ）：最短入庫＋予約状況カレンダー（v0.27.0） === */
  if (withSide){
    h += '</div>';   // /cfp-main
    h += '<div class="cfp-side">' + cfSideHtml(c) + '</div>';
    h += '</div>';   // /cfp-wrap
  }

  body.innerHTML = h;

  /* スクロール位置を復元（v0.28.1） */
  const _nm = body.querySelector('.cfp-main');
  const _ns = body.querySelector('.cfp-side');
  const _ng = body.querySelector('#cfs-lg-scroll');
  if (_nm) _nm.scrollTop = _keep.main;
  if (_ns) _ns.scrollTop = _keep.side;
  if (_ng){ _ng.scrollTop = _keep.gT; _ng.scrollLeft = _keep.gL; }

  // === イベントバインド ===
  bindCardFormEvents(body);
}

/* ========================================
   右パネル：最短入庫BOX＋予約状況ミニカレンダー（クリックで入庫日を自動入力）
   ======================================== */
const TEAM_ITEMS = [
  { id: 'default', label: '国産車', color: '#1db97a' },
  { id: 'import',  label: '輸入車', color: '#ec4899' },
];

function cfSideHtml(c){
  const today = new Date(); today.setHours(0,0,0,0);
  const tStr = ymd(today);
  if (!window._cfsYM){ window._cfsYM = { y: today.getFullYear(), m: today.getMonth() }; }
  const picked = (c.boardId === 'default' || c.boardId === 'import');   // 国産/輸入を選んだか
  let h = '';

  /* 並び＝最短入庫カード→カレンダー→（未選択ならもう1チームぶん）カード→カレンダー（v0.27.4） */
  if (picked){
    h += _cfsShortHtml(c, c.boardId, today, tStr);
    h += _cfsCalHtml(c, c.boardId, tStr);
  } else {
    h += _cfsShortHtml(c, 'default', today, tStr);
    h += _cfsCalHtml(c, 'default', tStr);
    h += _cfsShortHtml(c, 'import', today, tStr);
    h += _cfsCalHtml(c, 'import', tStr);
  }

  /* 🚙 代車の空き（「代車必要」を押すと出る・代車ビュー式＝どの車がいつ空くか） */
  if (c.needLoaner) h += _cfsLoanerGanttHtml(today, tStr, c);

  return h;
}

/* ⏱ 最短入庫カード（チーム別・クリックで入庫日に入る）
   ro=true（空きカレンダービュー）では読み取り専用＝クリックなしで日付だけ表示 */
function _cfsShortHtml(c, team, today, tStr, ro){
  if (typeof dashEarliestIntake !== 'function') return '';
  const teamColor = (team === 'import') ? '#ec4899' : '#1db97a';
  const teamName  = (team === 'import') ? '🌍 輸入車' : '🚗 国産車';
  let h = '<div class="cfs-card">';
  h += '<div class="cfs-h" style="border-left-color:' + teamColor + '">⏱ 最短入庫 <span class="cfs-team" style="color:' + teamColor + '">' + teamName + '</span></div>';
  [{ k: 'noLoaner', n: '代車なし' }, { k: 'loaner', n: '代車あり' }, { k: 'same', n: '当日作業' }].forEach(function (x) {
    const d = dashEarliestIntake(team, x.k, today);
    const ds = d ? ymd(d) : null;
    const lbl = !d ? 'なし' : (ds === tStr ? '今日' : (d.getMonth()+1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '）');
    if (ro){
      h += '<div class="cfs-el cfs-el-ro"><span class="cfs-el-n">' + x.n + '</span><b>' + lbl + '</b></div>';
    } else {
      h += '<button type="button" class="cfs-el' + (ds && c.reserveDate === ds ? ' sel' : '') + '"' + (ds ? ' onclick="cfPickShort(\'' + ds + '\',\'' + team + '\',\'' + x.k + '\')"' : ' disabled') + '>'
         + '<span class="cfs-el-n">' + x.n + '</span><b>' + lbl + '</b><span class="cfs-el-go">タップで入庫日に入る</span></button>';
    }
  });
  h += '</div>';
  return h;
}

/* 予約の空きカレンダー（チーム別・月送り共有）
   ro=true（空きカレンダービュー）では日付クリックなしの読み取り専用 */
function _cfsCalHtml(c, team, tStr, ro){
  const teamColor = (team === 'import') ? '#ec4899' : '#1db97a';
  const ym = window._cfsYM;
  const lastD = new Date(ym.y, ym.m + 1, 0).getDate();
  const startDow = new Date(ym.y, ym.m, 1).getDay();
  const rc = (state.settings && state.settings.reserveCap) || { default: 5, import: 3 };
  const base = (team === 'import') ? (rc.import != null ? rc.import : 3) : (rc.default != null ? rc.default : 5);
  const tgt  = (team === 'import') ? 'capImport' : 'capDefault';
  let h = '';
  h += '<div class="cfs-card">';
  h += '<div class="cfs-h" style="border-left-color:' + teamColor + '"><span style="color:' + teamColor + '">' + (team === 'import' ? '🌍 輸入車空き予約' : '🚗 国産車空き予約') + '</span>'
     + '<span class="cfs-nav"><button type="button" onclick="cfsCalShift(-1)" title="前の月">◀</button><b>' + ym.y + '年' + (ym.m + 1) + '月</b><button type="button" onclick="cfsCalShift(1)" title="次の月">▶</button><button type="button" onclick="cfsCalShift(0)" title="今月に戻る">今月</button></span></div>';
  h += '<div class="cfs-cal' + (ro ? ' cfs-cal-ro' : '') + '">';
  ['日','月','火','水','木','金','土'].forEach(function (w, i) {
    h += '<div class="cfs-dow' + (i === 0 ? ' red' : (i === 6 ? ' sat' : '')) + '">' + w + '</div>';
  });
  for (let i = 0; i < startDow; i++) h += '<div class="cfs-day blank"></div>';
  for (let dd = 1; dd <= lastD; dd++){
    const d = new Date(ym.y, ym.m, dd);
    const ds = ymd(d);
    const hol = (window.Holidays && Holidays.name) ? Holidays.name(ds) : null;
    const holBadge = hol ? '<em class="cfs-hol" title="🎌' + hol + '">祝</em>' : '';
    if (ds < tStr){ h += '<div class="cfs-day past"><i>' + dd + '</i>' + holBadge + '</div>'; continue; }
    let cls = '', mark = '', num = '';
    if (window.pitVerdict){
      const tv = pitVerdict(ds)[team];
      const eff = window.pitEffective ? pitEffective(ds, tgt, base) : { value: base, closed: null };
      const cnt = (state.cards || []).filter(function (x) { return x.boardId === team && x.reserveDate === ds && x.status !== 'returned' && x.status !== 'scrap'; }).length;
      if (tv.mark === '休'){ cls = ' closed'; mark = '休'; }
      else {
        num = cnt + '/' + eff.value;
        if (tv.mark === '×'){ cls = ' full'; mark = '満'; }
        else if (tv.mark === '△'){ cls = ' near'; mark = '△'; }
        else { cls = ' ok'; mark = '○'; }
      }
    }
    const dayClick = ro ? '' : ' onclick="cfPickDate(\'' + ds + '\',\'' + team + '\')"';
    h += '<div class="cfs-day' + cls + (!ro && c.reserveDate === ds ? ' sel' : '') + (ds === tStr ? ' today' : '') + '"' + dayClick + ' title="' + (ym.m + 1) + '/' + dd + (hol ? '・🎌' + hol : '') + (num ? '：' + num + '台' : '') + '">'
       + holBadge + '<i>' + dd + '</i>' + (num ? '<span>' + num + '</span>' : '<span></span>') + '<b class="cfs-mk">' + mark + '</b></div>';
  }
  h += '</div>';
  h += '<div class="cfs-hint">' + (ro
        ? '数字＝埋まり/枠　○空きあり ／ △残りわずか ／ 満＝受付終了'
        : '数字＝埋まり/枠　○空きあり ／ △残りわずか ／ 満＝受付終了（タップすると確認が出ます・最終判断は人）') + '</div>';
  h += '</div>';
  return h;
}

/* 🚙 代車の空き（代車ビュー式＝縦に日付・横に各代車。車種名はヘッダに常時表示・下へ無限スクロール）v0.27.5 */
function _cfsLgRows(from, to, today, tStr, c, ro){
  const loaners = state.loaners || [];
  const assigns = state.loanerAssigns || [];
  let h = '';
  for (let i = from; i < to; i++){
    const d = addDays(today, i);
    const ds = ymd(d);
    const dow = d.getDay();
    const dCls = (dow === 0) ? ' red' : (dow === 6 ? ' sat' : '');
    h += '<tr data-ds="' + ds + '"><td class="cfs-lg-d' + dCls + (ds === tStr ? ' today' : '') + '">' + (d.getMonth()+1) + '/' + d.getDate() + '<span>' + '日月火水木金土'[dow] + '</span></td>';
    loaners.forEach(function (l) {
      const a = assigns.find(function (x) { return x.loanerId === l.id && x.fromDate <= ds && x.toDate >= ds; });
      if (a){
        h += '<td class="cfs-lg-busy" title="' + (l.name || '') + ' ' + (l.model || '') + '：' + (a.customer || '貸出中') + (a.car ? '（' + a.car + '）' : '') + ' 〜' + a.toDate.slice(5).replace('-', '/') + '"></td>';
      } else if (ro){
        /* 空きカレンダービュー＝読み取り専用（クリック選択なし） */
        h += '<td class="cfs-lg-free cfs-lg-ro" title="' + (l.name || '') + ' ' + (l.model || '') + '：空き"></td>';
      } else {
        /* このカードの貸出予定（使用代車＋から/まで）と一致するマスは緑＝双方向（ドラッグでもテキスト入力でも光る） */
        const pick = c && c.loanerId === l.id && c.loanerFrom && c.loanerTo && ds >= c.loanerFrom && ds <= c.loanerTo;
        h += '<td class="cfs-lg-free' + (pick ? ' cfs-lg-pick' : '') + '" data-lgl="' + l.id + '" data-lgd="' + ds + '" title="' + (l.name || '') + ' ' + (l.model || '') + '：空き（クリック→ドラッグで貸出期間に）"></td>';
      }
    });
    h += '</tr>';
  }
  return h;
}

function _cfsLoanerGanttHtml(today, tStr, c, ro){
  const loaners = state.loaners || [];
  if (!window._cfsLgN) window._cfsLgN = 28;
  let h = '<div class="cfs-card">';
  h += '<div class="cfs-h" style="border-left-color:#f59e0b"><span style="color:#f59e0b">🚙 代車カレンダー</span>'
     + '<span class="cfs-nav"><button type="button" onclick="cfsLgToday()" title="一番上（今日）に戻る">📍 今日へ</button></span></div>';
  h += '<div class="cfs-lg-scroll" id="cfs-lg-scroll" onscroll="cfsLgScroll(this)"><table class="cfs-lg">';
  h += '<thead><tr><th class="cfs-lg-d"></th>';
  loaners.forEach(function (l) {
    h += '<th title="' + (l.name || '') + ' ' + (l.model || '') + '"><i>' + String(l.name || '').replace('代車', '') + '</i><b>' + (l.model || '') + '</b></th>';
  });
  h += '</tr></thead>';
  h += '<tbody id="cfs-lg-body">' + _cfsLgRows(0, window._cfsLgN, today, tStr, c, ro) + '</tbody>';
  h += '</table></div>';
  h += '<div class="cfs-hint">' + (ro
        ? '色付き＝貸出中（マウスで誰に・いつまでか）／空白＝空き。下にスクロールで先の日付まで見られます。'
        : '色付き＝貸出中（マウスで誰に・いつまでか）／<b style="color:#1db97a">緑＝このカードの貸出予定</b>。空きマスを<b>クリック→そのままドラッグ</b>で「使用代車＋貸出から/まで」に自動で入ります（下の入力欄に日付を打っても緑が追従）。') + '</div>';
  h += '</div>';
  return h;
}

/* 代車ガント：行を継ぎ足す共通処理（スクロール位置はそのまま） */
function _cfsLgAppend (count) {
  const body = document.getElementById('cfs-lg-body');
  if (!body) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = window._cfsLgN || 28;
  window._cfsLgN = from + (count || 21);
  const ro = (state.currentView === 'availcal');   // 空きカレンダービューは読み取り専用
  const c = ro ? null : state.cards.find(x => x.id === _editingCardId);
  body.insertAdjacentHTML('beforeend', _cfsLgRows(from, window._cfsLgN, today, ymd(today), c, ro));
}
/* 代車ガント：下端近くで21日ずつ継ぎ足し */
window.cfsLgScroll = function (sc) {
  if (!sc) return;
  if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 200){
    _cfsLgAppend(21);
  }
};
/* 代車ガント：縦スクロールバーが必ず出るよう、表示領域を超えるまで先に行を埋める。
   （これがないと初期行が縦にあふれず、横スクロールで初めて縦が出る不具合になる） */
window.cfsLgFill = function () {
  const sc = document.getElementById('cfs-lg-scroll');
  if (!sc) return;
  let guard = 0;
  while (sc.scrollHeight <= sc.clientHeight + 20 && guard < 40){ _cfsLgAppend(21); guard++; }
};
/* 代車ガント：今日（一番上）へ戻る */
window.cfsLgToday = function () {
  const sc = document.getElementById('cfs-lg-scroll');
  if (sc) sc.scrollTop = 0;
};

/* 🔎 入力チェック（v0.28.1）：漏れていそうな項目を赤くハイライト＋先頭へスクロール。強制はしない */
window.pitCardCheck = function () {
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  const body = document.getElementById(_cardBodyId || 'md-body');
  if (!body) return;
  body.querySelectorAll('.cf-miss').forEach(el => el.classList.remove('cf-miss'));

  const need = [
    ['customer',    'お客様名',        !!(c.customer || '').trim()],
    ['tel',         'TEL',             !!(c.tel || '').trim()],
    ['boardId',     '国産車／輸入車',  c.boardId === 'default' || c.boardId === 'import'],
    ['maker',       'メーカー',        !!(c.maker || '').trim()],
    ['car',         '車種（グレード）', !!(c.car || '').trim()],
    ['reserveDate', '入庫日',          !!c.reserveDate],
    ['workType',    '作業タイプ',      !!c.workType],
    ['dropType',    '受付タイプ',      !!c.dropType],
  ];
  if (c.needLoaner){
    need.push(['loanerId',   '使用代車', !!c.loanerId]);
    need.push(['loanerFrom', '貸出から', !!c.loanerFrom]);
    need.push(['loanerTo',   '貸出まで', !!c.loanerTo]);
  }

  const misses = [];
  let first = null;
  need.forEach(function (n) {
    if (n[2]) return;
    misses.push(n[1]);
    const el = body.querySelector('[data-key="' + n[0] + '"]');
    if (el){
      el.classList.add('cf-miss');
      if (!first) first = el;
    }
  });

  if (!misses.length){
    if (window.pitToast) pitToast('✅ 入力OK！漏れはありません');
    return;
  }
  if (window.pitToast) pitToast('⚠ 未入力 ' + misses.length + '件：' + misses.join('・'));
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

/* カレンダーの月送り（右パネル）。n=0 で今月に戻る */
window.cfsCalShift = function (n) {
  if (!window._cfsYM) return;
  if (n === 0){
    const now = new Date();
    window._cfsYM = { y: now.getFullYear(), m: now.getMonth() };
  } else {
    const d = new Date(window._cfsYM.y, window._cfsYM.m + n, 1);
    window._cfsYM = { y: d.getFullYear(), m: d.getMonth() };
  }
  // 空きカレンダービューならそちらを再描画。それ以外は編集中カードのフォームを再描画。
  if (state.currentView === 'availcal' && window.renderAvail){ renderAvail(); return; }
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c) renderCardForm(c);
};

/* 右パネルの日付タップ → 入庫日に自動入力（×の日は確認・従来ガードと同じ）
   team指定あり＝そのカレンダーのチームで判定（チーム未選択でも正しく警告が出る）
   同じ日をもう一度タップ＝選択キャンセル（v0.28.1） */
window.cfPickDate = function (ds, team) {
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  if (c.reserveDate === ds){   // 同日タップ＝キャンセル
    c.reserveDate = '';
    renderCardForm(c);
    return;
  }
  const judge = { boardId: team || c.boardId };   // ガードはチームだけ見る
  const fin = (window.pitIntakeGuard) ? pitIntakeGuard(judge, ds, c.reserveDate) : ds;
  if (fin !== ds) return;   // やめた
  c.reserveDate = ds;
  renderCardForm(c);
};

/* ⏱最短入庫カードのタップ → 入庫日セット＋カレンダーをその月へジャンプ。
   「代車あり」は代車ガントも出して該当日へスクロール（v0.28.1） */
window.cfPickShort = function (ds, team, kind) {
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  const judge = { boardId: team || c.boardId };
  const fin = (window.pitIntakeGuard) ? pitIntakeGuard(judge, ds, c.reserveDate) : ds;
  if (fin !== ds) return;
  c.reserveDate = ds;
  const p = ds.split('-');
  window._cfsYM = { y: +p[0], m: +p[1] - 1 };   // 予約カレンダーをその月へ
  if (kind === 'loaner'){
    c.needLoaner = true;   // 代車ガントも表示
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const idx = Math.round((new Date(+p[0], +p[1]-1, +p[2]) - today) / 86400000);
    if ((window._cfsLgN || 28) < idx + 14) window._cfsLgN = idx + 28;   // 行を先に確保
  }
  renderCardForm(c);
  if (kind === 'loaner'){
    const sc = document.getElementById('cfs-lg-scroll');
    const tr = sc && sc.querySelector('tr[data-ds="' + ds + '"]');
    if (sc && tr) sc.scrollTop = Math.max(0, tr.offsetTop - 60);   // ガントを該当日へ
  }
};

/* ========================================
   ヘルパー：セクション・フィールド・コントロール
   ======================================== */
function sec(title, icon){
  return '<div class="cf-section"><div class="cf-section-head">' +
    (icon || '') + ' <span>' + title + '</span></div><div class="cf-section-body">';
}
function secEnd(){ return '</div></div>'; }

function field(label, control){
  return '<div class="cf-field">' +
    (label ? '<div class="cf-label">' + label + '</div>' : '') +
    control + '</div>';
}

function textIn(c, key, attr){
  const v = c[key] == null ? '' : String(c[key]).replace(/"/g, '&quot;');
  return '<input type="text" class="cf-input" data-key="' + key + '" value="' + v + '" ' + (attr || '') + '>';
}
function numIn(c, key, attr){
  const v = c[key] == null ? '' : String(c[key]);
  return '<input type="number" class="cf-input" data-key="' + key + '" value="' + v + '" ' + (attr || '') + '>';
}
function dateIn(c, key){
  const v = c[key] || '';
  return '<input type="date" class="cf-input" data-key="' + key + '" value="' + v + '">';
}
function textareaIn(c, key, rows){
  const v = c[key] == null ? '' : String(c[key]);
  return '<textarea class="cf-input" data-key="' + key + '" rows="' + (rows || 2) + '">' + v + '</textarea>';
}

function chips(c, key, items, allowNone){
  let h = '<div class="cf-chips" data-key="' + key + '">';
  items.forEach(it => {
    const active = c[key] === it.id;
    let style = '';
    if (active && it.color){
      style = 'style="background:' + it.color + ';color:#fff;border-color:' + it.color + ';"';
    } else if (it.color){
      style = 'style="border-color:' + it.color + ';color:' + it.color + ';"';
    }
    h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + '" data-val="' + it.id + '" ' + style + '>' + it.label + '</button>';
  });
  h += '</div>';
  return h;
}

function toggle(c, key, onLabel, offLabel){
  const on = !!c[key];
  return '<div class="cf-toggle" data-key="' + key + '">' +
    '<button type="button" class="cf-tg' + (on ? ' active' : '') + '" data-val="1">' + onLabel + '</button>' +
    '<button type="button" class="cf-tg' + (!on ? ' active' : '') + '" data-val="0">' + offLabel + '</button>' +
    '</div>';
}

function staffSelect(c, key){
  let h = '<select class="cf-input" data-key="' + key + '">';
  h += '<option value="">―</option>';
  state.staff.forEach(s => {
    const sel = c[key] === s.name ? ' selected' : '';
    h += '<option value="' + s.name + '"' + sel + '>' + s.name + '</option>';
  });
  h += '</select>';
  return h;
}

function loanerSelect(c, key){
  let h = '<select class="cf-input" data-key="' + key + '">';
  h += '<option value="">―</option>';
  state.loaners.forEach(l => {
    const sel = c[key] === l.id ? ' selected' : '';
    h += '<option value="' + l.id + '"' + sel + '>' + l.name + ' ' + l.model + '</option>';
  });
  h += '</select>';
  return h;
}

function paymentSelect(c, key){
  let h = '<select class="cf-input" data-key="' + key + '">';
  h += '<option value="">―</option>';
  state.paymentMethods.forEach(p => {
    const sel = c[key] === p.id ? ' selected' : '';
    h += '<option value="' + p.id + '"' + sel + '>' + p.label + '</option>';
  });
  h += '</select>';
  return h;
}

function conditionChips(c){
  const arr = c.loanerConditions || [];
  let h = '<div class="cf-chips" data-key="loanerConditions" data-multi="1">';
  state.loanerConditions.forEach(it => {
    const active = arr.indexOf(it.id) >= 0;
    h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + '" data-val="' + it.id + '">' + it.label + '</button>';
  });
  h += '</div>';
  return h;
}

/* ========================================
   イベントバインド：入力即反映（自動保存）
   ======================================== */
function bindCardFormEvents(root){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;

  // テキスト・select
  root.querySelectorAll('input.cf-input, textarea.cf-input, select.cf-input').forEach(el => {
    if (el.dataset.key === 'reserveDate') el.dataset.prev = el.value;   // 受付○△×ガード用に元の日付を控える
    el.addEventListener('input', () => {
      const key = el.dataset.key;
      let v = el.value;
      if (el.type === 'number') v = v === '' ? null : Number(v);
      c[key] = v;
    });
    el.addEventListener('change', () => {
      const key = el.dataset.key;
      let v = el.value;
      if (el.type === 'number') v = v === '' ? null : Number(v);
      // 入庫日の変更は受付○△×ガードを通す（×＝「それでも入れますか？」・△＝一言トースト・強制はしない）
      if (key === 'reserveDate' && window.pitIntakeGuard) {
        const fin = pitIntakeGuard(c, v, el.dataset.prev || '');
        if (fin !== v) { el.value = fin; v = fin; }
        el.dataset.prev = fin;
      }
      c[key] = v;
    });
  });

  // チップ（単一選択）
  root.querySelectorAll('.cf-chips:not([data-multi])').forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const newVal = btn.dataset.val;
        const wasActive = btn.classList.contains('active');
        if (key === 'boardId'){
          // 国産/輸入は解除なし。選ぶと課も自動選択（国→1課・輸→2課）
          c.boardId = newVal;
          c.division = (newVal === 'import') ? 'div2' : 'div1';
        } else if (wasActive){
          c[key] = null;   // 同じ値クリックで解除
        } else {
          c[key] = newVal;
        }
        // 作業タイプ・受付タイプを選んだら概算（日数・金額）を自動セット（後から手で直せる）
        if (key === 'workType' || key === 'dropType'){
          if (window.pitEstHold)   c.estHoldDays = pitEstHold(c.workType, c.dropType);
          if (window.pitEstAmount && key === 'workType' && c.workType) c.estAmount = pitEstAmount(c.workType);
        }
        renderCardForm(c);
      });
    });
  });

  // チップ（複数選択：代車条件）
  root.querySelectorAll('.cf-chips[data-multi]').forEach(group => {
    const key = group.dataset.key;
    if (!Array.isArray(c[key])) c[key] = [];
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.val;
        const idx = c[key].indexOf(v);
        if (idx >= 0) c[key].splice(idx, 1);
        else c[key].push(v);
        btn.classList.toggle('active');
      });
    });
  });

  // 相談ボタン（待・当・預と同じ見た目の単独チップ・押した時だけON）
  const consultBtn = root.querySelector('#cf-consult-btn');
  if (consultBtn){
    consultBtn.addEventListener('click', () => {
      c.consult = !c.consult;
      renderCardForm(c);
    });
  }
  // 車種固定ボタン（ある時だけ押す単独チップ）
  const fixedBtn = root.querySelector('#cf-fixed-btn');
  if (fixedBtn){
    fixedBtn.addEventListener('click', () => {
      c.loanerFixed = !c.loanerFixed;
      renderCardForm(c);
    });
  }

  // 🚙 代車ガント：空きマスをクリック→ドラッグで範囲選択→「使用代車＋貸出から/まで」に自動入力（v0.28.0）
  const lgBody = root.querySelector('#cfs-lg-body');
  if (lgBody){
    const busyAt = (lid, ds) => (state.loanerAssigns || []).some(a => a.loanerId === lid && a.fromDate <= ds && a.toDate >= ds);
    const nextDs = (ds) => { const p = ds.split('-'); const d = new Date(+p[0], +p[1]-1, +p[2]); d.setDate(d.getDate()+1); return ymd(d); };
    const rangeFree = (lid, a, b) => {   // a〜b（両端含む）が全部空きか
      let cur = a;
      while (cur <= b){ if (busyAt(lid, cur)) return false; cur = nextDs(cur); }
      return true;
    };
    const paint = (drag) => {
      lgBody.querySelectorAll('td[data-lgd]').forEach(td => {
        const on = drag && td.dataset.lgl === drag.l && td.dataset.lgd >= drag.a && td.dataset.lgd <= drag.b;
        td.classList.toggle('cfs-lg-pick', on || (!drag && c.loanerId === td.dataset.lgl && c.loanerFrom && c.loanerTo && td.dataset.lgd >= c.loanerFrom && td.dataset.lgd <= c.loanerTo));
      });
    };
    let drag = null;
    lgBody.addEventListener('mousedown', (e) => {
      const td = e.target.closest('td[data-lgd]');
      if (!td) return;
      e.preventDefault();
      drag = { l: td.dataset.lgl, anchor: td.dataset.lgd, a: td.dataset.lgd, b: td.dataset.lgd };
      paint(drag);
      document.addEventListener('mouseup', () => {
        if (!drag) return;
        c.needLoaner = true;
        c.loanerId = drag.l;
        c.loanerFrom = drag.a;
        c.loanerTo = drag.b;
        drag = null;
        if (window.PitDB) PitDB.save();
        renderCardForm(c);   // 使用代車セレクト・日付欄・緑マスがすべて追従
      }, { once: true });
    });
    lgBody.addEventListener('mouseover', (e) => {
      if (!drag) return;
      const td = e.target.closest('td[data-lgd]');
      if (!td || td.dataset.lgl !== drag.l) return;   // 同じ代車の列だけ
      let a = drag.anchor, b = td.dataset.lgd;
      if (b < a){ const t = a; a = b; b = t; }
      if (rangeFree(drag.l, a, b)){ drag.a = a; drag.b = b; paint(drag); }   // 途中に貸出中があれば伸ばさない
    });
  }

  // トグル
  root.querySelectorAll('.cf-toggle').forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll('.cf-tg').forEach(btn => {
      btn.addEventListener('click', () => {
        c[key] = btn.dataset.val === '1';
        renderCardForm(c);
      });
    });
  });
}
