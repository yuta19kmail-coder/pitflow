/* ========================================
   rules.js  -  🧩 ルール設定（ノーコード積み上げ式）／PitFlow v0.17.0
   ----------------------------------------
   ◎仕組み（2026-06-04 ゆうた発案）
     ・1つのルール ＝ いつ（条件）＋ なにを（対象）＋ どうする（動作）の3箱
     ・上から全部足し算で効く（％は合算して1回だけ掛ける）
     ・動作は「言葉」で選ぶ → 言葉→％の辞書（ruleDict）で自動計算
       増やす+20% / 減らす-20% / 気を付ける-15% / できる限り無くす-50% / 許容する+15%
       （辞書の％は設定で調整できる）／無くす＝0にする／⚠注意表示＝文言を出すだけ
     ・端数はルールの意図方向に丸める：減らす系=切り捨て・増やす系=切り上げ（必ず効く）
     ・判定には「どのルールが効いたか」を必ず理由表示する
   ◎保存：state.settings.rules / state.settings.ruleDict（PitDB経由で永続化）
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
    { id: 'increase', label: '増やす' },
    { id: 'decrease', label: '減らす' },
    { id: 'careful',  label: '気を付ける' },
    { id: 'minimize', label: 'できる限り無くす' },
    { id: 'zero',     label: '無くす（0にする）' },
    { id: 'allow',    label: '許容する' },
    { id: 'warn',     label: '⚠ 注意表示' },
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

  /* その日に効くルールをまとめる → { byTarget: {target:{pct,zero,rules[]}}, warns: [{no,msg,target}] } */
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

  /* 実効値を計算（基本値×(100+合計%)/100・減らす系は切り捨て/増やす系は切り上げ） */
  window.pitEffective = function (dateStr, target, base) {
    const rs = pitRulesFor(dateStr);
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
    const rules = _rules();
    const dict = _dict();

    let h = '';
    h += '<div class="ps-bar"><span class="ps-bar-note">変更すると<b>その場で自動保存</b>。上から<b>全部足し算</b>で効きます（％は合算して1回掛け）。</span>'
       + '<span class="ps-status" id="ps-status"></span>'
       + '<button class="vh-btn primary" onclick="pitRuleAdd()">＋ ルールを追加</button></div>';

    /* 積んであるルール */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">🧩 積んであるルール</div>';
    if (!rules.length) {
      h += '<div class="ps-hint">まだルールがありません。「＋ ルールを追加」で1つ目を積んでください。<br>例：「土曜・日曜」は「国産の予約枠」を「増やす」／「定休日の前日」は「代車つき預かり」に「⚠注意表示」。</div>';
    }
    rules.forEach(function (r, i) {
      h += _rowHtml(r, i);
    });
    h += '</div>';

    /* 言葉の辞書 */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">📖 言葉の辞書（％は調整できる）</div>';
    h += '<div class="ps-desc">「どうする」の言葉が実際に何％の増減になるか。マイナス＝減らす方向。</div>';
    h += '<div class="ps-grid">';
    Object.keys(DICT_LABEL).forEach(function (k) {
      h += '<label class="ps-lb">' + DICT_LABEL[k] + ' <input type="number" class="ps-in ps-num" id="rl-dict-' + k + '" value="' + (dict[k] != null ? dict[k] : 0) + '" min="-100" max="100" onchange="pitRuleDictApply()"><span class="ps-unit">%</span></label>';
    });
    h += '</div>';
    h += '<div class="ps-hint">※「無くす」は常に0台（％ではない）。端数は減らす系＝切り捨て・増やす系＝切り上げ（小さい数字でもルールが必ず効く）。</div>';
    h += '</div>';

    /* 試算 */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">🧪 試算 — この日はどうなる？</div>';
    h += '<div class="ps-grid" style="margin-bottom:10px">';
    h += '<label class="ps-lb">日付 <input type="date" class="ps-in" id="rl-test-date" value="' + (window._rlTestDate || _ds(new Date())) + '" onchange="pitRuleTest()"></label>';
    h += '<button class="vh-btn" onclick="pitRuleTest()">計算する</button>';
    h += '</div>';
    h += '<div id="rl-test-out" class="rl-test-out"></div>';
    h += '</div>';

    body.innerHTML = h;
    pitRuleTest();
  };

  function _sel(i, field, list, cur) {
    let s = '<select class="ps-in rl-sel" onchange="pitRuleEdit(' + i + ',\'' + field + '\',this.value)">';
    list.forEach(function (o) {
      s += '<option value="' + o.id + '"' + (o.id === cur ? ' selected' : '') + '>' + o.label + '</option>';
    });
    return s + '</select>';
  }

  function _rowHtml(r, i) {
    let h = '<div class="rl-row' + (r.on === false ? ' off' : '') + '">';
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
    renderRules();   // 条件つき入力欄（期間・文言）の出し入れがあるので再描画
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
    pitRuleTest();
  };

  /* 試算の出力 */
  window.pitRuleTest = function () {
    const out = document.getElementById('rl-test-out');
    const dEl = document.getElementById('rl-test-date');
    if (!out || !dEl || !dEl.value) return;
    const dStr = dEl.value;
    window._rlTestDate = dStr;
    const s = state.settings;
    const rc = s.reserveCap || { default: 5, import: 3 };
    const lc = s.lotCap || { pit: 4, yard: 12, parking: 8, extra: 4 };
    const lotNormal = (lc.pit || 0) + (lc.yard || 0) + (lc.parking || 0);
    const rs = pitRulesFor(dStr);

    function line(label, target, base, unit) {
      const e = pitEffective(dStr, target, base);
      let t = '<div class="rl-tl"><span class="rl-tl-n">' + label + '</span>';
      if (e.zero) {
        t += '<span class="rl-tl-v stop">停止（0' + unit + '）</span>';
      } else if (e.rules.length) {
        t += '<span class="rl-tl-v">' + base + ' → <b>' + e.value + unit + '</b>（' + (e.pct > 0 ? '+' : '') + e.pct + '%）</span>';
      } else {
        t += '<span class="rl-tl-v">' + base + unit + '（基本のまま）</span>';
      }
      if (e.rules.length) t += '<span class="rl-tl-r">ルール ' + e.rules.map(function (n) { return '#' + n; }).join('・') + ' が効いています</span>';
      return t + '</div>';
    }
    function policyLine(label, target) {
      const t = rs.byTarget[target];
      if (!t) return '';
      let txt;
      if (t.zero) txt = '受けない（0）';
      else txt = '方針 ' + (t.pct > 0 ? '+' : '') + t.pct + '%';
      return '<div class="rl-tl"><span class="rl-tl-n">' + label + '</span><span class="rl-tl-v">' + txt + '</span><span class="rl-tl-r">ルール ' + t.rules.map(function (n) { return '#' + n; }).join('・') + ' が効いています</span></div>';
    }

    let h = '';
    h += line('予約枠（国産）', 'capDefault', rc.default != null ? rc.default : 5, '台');
    h += line('予約枠（輸入）', 'capImport', rc.import != null ? rc.import : 3, '台');
    h += line('置き場の通常枠', 'lotNormal', lotNormal, '台');
    h += policyLine('預かり入庫', 'drop');
    h += policyLine('当日仕上げ', 'sameDay');
    h += policyLine('代車つき預かり', 'loanerDrop');
    rs.warns.forEach(function (w) {
      h += '<div class="rl-tl warn"><span class="rl-tl-n">⚠ ' + esc(labelOf(TARGET, w.target)) + '</span><span class="rl-tl-v">' + esc(w.msg) + '</span><span class="rl-tl-r">ルール #' + w.no + '</span></div>';
    });
    if (!h) h = '<div class="ps-hint">この日に効くルールはありません。</div>';
    out.innerHTML = h;
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
