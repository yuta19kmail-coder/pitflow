/* ========================================
   main.js
   起動処理
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 初期ビューを描画（朝イチで開く想定なので当日ビュー）
  showView('today');

  // モーダル背景クリックで閉じる
  document.getElementById('modal-detail').addEventListener('click', (e) => {
    if (e.target.id === 'modal-detail') closeDetail();
  });

  // ESCで閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  // レンジタブ
  document.querySelectorAll('.range-tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.range-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.reserveRange = b.dataset.range;
      renderReserve();
    });
  });

  console.log('PitFlow v0.0.4 ready');
});
