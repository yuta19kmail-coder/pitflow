/* ========================================
   card-detail.js
   入庫カード詳細フォーム（自動保存・現代的UI）
   ======================================== */

let _editingCardId = null;
let _returnView = 'today';   // 全画面カードを閉じたとき戻る先
let _cardTab = 'basic';      // カード内タブの現在地（card-tabs.js が参照）
let _cardMode = 'page';      // 'page'＝新規入庫(全画面) / 'modal'＝各ビューから(ポップアップ)
let _cardBodyId = 'md-body'; // フォームの描画先（card-tabs.js も参照）
let _cardCheckOn = false;    // 入力チェックON中＝未入力を赤枠表示（再描画/入力ごとに再評価）

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
  _cardCheckOn = false;   // 開いた直後は赤枠なし
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

  /* === タブ（新規予約＝page は基本情報だけ・既存編集＝modal は全タブ）v0.35.5 === */
  if (!_cardTab) _cardTab = 'basic';
  if (withSide){
    _cardTab = 'basic';   // 新規予約は基本情報のみ表示
    h += '<div class="cf-tabs">' + cfTabBtn('basic', '📋 基本情報') + '</div>';
  } else {
    h += '<div class="cf-tabs">'
       + cfTabBtn('basic',  '📋 基本情報')
       + cfTabBtn('flow',   '🕒 フロー')
       + cfTabBtn('maint',  '🔧 整備')
       + cfTabBtn('office', '🗂 バックオフィス')
       + '</div>';
  }

  /* === 基本情報パネル === */
  h += '<div class="cf-panel" data-tab="basic"' + (_cardTab === 'basic' ? '' : ' hidden') + '>';

  /* === 基本情報（車両もここに統合・v0.27.0） === */
  h += sec('基本情報', '👤');
  /* 1行目：お客様名｜カナ（スクショ配置・v0.37.4） */
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:3"><div class="cf-label">お客様名</div>' + textIn(c, 'customer', 'autocomplete="off"') + '</div>';
  h += '<div class="cf-field" style="flex:2"><div class="cf-label">カナ</div>' + textIn(c, 'kana', 'placeholder="自動（名前を入力）" autocomplete="off"') + '</div>';
  h += '</div>';
  /* 2行目：ナンバー｜TEL｜初回・リピーター */
  h += '<div class="cf-row">';
  h += field('ナンバー', plateInput(c));
  h += field('TEL',      telInput(c));
  h += field('初回／リピーター', chips(c, 'repeat', state.repeatTypes));
  h += '</div>';
  /* 3行目：国産車/輸入車｜メーカー｜車種 */
  h += '<div class="cf-row">';
  h += field('国産車／輸入車', chips(c, 'boardId', TEAM_ITEMS));
  h += field('メーカー', textIn(c, 'maker', 'placeholder="例 トヨタ"'));
  h += field('車種（グレード）', textIn(c, 'car', 'placeholder="例 アクアGz"'));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('入庫日', dateIn(c, 'reserveDate'));
  h += field('入庫時刻', textIn(c, 'reserveTime', 'placeholder="例 09:30 / 09:00-10:00"'));
  h += field('予約受付日', dateIn(c, 'bookedAt'));
  h += '</div>';
  h += secEnd();

  /* === 予約内容（旧「作業内容」＝作業タイプ/課/受付/相談/担当/概算＋代車を統合・v0.35.2） === */
  h += sec('予約内容', '🗒️');
  /* 1行目：作業タイプ（広め）＋ 課 */
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:3"><div class="cf-label">作業タイプ</div>' + chips(c, 'workType', state.workTypes, true) + '</div>';
  h += field('課', chips(c, 'division', state.divisions, true));
  h += '</div>';
  /* 2行目：受付タイプ（待/当/預）の右隣に「相談」を□っぽい別ボタンで配置（区切り線で違いを演出）＋担当を1行に詰める */
  h += '<div class="cf-row">';
  h += field('受付タイプ', '<div class="cf-recv">' + chips(c, 'dropType', state.dropTypes, true)
       + '<span class="cf-recv-sep"></span>'
       + '<button type="button" id="cf-consult-btn" class="cf-consult' + (c.consult ? ' active' : '') + '">相談</button>'
       + '<button type="button" id="cf-codered-btn" class="cf-codered' + (c.codeRed ? ' active' : '') + '" title="マルエフ＝コードレッド（クレーム等の要注意案件）">F</button></div>');
  h += field('フロント担当', staffSelect(c, 'frontStaff'));
  h += field('予約担当',     staffSelect(c, 'reserveStaff'));
  h += '</div>';
  /* 3行目：概算 */
  h += '<div class="cf-row">';
  h += field('概算 預かり日数', numIn(c, 'estHoldDays', 'placeholder="例 5（当日仕上げは0）"'));
  h += field('概算 金額（円）', numIn(c, 'estAmount', 'placeholder="作業タイプから自動"'));
  h += '</div>';
  h += '<div class="cf-hint" style="margin-top:0">※ 日数・金額とも作業タイプを選ぶと平均値が自動で入る概算。診断・見積もりで後から直せばOK。</div>';
  /* 車検を選んだ時だけ：入庫時持ち物（概算の下・代車の上に出す・v0.35.4） */
  if (c.workType === 'shaken'){
    h += '<div class="cf-subhead">📋 入庫時持ち物（車検）</div>';
    h += '<div class="cf-row" style="flex-wrap:wrap">';
    h += field('車検証',     toggle(c, 'hasShakenSho', 'あり', 'なし'));
    h += field('納税証明書', toggle(c, 'hasTaxSho',    '有',   '無'));
    h += field('自賠責',     toggle(c, 'hasJibaiseki', 'あり', 'なし'));
    h += field('諸費用 ¥',   numIn(c, 'feeAmount'));
    h += '</div>';
  }
  /* 代車（旧・独立セクション → 予約内容に統合・v0.35.2）。スイッチONで使用代車＋車種固定をスイッチの右隣に並べ、行を減らして高さを抑える（v0.35.3） */
  h += '<div class="cf-subhead">🚙 代車</div>';
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">代車</div>' + toggle(c, 'needLoaner', '必要', '不要') + '</div>';
  if (c.needLoaner){
    h += '<div class="cf-field" style="flex:2"><div class="cf-label">使用代車</div>' + loanerSelect(c, 'loanerId') + '</div>';
    h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">&nbsp;</div><div class="cf-chips"><button type="button" id="cf-fixed-btn" class="cf-chip' + (c.loanerFixed ? ' active' : '') + '"' + (c.loanerFixed ? ' style="background:#1db97a;color:#fff;border-color:#1db97a;"' : '') + '>車種固定</button></div></div>';
  }
  h += '</div>';
  if (c.needLoaner){
    h += '<div class="cf-loaner-detail">';
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

  /* === 内容（旧「整備内容（自由記入）」を独立セクション化＋テンプレ挿入・v0.35.2） === */
  h += sec('内容', '🔧');
  h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
  h += '<div class="cf-label">作業内容（自由記入）</div>';
  h += textareaIn(c, 'menu', 3);
  h += '<div class="cf-tpl">';
  h += '<button type="button" class="cf-tpl-toggle" onclick="cfMenuTplToggle(this)">＋ テンプレートから入れる ▾</button>';
  h += '<div class="cf-tpl-panel">';
  CF_MENU_TPL.forEach(function(t, i){ h += '<button type="button" class="cf-tpl-chip" onclick="cfMenuAddTpl(' + i + ')">' + t + '</button>'; });
  h += '</div>';
  h += '</div>';
  h += '</div></div>';
  h += secEnd();

  /* 入庫時持ち物（車検）は予約内容＝概算の下・代車の上へ移動済み（v0.35.4） */
  /* 返車・完了/支払い・メモは基本情報タブから撤去（v0.35.5）。返車/支払いは将来「別タブ」へ。
     データキー（returnDate・returnTime・needWash・payment・followUpTel・completeCall系・memo・urgent）はモデルに温存。
     ※返車予定はフロータブのタイムラインに引き続き表示される。 */

  h += '</div>'; // /基本情報パネル
  // 他タブ（フロー/整備/バックオフィス）は既存編集（modal）時のみ。新規予約（page）は基本情報だけ。
  if (!withSide){
    h += '<div class="cf-panel" data-tab="flow"'   + (_cardTab === 'flow'   ? '' : ' hidden') + '>' + cfFlowHtml(c)   + '</div>';
    h += '<div class="cf-panel" data-tab="maint"'  + (_cardTab === 'maint'  ? '' : ' hidden') + '>' + cfMaintHtml(c)  + '</div>';
    h += '<div class="cf-panel" data-tab="office"' + (_cardTab === 'office' ? '' : ' hidden') + '>' + cfOfficeHtml(c) + '</div>';
  }

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

/* 未入力の項目に赤枠(.cf-miss)を付け直す共通処理。未入力ラベルの配列を返す（トーストは出さない）。
   再描画ごと・入力ごとに呼ぶ＝埋めた項目はその場で赤が外れ、未入力だけ残る。 */
function _cardMarkMisses(c, root){
  if (!root) return [];
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
  // 代車を「不要」にした時など、対象外になったキーの赤は消す
  const activeKeys = need.map(n => n[0]);
  ['loanerId', 'loanerFrom', 'loanerTo'].forEach(function (k){
    if (activeKeys.indexOf(k) < 0){ const el = root.querySelector('[data-key="' + k + '"]'); if (el) el.classList.remove('cf-miss'); }
  });
  const misses = [];
  need.forEach(function (n) {
    const el = root.querySelector('[data-key="' + n[0] + '"]');
    // 未入力→赤を付ける／入力済→外す。toggle(force)なので既に赤の項目は再アニメしない（入力中のチラつき防止）
    if (el) el.classList.toggle('cf-miss', !n[2]);
    if (!n[2]) misses.push(n[1]);
  });
  return misses;
}
/* 再描画後に赤枠を貼り直す（チェックON中のみ）。bindCardFormEvents から呼ぶ。 */
function _cardReapplyCheck(root){
  if (!_cardCheckOn) return;
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c) _cardMarkMisses(c, root);
}
/* 🔎 入力チェック（v0.28.1）：漏れていそうな項目を赤くハイライト＋先頭へスクロール。強制はしない */
window.pitCardCheck = function () {
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  const body = document.getElementById(_cardBodyId || 'md-body');
  if (!body) return;
  const misses = _cardMarkMisses(c, body);
  _cardCheckOn = misses.length > 0;   // 以降の再描画・入力でも未入力だけ赤を保つ
  if (!misses.length){
    if (window.pitToast) pitToast('✅ 入力OK！漏れはありません');
    return;
  }
  if (window.pitToast) pitToast('⚠ 未入力 ' + misses.length + '件：' + misses.join('・'));
  const first = body.querySelector('.cf-miss');
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
  const div = c.division || '';   // 課が選ばれていれば、その課＋全社(課なし)のメンバーだけ出す
  // 役割で絞る：フロント担当＝フロントのみ／予約担当・完TEL担当＝受付＋フロント
  const frontOnly  = (key === 'frontStaff');
  const frontOrRcv = (key === 'reserveStaff' || key === 'completeCallStaff');
  let h = '<select class="cf-input" data-key="' + key + '">';
  h += '<option value="">―</option>';
  state.staff.forEach(s => {
    if (div && s.division && s.division !== div) return;        // 別の課のメンバーは一覧から消す
    if (frontOnly  && !s.front) return;                         // フロント担当＝フロント業務ありのみ
    if (frontOrRcv && !(s.front || s.reception)) return;        // 予約/完TEL＝受付＋フロント（メカのみは出さない）
    const sel = c[key] === s.name ? ' selected' : '';
    h += '<option value="' + s.name + '"' + sel + '>' + s.name + '</option>';
  });
  h += '</select>';
  return h;
}
/* 担当の名前→その人の課。課が変わったら、別の課の担当はクリア（一覧から消える挙動に合わせる） */
function _staffDivision(name){ const m = (state.staff || []).find(s => s.name === name); return m ? (m.division || '') : ''; }
function _syncStaffToDivision(c){
  ['frontStaff', 'reserveStaff'].forEach(function(k){
    const d = _staffDivision(c[k]);
    if (c[k] && d && c.division && d !== c.division) c[k] = '';
  });
}

