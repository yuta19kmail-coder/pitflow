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
    window._cfsYM = null;   // 右パネルのカレンダーは今月から
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

  /* === 作業内容（概算日数・概算金額はここ・v0.27.0） === */
  h += sec('作業内容', '🔧');
  h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
  h += '<div class="cf-label">作業タイプ</div>';
  h += chips(c, 'workType', state.workTypes, true);
  h += '</div></div>';
  h += '<div class="cf-row">';
  h += field('受付タイプ', chips(c, 'dropType', state.dropTypes, true));
  h += field('相談', toggle(c, 'consult', '相談あり', 'なし'));
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

  /* === 担当（フロント・予約者のみ・v0.27.0） === */
  h += sec('担当', '👥');
  h += '<div class="cf-row">';
  h += field('課', chips(c, 'division', state.divisions, true));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('フロント担当', staffSelect(c, 'frontStaff'));
  h += field('予約担当',     staffSelect(c, 'reserveStaff'));
  h += '</div>';
  h += secEnd();

  /* === 代車 === */
  h += sec('代車', '🚙');
  h += '<div class="cf-row">';
  h += field('代車', toggle(c, 'needLoaner', '必要', '不要'));
  h += '</div>';
  if (c.needLoaner){
    h += '<div class="cf-loaner-detail">';
    h += '<div class="cf-row">';
    h += field('使用代車', loanerSelect(c, 'loanerId'));
    h += field('管理費 ¥2,200', toggle(c, 'loanerFee', '必要', '不要'));
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

  // === イベントバインド ===
  bindCardFormEvents(body);
}

/* ========================================
   右パネル：最短入庫BOX＋予約状況ミニカレンダー（クリックで入庫日を自動入力）
   ======================================== */
const TEAM_ITEMS = [
  { id: 'default', label: '国産車（1課）', color: '#1db97a' },
  { id: 'import',  label: '輸入車（2課）', color: '#ec4899' },
];

function cfSideHtml(c){
  const team = (c.boardId === 'import') ? 'import' : 'default';
  const teamColor = (team === 'import') ? '#ec4899' : '#1db97a';
  const teamName  = (team === 'import') ? '🌍 輸入車（2課）' : '🚗 国産車（1課）';
  const today = new Date(); today.setHours(0,0,0,0);
  const tStr = ymd(today);
  let h = '';

  /* ⏱ 最短入庫（クリックで入庫日に入る） */
  h += '<div class="cfs-card">';
  h += '<div class="cfs-h" style="border-left-color:' + teamColor + '">⏱ 最短入庫 <span class="cfs-team" style="color:' + teamColor + '">' + teamName + '</span></div>';
  if (typeof dashEarliestIntake === 'function'){
    [{ k: 'noLoaner', n: '代車なし' }, { k: 'loaner', n: '代車あり' }, { k: 'same', n: '当日作業' }].forEach(function (x) {
      const d = dashEarliestIntake(team, x.k, today);
      const ds = d ? ymd(d) : null;
      const lbl = !d ? 'なし' : (ds === tStr ? '今日' : (d.getMonth()+1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '）');
      h += '<button type="button" class="cfs-el' + (ds && c.reserveDate === ds ? ' sel' : '') + '"' + (ds ? ' onclick="cfPickDate(\'' + ds + '\')"' : ' disabled') + '>'
         + '<span class="cfs-el-n">' + x.n + '</span><b>' + lbl + '</b><span class="cfs-el-go">タップで入庫日に入る</span></button>';
    });
  }
  h += '</div>';

  /* 📅 予約状況カレンダー（月送り・埋まり/枠の数字つき・日クリックで入庫日に入る）v0.27.2 */
  if (!window._cfsYM){ window._cfsYM = { y: today.getFullYear(), m: today.getMonth() }; }
  const ym = window._cfsYM;
  const lastD = new Date(ym.y, ym.m + 1, 0).getDate();
  const startDow = new Date(ym.y, ym.m, 1).getDay();
  const rc = (state.settings && state.settings.reserveCap) || { default: 5, import: 3 };
  const base = (team === 'import') ? (rc.import != null ? rc.import : 3) : (rc.default != null ? rc.default : 5);
  const tgt  = (team === 'import') ? 'capImport' : 'capDefault';

  h += '<div class="cfs-card">';
  h += '<div class="cfs-h" style="border-left-color:' + teamColor + '">📅 予約の空き（' + (team === 'import' ? '輸入' : '国産') + '）'
     + '<span class="cfs-nav"><button type="button" onclick="cfsCalShift(-1)" title="前の月">◀</button><b>' + ym.y + '年' + (ym.m + 1) + '月</b><button type="button" onclick="cfsCalShift(1)" title="次の月">▶</button></span></div>';
  h += '<div class="cfs-cal">';
  ['日','月','火','水','木','金','土'].forEach(function (w, i) {
    h += '<div class="cfs-dow' + (i === 0 ? ' red' : (i === 6 ? ' sat' : '')) + '">' + w + '</div>';
  });
  for (let i = 0; i < startDow; i++) h += '<div class="cfs-day blank"></div>';
  for (let dd = 1; dd <= lastD; dd++){
    const d = new Date(ym.y, ym.m, dd);
    const ds = ymd(d);
    if (ds < tStr){ h += '<div class="cfs-day past"><i>' + dd + '</i></div>'; continue; }
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
    h += '<div class="cfs-day' + cls + (c.reserveDate === ds ? ' sel' : '') + (ds === tStr ? ' today' : '') + '" onclick="cfPickDate(\'' + ds + '\')" title="' + (ym.m + 1) + '/' + dd + (num ? '：' + num + '台' : '') + '">'
       + '<i>' + dd + '</i>' + (num ? '<span>' + num + '</span>' : '<span></span>') + '<b class="cfs-mk">' + mark + '</b></div>';
  }
  h += '</div>';
  h += '<div class="cfs-hint">数字＝埋まり/枠　○空きあり ／ △残りわずか ／ 満＝受付終了（タップすると確認が出ます・最終判断は人）</div>';
  h += '</div>';

  return h;
}

/* カレンダーの月送り（右パネル） */
window.cfsCalShift = function (n) {
  if (!window._cfsYM) return;
  const d = new Date(window._cfsYM.y, window._cfsYM.m + n, 1);
  window._cfsYM = { y: d.getFullYear(), m: d.getMonth() };
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c) renderCardForm(c);
};

/* 右パネルの日付タップ → 入庫日に自動入力（×の日は確認・従来ガードと同じ） */
window.cfPickDate = function (ds) {
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  const fin = (window.pitIntakeGuard) ? pitIntakeGuard(c, ds, c.reserveDate) : ds;
  if (fin !== ds) return;   // やめた
  c.reserveDate = ds;
  renderCardForm(c);
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
