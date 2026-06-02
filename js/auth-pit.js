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

  document.addEventListener('DOMContentLoaded', function () {
    let authed = false;
    try { authed = localStorage.getItem(FLAG) === '1'; } catch (e) {}
    if (authed) showApp(); else showLogin();
  });
})();
