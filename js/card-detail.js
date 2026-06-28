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
  const no = card.resNo ? '<span title="予約番号" style="font-size:12px;font-weight:700;letter-spacing:.5px;color:var(--text2);background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:1px 8px;margin-left:8px;font-family:ui-monospace,Menlo,Consolas,monospace;">' + card.resNo + '</span>' : '';
  return '<span style="font-size:13px;color:var(--text3);font-weight:400;">入庫カード</span>' + no + '<br>' +
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
    if (window.renderCardView) renderCardView(card, 'md-body-modal');
    else renderCardForm(card);
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
  // 閉じる前に、このカードから顧客控えを更新（入力補助用）。
  // ★サンプル生成カード（_sample）は書き戻さない＝顧客控えが二重化するのを防ぐ。
  const _c = state.cards.find(x => x.id === _editingCardId);
  if (_c && !_c._sample && window.upsertCustomerFromCard) upsertCustomerFromCard(_c);
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
  /* 顧客を呼び出し済み（c.customerId あり）なら、右端に「この顧客で新規車両を追加」ボタン（v0.38.4） */
  h += '<div class="cf-section"><div class="cf-section-head">👤 <span>基本情報</span>'
     + (c.customerId ? '<button type="button" class="cf-addveh-btn" onclick="cfAddVehicle()">＋ この顧客で新規車両を追加</button>' : '')
     + '</div><div class="cf-section-body">';
  _ensureNameParts(c);
  /* 1行目：初回／リピーター → お客様名(姓/名・1BOX) → カナ(姓/名・1BOX)。名前は半角空白で合成（v0.74） */
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">初回／リピーター</div>' + chips(c, 'repeat', state.repeatTypes) + '</div>';
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">お客様名（姓／名）</div>' + nameBoxInput(c) + '</div>';
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">カナ（姓／名）</div>' + kanaBoxInput(c) + '</div>';
  h += '</div>';
  /* 2行目：LINE(新設) ｜ TEL ｜ その他連絡先　＝ここまで顧客情報（v0.91.0） */
  h += '<div class="cf-row">';
  h += field('LINE', lineField(c));
  h += field('TEL',  telInput(c));
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">連絡先</div>' + contactsBtn(c) + '</div>';
  h += '</div>';
  /* ── ここから下は車両情報。顧客情報と点線で区切る（v0.91.0） ── */
  h += '<div class="cf-divider"></div>';
  /* 3行目：国産輸入 ｜ カルテNo.(新設) ｜ メーカー ｜ ナンバー ｜ 車両注意 */
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">国産車／輸入車</div>' + chips(c, 'boardId', TEAM_ITEMS) + '</div>';
  h += '<div class="cf-field" style="flex:0 0 6em"><div class="cf-label">カルテNo.</div>' + textIn(c, 'karteNo', 'placeholder="例 1234"') + '</div>';
  h += '<div class="cf-field" style="flex:0 0 6.5em"><div class="cf-label">メーカー</div>' + textIn(c, 'maker', 'placeholder="トヨタ"') + '</div>';
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">ナンバー</div>' + plateInput(c) + '</div>';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">車両注意</div>' + driveChips(c) + '</div>';
  h += '</div>';
  /* 4行目：車種（グレード） */
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">車種（グレード）</div>' + textIn(c, 'car', 'placeholder="例 アクアGz"') + '</div>';
  h += '</div>';
  /* 5行目：入庫日｜入庫時刻(1BOX＋ショートカット)｜予約受付日（変わらず） */
  h += '<div class="cf-row">';
  h += field('入庫日', dateIn(c, 'reserveDate'));
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">入庫時刻</div>' + timeField(c) + '</div>';
  h += field('予約受付日', dateIn(c, 'bookedAt'));
  h += '</div>';
  h += secEnd();

  /* === 予約内容（旧「作業内容」＝作業タイプ/課/受付/相談/担当/概算＋代車を統合・v0.35.2） === */
  h += sec('予約内容', '🗒️');
  /* 1行目：作業タイプ(基本)｜併用可(B.P/1Y/3M)｜課 を1行に（v0.94.0）。v0.94.3 上揃え＝ラベル/チップの上端を揃える */
  h += '<div class="cf-row" style="flex-wrap:nowrap;align-items:flex-start">';
  h += '<div class="cf-field" style="flex:0 1 auto;min-width:0"><div class="cf-label">作業タイプ</div>' + workTypeChips(c) + '</div>';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">併用可</div>' + workTypeComboChips(c) + '</div>';
  h += '<div class="cf-field" style="flex:0 0 auto;margin-left:auto"><div class="cf-label">課</div>' + chips(c, 'division', state.divisions, true) + '</div>';
  h += '</div>';
  /* 2行目：受付タイプ（待/当/預）の右隣に「相談」を□っぽい別ボタンで配置（区切り線で違いを演出）＋担当を1行に詰める */
  h += '<div class="cf-row">';
  h += field('受付タイプ', '<div class="cf-recv">' + dropChips(c)
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
  /* 代車：スイッチ＋使用代車＋車種固定を1行（中央揃え＝スイッチが上下にブレない）。貸出/条件/メモは下に展開（v0.38.9） */
  h += '<div class="cf-subhead">🚙 代車</div>';
  h += '<div class="cf-row cf-loaner-switchrow">';
  h += '<div class="cf-field" style="flex:0 0 auto">' + toggle(c, 'needLoaner', '必要', '不要') + '</div>';
  if (_prevIntakeLoaner(c)) h += '<span class="cf-prevloaner">⚠ 前回入庫時 代車あり</span>';
  if (c.needLoaner){
    h += '<div class="cf-field" style="flex:2">' + loanerSelect(c, 'loanerId') + '</div>';   // ラベルなし＝1行高さ（スイッチがブレない）
    h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-chips"><button type="button" id="cf-fixed-btn" class="cf-chip' + (c.loanerFixed ? ' active' : '') + '"' + (c.loanerFixed ? ' style="background:#1db97a;color:#fff;border-color:#1db97a;"' : '') + '>車種固定</button></div></div>';
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
  // 🧰 作業内容テンプレート＝症状ホイール＋チップ（work-content.js が描画・設定で編集可・v0.70.0）
  h += (window.WorkContent ? WorkContent.builderHtml() : '');
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

  // 🧰 作業内容テンプレート（症状ホイール）を起動（内容セクションがある時だけ）
  if (window.WorkContent && WorkContent.mount) WorkContent.mount(body);

  // v0.83.1 フォーム再描画のたびに自動保存（チップ＝作業/受付タイプ・相談・Ⓕ・車種固定などの選択を取りこぼさない）。
  //   ※デバウンス保存なので、カレンダー送り等の連続再描画でも localStorage 書き込みは1回にまとまる。
  if (window.PitDB) PitDB.save();
}

/* ========================================
   右パネル：最短入庫BOX＋予約状況ミニカレンダー（クリックで入庫日を自動入力）
   ======================================== */
const TEAM_ITEMS = [
  { id: 'default', label: '国産車', color: '#1db97a' },
  { id: 'import',  label: '輸入車', color: '#ec4899' },
];
/* 特殊運転（車両属性）。左+M/Tが両方ONなら「左MT」自動成立として配車マッチングに使う */
const DRIVE_ITEMS = [
  { id: 'leftHand', label: '左'   },
  { id: 'mt',       label: 'M/T'  },
  { id: 'lowCar',   label: '車高' },
  { id: 'noShoes',  label: '土禁' },
];
/* 入庫時刻のショートカット（メインBOXに直接入力も可） */
const TIME_QUICK = ['AM', 'PM', '決まり次第', '未定'];

/* 既存データ（customer/kana のみ）を開く時、姓名・カナへ分割（先頭の半角/全角空白で区切る） */
function _ensureNameParts(c){
  if (!(c.sei || c.mei) && (c.customer || '').trim()){
    const t = (c.customer || '').trim().split(/[ 　]+/);
    c.sei = t[0] || ''; c.mei = t.slice(1).join(' ') || '';
  }
  if (!(c.seiKana || c.meiKana) && (c.kana || '').trim()){
    const t = (c.kana || '').trim().split(/[ 　]+/);
    c.seiKana = t[0] || ''; c.meiKana = t.slice(1).join(' ') || '';
  }
}
/* お客様名＝見た目1BOX・中で姓/名（ナンバー入力と同じ思想）。data-key=customer は必須チェックの赤枠用 */
function nameBoxInput(c){
  return '<div class="cf-namebox" data-key="customer">'
    + '<input type="text" class="cf-nb-seg" data-name="sei" value="' + _pe(c.sei || '') + '" placeholder="姓" autocomplete="off">'
    + '<span class="cf-nb-sep"></span>'
    + '<input type="text" class="cf-nb-seg" data-name="mei" value="' + _pe(c.mei || '') + '" placeholder="名" autocomplete="off">'
    + '</div>';
}
function kanaBoxInput(c){
  return '<div class="cf-namebox">'
    + '<input type="text" class="cf-nb-seg" data-name="seiKana" value="' + _pe(c.seiKana || '') + '" placeholder="セイ" autocomplete="off">'
    + '<span class="cf-nb-sep"></span>'
    + '<input type="text" class="cf-nb-seg" data-name="meiKana" value="' + _pe(c.meiKana || '') + '" placeholder="メイ" autocomplete="off">'
    + '</div>';
}
/* v0.92.0 LINE欄：状態（未/お断り/案内してない/OK）。OK のときだけ Lステップ顧客番号を入力し、
   Lステップへのリンクを自動生成（リンクの土台URLは設定 state.settings.lstepBaseUrl・未設定なら番号だけ保持）。 */
/* v0.92.5 LINE状態＝3パターン：未案内(既定) / LINE NG / 登録済（登録済＝Lステップ番号入力→ボタン埋め込み） */
const LINE_STATUS_ITEMS = [
  { id: '',   label: '未案内' },
  { id: 'ng', label: 'LINE NG' },
  { id: 'ok', label: '登録済' },
];
/* v0.92.3 入力（番号 or 全文URL）から Lステップ顧客ページのURLを作る。
   全文URL（…?member=数字）を貼られても member= の数字を抜いて正しいリンクにする。 */
function _lstepUrl(raw){
  raw = String(raw == null ? '' : raw).trim();
  if (!raw) return '';
  const base = (state.settings && state.settings.lstepBaseUrl) || 'https://manager.linestep.net/line/visual?member=';
  const m = raw.match(/member=(\d+)/);
  if (m) return base + m[1];                       // 全文URLを貼った → 数字だけ抜く
  if (/^\d+$/.test(raw)) return base + raw;        // 数字だけ → そのまま付ける
  if (/^https?:\/\//i.test(raw)) return raw;       // 既に何かのURL → そのまま
  return base + encodeURIComponent(raw);
}
window.pitLstepUrl = _lstepUrl;   // 予約詳細・顧客ビューでも同じURL生成を使う
function lineField(c){
  const id = (c.lstepId || '').trim();
  const ok = ((c.lineStatus || '') === 'ok');
  // v0.92.6 登録済（OK＋番号）＝埋め込み：状態は静的な「登録済」ラベル＋Lステップボタン（セレクトは出さない）。✕で解除して編集に戻る。
  if (ok && id){
    const url = _lstepUrl(id);
    let h = '<div class="cf-line-wrap"><span class="cf-line-done">✓ 登録済</span>';
    h += url
      ? '<a class="cf-line-link" href="' + _pe(url) + '" target="_blank" rel="noopener" draggable="true" title="クリックで開く／ドラッグでブラウザへ（タブのように掴める）" onclick="event.stopPropagation()">🔗 Lステップ</a>'
      : '<span class="cf-line-bad">番号を確認</span>';
    h += '<button type="button" class="cf-line-x" onclick="cfLineClear()" title="解除して入れ直す">✕</button></div>';
    return h;
  }
  // 未登録：編集できる状態セレクト（未案内/LINE NG/登録済）。「登録済」を選ぶと番号入力が出る。
  let h = '<div class="cf-line-wrap"><select class="cf-input cf-line-status" data-key="lineStatus">'
    + LINE_STATUS_ITEMS.map(function(o){ return '<option value="' + o.id + '"' + (((c.lineStatus || '') === o.id) ? ' selected' : '') + '>' + o.label + '</option>'; }).join('')
    + '</select>';
  if (ok) h += textIn(c, 'lstepId', 'placeholder="Lステップ番号 / URL貼付OK"');
  h += '</div>';
  return h;
}
/* ✕＝Lステップ番号を消して編集に戻す（状態OKのまま入力欄を再表示） */
function cfLineClear(){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  c.lstepId = '';
  if (window.PitDB) PitDB.save();
  renderCardForm(c);
}
window.cfLineClear = cfLineClear;
/* 特殊運転チップ（複数選択＝既存の data-multi ハンドラで c.drive 配列をトグル） */
function driveChips(c){
  const arr = Array.isArray(c.drive) ? c.drive : [];
  let h = '<div class="cf-chips cf-drive" data-key="drive" data-multi="1">';
  DRIVE_ITEMS.forEach(it => {
    const on = arr.indexOf(it.id) >= 0;
    h += '<button type="button" class="cf-chip cf-chip-drv' + (on ? ' active' : '') + '" data-val="' + it.id + '">' + it.label + '</button>';
  });
  h += '</div>';
  return h;
}
/* 入庫時刻＝メインBOXに直接入力（全角→半角）。フォーカスで下にショートカット（AM/PM/決まり次第/未定） */
function timeField(c){
  let h = '<div class="cf-time">';
  h += '<input type="text" class="cf-input cf-time-main" value="' + _pe(c.reserveTime || '') + '" placeholder="900 / 9時半 / 9:00-10:00 など" autocomplete="off">';
  h += '<div class="cf-time-guide">';
  h += '<div class="cf-time-l">時間で選ぶ</div><input type="time" class="cf-input cf-time-pick" value="' + _pe(_timePickVal(c.reserveTime)) + '">';
  h += '<div class="cf-time-l">ショートカット</div><div class="cf-time-quick">';
  TIME_QUICK.forEach(t => { h += '<button type="button" class="cf-chip cf-chip-tm' + (c.reserveTime === t ? ' active' : '') + '" data-val="' + t + '">' + t + '</button>'; });
  h += '</div></div></div>';
  return h;
}
/* 全角→半角（数字・コロン・ハイフン）。９：００→9:00 */
function _timeHalf(s){
  return String(s == null ? '' : s)
    .replace(/[０-９]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
    .replace(/[：]/g, ':').replace(/[－ー―〜～]/g, '-');
}
/* v0.95.0 入庫時刻の賢い自動補正。全角/半角不問で「9」「900」「0900」「9時」「9時半」「九時半」「0915」「0900-1000」等を HH:MM（範囲は HH:MM-HH:MM）に。
   AM/PM/決まり次第/未定 などの語はそのまま残す。 */
function _timeHHMM(h, m){ if (isNaN(h)) return ''; h = Math.max(0, Math.min(23, h)); m = isNaN(m) ? 0 : Math.max(0, Math.min(59, m)); return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'); }
function _timeKanji(t){
  const map = { '〇':'0','一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9' };
  t = t.replace(/十([一二三四五六七八九])/g, function(_m, b){ return '1' + map[b]; });
  t = t.replace(/([一二三四五六七八九])十/g, function(_m, a){ return map[a] + '0'; });
  t = t.replace(/十/g, '10');
  return t.replace(/[〇一二三四五六七八九]/g, function(ch){ return map[ch]; });
}
function _normTimePart(t){
  t = _timeKanji(String(t == null ? '' : t).trim());
  if (!t) return '';
  const half = /半/.test(t); t = t.replace(/半/g, '');
  let m = t.match(/^(\d{1,2})\s*時\s*(\d{1,2})?\s*分?$/);
  if (m) return _timeHHMM(+m[1], m[2] != null ? +m[2] : (half ? 30 : 0));
  m = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) return _timeHHMM(+m[1], +m[2]);
  m = t.match(/^(\d{1,4})$/);
  if (m){
    const d = m[1];
    if (d.length <= 2) return _timeHHMM(+d, half ? 30 : 0);   // 9 / 09 (＋半=30)
    if (d.length === 3) return _timeHHMM(+d.slice(0,1), +d.slice(1));  // 915→9:15
    return _timeHHMM(+d.slice(0,2), +d.slice(2));               // 0900→09:00
  }
  return String(t == null ? '' : t).trim();   // 解釈できない（AM等）はそのまま
}
function _normTime(raw){
  const s = _timeHalf(raw).trim();
  if (!s) return '';
  if (s.indexOf('-') >= 0) return s.split('-').map(function(p){ return _normTimePart(p); }).filter(Boolean).join('-');
  return _normTimePart(s);
}
/* 時間ピッカー(input type=time)用の値。単一のHH:MMの時だけ返す（範囲や語は空＝ピッカーは空表示） */
function _timePickVal(v){
  const n = _normTime(v || '');
  const m = (n.split('-')[0] || '').match(/^\d{2}:\d{2}$/);
  return m ? m[0] : '';
}
/* 姓→姓カナ／名→名カナ の自動フリガナ（_bindAutoKana を1セグメント用に。確定後 onCommit で合成保存） */
function _bindAutoKanaSeg(nameEl, kanaEl, onCommit){
  if (!nameEl || !kanaEl) return;
  const hasKanji = function(s){ return /[㐀-䶿一-鿿豈-﫿々々]/.test(s || ''); };
  let base = kanaEl.value || '', comp = '';
  nameEl.addEventListener('compositionstart', function(){ base = kanaEl.value || ''; comp = ''; });
  nameEl.addEventListener('compositionupdate', function(e){ const d = e.data || ''; if (hasKanji(d)) return; comp = d; kanaEl.value = base + _toKatakana(comp); if (onCommit) onCommit(); });
  nameEl.addEventListener('compositionend', function(){ base = base + _toKatakana(comp); comp = ''; kanaEl.value = base; if (onCommit) onCommit(); });
  nameEl.addEventListener('input', function(){ if (!nameEl.value){ base = ''; comp = ''; kanaEl.value = ''; if (onCommit) onCommit(); } });
}

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

  /* v0.84.0 選んだ日の入庫/返車ミニ一覧（時間提案用）＋担当のMHS予定 ＝ 代車カレンダーの上 */
  h += _cfsDayListHtml(c);
  h += _cfsMhsHtml(c);

  /* 🚙 代車の空き（「代車必要」を押すと出る・代車ビュー式＝どの車がいつ空くか） */
  if (c.needLoaner) h += _cfsLoanerGanttHtml(today, tStr, c);

  return h;
}

/* v0.84.0 選んだ日の入庫/返車ミニ一覧。入庫=左/返車=右・時間順・休憩バー・
   左ライン＝国産緑/輸入ピンク・選択中フロント担当はゴールドで控えめ強調（左バー色は変えない）。
   日付を選んだ後に「時間」を決める助け（接客スペースの溢れ防止）。 */
function _cfsDayListHtml(c){
  const ds = c.reserveDate;
  if (!ds) return '';   // 入庫日が未選択なら出さない（最短カレンダーで日を選んでから）
  const me = c.id;
  const who = (c.frontStaff || '').trim();
  const toMin = function (s){ s = String(s||'').split('-')[0].trim(); const m = /^(\d{1,2}):(\d{2})/.exec(s); return m ? (+m[1]*60 + +m[2]) : 9999; };
  const live = function (x){ return x.status !== 'returned' && x.status !== 'scrap' && x.status !== 'canceled'; };
  const intake = (state.cards||[]).filter(function(x){ return x && x.id!==me && x.reserveDate===ds && live(x); });
  const ret    = (state.cards||[]).filter(function(x){ return x && x.id!==me && x.returnDate===ds && live(x); });
  const BRK = [{from:'12:00',to:'13:00'},{from:'15:30',to:'16:30'}];
  function evHtml(x, t){
    const imp = (x.boardId==='import');
    const isHl = who && (x.frontStaff||'').trim()===who;
    const front = (window.pitSurname ? pitSurname(x.frontStaff||'') : (x.frontStaff||'')) || '—';
    const car = (x.car || '').trim();   // v0.84.1 メーカーは出さない＝車種のみ
    const nm = ((window.pitSurname ? pitSurname(x.customer) : (x.customer||'')) || '（未入力）');   // v0.86.1 名字だけ（法人はフル）
    return '<div class="dl-ev'+(imp?' imp':'')+(isHl?' hl':'')+'">'
      + '<div class="dl-top"><span class="dl-time">'+_pe(t||'—')+'</span><span class="dl-badge">'+_pe(front)+'</span></div>'
      + '<div class="dl-line">'+_pe(nm)+' 様 <span class="dl-car">'+_pe(car)+'</span></div></div>';
  }
  function col(list, isRet){
    if (!list.length) return '<div class="dl-empty">予定なし</div>';
    const items = list.map(function(x){ const tt = isRet ? (x.returnTime||x.reserveTime||'') : (x.reserveTime||''); return { min: toMin(tt), html: evHtml(x, tt.split('-')[0]) }; });
    BRK.forEach(function(b){ items.push({ min: toMin(b.from), html: '<div class="dl-brk">☕ 休憩 '+b.from+'–'+b.to+'</div>' }); });
    items.sort(function(a,b){ return a.min-b.min; });
    return items.map(function(i){ return i.html; }).join('');
  }
  let h = '<div class="dl"><div class="dl-cols">';
  h += '<div class="dl-col"><div class="dl-h in">📥 入庫</div><div class="dl-body">'+col(intake,false)+'</div></div>';
  h += '<div class="dl-col"><div class="dl-h ret">📤 返車</div><div class="dl-body">'+col(ret,true)+'</div></div>';
  h += '</div></div>';
  return h;
}

/* v0.84.0 担当フロントのMHS予定（来客以外＝MTG/外出など）。代車カレンダーの上。
   データは window.pitMhsSchedule(担当名, 日付) フックから取得。本番のMHS連携を入れたらここに実データが流れる。 */
function _cfsMhsHtml(c){
  const who = (c.frontStaff || '').trim();
  const head = '<div class="mhs-head">📅 <span>'+(who ? _pe(who)+' の予定' : '担当の予定')+'</span><span class="mhs-tag">MHS</span></div>';
  if (!who) return '<div class="mhs-box">'+head+'<div class="mhs-empty">フロント担当を選ぶと、その人のMHS予定が出ます。</div></div>';
  let list = [];
  if (typeof window.pitMhsSchedule === 'function'){ try { list = window.pitMhsSchedule(who, c.reserveDate || ymd(new Date())) || []; } catch(e){ list = []; } }
  if (!list.length) return '<div class="mhs-box">'+head+'<div class="mhs-empty">MHS連携は準備中（本番ログイン接続後に予定を表示）。</div></div>';
  const ic = {mtg:'📋', out:'🚗', off:'☕', desk:'🖥'};
  const rows = list.map(function(s){ return '<div class="mhs-row"><span class="mhs-t">'+_pe(s.t||'')+'</span><span class="mhs-ic">'+(ic[s.type]||'•')+'</span><span class="mhs-l">'+_pe(s.label||'')+'</span></div>'; }).join('');
  return '<div class="mhs-box">'+head+'<div class="mhs-note">来客とは別の予定（MTG・外出など）。</div>'+rows+'</div>';
}

/* v0.84.0 MHS予定取得フック（既定は空＝「準備中」表示）。本番のMHS連携でここを実データ取得に差し替える。 */
if (!window.pitMhsSchedule){ window.pitMhsSchedule = function(staffName, dateStr){ return []; }; }

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
    const avSel = (ro && window._availPick === ds) ? ' av-sel' : '';   // 空きカレンダービュー：選択日のハイライト
    h += '<div class="cfs-day' + cls + (!ro && c.reserveDate === ds ? ' sel' : '') + (ds === tStr ? ' today' : '') + avSel + '" data-ds="' + ds + '" data-team="' + team + '"' + dayClick + ' title="' + (ym.m + 1) + '/' + dd + (hol ? '・🎌' + hol : '') + (num ? '：' + num + '台' : '') + '">'
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
  const loaners = _cfsLgLoaners(c);
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
        /* 古いtitle（誰に・いつまで）は撤去＝情報はヘッダのホバー詳細カードへ */
        h += '<td class="cfs-lg-busy"></td>';
      } else if (ro){
        /* 空きカレンダービュー＝読み取り専用（クリック選択なし） */
        h += '<td class="cfs-lg-free cfs-lg-ro"></td>';
      } else {
        /* このカードの貸出予定（使用代車＋から/まで）と一致するマスは緑＝双方向（ドラッグでもテキスト入力でも光る） */
        const pick = c && c.loanerId === l.id && c.loanerFrom && c.loanerTo && ds >= c.loanerFrom && ds <= c.loanerTo;
        h += '<td class="cfs-lg-free' + (pick ? ' cfs-lg-pick' : '') + '" data-lgl="' + l.id + '" data-lgd="' + ds + '"></td>';
      }
    });
    h += '</tr>';
  }
  return h;
}

