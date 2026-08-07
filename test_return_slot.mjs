/* PitFlow v1.60.0 ── 返車の日時を入れたら、ちゃんとそこへ移る
   -------------------------------------------------------------------
   ◎ゆうた報告
     「**完TEL待ちのエリアで日時を入れたのに返車カレンダーに移動しない**」
   ◎同時にやったこと（ゆうた指定）
     ・返車予定日の横に「返車日未定」のチェック（チェック＝日付が空、それだけ）
     ・「空のままにすると『返車未定』に入ります…」の案内文は削除
     ・返車時間も新規予約と同じ入力ガイド（打ち込み／ピッカー／ショートカット）
       ショートカットは返車だけの並び：AM PM 朝一 お昼 夕方 決まり次第 レッカー 勝手に取る 未定
     ・返車未定ビューを「返車日未定」と「返車時間未定」に割る
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8984      ← 別ウィンドウ
     node test_return_slot.mjs                                              */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8984;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1700, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', d => d.accept());

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitReturnPlace && window.pitReturnSetDateTime && window.pitTimeGuideHtml', null, { timeout: 25000 });
await p.waitForTimeout(900);

/* テスト用のカードを作る道具 */
const mk = (id, o) => p.evaluate(([id, o]) => {
  state.cards = state.cards.filter(x => x.id !== id);
  const c = Object.assign({ id, resNo: 'R-' + id, status: 'workDone', customer: '返車 太郎', car: 'アクア', log: [] }, o);
  state.cards.push(c);
  return true;
}, [id, o]);
const place = id => p.evaluate(id => pitReturnPlace(state.cards.find(x => x.id === id)), id);

console.log('\n── ① 行き先の物差し（pitReturnPlace）──');
{
  await mk('RS1', { returnStage: 'callWait' });
  ok('完TEL依頼ぶんは「完TEL待ち」', await place('RS1') === 'callWait');

  await mk('RS2', { returnStage: 'returnWait', returnDate: '', returnTime: '' });
  ok('完TEL済で日付なしは「返車日未定」', await place('RS2') === 'dateTbd');

  await mk('RS3', { returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '' });
  ok('日付だけ入ったら「返車時間未定」', await place('RS3') === 'timeTbd');

  await mk('RS4', { returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '未定' });
  ok('🔴 時間が「未定」でも「返車時間未定」に残る', await place('RS4') === 'timeTbd');

  await mk('RS5', { returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '09:00' });
  ok('日付＋時間がそろえば「返車カレンダー」', await place('RS5') === 'calendar');

  await mk('RS6', { returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '決まり次第' });
  ok('🔴 決まり次第は「返車カレンダー」（時刻未定の行に置く）', await place('RS6') === 'calendar');

  await mk('RS7', { returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: 'レッカー' });
  ok('レッカーも「返車カレンダー」', await place('RS7') === 'calendar');

  await mk('RS8', { returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '勝手に取る' });
  ok('🔴 勝手に取るも「返車カレンダー」', await place('RS8') === 'calendar');

  await mk('RS9', { returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '09:00', status: 'returned' });
  ok('返車済み（実績）は待ち行列に入れない', await place('RS9') === null);

  await mk('RSA', { returnStage: null, returnDate: '2026-08-20' });
  ok('まだ作業中（returnStageなし）も待ち行列に入れない', await place('RSA') === null);
}

console.log('\n── ② 🔴 完TEL待ちに日付＋時間を入れたら、返車カレンダーへ移る（今回の報告そのもの）──');
{
  await mk('RSB', { returnStage: 'callWait' });
  const r = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'RSB');
    const a = pitReturnSetDateTime(c, '2026-08-25', undefined);
    const b = pitReturnSetDateTime(c, undefined, '900');
    return { afterDate: a.after, afterTime: b.after, moved: b.moved, stage: c.returnStage, time: c.returnTime, dateFinal: c.returnDateFinal };
  });
  ok('日付を入れた時点で完TEL待ちから外れる', r.afterDate === 'timeTbd', r);
  ok('🔴 時間も入れたら返車カレンダーへ', r.afterTime === 'calendar' && r.moved === true, r);
  ok('完TEL済（returnWait）に上がっている', r.stage === 'returnWait', r);
  ok('900 は 09:00 に整えられる', r.time === '09:00', r);
  ok('返車確定日にも同じ日が入る', r.dateFinal === '2026-08-25', r);
}

