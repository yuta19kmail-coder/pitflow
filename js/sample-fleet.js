/* ========================================
   sample-fleet.js  -  実規模サンプルデータ生成（開発用）／PitFlow v0.8.0
   ----------------------------------------
   ・小林モータースのリアルな規模感を再現したダミー入庫データを生成。
     - 過去実績 約150台（返車完了・過去半年に分布）
     - 現在の預かり 約20台（作業中ステータス）
     - これからの予約 約1ヶ月先まで（1日1〜3台）
     - 国産:輸入 ＝ 6:4
   ・代車予約は先行して埋まっており、最短の空きは「8月お盆明け」あたり。
   ・sample-data.js の後・db-pit.js の前に読み込み、初期データとして state を差し替える。
     （db-pit が localStorage を持っていればそちらが優先＝編集は保持される）
   ・実在しないダミー。
   ======================================== */
(function () {
  const SEI = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本','井上','木村','林','清水','山崎','森','池田','橋本','阿部','石川','前田','藤田','後藤','小川','岡田','長谷川','村上','近藤','石井','斎藤','坂本','遠藤','青木','西村','福田'];
  const KOKU_MK = ['トヨタ','ホンダ','日産','スズキ','ダイハツ','マツダ','スバル'];
  const KOKU = ['アクア','プリウス','タント','ノート','セレナ','フィット','N-BOX','ハスラー','ワゴンR','ヴォクシー','ハリアー','ジムニー','ムーヴ','スイフト','デイズ','フリード','ルーミー','スペーシア'];
  const YUNYU = ['MINI（R56）','BMW 320i','ベンツ Cクラス','アウディ A4','VW ゴルフ','プジョー 208','ボルボ V40','フィアット 500','ジープ レネゲード','ポルシェ マカン','MINI クロスオーバー','BMW X1','ベンツ A180','VW ポロ'];
  const PLACES = ['品川','練馬','横浜','足立','世田谷','習志野','袖ヶ浦','千葉','野田','大宮','春日部','所沢'];
  const CLS = ['300','500','580','330','530'];
  const KANA = ['あ','い','う','か','き','く','さ','す','せ','た','つ','て','な','に','は','ひ','ふ','ほ','ま','み','む','や','ゆ','ら','り','る'];
  const STAFF = ['社長','椎名','壱谷','福光','蓮沼','箱崎','菅谷','林','高橋'];
  const WORK = ['shaken','shaken','shaken','general','general','oil','12pt','bp','3m','used'];  // 車検多め
  const DROP = ['drop','drop','drop','wait','sameDay'];  // 基本は預かり
  const ACTIVE = ['check','estim','contact','parts','work'];

  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const ri  = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pad = n => String(n).padStart(2, '0');
  const ymdL = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  const d4 = () => String(ri(0,9999)).padStart(4,'0');
  const plate = () => rnd(PLACES) + ' ' + rnd(CLS) + ' ' + rnd(KANA) + ' ' + d4();
  const timeSlot = () => pad(ri(9,17)) + ':' + rnd(['00','30']);

  function baseCard(id, imp){
    return {
      id: 'f' + id,
      boardId: imp ? 'import' : 'default',
      customer: rnd(SEI),
      tel: '0' + rnd(['90','80','70']) + '-' + d4() + '-' + d4(),
      car: imp ? rnd(YUNYU) : (rnd(KOKU_MK) + ' ' + rnd(KOKU)),
      plate: plate(),
      workType: rnd(WORK),
      dropType: rnd(DROP),
      staff: rnd(STAFF),
      reserveTime: timeSlot(),
      needLoaner: false, needWash: Math.random() < 0.4, urgent: Math.random() < 0.06, memo: ''
    };
  }

  function gen(){
    const cards = [];
    const today = new Date(); today.setHours(0,0,0,0);
    let id = 0;
    let _ic = 0;
    const isImp = () => { _ic++; return (_ic % 5) < 2; };   // 国産:輸入 = 3:2（確実に約6:4）

    // 1) 過去実績 約150台（返車完了）
    for (let i = 0; i < 150; i++){
      id++; const imp = isImp();
      const inD = add(today, -ri(2, 175));
      const out = add(inD, ri(0, 5));
      const c = baseCard(id, imp);
      c.status = 'returned';
      c.reserveDate = ymdL(inD); c.returnDate = ymdL(out); c.completedAt = ymdL(out);
      cards.push(c);
    }

    // 2) 現在の預かり 約20台（作業中）
    for (let i = 0; i < 20; i++){
      id++; const imp = isImp();
      const inD = add(today, -ri(0, 6));
      const out = add(today, ri(0, 9));
      const c = baseCard(id, imp);
      c.status = rnd(ACTIVE);
      c.reserveDate = ymdL(inD); c.returnDate = ymdL(out);
      c.needLoaner = c.dropType === 'drop' && Math.random() < 0.6;
      cards.push(c);
    }

    // 3) これからの予約 約1ヶ月先まで（1日1〜3台）
    for (let day = 1; day <= 31; day++){
      const n = ri(1, 3);
      for (let k = 0; k < n; k++){
        id++; const imp = isImp();
        const inD = add(today, day);
        const dur = (Math.random() < 0.3) ? 0 : ri(1, 4);
        const out = add(inD, dur);
        const c = baseCard(id, imp);
        c.status = 'reserved';
        c.reserveDate = ymdL(inD); c.returnDate = ymdL(out);
        c.needLoaner = dur > 0 && Math.random() < 0.55;
        cards.push(c);
      }
    }
    return cards;
  }

  // 代車予約：先行して埋まっており、最短の空きは「8月お盆明け」あたり
  function genLoaners(){
    const today = new Date(); today.setHours(0,0,0,0);
    // 今年の8/17（お盆明け）まで、4台の代車を背中合わせで埋める
    const obon = new Date(today.getFullYear(), 7, 17);  // 8月17日
    const assigns = [];
    const loaners = (state.loaners || [{id:'L01'},{id:'L02'},{id:'L03'},{id:'L04'}]);
    loaners.forEach(function(l){
      let cur = add(today, -ri(0, 3));
      while (cur < obon){
        const len = ri(3, 10);
        const to = add(cur, len - 1);
        assigns.push({ loanerId: l.id, cardId: null, fromDate: ymdL(cur), toDate: ymdL(to) });
        cur = add(to, 1);
      }
    });
    return assigns;
  }

  // 初期データとして差し替え（db-pit が localStorage を持っていれば後で上書きされる）
  if (Array.isArray(state.cards)){
    state.cards = gen();
    state.loanerAssigns = genLoaners();
  }
})();
