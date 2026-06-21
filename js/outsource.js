/* ========================================
   outsource.js
   外注ビュー（サイドバー：Pitリストの下・実績の上）。
   設定の外注先（state.settings.outsourcePartners）ごとに、外注フェーズ(status==='outsource')の
   カードを並べて俯瞰する読み取り専用ビュー。カードはドラッグ不可・クリックで詳細を開く。
   ======================================== */
(function(){
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }

  function daysLabel(c){
    if (!c.phaseAt) return '';
    var d = Math.max(0, Math.round((Date.now() - c.phaseAt) / 86400000));
    return d === 0 ? '本日' : d + '日';
  }

  function osCard(c){
    var team = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
    var days = daysLabel(c);
    return '<div class="os-card" style="border-left-color:'+team+'" onclick="openDetail(\''+c.id+'\')">'
      + '<div class="os-c1">'+esc(c.customer||'（未入力）')+' 様</div>'
      + '<div class="os-c2"><span class="os-carn">'+esc(c.car||'')+'</span>'+(days?'<span class="os-days">'+days+'</span>':'')+'</div>'
      + '</div>';
  }

  function osRow(title, list){
    return '<div class="os-row"><div class="os-rowh">'+esc(title)+'<span class="os-n">'+list.length+'</span></div>'
      + '<div class="os-cards">'+(list.length ? list.map(osCard).join('') : '<div class="os-none">なし</div>')+'</div></div>';
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