console.log('\n── ③ 返車日未定＝日付を空にする（新しい項目は増やさない）──');
{
  await mk('RSC', { returnStage: 'returnWait', returnDate: '2026-08-25', returnTime: '09:00' });
  const r = await p.evaluate(() => {
    const c = state.cards.find(x => x.id === 'RSC');
    const a = pitReturnSetDateTime(c, '', undefined);
    return { place: a.after, keys: Object.keys(c).filter(k => /returnDateTbd|returnTbdDate/.test(k)), date: c.returnDate, time: c.returnTime };
  });
  ok('日付を空にすると「返車日未定」へ', r.place === 'dateTbd', r);
  ok('🔴 「未定かどうか」の項目は増やしていない（日付が空、それだけ）', r.keys.length === 0, r);
  ok('入れてあった時間は消さない（日付が決まればすぐカレンダーへ戻る）', r.time === '09:00', r);
}

console.log('\n── ④ 返車未定ビューが3ブロック（＋入金待ち）に割れている ──');
{
  const r = await p.evaluate(() => {
    state.cards = state.cards.filter(x => !/^RS/.test(x.id));
    state.cards.push({ id: 'RV1', resNo: 'R-RV1', status: 'workDone', customer: '待ち 一郎', car: 'ノート', returnStage: 'callWait', log: [] });
    state.cards.push({ id: 'RV2', resNo: 'R-RV2', status: 'workDone', customer: '日 二郎', car: 'タント', returnStage: 'returnWait', returnDate: '', log: [] });
    state.cards.push({ id: 'RV3', resNo: 'R-RV3', status: 'workDone', customer: '時 三郎', car: 'フィット', returnStage: 'returnWait', returnDate: '2026-08-20', returnTime: '', log: [] });
    state.returnRange = 'tbd';
    renderReturnTbd();
    const heads = [...document.querySelectorAll('#return-tbd .ret-tbd-h')].map(x => x.textContent.replace(/\s+/g, ''));
    const cnt = [...document.querySelectorAll('#return-tbd .ret-tbd-col')].map(col => ({
      h: col.querySelector('.ret-tbd-h').textContent.replace(/\s+/g, ''),
      n: col.querySelectorAll('.ret-tbd-body [data-card-id]').length
    }));
    return { heads, cnt };
  });
  ok('4つの見出しが出ている', r.heads.length === 4, r.heads);
  ok('🔴 「返車日未定」の見出しがある', r.heads.some(x => x.includes('返車日未定')), r.heads);
  ok('🔴 「返車時間未定」の見出しがある', r.heads.some(x => x.includes('返車時間未定')), r.heads);
  ok('古い「返車未定」だけの見出しは消えている', !r.heads.some(x => /返車未定/.test(x)), r.heads);
  const byName = n => (r.cnt.find(x => x.h.includes(n)) || {}).n;
  ok('完TEL待ちに1台', byName('完TEL待ち') === 1, r.cnt);
  ok('返車日未定に1台', byName('返車日未定') === 1, r.cnt);
  ok('返車時間未定に1台', byName('返車時間未定') === 1, r.cnt);
}

console.log('\n── ⑤ 返車時間未定の車は、返車カレンダーの「時刻未定」にも出る ──');
{
  const r = await p.evaluate(() => {
    state.returnDate = new Date('2026-08-20T00:00:00');
    state.returnRange = 'day';
    renderReturn();
    const un = [...document.querySelectorAll('#return-day-list .reserve-slot')]
      .find(s => (s.querySelector('.reserve-slot-time') || {}).textContent === '時刻未定');
    return { found: !!un, ids: un ? [...un.querySelectorAll('[data-card-id]')].map(x => x.dataset.cardId) : [] };
  });
  ok('🔴 日ビューの「時刻未定」の行に出ている', r.found && r.ids.indexOf('RV3') >= 0, r);
}

console.log('\n── ⑥ 返車時間のショートカットの並び（ゆうた指定）──');
{
  const r = await p.evaluate(() => ({
    ret: (window.PIT_RETURN_TIME_QUICK || []).map(t => t.label),
    resv: (window.PIT_TIME_QUICK || []).map(t => t.label),
    tbd: ['未定', '決まり次第', 'レッカー', '勝手に取る', ''].map(v => [v, pitTimeTbd(v)])
  }));
  ok('🔴 返車の並びは AM PM 朝一 お昼 夕方 決まり次第 レッカー 勝手に取る 未定',
     r.ret.join(',') === 'AM,PM,朝一,お昼,夕方,決まり次第,レッカー,勝手に取る,未定', r.ret);
  ok('入庫（予約）の並びは今までどおり（鍵ポストあり・勝手に取るなし）',
     r.resv.join(',') === 'AM,PM,朝一,お昼,夕方,決まり次第,レッカー,鍵ポスト,未定', r.resv);
  ok('🔴 「まだ決めていない」のは 未定 と 空 だけ',
     JSON.stringify(r.tbd) === JSON.stringify([['未定', true], ['決まり次第', false], ['レッカー', false], ['勝手に取る', false], ['', true]]), r.tbd);
}

