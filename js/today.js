/* ========================================
   today.js  -  当日ビュー（朝イチ全員で見る今日の段取り紙）／PitFlow v0.29.0
   ----------------------------------------
   ◎時間軸レイアウト（ゆうた設計 2026-06-05）
     ・入庫と返車を縦に時間順で並べ、休憩枠（12:00-13:00 / 15:30-16:30）を
       両カラムで高さを揃えて差し込む。来店が休憩に被る時は枠内にカードを入れられる。
     ・足りない方の時間帯は空間を開ける＝「午前にどれだけ残ってるか」が体感で分かる。
   ◎チーム色：国産＝グリーン(#1db97a) / 輸入＝ピンク(#ec4899)。右端アクセント。
   ◎担当フロントを時間と客名の間に縦書きバッジ（1課=緑 / 2課=ピンク）。
   ◎当日/翌日トグル（カレンダーの月送りイメージ）。
   ======================================== */

const TODAY_BREAKS = [
  { from: '12:00', to: '13:00', label: '休憩' },
  { from: '15:30', to: '16:30', label: '休憩' },
];

window._todayOffset = 0;   // 0=当日 / 1=翌日 …
window._todayFull = false; // false=コンパクト（詰め・既定）/ true=フルビュー（左右で高さを揃える）

function _todTeamColor(c){ return (c.boardId === 'import') ? '#ec4899' : '#1db97a'; }

/* "09:30" や "09:00-10:00" の先頭時刻を分に。空は大きい値（末尾送り） */
function _todMin(t){
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return 99999;
  return (+m[1]) * 60 + (+m[2]);
}
function _hm(min){ return String(Math.floor(min/60)).padStart(2,'0') + ':' + String(min%60).padStart(2,'0'); }

function renderToday(){
  const wrap = document.getElementById('view-today-body');
  if (!wrap) return;

  const base = new Date(); base.setHours(0,0,0,0);
  const day = addDays(base, window._todayOffset || 0);
  const dayStr = ymd(day);
  const dow = '日月火水木金土'[day.getDay()];
  const isToday = (window._todayOffset || 0) === 0;

  // 入庫リスト＝まだ来ていない予約（status=reserved）。入庫済みにするとタスクへ移りここから消える
  const intake = state.cards
    .filter(c => c.reserveDate === dayStr && c.status === 'reserved')
    .sort((a,b) => _todMin(a.reserveTime) - _todMin(b.reserveTime));
  // 返車リスト＝今日返車予定でまだ返していない。返車済みにすると実績へ移りここから消える
  const returns = state.cards
    .filter(c => c.returnDate === dayStr && c.status !== 'returned' && c.status !== 'scrap')
    .sort((a,b) => _todMin(a.returnTime || a.reserveTime) - _todMin(b.returnTime || b.reserveTime));

  // 入庫：今日の予約総数（返車済み含む）を固定表示。残＝まだ来ていない（status=reserved）
  const intakeTotal = state.cards.filter(c => c.reserveDate === dayStr && c.status !== 'scrap').length;
  const inLeft  = state.cards.filter(c => c.reserveDate === dayStr && c.status === 'reserved').length;
  const inMoved = intakeTotal - inLeft;   // すでに入った台数（1台でも動けば残を表示）
  // 返車：今日の返車総数を固定。残＝まだ返してない
  const returnTotal = state.cards.filter(c => c.returnDate === dayStr && c.status !== 'scrap').length;
  const returnDone  = state.cards.filter(c => c.returnDate === dayStr && c.status === 'returned').length;
  const outLeft = returnTotal - returnDone;
  const outMoved = returnDone;

  let html = '';

  // ===== ヘッダー（日付＋入庫返車カウント＋残） =====
  html += '<div class="today-head">';
  html += '<div class="today-date">';
  html += '<span class="big">' + (day.getMonth()+1) + '月 ' + day.getDate() + '日</span>';
  html += '<span class="dow">(' + dow + ')</span>';
  html += (isToday ? '<span class="today-badge">今日</span>' : '<span class="today-badge next">翌日</span>');
  html += '</div>';

  html += '<div class="today-counts">';
  html += '<div class="count-chip in"><span class="num">' + intakeTotal + '</span><span class="lbl">入庫</span>'
        + (inMoved > 0 ? '<span class="rem">残' + inLeft + '</span>' : '') + '</div>';
  html += '<div class="count-chip out"><span class="num">' + returnTotal + '</span><span class="lbl">返車</span>'
        + (outMoved > 0 ? '<span class="rem">残' + outLeft + '</span>' : '') + '</div>';
  html += '<button class="tnav-btn full-btn' + (window._todayFull ? ' on' : '') + '" onclick="todayToggleFull()" title="入庫と返車の時間を左右で揃えて表示">'
        + (window._todayFull ? '▤ コンパクト' : '▥ フルビュー') + '</button>';
  html += '</div>';

  // 当日/翌日トグル（旧 金庫/SNS/掃除 の位置）
  html += '<div class="today-nav">';
  html += '<button class="tnav-btn" onclick="todayShift(-1)" ' + (isToday ? 'disabled' : '') + '>◀ 前日</button>';
  html += '<button class="tnav-btn" onclick="todayShift(0)">今日</button>';
  html += '<button class="tnav-btn" onclick="todayShift(1)">翌日 ▶</button>';
  html += '</div>';
  html += '</div>';

  // ===== 2カラム（時間軸・休憩バー） =====
  const intakeRows = _todBuildRows(intake, false);
  const returnRows = _todBuildRows(returns, true);
  // フルビュー＝左右で行数を揃える／コンパクト＝詰める（既定）
  const merged = window._todayFull
    ? _todMergeAlign(intakeRows, returnRows)
    : { left: _todPlain(intakeRows, false), right: _todPlain(returnRows, true) };

  html += '<div class="today-cols' + (window._todayFull ? ' full' : '') + '">';
  html += '<div class="today-col">';
  html += '<div class="today-col-head intake"><span class="ic">📥</span>入庫 <span class="cnt">' + intake.length + '</span></div>';
  html += '<div class="today-col-body">' + (_todHasAny(merged.left) ? merged.left : '<div class="today-empty">入庫予定なし</div>') + '</div>';
  html += '</div>';
  html += '<div class="today-col">';
  html += '<div class="today-col-head return"><span class="ic">📤</span>返車 <span class="cnt">' + returns.length + '</span></div>';
  html += '<div class="today-col-body">' + (_todHasAny(merged.right) ? merged.right : '<div class="today-empty">返車予定なし</div>') + '</div>';
  html += '</div>';
  html += '</div>';

  wrap.innerHTML = html;
}

