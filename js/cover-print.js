/* ========================================
   cover-print.js  -  カルテ「表紙」印刷（v0.101.1）
   ----------------------------------------
   予約詳細(card-view)の🖨ボタンから、カードの情報で「表紙」を印刷する。
   ◎背景（ゆうた）：紙の顧客カルテ＋発注書一式をクリアファイルに入れて運用。予約確定で作り返車でバラす。
     一番上に「表紙」を入れて誰の案件か分かるようにしている。今までフォーマット印刷→手書きだったが、
     情報はアプリにあるので印刷で完結させる。
   ◎方針（v0.101.1 で洗練）：
     ・手書き時代の「複数から〇を付ける」レイアウトは廃止。自動で値が入るものは “実際の値を1つだけ” すっきり表示。
       （例：作業＝「一般・オイル」だけ／受付＝「預かり」だけ／課＝「1課」だけ／代車＝「有…」or「無」）。初回/リピーターは削除。
     ・白黒前提。青ペンで書いていた所＝名前/車種/ナンバー/入庫日/返車日を大きく太く。
     ・本当に返車時に手書きする所（完TEL・車検の入庫時持ち物）だけ記入欄として残す。
     ・A4横で 左=表紙(A5) / 右=メモ＋過去履歴。中央の折り線で半分に折ると表紙が表に来る。
     ・作業に車検が入っていれば「車検」タグ＋入庫時持ち物チェックを出す。
   公開：window.pitPrintCover(cardId) / window.pitBuildCoverDoc(card, {noPrint})
   ======================================== */
