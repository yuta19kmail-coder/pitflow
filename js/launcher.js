/* ============================================
   CoreFlow アプリランチャー（共通：全アプリで同一）
   v2.1（2026-06-07）：中心＝CoreFlow（太陽・クリックでCoreFlowへ）＋公転2周。
     内周(Flow系)：MHS / PitFlow / CarFlow / StockFlow
     外周(Core系＋Money)：CoreBoard / CoreNote / CoreTools / CoreMembers / MoneyFlow
   ラベルは普段隠し、球ホバーで表示。中心に太陽(CoreFlow)を表示。
   ============================================ */
(function(){
  const COREFLOW_URL = 'https://coreflow.kobayashi-motors.com';

  const APPS = [
    { key:'mhs',        url:'https://mhs.kobayashi-motors.com',       icon:'📅', name:'MHS',        color:'#dc2626', dx:0,   dy:-150 },
    { key:'pitflow',    url:'https://yuta19kmail-coder.github.io/pitflow/',   icon:'🔧', name:'PitFlow',    color:'#1db97a', dx:68,  dy:-134 },
    { key:'carflow',    url:'https://carflow.kobayashi-motors.com',           icon:'🚙', name:'CarFlow',    color:'#378ADD', dx:121, dy:-88  },
    { key:'stockflow',  url:'https://stockflow.kobayashi-motors.com',         icon:'📦', name:'StockFlow',  color:'#7c3aed', dx:148, dy:-23  },
    { key:'coreboard',  url:'https://yuta19kmail-coder.github.io/CoreBoard/', icon:'📋', name:'CoreBoard',  color:'#06b6d4', dx:8,   dy:-235 },
    { key:'corenote',   url:'https://yuta19kmail-coder.github.io/CoreNote/',  icon:'📝', name:'CoreNote',   color:'#ec4899', dx:88,  dy:-218 },
    { key:'coretools',  url:'https://yuta19kmail-coder.github.io/CoreTools/', icon:'🧰', name:'CoreTools',  color:'#64748b', dx:157, dy:-175 },
    { key:'coremembers',url:'https://coremembers.kobayashi-motors.com',                                               icon:'👥', name:'CoreMembers',color:'#ea580c', dx:207, dy:-110 },
    { key:'moneyflow',  url:'',                                               icon:'💴', name:'MoneyFlow',  color:'#e0a92b', dx:234, dy:-25  },
  ];

  function escAttr(s){ return String(s).replace(/"/g,'&quot;'); }

  function init(){
    const mount = document.querySelector('[data-cf-launcher]');
    if(!mount) return;
    const currentApp = (mount.getAttribute('data-current')||'').toLowerCase();

    mount.innerHTML =
      '<div class="cf-launcher-trigger" id="cf-trigger" title="CoreFlow（クリックで玄関へ／ホバーでアプリ切替）">' +
        '<div class="cf-lg-logo">C</div>' +
        '<div class="cf-lg-text">' +
          '<span class="cf-l1">CoreFlow</span>' +
          '<span class="cf-l2">アプリ切替</span>' +
        '</div>' +
        '<span class="cf-lg-arrow">›</span>' +
      '</div>';

    const overlay = document.createElement('div');
    overlay.id = 'cf-launcher-overlay';
    let ballsHTML = '';
    APPS.forEach((a, idx)=>{
      const isCurrent = (a.key === currentApp);
      const hasUrl = !!a.url;
      const disabled = isCurrent || !hasUrl;
      const itemClasses = 'cf-lo-item' + (isCurrent ? ' cf-current' : '');
      const delay = (0.03 * idx).toFixed(2);
      ballsHTML += (
        '<div class="'+itemClasses+'" style="--dx:'+a.dx+'px;--dy:'+a.dy+'px;--d:'+delay+'s">' +
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
        '<div class="cf-lo-stage" aria-hidden="true">' +
          '<a class="cf-lo-sun" ' + (currentApp === 'coreflow' ? '' : 'href="'+COREFLOW_URL+'" ') + 'data-app="coreflow" title="CoreFlow（玄関へ）">🏠</a>' +
          '<span class="cf-lo-sunlabel">CoreFlow</span>' +
          ballsHTML +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const root    = document.body;
    const trigger = document.getElementById('cf-trigger');
    const catcher = overlay.querySelector('.cf-lo-catcher');
    const hotzone = overlay.querySelector('.cf-lo-hotzone');
    const flood   = overlay.querySelector('.cf-lo-flood');
    let closeTimer = null;

    function setOpen(on){
      if(on){ root.classList.add('cf-open'); }
      else { root.classList.remove('cf-open'); root.classList.remove('cf-flooding'); }
    }
    function cancelClose(){ if(closeTimer){ clearTimeout(closeTimer); closeTimer = null; } }
    function scheduleClose(){
      cancelClose();
      closeTimer = setTimeout(function(){ setOpen(false); closeTimer = null; }, 220);
    }

    trigger.addEventListener('mouseenter', function(){ cancelClose(); setOpen(true); });
    trigger.addEventListener('mouseleave', function(){ scheduleClose(); });
    hotzone.addEventListener('mouseenter', cancelClose);
    hotzone.addEventListener('mouseleave', scheduleClose);

    trigger.addEventListener('click', function(e){
      e.stopPropagation();
      if(currentApp === 'coreflow') return;
      window.location.href = COREFLOW_URL;
    });
    catcher.addEventListener('click', function(){ cancelClose(); setOpen(false); });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){ cancelClose(); setOpen(false); }
    });

    function setFlood(ball){
      if(!ball){ root.classList.remove('cf-flooding'); return; }
      const r = ball.getBoundingClientRect();
      flood.style.setProperty('--cf-fx', (r.left + r.width/2) + 'px');
      flood.style.setProperty('--cf-fy', (r.top  + r.height/2) + 'px');
      flood.style.setProperty('--cf-fcolor', ball.dataset.color || '#fff');
      root.classList.remove('cf-flooding');
      requestAnimationFrame(function(){ void flood.offsetWidth; root.classList.add('cf-flooding'); });
    }

    overlay.querySelectorAll('.cf-lo-ball').forEach(function(b){
      b.addEventListener('mouseenter', function(){ cancelClose(); setFlood(b); });
      b.addEventListener('mouseleave', function(){ setFlood(null); });
      b.addEventListener('click', function(e){
        const url = b.dataset.url;
        const isDisabled = b.getAttribute('aria-disabled') === 'true';
        const isCurrent  = (b.dataset.app === currentApp);
        if(isCurrent){ e.preventDefault(); return; }
        if(!url || isDisabled){ e.preventDefault(); alert(b.dataset.app + ' は準備中です。'); return; }
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
