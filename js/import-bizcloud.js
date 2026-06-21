/* ========================================
   import-bizcloud.js  -  bizcloud 顧客JSONの取込（テスト用・localStorageのみ）
   ----------------------------------------
   ・bizcloud から書き出した「顧客車両_bizcloud_*.json」（人＋vehicles[] ネスト）を
     ユーザーがファイル選択 → state.customers に全置き換え → PitDB.save()（localStorageのみ）。
   ・本番DB(Firestore)には一切送らない（PitDBは現状ローカル専用）。
   ・実顧客の個人情報を含むため、JSONはリポジトリに置かず「手元ファイルから取込」方式。
   ======================================== */
(function () {
  function rid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toMs(v) { if (v == null || v === '') return 0; var t = +new Date(v); return isNaN(t) ? 0 : t; }

  window.pitImportCustomersFromFile = function () {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var arr;
        try { arr = JSON.parse(r.result); } catch (e) { alert('JSONの読み込みに失敗しました：' + e.message); return; }
        if (!Array.isArray(arr)) { alert('JSONの形式が配列ではありません。'); return; }
        if (!confirm('顧客 ' + arr.length + ' 件を取り込みます。\n今の顧客控え（' + ((state.customers || []).length) + '件）は全置き換えされます。\n\n※この端末のブラウザ内（localStorage）だけに反映・本番には送りません。\nよろしいですか？')) return;

        var out = arr.map(function (c) {
          var cust = Object.assign({}, c);
          cust.id = 'cu_bl_' + (c.code != null ? c.code : rid(''));
          cust.contacts = Array.isArray(c.contacts) ? c.contacts : [];
          cust.vehicles = (Array.isArray(c.vehicles) ? c.vehicles : []).map(function (v) {
            var veh = Object.assign({}, v);
            veh.id = 'v_bl_' + (v.mgtNo != null ? v.mgtNo : rid(''));
            veh.updatedAt = toMs(v.updatedAt) || Date.now();   // ISO文字列→ms（最終入庫の並べ替え用）
            return veh;
          });
          var lastVisit = cust.vehicles.reduce(function (m, v) { return Math.max(m, v.updatedAt || 0); }, 0);
          cust.updatedAt = toMs(c.updatedAt) || lastVisit || Date.now();
          return cust;
        });

        state.customers = out;
        if (window.PitDB) PitDB.save(true);   // localStorage のみ
        if (window.renderCustomers) renderCustomers();
        var st = document.getElementById('ps-import-status');
        if (st) st.textContent = '取込済 ' + out.length + ' 件';
        var veh = out.reduce(function (n, c) { return n + (c.vehicles ? c.vehicles.length : 0); }, 0);
        if (window.toast) toast('✅ 顧客 ' + out.length + ' 件／車両 ' + veh + ' 台を取り込みました（この端末のみ）');
        else alert('取り込み完了：顧客 ' + out.length + ' 件／車両 ' + veh + ' 台');
      };
      r.readAsText(f, 'utf-8');
    };
    inp.click();
  };
})();
