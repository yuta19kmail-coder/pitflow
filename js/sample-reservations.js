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
  const DAILY = [[6,1],[14,10],[8,12],[7,3],[2,5],[9,2],[5,2],[11,11],[12,10],[6,4],[3,2]]; // 古→新（最後＝今日）

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
    if (!opts.silent && !confirm('今のサンプル予約（カード）を全部消して、顧客データから新しいサンプルを作り直します。\nよろしいですか？')) return;

    // 営業日（定休を飛ばす）で今日から遡ってN日分。dates[0]=最古 / 末尾=今日
    const closed = Array.isArray(state.settings.closedDow) ? state.settings.closedDow : [];
    const N = DAILY.length;
    const dates = [];
    let cur = new Date(); cur.setHours(0,0,0,0);
    let guard = 0;
    while (dates.length < N && guard++ < 400){
      if (closed.indexOf(cur.getDay()) < 0) dates.unshift(ymd(new Date(cur)));
      cur.setDate(cur.getDate() - 1);
    }

    const pairs = buildPairs();
    let pi = 0;
    const nextPair = () => { const p = pairs[pi % pairs.length]; pi++; return p; };

    const cards = [];
    const pool = [];   // 入庫済み・未返車（＝預かり中の候補）

    for (let i = 0; i < N; i++){
      const date = dates[i];
      const nin = DAILY[i][0], nout = DAILY[i][1];
      const isToday = (i === N - 1);

      // ── 入庫 ──
      for (let j = 0; j < nin; j++){
        const wt = rnd(WORK_WEIGHT);
        if (isToday){
          // 今日これから入庫＝予約（当日ビュー/予約当日に出る）
          const dt = rnd(['wait','wait','sameDay','drop']);
          const c = makeCard(nextPair(), date, wt, dt, 'reserved');
          c.returnTbd = true;
          if (Math.random() < 0.25) c.consult = true;
          cards.push(c);
        } else {
          const dt = rnd(['drop','drop','drop','sameDay','wait']);
          const c = makeCard(nextPair(), date, wt, dt, 'check');   // 仮フェーズ。残ればあとで散らす
          c.phaseAt = new Date(date + 'T09:00:00').getTime();
          cards.push(c); pool.push(c);
        }
      }

      // ── 返車 ── プールの古い順から
      for (let k = 0; k < nout; k++){
        if (!pool.length) break;
        const c = pool.shift();
        c.returnDate = date;
        c.returnTime = rndTime();
        if (isToday){
          // 本日返車予定＝まだ返してない（作業完了・洗車待ち）
          c.status = 'workDone';
          if (Math.random() < 0.5) c.needWash = true;
        } else {
          // 過去＝実績（確定売上を固める）
          c.status = 'returned';
          c.completedAt = date;
          c.amountQuote = c.estAmount;
          c.amountOrder = c.estAmount;
          c.amountFinal = c.estAmount;
          c.returnDateFinal = date;
        }
      }
    }

    // ── 残り（まだ返ってない）＝預かり中ボードへ散らす ──
    const bays = (state.bays || []).map(b => b.id);
    const partners = Array.isArray(state.settings.outsourcePartners) ? state.settings.outsourcePartners : [];
    pool.forEach((c, idx) => {
      const ph = PHASES[idx % PHASES.length];
      c.status = ph;
      c.returnTbd = true; c.returnDate = '';
      // 経過日数（このフェーズ何日目）がそれっぽく出るよう散らす
      c.phaseAt = Date.now() - (1 + (idx % 6)) * 86400000;
      // 作業系はPIT枠を割当
      if (bays.length && (ph === 'work' || ph === 'parts' || idx % 3 === 0)){
        c.bayId = bays[idx % bays.length];
      }
      // 半分くらい代車
      if (Math.random() < 0.5){
        c.needLoaner = true;
        c.loanerId = 'L' + String((idx % 14) + 1).padStart(2, '0');
        c.loanerFrom = c.reserveDate; c.loanerTo = '';
      }
      // ちょい足し：相談 / マルエフ / 緊急 / 試運転
      if (Math.random() < 0.15) c.consult = true;
      if (Math.random() < 0.08) c.codeRed = true;
      if (Math.random() < 0.10) c.urgent = true;
      if (Math.random() < 0.12) c.testDrive = true;
      // 金額チェーンの途中（連絡中＝見積もり済 / パーツ待ち＝受注済）
      if (ph === 'contact') c.amountQuote = c.estAmount;
      if (ph === 'parts'){ c.amountQuote = c.estAmount; c.amountOrder = c.estAmount; }
    });
    // 外注を1〜2台（プール末尾から）
    if (partners.length){
      pool.slice(-2).forEach((c, i) => {
        c.status = 'outsource'; c.bayId = null; c.needLoaner = c.needLoaner;
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
    console.log('[sample-reservations] 作り直し完了：カード ' + cards.length + ' 枚（入庫合計 '
      + DAILY.reduce((s,d)=>s+d[0],0) + ' / 返車合計 ' + DAILY.reduce((s,d)=>s+d[1],0) + '）');
    alert('サンプル予約を作り直しました（カード ' + cards.length + ' 枚）。画面を更新します。');
    location.reload();
  };
})();
