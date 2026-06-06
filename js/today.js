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

  // 入庫（その日が予約日・返車前まで）／返車（その日が返車日・未返車）
  const intake = state.cards
    .filter(c => c.reserveDate === dayStr && c.status !== 'returned' && c.status !== 'scrap')
    .sort((a,b) => _todMin(a.reserveTime) - _todMin(b.reserveTime));
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
  html += '</div>';

  // 当日/翌日トグル（旧 金庫/SNS/掃除 の位置）
  html += '<div class="today-nav">';
  html += '<button class="tnav-btn" onclick="todayShift(-1)" ' + (isToday ? 'disabled' : '') + '>◀ 前日</button>';
  html += '<button class="tnav-btn" onclick="todayShift(0)">今日</button>';
  html += '<button class="tnav-btn" onclick="todayShift(1)">翌日 ▶</button>';
  html += '</div>';
  html += '</div>';

  // ===== 2カラム（時間軸・休憩バー揃え） =====
  const intakeRows = _todBuildRows(intake, false);
  const returnRows = _todBuildRows(returns, true);
  // 休憩バーの高さを左右で揃える＝各ブロックの最大行数に合わせる
  const merged = _todMergeAlign(intakeRows, returnRows);

  html += '<div class="today-cols">';
  html += '<div class="today-col">';
  html += '<div class="today-col-head intake"><span class="ic">📥</span>入庫 <span class="cnt">' + intake.length + '</span></div>';
  html += '<div class="today-col-body">' + (intake.length || _todHasAny(merged.left) ? merged.left : '<div class="today-empty">入庫予定なし</div>') + '</div>';
  html += '</div>';
  html += '<div class="today-col">';
  html += '<div class="today-col-head return"><span class="ic">📤</span>返車 <span class="cnt">' + returns.length + '</span></div>';
  html += '<div class="today-col-body">' + (returns.length || _todHasAny(merged.right) ? merged.right : '<div class="today-empty">返車予定なし</div>') + '</div>';
  html += '</div>';
  html += '</div>';

  wrap.innerHTML = html;
}

window.todayShift = function(n){
  if (n === 0) window._todayOffset = 0;
  else window._todayOffset = Math.max(0, (window._todayOffset || 0) + n);
  renderToday();
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

/* 左右のブロックを揃えて、各ブロックを同じ最低行数にパディングしてHTML化 */
function _todMergeAlign(left, right){
  let L = '', R = '';
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++){
    const lb = left[i], rb = right[i];
    if (lb && lb.type === 'break'){
      // 休憩ブロック：被ったカード＋空き行を左右同数に
      const lc = lb.cards.length, rc = (rb && rb.cards ? rb.cards.length : 0);
      const rows = Math.max(lc, rc, 1);
      L += _todBreakHtml(lb, rows, false);
      R += _todBreakHtml(rb || lb, rows, true);
    } else {
      // 通常セグメント：カード行をそのまま（行数は揃えず、自然に積む）
      L += _todSegHtml(lb, false);
      R += _todSegHtml(rb, true);
    }
  }
  return { left: L, right: R };
}
function _todHasAny(html){ return /today-row/.test(html); }

function _todSegHtml(block, isReturn){
  if (!block || !block.cards || !block.cards.length) return '';
  return block.cards.map(c => todayRow(c, isReturn)).join('');
}

function _todBreakHtml(block, rows, isReturn){
  const cards = (block && block.cards) ? block.cards : [];
  let h = '<div class="tod-break">';
  h += '<div class="tod-break-bar">☕ ' + block.from + '〜' + block.to + ' 休憩</div>';
  // 被ったカード
  cards.forEach(c => { h += todayRow(c, isReturn, true); });
  // 足りない行は空きスペース（高さ揃え＝体感で残りが見える）
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
  const frontName = (c.frontStaff || '').trim();

  let h = '';
  h += '<div class="today-row' + (c.urgent ? ' is-urgent' : '') + (inBreak ? ' in-break' : '') + '" onclick="openDetail(\'' + c.id + '\')" style="--team:' + teamColor + '">';
  h += '<div class="tr-time">' + time + '</div>';
  // 担当フロント縦書きバッジ
  if (frontName){
    h += '<div class="tr-front" style="background:' + (isImp ? '#ec4899' : '#1db97a') + '">' + frontName + '</div>';
  } else {
    h += '<div class="tr-front empty"></div>';
  }
  h += '<div class="tr-main">';
  h += '<div class="tr-headline"><span class="tr-customer">' + (c.customer || '（未入力）') + ' 様</span>'
     + (c.car ? '<span class="tr-carname">' + c.car + '</span>' : '') + '</div>';
  if (c.plate) h += '<div class="tr-plate">' + c.plate + '</div>';
  if (c.memo) h += '<div class="tr-memo">' + c.memo + '</div>';
  h += '</div>';

  // 右側タグ（右詰め）：[相談][代車] [待/当/預] [作業タイプ]
  h += '<div class="tr-tags">';
  if (c.consult)              h += '<span class="tag-side consult">相談</span>';
  if (c.needLoaner)           h += '<span class="tag-side loaner">代車</span>';
  if (!isReturn && c.needWash) {}   // 入庫に洗車は出さない
  if (isReturn && c.needWash) h += '<span class="tag-side wash">洗車</span>';
  if (dt) h += '<span class="tag-drop tag-drop-' + dt.id + '" title="' + dt.desc + '">' + dt.label + '</span>';
  if (wt) h += '<span class="tag-work" style="background:' + wt.color + '20;color:' + wt.color + ';border-color:' + wt.color + ';">' + wt.label + '</span>';
  h += '</div>';

  h += '</div>';
  return h;
}