/* ===== 内容セクションのテンプレ（自由入力に1行ずつ足せる） ===== */
const CF_MENU_TPL = [
  'エンジンオイル交換', 'オイル・エレメント交換', 'タイヤ交換（4本）', 'タイヤ組替・バランス',
  'バッテリー交換', 'ブレーキパッド交換', 'ワイパーゴム交換', 'エアコンフィルター交換',
  '12ヶ月点検', '車検整備一式', '下回り点検・洗浄', 'ヘッドライト光軸調整',
  '冷却水（LLC）交換', '持ち込み部品取付', '見積り後に連絡'
];
/* テンプレ開閉（再描画せずパネルをトグル＝開いたまま連続で足せる） */
function cfMenuTplToggle(btn){
  const wrap = btn.closest('.cf-tpl');
  if (wrap) wrap.classList.toggle('open');
}
/* テンプレを内容（c.menu）に1行ずつ追記（テキストへ直接反映＝再描画なし） */
function cfMenuAddTpl(i){
  const c = state.cards.find(x => x.id === _editingCardId); if (!c) return;
  const t = CF_MENU_TPL[i]; if (!t) return;
  const ta = document.querySelector('textarea.cf-input[data-key="menu"]');
  const cur = (c.menu || '').replace(/\s+$/, '');
  c.menu = cur ? (cur + '\n' + t) : t;
  if (ta) { ta.value = c.menu; ta.focus(); }
  if (window.PitDB) PitDB.save();
}
window.cfMenuTplToggle = cfMenuTplToggle;
window.cfMenuAddTpl = cfMenuAddTpl;

