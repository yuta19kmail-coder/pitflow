/* ========================================
   sample-data.js
   モック用のサンプル入庫カード
   ======================================== */

(function(){
  const today = new Date();
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

  state.cards = [
    // 当日 入庫予定（点検待ち〜作業待ち）
    { id:'c001', reserveDate:ymd(today), reserveTime:'09:30',       returnDate:ymd(today),               status:'check',   boardId:'default', bayId:null,   customer:'オクモト',  car:'アクセラ',         plate:'品川 500 あ 1234', menu:'車検（24ヶ月点検）', workType:'shaken',  dropType:'wait',    needLoaner:false, needWash:false, staff:'椎名', memo:'',          urgent:false },
    { id:'c002', reserveDate:ymd(today), reserveTime:'09:00-10:00', returnDate:ymd(today),               status:'estim',   boardId:'default', bayId:'bay1', customer:'ナガタ',    car:'F54',              plate:'練馬 580 う 5678', menu:'一般整備',           workType:'general', dropType:'sameDay', needLoaner:false, needWash:false, staff:'壱谷', memo:'',          urgent:false },
    { id:'c003', reserveDate:ymd(today), reserveTime:'09:30-10:00', returnDate:ymd(today),               status:'check',   boardId:'default', bayId:null,   customer:'カタオカ',  car:'オッティ',         plate:'足立 300 い 9012', menu:'12点点検',           workType:'12pt',    dropType:'first',   needLoaner:false, needWash:false, staff:'椎名', memo:'初来店',     urgent:false },
    { id:'c004', reserveDate:ymd(today), reserveTime:'10:00',       returnDate:ymd(addDays(today,2)),    status:'work',    boardId:'default', bayId:'bay2', customer:'サトウ',    car:'ランエボ3',        plate:'横浜 300 え 3456', menu:'車検',               workType:'shaken',  dropType:'drop',    needLoaner:false, needWash:false, staff:'社長', memo:'',          urgent:false },
    { id:'c005', reserveDate:ymd(today), reserveTime:'10:30',       returnDate:ymd(addDays(today,3)),    status:'parts',   boardId:'default', bayId:null,   customer:'カワシマ',  car:'R56',              plate:'練馬 300 か 1111', menu:'一般 / 代車3日2号',  workType:'general', dropType:'drop',    needLoaner:true,  needWash:false, staff:'椎名', memo:'代車3日2号', urgent:false },
    { id:'c006', reserveDate:ymd(today), reserveTime:'11:00',       returnDate:ymd(today),               status:'check',   boardId:'import',  bayId:null,   customer:'ヤナギバシ',car:'インプレッサ WRX', plate:'世田谷 580 き 2222',menu:'車検',               workType:'shaken',  dropType:'drop',    needLoaner:true,  needWash:false, staff:'社長', memo:'',          urgent:false },
    { id:'c007', reserveDate:ymd(today), reserveTime:'11:00',       returnDate:ymd(addDays(today,2)),    status:'estim',   boardId:'default', bayId:null,   customer:'(株)亨子会',car:'17',               plate:'品川 580 く 3333', menu:'オイル',             workType:'oil',     dropType:'wait',    needLoaner:false, needWash:false, staff:'蓮沼', memo:'',          urgent:false },
    { id:'c008', reserveDate:ymd(today), reserveTime:'11:00',       returnDate:ymd(today),               status:'contact', boardId:'default', bayId:null,   customer:'ヒロセ',    car:'R56',              plate:'練馬 580 け 4444', menu:'車検 / 代車',        workType:'shaken',  dropType:'drop',    needLoaner:true,  needWash:false, staff:'福光', memo:'',          urgent:false },
    { id:'c009', reserveDate:ymd(today), reserveTime:'16:30',       returnDate:ymd(today),               status:'reserved',boardId:'default', bayId:null,   customer:'ミワ',      car:'TT',               plate:'横浜 300 こ 5555', menu:'一般',               workType:'general', dropType:'first',   needLoaner:false, needWash:false, staff:'箱崎', memo:'',          urgent:false },
    { id:'c010', reserveDate:ymd(today), reserveTime:'17:00',       returnDate:ymd(addDays(today,1)),    status:'reserved',boardId:'default', bayId:null,   customer:'スズキ',    car:'AZ-W',             plate:'練馬 580 さ 6666', menu:'車検 / 代車',        workType:'shaken',  dropType:'drop',    needLoaner:true,  needWash:false, staff:'椎名', memo:'レッカー17:00',urgent:false },

    // 輸入車レーンの過去〜現在
    { id:'c011', reserveDate:ymd(addDays(today,-1)), reserveTime:'13:00', returnDate:ymd(today),         status:'estim',   boardId:'import',  bayId:null,   customer:'フクラ',    car:'LS',               plate:'品川 300 さ 7777', menu:'一般',               workType:'general', dropType:'drop',    needLoaner:true,  needWash:false, staff:'壱谷', memo:'',          urgent:false },
    { id:'c012', reserveDate:ymd(addDays(today,-2)), reserveTime:'10:00', returnDate:ymd(addDays(today,1)), status:'parts', boardId:'import', bayId:null,   customer:'カワイ',    car:'インプレッサ',     plate:'横浜 580 し 8888', menu:'一般',               workType:'general', dropType:'drop',    needLoaner:true,  needWash:false, staff:'椎名', memo:'',          urgent:false },
    { id:'c013', reserveDate:ymd(addDays(today,-2)), reserveTime:'14:00', returnDate:ymd(today),         status:'contact', boardId:'import',  bayId:null,   customer:'セキ',      car:'インプレッサ WRX', plate:'品川 580 す 9999', menu:'車検',               workType:'shaken',  dropType:'drop',    needLoaner:true,  needWash:false, staff:'社長', memo:'',          urgent:false },

    // 当日 返車予定（作業完了済）
    { id:'c020', reserveDate:ymd(addDays(today,-2)), reserveTime:'10:00', returnDate:ymd(today), status:'workDone', boardId:'default', bayId:null, customer:'(角)常榮', car:'スパーダ',   plate:'練馬 580 い 1111', menu:'一般',     workType:'general', dropType:'drop', needLoaner:false, needWash:true,  staff:'壱谷', memo:'', urgent:false },
    { id:'c021', reserveDate:ymd(addDays(today,-1)), reserveTime:'14:00', returnDate:ymd(today), status:'workDone', boardId:'default', bayId:null, customer:'ヤマダ',   car:'レヴィ',     plate:'足立 580 け 2222', menu:'一般',     workType:'general', dropType:'wait', needLoaner:false, needWash:false, staff:'椎名', memo:'', urgent:false },
    { id:'c022', reserveDate:ymd(addDays(today,-3)), reserveTime:'09:30', returnDate:ymd(today), status:'workDone', boardId:'default', bayId:null, customer:'ナガッカ', car:'アクア',     plate:'横浜 300 う 3333', menu:'3M',       workType:'3m',      dropType:'drop', needLoaner:false, needWash:true,  staff:'蓮沼', memo:'10:00-12:00', urgent:false },
    { id:'c023', reserveDate:ymd(addDays(today,-5)), reserveTime:'09:00', returnDate:ymd(today), status:'workDone', boardId:'default', bayId:null, customer:'イマイネ', car:'エボ8',      plate:'品川 300 え 4444', menu:'PM 車検',  workType:'shaken',  dropType:'drop', needLoaner:true,  needWash:true,  staff:'社長', memo:'PM 9:00-10:00',urgent:false },
    { id:'c024', reserveDate:ymd(addDays(today,-4)), reserveTime:'13:00', returnDate:ymd(today), status:'workDone', boardId:'import',  bayId:null, customer:'スズイ',   car:'ジムニー',   plate:'品川 580 え 5555', menu:'B.P',      workType:'bp',      dropType:'drop', needLoaner:true,  needWash:false, staff:'社長', memo:'',     urgent:false },
    { id:'c025', reserveDate:ymd(addDays(today,-7)), reserveTime:'10:00', returnDate:ymd(today), status:'workDone', boardId:'import',  bayId:null, customer:'キムラ',   car:'iAHV',       plate:'横浜 580 う 6666', menu:'B.P',      workType:'bp',      dropType:'drop', needLoaner:true,  needWash:true,  staff:'壱谷', memo:'',     urgent:false },

    // 廃車・乗替（特殊終端）
    { id:'c030', reserveDate:ymd(addDays(today,-10)), reserveTime:'10:00', returnDate:ymd(addDays(today,-7)), status:'scrap', boardId:'default', bayId:null, customer:'池上',     car:'R55',  plate:'品川 580 こ 7777', menu:'廃車手続き', workType:'general', dropType:'drop', needLoaner:false, needWash:false, staff:'蓮沼', memo:'', urgent:false },
    { id:'c031', reserveDate:ymd(addDays(today,-8)),  reserveTime:'14:00', returnDate:ymd(addDays(today,-5)), status:'scrap', boardId:'default', bayId:null, customer:'ワクヤ',   car:'R55',  plate:'品川 580 さ 8888', menu:'乗替',       workType:'used',    dropType:'drop', needLoaner:false, needWash:false, staff:'箱崎', memo:'', urgent:false },

    // 過去の完全完了（実績ビュー用）
    { id:'c100', reserveDate:ymd(addDays(today,-2)), reserveTime:'10:00', returnDate:ymd(addDays(today,-2)), status:'returned', boardId:'default', bayId:'bay1', customer:'青木',  car:'タント',  plate:'練馬 580 き 3333', menu:'バッテリー交換',       workType:'general', dropType:'wait', needLoaner:false, needWash:false, staff:'蓮沼', memo:'', urgent:false, completedAt:ymd(addDays(today,-2)) },
    { id:'c101', reserveDate:ymd(addDays(today,-3)), reserveTime:'14:00', returnDate:ymd(addDays(today,-3)), status:'returned', boardId:'default', bayId:null,   customer:'森下',  car:'ハリアー',plate:'品川 300 く 4444', menu:'ブレーキパッド交換', workType:'general', dropType:'drop', needLoaner:false, needWash:false, staff:'椎名', memo:'返車待ち', urgent:false, completedAt:ymd(addDays(today,-3)) },
  ];

  state.loanerAssigns = [
    { loanerId:'L01', cardId:'c005', fromDate:ymd(today),               toDate:ymd(addDays(today,3)) },
    { loanerId:'L02', cardId:'c006', fromDate:ymd(today),               toDate:ymd(today) },
    { loanerId:'L03', cardId:'c008', fromDate:ymd(today),               toDate:ymd(today) },
    { loanerId:'L04', cardId:'c012', fromDate:ymd(addDays(today,-2)),   toDate:ymd(addDays(today,1)) },
  ];
})();
