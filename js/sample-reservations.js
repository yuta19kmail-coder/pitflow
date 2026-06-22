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
  // 日次の入庫ボリューム感（ゆうた提供の実数：平日3〜8・土日8〜13くらい）を、前後約2ヶ月の営業日に敷き詰める。
  const PAST_DAYS = 56;     // 過去（実績）約2ヶ月
  const FUTURE_DAYS = 56;   // 未来（予約）約2ヶ月

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
    if (!opts.silent && !confirm('今のサンプル予約（カード）を全部消して、顧客データから\n前後約2ヶ月ぶんのサンプル（過去＝実績／未来＝予約／今＝預かり中）を敷き詰めます。\nよろしいですか？')) return;

    const closed = Array.isArray(state.settings.closedDow) ? state.settings.closedDow : [];
    const isClosed = (d) => closed.indexOf(d.getDay()) >= 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const pairs = buildPairs();
    let pi = 0;
    const nextPair = () => { const p = pairs[pi % pairs.length]; pi++; return p; };

    // 1日の入庫台数＝平日3〜8・土日8〜13（定休は0＝そもそも作らない）
    function intakeCount(d){
      const dow = d.getDay();
      if (dow === 0 || dow === 6) return 8 + Math.floor(Math.random() * 6);   // 土日 8〜13
      return 3 + Math.floor(Math.random() * 6);                                // 平日 3〜8
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

        // 代車（drop＋車検/板金は多め）。返車済みは返却日まで
        if (dt === 'drop' && (wt === 'shaken' || wt === 'bp' || Math.random() < 0.4)){
          c.needLoaner = true;
          c.loanerId = 'L' + String((cards.length % 14) + 1).padStart(2, '0');
          c.loanerFrom = c.reserveDate;
          c.loanerTo = (c.status === 'returned') ? c.returnDate : '';
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

    // 代車割当（代車カレンダー用）
    const plus7 = ymd(new Date(Date.now() + 7 * 86400000));
    state.loanerAssigns = cards
      .filter(c => c.loanerId && c.loanerFrom)
      .map(c => ({ loanerId: c.loanerId, cardId: c.id, fromDate: c.loanerFrom, toDate: c.loanerTo || plus7 }));

    state.cards = cards;
    if (window.PitDB) PitDB.save(true);
    const nReserved = cards.filter(c => c.status === 'reserved').length;
    const nReturned = cards.filter(c => c.status === 'returned').length;
    console.log('[sample-reservations] 作り直し完了：カード ' + cards.length + ' 枚（予約 ' + nReserved + ' / 実績 ' + nReturned + '）');
    alert('サンプルを作り直しました（カード ' + cards.length + ' 枚・前後約2ヶ月）。画面を更新します。');
    location.reload();
  };
})();