/* ===== ナンバー：見た目は1BOX、クリックで「地名/分類番号/かな/ナンバー」のガイドが開く（スペース揺れ防止） ===== */
/* 地名＝陸運局（ナンバー管轄）。datalistで候補表示＝オート入力。未収録でも手入力可。
   並びは関東（地元の千葉エリア）から＝よく使う順。2025年のご当地(十勝/日光/江戸川/安曇野/南信州/彦根)まで反映 */
const PLATE_REGIONS = [
  // 千葉（地元）
  '野田','柏','習志野','千葉','松戸','船橋','市川','成田','袖ヶ浦',
  // 東京
  '品川','練馬','足立','多摩','八王子','世田谷','杉並','板橋','江東','葛飾','江戸川',
  // 埼玉
  '大宮','川口','所沢','川越','熊谷','春日部','越谷','さいたま',
  // 神奈川
  '横浜','川崎','湘南','相模',
  // 茨城・栃木・群馬
  '水戸','土浦','つくば','宇都宮','栃木','とちぎ','那須','日光','群馬','前橋','高崎',
  // 北海道
  '札幌','函館','旭川','室蘭','苫小牧','釧路','帯広','北見','知床','十勝',
  // 東北
  '青森','八戸','弘前','岩手','盛岡','平泉','宮城','仙台','秋田','山形','庄内','福島','会津','いわき',
  // 甲信越・北陸
  '新潟','長岡','上越','富山','金沢','石川','福井','山梨','富士山','長野','松本','諏訪','飯田','安曇野','南信州',
  // 東海
  '岐阜','飛騨','静岡','浜松','沼津','伊豆','名古屋','尾張小牧','一宮','春日井','三河','岡崎','豊田','豊橋','三重','鈴鹿','四日市','伊勢志摩',
  // 近畿
  '滋賀','彦根','京都','大阪','なにわ','和泉','堺','神戸','姫路','奈良','飛鳥','和歌山',
  // 中国・四国
  '鳥取','島根','出雲','岡山','倉敷','広島','福山','山口','下関','周南','徳島','香川','高松','愛媛','高知',
  // 九州・沖縄
  '福岡','北九州','久留米','筑豊','佐賀','長崎','佐世保','熊本','大分','宮崎','鹿児島','奄美','沖縄'
];
function _pe(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
/* ひらがな→カタカナ */
function _toKatakana(s){ return String(s == null ? '' : s).replace(/[ぁ-ゖ]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) + 0x60); }); }
/* 自動フリガナ：お客様名をIMEで打つと、変換前の読み（ひらがな）を拾ってカナ欄へ。手で直せる。
   仕組み：compositionupdate で変換前の読みを掴み、compositionend で確定ぶんをカナ欄に足す。
   英字直接入力や貼り付けは拾えない＝その時はカナ欄を手入力（だから編集可）。 */
