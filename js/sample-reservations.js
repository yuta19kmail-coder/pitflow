/* ========================================
   sample-reservations.js  -  実顧客データから「直近の入庫実績っぽい」サンプル予約を作り直す（PitFlow v0.81.0）
   ----------------------------------------
   ◎ねらい：state.customers（＝今入っているリアルな顧客＋車両）を使って、
     直近の営業日ごとの「入庫／返車」台数に沿って state.cards を作り直す。
   ◎日次台数（ゆうた提供・上＝古い日 / 下＝今日）：
        入庫  返車
         6     1
        14    10
         8    12
         7     3
         2     5
         9     2
         5     2
        11    11
        12    10
         6     4
         3     2
   ◎仕様：
     ・定休日（state.settings.closedDow）は飛ばし、今日から遡って営業日に割当（最終＝今日）。
     ・返車は「すでに入庫済みの車（プール）」から古い順に割当（過去日＝実績 status:returned）。
     ・今日の入庫＝これからの予約（status:reserved）／今日の返車＝本日返車予定（status:workDone・未返車）。
     ・差し引きで残った車（まだ返ってない）＝預かり中ボードへ各フェーズに散らす（PIT配置・代車・外注・試運転・相談等も少し）。
     ・新機能（作業の併用＝コーティング追加 / 試運転 / 外注 / 金額チェーン）も混ぜる。
   ◎あくまで開発・動作確認用。名前/番号は顧客控えのものを使う。
   ======================================== */