/* 予約の代車条件で並べ替え（ソート有の時）。
   ・サイズ条件(高さ/幅/長さ)を選んだら＝その寸法の合計で「低い順」に左づめ（代車カレンダービューと同じ）。
   ・装備条件(ETC/ナビ/ISO)だけなら＝合う代車を先頭へ。 */
function _cfsLgLoaners(c){
  // 代車カレンダー側と同じ基準で寸法/装備を補完してから読む。これを通さないと、
  // 代車カレンダーを未表示のセッションでは state.loaners に属性が無く、条件ソートが効かない。
  // （未設定のみ補完＝設定画面で入力済みの実値は上書きしない）
  if (typeof _loEnsureOpts === 'function') _loEnsureOpts();
  const ls = (state.loaners || []).slice();
  if (window._cfsLgSort === false) return ls;   // ソート無＝元の並び
  const conds = (c && Array.isArray(c.loanerConditions)) ? c.loanerConditions : [];
  const sizes = conds.filter(function(k){ return k === 'height' || k === 'width' || k === 'length'; });
  if (sizes.length){   // サイズ＝低い順（左づめ）
    return ls.sort(function(a, b){
      const av = sizes.reduce(function(s, k){ return s + (Number(a[k]) || 0); }, 0);
      const bv = sizes.reduce(function(s, k){ return s + (Number(b[k]) || 0); }, 0);
      return av - bv;
    });
  }
  const bools = conds.filter(function(k){ return k === 'etc' || k === 'navi' || k === 'iso'; });
  if (!bools.length) return ls;
  const match = [], rest = [];
  ls.forEach(function(l){ (bools.every(function(k){ return l[k]; }) ? match : rest).push(l); });
  return match.concat(rest);
}
/* 代車条件があり「ソート有」の時、条件に合う代車かどうか（緑チェック用） */
function _cfsLgMatches(l, c){
  const conds = (c && Array.isArray(c.loanerConditions)) ? c.loanerConditions.filter(function(k){ return k === 'etc' || k === 'navi' || k === 'iso'; }) : [];
  if (!conds.length) return false;
  return conds.every(function(k){ return l[k]; });
}
window.cfsLgToggleSort = function(){
  window._cfsLgSort = (window._cfsLgSort === false) ? true : false;
  if (window.cfsLgRerender) cfsLgRerender();
};
window.cfsLgRerender = function(){
  const old = document.getElementById('cfs-lg-card'); if (!old) return;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const ro = (state.currentView === 'availcal');
  const c = ro ? { reserveDate:'', boardId:null, needLoaner:true } : (state.cards.find(function(x){ return x.id === _editingCardId; }) || null);
  old.outerHTML = _cfsLoanerGanttHtml(t, ymd(t), c, ro);
  if (window.cfsLgFill) cfsLgFill();
};