window.todayToggleFull = function(){ window._todayFull = !window._todayFull; renderToday(); };

/* コンパクト（既定）：詰めて積む。休憩バーは被ったカードを枠内に入れる（パディングなし） */
function _todPlain(blocks, isReturn){
  let h = '';
  blocks.forEach(b => {
    if (b.type === 'break'){
      if (b.cards.length) h += _todBreakHtml(b, b.cards.length, isReturn);
      else h += _todBreakHtml(b, 0, isReturn);   // 空でもバーは出す（時間の目印）
    } else {
      b.cards.forEach(c => { h += todayRow(c, isReturn); });
    }
  });
  return h;
}

window.todayShift = function(n){
  if (n === 0) window._todayOffset = 0;
  else window._todayOffset = Math.max(0, (window._todayOffset || 0) + n);
  renderToday();
};

/* ===== カードタップ → アクションシート（入庫済み/返車済み・詳細を見る）v0.30.0 ===== */
window.pitTodayTap = function(id, isReturn){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  let back = document.getElementById('today-action');
  if (!back){
    back = document.createElement('div');
    back.id = 'today-action';
    back.className = 'modal-backdrop';
    back.addEventListener('click', e => { if (e.target.id === 'today-action') pitTodayActionClose(); });
    document.body.appendChild(back);
  }
  const wt = state.workTypes.find(w => w.id === c.workType);
  const team = (c.boardId === 'import') ? '🌍 輸入車' : '🚗 国産車';
  const doneLabel = isReturn ? '📤 返車済みにする' : '📥 入庫済みにする';
  const doneSub   = isReturn ? 'この日の実績（確定売上）に固めます' : 'タスクへ移動・予約から外れます';
  const doneFn    = isReturn ? 'pitTodayReturn' : 'pitTodayCheckIn';
  const cancelLabel = isReturn ? '🚫 返車キャンセル' : '🚫 キャンセル（来店なし）';
  const cancelSub   = isReturn ? '返車予定を外して「返車・未定」へ戻す' : '「未入庫」へ（1ヶ月後に自動アーカイブ）';
  back.innerHTML =
    '<div class="ta-sheet">' +
      '<div class="ta-head"><b>' + (c.customer || '（未入力）') + ' 様</b>　' +
        (c.maker ? c.maker + ' ' : '') + (c.car || '') + (c.plate ? '<span class="ta-plate">' + c.plate + '</span>' : '') +
        '<div class="ta-sub">' + team + (wt ? '・' + wt.label : '') + (isReturn ? '・返車' : '・入庫') + '</div>' +
      '</div>' +
      '<button class="ta-btn primary" onclick="' + doneFn + '(\'' + id + '\')"><b>' + doneLabel + '</b><span>' + doneSub + '</span></button>' +
      '<button class="ta-btn" onclick="pitTodayEditDt(\'' + id + '\',' + (isReturn ? 'true' : 'false') + ')"><b>🕒 日時変更</b><span>' + (isReturn ? '返車' : '入庫') + 'の日付・時間だけ変更</span></button>' +
      '<button class="ta-btn" onclick="pitTodayDetail(\'' + id + '\')"><b>📋 詳細を見る</b><span>カードを開いて確認・編集</span></button>' +
      '<button class="ta-btn danger" onclick="pitTodayCancel(\'' + id + '\',' + (isReturn ? 'true' : 'false') + ')"><b>' + cancelLabel + '</b><span>' + cancelSub + '</span></button>' +
      '<button class="ta-cancel" onclick="pitTodayActionClose()">閉じる</button>' +
    '</div>';
  back.classList.add('show');
};

