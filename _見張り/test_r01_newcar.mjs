/* PitFlow v2.156.0 ── データチェック R01／R02：「新規車両」どうしを同じ車にしない
   ===================================================================
   ◎ゆうた報告（2026-10-07）
     🗣「R01-881870 と R01-254013、とくに探してもダブりではないような気がする」
   ◎正体
     R01（同じ車が同じ日に2枚）はナンバー欄の文字そのままで比べていた。
     新しい車は「新規車両」が入るので、10/10 のフォレスター（有限会社）とエスティマ（ワタナベ）が同じ車になっていた。
   ◎ここで見張ること
     🔴 ナンバーが「新規車両」「未登録」でも、控え（vehId）が別なら R01・R02 に出ない
     🔴 本物のナンバーが同じ／控えが同じなら、今までどおり出る
     🔴 ナンバーも控えも無い車は、カナ＋車種で今までどおり

   ◎使い方
     python3 -m http.server 8995      ← 別ウィンドウ
     node _見張り/test_r01_newcar.mjs                                   */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const PORT = process.env.PORT || 8995;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.PIT_INSPECT_RULES || window.pitInspectRun || window.pitInspectRules', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

const R = await p.evaluate(() => {
  const L = x => { const y = new Date(); y.setDate(y.getDate() + x); return y.getFullYear() + '-' + String(y.getMonth()+1).padStart(2,'0') + '-' + String(y.getDate()).padStart(2,'0'); };
  const d = L(4), base = { boardId:'default', division:'div1', status:'reserved', workType:'general', reserveDate:d, log:[] };
  const cards = [
    { id:'TR_N1', customer:'有限会社テスト', kana:'ユウゲンガイシャテスト', car:'フォレスター', plate:'新規車両', vehId:'v_a' },
    { id:'TR_N2', customer:'渡辺', kana:'ワタナベ', car:'エスティマ', plate:'新規車両', vehId:'v_b' },
    { id:'TR_U1', customer:'未登録一', kana:'ミトウロク', car:'ノート', plate:'未登録', vehId:'v_c' },
    { id:'TR_U2', customer:'未登録二', kana:'ミトウロクニ', car:'セレナ', plate:'未登録', vehId:'v_d' },
    { id:'TR_P1', customer:'本物', kana:'ホンモノ', car:'アクア', plate:'袖ケ浦 500 あ 12-34', vehId:'v_e' },
    { id:'TR_P2', customer:'本物', kana:'ホンモノ', car:'アクア', plate:'袖ケ浦 500 あ 12-34', vehId:'v_f' },
    { id:'TR_V1', customer:'控え', kana:'ヒカエ', car:'フィット', plate:'新規車両', vehId:'v_same' },
    { id:'TR_V2', customer:'控え', kana:'ヒカエ', car:'フィット', plate:'新規車両', vehId:'v_same' },
    { id:'TR_K1', customer:'カナ', kana:'カナダケ', car:'ジムニー', plate:'' },
    { id:'TR_K2', customer:'カナ', kana:'カナダケ', car:'ジムニー', plate:'' }
  ].map(c => Object.assign({}, base, c));
  state.cards.push(...cards);
  const run = window.pitInspectRun || window.pitInspect;
  let res = null;
  try { res = run ? run() : null; } catch (e) { res = { err: String(e) }; }
  const list = (res && (res.items || res.findings || res)) || [];
  const ids = rid => (Array.isArray(list) ? list : []).filter(f => (f.ruleId || f.rule || (f.key||'').split(':')[0]) === rid).map(f => f.refId || (f.key||'').split(':')[1]).filter(x => /^TR_/.test(x)).sort();
  const out = { r01: ids('R01'), r02: ids('R02'), shape: res && Object.keys(res).slice(0, 6), n: Array.isArray(list) ? list.length : -1 };
  state.cards = state.cards.filter(c => !/^TR_/.test(c.id));
  return out;
});
ok('見本の所見が取れる', R.n > 0, R);
ok('🔴 「新規車両」どうし・「未登録」どうし（控えが別）は R01 に出ない', !R.r01.some(x => /TR_[NU]/.test(x)), R.r01);
ok('本物のナンバーが同じなら出る', R.r01.includes('TR_P1') && R.r01.includes('TR_P2'), R.r01);
ok('控え（vehId）が同じなら、ナンバーが新規車両でも出る', R.r01.includes('TR_V1') && R.r01.includes('TR_V2'), R.r01);
ok('ナンバーも控えも無い車はカナ＋車種で今までどおり', R.r01.includes('TR_K1') && R.r01.includes('TR_K2'), R.r01);
ok('🔴 R02（預かり期間の重なり）にも新規車両どうしは出ない', !R.r02.some(x => /TR_[NU]/.test(x)), R.r02);
ok('ページエラーなし', errs.length === 0, errs.slice(0, 3));
await b.close();
console.log(`\n${pass} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