(function () {
  // 日次の入庫ボリューム感を前後約2ヶ月の営業日に敷き詰める（サンプルは保存しないので容量を気にせず多めでOK）。
  const PAST_DAYS = 60;     // 過去（実績）約2ヶ月
  const FUTURE_DAYS = 60;   // 未来（予約）約2ヶ月

  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i];a[i]=a[j];a[j]=t; } return a; }

  const FRONT = { div1:['社長','専務','椎名'], div2:['チーフ','蓮沼','箱崎','菅谷'] };
  const MECH  = { div1:['山田','椎名','専務'], div2:['山根','蓮沼','箱崎','菅谷'] };
  const MENU  = { shaken:'車検', '12pt':'12ヶ月点検', general:'一般整備', oil:'オイル交換', bp:'板金塗装' };
  const WORK_WEIGHT = ['shaken','shaken','shaken','12pt','12pt','general','general','general','oil','oil','bp']; // 出現比
  const PHASES = ['check','estim','contact','parts','work'];   // 預かり中フロー

  const estAmt  = (wt) => (window.pitEstAmount ? pitEstAmount(wt) : 100000);
  const estHold = (wt, dt) => (window.pitEstHold ? pitEstHold(wt, dt) : 3);

  let _seq = 0;
  const nid = () => 'cs' + Date.now().toString(36) + (_seq++).toString(36);
  function rndTime(){
    const h = 9 + Math.floor(Math.random() * 9);            // 9〜17時台
    const m = rnd(['00','00','30']);
    return String(h).padStart(2,'0') + ':' + m;
  }

  // 顧客×車両のペア・プール（実データ）。足りなければ使い回し（＝同じ人の再来店＝履歴になる）
  function buildPairs(){
    const pairs = [];
    (state.customers || []).forEach(cu => {
      if (Array.isArray(cu.vehicles) && cu.vehicles.length){
        cu.vehicles.forEach(v => pairs.push({ cu, v }));
      } else {
        pairs.push({ cu, v: null });   // 旧型（車両配列なし）にも一応対応
      }
    });
    return shuffle(pairs);
  }

  function makeCard(pair, date, wt, dt, status){
    const cu = pair.cu, v = pair.v || {};
    const board = v.boardId || rnd(['default','default','import']);
    const div   = (board === 'import') ? 'div2' : 'div1';
    const front = v.frontStaff || rnd(FRONT[div]);
    const tel   = (cu.contacts && cu.contacts[0] && cu.contacts[0].tel) || '';
    const nameParts = String(cu.name || '').split(/\s+/);
    const c = {
      id: nid(), customerId: cu.id || null,
      customer: cu.name || '', kana: cu.kana || '',
      sei: nameParts[0] || '', mei: nameParts.slice(1).join(' ') || '', seiKana:'', meiKana:'',
      car: v.car || '', maker: v.maker || '', plate: v.plate || '',
      karteNo: (v.karteNo || '').trim(),                    // カルテNo（車両単位）
      lineStatus: cu.lineStatus || '', lstepId: (cu.lstepId != null ? String(cu.lstepId).trim() : ''), // LINE（人単位）
      drive: [], tel: tel, contacts: tel ? [{ tel: tel, label:'個人携帯', primary:true }] : [],
      office:'', boardId: board, division: div,
      frontStaff: front, staff: rnd(MECH[div]),
      workType: wt, workAddons: [], menu: MENU[wt] || '整備', dropType: dt,
      reserveDate: date, reserveTime: rndTime(),
      returnDate: '', returnTime: '', status: status,
      bayId: null, needLoaner: false, loanerId:'', loanerFrom:'', loanerTo:'', loanerFixed:false,
      estAmount: estAmt(wt), estHoldDays: estHold(wt, dt),
      amountQuote: null, amountOrder: null, amountFinal: null,
      testDrive: false, outsourceTo:'', outsourceNote:'', outsourceDue:'',
      urgent: false, consult: false, codeRed: false, needWash: false,
      memo:'', maint:{}, log:[], intakeTbd:false, returnTbd:false,
      completedAt:null, returnDateFinal:null,
      inspSchedule:{ mode:'manual', slots:{}, cutBefore:'' }, coverCall:{ done:false, at:'', staff:'' },
      payment:'', handover:'store', handoffMemo:'',
      phaseAt: Date.now(), workTypes: [wt],
      _sample: true,   // ★サンプル生成カード印＝カード開閉時に顧客控えへ書き戻さない（重複追加防止）
    };
    // 併用：車検/12点/一般 の一部にコーティング（3M/1Y）を追加＝バッジ2個
    if (['shaken','12pt','general'].indexOf(wt) >= 0 && Math.random() < 0.2){
      const add = rnd(['coat3m','coat1y']);
      c.workAddons = [add];
      c.workTypes = [wt, add];
    }
    return c;
  }

  window.seedSampleReservations = function (opts) {
    opts = opts || {};
    if (!Array.isArray(state.customers) || state.customers.length === 0){
      alert('先に顧客データが必要です（顧客ビューでサンプル投入 or 実データを入れてから実行してください）。');
      return;
    }
    if (!opts.silent && !confirm('今のサンプル予約（カード）を全部消して、顧客データから\n前後約2ヶ月ぶんのサンプル（過去＝実績／未来＝予約／今＝預かり中）を敷き詰めます。\n※このサンプルは保存され、リロードしても消えません。\nよろしいですか？')) return;

    const closed = Array.isArray(state.settings.closedDow) ? state.settings.closedDow : [];
    const isClosed = (d) => closed.indexOf(d.getDay()) >= 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const pairs = buildPairs();
    let pi = 0;
    const nextPair = () => { const p = pairs[pi % pairs.length]; pi++; return p; };

    // 1日の入庫台数＝平日3〜6・土日8〜14（土日多め）。定休(水)は0。
    // 月あたり概算＝(平日4日×約4.5 ＋ 土日2日×約11)×4.3週 ≒ 月170〜180台（150〜200の範囲）。
    function intakeCount(d){
      const dow = d.getDay();
      if (dow === 0 || dow === 6) return 8 + Math.floor(Math.random() * 7);   // 土日 8〜14（多め）
      return 3 + Math.floor(Math.random() * 4);                                // 平日 3〜6
    }
    // 預かり日数（営業日ベースではなく暦日・返車が定休に当たったら翌営業日へ）
    function holdDays(wt, dt){
      if (dt === 'wait') return 0;
      if (dt === 'sameDay') return (Math.random() < 0.5) ? 0 : 1;
      const base = { oil:1, '12pt':1, general:2, shaken:3, bp:6, coat3m:2, coat1y:2 }[wt] || 2;
      return base + Math.floor(Math.random() * 3);   // +0〜2
    }
    function addDaysSkipClosed(d, n){
      const x = new Date(d); x.setDate(x.getDate() + n);
      let g = 0; while (isClosed(x) && g++ < 14) x.setDate(x.getDate() + 1);
      return x;
    }

    const bays = (state.bays || []).map(b => b.id);
    const cards = [];

    for (let off = -PAST_DAYS; off <= FUTURE_DAYS; off++){
      const day = new Date(todayMs + off * 86400000);
      if (isClosed(day)) continue;
      const dStr = ymd(day);
      const n = intakeCount(day);
      for (let j = 0; j < n; j++){
        const wt = rnd(WORK_WEIGHT);
        const dt = rnd(['drop','drop','drop','sameDay','wait']);
        const c = makeCard(nextPair(), dStr, wt, dt, 'reserved');
        const retObj = addDaysSkipClosed(day, holdDays(wt, dt));
        const retStr = ymd(retObj);
        const retMs = retObj.getTime();
        const dayMs = day.getTime();

        if (dayMs > todayMs){
          // ── 未来＝これからの予約（予約 週/月ビューを埋める）──
          c.status = 'reserved'; c.returnDate = retStr; c.returnTbd = false;
        } else if (retMs < todayMs){
          // ── 過去に返車済み＝実績（確定売上）──
          c.status = 'returned'; c.returnDate = retStr; c.returnTime = rndTime();
          c.completedAt = retStr; c.returnDateFinal = retStr;
          c.amountQuote = c.amountOrder = c.amountFinal = c.estAmount;
        } else if (dayMs === todayMs){
          // ── 今日の入庫＝これから（当日ビュー/予約当日）──
          c.status = 'reserved';
          if (retStr === dStr){ c.returnDate = ''; c.returnTbd = true; }
          else { c.returnDate = retStr; }
          if (Math.random() < 0.25) c.consult = true;
        } else {
          // ── 入庫済み・まだ預かり中（reserveDate < 今日 <= returnDate）──
          c.returnDate = retStr;
          if (retMs === todayMs){
            c.status = 'workDone'; if (Math.random() < 0.5) c.needWash = true;   // 本日返車予定
          } else {
            const span = Math.max(1, Math.round((retMs - dayMs) / 86400000));
            const prog = (todayMs - dayMs) / (span * 86400000);
            const ph = prog < 0.2 ? 'check' : prog < 0.4 ? 'estim' : prog < 0.6 ? 'contact' : prog < 0.8 ? 'parts' : 'work';
            c.status = ph;
            c.phaseAt = todayMs - Math.floor(Math.random() * 2) * 86400000;
            if (ph === 'contact') c.amountQuote = c.estAmount;
            if (ph === 'parts'){ c.amountQuote = c.estAmount; c.amountOrder = c.estAmount; }
            if (bays.length && (ph === 'work' || ph === 'parts' || Math.random() < 0.4)) c.bayId = bays[cards.length % bays.length];
            if (Math.random() < 0.12) c.testDrive = true;
          }
        }

        // 代車ニーズ（drop＋車検/板金は多め）。実際の代車(loanerId)は後で重複しないよう割当。
        // 未来予約も期間（入庫日〜返車日）で代車を押さえる＝代車カレンダーが先（約1.5ヶ月先）まで埋まる。
        if (dt === 'drop' && (wt === 'shaken' || wt === 'bp' || Math.random() < 0.55)){
          c.needLoaner = true;
          c.loanerFrom = c.reserveDate;
          c.loanerTo = c.returnDate || '';   // 返車日が決まっていれば期間を確定（未確定は割当時に+数日で補完）
        }
        // ちょい足し
        if (Math.random() < 0.10) c.consult = true;
        if (Math.random() < 0.05) c.codeRed = true;
        if (Math.random() < 0.05 && c.status !== 'returned' && c.status !== 'reserved') c.urgent = true;

        cards.push(c);
      }
    }

    // 外注を数台（今の預かり中フェーズから）
    const partners = Array.isArray(state.settings.outsourcePartners) ? state.settings.outsourcePartners : [];
    if (partners.length){
      const inshop = shuffle(cards.filter(c => PHASES.indexOf(c.status) >= 0));
      inshop.slice(0, 3).forEach((c, i) => {
        c.status = 'outsource'; c.bayId = null;
        c.outsourceTo = rnd(partners);
        c.phaseAt = Date.now() - (i + 1) * 86400000;
      });
    }

    // 代車割当（代車カレンダー用）＝実際の代車(state.loaners)に重複しないよう割当＋必ず id を振る。
    const _plus = function(fromStr, n){ return ymd(new Date(new Date(fromStr).getTime() + n * 86400000)); };
    const loanerIds = (state.loaners || []).map(l => l.id);
    const busy = {};   // loanerId -> [[from,to], ...]
    const _ov = function(ranges, from, to){ return ranges.some(function(r){ return !(to < r[0] || from > r[1]); }); };
    let _laSeq = 0;
    state.loanerAssigns = [];
    cards.filter(function(c){ return c.needLoaner && c.loanerFrom; })
      .sort(function(a, b){ return a.loanerFrom < b.loanerFrom ? -1 : 1; })
      .forEach(function(c){
        const from = c.loanerFrom, to = c.loanerTo || _plus(c.loanerFrom, 5);   // 返車未定は入庫から+5日で仮押さえ
        let lid = null;
        for (let i = 0; i < loanerIds.length; i++){
          const id = loanerIds[i];
          if (!busy[id]) busy[id] = [];
          if (!_ov(busy[id], from, to)){ lid = id; busy[id].push([from, to]); break; }
        }
        if (!lid){ c.needLoaner = false; c.loanerId = ''; c.loanerFrom = ''; c.loanerTo = ''; return; }   // 空き無し＝代車なしに（重複を作らない）
        c.loanerId = lid;
        c.loanerFrom = from;
        c.loanerTo = to;   // ★カードの代車期日＝割当(カレンダー)と一致させる（リミット計算が合うように）
        state.loanerAssigns.push({ id: 'la' + Date.now().toString(36) + (_laSeq++).toString(36), loanerId: lid, cardId: c.id, fromDate: from, toDate: to });
      });

    // ★顧客控え（state.customers）には一切触れていない＝そのまま保持。
    // v0.87.1 重大バグ修正：以前は state.cards = cards（全置換）で、実カード（あなたが作った予約＝非_sample）まで
    //   消えて save で空保存され、リロードで予約が消えていた。→ 実カードは残し、サンプルだけ作り直す。
    state.cards = (state.cards || []).filter(function(c){ return !c._sample; }).concat(cards);
    // 予約番号（resNo）を採番＝カードの「耳」が出るように（通常は起動時backfillだが、ボタン生成分はここで採番）。
    if (window.pitBackfillResNo) pitBackfillResNo();
    const ok = (window.PitDB) ? PitDB.save(true) : false;
    const nReserved = cards.filter(c => c.status === 'reserved').length;
    const nReturned = cards.filter(c => c.status === 'returned').length;
    console.log('[sample-reservations] 作り直し完了：カード ' + cards.length + ' 枚（予約 ' + nReserved + ' / 実績 ' + nReturned + '）');
    // ★リロードしない＝読込時の自動処理（顧客の自動入替など）を再実行させない。現在ビューを再描画するだけ。
    if (window.showView) showView(state.currentView || 'dashboard');
    if (ok === false){
      alert('カードは作りましたが保存に失敗しました（容量オーバーの可能性）。\n台数を減らして再実行してください。');
    } else {
      alert('サンプルを作り直しました（カード ' + cards.length + ' 枚・前後約2ヶ月）。\n※このサンプルは保存され、リロードしても消えません。\n顧客控えはそのまま保持しています。');
    }
  };
})();
