/* ========================================
   rules.js  -  🧩 入庫ルール（入庫アルゴリズム設定ページ）／PitFlow v0.18.0
   ----------------------------------------
   ◎このページ＝入庫に関するアルゴリズムをすべて設定する場所（2026-06-04 ゆうた指示で集約）
     1. 基本値：1日の予約枠（国産/輸入）・売上目標（最低/最高）・平均単価
     2. 積み上げルール：いつ × なにを × どうする（ノーコード・上から全部足し算）
     3. 言葉の辞書：増やす+20% / 減らす-20% / 気を付ける-15% / できる限り無くす-50% / 許容する+15%
     4. 2週間ビジュアル試算：ルール適用後の実効枠をカレンダーで確認（クリックで理由）
   ◎計算仕様
     ・％は合算して1回掛け。端数は減らす系=切り捨て・増やす系=切り上げ（必ず効く）
     ・「無くす」=0台。「⚠注意表示」=文言を出すだけ（数字に影響しない）
     ・判定には「どのルール#が効いたか」を必ず理由表示
   ◎保存：state.settings.reserveCap / target / unitPrice / rules / ruleDict（PitDB永続化）
   ======================================== */
(function () {

  /* ===== 語彙 ===== */
  const WHEN = [
    { id: 'weekend',     label: '土曜・日曜' },
    { id: 'dow6',        label: '土曜' },
    { id: 'dow0',        label: '日曜' },
    { id: 'dow1',        label: '月曜' },
    { id: 'dow2',        label: '火曜' },
    { id: 'dow3',        label: '水曜' },
    { id: 'dow4',        label: '木曜' },
    { id: 'dow5',        label: '金曜' },
    { id: 'q1',          label: '1期（1〜7日）' },
    { id: 'q2',          label: '2期（8〜15日）' },
    { id: 'q3',          label: '3期（16〜23日）' },
    { id: 'q4',          label: '4期（24〜31日）' },
    { id: 'preClosed',   label: '定休日の前日' },
    { id: 'postClosed',  label: '定休日の翌日' },
    { id: 'holiday',     label: '祝日' },
    { id: 'preHoliday',  label: '祝日の前日' },
    { id: 'postHoliday', label: '祝日の翌日' },
    { id: 'range',       label: '期間を指定…' },
  ];
  const TARGET = [
    { id: 'capDefault', label: '国産の予約枠' },
    { id: 'capImport',  label: '輸入の予約枠' },
    { id: 'capBoth',    label: '両チームの予約枠' },
    { id: 'drop',       label: '預かり入庫' },
    { id: 'sameDay',    label: '当日仕上げ' },
    { id: 'loanerDrop', label: '代車つき預かり' },
    { id: 'lotNormal',  label: '置き場の通常枠' },
  ];
  const ACTION = [
    { id: 'increase', label: '増やす',           grp: 'up' },
    { id: 'decrease', label: '減らす',           grp: 'down' },
    { id: 'careful',  label: '気を付ける',       grp: 'down' },
    { id: 'minimize', label: 'できる限り無くす', grp: 'down' },
    { id: 'zero',     label: '無くす（0にする）', grp: 'down' },
    { id: 'allow',    label: '許容する',         grp: 'up' },
    { id: 'warn',     label: '⚠ 注意表示',      grp: 'warn' },
  ];
  const DICT_LABEL = { increase: '増やす', decrease: '減らす', careful: '気を付ける', minimize: 'できる限り無くす', allow: '許容する' };

  function _rules() {
    if (!state.settings.rules) state.settings.rules = [];
    return state.settings.rules;
  }
  function _dict() {
    if (!state.settings.ruleDict) state.settings.ruleDict = { increase: 20, decrease: -20, careful: -15, minimize: -50, allow: 15 };
    return state.settings.ruleDict;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function labelOf(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return id;
  }
  function actGrp(id) {
    for (let i = 0; i < ACTION.length; i++) if (ACTION[i].id === id) return ACTION[i].grp;
    return 'down';
  }
  function manStr(yen) {
    const v = Math.round(yen / 1000) / 10;
    return (v % 1 === 0) ? String(v) : v.toFixed(1);
  }

  /* ===== 判定エンジン ===== */

  function _holName(dStr) {
    return (window.Holidays && Holidays.name) ? Holidays.name(dStr) : null;
  }
  function _shift(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function _ds(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _match(r, d, dStr) {
    const dow = d.getDay(), day = d.getDate();
    const closed = (state.settings.closedDow || []);
    switch (r.when) {
      case 'weekend':     return dow === 0 || dow === 6;
      case 'q1':          return day <= 7;
      case 'q2':          return day >= 8 && day <= 15;
      case 'q3':          return day >= 16 && day <= 23;
      case 'q4':          return day >= 24;
      case 'preClosed':   return closed.indexOf(_shift(d, 1).getDay()) >= 0;
      case 'postClosed':  return closed.indexOf(_shift(d, -1).getDay()) >= 0;
      case 'holiday':     return !!_holName(dStr);
      case 'preHoliday':  return !!_holName(_ds(_shift(d, 1)));
      case 'postHoliday': return !!_holName(_ds(_shift(d, -1)));
      case 'range':       return !!(r.from && r.to && dStr >= r.from && dStr <= r.to);
      default:
        if (r.when && r.when.slice(0, 3) === 'dow') return dow === +r.when.slice(3);
        return false;
    }
  }

  window.pitRulesFor = function (dateStr) {
    const p = String(dateStr).split('-');
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    const dict = _dict();
    const out = { byTarget: {}, warns: [] };
    _rules().forEach(function (r, i) {
      if (r.on === false) return;
      if (!_match(r, d, dateStr)) return;
      if (r.action === 'warn') {
        out.warns.push({ no: i + 1, msg: r.note || '注意', target: r.target });
        return;
      }
      const tg = out.byTarget[r.target] = out.byTarget[r.target] || { pct: 0, zero: false, rules: [] };
      if (r.action === 'zero') { tg.zero = true; tg.rules.push(i + 1); return; }
      const pc = (dict[r.action] != null) ? dict[r.action] : 0;
      tg.pct += pc;
      tg.rules.push(i + 1);
    });
    return out;
  };

  window.pitEffective = function (dateStr, target, base) {
    const rs = window.pitRulesFor(dateStr);
    let pct = 0, zero = false, rules = [];
    function acc(x) { if (!x) return; pct += x.pct; zero = zero || x.zero; rules = rules.concat(x.rules); }
    acc(rs.byTarget[target]);
    if (target === 'capDefault' || target === 'capImport') acc(rs.byTarget.capBoth);
    if (zero) return { value: 0, pct: -100, zero: true, rules: rules };
    if (!rules.length) return { value: base, pct: 0, zero: false, rules: [] };
    let v = base * (1 + pct / 100);
    v = (pct < 0) ? Math.floor(v) : Math.ceil(v);
    if (v < 0) v = 0;
    return { value: v, pct: pct, zero: false, rules: rules };
  };

  /* ===== 画面 ===== */

  window.renderRules = function () {
    const body = document.getElementById('view-rules-body');
    if (!body) return;
    const s = state.settings;
    const rc = s.reserveCap || { default: 5, import: 3 };
    const tg = s.target || { monthMin: 15000000, monthMax: 20000000 };
    const up = s.unitPrice || { default: 83000, import: 130000 };
    const rules = _rules();
    const dict = _dict();

    let h = '';

    /* アルゴリズムの流れ（ビジュアル） */
    h += '<div class="rl-flow">';
    h += '<div class="rl-fbox"><div class="rl-fb-t">① 基本値</div><div class="rl-fb-s">国産 ' + (rc.default != null ? rc.default : 5) + '・輸入 ' + (rc.import != null ? rc.import : 3) + ' 台／日</div></div>';
    h += '<div class="rl-farr">→</div>';
    h += '<div class="rl-fbox"><div class="rl-fb-t">② 🧩 ルールで足し引き</div><div class="rl-fb-s">' + rules.filter(function (r) { return r.on !== false; }).length + ' 個が稼働中</div></div>';
    h += '<div class="rl-farr">→</div>';
    h += '<div class="rl-fbox"><div class="rl-fb-t">③ その日の実効枠</div><div class="rl-fb-s">下の2週間カレンダーで確認</div></div>';
    h += '<div class="rl-farr">→</div>';
    h += '<div class="rl-fbox dim"><div class="rl-fb-t">④ 受付の○△×</div><div class="rl-fb-s">次フェーズ（売上集計と連動）</div></div>';
    h += '</div>';

    h += '<div class="ps-bar"><span class="ps-bar-note">変更すると<b>その場で自動保存</b>。入庫のアルゴリズムは<b>すべてこのページ</b>で設定します。</span>'
       + '<span class="ps-status" id="ps-status"></span></div>';

    /* ① 基本値 */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">📥 ① 入庫の基本値</div>';
    h += '<div class="ps-desc">なにもルールが無い日の数字。ここを起点に下のルールが足し引きされます。</div>';
    h += '<div class="ps-grid">';
    h += '<label class="ps-lb">🚗 国産の予約枠 <input type="number" class="ps-in ps-num" id="rb-cap-d" value="' + (rc.default != null ? rc.default : 5) + '" min="0" max="99" onchange="pitRuleBaseApply()"><span class="ps-unit">台／日</span></label>';
    h += '<label class="ps-lb">🌍 輸入の予約枠 <input type="number" class="ps-in ps-num" id="rb-cap-i" value="' + (rc.import != null ? rc.import : 3) + '" min="0" max="99" onchange="pitRuleBaseApply()"><span class="ps-unit">台／日</span></label>';
    h += '</div>';
    h += '<div class="ps-grid" style="margin-top:12px">';
    h += '<label class="ps-lb">最低目標（月） <input type="number" class="ps-in ps-num" id="rb-tg-min" value="' + Math.round(tg.monthMin / 10000) + '" min="0" max="99999" onchange="pitRuleBaseApply()"><span class="ps-unit">万円</span></label>';
    h += '<label class="ps-lb">最高目標＝天井（月） <input type="number" class="ps-in ps-num" id="rb-tg-max" value="' + Math.round(tg.monthMax / 10000) + '" min="0" max="99999" onchange="pitRuleBaseApply()"><span class="ps-unit">万円</span></label>';
    h += '<span class="ps-lb">→ 期換算 <b id="rb-tg-q" style="font-size:15px">' + Math.round(tg.monthMin / 40000) + '〜' + Math.round(tg.monthMax / 40000) + '</b><span class="ps-unit">万円／期</span></span>';
    h += '</div>';
    h += '<div class="ps-grid" style="margin-top:12px">';
    h += '<label class="ps-lb">🚗 国産の平均単価 <input type="number" class="ps-in ps-num" id="rb-up-d" value="' + manStr(up.default) + '" min="0.1" max="999" step="0.1" onchange="pitRuleBaseApply()"><span class="ps-unit">万円／台</span></label>';
    h += '<label class="ps-lb">🌍 輸入の平均単価 <input type="number" class="ps-in ps-num" id="rb-up-i" value="' + manStr(up.import) + '" min="0.1" max="999" step="0.1" onchange="pitRuleBaseApply()"><span class="ps-unit">万円／台</span></label>';
    h += '</div>';
    h += '<div class="ps-hint">※ 単価は初期値（実績：国産8.3万・輸入13万）。返車完了の確定金額が直近3ヶ月で10台以上貯まると実績平均に自動切替。目標÷単価＝必要台数（目標375万/期 → 国産23台＋輸入14台≒6:4）。</div>';
    h += '</div>';

    /* ② 積んであるルール */
    h += '<div class="ps-card">';
    h += '<div class="ps-h" style="display:flex;align-items:center;gap:10px">🧩 ② 積み上げルール<button class="vh-btn primary" style="margin-left:auto" onclick="pitRuleAdd()">＋ ルールを追加</button></div>';
    h += '<div class="ps-desc">上から<b>全部足し算</b>で効きます（％は合算して1回掛け）。左の色＝<span style="color:#1db97a">増やす系</span>／<span style="color:#ef4444">減らす系</span>／<span style="color:#eab308">注意</span>。</div>';
    if (!rules.length) {
      h += '<div class="ps-hint">まだルールがありません。例：「土曜・日曜」は「国産の予約枠」を「増やす」／「定休日の前日」は「代車つき預かり」に「⚠注意表示」。</div>';
    }
    rules.forEach(function (r, i) { h += _rowHtml(r, i); });
    h += '</div>';

    /* ③ 言葉の辞書 */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">📖 ③ 言葉の辞書（％は調整できる）</div>';
    h += '<div class="ps-grid">';
    Object.keys(DICT_LABEL).forEach(function (k) {
      h += '<label class="ps-lb">' + DICT_LABEL[k] + ' <input type="number" class="ps-in ps-num" id="rl-dict-' + k + '" value="' + (dict[k] != null ? dict[k] : 0) + '" min="-100" max="100" onchange="pitRuleDictApply()"><span class="ps-unit">%</span></label>';
    });
    h += '</div>';
    h += '<div class="ps-hint">※「無くす」は常に0台。端数は減らす系＝切り捨て・増やす系＝切り上げ（小さい数字でも必ず効く）。</div>';
    h += '</div>';

    /* ④ 2週間ビジュアル試算 */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">🧪 ④ これから2週間 — ルール適用後の実効枠</div>';
    h += '<div class="ps-desc">色つき＝ルールが効いている日（<span style="color:#1db97a">緑＝増</span>／<span style="color:#f97316">橙＝減</span>／<span style="color:#ef4444">赤＝停止</span>）。日をクリックすると下に理由が出ます。</div>';
    h += '<div id="rl-grid"></div>';
    h += '<div id="rl-test-out" class="rl-test-out" style="margin-top:12px"></div>';
    h += '</div>';

    body.innerHTML = h;
    pitRuleGrid();
    if (window._rlTestDate) pitRuleDay(window._rlTestDate);
  };

  function _sel(i, field, list, cur) {
    let s = '<select class="ps-in rl-sel" onchange="pitRuleEdit(' + i + ',\'' + field + '\',this.value)">';
    list.forEach(function (o) {
      s += '<option value="' + o.id + '"' + (o.id === cur ? ' selected' : '') + '>' + o.label + '</option>';
    });
    return s + '</select>';
  }

  function _rowHtml(r, i) {
    let h = '<div class="rl-row act-' + actGrp(r.action) + (r.on === false ? ' off' : '') + '">';
    h += '<span class="rl-no">' + (i + 1) + '</span>';
    h += '<label class="rl-on" title="ON/OFF"><input type="checkbox"' + (r.on !== false ? ' checked' : '') + ' onchange="pitRuleEdit(' + i + ',\'on\',this.checked)"></label>';
    h += _sel(i, 'when', WHEN, r.when);
    if (r.when === 'range') {
      h += '<input type="date" class="ps-in" value="' + esc(r.from || '') + '" onchange="pitRuleEdit(' + i + ',\'from\',this.value)">';
      h += '<span class="rl-jo">〜</span>';
      h += '<input type="date" class="ps-in" value="' + esc(r.to || '') + '" onchange="pitRuleEdit(' + i + ',\'to\',this.value)">';
    }
    h += '<span class="rl-jo">は</span>';
    h += _sel(i, 'target', TARGET, r.target);
    h += '<span class="rl-jo">を</span>';
    h += _sel(i, 'action', ACTION, r.action);
    if (r.action === 'warn') {
      h += '<input type="text" class="ps-in rl-note" placeholder="受付に出す文言（例：返却が翌々日になる）" value="' + esc(r.note || '') + '" onchange="pitRuleEdit(' + i + ',\'note\',this.value)">';
    }
    h += '<button class="rl-del" title="削除" onclick="pitRuleDel(' + i + ')">🗑</button>';
    h += '</div>';
    return h;
  }

  /* 基本値の保存 */
  window.pitRuleBaseApply = function () {
    const s = state.settings;
    function rn(id, fb, min, max) {
      const el = document.getElementById(id);
      if (!el) return fb;
      let v = parseInt(el.value, 10);
      if (isNaN(v)) v = fb;
      if (v < min) v = min;
      if (v > max) v = max;
      el.value = v;
      return v;
    }
    function rf(id, fb, min, max) {
      const el = document.getElementById(id);
      if (!el) return fb;
      let v = parseFloat(el.value);
      if (isNaN(v)) v = fb;
      if (v < min) v = min;
      if (v > max) v = max;
      v = Math.round(v * 10) / 10;
      el.value = v;
      return v;
    }
    s.reserveCap = { default: rn('rb-cap-d', 5, 0, 99), import: rn('rb-cap-i', 3, 0, 99) };
    s.target = { monthMin: rn('rb-tg-min', 1500, 0, 99999) * 10000, monthMax: rn('rb-tg-max', 2000, 0, 99999) * 10000 };
    if (s.target.monthMax < s.target.monthMin) s.target.monthMax = s.target.monthMin;
    const q = document.getElementById('rb-tg-q');
    if (q) q.textContent = Math.round(s.target.monthMin / 40000) + '〜' + Math.round(s.target.monthMax / 40000);
    s.unitPrice = { default: Math.round(rf('rb-up-d', 8.3, 0.1, 999) * 10000), import: Math.round(rf('rb-up-i', 13, 0.1, 999) * 10000) };
    _save('✓ 保存しました');
    pitRuleGrid();
  };

  window.pitRuleAdd = function () {
    _rules().push({ on: true, when: 'weekend', target: 'capDefault', action: 'increase', note: '' });
    _save('✓ ルールを追加しました');
    renderRules();
  };

  window.pitRuleEdit = function (i, field, val) {
    const r = _rules()[i];
    if (!r) return;
    if (field === 'on') r.on = !!val;
    else r[field] = val;
    _save('✓ 保存しました');
    renderRules();
  };

  window.pitRuleDel = function (i) {
    const r = _rules()[i];
    if (!r) return;
    if (!confirm('ルール ' + (i + 1) + '（' + labelOf(WHEN, r.when) + ' は ' + labelOf(TARGET, r.target) + ' を ' + labelOf(ACTION, r.action) + '）を削除します。よろしいですか？')) return;
    _rules().splice(i, 1);
    _save('🗑 削除しました');
    renderRules();
  };

  window.pitRuleDictApply = function () {
    const dict = _dict();
    Object.keys(DICT_LABEL).forEach(function (k) {
      const el = document.getElementById('rl-dict-' + k);
      if (!el) return;
      let v = parseInt(el.value, 10);
      if (isNaN(v)) v = dict[k] || 0;
      if (v < -100) v = -100;
      if (v > 100) v = 100;
      el.value = v;
      dict[k] = v;
    });
    _save('✓ 辞書を保存しました');
    pitRuleGrid();
    if (window._rlTestDate) pitRuleDay(window._rlTestDate);
  };

  /* ===== 2週間ビジュアル ===== */

  window.pitRuleGrid = function () {
    const box = document.getElementById('rl-grid');
    if (!box) return;
    const s = state.settings;
    const rc = s.reserveCap || { default: 5, import: 3 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 14; i++) days.push(_shift(today, i));

    function cellCls(eff) {
      if (eff.zero) return ' stop';
      if (eff.pct > 0) return ' up';
      if (eff.pct < 0) return ' down';
      return '';
    }

    let g = '<div class="rl-grid" style="grid-template-columns:88px repeat(' + days.length + ',1fr)">';
    /* ヘッダ */
    g += '<div class="rl-g-h"></div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const hol = _holName(ds);
      const closed = (s.closedDow || []).indexOf(d.getDay()) >= 0;
      const cls = (d.getDay() === 0 || hol) ? ' red' : (d.getDay() === 6 ? ' sat' : '');
      g += '<div class="rl-g-h' + cls + (window._rlTestDate === ds ? ' sel' : '') + '" onclick="pitRuleDay(\'' + ds + '\')">' + (d.getMonth() + 1) + '/' + d.getDate() + '<br>' + '日月火水木金土'[d.getDay()] + (closed ? '・休' : '') + '</div>';
    });
    /* 国産 */
    g += '<div class="rl-g-n">🚗 国産枠</div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const eff = window.pitEffective(ds, 'capDefault', rc.default != null ? rc.default : 5);
      g += '<div class="rl-g-c' + cellCls(eff) + (window._rlTestDate === ds ? ' sel' : '') + '" onclick="pitRuleDay(\'' + ds + '\')">' + (eff.zero ? '停' : eff.value) + '</div>';
    });
    /* 輸入 */
    g += '<div class="rl-g-n">🌍 輸入枠</div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const eff = window.pitEffective(ds, 'capImport', rc.import != null ? rc.import : 3);
      g += '<div class="rl-g-c' + cellCls(eff) + (window._rlTestDate === ds ? ' sel' : '') + '" onclick="pitRuleDay(\'' + ds + '\')">' + (eff.zero ? '停' : eff.value) + '</div>';
    });
    /* 注意 */
    g += '<div class="rl-g-n">⚠ 注意</div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const rs = window.pitRulesFor(ds);
      g += '<div class="rl-g-c wmark' + (window._rlTestDate === ds ? ' sel' : '') + '" onclick="pitRuleDay(\'' + ds + '\')">' + (rs.warns.length ? '⚠' + (rs.warns.length > 1 ? rs.warns.length : '') : '') + '</div>';
    });
    g += '</div>';
    box.innerHTML = g;
  };

  /* 日クリック → 理由つき詳細 */
  window.pitRuleDay = function (dStr) {
    window._rlTestDate = dStr;
    const out = document.getElementById('rl-test-out');
    if (!out) return;
    const s = state.settings;
    const rc = s.reserveCap || { default: 5, import: 3 };
    const lc = s.lotCap || { pit: 4, yard: 12, parking: 8, extra: 4 };
    const lotNormal = (lc.pit || 0) + (lc.yard || 0) + (lc.parking || 0);
    const rs = window.pitRulesFor(dStr);
    const p = dStr.split('-');
    const dd = new Date(+p[0], +p[1] - 1, +p[2]);

    function line(label, target, base, unit) {
      const e = window.pitEffective(dStr, target, base);
      let t = '<div class="rl-tl"><span class="rl-tl-n">' + label + '</span>';
      if (e.zero) t += '<span class="rl-tl-v stop">停止(0' + unit + ')</span>';
      else if (e.rules.length) t += '<span class="rl-tl-v">' + base + ' → <b>' + e.value + unit + '</b>(' + (e.pct > 0 ? '+' : '') + e.pct + '%)</span>';
      else t += '<span class="rl-tl-v">' + base + unit + '(基本のまま)</span>';
      if (e.rules.length) t += '<span class="rl-tl-r">ルール ' + e.rules.map(function (n) { return '#' + n; }).join('・') + ' が効いています</span>';
      return t + '</div>';
    }
    function policyLine(label, target) {
      const t = rs.byTarget[target];
      if (!t) return '';
      const txt = t.zero ? '受けない（0）' : ('方針 ' + (t.pct > 0 ? '+' : '') + t.pct + '%');
      return '<div class="rl-tl"><span class="rl-tl-n">' + label + '</span><span class="rl-tl-v">' + txt + '</span><span class="rl-tl-r">ルール ' + t.rules.map(function (n) { return '#' + n; }).join('・') + ' が効いています</span></div>';
    }

    let h = '<div class="rl-day-t">📅 ' + (dd.getMonth() + 1) + '月' + dd.getDate() + '日（' + '日月火水木金土'[dd.getDay()] + '）' + (_holName(dStr) ? '・🎌' + esc(_holName(dStr)) : '') + ' の中身</div>';
    h += line('予約枠（国産）', 'capDefault', rc.default != null ? rc.default : 5, '台');
    h += line('予約枠（輸入）', 'capImport', rc.import != null ? rc.import : 3, '台');
    h += line('置き場の通常枠', 'lotNormal', lotNormal, '台');
    h += policyLine('預かり入庫', 'drop');
    h += policyLine('当日仕上げ', 'sameDay');
    h += policyLine('代車つき預かり', 'loanerDrop');
    rs.warns.forEach(function (w) {
      h += '<div class="rl-tl warn"><span class="rl-tl-n">⚠ ' + esc(labelOf(TARGET, w.target)) + '</span><span class="rl-tl-v">' + esc(w.msg) + '</span><span class="rl-tl-r">ルール #' + w.no + '</span></div>';
    });
    out.innerHTML = h;
    pitRuleGrid();   // 選択ハイライトを更新
  };

  function _save(msg) {
    if (window.PitDB) PitDB.save(true);
    const el = document.getElementById('ps-status');
    if (el) {
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(window._rlFlashT);
      window._rlFlashT = setTimeout(function () { el.classList.remove('show'); }, 1800);
    }
  }

})();
