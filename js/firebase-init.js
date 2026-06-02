/* ========================================
   firebase-init.js  -  Firebase 初期化（PitFlow v0.1.0〜）
   ----------------------------------------
   CarFlow / StockFlow と同じ Firebase プロジェクト(carflow-9d500)に
   「相乗り」する前提の足場。
   ・PitFlow のデータは PitFlow 専用コレクション(pit_*)に保存し、
     CarFlow / StockFlow 本体のデータには一切触れない。
   ・★現状はサンプルログイン＋ローカル保存で動作するため、
     ここでは Firebase アプリの初期化だけ行い、認証・読み書きはまだしない。
     本物の Google ログインを足したターンで db-pit.js の connectCloud() を有効化する。
   ======================================== */
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyBmhI5SzkmPvZUiuTn_ttCZ4tUikKv_iHI",
    // ↓本物ログイン導入時に pitflow 用サブドメインへ変更（CarFlow/StockFlow と同方式）
    authDomain: "carflow-9d500.firebaseapp.com",
    projectId: "carflow-9d500",
    storageBucket: "carflow-9d500.firebasestorage.app",
    messagingSenderId: "235121541987",
    appId: "1:235121541987:web:8f96dfadc23fe1de7f4956"
  };

  // SDK 未読込でもモック自体は動くように、ここで止めない
  if (typeof firebase === 'undefined') {
    console.warn('[firebase-init] Firebase SDK 未読込（ローカルサンプルモードで継続）');
    window.fb = { ready:false, config:firebaseConfig };
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  window.fb = {
    ready: true,
    app: firebase.app(),
    auth: firebase.auth(),
    db: firebase.firestore(),
    config: firebaseConfig,
    serverTimestamp: function () { return firebase.firestore.FieldValue.serverTimestamp(); },
    FieldValue: firebase.firestore.FieldValue,
    currentUser: null,
    currentCompanyId: 'kobayashi_motors',
  };

  console.log('[firebase-init] OK', firebaseConfig.projectId, '（認証は後日・現状ローカルサンプル）');
})();
