/* ========================================
   settings.js  -  設定画面（PitFlow v0.14.0）
   ----------------------------------------
   ◎ここで変えられるもの（すべてこの端末のブラウザ内に保存＝リロードしても残る）
     ・1日の予約上限（国産／輸入）　…… ダッシュボード「予約の埋まり」の基準
     ・置ける台数（lotCapacity）　 …… 混雑度ゲージ・2週間バー・最短入庫の基準
     ・最短入庫の預かり想定日数（holdDaysDefault）
     ・概算預かり日数の初期値（作業タイプ別＝estHold表）…… 新規予約時の「予想」軸の初期値
     ・営業時間（受付開始・受付終了）・定休曜日（※将来はMHS会社カレンダーから取得予定）
   ◎保存は「変更した瞬間」に自動（PitDB.save 経由）。✓表示で知らせる。
   ======================================== */

(function () {

  const DOW = ['日', '月', '火', '水', '木', '金', '土'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function numIn(id, val, min, max) {
    return '<input type="number" class="ps-in ps-num" id="' + id + '" value="' + val + '"'
      + ' min="' + min + '" max="' + max + '" onchange="pitSettingsApply()">';
  }

  function floatIn(id, val, min, max) {
    return '<input type="number" class="ps-in ps-num" id="' + id + '" value="' + val + '"'
      + ' min="' + min + '" max="' + max + '" step="0.1" onchange="pitSettingsApply()">';
  }

  function manStr(yen) { // 円 → 万円表記（小数1桁・末尾の.0は省く）
    const v = Math.round(yen / 1000) / 10;
    return (v % 1 === 0) ? String(v) : v.toFixed(1);
  }

  window.renderSettings = function () {
    const body = document.getElementById('view-settings-body');
    if (!body) return;
    const s = state.settings || {};
    const rc = s.reserveCap || { default: 5, import: 3 };
    const est = s.estHold || {};

    let h = '';

    h += '<div class="ps-bar"><span class="ps-bar-note">変更すると<b>その場で自動保存</b>されます（この端末のブラウザ内）。</span>'
       + '<span class="ps-status" id="ps-status"></span>'
       + '<button class="vh-btn" onclick="pitSettingsReset()">↩ 初期値に戻す</button></div>';

    /* ===== 入庫まわりは🧩ルールページへ集約（2026-06-04 ゆうた指示） ===== */
    h += '<div class="ps-card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">';
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.7;flex:1;min-width:240px">📥 <b>入庫に関する設定（予約枠・売上目標・平均単価・曜日ルールなど）は「🧩 ルール」ページに集約</b>しました。入庫のアルゴリズムはすべてそちらで調整します。</div>';
    h += '<button class="vh-btn primary" onclick="showView(\'rules\')">🧩 ルールページを開く</button>';
    h += '</div>';

    /* ===== 置き場 ===== */
    const lc = s.lotCap || { pit: 4, yard: 12, parking: 8, extra: 4 };
    const lcSum = (lc.pit||0) + (lc.yard||0) + (lc.parking||0) + (lc.extra||0);
    h += '<div class="ps-card">';
    h += '<div class="ps-h">🅿️ 置き場（混雑度の基準）</div>';
    h += '<div class="ps-desc">同時に預かれる台数を<b>場所ごとに分けて</b>持ちます。混雑度ゲージ・2週間バー・最短入庫は<b>4つの合計</b>で計算。「緊急＋α」は最悪ここまで使える、の上乗せ分。</div>';
    h += '<div class="ps-grid">';
    h += '<label class="ps-lb">🔧 ピット内 ' + numIn('ps-lot-pit', lc.pit != null ? lc.pit : 4, 0, 99) + '<span class="ps-unit">台</span></label>';
    h += '<label class="ps-lb">🏠 自社敷地 ' + numIn('ps-lot-yard', lc.yard != null ? lc.yard : 12, 0, 99) + '<span class="ps-unit">台</span></label>';
    h += '<label class="ps-lb">🅿️ 駐車場 ' + numIn('ps-lot-park', lc.parking != null ? lc.parking : 8, 0, 99) + '<span class="ps-unit">台</span></label>';
    h += '<label class="ps-lb">🚨 緊急＋α ' + numIn('ps-lot-extra', lc.extra != null ? lc.extra : 4, 0, 99) + '<span class="ps-unit">台</span></label>';
    h += '<span class="ps-lb">＝ 合計 <b id="ps-lot-sum" style="font-size:17px">' + lcSum + '</b><span class="ps-unit">台</span></span>';
    h += '</div>';
    h += '<div class="ps-grid" style="margin-top:12px">';
    h += '<label class="ps-lb">最短入庫の預かり想定 ' + numIn('ps-hold', s.holdDaysDefault != null ? s.holdDaysDefault : 3, 1, 60) + '<span class="ps-unit">日</span></label>';
    h += '</div>';
    h += '<div class="ps-hint">※「最短で入庫できる日」は、この想定日数ぶん預かっても置き場（合計）が溢れない最初の日を探します。</div>';
    const ov = s.lotOver || { warn: 5, danger: 10 };
    h += '<div class="ps-grid" style="margin-top:12px">';
    h += '<span class="ps-lb" style="font-weight:700">空き数字の色分け</span>';
    h += '<label class="ps-lb">🟠 超過がここまでオレンジ ' + numIn('ps-over-warn', ov.warn != null ? ov.warn : 5, 0, 98) + '<span class="ps-unit">台</span></label>';
    h += '<label class="ps-lb">🔴 ここからは赤 ' + numIn('ps-over-danger', ov.danger != null ? ov.danger : 10, 1, 99) + '<span class="ps-unit">台 以上</span></label>';
    h += '</div>';
    h += '<div class="ps-hint">※ 空き0台まではずっと<b style="color:#1db97a">緑</b>。ちょい超過は緊急＋α・コインパで吸収できる「普通」なので、赤を安売りして受付が萎縮しないように（間の台数は濃いオレンジ）。</div>';
    h += '</div>';

    /* ===== 🏭 PIT配置図（工場の簡易平面図エディタ・v0.46.0） ===== */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">🏭 PIT配置図（工場の簡易レイアウト）</div>';
    h += '<div class="ps-desc">PIT枠を置いて工場の<b>簡易的な平面図</b>を作ります。ここで作った図に、作業中の車（カード）をはめていきます（次の段で「Pitリスト」「Pit配置」に表示）。枠＝ドラッグで移動・右下角で大きさ変更・クリックで名前や課を編集。壁や通路の線も引けます。</div>';
    h += '<div id="pf-editor-mount"></div>';
    h += '</div>';

    /* ===== 作業タイプ（増減できる・v0.27.0） ===== */
    h += '<div class="ps-card">';
    h += '<div class="ps-h" style="display:flex;align-items:center;gap:10px">🔧 作業タイプ（メニュー）<button class="vh-btn" style="margin-left:auto" onclick="pitWtAdd()">＋ タイプを追加</button></div>';
    h += '<div class="ps-desc">入庫カードの「作業タイプ」に出る選択肢。名前・色を変更でき、追加・削除も可能（削除しても過去カードのデータは消えません）。</div>';
    (state.workTypes || []).forEach(function (w, i) {
      h += '<div class="ps-wt-row">'
         + '<input type="color" class="ps-wt-color" value="' + esc(w.color || '#64748b') + '" onchange="pitWtEdit(' + i + ',\'color\',this.value)">'
         + '<input type="text" class="ps-in" style="width:170px" value="' + esc(w.label) + '" onchange="pitWtEdit(' + i + ',\'label\',this.value)">'
         + '<button class="rl-del" title="削除" onclick="pitWtDel(' + i + ')">🗑</button>'
         + '</div>';
    });
    h += '</div>';

    /* ===== 概算預かり日数の初期値 ===== */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">⏳ 概算預かり日数の初期値（作業タイプ別）</div>';
    h += '<div class="ps-desc">作業タイプを選んだ時にカードへ自動で入る「だいたい何日預かるか」。未来の混雑の<b>予想（不確定）</b>軸に使われます。カードごとに後から手で直せます。</div>';
    h += '<div class="ps-est-grid">';
    (state.workTypes || []).forEach(function (w) {
      h += '<label class="ps-est-item"><span class="ps-est-tag" style="background:' + w.color + '"></span>'
         + '<span class="ps-est-name">' + esc(w.label) + '</span>'
         + numIn('ps-est-' + w.id, est[w.id] != null ? est[w.id] : (est._default != null ? est._default : 5), 0, 60)
         + '<span class="ps-unit">日</span></label>';
    });
    h += '<label class="ps-est-item"><span class="ps-est-tag" style="background:#64748b"></span>'
       + '<span class="ps-est-name">その他（表にないタイプ）</span>'
       + numIn('ps-est-default', est._default != null ? est._default : 5, 0, 60)
       + '<span class="ps-unit">日</span></label>';
    h += '</div>';
    h += '<div class="ps-hint">※ 受付タイプが「待ち」「当日返車」のときは、この表に関係なく <b>0日（置き場を使わない）</b>になります。</div>';
    h += '</div>';

    /* ===== 概算金額の初期値（v0.27.0） ===== */
    const eam = s.estAmount || {};
    h += '<div class="ps-card">';
    h += '<div class="ps-h">💴 概算金額の初期値（作業タイプ別・平均単価）</div>';
    h += '<div class="ps-desc">作業タイプを選んだ時にカードの「概算金額」へ自動で入る平均単価。将来のクォーター集計（抱え高）とAI判定の材料になります。</div>';
    h += '<div class="ps-est-grid">';
    (state.workTypes || []).forEach(function (w) {
      h += '<label class="ps-est-item"><span class="ps-est-tag" style="background:' + w.color + '"></span>'
         + '<span class="ps-est-name">' + esc(w.label) + '</span>'
         + numIn('ps-eam-' + w.id, eam[w.id] != null ? eam[w.id] : (eam._default != null ? eam._default : 100000), 0, 9999999)
         + '<span class="ps-unit">円</span></label>';
    });
    h += '<label class="ps-est-item"><span class="ps-est-tag" style="background:#64748b"></span>'
       + '<span class="ps-est-name">その他（表にないタイプ）</span>'
       + numIn('ps-eam-default', eam._default != null ? eam._default : 100000, 0, 9999999)
       + '<span class="ps-unit">円</span></label>';
    h += '</div>';
    h += '<div class="ps-hint">※ 初期値は売上表の実績（車検12.9万・12点5.6万・一般9.4万）＋仮置き。実態に合わせて調整してください。</div>';
    h += '</div>';

    /* ===== 営業時間・定休 ===== */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">🕐 営業時間・定休</div>';
    h += '<div class="ps-grid">';
    h += '<label class="ps-lb">営業開始（この時刻から受付） <input type="time" class="ps-in" id="ps-open" value="' + esc(s.openTime || '09:00') + '" onchange="pitSettingsApply()"></label>';
    h += '<label class="ps-lb">営業終了（この時刻で受付締切） <input type="time" class="ps-in" id="ps-cutoff" value="' + esc(s.cutoffTime || '17:00') + '" onchange="pitSettingsApply()"></label>';
    h += '</div>';
    h += '<div class="ps-hint">※ ここは<b>時刻</b>の設定。日単位の「受付できる/できない（○△×）」は 🧩入庫ルール ページとダッシュボードの判定が担当。</div>';
    h += '<div class="ps-dow-row"><span class="ps-dow-t">定休曜日</span>';
    DOW.forEach(function (d, i) {
      const on = (s.closedDow || []).indexOf(i) >= 0;
      h += '<label class="ps-dow' + (on ? ' on' : '') + '"><input type="checkbox" id="ps-dow-' + i + '"' + (on ? ' checked' : '') + ' onchange="pitSettingsApply()">' + d + '</label>';
    });
    h += '</div>';
    h += '<div class="ps-hint">※ 定休曜日は<b>仮の設定</b>です。将来は MHS（会社カレンダー＝全社の基準マスター）から自動で取得する予定。祝日は現在「表示のみ」（営業日判定には使っていません）。</div>';
    h += '</div>';

    body.innerHTML = h;

    // PIT配置図エディタをマウント（自己管理ウィジェット＝設定の再描画では作り直さない）
    if (window.PitFloorEditor) PitFloorEditor.mount('pf-editor-mount');
  };

  /* 画面の入力をすべて読み取って state.settings に反映 → 保存 */
  window.pitSettingsApply = function () {
    const s = state.settings;

    function readNum(id, fallback, min, max) {
      const el = document.getElementById(id);
      if (!el) return fallback;
      let v = parseInt(el.value, 10);
      if (isNaN(v)) v = fallback;
      if (v < min) v = min;
      if (v > max) v = max;
      el.value = v;   // 補正後の値を画面にも戻す
      return v;
    }

    /* ※ 予約枠・売上目標・平均単価は🧩ルールページ（rules.js）で保存する */

    s.lotCap = {
      pit:     readNum('ps-lot-pit', 4, 0, 99),
      yard:    readNum('ps-lot-yard', 12, 0, 99),
      parking: readNum('ps-lot-park', 8, 0, 99),
      extra:   readNum('ps-lot-extra', 4, 0, 99),
    };
    s.lotCapacity = Math.max(1, s.lotCap.pit + s.lotCap.yard + s.lotCap.parking + s.lotCap.extra);
    const sumEl = document.getElementById('ps-lot-sum');
    if (sumEl) sumEl.textContent = s.lotCapacity;
    s.holdDaysDefault = readNum('ps-hold', 3, 1, 60);

    const ovWarn = readNum('ps-over-warn', 5, 0, 98);
    let ovDanger = readNum('ps-over-danger', 10, 1, 99);
    if (ovDanger <= ovWarn) {   // 赤がオレンジ以下だと矛盾するので自動補正
      ovDanger = ovWarn + 1;
      const el = document.getElementById('ps-over-danger');
      if (el) el.value = ovDanger;
    }
    s.lotOver = { warn: ovWarn, danger: ovDanger };

    const est = {};
    (state.workTypes || []).forEach(function (w) {
      est[w.id] = readNum('ps-est-' + w.id, 5, 0, 60);
    });
    est._default = readNum('ps-est-default', 5, 0, 60);
    s.estHold = est;

    const eam = {};
    (state.workTypes || []).forEach(function (w) {
      eam[w.id] = readNum('ps-eam-' + w.id, 100000, 0, 9999999);
    });
    eam._default = readNum('ps-eam-default', 100000, 0, 9999999);
    s.estAmount = eam;

    const openEl = document.getElementById('ps-open');
    const cutEl  = document.getElementById('ps-cutoff');
    if (openEl && openEl.value) s.openTime  = openEl.value;
    if (cutEl  && cutEl.value)  s.cutoffTime = cutEl.value;

    const dows = [];
    for (let i = 0; i < 7; i++) {
      const el = document.getElementById('ps-dow-' + i);
      if (el && el.checked) dows.push(i);
      const lb = el && el.closest('.ps-dow');
      if (lb) lb.classList.toggle('on', !!(el && el.checked));
    }
    s.closedDow = dows;

    if (window.PitDB) PitDB.save(true);
    pitSettingsFlash('✓ 保存しました');
  };

  /* ===== 🔧 作業タイプの増減（v0.27.0）＝state.workTypes を編集し settings.workTypes に保存 ===== */
  function _wtSave() {
    state.settings.workTypes = state.workTypes;
    if (window.PitDB) PitDB.save(true);
    renderSettings();   // 日数・金額の表も追従
    pitSettingsFlash('✓ 保存しました');
  }
  window.pitWtAdd = function () {
    state.workTypes.push({ id: 'w' + Date.now(), label: '新タイプ', color: '#64748b' });
    _wtSave();
  };
  window.pitWtEdit = function (i, field, val) {
    const w = state.workTypes[i];
    if (!w) return;
    if (field === 'label' && !String(val).trim()) return;
    w[field] = val;
    _wtSave();
  };
  window.pitWtDel = function (i) {
    const w = state.workTypes[i];
    if (!w) return;
    if (!confirm('作業タイプ「' + w.label + '」を削除しますか？\n（過去のカードのデータは消えません。選択肢から消えるだけです）')) return;
    state.workTypes.splice(i, 1);
    _wtSave();
  };

  /* 初期値に戻す（このページの項目だけ。🧩ルールページの内容＝ルール・辞書・予約枠・目標・単価は保持） */
  window.pitSettingsReset = function () {
    if (!confirm('設定を初期値に戻します。よろしいですか？\n（予約・カードのデータと、🧩ルールページの内容は消えません）')) return;
    const keep = {
      rules:      state.settings.rules,
      ruleDict:   state.settings.ruleDict,
      reserveCap: state.settings.reserveCap,
      target:     state.settings.target,
      unitPrice:  state.settings.unitPrice,
    };
    state.settings = JSON.parse(JSON.stringify(window.PIT_DEFAULT_SETTINGS || state.settings));
    Object.keys(keep).forEach(function (k) { if (keep[k] != null) state.settings[k] = keep[k]; });
    if (window.PitDB) PitDB.save(true);
    renderSettings();
    pitSettingsFlash('↩ 初期値に戻しました');
  };

  let _flashT = null;
  function pitSettingsFlash(msg) {
    const el = document.getElementById('ps-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_flashT);
    _flashT = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

})();