console.log('\n── ⑦ 時間帯の割りふりは予約とまったく同じ ──');
{
  const r = await p.evaluate(() => ['AM', 'PM', '朝一', 'お昼', '夕方'].map(l => [l, pitTimeHour(l, 9, 18)]));
  /* 🔴 v1.70.0 枠も「いちばん遅くなり得る時刻」で決まる（ゆうた確定）＝AM は12時の枠 */
  ok('AM→12 / PM→18 / 朝一→09 / お昼→13 / 夕方→18',
     JSON.stringify(r) === JSON.stringify([['AM', '12'], ['PM', '18'], ['朝一', '09'], ['お昼', '13'], ['夕方', '18']]), r);
}

console.log('\n── ⑧ 返車ポップアップの見た目（チェック・ガイド・案内文の削除）──');
{
  const r = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'RP1');
    state.cards.push({ id: 'RP1', resNo: 'R-RP1', status: 'work', customer: 'ポップ 太郎', car: 'ヤリス', log: [] });
    PitReturnPopup.open('RP1', 'callDone');
    const bd = document.getElementById('rp-backdrop');
    return {
      hasCb: !!document.getElementById('rp-datetbd'),
      hasGuide: !!bd.querySelector('#rp-time-slot .cf-time .cf-time-quick .cf-chip'),
      chips: [...bd.querySelectorAll('#rp-time-slot .cf-time-quick .cf-chip')].map(x => x.textContent),
      oldNote: /空のままにすると/.test(bd.textContent),
      hasPick: !!bd.querySelector('#rp-time-slot .cf-time-pick')
    };
  });
  ok('🔴 「返車日未定」のチェックがある', r.hasCb === true, r);
  ok('🔴 返車時間に入力ガイド（ショートカット）が出ている', r.hasGuide === true, r);
  ok('🔴 ショートカットの中身が返車用', r.chips.join(',') === 'AM,PM,朝一,お昼,夕方,決まり次第,レッカー,勝手に取る,未定', r.chips);
  ok('ピッカー（時計）もある', r.hasPick === true, r);
  ok('🔴 「空のままにすると…」の案内文は消えている', r.oldNote === false, r);

  const r2 = await p.evaluate(() => {
    const cb = document.getElementById('rp-datetbd'), d = document.getElementById('rp-date');
    d.value = '2026-08-28'; PitReturnPopup.onDate();
    const a = { cb: cb.checked, dis: d.disabled };
    cb.checked = true; PitReturnPopup.onDateTbd(cb);
    const b = { val: d.value, dis: d.disabled };
    PitReturnPopup.close(false);
    return { a, b };
  });
  ok('日付を入れるとチェックは自動で外れる', r2.a.cb === false && r2.a.dis === false, r2);
  ok('🔴 チェックを入れると日付は空になり、欄も使えなくなる', r2.b.val === '' && r2.b.dis === true, r2);
}

console.log('\n── ⑨ ホバーの完TEL/返車入力（同じガイド＋入れたら画面が追いつく）──');
{
  const r = await p.evaluate(() => {
    state.cards = state.cards.filter(x => x.id !== 'HV1');
    state.cards.push({ id: 'HV1', resNo: 'R-HV1', status: 'workDone', customer: 'ホバ 太郎', car: 'ラパン', returnStage: 'callWait', log: [] });
    state.currentView = 'return'; state.returnRange = 'tbd';
    showView('return');
    const el = document.querySelector('#return-tbd [data-card-id="HV1"]');
    if (!el) return { err: 'カードが出ていない' };
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const hp = document.getElementById('pit-hovercard');
    return {
      hasCb: !!hp.querySelector('.ph-rt-datetbd'),
      cbOn: !!(hp.querySelector('.ph-rt-datetbd') || {}).checked,
      hasGuide: !!hp.querySelector('.ph-rt .cf-time .cf-time-quick .cf-chip'),
      chips: [...hp.querySelectorAll('.ph-rt .cf-time-quick .cf-chip')].map(x => x.textContent),
      oldInput: !!hp.querySelector('input.ph-rt-time')
    };
  });
  ok('カードが完TEL待ちに出ている', !r.err, r);
  ok('🔴 ホバーにも「未定」チェックがある（日付が空なので最初からON）', r.hasCb === true && r.cbOn === true, r);
  ok('🔴 ホバーの返車時間も同じ入力ガイド', r.hasGuide === true, r);
  ok('ショートカットの中身が返車用', r.chips.join(',') === 'AM,PM,朝一,お昼,夕方,決まり次第,レッカー,勝手に取る,未定', r.chips);
  ok('古い素の時間欄は残っていない', r.oldInput === false, r);

  /* 日付を入れて → 時間を入れて → カレンダーへ移るまで */
  const r2 = await p.evaluate(async () => {
    const hp = document.getElementById('pit-hovercard');
    const d = hp.querySelector('.ph-rt-date');
    d.disabled = false; d.value = '2026-08-26';
    d.dispatchEvent(new Event('change', { bubbles: true }));
    const mid = pitReturnPlace(state.cards.find(x => x.id === 'HV1'));

    const el2 = document.querySelector('#return-tbd [data-card-id="HV1"]');
    if (el2) el2.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const t = document.getElementById('pit-hovercard').querySelector('.ph-rt .cf-time-main');
    t.value = '900';
    t.dispatchEvent(new Event('change', { bubbles: true }));
    const c = state.cards.find(x => x.id === 'HV1');
    return { mid, end: pitReturnPlace(c), time: c.returnTime, stage: c.returnStage };
  });
  ok('日付を入れたら「返車時間未定」へ移る', r2.mid === 'timeTbd', r2);
  ok('🔴 時間を入れたら「返車カレンダー」へ移る（＝報告のバグが直っている）', r2.end === 'calendar', r2);
  ok('900 → 09:00 に整えられる', r2.time === '09:00', r2);
  ok('完TEL済（returnWait）になっている', r2.stage === 'returnWait', r2);

  const r3 = await p.evaluate(() => {
    state.returnRange = 'tbd'; renderReturnTbd();
    return {
      inTbd: !!document.querySelector('#return-tbd [data-card-id="HV1"]'),
      log: (state.cards.find(x => x.id === 'HV1').log || []).map(e => e.label || '').join(' / ')
    };
  });
  ok('🔴 未定タブからは消えている（黙って消えない＝行き先はフローに残る）', r3.inTbd === false, r3);
  ok('フローに移動の記録が残っている', /返車予定カレンダー/.test(r3.log), r3.log);
}