/* 🕒 日時変更：入庫/返車の日付・時間だけをシート内でサッと変更（詳細カードにも反映） */
window.pitTodayEditDt = function(id, isReturn){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const back = document.getElementById('today-action');
  if (!back) return;
  const dVal = isReturn ? (c.returnDate || '') : (c.reserveDate || '');
  const tVal = isReturn ? (c.returnTime || '') : (c.reserveTime || '');
  back.innerHTML =
    '<div class="ta-sheet">' +
      '<div class="ta-head"><b>🕒 ' + (isReturn ? '返車' : '入庫') + 'の日時変更</b>' +
        '<div class="ta-sub">' + (c.customer || '') + ' 様　' + (c.car || '') + '</div></div>' +
      '<label class="ta-f">日付<input type="date" id="ta-dt-d" value="' + dVal + '"></label>' +
      '<label class="ta-f">時間<input type="text" id="ta-dt-t" value="' + tVal + '" placeholder="例 09:30 / 09:00-10:00"></label>' +
      '<button class="ta-btn primary" onclick="pitTodaySaveDt(\'' + id + '\',' + (isReturn ? 'true' : 'false') + ')"><b>💾 保存</b></button>' +
      '<button class="ta-cancel" onclick="pitTodayTap(\'' + id + '\',' + (isReturn ? 'true' : 'false') + ')">← 戻る</button>' +
    '</div>';
};
window.pitTodaySaveDt = function(id, isReturn){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const d = (document.getElementById('ta-dt-d') || {}).value || '';
  const t = (document.getElementById('ta-dt-t') || {}).value || '';
  if (isReturn){ c.returnDate = d; c.returnTime = t; }
  else { c.reserveDate = d; c.reserveTime = t; if (d) c.intakeTbd = false; }
  if (window.PitDB) PitDB.save();
  pitTodayActionClose();
  renderToday();
  if (window.pitToast) pitToast('🕒 日時を変更しました');
};

