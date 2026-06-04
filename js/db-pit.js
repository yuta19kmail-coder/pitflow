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
  const LS_KEY = 'pitflow_data_v7';   // v7: 車両イベント(fleetEvents)・代車予約の顧客/車種 対応で再シード

  const PitDB = {
    mode: 'local',      // 'local' | 'cloud'
    ready: false,
    _t: null,

    /* 起動：localStorage 優先で state を上書き。無ければサンプルを初期保存 */
    init: function () {
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
            this._mergeSettings(d.settings);
            console.log('[PitDB] 保存データを読み込みました（' + d.cards.length + '件）');
          }
        } else {
          this.save(true);   // 初回：サンプルを初期データとして保存
          console.log('[PitDB] サンプルを初期データとして保存しました');
        }
      } catch (e) {
        console.warn('[PitDB] 読み込み失敗。サンプルで継続します', e);
      }
      this.ready = true;
      this._bindAutosave();
    },

    /* 保存（既定はデバウンス。immediate=true で即時） */
    save: function (immediate) {
      const self = this;
      const doSave = function () {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({
            v: 1,
            cards: state.cards,
            loanerAssigns: state.loanerAssigns,
            loaners: state.loaners,
            customers: state.customers,
            companyCars: state.companyCars,
            fleetEvents: state.fleetEvents,
            settings: state.settings,
            savedAt: Date.now(),
          }));
          if (self.mode === 'cloud' && self._cloudSave) self._cloudSave();
        } catch (e) {
          console.warn('[PitDB] 保存失敗', e);
        }
      };
      if (immediate) { clearTimeout(this._t); doSave(); return; }
      clearTimeout(this._t);
      this._t = setTimeout(doSave, 400);
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
        if (k === 'reserveCap' || k === 'estHold' || k === 'lotCap' || k === 'target' || k === 'unitPrice' || k === 'ruleDict') {
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