console.log('\n── ⑩ ソースの見張り（写しを作っていないか）──');
{
  const rs = fs.readFileSync('js/return-slot.js', 'utf8');
  const un = fs.readFileSync('js/undetermined.js', 'utf8');
  const hv = fs.readFileSync('js/card-hover.js', 'utf8');
  const rp = fs.readFileSync('js/return-popup.js', 'utf8');
  const cd = fs.readFileSync('js/card-detail.js', 'utf8');
  const st = fs.readFileSync('js/state.js', 'utf8');

  ok('行き先の物差しは return-slot.js の1本', /function pitReturnPlace\(c\)\{/.test(rs.replace(/\s/g, '').slice(0, 0) + rs) || /function pitReturnPlace/.test(rs));
  ok('🔴 未定ビューは自前で条件を書かず pitReturnPlace を使っている',
     /pitReturnPlace\(c\)/.test(un) && !/returnStage === 'returnWait' && !c\.returnDate/.test(un));
  ok('🔴 ホバーは自前で条件を書かず pitReturnSetDateTime を使っている',
     /pitReturnSetDateTime/.test(hv) && !/c\.returnTime = \(window\._normTime \? _normTime\(t\.value\)/.test(hv));
  ok('🔴 返車ポップアップも pitReturnSetDateTime を使っている', /pitReturnSetDateTime/.test(rp));
  ok('🔴 時間ガイドのHTMLは1か所（予約側も借りている）',
     /pitTimeGuideHtml/.test(cd) && /pitTimeGuideHtml/.test(rp) && /pitTimeGuideHtml/.test(hv)
     && (rs.match(/cf-time-quick/g) || []).length >= 1
     && !/cf-time-guide/.test(cd) && !/cf-time-guide/.test(rp) && !/cf-time-guide/.test(hv));
  ok('🔴 時間の言葉の表は state.js の PIT_TIME_ALL 1本', /var PIT_TIME_ALL = \[/.test(st)
     && /PIT_TIME_QUICK = PIT_TIME_ALL\.filter/.test(st) && /PIT_RETURN_TIME_QUICK = PIT_TIME_ALL\.filter/.test(st));
  ok('ホバーの時間欄が画面を描き直している（今回のバグの再発止め）',
     /function commitMove/.test(hv) && /rerenderReturn\(\)/.test(hv));

  const ix = fs.readFileSync('index.html', 'utf8');
  ok('return-slot.js を読み込んでいる', /js\/return-slot\.js\?v=\d+/.test(ix));
  const vs = [(ix.match(/app-version" content="([\d.]+)"/) || [])[1],
              (ix.match(/login-ver">v([\d.]+)</) || [])[1],
              (ix.match(/class="ver">v([\d.]+)</) || [])[1]];
  const _num = x => String(x || '').split('.').map(Number);
  const _ge = (a, bb) => { const x = _num(a), y = _num(bb); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return true; };
  ok('版が3か所そろっている', vs.every(Boolean) && new Set(vs).size === 1, vs);
  ok('版が v1.60.0 より下がっていない', _ge(vs[0], '1.60.0'), vs);
}

ok('JSエラーが出ていない', errs.length === 0, errs.slice(0, 3));

await b.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