function _cfsLoanerGanttHtml(today, tStr, c, ro){
  const loaners = _cfsLgLoaners(c);
  if (!window._cfsLgN) window._cfsLgN = 28;
  // 代車条件（ETC/ナビ/ISO/高さ/幅/長さ）が入っていれば「ソート有/無」トグルを出す（デフォルト＝条件ありでソート有）
  const condKeys = (c && Array.isArray(c.loanerConditions)) ? c.loanerConditions.filter(function(k){ return ['etc','navi','iso','height','width','length'].indexOf(k) >= 0; }) : [];
  const sortOn = (window._cfsLgSort !== false);
  const sortBtn = (!ro && condKeys.length)
    ? '<button type="button" class="cfs-sortbtn' + (sortOn ? ' on' : '') + '" onclick="cfsLgToggleSort()" title="条件で並べ替え（サイズは低い順／装備は合う車を先頭）">' + (sortOn ? '✓ 条件で並べ替え' : '並べ替えなし') + '</button>'
    : '';
  let h = '<div class="cfs-card" id="cfs-lg-card">';
  h += '<div class="cfs-h" style="border-left-color:#f59e0b"><span style="color:#f59e0b">🚙 代車カレンダー</span>'
     + '<span class="cfs-nav">' + sortBtn + '<button type="button" onclick="cfsLgToday()" title="一番上（今日）に戻る">📍 今日へ</button></span></div>';
  h += '<div class="cfs-lg-scroll" id="cfs-lg-scroll" onscroll="cfsLgScroll(this)"><table class="cfs-lg">';
  h += '<thead><tr><th class="cfs-lg-d"></th>';
  loaners.forEach(function (l) {
    /* 古いtitleは撤去。data-loid でヘッダにマウスオーバー＝代車の詳細ホバーカード（loaner.js）。条件マッチは強調。 */
    const mcls = (sortOn && _cfsLgMatches(l, c)) ? ' cfs-lg-match' : '';
    h += '<th class="cfs-lg-th' + mcls + '" data-loid="' + l.id + '"><i>' + String(l.name || '').replace('代車', '') + '</i><b>' + (l.model || '') + '</b></th>';
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
    ['workType',    '作業タイプ',      !!c.workType || !!((c.workAddons||[]).length)],
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

/* v0.85.0 受付タイプ＝最大2つまで選べるチップ（待/当/預）。「作業次第でどちらにもなる」用。
   主＝c.dropType・副＝c.dropType2。両方選ぶと表示は「待or預」（pitDropLabel）。クリックの挙動は cf-dual ハンドラ参照。 */
function dropChips(c){
  let h = '<div class="cf-chips cf-dual" data-key="dropType">';
  (state.dropTypes || []).forEach(it => {
    const active = (c.dropType === it.id || c.dropType2 === it.id);
    h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + '" data-val="' + it.id + '">' + it.label + '</button>';
  });
  h += '</div>';
  return h;
}

/* 作業タイプのチップ＝基本（単一選択＝c.workType）＋ 併用可タイプ（追加トグル＝c.workAddons[]）。
   設定で「併用可」にした作業（例：3M/1Y）は、基本の作業を選んでいても重ねて選べる。 */
function _wtChipBtn(it, active){
  let style = '';
  if (active && it.color) style = 'style="background:' + it.color + ';color:#fff;border-color:' + it.color + ';"';
  else if (it.color)      style = 'style="border-color:' + it.color + ';color:' + it.color + ';"';
  return '<button type="button" class="cf-chip' + (active ? ' active' : '') + '" data-val="' + it.id + '" ' + style + '>' + it.label + '</button>';
}
// v0.94.0 基本（単独選択）チップだけ。併用可は workTypeComboChips に分離＝同じ1行に横並びにする。
function workTypeChips(c){
  const base = (state.workTypes || []).filter(w => !w.combinable);
  let h = '<div class="cf-chips" data-key="workType">';
  base.forEach(it => { h += _wtChipBtn(it, c.workType === it.id); });
  h += '</div>';
  return h;
}
// v0.94.0 併用可チップ（複数選択＝c.workAddons）。ラベルはフィールド側の「併用可」。チップ大きさは基本と同じ(.cf-chip)。
function workTypeComboChips(c){
  const combo = (state.workTypes || []).filter(w => w.combinable);
  const adds = Array.isArray(c.workAddons) ? c.workAddons : [];
  let h = '<div class="cf-chips" data-key="workAddons" data-combo="1">';
  combo.forEach(it => { h += _wtChipBtn(it, adds.indexOf(it.id) >= 0); });
  h += '</div>';
  return h;
}
/* 表示用 c.workTypes（基本＋併用の順）を同期。週/当日/PITカードの作業バッジはこれを見る。 */
function _syncWorkTypes(c){
  const ids = [];
  if (c.workType) ids.push(c.workType);
  (Array.isArray(c.workAddons) ? c.workAddons : []).forEach(a => { if (a && ids.indexOf(a) < 0) ids.push(a); });
  c.workTypes = ids;
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

/* ===== その他連絡先（複数番号＋ラベル＋優先）。代表(優先)の番号が TEL 欄＝c.tel。全件は c.contacts に保持し顧客控え・検索に乗る ===== */
function _cfEnsureContacts(c){
  if(!Array.isArray(c.contacts) || !c.contacts.length){
    c.contacts = [{ tel: c.tel || '', label: '個人携帯', primary: true }];
  }
  if(!c.contacts.some(x=>x.primary)) c.contacts[0].primary = true;
  return c.contacts;
}
function contactsBtn(c){
  const n = (Array.isArray(c.contacts) && c.contacts.length) ? c.contacts.length : (c.tel ? 1 : 0);
  const extra = n > 1 ? ('<span class="cf-ct-badge">+' + (n - 1) + '</span>') : '';
  return '<button type="button" class="cf-contacts-btn" onclick="cfContactsOpen()">📞 その他連絡先' + extra + '</button>';
}
function _cfRenderContacts(c){
  let m = document.getElementById('cf-contacts-modal');
  if(!m){ m = document.createElement('div'); m.id = 'cf-contacts-modal'; m.className = 'cm-overlay'; document.body.appendChild(m); }
  let h = '<div class="cm-box"><div class="cm-head">📞 連絡先 <span class="cm-sub">「優先」の番号がカードのTEL欄に出ます</span><button class="cm-x" onclick="cfContactsClose()">✕</button></div><div class="cm-body">';
  c.contacts.forEach(function(ct,i){
    const p = String(ct.tel || '').split('-');
    const v1 = _pe(p[0] || ''), v2 = _pe(p[1] || ''), v3 = _pe(p.slice(2).join('') || '');
    // 番号は本体と同じ「1BOX＋クリックで3枠ガイド」方式
    h += '<div class="cf-ct-row" data-ctidx="' + i + '">'
      + '<label class="cf-ct-pri"><input type="radio" name="cf-ct-pri" ' + (ct.primary ? 'checked' : '') + ' onchange="cfContactSetPrimary(' + i + ')"> 優先</label>'
      + '<div class="cf-tel cf-ct-telw">'
      +   '<input type="text" class="cf-input cf-tel-main" readonly value="' + _pe(ct.tel || '') + '" placeholder="クリックして入力" onclick="cfContactToggle(this)">'
      +   '<div class="cf-tel-guide"><div class="cf-tel-row">'
      +     '<input class="cf-input cf-ct-1" inputmode="numeric" maxlength="5" value="' + v1 + '" placeholder="090" oninput="cfContactTel(' + i + ')">'
      +     '<span class="cf-tel-sep">-</span>'
      +     '<input class="cf-input cf-ct-2" inputmode="numeric" maxlength="4" value="' + v2 + '" placeholder="1234" oninput="cfContactTel(' + i + ')">'
      +     '<span class="cf-tel-sep">-</span>'
      +     '<input class="cf-input cf-ct-3" inputmode="numeric" maxlength="4" value="' + v3 + '" placeholder="5678" oninput="cfContactTel(' + i + ')">'
      +   '</div></div>'
      + '</div>'
      + '<input class="cf-input cf-ct-label" value="' + _pe(ct.label || '') + '" placeholder="ラベル（例 会社携帯）" oninput="cfContactLabel(' + i + ',this.value)">'
      + '<button type="button" class="cf-ct-del" onclick="cfContactDel(' + i + ')" title="削除">🗑</button>'
      + '</div>';
  });
  h += '</div><div class="cm-foot"><button class="cm-cancel" onclick="cfContactAdd()">＋ 連絡先を追加</button><button class="cm-save" onclick="cfContactsClose()">完了</button></div></div>';
  m.innerHTML = h;
  m.classList.add('show');
  m.onclick = function(e){ if(e.target === m) cfContactsClose(); };
}
function _cfCard(){ return state.cards.find(x=>x.id===_editingCardId); }
/* 前回入庫（＝この顧客の直近の別カード。車両ではなく顧客単位）が代車を使っていたか */
function _prevIntakeLoaner(c){
  if (!c) return false;
  const np = s => String(s || '').replace(/\s+/g, '');
  const arr = state.cards || [];
  const myName = (c.customer || '').trim();
  let plates = [];
  if (c.customerId && state.customers){
    const cust = state.customers.find(x => x.id === c.customerId);
    if (cust) plates = (cust.vehicles || []).map(v => np(v.plate)).filter(Boolean);
  }
  const others = arr.filter(x => x.id !== c.id && (
    (c.customerId && x.customerId === c.customerId) ||
    (myName && (x.customer || '').trim() === myName) ||
    (plates.length && plates.indexOf(np(x.plate)) >= 0)
  ));
  if (!others.length) return false;
  others.sort((a, b) => (((b.returnDate || b.reserveDate) || '').localeCompare((a.returnDate || a.reserveDate) || '')));
  return !!others[0].needLoaner;
}
/* この顧客で新規車両を追加：ナンバー/メーカー/車種だけクリア（人・連絡先・担当/課/区分は継承）。
   保存すると c.customerId の人に新しいナンバーの車両として upsert される。 */
window.cfAddVehicle = function(){
  const c=_cfCard(); if(!c) return;
  c.plate=''; c.maker=''; c.car='';
  if(window.PitDB) PitDB.save();
  renderCardForm(c);
};
window.cfContactsOpen = function(){ const c=_cfCard(); if(!c) return; _cfEnsureContacts(c); _cfRenderContacts(c); };
window.cfContactToggle = function(el){ const w=el.closest('.cf-tel'); if(w) w.classList.toggle('open'); };
window.cfContactTel = function(i){
  const c=_cfCard(); if(!c||!c.contacts[i]) return;
  const row=document.querySelector('#cf-contacts-modal .cf-ct-row[data-ctidx="'+i+'"]'); if(!row) return;
  const b1=row.querySelector('.cf-ct-1'), b2=row.querySelector('.cf-ct-2'), b3=row.querySelector('.cf-ct-3');
  b1.value=_plateDigits(b1.value,5); b2.value=_plateDigits(b2.value,4); b3.value=_plateDigits(b3.value,4);
  const tel=[b1.value.trim(),b2.value.trim(),b3.value.trim()].filter(Boolean).join('-');
  c.contacts[i].tel=tel;
  const main=row.querySelector('.cf-tel-main'); if(main) main.value=tel;
  if(c.contacts[i].primary) c.tel=tel;
  if(window.PitDB) PitDB.save();
};
window.cfContactLabel = function(i,val){ const c=_cfCard(); if(!c||!c.contacts[i]) return; c.contacts[i].label=val; if(window.PitDB) PitDB.save(); };
window.cfContactSetPrimary = function(i){ const c=_cfCard(); if(!c||!c.contacts[i]) return; c.contacts.forEach(x=>x.primary=false); c.contacts[i].primary=true; c.tel=c.contacts[i].tel||''; if(window.PitDB) PitDB.save(); };
window.cfContactAdd = function(){ const c=_cfCard(); if(!c) return; _cfEnsureContacts(c); c.contacts.push({tel:'',label:'',primary:false}); _cfRenderContacts(c); };
window.cfContactDel = function(i){
  const c=_cfCard(); if(!c||!Array.isArray(c.contacts)) return;
  c.contacts.splice(i,1);
  if(!c.contacts.length) c.contacts=[{tel:'',label:'個人携帯',primary:true}];
  if(!c.contacts.some(x=>x.primary)){ c.contacts[0].primary=true; }
  const pri=c.contacts.find(x=>x.primary); c.tel=pri?(pri.tel||''):'';
  _cfRenderContacts(c);
};
window.cfContactsClose = function(){
  const c=_cfCard();
  if(c && Array.isArray(c.contacts)){
    // 空（番号もラベルも空）の行は捨てる
    c.contacts=c.contacts.filter(x=>(x.tel||'').trim() || (x.label||'').trim());
    if(!c.contacts.length){ if(c.tel) c.contacts=[{tel:c.tel,label:'個人携帯',primary:true}]; }
    else if(!c.contacts.some(x=>x.primary)){ c.contacts[0].primary=true; }
    const pri=(c.contacts||[]).find(x=>x.primary);
    if(pri) c.tel=pri.tel||'';
    if(window.PitDB) PitDB.save();
  }
  const m=document.getElementById('cf-contacts-modal'); if(m){ m.classList.remove('show'); m.innerHTML=''; }
  if(c) renderCardForm(c);
};
/* c.plate（"野田 300 ひ 55-55"）を4分割。保存は常にこの合成文字列＝既存の一覧/帳票はそのまま使える */
function _platePartsOf(c){
  const toks = String(c.plate || '').trim().split(/\s+/).filter(Boolean);
  return { region: toks[0] || '', cls: toks[1] || '', kana: toks[2] || '', num: toks[3] || '' };
}
function plateInput(c){
  // v0.83.0「新規車両」スイッチON＝ナンバー未定の新しい車（c.plate に文言「新規車両」を入れる）
  const isNew = (String(c.plate || '').trim() === '新規車両');
  const p = isNew ? { region:'', cls:'', kana:'', num:'' } : _platePartsOf(c);
  let h = '<div class="cf-plate">';
  h += '<input type="text" class="cf-input cf-plate-main" data-plate-main readonly value="' + _pe(c.plate || '') + '" placeholder="クリックして入力" autocomplete="off">';
  h += '<div class="cf-plate-guide">';
  h += '<div class="cf-plate-row">';                       // v0.83.0 既存グリッドはそのまま・右側にスイッチ列を足すための横並び
  h += '<div class="cf-plate-grid">';
  h += '<div><div class="cf-plate-l">地名（管轄）</div><input class="cf-input cf-plate-region" list="cf-plate-regions" data-plate="region" value="' + _pe(p.region) + '" placeholder="野田" autocomplete="off"></div>';
  h += '<div><div class="cf-plate-l">分類</div><input class="cf-input cf-plate-cls" data-plate="cls" value="' + _pe(p.cls) + '" placeholder="300" inputmode="numeric" maxlength="3"></div>';
  h += '<div><div class="cf-plate-l">かな</div><input class="cf-input cf-plate-kana" data-plate="kana" value="' + _pe(p.kana) + '" placeholder="ひ" maxlength="1"></div>';
  h += '<div><div class="cf-plate-l">ナンバー</div><input class="cf-input cf-plate-num" data-plate="num" value="' + _pe(p.num) + '" placeholder="5555" inputmode="numeric" maxlength="4"></div>';
  h += '</div>';
  // v0.83.0 右側＝「新規車両」スイッチ。押すとナンバー欄に「新規車両」と入る（ナンバーがまだ無い新しい車向け）
  h += '<div class="cf-plate-side">';
  h += '<button type="button" class="cf-plate-newveh' + (isNew ? ' on' : '') + '" data-plate-newveh>新規車両</button>';
  h += '<div class="cf-plate-side-hint">ナンバー未定の<br>新しい車に</div>';
  h += '</div>';
  h += '</div>';                                           // /.cf-plate-row
  h += '<datalist id="cf-plate-regions">';
  PLATE_REGIONS.forEach(function (r){ h += '<option value="' + r + '"></option>'; });
  h += '</datalist>';
  h += '</div></div>';
  return h;
}

function loanerSelect(c, key){
  let h = '<select class="cf-input" data-key="' + key + '">';
  h += '<option value="">使用代車を選ぶ</option>';
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
      if (window.PitDB) PitDB.save();   // v0.83.1 入力を自動保存（従来は close/unload 任せで取りこぼし＝「保存されない」原因）
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
      if (window.PitDB) PitDB.save();   // v0.83.1 変更を自動保存
      // 担当（フロント/予約）を選んだら、その人の課を自動選択（→課チップ点灯＆もう一方の担当も同課で絞られる）
      if ((key === 'frontStaff' || key === 'reserveStaff') && v) {
        const d = _staffDivision(v);
        if (d && c.division !== d) c.division = d;
      }
      // v0.84.0 右パネル（選んだ日の入庫/返車・担当のMHS予定・担当ハイライト）を更新するため再描画
      // v0.92.0 LINE状態・Lステップ番号の変更でも再描画（OK選択でLステップ欄を出す／リンク生成）
      if (key === 'reserveDate' || key === 'frontStaff' || key === 'reserveStaff' || key === 'lineStatus' || key === 'lstepId') { renderCardForm(c); return; }
    });
  });

  // 姓名／カナ（1BOX 2セグメント）→ customer/kana を半角空白で合成＋自動フリガナ（姓→姓カナ・名→名カナ）
  (function(){
    const segs = {};
    root.querySelectorAll('.cf-nb-seg').forEach(function(el){ segs[el.dataset.name] = el; });
    const recompose = function(){
      c.sei = ((segs.sei && segs.sei.value) || '').trim();
      c.mei = ((segs.mei && segs.mei.value) || '').trim();
      c.seiKana = ((segs.seiKana && segs.seiKana.value) || '').trim();
      c.meiKana = ((segs.meiKana && segs.meiKana.value) || '').trim();
      c.customer = [c.sei, c.mei].filter(Boolean).join(' ');
      c.kana = [c.seiKana, c.meiKana].filter(Boolean).join(' ');
      if (_cardCheckOn) _cardMarkMisses(c, root);
      if (window.PitDB) PitDB.save();
    };
    ['sei', 'mei', 'seiKana', 'meiKana'].forEach(function(k){ if (segs[k]) segs[k].addEventListener('input', recompose); });
    _bindAutoKanaSeg(segs.sei, segs.seiKana, recompose);   // 姓→姓カナ
    _bindAutoKanaSeg(segs.mei, segs.meiKana, recompose);   // 名→名カナ
  })();

  // 入庫時刻：メインBOX直接入力（全角→半角）＋フォーカスで下にショートカット（AM/PM/決まり次第/未定）
  (function(){
    const timeWrap = root.querySelector('.cf-time');
    if (!timeWrap) return;
    const mainEl = timeWrap.querySelector('.cf-time-main');
    const pickEl = timeWrap.querySelector('.cf-time-pick');
    const syncChips = function(v){ timeWrap.querySelectorAll('.cf-time-quick .cf-chip').forEach(function(b){ b.classList.toggle('active', b.dataset.val === v); }); };
    if (mainEl){
      mainEl.addEventListener('focus', function(){ timeWrap.classList.add('open'); });
      mainEl.addEventListener('input', function(){ const v = _timeHalf(mainEl.value); if (mainEl.value !== v) mainEl.value = v; c.reserveTime = v; syncChips(v); });
      // v0.95.0 確定(blur)で賢く補正：900/9時/9時半/九時半/0915/0900-1000 → HH:MM
      mainEl.addEventListener('change', function(){ const v = _normTime(mainEl.value); mainEl.value = v; c.reserveTime = v; syncChips(v); if (pickEl) pickEl.value = _timePickVal(v); if (window.PitDB) PitDB.save(); });
    }
    if (pickEl){
      pickEl.addEventListener('change', function(){ if (!pickEl.value) return; c.reserveTime = pickEl.value; if (mainEl) mainEl.value = pickEl.value; syncChips(pickEl.value); if (window.PitDB) PitDB.save(); });
    }
    timeWrap.querySelectorAll('.cf-time-quick .cf-chip').forEach(function(btn){
      btn.addEventListener('mousedown', function(e){ e.preventDefault(); });
      btn.addEventListener('click', function(){ c.reserveTime = btn.dataset.val; if (mainEl) mainEl.value = c.reserveTime; syncChips(c.reserveTime); if (window.PitDB) PitDB.save(); if (mainEl) mainEl.focus(); });
    });
    timeWrap.addEventListener('focusout', function(e){ if (!timeWrap.contains(e.relatedTarget)) timeWrap.classList.remove('open'); });
  })();

  // TEL：見た目1BOX。クリックで3枠ガイドを開く。半角数字のみ→ c.tel に "市外-市内-番号" でハイフン自動挿入。枠が埋まると次へ
  const telWrap = root.querySelector('.cf-tel');
  if (telWrap){
    const mainEl = telWrap.querySelector('[data-tel-main]');
    const tg = sel => { const x = telWrap.querySelector(sel); return x ? x.value.trim() : ''; };
    const telEls = [telWrap.querySelector('.cf-tel-1'), telWrap.querySelector('.cf-tel-2'), telWrap.querySelector('.cf-tel-3')];
    const recompose = () => {
      c.tel = [tg('.cf-tel-1'), tg('.cf-tel-2'), tg('.cf-tel-3')].filter(Boolean).join('-');
      if (mainEl) mainEl.value = c.tel;
      if (Array.isArray(c.contacts)){ const pri = c.contacts.find(x=>x.primary); if (pri) pri.tel = c.tel; }   // 代表連絡先も同期
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
    const newVehBtn = plateWrap.querySelector('[data-plate-newveh]');   // v0.83.0「新規車両」スイッチ
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
      if (newVehBtn) newVehBtn.classList.remove('on');                 // v0.83.0 ナンバーを打ったら「新規車両」は自動で解除
    }));
    // v0.83.0「新規車両」スイッチ：押すと c.plate='新規車両'（ナンバー欄に文言が入る）。もう一度押すと解除。
    if (newVehBtn){
      newVehBtn.addEventListener('click', () => {
        const willOn = !newVehBtn.classList.contains('on');
        newVehBtn.classList.toggle('on', willOn);
        if (willOn){
          plateWrap.querySelectorAll('[data-plate]').forEach(el => { el.value = ''; });   // 4枠はクリア
          c.plate = '新規車両';
          if (mainEl) mainEl.value = c.plate;
          if (window.PitDB) PitDB.save();
          plateWrap.classList.remove('open');                          // 押したら閉じる
        } else {
          recompose();                                                 // 空の4枠から合成＝c.plate='' ＋保存
        }
      });
    }
    const openGuide = () => plateWrap.classList.add('open');
    if (mainEl){
      mainEl.addEventListener('focus', openGuide);
      mainEl.addEventListener('click', () => { openGuide(); const r = plateWrap.querySelector('.cf-plate-region'); if (r) setTimeout(() => r.focus(), 0); });
    }
    // フォーカスがガイドの外へ出たら閉じる（クリック外し・Tab抜け両対応）
    plateWrap.addEventListener('focusout', (e) => { if (!plateWrap.contains(e.relatedTarget)) plateWrap.classList.remove('open'); });
  }

  // v0.85.0 受付タイプ＝最大2つ選択（待/当/預）。主=dropType・副=dropType2。表示は「待or預」。
  root.querySelectorAll('.cf-chips.cf-dual').forEach(group => {
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.val;
        const cur = [c.dropType, c.dropType2].filter(Boolean);
        const idx = cur.indexOf(v);
        if (idx >= 0) cur.splice(idx, 1);          // 選択中→解除（主を外したら副が主に繰り上がる）
        else if (cur.length < 2) cur.push(v);      // 未選択→追加（最大2つ）
        else cur[1] = v;                           // すでに2つ→2つ目を置き換え
        c.dropType  = cur[0] || null;
        c.dropType2 = cur[1] || null;
        // 概算（預かり日数）は主の受付タイプで計算（従来どおり）
        if (window.pitEstHold) c.estHoldDays = c.workType ? pitEstHold(c.workType, c.dropType) : '';
        renderCardForm(c);
      });
    });
  });

  // チップ（単一選択）
  root.querySelectorAll('.cf-chips:not([data-multi]):not([data-combo]):not(.cf-dual)').forEach(group => {
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
          // 作業タイプ未選択のうちは概算 預かり日数は空欄（選んだら自動で入る）
          if (window.pitEstHold)   c.estHoldDays = c.workType ? pitEstHold(c.workType, c.dropType) : '';
          if (window.pitEstAmount && key === 'workType' && c.workType) c.estAmount = pitEstAmount(c.workType);
          if (key === 'workType') _syncWorkTypes(c);   // 表示用バッジ列を同期（基本＋併用）
        }
        renderCardForm(c);
      });
    });
  });

  // 作業タイプの「併用可」チップ（追加トグル＝c.workAddons[]）
  root.querySelectorAll('.cf-chips[data-combo]').forEach(group => {
    const key = group.dataset.key;   // workAddons
    if (!Array.isArray(c[key])) c[key] = [];
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.val;
        const idx = c[key].indexOf(v);
        if (idx >= 0) c[key].splice(idx, 1);
        else c[key].push(v);
        _syncWorkTypes(c);
        // v0.94.1 併用可は単独利用も可：主作業(workType)が無く併用可だけの時は、その先頭で概算を自動入力
        if (!c.workType){
          const eff = (c.workAddons || [])[0] || '';
          if (window.pitEstHold)   c.estHoldDays = eff ? pitEstHold(eff, c.dropType) : '';
          if (window.pitEstAmount) c.estAmount   = eff ? pitEstAmount(eff) : c.estAmount;
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
        if (window.PitDB) PitDB.save();   // v0.83.1 代車条件の選択を自動保存
        // 代車条件を変えたら代車ガントを並べ替え直す（条件マッチを上へ）
        if (key === 'loanerConditions' && window.cfsLgRerender) cfsLgRerender();
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
