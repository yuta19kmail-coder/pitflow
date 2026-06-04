/* ============================================
   CoreFlow アプリランチャー（共通：全アプリで同一・7球）

   使い方：
     1) サイドバー底に
          <div data-cf-launcher data-current="stockflow"></div>
        のようなマウント要素を1つ置く（data-currentに自アプリ名）
     2) この launcher.js と launcher.css を読み込む
     3) 起動時に自動的にトリガー＋オーバーレイを差し込み、ホバー/クリックで開く

   アプリ追加時：APPS 配列に追記＋ launcher.css の p{n} 位置を1つ足す。
   ============================================ */
(function(){
  const APPS = [
    { key:'coreflow',     url:'https://coreflow.kobayashi-motors.com',           icon:'🏠', name:'CoreFlow',     color:'#e2e8f0' },
    { key:'pitflow',      url:'https://yuta19kmail-coder.github.io/pitflow/',     icon:'🔧', name:'PitFlow',     color:'#1db97a' },
    { key:'mhs',          url:'https://yuta19kmail-coder.github.io/mhs/',         icon:'📅', name:'MHS',        color:'#dc2626' },
    { key:'carflow',      url:'https://carflow.kobayashi-motors.com',             icon:'🚙', name:'CarFlow',     color:'#378ADD' },
    { key:'stockflow',    url:'https://stockflow.kobayashi-motors.com',           icon:'📦', name:'StockFlow',   color:'#7c3aed' },
    { key:'coreboard',    url:'https://yuta19kmail-coder.github.io/CoreBoard/',   icon:'📋', name:'CoreBoard',   color:'#06b6d4' },
    { key:'corenote',     url:'https://yuta19kmail-coder.github.io/CoreNote/',    icon:'📝', name:'CoreNote',    color:'#ec4899' },
  ];

  function escAttr(s){ return String(s).replace(/"/g,'&quot;'); }

  function init(){
    const mount = document.querySelector('[data-cf-launcher]');
    if(!mount) return;
    const currentApp = (mount.getAttribute('data-current')||'').toLowerCase();

    // --- トリガー DOM をマウント位置に注入 ---
    mount.innerHTML =
      '<div class="cf-launcher-trigger" id="cf-trigger" title="アプリ切替">' +
        '<div class="cf-lg-logo">C</div>' +
        '<div class="cf-lg-text">' +
          '<span class="cf-l1">CoreFlow</span>' +
          '<span class="cf-l2">アプリ切替</span>' +
        '</div>' +
        '<span class="cf-lg-arrow">›</span>' +
      '</div>';

    // --- オーバーレイ DOM を body 直下に注入 ---
    const overlay = document.createElement('div');
    overlay.id = 'cf-launcher-overlay';
    let ballsHTML = '';
    APPS.forEach((a, idx)=>{
      const i = idx + 1;
      const isCurrent = (a.key === currentApp);
      const hasUrl = !!a.url;
      const disabled = isCurrent || !hasUrl;
      const itemClasses = 'cf-lo-item p'+i + (isCurrent ? ' cf-current' : '');
      ballsHTML += (
        '<div class="'+itemClasses+'">' +
          '<a class="cf-lo-ball cf-'+escAttr(a.key)+'" ' +
            (hasUrl && !isCurrent ? 'href="'+escAttr(a.url)+'" ' : '') +
            'data-app="'+escAttr(a.key)+'" ' +
            'data-color="'+escAttr(a.color)+'" ' +
            'data-url="'+escAttr(a.url||'')+'" ' +
            (disabled ? 'aria-disabled="true" ' : '') +
            '>'+a.icon+'</a>' +
          '<span class="cf-lo-label">'+escAttr(a.name)+'</span>' +
        '</div>'
      );
    });
    overlay.innerHTML =
      '<div class="cf-lo-backdrop"></div>' +
      '<div class="cf-lo-flood"></div>' +
      '<div class="cf-lo-catcher"></div>' +
      '<div class="cf-lo-hotzone">' +
        '<div class="cf-lo-stage" aria-hidden="true">' + ballsHTML + '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // --- 参照取得 ---
    const root    = document.body;
    const trigger = document.getElementById('cf-trigger');
    const catcher = overlay.querySelector('.cf-lo-catcher');
    const hotzone = overlay.querySelector('.cf-lo-hotzone');
    const flood   = overlay.querySelector('.cf-lo-flood');
    let locked = false;
    let closeTimer = null;

    function setOpen(on){
      if(on){ root.classList.add('cf-open'); }
      else {
        root.classList.remove('cf-open');
        root.classList.remove('cf-flooding');
      }
    }
    function cancelClose(){ if(closeTimer){ clearTimeout(closeTimer); closeTimer = null; } }
    function scheduleClose(){
      cancelClose();
      closeTimer = setTimeout(function(){
        if(!locked) setOpen(false);
        closeTimer = null;
      }, 220);
    }

    /* ホバーで開閉（球は hotzone の DOM 内側にいるので mouseleave 誤発火しない） */
    trigger.addEventListener('mouseenter', function(){ cancelClose(); setOpen(true); });
    trigger.addEventListener('mouseleave', function(){ scheduleClose(); });
    hotzone.addEventListener('mouseenter', cancelClose);
    hotzone.addEventListener('mouseleave', scheduleClose);

    /* クリックでロック（外クリック or Escで閉じる） */
    trigger.addEventListener('click', function(e){
      e.stopPropagation();
      locked = !locked;
      setOpen(locked);
    });
    catcher.addEventListener('click', function(){
      locked = false; cancelClose(); setOpen(false);
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){ locked = false; cancelClose(); setOpen(false); }
    });

    /* 色フラッド：球にホバーするたびに 0% からアニメ再スタート */
    function setFlood(ball){
      if(!ball){ root.classList.remove('cf-flooding'); return; }
      const r = ball.getBoundingClientRect();
      const cx = r.left + r.width/2;
      const cy = r.top  + r.height/2;
      flood.style.setProperty('--cf-fx', cx + 'px');
      flood.style.setProperty('--cf-fy', cy + 'px');
      flood.style.setProperty('--cf-fcolor', ball.dataset.color || '#fff');
      root.classList.remove('cf-flooding');
      /* 次フレームで付け直すと animation が 0% から開始 */
      requestAnimationFrame(function(){
        void flood.offsetWidth;
        root.classList.add('cf-flooding');
      });
    }

    overlay.querySelectorAll('.cf-lo-ball').forEach(function(b){
      b.addEventListener('mouseenter', function(){ cancelClose(); setFlood(b); });
      b.addEventListener('mouseleave', function(){ setFlood(null); });
      b.addEventListener('click', function(e){
        const url = b.dataset.url;
        const isDisabled = b.getAttribute('aria-disabled') === 'true';
        const isCurrent  = (b.dataset.app === currentApp);
        if(isCurrent){ e.preventDefault(); return; }     // 現在地は何もしない
        if(!url || isDisabled){                            // URL未設定
          e.preventDefault();
          alert(b.dataset.app + ' は準備中です。');
          return;
        }
        /* それ以外は <a href="..."> でそのまま遷移（同タブ） */
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
