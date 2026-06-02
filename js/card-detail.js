/* ========================================
   card-detail.js
   入庫カード詳細フォーム（自動保存・現代的UI）
   ======================================== */

let _editingCardId = null;

function openDetail(cardId){
  _editingCardId = cardId;
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  document.getElementById('md-title').innerHTML =
    '<span style="font-size:13px;color:var(--text3);font-weight:400;">入庫カード</span><br>' +
    (card.customer || '（未入力）') + ' 様 / ' + (card.car || '（車種未入力）');

  renderCardForm(card);
  document.getElementById('modal-detail').classList.add('show');
}

function closeDetail(){
  _editingCardId = null;
  document.getElementById('modal-detail').classList.remove('show');
  // 編集内容を保存（localStorage 永続化）
  if (window.PitDB) PitDB.save();
  // 表示中のビューを再描画して反映
  if (state.currentView) showView(state.currentView);
}

function renderCardForm(c){
  const body = document.getElementById('md-body');
  let h = '';

  /* === 基本情報 === */
  h += sec('基本情報', '👤');
  h += '<div class="cf-row">';
  h += field('お客様名', textIn(c, 'customer', 'flex:2'));
  h += field('TEL',      textIn(c, 'tel',      'flex:1'));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('ナンバー', textIn(c, 'plate'));
  h += field('初回／リピーター', chips(c, 'repeat', state.repeatTypes));
  h += '</div>';
  h += secEnd();

  /* === 車両 === */
  h += sec('車両', '🚗');
  h += '<div class="cf-row">';
  h += field('車名・型式', textIn(c, 'car'));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('入庫日', dateIn(c, 'reserveDate'));
  h += field('入庫時刻', textIn(c, 'reserveTime', 'placeholder="例 09:30 / 09:00-10:00"'));
  h += field('予約受付日', dateIn(c, 'bookedAt'));
  h += '</div>';
  h += secEnd();

  /* === 作業内容 === */
  h += sec('作業内容', '🔧');
  h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
  h += '<div class="cf-label">作業タイプ</div>';
  h += chips(c, 'workType', state.workTypes, true);
  h += '</div></div>';
  h += '<div class="cf-row">';
  h += field('受付タイプ', chips(c, 'dropType', state.dropTypes, true));
  h += '</div>';
  h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
  h += '<div class="cf-label">整備内容（自由記入）</div>';
  h += textareaIn(c, 'menu', 2);
  h += '</div></div>';
  h += secEnd();

  /* === 担当 === */
  h += sec('担当', '👥');
  h += '<div class="cf-row">';
  h += field('課', chips(c, 'division', state.divisions, true));
  h += '</div>';
  h += '<div class="cf-row">';
  h += field('フロント担当', staffSelect(c, 'frontStaff'));
  h += field('予約担当',     staffSelect(c, 'reserveStaff'));
  h += field('作業担当',     staffSelect(c, 'staff'));
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

  body.innerHTML = h;

  // === イベントバインド ===
  bindCardFormEvents(body);
}

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
        // 同じ値クリックで解除
        if (wasActive){
          c[key] = null;
        } else {
          c[key] = newVal;
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
