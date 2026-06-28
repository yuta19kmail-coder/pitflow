/* ========================================
   card-view.js  -  予約確定後カード詳細（読み取り主体・2カラム・タブ）
   ----------------------------------------
   設計＝モック「構成案11」。openCard(modal) から renderCardView() を呼ぶ。
   既存フォーム（renderCardForm）は新規予約(page)＋「✏ 予約を編集」で温存。
   クラス名は衝突回避のため全て cv- 接頭辞。state/db は既存の保存に乗る
   （新フィールドは sample-data.js の card() 既定＋ここで || フォールバック）。
   公開：window.renderCardView / openCardEditForm / cv*（各操作）
   ======================================== */
(function () {
  'use strict';

  let _c = null;            // 現在開いているカード
  const DOW = ['日','月','火','水','木','金','土'];

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function save(){ try { if (window.PitDB) PitDB.save(); } catch(e){} }
  function yen(n){ return (n==null||n==='') ? '' : '¥' + Number(n).toLocaleString(); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function isoToday(){ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function parseISO(s){ if(!s) return null; const p=String(s).split('-'); if(p.length<3) return null; return new Date(+p[0],+p[1]-1,+p[2]); }
  function fmtMD(s){ const d=parseISO(s); if(!d) return s||''; return (d.getMonth()+1)+'/'+d.getDate()+'('+DOW[d.getDay()]+')'; }
  function daysBetween(aISO,bISO){ const a=parseISO(aISO),b=parseISO(bISO); if(!a||!b) return null; return Math.round((b-a)/86400000); }

  // ---- 各種マスタ参照 ----
  function workType(c){ return (state.workTypes||[]).find(w=>w.id===c.workType) || null; }
  function dropType(c){ return (state.dropTypes||[]).find(d=>d.id===c.dropType) || null; }
  function teamColor(c){ return c.boardId==='import' ? '#ec4899' : '#1db97a'; }
  // 代車リミットの色レベル（残り日数→緑/黄/赤/黒）。閾値は設定（loanerColors）で変更可
  window.loanerLevel = function(rem){
    if(rem==null) return {key:'none'};
    var s=(state.settings&&state.settings.loanerColors)||{};
    var g=(s.greenMin!=null)?s.greenMin:4, a=(s.amberMin!=null)?s.amberMin:2;
    if(rem<0) return {key:'dead'};
    if(rem>=g) return {key:'green'};
    if(rem>=a) return {key:'amber'};
    return {key:'red'};
  };
  window.loanerRem = function(c){
    var due = c.loanerTo || c.returnDateFinal || c.returnDate || '';
    if(!due) return null;
    return daysBetween(isoToday(), due);
  };
  function payMethods(){ return state.paymentMethods || state.paymentTypes || [
    {id:'cash',label:'現金'},{id:'card',label:'カード'},{id:'transfer',label:'振込'},
    {id:'collect',label:'集金'},{id:'finance',label:'ローン'},{id:'later',label:'後払い'}]; }

  // 新フィールド フォールバック（旧 localStorage データ対策）
  function ensure(c){
    if(!c.inspSchedule || typeof c.inspSchedule!=='object') c.inspSchedule = { mode:'manual', slots:{}, cutBefore:'' };
    if(!c.inspSchedule.slots) c.inspSchedule.slots = {};
    if(!c.coverCall || typeof c.coverCall!=='object') c.coverCall = { done:false, at:'', staff:'' };
    if(c.payment == null) c.payment = '';
    if(c.handover == null) c.handover = 'store';
    if(c.handoffMemo == null) c.handoffMemo = '';
    if(c.returnDateFinal === undefined) c.returnDateFinal = null;
    if(c.washNote == null) c.washNote = '';
    if(c.noThanksLine == null) c.noThanksLine = false;
    if(c.returnStage == null) c.returnStage = '';
    return c;
  }

  // ===== 進捗バー =====
  const PH = [['reserved','予約'],['check','点検'],['estim','見積'],['work','作業'],['workDone','完了'],['returned','返車']];
  const PIDX = { reserved:0, check:1, estim:2, contact:2, parts:3, work:3, workDone:4, returned:5, scrap:5 };
  function pbarHtml(c){
    const cur = PIDX[c.status] != null ? PIDX[c.status] : 0;
    let h = '<div class="cv-pbar">';
    PH.forEach(function(p,i){
      const cls = i<cur ? 'done' : (i===cur ? 'now' : '');
      h += '<div class="cv-pstep '+cls+'"><span class="cv-dot">'+(i<cur?'✓':(i===cur?'●':''))+'</span><span class="cv-pl">'+p[1]+'</span>'+(i<PH.length-1?'<span class="cv-seg"></span>':'')+'</div>';
    });
    return h + '</div>';
  }

  // ===== ヘッダー（左カラム） =====
  function leftHtml(c){
    const wt = workType(c);
    const wtColor = wt ? wt.color : '#84cc16';
    const wtLabel = wt ? wt.label : (c.workType||'作業');
    const dt = dropType(c);
    let h = '';

    // 1行目：名前＋予約を編集
    h += '<div class="cv-id1"><span class="cv-nm">'+esc(c.customer||'（未入力）')+' <small>様</small></span>'
       + '<span class="cv-editmini cv-idedit" onclick="openCardEditForm(\''+c.id+'\')">✏️ 予約を編集</span></div>';
    // 2行目：車種＋ナンバー＋カルテNo
    h += '<div class="cv-id2"><span class="cv-car">'+esc(c.car||'（車種未入力）')+'</span>'
       + (c.plate?'<span class="cv-plate">'+esc(c.plate)+'</span>':'')
       + ((c.karteNo||'').trim()?'<span class="cv-karte">'+esc(c.karteNo.trim())+'</span>':'')+'</div>';
    // 3行目：国産/課/担当＋電話(ホバー全件)
    const teamPill = (c.boardId==='import')
      ? '<span class="cv-pill cv-yunyu">輸入車</span>' : '<span class="cv-pill cv-kokusan">国産車</span>';
    const divPill = (c.division==='div2')
      ? '<span class="cv-pill cv-div2">2課</span>' : '<span class="cv-pill cv-div1">1課</span>';
    const staffPill = (c.frontStaff||c.staff) ? '<span class="cv-pill cv-staff">'+esc(c.frontStaff||c.staff)+'</span>' : '';
    h += '<div class="cv-id3">'+teamPill+divPill+staffPill+telHtml(c)+lineHtml(c)+'</div>';

    // 車検枠（作業内容コンテナ）
    let badges = '';
    if (dt) badges += (window.pitDropBadges ? pitDropBadges(c, function(o){ return '<span class="cv-bdg cv-drop">'+esc(o.label.length<=1?(o.desc||o.label):o.label)+'</span>'; }) : '<span class="cv-bdg cv-drop">'+esc(dt.label)+'</span>');
    if (c.consult) badges += '<span class="cv-bdg cv-consult">💬 相談</span>';
    if (!c.needLoaner) badges += '<span class="cv-bdg cv-none">代車なし</span>';
    h += '<div class="cv-wframe" style="border-left-color:'+wtColor+'">'
       + '<div class="cv-wftop"><span class="cv-wftype" style="color:'+wtColor+'">🔧 '+esc(wtLabel)+'</span>'
       + '<span class="cv-wfbadges">'+badges+'</span></div></div>';

    // 代車メーター
    if (c.needLoaner) h += loanerHtml(c);

    // メモ（予約担当＋予約時内容＋引継ぎ）
    h += memoHtml(c);
    // 車両注意（特殊運転）＝該当がある時だけメモの下に表示
    h += driveNoteHtml(c);
    return h;
  }

  // 車両注意：左ハンドル/M/T/車高低い（card.drive 配列）。1つも無ければ枠ごと非表示
  const DRIVE_LABELS = { leftHand:'左ハンドル', mt:'M/T', lowCar:'車高低い', noShoes:'土足禁止' };
  function driveNoteHtml(c){
    const arr = Array.isArray(c.drive) ? c.drive : [];
    const tags = ['leftHand','mt','lowCar','noShoes'].filter(function(k){ return arr.indexOf(k)>=0; });
    if (!tags.length) return '';
    return '<div class="cv-drvbox"><div class="cv-drvh">⚠️ 車両注意</div><div class="cv-drvrow">'
      + tags.map(function(k){ return '<span class="cv-drv">'+DRIVE_LABELS[k]+'</span>'; }).join('')
      + '</div></div>';
  }

  // LINE：NG＝地味なピル／登録済＝Lステップボタン（番号あり時）。未案内は出さない。
  function lineHtml(c){
    const st = c.lineStatus || '';
    if (st === 'ng') return '<span class="cv-pill cv-line-ng">LINE NG</span>';
    if (st === 'ok'){
      const id = (c.lstepId || '').trim();
      const url = (id && window.pitLstepUrl) ? pitLstepUrl(id) : '';
      if (url) return '<a class="cv-licon" href="'+esc(url)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Lステップを開く">L</a>';
      return '<span class="cv-pill cv-line-ok">LINE登録済</span>';
    }
    return '';
  }
  function telHtml(c){
    const list = (c.contacts && c.contacts.length) ? c.contacts : (c.tel?[{tel:c.tel,label:'電話',primary:true}]:[]);
    if (!list.length) return '';
    const primary = (list.find(x=>x.primary) || list[0]);
    const extra = list.length>1 ? ' <small>+'+(list.length-1)+'</small>' : '';
    let pop = '<span class="cv-telpop"><b>連絡先</b>';
    list.forEach(function(t){ pop += '<span class="cv-tl"><i>'+esc(t.label||'')+(t.primary?'・代表':'')+'</i>'+esc(t.tel||'')+'</span>'; });
    pop += '</span>';
    return '<span class="cv-telwrap"><span class="cv-tel">☎ '+esc(primary.tel||'')+extra+'</span>'+(list.length?pop:'')+'</span>';
  }

  function loanerHtml(c){
    const loaner = (state.loaners||[]).find(l=>l.id===c.loanerId);
    const which = loaner ? (loaner.name||'代車') : (c.loanerId||'代車');
    const dueISO = c.loanerTo || c.returnDateFinal || c.returnDate || '';
    const rem = dueISO ? daysBetween(isoToday(), dueISO) : null;
    const remTxt = (rem==null) ? '—' : (rem<0 ? '超過'+(-rem)+'日' : 'あと'+rem+'日');
    const lvKey = (window.loanerLevel ? loanerLevel(rem) : {key:'amber'}).key;
    const pct = (rem==null) ? 50 : Math.max(8, Math.min(95, 100 - rem*8));
    let extras = '';
    if (c.loanerFixed) extras += '<span class="cv-loxchip cv-fix">車種固定</span>';
    const lmemo = (c.loanerMemo||'');
    if (lmemo) extras += '<span class="cv-loxmemo">'+esc(lmemo)+'</span>';
    return '<div class="cv-lo cv-lev-'+lvKey+'">'
      + '<div class="cv-lomain"><div class="cv-loleft"><div class="cv-lorem">代車 返却まで</div><div class="cv-lodays">'+remTxt+'</div></div>'
      + '<div class="cv-loright"><div class="cv-lodue">'+(dueISO?('〜 '+fmtMD(dueISO)):'期限未設定')+'</div><div class="cv-lowhich">'+esc(which)+'</div>'
      + '<div class="cv-lometer"><i style="width:'+pct+'%"></i></div></div></div>'
      + (extras ? '<div class="cv-loextras">'+extras+'</div>' : '')
      + '</div>';
  }

  function memoLines(text){
    return String(text||'').split('\n').map(function(l){return l.trim();}).filter(Boolean)
      .map(function(l){return '<div class="cv-wl">'+esc(l)+'</div>';}).join('') || '<div class="cv-wl cv-muted">（なし）</div>';
  }
  function memoHtml(c){
    const staff = c.frontStaff || c.staff || '—';
    let h = '<div class="cv-work"><div class="cv-wtop"><span class="cv-wtt">予約担当 <span class="cv-pill cv-staff">'+esc(staff)+'</span></span></div>';
    h += '<div class="cv-wsec"><div class="cv-gt">予約時内容</div>'+memoLines(c.menu||c.memo)+'</div>';
    // 引継ぎメモはこの画面から直接入力＝自動保存（予約時内容は新規予約で入れるので編集ボタンのまま）
    h += '<div class="cv-wsec"><div class="cv-gt">引継ぎ・伝達 <small>（入庫後・ここに直接入力できます）</small></div>'
       + '<textarea class="cv-hoinput" placeholder="引継ぎ・伝達を入力（自動で保存されます）" oninput="cvHandoff(this.value)" onchange="cvHandoffSave(this.value)">'+esc(c.handoffMemo||'')+'</textarea></div>';
    return h + '</div>';
  }

  // ===== 右カラム＝タブ本体 =====
  function rightHtml(c){
    let h = pbarHtml(c);
    h += '<div class="cv-tabs">'
      + '<button class="cv-tab on" data-p="cover" onclick="cvTab(this)">📝 表紙</button>'
      + '<button class="cv-tab" data-p="flow" onclick="cvTab(this)">🕒 フロー</button>'
      + '<button class="cv-tab" data-p="maint" onclick="cvTab(this)">🔧 整備</button>'
      + '<button class="cv-tab" data-p="office" onclick="cvTab(this)">🗂 バックオフィス</button></div>';
    h += '<div class="cv-body">'
      + '<div class="cv-panel on" id="cv-p-cover">'+coverTab(c)+'</div>'
      + '<div class="cv-panel" id="cv-p-flow">'+flowTab(c)+'</div>'
      + '<div class="cv-panel" id="cv-p-maint">'+maintTab(c)+'</div>'
      + '<div class="cv-panel" id="cv-p-office">'+officeTab(c)+'</div>'
      + '</div>';
    return h;
  }

  function coverTab(c){
    // 💰 金額＝概算→見積もり→受注→確定 を1行チェーン表示（全部 表示のみ）。
    const KINDS = [['est','概算','estAmount'],['quote','見積','amountQuote'],['order','受注','amountOrder'],['final','確定','amountFinal']];
    const curKind = ({ check:'quote', estim:'quote', contact:'order', parts:'final', work:'final', workDone:'final' })[c.status] || null;
    const KIND_FIELD = { quote:'amountQuote', order:'amountOrder', final:'amountFinal' };
    const KIND_LABEL = { quote:'見積もり金額', order:'受注金額', final:'確定金額（請求額）' };
    const moneyStr = function(v){ return (v!=null&&v!=='') ? '¥'+Number(v).toLocaleString() : '—'; };
    let chain = KINDS.map(function(k, i){
      const arrow = i>0 ? '<span class="cv-amarr">→</span>' : '';
      return arrow + '<span class="cv-aseg'+(k[0]===curKind?' cur':'')+'"><span class="cv-alb">'+k[1]+'</span><span class="cv-aval" id="cv-chv-'+k[0]+'">'+moneyStr(c[k[2]])+'</span></span>';
    }).join('');
    // 🤝 外注欄（status==='outsource' のとき自動追加：どこに出しているか／メモ／完了予定日＝戻りの日数）
    let osSec = '';
    if (c.status === 'outsource'){
      const partners = (state.settings && state.settings.outsourcePartners) || [];
      const needNote = (c.outsourceTo === '各ディーラー' || c.outsourceTo === 'その他');
      const opts = partners.map(function(p){ return '<option value="'+esc(p)+'"'+(p===c.outsourceTo?' selected':'')+'>'+esc(p)+'</option>'; }).join('');
      const inN = c.phaseAt ? (Math.floor((Date.now()-c.phaseAt)/86400000)+1) : null;
      let dueInfo = '—';
      if (c.outsourceDue){
        const n = window.daysFromToday ? daysFromToday(c.outsourceDue) : null;
        dueInfo = '完了予定 '+fmtMD(c.outsourceDue)+(n!=null ? '（'+(n>0?'あと'+n+'日':(n===0?'本日':Math.abs(n)+'日超過'))+'）' : '');
      }
      osSec = '<div class="cv-sec"><div class="cv-sect">🤝 外注</div>';
      osSec += '<div class="cv-fixrow"><div class="cv-frt">外注先（どこに出しているか）</div><div class="cv-frb">'
        + '<select class="cv-fixinput" onchange="cvOutPartner(this.value)">'+opts+'</select>'
        + (inN!=null ? '<span class="cv-plan">外注 '+inN+'日目</span>' : '') + '</div></div>';
      osSec += '<div class="cv-fixrow" id="cv-outnote-row" style="'+(needNote?'':'display:none')+'"><div class="cv-frt">メモ（例：トヨタ〇〇店）</div><div class="cv-frb">'
        + '<input class="cv-fixinput" type="text" value="'+esc(c.outsourceNote||'')+'" placeholder="店名など" onchange="cvOutNote(this.value)" style="width:220px"></div></div>';
      osSec += '<div class="cv-fixrow"><div class="cv-frt">完了予定日（戻りの日数）／カレンダーで選択</div><div class="cv-frb">'
        + '<span class="cv-plan" id="cv-outdue-info">'+dueInfo+'</span><span class="cv-arr">→</span>'
        + '<input class="cv-fixinput" type="date" value="'+esc(c.outsourceDue||'')+'" onchange="cvOutDue(this.value)"></div></div>';
      osSec += '</div>';
    }
    let h = osSec + '<div class="cv-sec"><div class="cv-amchain">'+chain+'</div>';
    // 今のフェーズの金額だけ、返車予定と同じサイズの入力欄を出す（概算は自動なので入力なし）
    if (curKind && curKind !== 'est'){
      const cv = c[KIND_FIELD[curKind]];
      const cvstr = (cv!=null&&cv!=='') ? Number(cv).toLocaleString() : '';
      h += '<div class="cv-fixrow"><div class="cv-frt">'+KIND_LABEL[curKind]+'／直接入力</div><div class="cv-frb">'
        + '<span class="cv-yenmark">¥</span><input class="cv-fixinput cv-money" id="cv-amt-'+curKind+'" type="text" inputmode="numeric" value="'+esc(cvstr)+'" data-prev="'+esc(cvstr)+'" oninput="cvAmtChange(\''+curKind+'\')"></div>'
        + '<div class="cv-fixconfirm" id="cv-amtconfirm-'+curKind+'">金額を <b id="cv-amtnew-'+curKind+'"></b> に変更しますか？ <button class="cv-ok" onclick="cvAmtOK(\''+curKind+'\')">OK</button><button class="cv-ng" onclick="cvAmtNG(\''+curKind+'\')">取消</button></div></div>';
    }
    const finRet = c.returnDateFinal || '';
    h += '<div class="cv-fixrow"><div class="cv-frt">確定 返車予定日／カレンダーで選択</div><div class="cv-frb">'
      + '<span class="cv-plan">予定 '+(c.returnDate?fmtMD(c.returnDate):'—')+'</span><span class="cv-arr">→</span>'
      + '<input class="cv-fixinput" type="date" value="'+esc(finRet)+'" onchange="cvSetReturn(this.value)"></div></div>';
    // 返車時間（新規予約と同じスマート入力＝900/9時半/9:00-10:00 など）
    h += '<div class="cv-fixrow"><div class="cv-frt">返車時間（例 900 / 9時半 / 9:00-10:00）</div><div class="cv-frb">'
      + '<input class="cv-fixinput" type="text" value="'+esc(c.returnTime||'')+'" placeholder="未定" onchange="cvReturnTime(this)" style="width:210px"></div></div></div>';

    // 車検スケジュール（車検タイプのみ表示）
    if (c.workType==='shaken') h += '<div class="cv-sec"><div class="cv-sect">📅 車検スケジュール（AI配車の材料・MHSへ）</div>'
      + '<div class="cv-csched"><div class="cv-cspick"><label>いつ行く？</label>'
      + '<select id="cv-csmode" onchange="cvCsMode(this.value)">'
      + opt('manual','日程を指定（手動）',c) + opt('asap','理由があって最短で行きたい',c)
      + opt('thisweek','今週中ならどこでも',c) + opt('nextweek','来週中ならどこでも',c)
      + opt('ask','可能かどうか聞いてください',c) + opt('undecided','未定',c)
      + '</select></div>'
      + '<div class="cv-csbanner" id="cv-csbanner"></div>'
      + '<div class="cv-cstrack" id="cv-cstrack"></div>'
      + '<div class="cv-cslegend"><i><span class="cv-sw" style="background:#6db0ec"></span>土＝陸運局休</i><i><span class="cv-sw" style="background:#ff8c8c"></span>日祝＝陸運局休</i><i><span class="cv-sw" style="background:var(--bg4)"></span>自社定休</i><i><span class="cv-sw" style="background:var(--brand)"></span>選択中</i></div>'
      + '<div class="cv-cshelp">AM/PM を押して行ける枠を選択。土日祝・自社定休は選べません。プルダウンで一括指定も可。</div>'
      + '</div></div>';

    // 表紙チェック
    const pm = payMethods();
    h += '<div class="cv-sec"><div class="cv-sect">📞 表紙チェック（手書き表紙のデジタル版）</div>';
    h += pickRow('完TEL', [['done','済'],['ng','未']], c.coverCall.done?'done':'ng', 'call')
       + (c.coverCall.done && c.coverCall.at ? '<div class="cv-callat">'+esc(c.coverCall.at)+(c.coverCall.staff?'・'+esc(c.coverCall.staff):'')+'</div>' : '');
    h += pickRow('支払い', pm.map(function(p){return [p.id,p.label];}), c.payment, 'pay');
    h += pickRow('洗車', [['1','要'],['0','不要']], c.needWash?'1':'0', 'wash');
    h += '<div class="cv-pickrow"><span class="cv-pk">洗車備考</span><div class="cv-chips" style="flex:1">'
       + '<input class="cv-fixinput" type="text" value="'+esc(c.washNote||'')+'" placeholder="洗車の備考（1行・任意）" onchange="cvWashNote(this.value)" style="flex:1;min-width:180px"></div></div>';
    h += pickRow('お礼LINE', [['1','要'],['0','不要']], c.noThanksLine?'0':'1', 'line');
    h += '<div class="cv-hint">※ パターン（型）で選ぶ方式。選択肢は将来 ⚙設定で増減できる想定。</div></div>';
    return h;
  }
  function opt(v,label,c){ return '<option value="'+v+'"'+(c.inspSchedule.mode===v?' selected':'')+'>'+label+'</option>'; }
  function pickRow(label, opts, cur, group){
    let chips = opts.map(function(o){
      return '<span class="cv-chip'+(String(cur)===String(o[0])?' on':'')+'" onclick="cvPick(\''+group+'\',\''+o[0]+'\',this)">'+esc(o[1])+'</span>';
    }).join('');
    return '<div class="cv-pickrow"><span class="cv-pk">'+esc(label)+'</span><div class="cv-chips">'+chips+'</div></div>';
  }

  function flowTab(c){
    const log = c.log || [];
    let h = '<div class="cv-sec"><div class="cv-sect">🕒 フロー（進捗ログ）</div><div class="cv-flow">';
    if (!log.length){ h += '<div class="cv-wl cv-muted">記録はまだありません。</div>'; }
    else log.slice().reverse().forEach(function(e){
      var pad=function(n){return(n<10?'0':'')+n;};
      // 時刻：数値タイムスタンプは M/D HH:MM に整形（旧ログ対策）
      var when = e.atTxt || e.at || '';
      if (typeof when === 'number'){ var dd=new Date(when); when=(dd.getMonth()+1)+'/'+dd.getDate()+' '+pad(dd.getHours())+':'+pad(dd.getMinutes()); }
      var title, amtTxt='';
      if (e.type === 'phase'){
        var fl = window.statusLabel ? statusLabel(e.from) : e.from;
        var tl = window.statusLabel ? statusLabel(e.to)   : e.to;
        title = e.from ? (esc(fl)+' <span class="cv-farrow">→</span> '+esc(tl)) : (esc(tl)+' へ');
        if (e.amount != null && e.amount !== '') amtTxt = '　'+(e.amountKind||'')+' ¥'+Number(e.amount).toLocaleString();
      } else {
        title = esc(e.text||e.label||'');
      }
      h += '<div class="cv-frow done"><span class="cv-fdot"></span><div><div class="cv-ft">'+title+(amtTxt?'<span class="cv-famt">'+esc(amtTxt)+'</span>':'')+'</div><div class="cv-fd">'+esc(String(when)+(e.by?' ・ '+e.by:''))+'</div></div></div>';
    });
    return h + '</div></div>';
  }

  function maintTab(c){
    const wt = workType(c);
    const items = (wt && wt.id==='shaken')
      ? ['受付・問診','24ヶ月点検','下回り点検','整備・調整','検査ライン','完成検査・洗車']
      : ['受付・問診','点検','整備・調整','完成検査・洗車'];
    const done = (c.maint && c.maint.checks) || {};
    let n=0; const h2 = items.map(function(it,i){
      const on = !!done[i]; if(on) n++;
      return '<div class="cv-chk'+(on?' on':'')+'" onclick="cvMaint('+i+',this)"><span class="cv-box">'+(on?'✓':'')+'</span>'+esc(it)+'</div>';
    }).join('');
    return '<div class="cv-sec"><div class="cv-sect">🔧 作業チェック（'+esc(wt?wt.label:'作業')+'）</div>'
      + '<div class="cv-prog">'+n+' / '+items.length+' 完了</div><div class="cv-checks">'+h2+'</div></div>';
  }

  function officeTab(c){
    const items = ['入金処理','原価チェック','ファイルバラシ'];
    const done = (c.office && c.office.checks) || {};
    let n=0; const h2 = items.map(function(it,i){
      const on = !!done[i]; if(on) n++;
      return '<div class="cv-chk'+(on?' on':'')+'" onclick="cvOffice('+i+',this)"><span class="cv-box">'+(on?'✓':'')+'</span>'+esc(it)+'</div>';
    }).join('');
    return '<div class="cv-sec"><div class="cv-sect">🗂 バックオフィス（事務の締め）</div>'
      + '<div class="cv-prog">'+n+' / '+items.length+' 完了</div><div class="cv-checks">'+h2+'</div></div>';
  }

  // ===== トップ（resNo/status/⋮/🗒️/✕） =====
  function topHtml(c){
    const dt = c.reserveDate ? ('入庫 '+fmtMD(c.reserveDate)+(c.reserveTime?' '+c.reserveTime:'')) : '';
    const sc = (window.statusColor ? statusColor(c.status) : '#f59e0b');
    const sl = (window.statusLabel ? statusLabel(c.status) : (c.status||''));
    let h = '<div class="cv-top">'
      + (c.resNo?'<span class="cv-resno">'+esc(c.resNo)+'</span>':'')
      + '<span class="cv-status" style="color:'+sc+';border-color:'+sc+'66;background:'+sc+'1f">'+esc(sl)+'</span>'
      + (dt?'<span class="cv-intake">'+dt+'</span>':'')
      + '<div class="cv-acts">'
      + '<button class="cv-iconbtn" title="この車両に付箋を発行" onclick="cvToggleFusen(event)">🗒️</button>'
      + '<div class="cv-optwrap"><button class="cv-iconbtn" title="オプション" onclick="cvToggleOpt(event)">⋮</button>'
      + '<div class="cv-optmenu" id="cv-optmenu"><div class="cv-opth">フェーズ移動</div>'
      + '<button class="cv-opti" onclick="cvMovePhase(\'estim\')">→ 見積もり中に移動</button>'
      + '<button class="cv-opti" onclick="cvMovePhase(\'work\')">→ 作業中に移動</button>'
      + '<button class="cv-opti" onclick="cvMovePhase(\'workDone\')">→ 完了にする</button>'
      + '<button class="cv-opti" onclick="cvMovePhase(\'returned\')">→ 返車・実績化</button>'
      + '<div class="cv-optdiv"></div><button class="cv-opti cv-danger" onclick="cvAskDelete()">🗑 削除する…</button></div></div>'
      + '<button class="cv-iconbtn" title="閉じる" onclick="closeDetail()">✕</button>'
      + '</div></div>';
    return h;
  }

  function popsHtml(c){
    const link = (c.resNo?c.resNo+' ・ ':'') + (c.customer||'') + '様 ' + (c.car||'');
    return '<div class="cv-fusenpop" id="cv-fusenpop"><div class="cv-fph">🗒️ 付箋を発行（この車両にリンク）</div>'
      + '<div class="cv-fplink">🔗 '+esc(link)+'</div>'
      + '<textarea class="cv-fpbody" id="cv-fpbody" placeholder="付箋の内容（例：部品が入荷したら連絡）"></textarea>'
      + '<div class="cv-fpcolors"><span class="cv-fpc on" data-col="yellow" style="background:#fde68a" onclick="cvFpColor(this)"></span><span class="cv-fpc" data-col="red" style="background:#fca5a5" onclick="cvFpColor(this)"></span><span class="cv-fpc" data-col="green" style="background:#a7f3d0" onclick="cvFpColor(this)"></span><span class="cv-fpc" data-col="blue" style="background:#bfdbfe" onclick="cvFpColor(this)"></span></div>'
      + '<div class="cv-fpacts"><button class="cv-ng" onclick="cvCloseFusen()">取消</button><button class="cv-ok" onclick="cvFusenIssue()">付箋を発行</button></div></div>'
      + '<div class="cv-delpop" id="cv-delpop"><div class="cv-dpt">この予約を削除しますか？</div>'
      + '<div class="cv-dpsub">'+esc(link)+'</div>'
      + '<div class="cv-dpnote">予約番号は欠番として残ります（再利用しません）。</div>'
      + '<div class="cv-fpacts"><button class="cv-ng" onclick="cvCloseDel()">取消</button><button class="cv-dpdel" onclick="cvDeleteCard()">削除する</button></div></div>';
  }

  // ===== メイン描画 =====
  window.renderCardView = function(card, hostId){
    const host = document.getElementById(hostId || 'md-body-modal'); if(!host) return;
    _c = ensure(card);
    const box = host.closest('.modal-box');
    if(box){
      box.classList.add('cardview');
      const _tc = card.codeRed ? '#ef4444' : teamColor(card);
      box.style.boxShadow = card.codeRed
        ? ('inset 4px 0 0 0 '+_tc+', 0 0 0 2px rgba(239,68,68,.55), 0 18px 50px rgba(0,0,0,.55)')
        : ('inset 4px 0 0 0 '+_tc+', 0 18px 50px rgba(0,0,0,.55)');
      box.style.borderColor = card.codeRed ? '#ef4444' : '';
    }
    host.innerHTML =
      '<div class="cv-root">'
      + topHtml(card)
      + (card.codeRed?'<div class="cv-claimbanner">🚨 Ⓕ案件・各部署慎重に対応 🚨</div>':'')
      + '<div class="cv-twocol"><div class="cv-left">'+leftHtml(card)+'</div><div class="cv-right">'+rightHtml(card)+'</div></div>'
      + popsHtml(card)
      + '</div>';
    cvBuildCal();
  };

  // 編集（既存フォームへ）
  window.openCardEditForm = function(cardId){
    const card = state.cards.find(c=>c.id===cardId) || _c; if(!card) return;
    const box = document.querySelector('#modal-detail .modal-box'); if(box){ box.classList.remove('cardview'); box.style.boxShadow=''; box.style.borderColor=''; }
    const title = document.getElementById('card-title-modal'); if(title && window._cardTitleHtml) title.innerHTML = _cardTitleHtml(card);
    window._cardMode = 'modal';
    if (window.renderCardForm) renderCardForm(card);
  };

  // ===== タブ =====
  window.cvTab = function(btn){
    document.querySelectorAll('.cv-tab').forEach(function(x){x.classList.remove('on');}); btn.classList.add('on');
    document.querySelectorAll('.cv-panel').forEach(function(p){p.classList.remove('on');});
    const el = document.getElementById('cv-p-'+btn.dataset.p); if(el) el.classList.add('on');
  };

  // ===== 金額（概算/見積もり/受注・kind = est|quote|order） =====
  var AMT_FIELD = { est:'estAmount', quote:'amountQuote', order:'amountOrder', final:'amountFinal' };
  window.cvAmtInput = function(){};
  window.cvAmtChange = function(kind){
    const el=document.getElementById('cv-amt-'+kind); if(!el) return;
    const v=el.value.replace(/[^0-9]/g,'').slice(0,9);
    el.value = v ? (+v).toLocaleString() : '';
    const cf=document.getElementById('cv-amtconfirm-'+kind);
    if(el.value===el.dataset.prev){ cf.classList.remove('show'); return; }
    document.getElementById('cv-amtnew-'+kind).textContent = '¥'+(el.value||'0');
    cf.classList.add('show');
  };
  window.cvAmtOK = function(kind){
    const el=document.getElementById('cv-amt-'+kind); const v=el.value.replace(/[^0-9]/g,'').slice(0,9);
    _c[AMT_FIELD[kind]] = v ? +v : null; el.dataset.prev=el.value;
    document.getElementById('cv-amtconfirm-'+kind).classList.remove('show');
    const chv=document.getElementById('cv-chv-'+kind);   // 上のチェーンに即反映
    if(chv) chv.textContent = v ? '¥'+(+v).toLocaleString() : '—';
    save();
  };
  window.cvAmtNG = function(kind){
    const el=document.getElementById('cv-amt-'+kind); el.value=el.dataset.prev;
    document.getElementById('cv-amtconfirm-'+kind).classList.remove('show');
  };
  window.cvSetReturn = function(v){ _c.returnDateFinal = v || null; if(v && !_c.returnDate) _c.returnDate = v; save(); };
  // 返車時間（スマート入力で正規化）／洗車備考／お礼LINE不要＝完TELポップアップと同じ項目（相互反映）
  window.cvReturnTime = function(input){
    var v = (input && typeof input === 'object') ? input.value : input;
    v = (window._normTime ? _normTime(v) : v) || '';
    if (input && typeof input === 'object') input.value = v;
    _c.returnTime = v; save();
  };
  window.cvWashNote = function(v){ _c.washNote = (v||'').trim(); save(); };
  window.cvNoThanks = function(on){ _c.noThanksLine = !!on; save(); };

  // 引継ぎメモ＝この画面で直接入力（入力中はデバウンス保存・フォーカスアウトで確定保存）
  let _hoTimer = null;
  window.cvHandoff = function(v){
    if (!_c) return;
    _c.handoffMemo = v;
    clearTimeout(_hoTimer);
    _hoTimer = setTimeout(save, 600);
  };
  window.cvHandoffSave = function(v){
    if (!_c) return;
    _c.handoffMemo = v;
    clearTimeout(_hoTimer);
    try { if (window.PitDB) PitDB.save(true); } catch(e){}
  };

  // ===== 外注（外注先・メモ・完了予定日＝戻りの日数を詳細モーダルで編集） =====
  window.cvOutPartner = function(v){
    _c.outsourceTo = v || '';
    var need = (v === '各ディーラー' || v === 'その他');
    var row = document.getElementById('cv-outnote-row');
    if (row) row.style.display = need ? '' : 'none';
    if (!need) _c.outsourceNote = '';
    save();
  };
  window.cvOutNote = function(v){ _c.outsourceNote = (v || '').trim(); save(); };
  window.cvOutDue = function(v){
    _c.outsourceDue = v || '';
    var info = document.getElementById('cv-outdue-info');
    if (info){
      if (v){ var n = window.daysFromToday ? daysFromToday(v) : null;
        info.textContent = '完了予定 ' + fmtMD(v) + (n!=null ? '（'+(n>0?'あと'+n+'日':(n===0?'本日':Math.abs(n)+'日超過'))+'）' : ''); }
      else info.textContent = '—';
    }
    save();
  };

  // ===== 表紙チェック =====
  window.cvPick = function(group, val, el){
    el.parentNode.querySelectorAll('.cv-chip').forEach(function(s){s.classList.remove('on');}); el.classList.add('on');
    if(group==='call'){ _c.coverCall.done = (val==='done'); if(_c.coverCall.done && !_c.coverCall.at){ const d=new Date(); _c.coverCall.at = (d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes()); _c.coverCall.staff = (window.bnMe||''); } }
    else if(group==='pay'){ _c.payment = val; }
    else if(group==='wash'){ _c.needWash = (val==='1'); }
    else if(group==='handover'){ _c.handover = val; }
    else if(group==='line'){ _c.noThanksLine = (val==='0'); }   // 要='1'→false／不要='0'→true
    save();
  };

  // ===== 整備/バックオフィス チェック =====
  function toggleCheck(holder, i, el){
    if(!_c[holder]) _c[holder]={}; if(!_c[holder].checks) _c[holder].checks={};
    _c[holder].checks[i] = !_c[holder].checks[i];
    el.classList.toggle('on'); el.querySelector('.cv-box').textContent = _c[holder].checks[i]?'✓':'';
    // 進捗数を更新
    const wrap = el.closest('.cv-sec'); const total = wrap.querySelectorAll('.cv-chk').length;
    const done = wrap.querySelectorAll('.cv-chk.on').length;
    const prog = wrap.querySelector('.cv-prog'); if(prog) prog.textContent = done+' / '+total+' 完了';
    save();
  }
  window.cvMaint = function(i,el){ toggleCheck('maint', i, el); };
  window.cvOffice = function(i,el){ toggleCheck('office', i, el); };

  // ===== ⋮オプション・付箋・削除 =====
  function closeAllPop(){ ['cv-optmenu','cv-fusenpop','cv-delpop'].forEach(function(id){ const e=document.getElementById(id); if(e)e.classList.remove('show'); }); }
  window.cvToggleOpt = function(e){ e.stopPropagation(); const m=document.getElementById('cv-optmenu'); const sh=m.classList.contains('show'); closeAllPop(); if(!sh)m.classList.add('show'); };
  window.cvToggleFusen = function(e){ e.stopPropagation(); const f=document.getElementById('cv-fusenpop'); const sh=f.classList.contains('show'); closeAllPop(); if(!sh)f.classList.add('show'); };
  window.cvCloseFusen = function(){ const f=document.getElementById('cv-fusenpop'); if(f)f.classList.remove('show'); };
  window.cvFpColor = function(el){ el.parentNode.querySelectorAll('.cv-fpc').forEach(function(x){x.classList.remove('on');}); el.classList.add('on'); };
  window.cvAskDelete = function(){ const m=document.getElementById('cv-optmenu'); if(m)m.classList.remove('show'); const d=document.getElementById('cv-delpop'); if(d)d.classList.add('show'); };
  window.cvCloseDel = function(){ const d=document.getElementById('cv-delpop'); if(d)d.classList.remove('show'); };

  window.cvFusenIssue = function(){
    const body = (document.getElementById('cv-fpbody').value||'').trim();
    const colEl = document.querySelector('#cv-fusenpop .cv-fpc.on'); const color = colEl ? colEl.dataset.col : 'yellow';
    if(!body){ cvCloseFusen(); return; }
    if(!Array.isArray(state.boardNotes)) state.boardNotes=[];
    const maxOrder = state.boardNotes.reduce(function(m,n){return Math.max(m, n.order||0);},0);
    state.boardNotes.push({
      id:'bn_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      title:'', body:body, color:color, noteType:'execute', deadline:null,
      memberUids:[], doneByUids:[], authorUid:(window.bnMe||null), status:'open',
      order:maxOrder+1, imageURL:'', replies:[],
      linkResNo:(_c.resNo||''), linkLabel:((_c.resNo?_c.resNo+' ・ ':'')+(_c.customer||'')+'様 '+(_c.car||''))
    });
    save(); if(window.renderBoardNotes) try{ renderBoardNotes(); }catch(e){}
    cvCloseFusen();
    if(window.toast) toast('🗒️ 付箋を発行しました');
  };

  window.cvMovePhase = function(status){
    if(!_c) return; _c.status = status;
    if(!Array.isArray(_c.log)) _c.log=[];
    const d=new Date(); _c.log.push({ text:(window.statusLabel?statusLabel(status):status)+' に移動', at:(d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes()), by:(window.bnMe||'') });
    save(); closeAllPop();
    renderCardView(_c, 'md-body-modal');
  };

  window.cvDeleteCard = function(){
    if(!_c) return; const idx = state.cards.findIndex(c=>c.id===_c.id);
    if(idx>=0) state.cards.splice(idx,1);
    cvCloseDel();
    if(window.closeDetail) closeDetail(); else save();
  };

  document.addEventListener('click', function(e){
    if(e.target && e.target.closest && e.target.closest('.cv-fusenpop,.cv-delpop,.cv-optmenu,.cv-optwrap')) return;
    closeAllPop();
  });

  // ===== 車検スケジュール =====
  function shopClosed(d){ const arr = (state.settings && state.settings.closedDow) || [3]; return arr.indexOf(d.getDay())>=0; }
  function inLongBreak(iso){ const lb=(state.settings&&state.settings.longBreaks)||[]; return lb.some(function(b){ return b.from && b.to && iso>=b.from && iso<=b.to; }); }
  function dayState(d){
    const iso = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const dow = d.getDay();
    const holi = (window.Holidays && Holidays.is) ? Holidays.is(iso) : false;
    const holiName = (window.Holidays && Holidays.name) ? Holidays.name(iso) : null;
    if(holi) return {iso:iso,cls:'off holi',off:true,tag:'祝・休',holiName:holiName};
    if(dow===0) return {iso:iso,cls:'off sun',off:true,tag:'陸運局休'};
    if(dow===6) return {iso:iso,cls:'off sat',off:true,tag:'陸運局休'};
    if(shopClosed(d)) return {iso:iso,cls:'off shop',off:true,tag:'自社定休'};
    if(inLongBreak(iso)) return {iso:iso,cls:'off shop',off:true,tag:'休み'};
    return {iso:iso,cls:'valid',off:false,tag:''};
  }
  function cvBuildCal(){
    const track = document.getElementById('cv-cstrack'); if(!track || !_c) return;
    const sch = _c.inspSchedule; const base=new Date(); base.setHours(0,0,0,0);
    let html=''; const days=42;
    for(let i=0;i<days;i++){
      const d=new Date(base); d.setDate(base.getDate()+i);
      const st=dayState(d); const dow=d.getDay();
      const slots = sch.slots[st.iso]||[];
      const today=(i===0)?' cv-today':'';
      html+='<div class="cv-vday '+st.cls+today+'" data-iso="'+st.iso+'" onclick="cvDayClick(this)">';
      html+='<div class="cv-vsoon">最短</div><div class="cv-vcut">無理</div>';
      html+='<div class="cv-vhead"><div class="cv-vd">'+d.getDate()+'</div><div class="cv-vdow">'+((d.getDate()===1||i===0)?((d.getMonth()+1)+'月 '):'')+DOW[dow]+'</div>'+(st.holiName?'<div class="cv-vholi">'+esc(st.holiName)+'</div>':'')+'</div>';
      if(!st.off){
        html+='<div class="cv-vslots"><div class="cv-slot'+(slots.indexOf('am')>=0?' on':'')+'" onclick="cvToggleSlot(\''+st.iso+'\',\'am\',event)"><span class="cv-bx"></span>AM</div>'
            + '<div class="cv-slot'+(slots.indexOf('pm')>=0?' on':'')+'" onclick="cvToggleSlot(\''+st.iso+'\',\'pm\',event)"><span class="cv-bx"></span>PM</div></div>';
      } else { html+='<div class="cv-voff">'+st.tag+'</div>'; }
      html+='</div>';
    }
    track.innerHTML = html;
    if(sch.mode==='asap') track.classList.add('cv-locked'); else track.classList.remove('cv-locked');
    applyModeVisual();
  }
  function validEls(){ return Array.prototype.slice.call(document.querySelectorAll('#cv-cstrack .cv-vday.valid')); }
  function csBanner(type,txt){ const b=document.getElementById('cv-csbanner'); if(!b)return; b.className='cv-csbanner show '+type; b.innerHTML=txt; }
  function clearBanner(){ const b=document.getElementById('cv-csbanner'); if(b) b.className='cv-csbanner'; }
  function applyModeVisual(){
    const m=_c.inspSchedule.mode; const vds=validEls();
    vds.forEach(function(v){ v.classList.remove('cv-soon','cv-ask','cv-cut'); });
    if(m==='asap'){ if(vds[0]) vds[0].classList.add('cv-soon'); csBanner('amber','⚡ 最短で行きたい：手動オフ。最短日を狙う（前日までに点検完了が条件）。AIが空きに合わせて確定。'); }
    else if(m==='ask'){ const cut=_c.inspSchedule.cutBefore||''; vds.forEach(function(v){ v.classList.add('cv-ask'); if(cut && v.dataset.iso<=cut) v.classList.add('cv-cut'); }); askBanner(); }
    else if(m==='thisweek'){ csBanner('blue','📅 今週中ならどこでも：今週の行ける日に一括チェック。AIが最適な1枠を選ぶ。'); }
    else if(m==='nextweek'){ csBanner('blue','📅 来週中ならどこでも：来週の行ける日に一括チェック。AIが最適な1枠を選ぶ。'); }
    else if(m==='undecided'){ csBanner('gray','📌 未定：いずれ行くが基本は考えない。でも忘れないように一覧には残す。'); }
    else clearBanner();
  }
  function askBanner(){
    const vds=validEls(); const cut=_c.inspSchedule.cutBefore||'';
    const kept=vds.filter(function(v){ return !cut || v.dataset.iso>cut; });
    const first=kept[0];
    let msg='❓ 可能か聞いて：青枠＝行く前提で全チェック。';
    if(cut) msg+=' 「'+fmtMD(cut)+'まで無理」で除外 →';
    msg+=' 残り <b>'+kept.length+'枠の日</b>'+(first?'（'+fmtMD(first.dataset.iso)+'〜）':'')+' をAIに渡し、後でメカ確認。';
    msg+=' <span class="cv-rst" onclick="cvCsMode(\'ask\')">↺ 戻す</span>';
    msg+='<br><span class="cv-muted2">「ここまで絶対無理」という日を押すと、その日と手前を予定から外します。</span>';
    csBanner('blue',msg);
  }
  function setAllValidSlots(rangeTest){
    _c.inspSchedule.slots = {};
    validEls().forEach(function(v){ const iso=v.dataset.iso; if(!rangeTest||rangeTest(iso)) _c.inspSchedule.slots[iso]=['am','pm']; });
  }
  function endOfWeek(base){ const e=new Date(base); e.setDate(base.getDate()+(6-base.getDay())); return e.getFullYear()+'-'+pad(e.getMonth()+1)+'-'+pad(e.getDate()); }
  function nextWeek(base){ const s=new Date(base); s.setDate(base.getDate()+(7-base.getDay())); const e=new Date(s); e.setDate(s.getDate()+6);
    return [s.getFullYear()+'-'+pad(s.getMonth()+1)+'-'+pad(s.getDate()), e.getFullYear()+'-'+pad(e.getMonth()+1)+'-'+pad(e.getDate())]; }

  window.cvCsMode = function(m){
    if(!_c) return; _c.inspSchedule.mode=m; _c.inspSchedule.cutBefore='';
    const base=new Date(); base.setHours(0,0,0,0); const todayISO=base.getFullYear()+'-'+pad(base.getMonth()+1)+'-'+pad(base.getDate());
    if(m==='manual'){ /* 触らない */ }
    else if(m==='asap'){ _c.inspSchedule.slots={}; }
    else if(m==='thisweek'){ const eo=endOfWeek(base); setAllValidSlots(function(iso){ return iso>=todayISO && iso<=eo; }); }
    else if(m==='nextweek'){ const r=nextWeek(base); setAllValidSlots(function(iso){ return iso>=r[0] && iso<=r[1]; }); }
    else if(m==='ask'){ setAllValidSlots(null); }
    else if(m==='undecided'){ _c.inspSchedule.slots={}; }
    save(); cvBuildCal();
  };
  window.cvToggleSlot = function(iso, ap, ev){
    if(ev) ev.stopPropagation();
    if(_c.inspSchedule.mode==='asap') return;
    const s=_c.inspSchedule.slots; if(!s[iso]) s[iso]=[];
    const k=s[iso].indexOf(ap); if(k>=0) s[iso].splice(k,1); else s[iso].push(ap);
    if(!s[iso].length) delete s[iso];
    save(); cvBuildCal();
  };
  window.cvDayClick = function(cell){
    if(_c.inspSchedule.mode!=='ask' || cell.classList.contains('off')) return;
    const iso=cell.dataset.iso; _c.inspSchedule.cutBefore = iso;
    const s={}; validEls().forEach(function(v){ if(v.dataset.iso>iso) s[v.dataset.iso]=['am','pm']; });
    _c.inspSchedule.slots=s; save(); cvBuildCal();
  };

})();
