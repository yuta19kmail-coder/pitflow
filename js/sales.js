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

  // ===== 共通ヘッダ（当月/月間トグル＋期間ナビ） =====
  function header(mode, ctx){
    var h = '<div class="sv-head">';
    h += '<div class="sv-tabs"><button class="sv-tab'+(mode==='month'?' on':'')+'" onclick="svSetMode(\'month\')">当月</button><button class="sv-tab'+(mode==='year'?' on':'')+'" onclick="svSetMode(\'year\')">月間（年度）</button></div>';
    if (mode==='month'){
      var lbl = ctx.y+'年'+(ctx.m+1)+'月';
      h += '<div class="sv-nav"><button onclick="svShiftMonth(-1)" title="前の月">◀</button><b>'+lbl+'</b><button onclick="svShiftMonth(1)" title="次の月">▶</button><button class="sv-now" onclick="svShiftMonth(0)">今月</button></div>';
    } else {
      h += '<div class="sv-nav"><button onclick="svShiftYear(-1)" title="前の年度">◀</button><b>'+(ctx.y-1)+'/12〜'+ctx.y+'/11</b><button onclick="svShiftYear(1)" title="次の年度">▶</button><button class="sv-now" onclick="svShiftYear(0)">今年度</button></div>';
    }
    h += '</div>';
    return h;
  }

  // ===== エントリ =====
  function renderSales(){
    var wrap = document.getElementById('view-sales-body');
    if (!wrap) return;
    var now = new Date();
    if (!window._svMode) window._svMode = 'month';
    if (!window._svYM) window._svYM = { y: now.getFullYear(), m: now.getMonth() };
    if (!window._svYear) window._svYear = (now.getMonth()===11) ? now.getFullYear()+1 : now.getFullYear();
    if (window._svMode==='year') renderYear(wrap); else renderMonth(wrap);
  }

  window.renderSales = renderSales;
  window.svSetMode = function(m){ window._svMode = m; renderSales(); };
  window.svShiftMonth = function(dir){ var now=new Date(); if (dir===0){ window._svYM={y:now.getFullYear(),m:now.getMonth()}; } else { var d=new Date(window._svYM.y, window._svYM.m+dir, 1); window._svYM={y:d.getFullYear(),m:d.getMonth()}; } renderSales(); };
  window.svShiftYear = function(dir){ var now=new Date(); var cur=(now.getMonth()===11)?now.getFullYear()+1:now.getFullYear(); window._svYear = (dir===0)?cur:(window._svYear+dir); renderSales(); };
})();
