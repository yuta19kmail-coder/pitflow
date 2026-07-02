/* ========================================
   sales.js  -  売上ビュー（PitFlow v0.102.0）
   ----------------------------------------
   ・当月ビュー（既定）＝「今月の売上は順調か」を一目で。
     返車ベースの実績を最終確定として、パイプラインを確度別に積む：
       目標 / 実績(返車済) / 確定(パーツ待ち以降・実績前) / 予定(連絡中・見積済) /
       見込(入庫済・受注前=概算) / 予測(未入庫予約・月内に実績化可=概算)
     日次の累計と目標ペースを並べて進捗を明確化。1課/2課→フロント別に細分化。
   ・月間ビュー＝通年の月別実績と目標、昨対（前年の返車実績があれば）。
   金額：実績=amountFinal → 確定=amountOrder → 予定=amountQuote → 見込/予測=estAmount（無ければタイプ平均）
   ======================================== */
(function(){
  'use strict';

  var TIERS = [
    { id:'actual',    label:'実績', color:'#1db97a', note:'返車済み（確定売上）' },
    { id:'confirmed', label:'確定', color:'#2563eb', note:'パーツ待ち以降・受注済（実績前・返車まだ含む）' },
    { id:'planned',   label:'予定', color:'#38bdf8', note:'連絡中・見積提示済（受注できれば）' },
    { id:'prospect',  label:'見込', color:'#f59e0b', note:'入庫済・受注前（概算）' },
    { id:'forecast',  label:'予測', color:'#9ca3af', note:'未入庫予約・月内に実績化できる（概算）' }
  ];
  var TIER_BY = {}; TIERS.forEach(function(t){ TIER_BY[t.id] = t; });

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function man(n){ var m = n/10000; return (Math.abs(m)>=100 ? Math.round(m) : Math.round(m*10)/10).toLocaleString() + '万'; }
  function pd(s){ var p=String(s||'').split('-'); return new Date(+p[0],(+p[1])-1,+p[2]); }
  function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function addStr(s, n){ var d=pd(s); d.setDate(d.getDate()+n); return ymdL(d); }
  function course(c){ if (c.division==='div1'||c.division==='div2') return c.division; return c.boardId==='import'?'div2':'div1'; }
  function estA(c){ return num(c.estAmount) || (window.pitEstAmount?num(pitEstAmount(c.workType)):0); }
  function holdOf(c){ if (c.estHoldDays!=null && c.estHoldDays!=='') return num(c.estHoldDays); return window.pitEstHold?num(pitEstHold(c.workType,c.dropType)):5; }

  // カードがどの確度区分に入るか（当月[moS,moE]・本日todayStr基準）。該当なしは null
  //  実績＝返車日がその月／予測＝その月に実績化する予約（当月・未来のみ）／確定・予定・見込＝進行中の車＝当月だけに計上（過去・未来の月には出さない）
  function tierOf(c, moS, moE, todayStr){
    if (!c || c.status==='scrap') return null;
    var st = c.status;
    if (st==='returned'){ var d=c.returnDateFinal||c.returnDate||''; return (d>=moS && d<=moE) ? 'actual' : null; }
    var isCurrent = (todayStr>=moS && todayStr<=moE);
    var isFuture  = (moS > todayStr);
    if (st==='reserved'){
      if (!(isCurrent || isFuture)) return null;   // 過去月には予測を出さない
      var rd=c.reserveDate||''; if(!rd || rd>moE) return null;
      var doneBy=addStr(rd, Math.max(0, holdOf(c)));
      return (doneBy>=moS && doneBy<=moE) ? 'forecast' : null;   // その月に実績化できる予約だけ
    }
    if (!isCurrent) return null;   // 進行中（確定/予定/見込）は当月のみ
    if (c.returnStage || ['parts','work','workDone','outsource'].indexOf(st)>=0) return 'confirmed';
    if (st==='contact') return 'planned';
    if (st==='check' || st==='estim') return 'prospect';
    return null;
  }
  function amtOf(c, tier){
    if (tier==='actual')    return num(c.amountFinal)||num(c.amountOrder)||estA(c);
    if (tier==='confirmed') return num(c.amountOrder)||num(c.amountFinal)||num(c.amountQuote)||estA(c);
    if (tier==='planned')   return num(c.amountQuote)||estA(c);
    return estA(c);   // prospect / forecast ＝概算
  }

  function target(){ var t=(state.settings&&state.settings.target)||{}; return { min: num(t.monthMin)||15000000, max: num(t.monthMax)||20000000 }; }

  // ===== 当月の集計 =====
  function collectMonth(moS, moE){
    var _td = new Date(); _td.setHours(0,0,0,0); var todayStr = ymdL(_td);
    var tiers = {}; TIERS.forEach(function(t){ tiers[t.id] = { sum:0, count:0 }; });
    var byCourse = { div1:{}, div2:{} };
    ['div1','div2'].forEach(function(k){ TIERS.forEach(function(t){ byCourse[k][t.id]={sum:0,count:0}; }); });
    var lastDay = pd(moE).getDate();
    var dayActual = []; for (var i=0;i<=lastDay;i++) dayActual[i]=0;   // 1..lastDay
    var fronts = {};   // frontStaff -> {actual,confirmed,planned,count}
    (state.cards||[]).forEach(function(c){
      var tier = tierOf(c, moS, moE, todayStr); if (!tier) return;
      var amt = amtOf(c, tier);
      tiers[tier].sum += amt; tiers[tier].count++;
      var cs = course(c); byCourse[cs][tier].sum += amt; byCourse[cs][tier].count++;
      if (tier==='actual'){
        var d = c.returnDateFinal||c.returnDate||''; var dd = pd(d).getDate();
        if (dd>=1 && dd<=lastDay) dayActual[dd] += amt;
      }
      if (tier==='actual' || tier==='confirmed' || tier==='planned'){
        var fn = (c.frontStaff||c.staff||'（未割当）');
        if (!fronts[fn]) fronts[fn] = { actual:0, confirmed:0, planned:0, count:0 };
        fronts[fn][tier] += amt; fronts[fn].count++;
      }
    });
    // 日次累計
    var cum = []; cum[0]=0; for (var k=1;k<=lastDay;k++) cum[k] = cum[k-1] + dayActual[k];
    return { tiers:tiers, byCourse:byCourse, lastDay:lastDay, cum:cum, fronts:fronts };
  }

  function sumTiers(t, ids){ var s=0; ids.forEach(function(id){ s += t[id].sum; }); return s; }

  // ===== SVG：日次進捗チャート =====
  function dailyChartSvg(cum, lastDay, todayIdx, min, max, landing){
    var W=720, H=232, padL=52, padR=16, padT=16, padB=28;
    var pw=W-padL-padR, ph=H-padT-padB;
    var yMax = (Math.max(max, landing, cum[lastDay]||0, min) || 1) * 1.08;
    function X(day){ return padL + pw * (lastDay<=1 ? 0 : (day-1)/(lastDay-1)); }
    function Y(v){ return padT + ph * (1 - v/yMax); }
    var s = '<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" role="img">';
    [0, min, max].forEach(function(v){ var y=Y(v); s+='<line class="sv-grid" x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'"/>'; s+='<text class="sv-ylab" x="'+(padL-6)+'" y="'+(y+3)+'" text-anchor="end">'+man(v)+'</text>'; });
    // 目標ペース（0→max / 0→min）
    s+='<line class="sv-pace sv-pace-max" x1="'+X(1)+'" y1="'+Y(0)+'" x2="'+X(lastDay)+'" y2="'+Y(max)+'"/>';
    s+='<line class="sv-pace sv-pace-min" x1="'+X(1)+'" y1="'+Y(0)+'" x2="'+X(lastDay)+'" y2="'+Y(min)+'"/>';
    if (todayIdx>=1){
      var pts=[]; for(var k=1;k<=todayIdx;k++){ pts.push(X(k).toFixed(1)+','+Y(cum[k]).toFixed(1)); }
      s+='<path class="sv-actual-area" d="M'+X(1).toFixed(1)+','+Y(0).toFixed(1)+' L'+pts.join(' L')+' L'+X(todayIdx).toFixed(1)+','+Y(0).toFixed(1)+' Z"/>';
      s+='<polyline class="sv-actual-line" points="'+pts.join(' ')+'"/>';
      if (todayIdx < lastDay) s+='<line class="sv-proj" x1="'+X(todayIdx).toFixed(1)+'" y1="'+Y(cum[todayIdx]).toFixed(1)+'" x2="'+X(lastDay).toFixed(1)+'" y2="'+Y(landing).toFixed(1)+'"/>';
      s+='<circle class="sv-actual-dot" cx="'+X(todayIdx).toFixed(1)+'" cy="'+Y(cum[todayIdx]).toFixed(1)+'" r="3.5"/>';
      s+='<line class="sv-today" x1="'+X(todayIdx).toFixed(1)+'" y1="'+padT+'" x2="'+X(todayIdx).toFixed(1)+'" y2="'+(padT+ph)+'"/>';
    }
    var step = Math.max(1, Math.ceil(lastDay/8));
    for(var d=1; d<=lastDay; d+=step){ s+='<text class="sv-xlab" x="'+X(d).toFixed(1)+'" y="'+(H-9)+'" text-anchor="middle">'+d+'</text>'; }
    if ((lastDay-1)%step!==0) s+='<text class="sv-xlab" x="'+X(lastDay).toFixed(1)+'" y="'+(H-9)+'" text-anchor="middle">'+lastDay+'</text>';
    s+='</svg>';
    return s;
  }

  // ===== SVG：確度別の積み上げ横バー（着地見込み） =====
  function stackBarSvg(tiers, min, max, landing){
    var W=720, H=54, padL=8, padR=8, padT=10, h=22;
    var pw=W-padL-padR;
    var scale = Math.max(max, landing, 1) * 1.02;
    function w(v){ return pw * v/scale; }
    var s='<svg class="sv-stack" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';
    s+='<rect class="sv-stack-bg" x="'+padL+'" y="'+padT+'" width="'+pw+'" height="'+h+'" rx="6"/>';
    var x=padL;
    TIERS.forEach(function(t){ var v=tiers[t.id].sum; if (v<=0) return; var ww=w(v); s+='<rect x="'+x.toFixed(1)+'" y="'+padT+'" width="'+Math.max(0,ww).toFixed(1)+'" height="'+h+'" fill="'+t.color+'"><title>'+t.label+' '+man(v)+'</title></rect>'; x+=ww; });
    // 目標マーカー（min / max）
    [{v:min,c:'#e5e7eb',lb:'最低 '+man(min)},{v:max,c:'#fbbf24',lb:'最高 '+man(max)}].forEach(function(mk){ var mx=padL+w(mk.v); s+='<line class="sv-mk" x1="'+mx.toFixed(1)+'" y1="'+(padT-6)+'" x2="'+mx.toFixed(1)+'" y2="'+(padT+h+6)+'" stroke="'+mk.c+'"/>'; s+='<text class="sv-mk-lb" x="'+mx.toFixed(1)+'" y="'+(padT+h+18)+'" text-anchor="middle">'+mk.lb+'</text>'; });
    s+='</svg>';
    return s;
  }

  // ===== SVG：ミニ積み上げ（課別） =====
  function miniStack(tiersC, scale){
    var pw=100, h=12; var s='<svg class="sv-mini" viewBox="0 0 100 12" preserveAspectRatio="none">';
    s+='<rect x="0" y="0" width="100" height="12" rx="3" class="sv-stack-bg"/>';
    var x=0; TIERS.forEach(function(t){ var v=tiersC[t.id].sum; if(v<=0) return; var ww=pw*v/(scale||1); s+='<rect x="'+x.toFixed(1)+'" y="0" width="'+Math.max(0,ww).toFixed(1)+'" height="12" fill="'+t.color+'"/>'; x+=ww; });
    s+='</svg>'; return s;
  }

  // ===== 当月ビュー =====
  function renderMonth(wrap){
    var ym = window._svYM;
    var moS = ymdL(new Date(ym.y, ym.m, 1));
    var moE = ymdL(new Date(ym.y, ym.m+1, 0));
    var data = collectMonth(moS, moE);
    var t = data.tiers;
    var tg = target();
    var landing = sumTiers(t, ['actual','confirmed','planned','prospect','forecast']);
    var committed = sumTiers(t, ['actual','confirmed']);
    var actual = t.actual.sum;

    // 今日の位置（当月なら本日まで／過去月は満了／未来月は0）
    var today = new Date(); today.setHours(0,0,0,0);
    var isThis = (today.getFullYear()===ym.y && today.getMonth()===ym.m);
    var todayIdx = isThis ? today.getDate() : (ymdL(today) > moE ? data.lastDay : 0);
    var paceTarget = tg.min * (todayIdx/data.lastDay);   // 本日時点の目標ペース(最低)
    var pacePct = paceTarget>0 ? Math.round(actual/paceTarget*100) : 0;

    var h = '';
    h += header('month', ym);

    // ヒーロー：着地見込み
    h += '<div class="sv-hero">';
    h += '<div class="sv-hero-row">';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">実績（返車済み）</div><div class="sv-hero-num" style="color:#1db97a">'+man(actual)+'<span>円</span></div>'
       + '<div class="sv-hero-sub">目標 '+man(tg.min)+'〜'+man(tg.max)+' ／ 達成率 <b>'+(tg.min>0?Math.round(actual/tg.min*100):0)+'%</b>（最低比）</div></div>';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">着地見込み（実績＋パイプライン）</div><div class="sv-hero-num" style="color:'+(landing>=tg.min?'#1db97a':'#f59e0b')+'">'+man(landing)+'<span>円</span></div>'
       + '<div class="sv-hero-sub">確度高（実績＋確定）だけで <b>'+man(committed)+'</b></div></div>';
    if (isThis && todayIdx>0){
      var pc = pacePct>=100?'ok':(pacePct>=85?'near':'warn');
      h += '<div class="sv-hero-pace sv-pace-'+pc+'"><div class="sv-hero-lb">本日ペース</div><div class="sv-hero-num">'+pacePct+'<span>%</span></div><div class="sv-hero-sub">'+man(actual)+' / ペース目安 '+man(paceTarget)+'</div></div>';
    }
    h += '</div>';
    h += stackBarSvg(t, tg.min, tg.max, landing);
    h += '</div>';

    // 日次進捗チャート
    h += '<div class="sv-card"><div class="sv-card-h"><span>📈 日次の進捗（返車＝実績の累計）</span><span class="sv-legend">'
       + '<i class="sv-lg sv-lg-actual"></i>実績累計 <i class="sv-lg sv-lg-proj"></i>着地予測 <i class="sv-lg sv-lg-min"></i>最低ペース <i class="sv-lg sv-lg-max"></i>最高ペース</span></div>';
    h += dailyChartSvg(data.cum, data.lastDay, todayIdx, tg.min, tg.max, landing);
    h += '<div class="sv-note">実績は<b>返車済みになった日</b>で計上（返車が翌月なら翌月扱い）。点線＝残りを今のパイプラインで積んだ着地予測。</div></div>';

    // 確度別サマリー（6区分）
    h += '<div class="sv-tiers">';
    h += tierCard('target', '目標', '#eab308', man(tg.min)+'〜'+man(tg.max), '', '月目標（最低〜最高）');
    TIERS.forEach(function(tt){ h += tierCard(tt.id, tt.label, tt.color, man(t[tt.id].sum), t[tt.id].count+'台', tt.note); });
    h += '</div>';

    // 課別（1課/2課）
    var scaleC = Math.max(tg.max/1, sumTiers(data.byCourse.div1,['actual','confirmed','planned','prospect','forecast']), sumTiers(data.byCourse.div2,['actual','confirmed','planned','prospect','forecast']),1);
    h += '<div class="sv-courses">';
    [{id:'div1',label:'1課',team:'🚗 国産',color:'#1db97a'},{id:'div2',label:'2課',team:'🌍 輸入',color:'#ec4899'}].forEach(function(d){
      var cc=data.byCourse[d.id];
      var cLanding=sumTiers(cc,['actual','confirmed','planned','prospect','forecast']);
      h += '<div class="sv-course" style="--cc:'+d.color+'">';
      h += '<div class="sv-course-h"><span class="sv-course-pill" style="background:'+d.color+'">'+d.label+'</span><span class="sv-course-team">'+d.team+'</span><span class="sv-course-land">着地 '+man(cLanding)+'</span></div>';
      h += miniStack(cc, scaleC);
      h += '<div class="sv-course-grid">';
      TIERS.forEach(function(tt){ h += '<div class="sv-cc"><span class="sv-cc-dot" style="background:'+tt.color+'"></span><span class="sv-cc-l">'+tt.label+'</span><b>'+man(cc[tt.id].sum)+'</b><i>'+cc[tt.id].count+'台</i></div>'; });
      h += '</div></div>';
    });
    h += '</div>';

    // フロント別
    h += frontTable(data.fronts);

    h += '<div class="sv-foot">金額の取り方：実績＝確定額(amountFinal)／確定＝受注額／予定＝見積額／見込・予測＝概算（作業タイプ別平均）。数字はすべて円。</div>';
    wrap.innerHTML = h;
  }

  function tierCard(id, label, color, big, sub, note){
    return '<div class="sv-tier" style="--tc:'+color+'"><div class="sv-tier-top"><span class="sv-tier-dot" style="background:'+color+'"></span><span class="sv-tier-l">'+label+'</span>'+(sub?'<span class="sv-tier-cnt">'+sub+'</span>':'')+'</div>'
      + '<div class="sv-tier-num">'+big+'</div><div class="sv-tier-note">'+esc(note)+'</div></div>';
  }

  function frontTable(fronts){
    var rows = Object.keys(fronts).map(function(k){ var f=fronts[k]; return { name:k, actual:f.actual, confirmed:f.confirmed, planned:f.planned, count:f.count, total:f.actual+f.confirmed+f.planned }; });
    rows.sort(function(a,b){ return b.actual-a.actual || b.total-a.total; });
    var h = '<div class="sv-card"><div class="sv-card-h"><span>🧑‍🔧 フロント別（実績・確定・予定）</span></div>';
    if (!rows.length){ h += '<div class="sv-empty">対象データがありません</div></div>'; return h; }
    h += '<table class="sv-table"><thead><tr><th>フロント</th><th>実績</th><th>確定</th><th>予定</th><th>台数</th></tr></thead><tbody>';
    rows.forEach(function(r){ h += '<tr><td class="sv-td-name">'+esc(r.name)+'</td><td class="sv-num" style="color:#1db97a">'+man(r.actual)+'</td><td class="sv-num" style="color:#2563eb">'+man(r.confirmed)+'</td><td class="sv-num" style="color:#38bdf8">'+man(r.planned)+'</td><td class="sv-num">'+r.count+'</td></tr>'; });
    h += '</tbody></table></div>';
    return h;
  }

  // ===== 月間ビュー（通年・昨対） =====
  function renderYear(wrap){
    var y = window._svYear;   // 会計年度の締め年（11月が属する暦年）＝12月(前年)〜11月(この年)
    var tg = target();
    var SLOT = [12,1,2,3,4,5,6,7,8,9,10,11];   // スロット→表示月（0=12月）
    var monA = []; var monP = []; for (var i=0;i<12;i++){ monA[i]=0; monP[i]=0; }
    (state.cards||[]).forEach(function(c){
      if (c.status!=='returned') return;
      var d = c.returnDateFinal||c.returnDate||''; if (!d) return;
      var dd = pd(d); var amt = num(c.amountFinal)||num(c.amountOrder)||estA(c);
      var cm=dd.getMonth(), cy=dd.getFullYear();
      var fy=(cm===11)?cy+1:cy, slot=(cm===11)?0:cm+1;   // 12月は翌年11月締めの年度・スロット0
      if (fy===y) monA[slot] += amt; else if (fy===y-1) monP[slot] += amt;
    });
    var yTotal = monA.reduce(function(a,b){return a+b;},0);
    var pTotal = monP.reduce(function(a,b){return a+b;},0);
    var hasPrev = pTotal>0;
    var rangeLbl = (y-1)+'年12月〜'+y+'年11月';
    var prevRange = (y-2)+'/12〜'+(y-1)+'/11';

    var h = '';
    h += header('year', {y:y});
    h += '<div class="sv-hero"><div class="sv-hero-row">';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">今年度 実績合計（'+rangeLbl+'・返車ベース）</div><div class="sv-hero-num" style="color:#1db97a">'+man(yTotal)+'<span>円</span></div><div class="sv-hero-sub">年目標 '+man(tg.min*12)+'〜'+man(tg.max*12)+'</div></div>';
    if (hasPrev){ var diff=yTotal-pTotal; h += '<div class="sv-hero-main"><div class="sv-hero-lb">前年度（'+prevRange+'）</div><div class="sv-hero-num" style="color:#9ca3af">'+man(pTotal)+'<span>円</span></div><div class="sv-hero-sub">昨対 <b style="color:'+(diff>=0?'#1db97a':'#ef4444')+'">'+(diff>=0?'+':'')+man(diff)+'</b></div></div>'; }
    h += '</div></div>';

    h += '<div class="sv-card"><div class="sv-card-h"><span>📊 月別 実績と目標</span><span class="sv-legend"><i class="sv-lg sv-lg-actual"></i>今年度'+(hasPrev?' <i class="sv-lg sv-lg-prev"></i>前年度':'')+' <i class="sv-lg sv-lg-min"></i>月目標(最低)</span></div>';
    h += yearChartSvg(monA, monP, tg.min, hasPrev, SLOT);
    if (!hasPrev) h += '<div class="sv-note">前年度（'+prevRange+'）の返車実績がまだ無いため、昨対は表示していません。データが貯まると自動で出ます。</div>';
    h += '</div>';

    // 月別テーブル
    h += '<div class="sv-card"><div class="sv-card-h"><span>月別内訳</span></div><table class="sv-table"><thead><tr><th>月</th><th>実績</th><th>目標(最低)</th><th>達成率</th>'+(hasPrev?'<th>前年度</th><th>昨対</th>':'')+'</tr></thead><tbody>';
    for (var m=0;m<12;m++){ var a=monA[m]; var pct=tg.min>0?Math.round(a/tg.min*100):0; var pcc=pct>=100?'#1db97a':(pct>=85?'#eab308':'#ef4444');
      h += '<tr><td class="sv-td-name">'+SLOT[m]+'月</td><td class="sv-num" style="color:#1db97a">'+man(a)+'</td><td class="sv-num">'+man(tg.min)+'</td><td class="sv-num" style="color:'+pcc+'">'+(a>0?pct+'%':'—')+'</td>';
      if (hasPrev){ var pv=monP[m]; var df=a-pv; h += '<td class="sv-num" style="color:#9ca3af">'+man(pv)+'</td><td class="sv-num" style="color:'+(df>=0?'#1db97a':'#ef4444')+'">'+(pv>0||a>0?(df>=0?'+':'')+man(df):'—')+'</td>'; }
      h += '</tr>';
    }
    h += '<tr class="sv-tr-total"><td class="sv-td-name">合計</td><td class="sv-num" style="color:#1db97a">'+man(yTotal)+'</td><td class="sv-num">'+man(tg.min*12)+'</td><td class="sv-num">'+(tg.min>0?Math.round(yTotal/(tg.min*12)*100):0)+'%</td>'+(hasPrev?'<td class="sv-num" style="color:#9ca3af">'+man(pTotal)+'</td><td class="sv-num" style="color:'+(yTotal-pTotal>=0?'#1db97a':'#ef4444')+'">'+((yTotal-pTotal>=0?'+':'')+man(yTotal-pTotal))+'</td>':'')+'</tr>';
    h += '</tbody></table></div>';

    h += '<div class="sv-foot">月間ビューは会計年度（12月〜翌11月）の返車済み実績を月別に集計しています。当月の詳しい進捗は「当月」タブへ。</div>';
    wrap.innerHTML = h;
  }

  function yearChartSvg(monA, monP, min, hasPrev, slot){
    var W=720, H=240, padL=52, padR=16, padT=16, padB=28;
    var pw=W-padL-padR, ph=H-padT-padB;
    var yMax = (Math.max(min, Math.max.apply(null, monA), hasPrev?Math.max.apply(null, monP):0) || 1) * 1.12;
    function Y(v){ return padT + ph*(1 - v/yMax); }
    var bw = pw/12; var barW = bw*(hasPrev?0.34:0.5);
    var s='<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
    [0, min].forEach(function(v){ var y=Y(v); s+='<line class="sv-grid'+(v===min?' sv-grid-min':'')+'" x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'"/>'; s+='<text class="sv-ylab" x="'+(padL-6)+'" y="'+(y+3)+'" text-anchor="end">'+man(v)+'</text>'; });
    for (var m=0;m<12;m++){
      var cx = padL + bw*m + bw/2;
      if (hasPrev){ var pvH=Y(0)-Y(monP[m]); s+='<rect class="sv-bar-prev" x="'+(cx-barW-1).toFixed(1)+'" y="'+Y(monP[m]).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,pvH).toFixed(1)+'"><title>'+slot[m]+'月 前年度 '+man(monP[m])+'</title></rect>'; }
      var aH=Y(0)-Y(monA[m]); var ax=hasPrev?(cx+1):(cx-barW/2);
      s+='<rect class="sv-bar-act" x="'+ax.toFixed(1)+'" y="'+Y(monA[m]).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,aH).toFixed(1)+'"><title>'+slot[m]+'月 '+man(monA[m])+'</title></rect>';
      s+='<text class="sv-xlab" x="'+cx.toFixed(1)+'" y="'+(H-9)+'" text-anchor="middle">'+slot[m]+'</text>';
    }
    s+='</svg>';
    return s;
  }

  // ===== 作業グループ（車検 > 12点 > 一般。複数ラベルは上位優先・下位切り捨て） =====
  var WGROUPS = [
    { id:'shaken', label:'車検', color:'#ef4444' },
    { id:'12pt',   label:'12点', color:'#f97316' },
    { id:'general',label:'一般', color:'#84cc16' }
  ];
  function cardWorkIds(c){
    var a = (Array.isArray(c.workTypes)&&c.workTypes.length) ? c.workTypes.slice() : [];
    if (c.workType && a.indexOf(c.workType)<0) a.unshift(c.workType);
    (Array.isArray(c.workAddons)?c.workAddons:[]).forEach(function(x){ if(a.indexOf(x)<0) a.push(x); });
    return a;
  }
  function workGroupOf(c){ var ids=cardWorkIds(c); if(ids.indexOf('shaken')>=0) return 'shaken'; if(ids.indexOf('12pt')>=0) return '12pt'; return 'general'; }
  function workSubLabel(c){ var ids=cardWorkIds(c).filter(function(x){return x!=='shaken'&&x!=='12pt';}); var order=['general','oil','bp','coat1y','coat3m']; for(var i=0;i<order.length;i++){ if(ids.indexOf(order[i])>=0) return order[i]; } return ids[0]||'general'; }
  function wtLabel(id){ var w=(state.workTypes||[]).find(function(x){return x.id===id;}); return w?w.label:id; }
  function actAmt(c){ return num(c.amountFinal)||num(c.amountOrder)||estA(c); }

  // 受注日(ms)：ログの to==='parts'（連絡中→パーツ待ち）を優先、無ければ c.orderedAt
  function orderDateMs(c){
    if (Array.isArray(c.log)){ for(var i=0;i<c.log.length;i++){ var e=c.log[i]; if(e && e.type==='phase' && e.to==='parts' && e.at) return e.at; } }
    if (c.orderedAt) return c.orderedAt;
    return null;
  }
  function qOfDay(dd){ return dd<=7?0:dd<=15?1:dd<=23?2:3; }
  function qAlloc(y, m1){ if (window.pitQAlloc){ try{ return pitQAlloc(y, m1); }catch(e){} } return null; }

  // ================= クォーター：当月（月4分割） =================
  function renderQuarterMonth(wrap){
    var ym=window._svYM, y=ym.y, m=ym.m;
    var moS=ymdL(new Date(y,m,1)), moE=ymdL(new Date(y,m+1,0));
    var data=collectMonth(moS,moE), tg=target();
    var last=new Date(y,m+1,0).getDate();
    var qs=[{f:1,t:7},{f:8,t:15},{f:16,t:23},{f:24,t:last}];
    var qAct=[0,0,0,0], qCnt=[0,0,0,0], qMin=[0,0,0,0], qMax=[0,0,0,0];
    (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var d=c.returnDateFinal||c.returnDate||''; if(d<moS||d>moE)return; var qi=qOfDay(pd(d).getDate()); qAct[qi]+=actAmt(c); qCnt[qi]++; });
    var al=qAlloc(y,m+1);
    for(var i=0;i<4;i++){ qMin[i]=al?al.q[i].min:Math.round(tg.min/4); qMax[i]=al?al.q[i].max:Math.round(tg.max/4); }
    var today=new Date(); var isThis=(today.getFullYear()===y&&today.getMonth()===m);
    var todayQ=isThis?qOfDay(today.getDate()):(ymdL(today)>moE?3:-1);
    var actualM=data.tiers.actual.sum, landing=sumTiers(data.tiers,['actual','confirmed','planned','prospect','forecast']);
    var h=header('month',ym);
    h+='<div class="sv-hero"><div class="sv-hero-row"><div class="sv-hero-main"><div class="sv-hero-lb">当月 実績（返車済み）</div><div class="sv-hero-num" style="color:#1db97a">'+man(actualM)+'<span>円</span></div><div class="sv-hero-sub">月目標 '+man(tg.min)+'〜'+man(tg.max)+' ／ 着地見込 '+man(landing)+'</div></div></div></div>';
    h+='<div class="sv-card"><div class="sv-card-h"><span>📆 クォーター進捗（月4分割・営業日配分）</span><span class="sv-legend"><i class="sv-lg sv-lg-actual"></i>実績累計 <i class="sv-lg sv-lg-min"></i>目標累計(最低)</span></div>';
    h+=quarterChartSvg(qAct,qMin,todayQ);
    h+='<div class="sv-note">クォーター＝1〜7 / 8〜15 / 16〜23 / 24〜末。目標は営業日数で配分（÷4ではない）。実績は返車日で計上。</div></div>';
    h+='<div class="sv-qcards">';
    for(i=0;i<4;i++){ var pct=qMin[i]>0?Math.round(qAct[i]/qMin[i]*100):0; var pc=pct>=100?'ok':(pct>=85?'near':'warn');
      h+='<div class="sv-qcard'+(i===todayQ?' now':'')+'"><div class="sv-qcard-h">Q'+(i+1)+' <span>'+qs[i].f+'〜'+qs[i].t+'日</span>'+(i===todayQ?'<em>進行中</em>':'')+'</div>';
      h+='<div class="sv-qcard-num" style="color:#1db97a">'+man(qAct[i])+'</div>';
      h+='<div class="sv-qbar"><i class="sv-'+pc+'" style="width:'+Math.min(100,pct)+'%"></i></div>';
      h+='<div class="sv-qcard-sub">目標 '+man(qMin[i])+'〜'+man(qMax[i])+' ／ <b class="sv-'+pc+'">'+pct+'%</b> ／ '+qCnt[i]+'台</div></div>';
    }
    h+='</div>';
    h+='<div class="sv-foot">クォーターは以前決めた月4分割ベース。金額・確度の考え方は「売上」タブと同じ（実績＝返車済み）。</div>';
    wrap.innerHTML=h;
  }
  function quarterChartSvg(qAct,qMin,todayQ){
    var W=720,H=200,padL=52,padR=16,padT=14,padB=26,pw=W-padL-padR,ph=H-padT-padB;
    var cumA=[],cumM=[],a=0,mn=0; for(var i=0;i<4;i++){ a+=qAct[i];mn+=qMin[i];cumA[i]=a;cumM[i]=mn; }
    var yMax=(Math.max(mn,cumA[3])||1)*1.08;
    function X(i){return padL+pw*(i/3);} function Y(v){return padT+ph*(1-v/yMax);}
    var s='<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
    [0,mn].forEach(function(v){ var yy=Y(v); s+='<line class="sv-grid" x1="'+padL+'" y1="'+yy+'" x2="'+(W-padR)+'" y2="'+yy+'"/>'; s+='<text class="sv-ylab" x="'+(padL-6)+'" y="'+(yy+3)+'" text-anchor="end">'+man(v)+'</text>'; });
    var pm=[]; for(i=0;i<4;i++) pm.push(X(i).toFixed(1)+','+Y(cumM[i]).toFixed(1));
    s+='<polyline class="sv-pace sv-pace-min" points="'+pm.join(' ')+'"/>';
    var upto=todayQ<0?3:todayQ, pa=[]; for(i=0;i<=upto;i++) pa.push(X(i).toFixed(1)+','+Y(cumA[i]).toFixed(1));
    if(pa.length){ s+='<polyline class="sv-actual-line" points="'+pa.join(' ')+'"/>'; for(i=0;i<=upto;i++) s+='<circle class="sv-actual-dot" cx="'+X(i).toFixed(1)+'" cy="'+Y(cumA[i]).toFixed(1)+'" r="3"/>'; }
    for(i=0;i<4;i++) s+='<text class="sv-xlab" x="'+X(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">Q'+(i+1)+'</text>';
    s+='</svg>'; return s;
  }
  // ================= クォーター：月間（年度・月×Qヒートマップ） =================
  function hmColor(pct){ if(pct<0)return 'var(--bg3)'; if(pct>=110)return 'rgba(29,185,122,.55)'; if(pct>=100)return 'rgba(29,185,122,.40)'; if(pct>=85)return 'rgba(234,179,8,.35)'; if(pct>=60)return 'rgba(249,115,22,.32)'; return 'rgba(239,68,68,.30)'; }
  function renderQuarterYear(wrap){
    var Y=window._svYear, tg=target(), SLOT=[12,1,2,3,4,5,6,7,8,9,10,11];
    var grid=[]; for(var i=0;i<12;i++){ grid[i]=[{act:0,min:0},{act:0,min:0},{act:0,min:0},{act:0,min:0}]; }
    function slotToYM(slot){ var cm=(slot===0)?11:slot-1, cy=(slot===0)?Y-1:Y; return {y:cy,m:cm}; }
    for(i=0;i<12;i++){ var ymo=slotToYM(i); var al=qAlloc(ymo.y,ymo.m+1); for(var q=0;q<4;q++){ grid[i][q].min=al?al.q[q].min:Math.round(tg.min/4); } }
    (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var d=c.returnDateFinal||c.returnDate||''; if(!d)return; var dd=pd(d),cm=dd.getMonth(),cy=dd.getFullYear(); var fy=(cm===11)?cy+1:cy; if(fy!==Y)return; var slot=(cm===11)?0:cm+1; grid[slot][qOfDay(dd.getDate())].act+=actAmt(c); });
    var h=header('year',{y:Y});
    h+='<div class="sv-card"><div class="sv-card-h"><span>🔥 クォーター達成率ヒートマップ（年度・月×Q）</span><span class="sv-legend">達成率 低 <i class="sv-hm-lg"></i> 高</span></div>';
    h+='<table class="sv-hm"><thead><tr><th></th><th>Q1<br><i>1-7</i></th><th>Q2<br><i>8-15</i></th><th>Q3<br><i>16-23</i></th><th>Q4<br><i>24-末</i></th><th>月計</th></tr></thead><tbody>';
    for(i=0;i<12;i++){ h+='<tr><td class="sv-hm-mo">'+SLOT[i]+'月</td>'; var moAct=0,moMin=0;
      for(q=0;q<4;q++){ var cell=grid[i][q]; var pct=cell.min>0?Math.round(cell.act/cell.min*100):0; moAct+=cell.act; moMin+=cell.min; h+='<td class="sv-hm-c" style="background:'+hmColor(cell.act>0?pct:-1)+'"><b>'+(cell.act>0?pct+'%':'—')+'</b><i>'+man(cell.act)+'</i></td>'; }
      var mp=moMin>0?Math.round(moAct/moMin*100):0; h+='<td class="sv-hm-tot"><b>'+(moAct>0?mp+'%':'—')+'</b><i>'+man(moAct)+'</i></td></tr>';
    }
    h+='</tbody></table></div>';
    h+='<div class="sv-note">セル＝そのクォーターの達成率（実績÷営業日配分の目標最低）。濃い緑ほど達成・赤いほど未達・—は実績なし。</div>';
    h+='<div class="sv-foot">会計年度（12月〜翌11月）・返車ベース。</div>';
    wrap.innerHTML=h;
  }

  // ================= 作業内容 =================
  function collectWork(moS,moE){
    var g={}; WGROUPS.forEach(function(w){ g[w.id]={div1:{sum:0,cnt:0},div2:{sum:0,cnt:0},sum:0,cnt:0}; });
    var sub={};
    (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var d=c.returnDateFinal||c.returnDate||''; if(d<moS||d>moE)return; var amt=actAmt(c); var grp=workGroupOf(c), cs=course(c);
      g[grp][cs].sum+=amt; g[grp][cs].cnt++; g[grp].sum+=amt; g[grp].cnt++;
      if(grp==='general'){ var sl=workSubLabel(c); if(!sub[sl])sub[sl]={div1:{sum:0,cnt:0},div2:{sum:0,cnt:0},sum:0,cnt:0}; sub[sl][cs].sum+=amt; sub[sl][cs].cnt++; sub[sl].sum+=amt; sub[sl].cnt++; }
    });
    return {g:g,sub:sub};
  }
  function workBarSvg(w){
    var max=Math.max.apply(null,WGROUPS.map(function(x){return w.g[x.id].sum;}).concat([1]));
    var W=720,rowH=36,padL=56,padR=66,padT=6,pw=720-padL-padR,H=padT+WGROUPS.length*rowH+4;
    var s='<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
    WGROUPS.forEach(function(x,idx){ var gg=w.g[x.id]; var yy=padT+idx*rowH+7; var w1=pw*gg.div1.sum/max, w2=pw*gg.div2.sum/max;
      s+='<text class="sv-ylab" x="'+(padL-8)+'" y="'+(yy+15)+'" text-anchor="end">'+x.label+'</text>';
      s+='<rect x="'+padL+'" y="'+yy+'" width="'+Math.max(0,w1).toFixed(1)+'" height="20" fill="#1db97a"><title>国産 '+man(gg.div1.sum)+'</title></rect>';
      s+='<rect x="'+(padL+w1).toFixed(1)+'" y="'+yy+'" width="'+Math.max(0,w2).toFixed(1)+'" height="20" fill="#ec4899"><title>輸入 '+man(gg.div2.sum)+'</title></rect>';
      s+='<text class="sv-xlab" x="'+Math.min(W-2,padL+w1+w2+6).toFixed(1)+'" y="'+(yy+15)+'">'+man(gg.sum)+'</text>';
    });
    s+='</svg>'; return s;
  }
  function renderWorkMonth(wrap){
    var ym=window._svYM; var w=collectWork(ymdL(new Date(ym.y,ym.m,1)),ymdL(new Date(ym.y,ym.m+1,0)));
    var total=WGROUPS.reduce(function(a,x){return a+w.g[x.id].sum;},0)||1;
    var h=header('month',ym);
    h+='<div class="sv-card"><div class="sv-card-h"><span>🔧 作業内容グループ別（国産／輸入・返車実績）</span></div>';
    h+='<table class="sv-table"><thead><tr><th>作業</th><th>国産</th><th>輸入</th><th>合計</th><th>台数</th><th>平均単価</th><th>構成比</th></tr></thead><tbody>';
    WGROUPS.forEach(function(x){ var gg=w.g[x.id]; var avg=gg.cnt?gg.sum/gg.cnt:0;
      h+='<tr><td class="sv-td-name"><span class="sv-cc-dot" style="background:'+x.color+'"></span> '+x.label+'</td><td class="sv-num">'+man(gg.div1.sum)+'</td><td class="sv-num">'+man(gg.div2.sum)+'</td><td class="sv-num" style="color:#1db97a">'+man(gg.sum)+'</td><td class="sv-num">'+gg.cnt+'</td><td class="sv-num">'+man(avg)+'</td><td class="sv-num">'+Math.round(gg.sum/total*100)+'%</td></tr>';
      if(x.id==='general'){ Object.keys(w.sub).sort(function(a,b){return w.sub[b].sum-w.sub[a].sum;}).forEach(function(sl){ var ss=w.sub[sl]; var av=ss.cnt?ss.sum/ss.cnt:0; h+='<tr class="sv-sub"><td class="sv-td-name">└ '+esc(wtLabel(sl))+'</td><td class="sv-num">'+man(ss.div1.sum)+'</td><td class="sv-num">'+man(ss.div2.sum)+'</td><td class="sv-num">'+man(ss.sum)+'</td><td class="sv-num">'+ss.cnt+'</td><td class="sv-num">'+man(av)+'</td><td class="sv-num"></td></tr>'; }); }
    });
    h+='</tbody></table></div>';
    h+='<div class="sv-card"><div class="sv-card-h"><span>グループ×課 内訳</span><span class="sv-legend"><i class="sv-lg" style="border-top-color:#1db97a"></i>国産 <i class="sv-lg" style="border-top-color:#ec4899"></i>輸入</span></div>'+workBarSvg(w)+'</div>';
    h+='<div class="sv-foot">車検＞12点＞一般の優先で1台1グループに集計（複数ラベルは上位採用・下位切り捨て）。一般はその下で細分。返車済み実績ベース。</div>';
    wrap.innerHTML=h;
  }
  function renderWorkYear(wrap){
    var Y=window._svYear, SLOT=[12,1,2,3,4,5,6,7,8,9,10,11];
    var mon=[]; for(var i=0;i<12;i++){ mon[i]={shaken:0,'12pt':0,general:0}; }
    (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var d=c.returnDateFinal||c.returnDate||''; if(!d)return; var dd=pd(d),cm=dd.getMonth(),cy=dd.getFullYear(); var fy=(cm===11)?cy+1:cy; if(fy!==Y)return; var slot=(cm===11)?0:cm+1; mon[slot][workGroupOf(c)]+=actAmt(c); });
    var h=header('year',{y:Y});
    h+='<div class="sv-card"><div class="sv-card-h"><span>🔧 作業グループ 月別推移（年度）</span><span class="sv-legend">'+WGROUPS.map(function(x){return '<i class="sv-lg" style="border-top-color:'+x.color+'"></i>'+x.label;}).join(' ')+'</span></div>'+workYearChart(mon,SLOT)+'</div>';
    var tot={shaken:0,'12pt':0,general:0}; mon.forEach(function(mm){ tot.shaken+=mm.shaken;tot['12pt']+=mm['12pt'];tot.general+=mm.general; });
    h+='<div class="sv-card"><div class="sv-card-h"><span>月別内訳</span></div><table class="sv-table"><thead><tr><th>月</th>'+WGROUPS.map(function(x){return '<th>'+x.label+'</th>';}).join('')+'<th>計</th></tr></thead><tbody>';
    for(i=0;i<12;i++){ var mm=mon[i]; var mt=mm.shaken+mm['12pt']+mm.general; h+='<tr><td class="sv-td-name">'+SLOT[i]+'月</td><td class="sv-num">'+man(mm.shaken)+'</td><td class="sv-num">'+man(mm['12pt'])+'</td><td class="sv-num">'+man(mm.general)+'</td><td class="sv-num" style="color:#1db97a">'+man(mt)+'</td></tr>'; }
    h+='<tr class="sv-tr-total"><td class="sv-td-name">合計</td><td class="sv-num">'+man(tot.shaken)+'</td><td class="sv-num">'+man(tot['12pt'])+'</td><td class="sv-num">'+man(tot.general)+'</td><td class="sv-num" style="color:#1db97a">'+man(tot.shaken+tot['12pt']+tot.general)+'</td></tr>';
    h+='</tbody></table></div><div class="sv-foot">会計年度・返車ベース。車検＞12点＞一般の優先で1台1グループ。</div>';
    wrap.innerHTML=h;
  }
  function workYearChart(mon,SLOT){
    var W=720,H=240,padL=52,padR=16,padT=14,padB=26,pw=W-padL-padR,ph=H-padT-padB;
    var max=Math.max.apply(null,mon.map(function(m){return m.shaken+m['12pt']+m.general;}).concat([1]))*1.1;
    function Y(v){return padT+ph*(1-v/max);}
    var bw=pw/12, barW=bw*0.6;
    var s='<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet"><line class="sv-grid" x1="'+padL+'" y1="'+Y(0)+'" x2="'+(W-padR)+'" y2="'+Y(0)+'"/>';
    for(var i=0;i<12;i++){ var cx=padL+bw*i+bw/2, mm=mon[i], yb=Y(0);
      [['shaken',WGROUPS[0].color],['12pt',WGROUPS[1].color],['general',WGROUPS[2].color]].forEach(function(pair){ var v=mm[pair[0]]; if(v<=0)return; var hgt=Y(0)-Y(v); yb-=hgt; s+='<rect x="'+(cx-barW/2).toFixed(1)+'" y="'+yb.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+hgt.toFixed(1)+'" fill="'+pair[1]+'"><title>'+SLOT[i]+'月 '+wtLabel(pair[0])+' '+man(v)+'</title></rect>'; });
      s+='<text class="sv-xlab" x="'+cx.toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+SLOT[i]+'</text>';
    }
    s+='</svg>'; return s;
  }

  // ================= フロント =================
  function collectFront(fromStr,toStr){
    var F={}; var DOW=7;
    function ensure(n){ if(!F[n]) F[n]={cnt:0,sum:0,hi:0,hold:0,holdN:0,odDays:0,odN:0,dow:[0,0,0,0,0,0,0],best:{}}; return F[n]; }
    (state.cards||[]).forEach(function(c){
      var fn=c.frontStaff||c.staff||'（未割当）';
      if(c.status==='returned'){ var d=c.returnDateFinal||c.returnDate||''; if(d>=fromStr&&d<=toStr){ var f=ensure(fn); var amt=actAmt(c); f.cnt++; f.sum+=amt; if(amt>f.hi)f.hi=amt; if(c.reserveDate){ var hd=Math.round((pd(d)-pd(c.reserveDate))/86400000); if(hd>=0){f.hold+=hd;f.holdN++;} } var grp=workGroupOf(c); f.best[grp]=(f.best[grp]||0)+amt; } }
      var om=orderDateMs(c); if(om){ var od=new Date(om); var ods=ymdL(od); if(ods>=fromStr&&ods<=toStr){ var f2=ensure(fn); if(c.reserveDate){ var odd=Math.round((od-pd(c.reserveDate))/86400000); if(odd>=0){f2.odDays+=odd;f2.odN++;} } f2.dow[od.getDay()]++; } }
    });
    return F;
  }
  function frontBody(F){
    var DOW=['日','月','火','水','木','金','土'];
    var rows=Object.keys(F).map(function(n){ var f=F[n]; var best='',bv=-1; Object.keys(f.best).forEach(function(g){ if(f.best[g]>bv){bv=f.best[g];best=g;} }); var dm=-1,di=-1; f.dow.forEach(function(v,i){ if(v>dm){dm=v;di=i;} });
      var bl=best?((WGROUPS.find(function(x){return x.id===best;})||{label:best}).label):'—';
      return { name:n, cnt:f.cnt, sum:f.sum, hi:f.hi, avg:f.cnt?f.sum/f.cnt:0, hold:f.holdN?f.hold/f.holdN:null, od:f.odN?f.odDays/f.odN:null, dow:dm>0?DOW[di]:'—', dowN:dm>0?dm:0, best:bl };
    });
    rows.sort(function(a,b){return b.sum-a.sum;});
    var h='<div class="sv-card"><div class="sv-card-h"><span>🧑‍🔧 フロント別 指標（得意・不得意の把握）</span></div>';
    if(!rows.length){ h+='<div class="sv-empty">対象データがありません</div></div>'; return h; }
    h+='<table class="sv-table"><thead><tr><th>フロント</th><th>台数</th><th>売上</th><th>平均単価</th><th>最高単価</th><th>預かり日数</th><th>受注まで</th><th>受注多い曜日</th><th>得意</th></tr></thead><tbody>';
    rows.forEach(function(r){ h+='<tr><td class="sv-td-name">'+esc(r.name)+'</td><td class="sv-num">'+r.cnt+'</td><td class="sv-num" style="color:#1db97a">'+man(r.sum)+'</td><td class="sv-num">'+man(r.avg)+'</td><td class="sv-num">'+man(r.hi)+'</td><td class="sv-num">'+(r.hold!=null?r.hold.toFixed(1)+'日':'—')+'</td><td class="sv-num">'+(r.od!=null?r.od.toFixed(1)+'日':'—')+'</td><td class="sv-num">'+r.dow+(r.dowN?'<i class="sv-down">('+r.dowN+')</i>':'')+'</td><td class="sv-num">'+esc(r.best)+'</td></tr>'; });
    h+='</tbody></table></div>';
    h+='<div class="sv-foot">台数・売上・平均/最高単価・預かり日数＝返車済み実績。受注まで日数・受注多い曜日＝連絡中→パーツ待ち（受注）に移った日を集計。得意＝売上が最大の作業グループ。</div>';
    return h;
  }
  function renderFrontMonth(wrap){ var ym=window._svYM; wrap.innerHTML=header('month',ym)+frontBody(collectFront(ymdL(new Date(ym.y,ym.m,1)),ymdL(new Date(ym.y,ym.m+1,0)))); }
  function renderFrontYear(wrap){ var Y=window._svYear; wrap.innerHTML=header('year',{y:Y})+frontBody(collectFront(ymdL(new Date(Y-1,11,1)),ymdL(new Date(Y,11,0)))); }

  // ===== 共通ヘッダ（タブ＋当月/月間トグル＋期間ナビ） =====
  function header(mode, ctx){
    var tab=window._svTab||'sales';
    var TABS=[['sales','売上'],['quarter','クォーター'],['work','作業内容'],['front','フロント']];
    var h='<div class="sv-tabbar">'+TABS.map(function(t){ return '<button class="sv-topbtn'+(tab===t[0]?' on':'')+'" onclick="svSetTab(\''+t[0]+'\')">'+t[1]+'</button>'; }).join('')+'</div>';
    h+='<div class="sv-head">';
    h+='<div class="sv-tabs"><button class="sv-tab'+(mode==='month'?' on':'')+'" onclick="svSetMode(\'month\')">当月</button><button class="sv-tab'+(mode==='year'?' on':'')+'" onclick="svSetMode(\'year\')">月間（年度）</button></div>';
    if (mode==='month'){
      h+='<div class="sv-nav"><button onclick="svShiftMonth(-1)" title="前の月">◀</button><b>'+ctx.y+'年'+(ctx.m+1)+'月</b><button onclick="svShiftMonth(1)" title="次の月">▶</button><button class="sv-now" onclick="svShiftMonth(0)">今月</button></div>';
    } else {
      h+='<div class="sv-nav"><button onclick="svShiftYear(-1)" title="前の年度">◀</button><b>'+(ctx.y-1)+'/12〜'+ctx.y+'/11</b><button onclick="svShiftYear(1)" title="次の年度">▶</button><button class="sv-now" onclick="svShiftYear(0)">今年度</button></div>';
    }
    h+='</div>';
    return h;
  }

  // ===== エントリ =====
  function renderSales(){
    var wrap=document.getElementById('view-sales-body'); if(!wrap) return;
    var now=new Date();
    if(!window._svTab) window._svTab='sales';
    if(!window._svMode) window._svMode='month';
    if(!window._svYM) window._svYM={y:now.getFullYear(),m:now.getMonth()};
    if(!window._svYear) window._svYear=(now.getMonth()===11)?now.getFullYear()+1:now.getFullYear();
    var tab=window._svTab, yr=(window._svMode==='year');
    if(tab==='quarter') yr?renderQuarterYear(wrap):renderQuarterMonth(wrap);
    else if(tab==='work') yr?renderWorkYear(wrap):renderWorkMonth(wrap);
    else if(tab==='front') yr?renderFrontYear(wrap):renderFrontMonth(wrap);
    else yr?renderYear(wrap):renderMonth(wrap);
  }

  window.renderSales = renderSales;
  window.svSetTab = function(t){ window._svTab=t; renderSales(); };
  window.svSetMode = function(m){ window._svMode=m; renderSales(); };
  window.svShiftMonth = function(dir){ var now=new Date(); if(dir===0){ window._svYM={y:now.getFullYear(),m:now.getMonth()}; } else { var d=new Date(window._svYM.y, window._svYM.m+dir, 1); window._svYM={y:d.getFullYear(),m:d.getMonth()}; } renderSales(); };
  window.svShiftYear = function(dir){ var now=new Date(); var cur=(now.getMonth()===11)?now.getFullYear()+1:now.getFullYear(); window._svYear=(dir===0)?cur:(window._svYear+dir); renderSales(); };
})();