(function () {
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  var DOW = ['日','月','火','水','木','金','土'];
  function parseISO(s){ if(!s) return null; var p=String(s).split('-'); if(p.length<3) return null; var d=new Date(+p[0],+p[1]-1,+p[2]); return isNaN(d)?null:d; }
  function md(s){ var d=parseISO(s); return d ? (d.getMonth()+1)+'/'+d.getDate() : ''; }
  function dows(s){ var d=parseISO(s); return d ? DOW[d.getDay()] : ''; }
  function yen(n){ return (n==null||n==='') ? '' : '¥'+Number(n).toLocaleString(); }
  function master(arr, id){ var m=(arr||[]).find(function(x){return x.id===id;}); return m?m.label:''; }
  function loanerName(id){ var l=((window.state&&state.loaners)||[]).find(function(x){return x.id===id;}); return l?(l.name||''):''; }

  var DROP_FULL = { wait:'待ち', sameDay:'当日返し', drop:'預かり' };

  function workLabels(c){
    var w = (Array.isArray(c.workTypes)&&c.workTypes.length) ? c.workTypes : (c.workType?[c.workType]:[]);
    return w.map(function(id){ return master(state.workTypes, id); }).filter(Boolean);
  }
  function dropLabel(c){
    var a = DROP_FULL[c.dropType] || '';
    var b = c.dropType2 ? (DROP_FULL[c.dropType2]||'') : '';
    return b && b!==a ? (a+'・'+b) : a;
  }
  function courseLabel(c){
    if (c.division==='div2' || c.boardId==='import') return '2課';
    if (c.division==='div1' || c.boardId) return '1課';
    return '';
  }

  /* === 過去履歴（同じナンバー優先・なければ同名）＝直近数件 === */
  function historyRows(c){
    var key = (c.plate||'').trim(), nm = (c.customer||'').trim();
    var list = ((window.state&&state.cards)||[]).filter(function(x){
      if (x.id === c.id) return false;
      if (key) return (x.plate||'').trim() === key;
      return nm && (x.customer||'').trim() === nm;
    });
    list.sort(function(a,b){ return (b.reserveDate||'') < (a.reserveDate||'') ? -1 : 1; });
    list = list.slice(0, 8);
    if (!list.length) return '<tr><td colspan="3" class="cv2-hist-empty">（過去の入庫記録はありません）</td></tr>';
    return list.map(function(x){
      var wl = workLabels(x).join('・');
      var amt = x.amountFinal!=null ? x.amountFinal : (x.amountOrder!=null ? x.amountOrder : null);
      return '<tr><td class="cv2-hist-d">'+esc(md(x.reserveDate))+'</td>'
        + '<td class="cv2-hist-w">'+esc(wl||(x.car||''))+'</td>'
        + '<td class="cv2-hist-a">'+esc(yen(amt))+'</td></tr>';
    }).join('');
  }

  /* === パーツ === */
  function field(lb, val, extraCls){
    return '<div class="cv2-f '+(extraCls||'')+'"><span class="cv2-flb">'+esc(lb)+'</span>'
      + '<span class="cv2-fval">'+(val||'<span class="cv2-blank">—</span>')+'</span></div>';
  }
  function dateBlock(lb, iso, time){
    var big = md(iso), dw = dows(iso);
    return '<div class="cv2-dt"><div class="cv2-dt-lb">'+lb+'</div>'
      + '<div class="cv2-dt-main"><span class="cv2-dt-big">'+esc(big||'—')+'</span>'
      +   (dw?'<span class="cv2-dt-dow">('+esc(dw)+')</span>':'')
      +   (time?'<span class="cv2-dt-time">'+esc(time)+'</span>':'')+'</div></div>';
  }

  function loanerVal(c){
    if (!c.needLoaner) return '<span class="cv2-no">無</span>';
    var name = loanerName(c.loanerId);
    var span = (c.loanerFrom||c.loanerTo) ? (esc(md(c.loanerFrom)||'')+' 〜 '+esc(md(c.loanerTo)||'')) : '';
    var conds = (Array.isArray(c.loanerConditions)?c.loanerConditions:[])
      .map(function(id){ return master(state.loanerConditions, id); }).filter(Boolean).join('・');
    var other = (c.loanerOther||'').trim();
    var sub = [];
    if (span) sub.push(span);
    if (conds) sub.push('条件 '+esc(conds));
    if (other) sub.push('その他 '+esc(other));
    return '<span class="cv2-yes">有</span>'
      + (name?'<span class="cv2-lo-name">'+esc(name)+'</span>':'')
      + (sub.length?'<div class="cv2-fsub">'+sub.join('　／　')+'　<span class="cv2-chk">□</span>管理費¥2,200</div>':'');
  }

  function washVal(c){
    if (c.needWash === true) return '要';
    if (c.needWash === false) return '<span class="cv2-no">不要</span>';
    return '';
  }
  function staffVal(c){
    var ku = courseLabel(c);
    var parts = [];
    if (ku) parts.push('<b>'+esc(ku)+'</b>');
    if (c.frontStaff) parts.push('フロント '+esc(c.frontStaff));
    if (c.reserveStaff) parts.push('予約 '+esc(c.reserveStaff));
    return parts.join('<span class="cv2-sep">／</span>');
  }

  function shakenChecklist(){
    return '<div class="cv2-mochi"><div class="cv2-mochi-h">入庫時 持ち物</div>'
      + '<div class="cv2-mochi-row">'
      +   '<span class="cv2-mochi-i"><span class="cv2-chk">□</span>車検証</span>'
      +   '<span class="cv2-mochi-i"><span class="cv2-chk">□</span>納税証明書</span>'
      +   '<span class="cv2-mochi-i"><span class="cv2-chk">□</span>自賠責</span>'
      +   '<span class="cv2-mochi-i"><span class="cv2-chk">□</span>諸費用 ¥＿＿＿＿</span>'
      + '</div></div>';
  }

  function completeBox(c){
    var pay = master(state.paymentMethods, c.payment);
    return '<div class="cv2-comp">'
      + '<div class="cv2-comp-h">完TEL（返車時に記入）</div>'
      + '<div class="cv2-comp-l">/ ＿＿＿＿＿＿＿　担当 ＿＿＿　<span class="cv2-chk">□</span>留守</div>'
      + '<div class="cv2-comp-l">/ ＿＿＿＿＿＿＿　担当 ＿＿＿　<span class="cv2-chk">□</span>留守</div>'
      + '</div>';
  }

  /* === 表紙本体（A5）＝左ページ === */
  function coverInner(c){
    var isShaken = (Array.isArray(c.workTypes)? c.workTypes.indexOf('shaken')>=0 : c.workType==='shaken');
    var tag = isShaken ? '<span class="cv2-tag cv2-tag-shaken">車　検</span>' : '<span class="cv2-tag">一　般</span>';
    var work = workLabels(c).join('・');
    var pay = master(state.paymentMethods, c.payment);
    var plan = (c.returnPlan||c.returnWish||'').trim();

    var fields = ''
      + field('作業', work ? '<b>'+esc(work)+'</b>' : '')
      + field('受付', dropLabel(c) ? esc(dropLabel(c)) : '')
      + field('課・担当', staffVal(c))
      + field('代車', loanerVal(c), 'cv2-f-loaner')
      + field('洗車', washVal(c))
      + field('支払', pay ? esc(pay) : '')
      + field('TEL', c.tel ? '<b>'+esc(c.tel)+'</b>' : '')
      + field('予約受付日', md(c.bookedAt) ? esc(md(c.bookedAt)) : '')
      + field('返車予定・希望', plan ? esc(plan) : '');

    return '<div class="cv2-cover">'
      + '<div class="cv2-top">'
      +   '<span class="cv2-resno">'+(c.resNo?esc(c.resNo):'')+(c.karteNo?'<span class="cv2-karte">カルテ '+esc(c.karteNo)+'</span>':'')+'</span>'
      +   (c.tentative?'<span class="cv2-kari">仮</span>':'')
      +   tag
      + '</div>'
      + '<div class="cv2-hd">'
      +   '<div class="cv2-name"><span class="cv2-cust">'+esc(c.customer||'')+'</span><span class="cv2-sama">様</span></div>'
      +   '<div class="cv2-car">'+esc((c.maker?c.maker+' ':'')+(c.car||''))+'</div>'
      +   '<div class="cv2-plate">'+(((c.plate||'').trim())?esc(c.plate):'')+'</div>'
      + '</div>'
      + '<div class="cv2-dates">'+dateBlock('入庫', c.reserveDate, c.reserveTime)
      +   dateBlock('返車', (c.returnDateFinal||c.returnDate), c.returnTime)+'</div>'
      + '<div class="cv2-fields">'+fields+'</div>'
      + (isShaken ? shakenChecklist() : '')
      + completeBox(c)
      + '</div>';
  }

  /* === 右ページ＝メモ欄＋過去履歴 === */
  function memoPage(c){
    var title = (c.customer||'')+' 様　'+((c.maker?c.maker+' ':'')+(c.car||''));
    return '<div class="cv2-memo">'
      + '<div class="cv2-memo-h">メモ<span class="cv2-memo-sub">'+esc(title)+'</span></div>'
      + '<div class="cv2-memo-lines"></div>'
      + '<div class="cv2-hist-h">過去の入庫履歴</div>'
      + '<table class="cv2-hist"><thead><tr><th>入庫日</th><th>作業 / 車種</th><th>金額</th></tr></thead>'
      +   '<tbody>'+historyRows(c)+'</tbody></table>'
      + '</div>';
  }

  /* === 印刷用CSS（白黒・A4横・左右A5・折り線・洗練版） === */
  var CSS = ''
  + '@page{ size:A4 landscape; margin:0; }'
  + '*{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }'
  + 'html,body{ margin:0; padding:0; background:#fff; color:#111;'
  + ' font-family:"Yu Gothic","Hiragino Kaku Gothic ProN","Meiryo",sans-serif; -webkit-font-smoothing:antialiased; }'
  + '.cv2-sheet{ width:297mm; height:210mm; display:flex; }'
  + '.cv2-page{ width:148.5mm; height:210mm; padding:9mm 9mm; position:relative; }'
  + '.cv2-page.fold{ border-right:1px dashed #bbb; }'
  + '.cv2-foldnote{ position:absolute; top:50%; right:-3mm; transform:rotate(90deg); transform-origin:center;'
  + ' font-size:6.5pt; color:#bbb; letter-spacing:3px; white-space:nowrap; }'
  // 表紙
  + '.cv2-cover{ width:100%; height:100%; display:flex; flex-direction:column; }'
  + '.cv2-top{ display:flex; align-items:center; gap:3mm; height:7mm; }'
  + '.cv2-resno{ font-size:8.5pt; font-weight:700; color:#555; letter-spacing:1px; display:flex; align-items:baseline; gap:3mm; }'
  + '.cv2-karte{ font-size:8pt; color:#888; }'
  + '.cv2-kari{ width:7mm; height:7mm; border:1.4px solid #111; border-radius:50%; display:flex; align-items:center; justify-content:center;'
  + ' font-family:serif; font-weight:900; font-size:11pt; margin-left:auto; }'
  + '.cv2-tag{ margin-left:auto; font-size:11pt; font-weight:800; letter-spacing:3px; border:1.4px solid #111; border-radius:1.5mm; padding:.6mm 3mm; }'
  + '.cv2-kari + .cv2-tag{ margin-left:2mm; }'
  + '.cv2-tag-shaken{ background:#111; color:#fff; }'
  // header
  + '.cv2-hd{ padding:3mm 0 3mm; border-bottom:2px solid #111; }'
  + '.cv2-name{ display:flex; align-items:baseline; gap:3mm; }'
  + '.cv2-cust{ font-size:34pt; font-weight:800; line-height:1.05; letter-spacing:.5px;'
  + ' white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:108mm; }'
  + '.cv2-sama{ font-size:18pt; font-weight:600; flex:0 0 auto; }'
  + '.cv2-car{ font-size:15pt; font-weight:700; margin-top:1.5mm; }'
  + '.cv2-plate{ font-size:13pt; font-weight:700; letter-spacing:1.5px; color:#222; margin-top:1mm; min-height:5mm; }'
  // dates
  + '.cv2-dates{ display:flex; gap:5mm; padding:4mm 0; border-bottom:1px solid #ccc; }'
  + '.cv2-dt{ flex:1; display:flex; align-items:baseline; gap:3mm; }'
  + '.cv2-dt-lb{ font-size:9pt; font-weight:800; background:#111; color:#fff; border-radius:1mm; padding:.8mm 2.5mm; flex:0 0 auto; align-self:center; }'
  + '.cv2-dt-main{ display:flex; align-items:baseline; gap:2.5mm; }'
  + '.cv2-dt-big{ font-size:21pt; font-weight:800; letter-spacing:.5px; }'
  + '.cv2-dt-dow{ font-size:11pt; font-weight:700; color:#444; }'
  + '.cv2-dt-time{ font-size:14pt; font-weight:700; }'
  // fields
  + '.cv2-fields{ padding:2mm 0; }'
  + '.cv2-f{ display:flex; align-items:baseline; gap:4mm; padding:2.1mm 0; border-bottom:1px solid #e2e2e2; min-height:7mm; }'
  + '.cv2-f:last-child{ border-bottom:none; }'
  + '.cv2-flb{ flex:0 0 20mm; font-size:8.5pt; font-weight:700; color:#666; letter-spacing:.5px; }'
  + '.cv2-fval{ flex:1; font-size:12.5pt; font-weight:600; min-width:0; line-height:1.35; }'
  + '.cv2-fval b{ font-weight:800; }'
  + '.cv2-blank{ color:#bbb; }'
  + '.cv2-no{ border:1.2px solid #111; border-radius:1mm; padding:0 2mm; font-weight:800; font-size:11pt; }'
  + '.cv2-yes{ background:#111; color:#fff; border-radius:1mm; padding:0 2.5mm; font-weight:800; font-size:11pt; }'
  + '.cv2-lo-name{ font-weight:800; margin-left:2.5mm; }'
  + '.cv2-fsub{ font-size:9pt; font-weight:600; color:#333; margin-top:1mm; }'
  + '.cv2-sep{ color:#bbb; margin:0 2mm; }'
  + '.cv2-chk{ font-size:11pt; }'
  // 車検 持ち物
  + '.cv2-mochi{ margin-top:3mm; border:1.4px solid #111; border-radius:1.5mm; padding:2mm 3mm; }'
  + '.cv2-mochi-h{ font-size:8.5pt; font-weight:800; color:#111; margin-bottom:1.5mm; }'
  + '.cv2-mochi-row{ display:flex; flex-wrap:wrap; gap:2mm 5mm; font-size:10pt; font-weight:700; }'
  + '.cv2-mochi-i{ display:inline-flex; align-items:center; gap:1.5mm; }'
  // 完TEL
  + '.cv2-comp{ margin-top:auto; border-top:2px solid #111; padding-top:2.5mm; }'
  + '.cv2-comp-h{ font-size:8pt; font-weight:700; color:#888; margin-bottom:1.5mm; }'
  + '.cv2-comp-l{ font-size:10.5pt; font-weight:600; color:#333; padding:1.2mm 0; }'
  // ---- 右ページ：メモ＋履歴 ----
  + '.cv2-memo{ width:100%; height:100%; display:flex; flex-direction:column; }'
  + '.cv2-memo-h{ font-size:12pt; font-weight:800; border-bottom:2px solid #111; padding-bottom:2mm; display:flex; align-items:baseline; }'
  + '.cv2-memo-sub{ font-size:9pt; font-weight:600; color:#666; margin-left:3mm; }'
  + '.cv2-memo-lines{ flex:1; min-height:90mm; background-image:repeating-linear-gradient(#fff 0, #fff 8.4mm, #ddd 8.4mm, #ddd 8.5mm); margin:3mm 0; }'
  + '.cv2-hist-h{ font-size:10pt; font-weight:800; border-top:2px solid #111; padding-top:2mm; }'
  + '.cv2-hist{ width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:2mm; }'
  + '.cv2-hist th,.cv2-hist td{ border-bottom:1px solid #ccc; padding:1.6mm 2mm; text-align:left; }'
  + '.cv2-hist thead th{ border-bottom:1.4px solid #111; font-size:8pt; color:#666; font-weight:700; }'
  + '.cv2-hist-d{ width:18mm; white-space:nowrap; font-weight:700; }'
  + '.cv2-hist-a{ width:26mm; text-align:right; white-space:nowrap; font-weight:700; }'
  + '.cv2-hist-empty{ text-align:center; color:#999; padding:6mm 0; }'
  // screen preview
  + '@media screen{ body{ background:#5a5f66; padding:18px; } .cv2-sheet{ background:#fff; margin:0 auto; box-shadow:0 8px 34px rgba(0,0,0,.5); } }';

  function buildDoc(c, opts){
    opts = opts || {};
    var foldNote = '<div class="cv2-foldnote">― ここで半分に折る ―</div>';
    var autoPrint = opts.noPrint ? '' :
      ('<script>window.onload=function(){ setTimeout(function(){ try{ window.focus(); window.print(); }catch(e){} }, 250); };'
       + 'window.onafterprint=function(){ try{ window.close(); }catch(e){} };<\/script>');
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">'
      + '<title>表紙 '+esc(c.customer||'')+'様</title><style>'+CSS+'</style></head><body>'
      + '<div class="cv2-sheet">'
      +   '<div class="cv2-page fold">'+coverInner(c)+foldNote+'</div>'
      +   '<div class="cv2-page">'+memoPage(c)+'</div>'
      + '</div>'
      + autoPrint
      + '</body></html>';
  }

  window.pitBuildCoverDoc = buildDoc;
  window.pitPrintCover = function(cardId){
    var c = ((window.state&&state.cards)||[]).find(function(x){ return x.id === cardId; });
    if (!c){ if(window.pitToast) pitToast('カードが見つかりません'); return; }
    var doc = buildDoc(c);
    var w = window.open('', '_blank');
    if (!w){
      var f = document.getElementById('pit-cover-iframe');
      if (f) f.remove();
      f = document.createElement('iframe');
      f.id = 'pit-cover-iframe';
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(f);
      var d = f.contentWindow.document;
      d.open(); d.write(doc); d.close();
      setTimeout(function(){ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){} }, 400);
      return;
    }
    w.document.open(); w.document.write(doc); w.document.close();
  };
})();