/* 🚫 キャンセル：入庫＝未入庫へ（1ヶ月でアーカイブ）／返車＝返車未定へ差し戻し */
window.pitTodayCancel = function(id, isReturn){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  if (isReturn){
    if (!confirm('返車予定をキャンセルして「返車・未定」へ戻しますか？')) return;
    c.returnTbd = true;
    c.returnDate = '';
    if (window.logFlow) logFlow(c, '返車予定キャンセル（未定へ）');
  } else {
    if (!confirm('この入庫予約をキャンセルしますか？\n「未入庫」リストに残り、1ヶ月後に自動でアーカイブされます。')) return;
    c.status = 'cancelled';
    c.cancelledAt = ymd(new Date());
    if (window.logFlow) logFlow(c, 'キャンセル（来店なし）');
  }
  if (window.PitDB) PitDB.save();
  pitTodayActionClose();
  renderToday();
  if (window.pitToast) pitToast(isReturn ? '🚫 返車・未定へ戻しました' : '🚫 未入庫へ移しました');
};
window.pitTodayActionClose = function(){
  const back = document.getElementById('today-action');
  if (back) back.classList.remove('show');
};
window.pitTodayDetail = function(id){
  pitTodayActionClose();
  openDetail(id);
};
/* 入庫済み：予約 → タスクの最初の工程（点検待ち＝check）へ。予約系から消える */
window.pitTodayCheckIn = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  c.status = 'check';
  if (!c.actualInAt) c.actualInAt = ymd(new Date());   // 実入庫日
  if (window.logFlow && typeof statusLabel === 'function') logFlow(c, '入庫（点検待ちへ）');
  if (window.PitDB) PitDB.save();
  pitTodayActionClose();
  renderToday();
  if (window.pitToast) pitToast('📥 入庫済み → タスク「点検待ち」へ移動しました');
};
/* 返車済み：実績へ。completedAtを今日に・売上を確定値で固める */
window.pitTodayReturn = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const t = ymd(new Date());
  c.status = 'returned';
  c.returnDate = c.returnDate || t;
  c.completedAt = t;                 // 実績カレンダーはこの日付で表示
  if (c.amountFinal == null) c.amountFinal = (window.pitEstAmount ? (c.estAmount || pitEstAmount(c.workType)) : (c.estAmount || 0));  // 売上を固める
  if (window.logFlow && typeof statusLabel === 'function') logFlow(c, '返車完了（実績へ）');
  if (window.PitDB) PitDB.save();
  pitTodayActionClose();
  renderToday();
  if (window.pitToast) pitToast('📤 返車済み → 実績（確定売上）に固めました');
};

/* カードと休憩を時間順にブロック分け：[{break?, cards:[...]}] の配列を返す */
function _todBuildRows(cards, isReturn){
  const tOf = c => isReturn ? _todMin(c.returnTime || c.reserveTime) : _todMin(c.reserveTime);
  const blocks = [];
  let ci = 0;
  // 休憩の前→休憩→…→最後、の順にカードを割り振る
  const cut = TODAY_BREAKS.map(b => _todMin(b.from));
  for (let bi = 0; bi <= TODAY_BREAKS.length; bi++){
    const limit = (bi < TODAY_BREAKS.length) ? cut[bi] : 99999;
    const seg = [];
    while (ci < cards.length && tOf(cards[ci]) < limit){ seg.push(cards[ci]); ci++; }
    blocks.push({ type: 'seg', cards: seg });
    if (bi < TODAY_BREAKS.length){
      // この休憩枠に被るカード（休憩開始〜終了の間に時刻があるもの）は枠内へ
      const b = TODAY_BREAKS[bi];
      const inBreak = [];
      const bf = _todMin(b.from), bt = _todMin(b.to);
      while (ci < cards.length && tOf(cards[ci]) >= bf && tOf(cards[ci]) < bt){ inBreak.push(cards[ci]); ci++; }
      blocks.push({ type: 'break', label: b.label, from: b.from, to: b.to, cards: inBreak });
    }
  }
  return blocks;
}

/* 左右のブロックを揃える＝休憩バーが必ず同じ高さで並ぶように、
   各セグメント／休憩ブロックを左右で同じ行数にパディングしてHTML化（少ない側を空き行で埋める） */
function _todMergeAlign(left, right){
  let L = '', R = '';
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++){
    const lb = left[i], rb = right[i];
    const lc = (lb && lb.cards) ? lb.cards.length : 0;
    const rc = (rb && rb.cards) ? rb.cards.length : 0;
    if ((lb && lb.type === 'break') || (rb && rb.type === 'break')){
      const rows = Math.max(lc, rc, 1);
      L += _todBreakHtml(lb, rows, false);
      R += _todBreakHtml(rb || lb, rows, true);
    } else {
      const rows = Math.max(lc, rc);   // セグメントも左右で揃える＝午前のスカスカが見える
      L += _todSegHtml(lb, rows, false);
      R += _todSegHtml(rb, rows, true);
    }
  }
  return { left: L, right: R };
}
function _todHasAny(html){ return /today-row/.test(html); }

function _todSegHtml(block, rows, isReturn){
  const cards = (block && block.cards) ? block.cards : [];
  let h = '';
  cards.forEach(c => { h += todayRow(c, isReturn); });
  for (let k = cards.length; k < rows; k++) h += '<div class="tod-seg-pad"></div>';   // 空き行＝相手側に合わせた余白
  return h;
}

