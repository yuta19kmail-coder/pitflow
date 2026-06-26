/* ========================================
   db-pit.js  -  PitFlow データ層（v0.1.0）
   ----------------------------------------
   ◎いまの動作（サンプルログイン段階）
     ・データはブラウザ内(localStorage)に永続化する。
       → 画面で編集した内容がリロードしても残る＝「しっかり開発できる」状態。
     ・起動時：保存済みがあればそれを採用。無ければ sample-data.js の内容を初期保存。
     ・「サンプルに戻す」でいつでも初期状態へリセットできる。

   ◎将来（本物の Google ログイン導入時）
     ・connectCloud(user) を有効化すると、carflow-9d500 の Firestore に
       PitFlow 専用コレクション(pit_cards / pit_loanerAssigns)で相乗り保存に切替。
     ・CarFlow / StockFlow のデータには一切触れない（コレクション名が別）。

   保存キー：localStorage 'pitflow_data_v1'
   ======================================== */
(function () {
  const LS_KEY = 'pitflow_data_v11';   // v11: サンプル全面刷新（現行スキーマ＋付箋サンプル）で再シード

  const PitDB = {
    mode: 'local',      // 'local' | 'cloud'
    ready: false,
    _t: null,

    /* 起動：localStorage 優先で state を上書き。無ければサンプルを初期保存 */
    init: function () {
      // state.js の既定（＝自社レイアウト）を退避。古いサンプル端末の移行に使う。
      const DEF_BAYS = state.bays, DEF_FP = state.floorPlan;
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && Array.isArray(d.cards)) {
            state.cards = d.cards;
            if (Array.isArray(d.loanerAssigns)) state.loanerAssigns = d.loanerAssigns;
            if (Array.isArray(d.loaners))       state.loaners       = d.loaners;
            if (Array.isArray(d.customers))     state.customers     = d.customers;
            if (Array.isArray(d.companyCars))   state.companyCars   = d.companyCars;
            if (Array.isArray(d.fleetEvents))   state.fleetEvents   = d.fleetEvents;
            // ★PIT配置図：旧サンプル（PIT1〜4の初期4枠）のままの端末は、自社レイアウト既定へ自動移行。
            //   ゆうたが自分で配置を作った端末（枠IDが bay1〜4 以外）は一切触らない。
            const oldSample = Array.isArray(d.bays) && d.bays.length > 0 && d.bays.length <= 4 &&
              d.bays.every(function (b) { return /^bay[1-4]$/.test(b.id || ''); });
            let migrated = false;
            if (oldSample) {
              state.bays = DEF_BAYS; state.floorPlan = DEF_FP; migrated = true;   // 自社配置へ差し替え
            } else {
              if (Array.isArray(d.bays))          state.bays          = d.bays;          // v0.46.0：PIT配置図の枠
              if (d.floorPlan && typeof d.floorPlan === 'object') state.floorPlan = d.floorPlan; // v0.46.0：壁・建物・ドア
            }
            if (d.aiVerdicts && typeof d.aiVerdicts === 'object') state.aiVerdicts = d.aiVerdicts;
            if (Array.isArray(d.boardNotes)) state.boardNotes = d.boardNotes;            // v0.63.0：付箋ボード
            if (d.boardLabels && typeof d.boardLabels === 'object') state.boardLabels = d.boardLabels; // v0.63.0：色ラベル
            this._mergeSettings(d.settings);
            // 作業タイプは設定で増減できる＝保存があれば実行リストを上書き
            if (Array.isArray(state.settings.workTypes) && state.settings.workTypes.length) {
              state.workTypes = state.settings.workTypes;
              // 併用可フラグの初回補完：1Y/3M（コーティング）で未設定なら true（ユーザーが切り替えた値は尊重）
              state.workTypes.forEach(function (w) {
                if (w && (w.id === 'coat1y' || w.id === 'coat3m') && w.combinable === undefined) {
                  w.combinable = true; migrated = true;
                }
              });
              if (migrated) state.settings.workTypes = state.workTypes;
            }
            // 外注先：未設定 or 旧プレースホルダなら実名リストへ自動移行（v0.79.1）
            var OS_DEF = ['畑中板金','藤島板金','カーメイク','ブレス','タイヤマン','カーフラッシュ','野村自動車','各ディーラー','その他'];
            var OS_OLD = ['提携工場A','提携工場B','ガラス専門店'];
            var osCur = state.settings.outsourcePartners;
            if (!Array.isArray(osCur) || osCur.length === 0 || JSON.stringify(osCur) === JSON.stringify(OS_OLD)) {
              state.settings.outsourcePartners = OS_DEF.slice();
              migrated = true;
            }
            console.log('[PitDB] 保存データを読み込みました（' + d.cards.length + '件）'
              + (migrated ? '／PIT配置図を自社レイアウト既定へ移行しました' : ''));
            if (migrated) this.save(true);   // 移行結果を保存（次回以降は移行不要）
          }
        } else {
          this.save(true);   // 初回：サンプルを初期データとして保存
          console.log('[PitDB] サンプルを初期データとして保存しました');
        }
      } catch (e) {
        console.warn('[PitDB] 読み込み失敗。サンプルで継続します', e);
      }
      // 🔢 予約番号（resNo）が無いカードに採番（旧データ救済・1回で全部に付く）
      try { if (window.pitBackfillResNo && pitBackfillResNo()) this.save(true); } catch (e) {}
      this.ready = true;
      this._bindAutosave();
    },

    /* 保存（既定はデバウンス。immediate=true で即時）。戻り値＝成功(true)/失敗(false)。 */
    save: function (immediate) {
      const self = this;
      const doSave = function () {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({
            v: 1,
            // v0.97.0 サンプル生成カード（_sample）も保存する＝リロードしても消えない（顧客500人規模で容量に余裕）。
            // ※ _sample フラグはカード開閉時の顧客控え書き戻し防止／サンプル作り直し時の識別に引き続き使用。
            cards: (state.cards || []),
            loanerAssigns: (state.loanerAssigns || []),
            loaners: state.loaners,
            customers: state.customers,
            companyCars: state.companyCars,
            fleetEvents: state.fleetEvents,
            bays: state.bays,                          // v0.46.0：PIT配置図の枠（位置・大きさ・課）
            floorPlan: state.floorPlan || { shapes: [] }, // v0.46.0：壁・通路線
            aiVerdicts: state.aiVerdicts || {},
            boardNotes: state.boardNotes || [],       // v0.63.0：ダッシュボードの付箋ボード
            boardLabels: state.boardLabels || {},      // v0.63.0：付箋の色ラベル
            settings: state.settings,
            savedAt: Date.now(),
          }));
          if (self.mode === 'cloud' && self._cloudSave) self._cloudSave();
          return true;
        } catch (e) {
          // ★保存失敗（多くは localStorage 容量オーバー）は今まで黙って握り潰していた＝データが古い状態に戻る原因になり得る。
          //   1セッション1回だけ画面に出して気づけるようにする（連続スパムは抑止）。
          console.warn('[PitDB] 保存失敗', e);
          if (!self._saveErrAlerted){
            self._saveErrAlerted = true;
            try { alert('⚠ データの保存に失敗しました（ブラウザの保存容量オーバーの可能性）。\nこのままだとリロードで最後に保存できた状態に戻ります。\nサンプルの台数を減らす／不要データを整理してください。'); } catch (_) {}
          }
          return false;
        }
      };
      if (immediate) { clearTimeout(this._t); return doSave(); }
      clearTimeout(this._t);
      this._t = setTimeout(doSave, 400);
      return undefined;
    },

    /* サンプルに戻す */
    resetSample: function () {
      if (!confirm('サンプルデータに戻します。\n今の編集内容は消えます。よろしいですか？')) return;
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      location.reload();
    },

    /* 保存済み設定を初期値の上にマージ（将来 設定項目が増えても古い保存で欠けないように） */
    _mergeSettings: function (saved) {
      if (!saved || typeof saved !== 'object') return;
      const cur = state.settings || {};
      Object.keys(saved).forEach(function (k) {
        if (k === 'reserveCap' || k === 'estHold' || k === 'estAmount' || k === 'lotCap' || k === 'target' || k === 'unitPrice' || k === 'ruleDict' || k === 'lotOver') {
          cur[k] = Object.assign({}, cur[k] || {}, saved[k] || {});
        } else {
          cur[k] = saved[k];
        }
      });
      state.settings = cur;
    },

    _bindAutosave: function () {
      const self = this;
      const flush = function () { self.save(true); };
      window.addEventListener('beforeunload', flush);
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    },

    /* ===== 将来：本物ログイン導入時にこのブロックを有効化 =====
       connectCloud: function (user) {
         if (!window.fb || !window.fb.ready) return;
         this.mode = 'cloud';
         const col = window.fb.db.collection('companies').doc('kobayashi_motors');
         // pit_cards / pit_loanerAssigns を onSnapshot で購読し state に流し込む
         // 書き込みは _cloudSave() でドキュメント単位 set
       },
    */
  };

  window.PitDB = PitDB;
  // sample-data.js の後に読み込まれる前提（index.html のスクリプト順）
  PitDB.init();
})();
