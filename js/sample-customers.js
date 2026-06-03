/* ========================================
   sample-customers.js  -  顧客控えのサンプル生成（開発用）／PitFlow v0.4.1
   ----------------------------------------
   ・架空の顧客（車両ごと＝1台1レコード）をまとめて生成して state.customers に投入。
   ・起動時、控えが空なら自動で 500 件投入。
   ・顧客ビューの「🎲 サンプル500件」「🗑 全削除」からも操作可。
   ・あくまで開発・動作確認用のダミー。実在しない名前・番号です。
   ======================================== */
(function () {
  const SEI = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本','井上','木村','林','清水','山崎','森','池田','橋本','阿部','石川','前田','藤田','後藤','小川','岡田','長谷川','村上','近藤','石井','斎藤','坂本','遠藤','青木','藤井','西村','福田','太田','三浦','藤原','岡本','松田','中川','中野','原田','小野','竹内','金子','和田','中山','石田','上田','森田','原','柴田','酒井'];
  const MEI = ['大輔','翔太','健太','拓也','直樹','亮','涼介','和也','智也','雄太','健一','誠','浩二','博之','茂','清','豊','隆','学','修','優子','美咲','陽子','愛','真由美','千夏','葵','結衣','明美','恵子','洋子','由美','久美子','直子','彩','麻衣','綾','里奈','沙織','京子'];
  const MAKERS = {
    'トヨタ':['アクア','プリウス','ヴィッツ','カローラ','ハリアー','ヴォクシー','ノア','アルファード','ランドクルーザー','パッソ','ルーミー','ヤリス'],
    'ホンダ':['フィット','N-BOX','フリード','ステップワゴン','ヴェゼル','オデッセイ','N-WGN','シャトル'],
    '日産':['ノート','セレナ','デイズ','エクストレイル','マーチ','ジューク','ルークス','キックス'],
    'マツダ':['デミオ','アクセラ','CX-5','アテンザ','ロードスター','CX-3','MAZDA2'],
    'スズキ':['ワゴンR','スペーシア','ハスラー','アルト','スイフト','ジムニー','ソリオ'],
    'ダイハツ':['タント','ムーヴ','ミラ','キャスト','ウェイク','ロッキー','タフト'],
    'スバル':['インプレッサ','フォレスター','レガシィ','レヴォーグ','XV'],
    '三菱':['eKワゴン','アウトランダー','デリカD:5','RVR']
  };
  const PLACES = ['品川','練馬','横浜','足立','世田谷','習志野','袖ヶ浦','千葉','野田','大宮','春日部','所沢','川口','柏'];
  const CLS = ['300','500','580','330','530','480'];
  const KANA = ['あ','い','う','え','か','き','く','け','こ','さ','す','せ','そ','た','つ','て','と','な','に','ぬ','の','は','ひ','ふ','ほ','ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','わ'];
  const STAFF = ['社長','椎名','壱谷','福光','蓮沼','箱崎','菅谷','林','高橋'];

  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const d = n => String(Math.floor(Math.random() * Math.pow(10, n))).padStart(n, '0');

  function genOne(i, usedPlate) {
    let plate;
    do { plate = rnd(PLACES) + ' ' + rnd(CLS) + ' ' + rnd(KANA) + ' ' + d(4); } while (usedPlate[plate]);
    usedPlate[plate] = 1;
    const mk = rnd(Object.keys(MAKERS));
    const car = mk + ' ' + rnd(MAKERS[mk]);
    const tel = Math.random() < 0.6
      ? '0' + rnd(['90','80','70']) + '-' + d(4) + '-' + d(4)
      : '04' + rnd(['7','3','2']) + '-' + d(3) + '-' + d(4);
    return { id: 'cu_s' + Date.now().toString(36) + i, name: rnd(SEI) + ' ' + rnd(MEI), tel, car, plate, staff: rnd(STAFF), updatedAt: Date.now() - i * 1000 };
  }

  function gen(n) {
    const out = [], usedPlate = {};
    for (let i = 0; i < n; i++) out.push(genOne(i, usedPlate));
    return out;
  }

  window.seedSampleCustomers = function (n, replace) {
    if (!Array.isArray(state.customers)) state.customers = [];
    if (replace) state.customers = [];
    state.customers = state.customers.concat(gen(n || 500));
    if (window.PitDB) PitDB.save();
    if (window.renderCustomers) renderCustomers();
    console.log('[sample-customers] 投入 ' + (n || 500) + ' 件 → 計 ' + state.customers.length);
  };
  window.clearCustomers = function () {
    if (!confirm('顧客の控えを全部削除しますか？\n（整備ソフトの台帳には影響しません）')) return;
    state.customers = [];
    if (window.PitDB) PitDB.save();
    if (window.renderCustomers) renderCustomers();
  };

  // 起動時：控えが空なら自動で 500 件
  if (Array.isArray(state.customers) && state.customers.length === 0) {
    window.seedSampleCustomers(500, false);
  }
})();