function _bindAutoKana(nameEl, kanaEl, c){
  if (!nameEl || !kanaEl) return;
  const hasKanji = function(s){ return /[㐀-䶿一-鿿豈-﫿々々]/.test(s || ''); };
  let base = kanaEl.value || '';   // 確定済みカナ（再描画後も既存値から継続）
  let comp = '';                   // 変換“前”の読み（ひらがな）だけを保持
  nameEl.addEventListener('compositionstart', function(){ base = kanaEl.value || ''; comp = ''; });
  nameEl.addEventListener('compositionupdate', function(e){
    const d = e.data || '';
    if (hasKanji(d)) return;       // ★変換後（漢字候補）は拾わない＝「小林」がカナ欄に出ない
    comp = d;                      // 変換前の読みだけ更新
    kanaEl.value = base + _toKatakana(comp);
  });
  nameEl.addEventListener('compositionend', function(){
    base = base + _toKatakana(comp); comp = '';
    kanaEl.value = base; c.kana = base;
    if (window.PitDB) PitDB.save();
  });
  // 名前を空にしたらカナも空に（打ち直し時のゴミ防止）
  nameEl.addEventListener('input', function(){ if (!nameEl.value){ base = ''; comp = ''; kanaEl.value = ''; c.kana = ''; } });
}
/* 分類番号・ナンバー(一連)＝半角数字のみ。全角数字→半角、ハイフン/文字は禁止（除去）、桁数で切る。例「55－55」→「5555」 */
function _plateDigits(s, max){
  const v = String(s == null ? '' : s)
    .replace(/[０-９]/g, function(d){ return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); })
    .replace(/[^0-9]/g, '');
  return v.slice(0, max || 4);
}
/* TEL：ナンバー同様、見た目は1BOX・クリックで3枠ガイドが開く。各枠は半角数字のみ（全角→半角・ハイフン/文字不可）、
   保存は "市外-市内-番号" にハイフン自動挿入。c.tel は従来どおり1文字列＝一覧/帳票そのまま。 */
