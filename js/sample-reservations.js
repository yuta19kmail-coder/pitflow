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
    // 併用：車検/12点/一般 の一部にコーティング（3M/1Y）を追加＝バッジ2個。
    // 月あたり 5〜10台に収まるよう低確率に（入庫 約170台/月 × 対象7割 × 0.06 ≒ 月7台）。
    if (['shaken','12pt','general'].indexOf(wt) >= 0 && Math.random() < 0.06){
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

        // コーティング車（1Y/3M）が見積以降に入っていれば「コーティング受注OK」を立てる＝車販作業ビューに出る
        var _isCoatCard = Array.isArray(c.workTypes) && (c.workTypes.indexOf('coat1y') >= 0 || c.workTypes.indexOf('coat3m') >= 0);
        if (_isCoatCard && ['parts','work','workDone'].indexOf(c.status) >= 0) c.coatingOK = true;

        // 代車は別途「代車ごとのリアルなスケジュール」で生成するため、入庫カードには付けない。
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

    // ===== 代車スケジュール（リアル）：代車ごとに 基本1〜2週間ブロック＋2〜3日OFF・土日終わりは同日かぶり多め・単発少なめ =====
    // 手動貸出・緊急車両の割当はサンプル作り直しでも残す（実運用データのため）
    state.loanerAssigns = (state.loanerAssigns || []).filter(function(a){ return a && (a.manual || a.emergency); });
    let _laSeq = 0;
    const FIX_MEMO = ['同クラス希望','普段これに乗ってる','ETC必須','禁煙車で','8人乗り指定','大きめ希望','小さめ希望','ナビ付き希望','積載できる車','チャイルドシート可'];
    const SOFT_MEMO = ['ETCあれば','禁煙希望','なるべく軽','ナビ付きだと助かる','長距離で使う'];
    const dMS = function(ms){ const d = new Date(ms); d.setHours(0,0,0,0); return d; };
    const isWknd = function(d){ const w = d.getDay(); return w === 0 || w === 6; };
    function pickDur(){
      const r = Math.random();
      if (r < 0.55) return 7 + Math.floor(Math.random() * 8);   // 7〜14日（1〜2週・多め）
      if (r < 0.75) return 4 + Math.floor(Math.random() * 3);   // 4〜6日
      if (r < 0.90) return 2 + Math.floor(Math.random() * 2);   // 2〜3日
      return 1;                                                  // 単発（少なめ）
    }
    const startMs = todayMs - PAST_DAYS * 86400000;
    const endMs   = todayMs + FUTURE_DAYS * 86400000;
    const loanerCards = [];
    (state.loaners || []).filter(function(l){ return !l.retired && !l.emergency; }).forEach(function(l){
      let cur = startMs + Math.floor(Math.random() * 6) * 86400000;   // 開始を代車ごとに少しずらす
      let guard = 0;
      while (cur <= endMs && guard++ < 80){
        const dur = pickDur();
        const fromD = dMS(cur);
        let toD = dMS(cur + (dur - 1) * 86400000);
        let g = 0; while (isClosed(toD) && g++ < 7) toD = dMS(toD.getTime() + 86400000);   // 返車が定休なら翌営業日
        const fromStr = ymd(fromD), toStr = ymd(toD);
        const c = makeCard(nextPair(), fromStr, rnd(WORK_WEIGHT), 'drop', 'reserved');
        c.needLoaner = true; c.loanerId = l.id; c.loanerFrom = fromStr; c.loanerTo = toStr;
        if (Math.random() < 0.30){ c.loanerFixed = true; c.loanerOther = rnd(FIX_MEMO); }
        else if (Math.random() < 0.30){ c.loanerOther = rnd(SOFT_MEMO); }
        // 日付で状態を決める（過去＝返却済み・今またぎ＝預かり中・未来＝予約）
        if (fromD.getTime() > todayMs){ c.status = 'reserved'; c.returnDate = toStr; }
        else if (toD.getTime() < todayMs){
          c.status = 'returned'; c.returnDate = toStr; c.returnTime = rndTime(); c.completedAt = toStr; c.returnDateFinal = toStr;
          c.amountQuote = c.amountOrder = c.amountFinal = c.estAmount;
        } else {
          const span = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000));
          const prog = (todayMs - fromD.getTime()) / (span * 86400000);
          c.status = prog < 0.3 ? 'check' : prog < 0.6 ? 'contact' : prog < 0.85 ? 'parts' : 'work';
          c.returnDate = toStr; c.phaseAt = todayMs;
        }
        loanerCards.push(c);
        const asg = { id: 'la' + Date.now().toString(36) + (_laSeq++).toString(36), loanerId: l.id, cardId: c.id, fromDate: fromStr, toDate: toStr };
        if (toD.getTime() < todayMs){ asg.returned = true; asg.returnedAt = toStr; c.loanerReturned = true; }   // 過去はアーカイブ表示（カラーバー確認用）
        state.loanerAssigns.push(asg);
        // 次の開始：土日終わりは同日かぶり多め／平日終わりはたまに同日／基本は2〜3日OFF
        const r2 = Math.random();
        let nextMs;
        if (isWknd(toD) && r2 < 0.5)      nextMs = toD.getTime();                                     // 同日かぶり（土日多め）
        else if (!isWknd(toD) && r2 < 0.15) nextMs = toD.getTime();                                   // たまに同日
        else                              nextMs = toD.getTime() + (2 + Math.floor(Math.random() * 2)) * 86400000;  // 2〜3日OFF
        cur = nextMs;
      }
    });
    loanerCards.forEach(function(c){ cards.push(c); });   // 代車カードも保存カードに含める

    // ===== 車販部門の仕事＝返車待ち・サービス洗車・車検ヘッドライト磨き・その他車販依頼 を絡めて生成 =====
    const SALES_MEMO = ['窓だけ拭いてほしい','内装作業したのでそこだけ拭いて','ダッシュボード拭き上げ','ホイールだけ洗っといて','足元マットだけ清掃','フロントガラス内側の油膜取り','ナビ画面の指紋拭き','灰皿だけ掃除','トランク内かるく清掃','給油口まわり拭き'];
    const WASH_MEMO  = ['内装も軽く','水アカ落とし','鳥フン跡あり','下回りも','花粉ひどめ'];
    function nextBizFrom(ms){ let d = dMS(ms); let g = 0; do { d = dMS(d.getTime() + 86400000); } while (isClosed(d) && g++ < 14); return d; }
    const thisSunStr = (function(){ const d = new Date(today); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return ymd(d); })();
    const nextBizStr = ymd(nextBizFrom(todayMs));
    const finishCard = function(c){
      c.status = 'workDone';
      c.amountQuote = c.amountOrder = c.amountFinal = c.estAmount;
      c.coverCall = { done:true, at:(today.getMonth()+1)+'/'+today.getDate(), staff:'' };
      c.completeCallAt = ymd(today);
      const _coat = Array.isArray(c.workTypes) && (c.workTypes.indexOf('coat1y')>=0 || c.workTypes.indexOf('coat3m')>=0);
      if (_coat) c.coatingOK = true;
      if (c.workType === 'shaken' && Math.random() < 0.5) c.headlight = true;
      if (Math.random() < 0.25){ c.salesReq = true; c.salesReqMemo = rnd(SALES_MEMO); }
    };

    // (a) 返車待ち（完TEL済・returnStage='returnWait'）＝返車ビュー当日/週/月＋洗車予定に出る。返車日を散らす。
    for (let i = 0; i < 22; i++){
      const c = makeCard(nextPair(), ymd(today), rnd(WORK_WEIGHT), 'drop', 'workDone');
      finishCard(c); c.returnStage = 'returnWait';
      let retD; const r = Math.random();
      if (r < 0.32) retD = dMS(new Date(nextBizStr + 'T00:00:00').getTime());                    // 翌営業日（＝明日の洗車対象）
      else if (r < 0.68) retD = dMS(todayMs + (2 + Math.floor(Math.random() * 5)) * 86400000);    // 数日内（今週寄り）
      else retD = dMS(todayMs + (7 + Math.floor(Math.random() * 14)) * 86400000);                  // 来週以降
      let g = 0; while (isClosed(retD) && g++ < 7) retD = dMS(retD.getTime() + 86400000);
      c.returnDate = ymd(retD); c.returnDateFinal = c.returnDate; c.returnTime = rndTime();
      if (Math.random() < 0.55){ c.needWash = true; if (Math.random() < 0.45) c.washNote = rnd(WASH_MEMO); }
      if (Math.random() < 0.20) c.noThanksLine = true;
      cards.push(c);
    }
    // (b) 完TEL待ち（returnStage='callWait'・返車日未定）＝返車ビュー未定「完TEL待ち」。洗車で返車日未定にも出る。
    for (let i = 0; i < 8; i++){
      const c = makeCard(nextPair(), ymd(today), rnd(WORK_WEIGHT), 'drop', 'workDone');
      finishCard(c); c.returnStage = 'callWait'; c.returnDate = '';
      if (Math.random() < 0.6){ c.needWash = true; if (Math.random() < 0.45) c.washNote = rnd(WASH_MEMO); }
      cards.push(c);
    }
    // (c) 返車未定（完TEL済だが返車日未定・returnStage='returnWait' で returnDate無し）
    for (let i = 0; i < 5; i++){
      const c = makeCard(nextPair(), ymd(today), rnd(WORK_WEIGHT), 'drop', 'workDone');
      finishCard(c); c.returnStage = 'returnWait'; c.returnDate = ''; c.returnDateFinal = null;
      if (Math.random() < 0.5) c.needWash = true;
      cards.push(c);
    }
    // (d) 預かり中（returnStage以外）のカードにも 車販依頼・ヘッドライト磨きを少し散らす
    shuffle(cards.filter(function(c){ return !c.returnStage && PHASES.indexOf(c.status) >= 0; })).slice(0, 10).forEach(function(c){
      if (Math.random() < 0.5){ c.salesReq = true; c.salesReqMemo = rnd(SALES_MEMO); }
      if (c.workType === 'shaken' && Math.random() < 0.5) c.headlight = true;
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