/* 休憩バー：黄色斜線の枠。休憩中に来る客はこの枠の中に入れる。
   フルビューで相手側に合わせて行数(rows)が増える時は枠が縦に広がる（斜線の空き行で埋める） */
function _todBreakHtml(block, rows, isReturn){
  const cards = (block && block.cards) ? block.cards : [];
  let h = '<div class="tod-break">';
  h += '<div class="tod-break-bar">☕ ' + block.from + '〜' + block.to + ' 休憩</div>';
  cards.forEach(c => { h += todayRow(c, isReturn, true); });
  for (let k = cards.length; k < rows; k++) h += '<div class="tod-break-pad"></div>';
  h += '</div>';
  return h;
}

/* カード1行 */
function todayRow(c, isReturn, inBreak){
  const wt = state.workTypes.find(w => w.id === c.workType);
  const dt = state.dropTypes.find(d => d.id === c.dropType);
  const teamColor = _todTeamColor(c);
  const time = isReturn ? (c.returnTime || c.reserveTime || '') : (c.reserveTime || '');
  // フロント担当（縦書きバッジ・1課=緑/2課=ピンク）
  const isImp = c.boardId === 'import';
  const frontName = (window.pitSurname ? pitSurname((c.frontStaff || '').trim()) : (c.frontStaff || '').trim());

  let h = '';
  h += '<div class="today-row' + (c.urgent ? ' is-urgent' : '') + (inBreak ? ' in-break' : '') + '" onclick="pitTodayTap(\'' + c.id + '\',' + (isReturn ? 'true' : 'false') + ')" style="--team:' + teamColor + '">';
  h += '<div class="tr-time">' + time + '</div>';
  // 担当フロント縦書きバッジ
  if (frontName){
    h += '<div class="tr-front" style="background:' + (isImp ? '#ec4899' : '#1db97a') + '">' + frontName + '</div>';
  } else {
    h += '<div class="tr-front empty"></div>';
  }
  h += '<div class="tr-main">';
  h += '<div class="tr-headline"><span class="tr-customer">' + ((window.pitSurname ? pitSurname(c.customer) : (c.customer || '')) || '（未入力）') + ' 様</span>'
     + (c.car ? '<span class="tr-carname">' + c.car + '</span>' : '') + '</div>';
  if (c.plate) h += '<div class="tr-plate">' + c.plate + '</div>';
  h += '</div>';   // メモは行高さを崩すので当日ビューでは出さない（詳細はカードで）

  // 右側タグ：固定3スロット（添え物｜受付タイプ｜作業タイプ）で全幅揃え
  let side = '';
  if (c.consult)              side += '<span class="tag-side consult">相談</span>';
  if (c.needLoaner)           side += '<span class="tag-side loaner">代車</span>';
  if (isReturn && c.needWash) side += '<span class="tag-side wash">洗車</span>';   // 入庫に洗車は出さない
  const dropTag = dt ? (window.pitDropBadges ? pitDropBadges(c, function(o){ return '<span class="tag-drop tag-drop-' + o.id + '" title="' + o.desc + '">' + o.label + '</span>'; }) : '<span class="tag-drop tag-drop-' + dt.id + '" title="' + dt.desc + '">' + dt.label + '</span>') : '';
  // 作業バッジ＝基本＋併用を並べて表示（設定の色のまま）。当日ビューは枠固定なので最大2個・2個時は余白を詰めて1個ぶん幅に横並び。
  const _wts = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
  let workTag = '';
  _wts.slice(0, 2).forEach(id => {
    const w = state.workTypes.find(x => x.id === id);
    if (w) workTag += '<span class="tag-work' + (w.label.length >= 4 ? ' long' : '') + '" style="background:' + w.color + '20;color:' + w.color + ';border-color:' + w.color + ';">' + w.label + '</span>';
  });
  const workMulti = (workTag.match(/tag-work/g) || []).length >= 2;
  h += '<div class="tr-tags">'
     + '<div class="tr-tag-slot">' + side + '</div>'
     + '<div class="tr-tag-slot">' + dropTag + '</div>'
     + '<div class="tr-tag-slot tr-tag-work' + (workMulti ? ' multi' : '') + '">' + workTag + '</div>'
     + '</div>';

  h += '</div>';
  return h;
}
