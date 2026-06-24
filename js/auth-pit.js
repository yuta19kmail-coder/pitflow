/* ========================================
   auth-pit.js  -  サンプルログイン（PitFlow v0.1.0）
   ----------------------------------------
   ★現状は「開発用のサンプルログイン」。
     ・本物の Google 認証はまだ繋いでいない（後日 CarFlow/StockFlow と同方式で導入）。
     ・ボタンを押すとアプリに入れる。入った状態は記憶する（毎回聞かれない）。
   ======================================== */
(function () {
  const FLAG = 'pitflow_sample_authed';

  function showApp() {
    const lg = document.getElementById('pit-login');
    if (lg) lg.style.display = 'none';
    document.body.classList.add('pit-authed');
  }
  function showLogin() {
    const lg = document.getElementById('pit-login');
    if (lg) lg.style.display = 'flex';
    document.body.classList.remove('pit-authed');
  }

  window.pitSampleLogin = function () {
    try { localStorage.setItem(FLAG, '1'); } catch (e) {}
    showApp();
  };
  window.pitLogout = function () {
    try { localStorage.removeItem(FLAG); } catch (e) {}
    showLogin();
  };

  /* v0.82.0: いまログインしている人の「スタッフ名」を返すフック。
     ★現状はサンプルログイン（個人を特定していない）ので空文字を返す＝予約担当は空のまま。
     ★本番（CarFlow/StockFlow と同じ Google ログイン＋名簿 portalMembers）を接続したら、
       ここを「ログインユーザーの uid/email → 名簿/state.staff の name」に解決して返すよう差し替えるだけで、
       新規予約の「予約担当」が自動でその人になる（openNewReserve が起動時に参照）。 */
  window.pitCurrentStaffName = function () {
    return '';
  };

  document.addEventListener('DOMContentLoaded', function () {
    let authed = false;
    try { authed = localStorage.getItem(FLAG) === '1'; } catch (e) {}
    if (authed) showApp(); else showLogin();
  });
})();