function telInput(c){
  const p = String(c.tel || '').split('-');
  const v1 = _pe(p[0] || ''), v2 = _pe(p[1] || ''), v3 = _pe(p.slice(2).join('') || '');
  let h = '<div class="cf-tel">';
  h += '<input type="text" class="cf-input cf-tel-main" data-tel-main readonly value="' + _pe(c.tel || '') + '" placeholder="クリックして入力" autocomplete="off">';
  h += '<div class="cf-tel-guide"><div class="cf-tel-row">';
  h += '<input type="text" class="cf-input cf-tel-1" data-tel="1" value="' + v1 + '" inputmode="numeric" maxlength="5" placeholder="090">';
  h += '<span class="cf-tel-sep">-</span>';
  h += '<input type="text" class="cf-input cf-tel-2" data-tel="2" value="' + v2 + '" inputmode="numeric" maxlength="4" placeholder="1234">';
  h += '<span class="cf-tel-sep">-</span>';
  h += '<input type="text" class="cf-input cf-tel-3" data-tel="3" value="' + v3 + '" inputmode="numeric" maxlength="4" placeholder="5678">';
  h += '</div></div></div>';
  return h;
}
/* c.plate（"野田 300 ひ 55-55"）を4分割。保存は常にこの合成文字列＝既存の一覧/帳票はそのまま使える */
function _platePartsOf(c){
  const toks = String(c.plate || '').trim().split(/\s+/).filter(Boolean);
  return { region: toks[0] || '', cls: toks[1] || '', kana: toks[2] || '', num: toks[3] || '' };
}
function plateInput(c){
  const p = _platePartsOf(c);
  let h = '<div class="cf-plate">';
  h += '<input type="text" class="cf-input cf-plate-main" data-plate-main readonly value="' + _pe(c.plate || '') + '" placeholder="クリックして入力" autocomplete="off">';
  h += '<div class="cf-plate-guide">';
  h += '<div class="cf-plate-grid">';
  h += '<div><div class="cf-plate-l">地名（管轄）</div><input class="cf-input cf-plate-region" list="cf-plate-regions" data-plate="region" value="' + _pe(p.region) + '" placeholder="野田" autocomplete="off"></div>';
  h += '<div><div class="cf-plate-l">分類</div><input class="cf-input cf-plate-cls" data-plate="cls" value="' + _pe(p.cls) + '" placeholder="300" inputmode="numeric" maxlength="3"></div>';
  h += '<div><div class="cf-plate-l">かな</div><input class="cf-input cf-plate-kana" data-plate="kana" value="' + _pe(p.kana) + '" placeholder="ひ" maxlength="1"></div>';
  h += '<div><div class="cf-plate-l">ナンバー</div><input class="cf-input cf-plate-num" data-plate="num" value="' + _pe(p.num) + '" placeholder="5555" inputmode="numeric" maxlength="4"></div>';
  h += '</div>';
  h += '<datalist id="cf-plate-regions">';
  PLATE_REGIONS.forEach(function (r){ h += '<option value="' + r + '"></option>'; });
  h += '</datalist>';
  h += '</div></div>';
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
      if (!key) return;   // data-key の無い入力（ナンバー小分け等）は別ハンドラで処理
      let v = el.value;
      if (el.type === 'number') v = v === '' ? null : Number(v);
      c[key] = v;
      if (_cardCheckOn) _cardMarkMisses(c, root);   // 入力したら、その項目の赤枠はその場で外れる
    });
    el.addEventListener('change', () => {
      const key = el.dataset.key;
      if (!key) return;
      let v = el.value;
      if (el.type === 'number') v = v === '' ? null : Number(v);
      // 入庫日の変更は受付○△×ガードを通す（×＝「それでも入れますか？」・△＝一言トースト・強制はしない）
      if (key === 'reserveDate' && window.pitIntakeGuard) {
        const fin = pitIntakeGuard(c, v, el.dataset.prev || '');
        if (fin !== v) { el.value = fin; v = fin; }
        el.dataset.prev = fin;
      }
      c[key] = v;
      // 担当（フロント/予約）を選んだら、その人の課を自動選択して再描画（→課チップ点灯＆もう一方の担当も同課で絞られる）
      if ((key === 'frontStaff' || key === 'reserveStaff') && v) {
        const d = _staffDivision(v);
        if (d && c.division !== d) { c.division = d; renderCardForm(c); return; }
      }
    });
  });

  // お客様名→カナ 自動フリガナ
  _bindAutoKana(root.querySelector('[data-key="customer"]'), root.querySelector('[data-key="kana"]'), c);

  // TEL：見た目1BOX。クリックで3枠ガイドを開く。半角数字のみ→ c.tel に "市外-市内-番号" でハイフン自動挿入。枠が埋まると次へ
  const telWrap = root.querySelector('.cf-tel');
  if (telWrap){
    const mainEl = telWrap.querySelector('[data-tel-main]');
    const tg = sel => { const x = telWrap.querySelector(sel); return x ? x.value.trim() : ''; };
    const telEls = [telWrap.querySelector('.cf-tel-1'), telWrap.querySelector('.cf-tel-2'), telWrap.querySelector('.cf-tel-3')];
    const recompose = () => {
      c.tel = [tg('.cf-tel-1'), tg('.cf-tel-2'), tg('.cf-tel-3')].filter(Boolean).join('-');
      if (mainEl) mainEl.value = c.tel;
      if (window.PitDB) PitDB.save();
    };
    telEls.forEach((el, i) => {
      if (!el) return;
      el.addEventListener('input', () => {
        const max = (i === 0) ? 5 : 4;
        el.value = _plateDigits(el.value, max);   // 全角→半角・数字以外/ハイフン除去・桁切り
        recompose();
        if (el.value.length >= max && telEls[i + 1]) telEls[i + 1].focus();
      });
    });
    const openGuide = () => telWrap.classList.add('open');
    if (mainEl){
      mainEl.addEventListener('focus', openGuide);
      mainEl.addEventListener('click', () => { openGuide(); if (telEls[0]) setTimeout(() => telEls[0].focus(), 0); });
    }
    telWrap.addEventListener('focusout', (e) => { if (!telWrap.contains(e.relatedTarget)) telWrap.classList.remove('open'); });
  }

  // ナンバー：見た目は1BOX。クリック/フォーカスでガイドを開き、4項目を入力→c.plate に合成（半角スペース1つ＝揺れ防止）
  const plateWrap = root.querySelector('.cf-plate');
  if (plateWrap){
    const mainEl = plateWrap.querySelector('[data-plate-main]');
    const recompose = () => {
      const g = sel => { const x = plateWrap.querySelector(sel); return x ? x.value.trim() : ''; };
      c.plate = [g('.cf-plate-region'), g('.cf-plate-cls'), g('.cf-plate-kana'), g('.cf-plate-num')].filter(Boolean).join(' ');
      if (mainEl) mainEl.value = c.plate;
      if (window.PitDB) PitDB.save();
    };
    plateWrap.querySelectorAll('[data-plate]').forEach(el => el.addEventListener('input', () => {
      const part = el.dataset.plate;
      if (part === 'cls') el.value = _plateDigits(el.value, 3);        // 分類＝半角数字3桁
      else if (part === 'num') el.value = _plateDigits(el.value, 4);   // ナンバー＝半角数字4桁・ハイフン/文字禁止・全角→半角
      else if (part === 'kana') el.value = el.value.slice(0, 1);       // かな＝1文字
      recompose();
    }));
    const openGuide = () => plateWrap.classList.add('open');
    if (mainEl){
      mainEl.addEventListener('focus', openGuide);
      mainEl.addEventListener('click', () => { openGuide(); const r = plateWrap.querySelector('.cf-plate-region'); if (r) setTimeout(() => r.focus(), 0); });
    }
    // フォーカスがガイドの外へ出たら閉じる（クリック外し・Tab抜け両対応）
    plateWrap.addEventListener('focusout', (e) => { if (!plateWrap.contains(e.relatedTarget)) plateWrap.classList.remove('open'); });
  }

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
          _syncStaffToDivision(c);   // 別の課の担当はクリア
        } else if (wasActive){
          c[key] = null;   // 同じ値クリックで解除
        } else {
          c[key] = newVal;
          if (key === 'division') _syncStaffToDivision(c);   // 課を選んだら別の課の担当を一覧から消す＝クリア
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
  // マルエフ（Ⓕ＝コードレッド／クレーム等の要注意）ボタン
  const coderedBtn = root.querySelector('#cf-codered-btn');
  if (coderedBtn){
    coderedBtn.addEventListener('click', () => {
      c.codeRed = !c.codeRed;
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

  // 入力チェックON中なら、再描画のたびに未入力だけ赤枠を貼り直す
  // （チップ/トグルを押しても全部消えず、埋めた項目だけ赤が外れる）
  _cardReapplyCheck(root);
}
