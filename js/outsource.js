/* ========================================
   outsource.js
   外注ビュー（サイドバー：Pitリストの下・実績の上）。
   設定の外注先（state.settings.outsourcePartners）ごとに、外注フェーズ(status==='outsource')の
   カードを並べて俯瞰する読み取り専用ビュー。カードはドラッグ不可・クリックで詳細を開く。
   ======================================== */
(function(){
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }

  function mdShort(iso){ if(!iso) return ''; var p=String(iso).split('-'); return (p.length>=3)?((+p[1])+'/'+(+p[2])):iso; }
  function dayNo(c){ return c.phaseAt ? (Math.floor((Date.now()-c.phaseAt)/86400000)+1) : null; }

  // タスクボードと同じコンパクトカード＋右側に「完了予定・何日目」
  function osItem(c){
    var card = (typeof cardHtml === 'function') ? cardHtml(c, { compact:true }) : ('<div class="os-card">'+esc(c.customer||'')+'</div>');
    var dueTxt = c.outsourceDue ? mdShort(c.outsourceDue) : '未定';
    var d = dayNo(c);
    var side = '<div class="os-side"><div class="os-side-due">完了予定<br><b>'+esc(dueTxt)+'</b></div>'
      + (d!=null ? '<div class="os-side-day">'+d+'日目</div>' : '') + '</div>';
    return '<div class="os-item">'+card+side+'</div>';
  }

  function osRow(title, list){
    return '<div class="os-row"><div class="os-rowh">'+esc(title)+'<span class="os-n">'+list.length+'</span></div>'
      + '<div class="os-cards">'+(list.length ? list.map(osItem).join('') : '<div class="os-none">なし</div>')+'</div></div>';
  }

  window.renderOutsource = function(){
    var body = document.getElementById('view-outsource-body');
    if (!body) return;
    var partners = (state.settings && state.settings.outsourcePartners) || [];
    var cards = (state.cards || []).filter(function(c){ return c.status === 'outsource'; });
    var h = '';
    if (!partners.length && !cards.length){
      h = '<div class="os-empty">外注先が未登録です。設定の「🏭 外注先」で追加してください。</div>';
      body.innerHTML = h; return;
    }
    partners.forEach(function(p){
      h += osRow(p, cards.filter(function(c){ return c.outsourceTo === p; }));
    });
    // 外注先が未指定／リストにない先のカードもまとめて表示
    var other = cards.filter(function(c){ return !c.outsourceTo || partners.indexOf(c.outsourceTo) < 0; });
    if (other.length) h += osRow('（外注先 未指定・その他）', other);
    body.innerHTML = h;
  };
})();
