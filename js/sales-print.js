/* ========================================
   sales-print.js  -  売上ビューの印刷 / PDF出力（PitFlow v0.105.0）
   ・印刷＝別ウィンドウにライトテーマで組み直し、A4縦1枚に自動縮小(zoom)して window.print()
   ・PDF ＝ html2canvas + jsPDF（cdnjs・必要時のみ読込）でA4 1枚に収めてダウンロード。失敗時は印刷にフォールバック
   ・対象＝いま表示中のタブ/期間（#view-sales-body の内容。操作用のタブ・トグルは除外）
   ======================================== */
(function(){
  'use strict';
  function two(n){ return (n<10?'0':'')+n; }
  function nowTxt(){ var d=new Date(); return (d.getMonth()+1)+'/'+d.getDate()+' '+two(d.getHours())+':'+two(d.getMinutes()); }
  function titleInfo(){
    var tabs={sales:'売上サマリー',quarter:'クォーター進捗',work:'作業内容',front:'フロント別'};
    var tab=tabs[window._svTab||'sales']||'売上';
    var period;
    if(window._svMode==='year'){ var Y=window._svYear||new Date().getFullYear(); period='年度（'+(Y-1)+'/12〜'+Y+'/11）'; }
    else { var ym=window._svYM||{y:new Date().getFullYear(),m:new Date().getMonth()}; period=ym.y+'年'+(ym.m+1)+'月'; }
    return {tab:tab,period:period};
  }
  function fileBase(){ var t=titleInfo(); return ('売上_'+t.tab+'_'+t.period).replace(/[\\\/:*?"<>|\s（）()]/g,'-'); }
  function sheetInner(){
    var body=document.getElementById('view-sales-body'); if(!body) return '<p>表示するデータがありません</p>';
    var clone=body.cloneNode(true);
    clone.querySelectorAll('.sv-tabbar,.sv-head,.sv-viewsw').forEach(function(el){ if(el.parentNode) el.parentNode.removeChild(el); });
    return clone.innerHTML;
  }
  function cssHref(){ try{ return new URL('css/sales.css', document.baseURI).href; }catch(e){ return 'css/sales.css'; } }
  var PRINT_CSS = ":root{--bg2:#fff;--bg3:#f5f7f9;--text:#111;--text2:#444;--text3:#767b83;--border:#c9ced6;--border2:#e5e8ec;--brand:#1f7a4d;--r:10px;--green:#1db97a;}"
    + "*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box;}"
    + "html,body{margin:0;background:#fff;color:#111;font-family:-apple-system,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;}"
    + "@page{size:A4 portrait;margin:8mm;}"
    + ".sheet{width:194mm;transform-origin:top left;}"
    + ".pr-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid #1f7a4d;padding-bottom:6px;margin-bottom:10px;}"
    + ".pr-title{font-size:19px;font-weight:800;}.pr-title small{font-size:12px;font-weight:600;color:#555;margin-left:8px;}"
    + ".pr-sub{font-size:10.5px;color:#666;}"
    + "#view-sales-body{padding:0!important;}"
    + ".sv-card,.sv-hero,.sv-qcard,.sv-fcard,.sv-wgcard,.sv-tier,.sv-course{box-shadow:none!important;break-inside:avoid;}"
    + ".sv-fcards,.sv-wgcards,.sv-tiers,.sv-qcards,.sv-courses{break-inside:avoid;}";
  function docHtml(withAutoPrint){
    var t=titleInfo();
    var s='<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>'+t.tab+' '+t.period+'</title>';
    s+='<link rel="stylesheet" href="'+cssHref()+'">';
    s+='<style>'+PRINT_CSS+'</style></head><body>';
    s+='<div class="sheet" id="sheet"><div class="pr-head"><div class="pr-title">'+t.tab+'<small>'+t.period+'</small></div><div class="pr-sub">小林モータース ／ 出力 '+nowTxt()+'</div></div>';
    s+=sheetInner()+'</div>';
    if(withAutoPrint){ s+='<scr'+'ipt>(function(){function fit(){var el=document.getElementById("sheet");if(!el)return;el.style.zoom="1";var f=Math.min(1,1055/el.scrollHeight,735/el.scrollWidth);el.style.zoom=String(f);setTimeout(function(){window.focus();window.print();},80);}if(document.readyState==="complete")setTimeout(fit,150);else window.addEventListener("load",function(){setTimeout(fit,180);});})();<\/scr'+'ipt>'; }
    return s;
  }
  window.svPrint=function(){
    var w=window.open('','_blank','width=900,height=1000');
    if(!w){ alert('ポップアップがブロックされました。ポップアップを許可してから再度お試しください。'); return; }
    w.document.open(); w.document.write(docHtml(true)); w.document.close();
  };
  function loadScript(src){ return new Promise(function(res,rej){ var el=document.createElement('script'); el.src=src; el.onload=res; el.onerror=function(){ rej(new Error('load fail')); }; document.head.appendChild(el); }); }
  function ensureLibs(){ var need=[]; if(!window.html2canvas) need.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')); if(!(window.jspdf&&window.jspdf.jsPDF)) need.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')); return Promise.all(need); }
  window.svExportPdf=function(){
    ensureLibs().then(function(){
      var ifr=document.createElement('iframe'); ifr.style.cssText='position:fixed;left:-9999px;top:0;width:820px;height:1400px;border:0;'; document.body.appendChild(ifr);
      var d=ifr.contentDocument||ifr.contentWindow.document; d.open(); d.write(docHtml(false)); d.close();
      var go=function(){ var el=d.getElementById('sheet'); if(!el){ document.body.removeChild(ifr); return; }
        window.html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false}).then(function(canvas){
          var jsPDF=window.jspdf.jsPDF; var pdf=new jsPDF('p','mm','a4');
          var pw=210-16, ph=297-16; var ratio=Math.min(pw/canvas.width, ph/canvas.height);
          pdf.addImage(canvas.toDataURL('image/jpeg',0.92),'JPEG',8,8,canvas.width*ratio,canvas.height*ratio);
          pdf.save(fileBase()+'.pdf'); document.body.removeChild(ifr);
        }).catch(function(){ document.body.removeChild(ifr); alert('PDF化に失敗しました。印刷ダイアログの「PDFに保存」をご利用ください。'); window.svPrint(); });
      };
      if(d.readyState==='complete') setTimeout(go,300); else ifr.onload=function(){ setTimeout(go,350); };
    }).catch(function(){ alert('PDFライブラリの読込に失敗（オフライン等）。印刷ダイアログの「PDFに保存」をご利用ください。'); window.svPrint(); });
  };
})();
