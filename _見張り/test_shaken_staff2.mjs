// ============================================================
// test_shaken_staff2.mjs ― 👥 車検の回送担当を2人目まで（2人目には理由を1行）の見張り
//   PitFlow v2.113.0 ／ MHS v1.71.0 ／ ゆうた指定 2026-09-14
//
//   🗣「基本は1人1台なのだが、まれに現場で乗る人が入れ替わることもある」
//   🗣「2人目担当者 〇〇 〇〇 ：再検で帰りのみ運転 みたいな感じ」
//   🗣「MHSの当日での変更も同様に揃えて」「過去を振り返っても同様の変更ができるように」
//
//   ここで固めている決めごと
//     🔴🔴 ① 合格・再検合格で 2人目と理由が残る。1人目（resultStaff）は今までどおり
//     🔴🔴 ② 不合格の記録1本にも 2人目と理由が載り、いまの予定からは消える
//     🔴  ③ 2人目が空なら理由も持たない／1人目と同じ人なら2人目は無し
//     🔴🔴 ④ 渡さなければ今のまま（午後に変更・取り消しで2人目が消えない）／予定に戻すと消える
//     🔴🔴 ⑤ あとから直せる（合格の記録・不合格の記録の両方）＝過去の車も同じ操作
//     🔴  ⑥ 不合格の取り消しで予定に戻す時、2人目も戻る
//     🔴  ⑦ 当日ボード（MHS）に配る1行に staff2 が乗る。staff は1人目のまま（前日LINEの画像が読む）
//     🔴  ⑧ 2人目の無い古い記録は形が変わらない（staff2 のキーを勝手に足さない）
//     🔴  ⑨ 画面の部品（＋ 担当者を追加）が PitFlow・MHS の窓に入っている
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_shaken_staff2.mjs
// ============================================================
import fs from 'fs';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); }
};
const JS = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(JS('pit-share.js'), box);
box.PitShare.use({ divisions: () => [], estAmount: () => 0, teamKey: () => 'default' });
const A = box.pitShakenApply;

const D1 = '2026-09-10';
const plan = (extra) => Object.assign({ mode: 'manual', slots: {}, history: [], decided: D1, decidedSlot: 'am',
                                        office: 'loc1', officeName: '野田', round: 2, resultStaff: '鈴木' }, extra || {});

console.log('── ① 合格で2人目が残る ──');
{
  const r = A(plan(), 'done', { staff: '鈴木', staff2: '佐藤', staff2Note: '再検の帰りのみ運転', today: D1 });
  ok('🔴🔴 1人目は今までどおり', r.insp.resultStaff === '鈴木', r.insp);
  ok('🔴🔴 2人目と理由が入る', r.insp.resultStaff2 === '佐藤' && r.insp.resultStaff2Note === '再検の帰りのみ運転', r.insp);
  ok('フローの1行に2人目と理由', /回送:鈴木＋佐藤（再検の帰りのみ運転）/.test(r.log), r.log);
  const r2 = A(plan(), 'repass', { staff: '鈴木', staff2: '佐藤', staff2Note: 'x', note: '光軸', today: D1 });
  ok('再検合格でも同じ', r2.insp.resultStaff2 === '佐藤' && r2.insp.repassNote === '光軸', r2.insp);
  ok('数える物差し（pitShakenStaff）は1人目だけ', box.pitShakenStaff({ inspSchedule: r.insp }) === '鈴木');
}

console.log('\n── ② 不合格の記録に載る ──');
{
  const r = A(plan(), 'recheck', { staff: '鈴木', staff2: '佐藤', staff2Note: '帰りのみ', note: '光軸', today: D1 });
  const h = r.insp.history[0] || {};
  ok('🔴🔴 記録1本に2人目と理由', h.staff === '鈴木' && h.staff2 === '佐藤' && h.staff2Note === '帰りのみ', h);
  ok('🔴 いまの予定からは消える（1人目と同じ扱い）', r.insp.resultStaff === '' && r.insp.resultStaff2 === '' && r.insp.resultStaff2Note === '', r.insp);
}

console.log('\n── ③ 揃え方 ──');
{
  const r = A(plan(), 'done', { staff: '鈴木', staff2: '', staff2Note: '書いたが2人目なし', today: D1 });
  ok('🔴 2人目が空なら理由も持たない', r.insp.resultStaff2 === '' && r.insp.resultStaff2Note === '', r.insp);
  const r2 = A(plan(), 'done', { staff: '鈴木', staff2: '鈴木', staff2Note: 'x', today: D1 });
  ok('🔴 1人目と同じ人なら2人目は無し', r2.insp.resultStaff2 === '', r2.insp);
  const r3 = A(plan(), 'done', { staff: '鈴木', staff2: '佐藤', staff2Note: 'あ'.repeat(100), today: D1 });
  ok('理由は60字で切る', r3.insp.resultStaff2Note.length === 60, r3.insp.resultStaff2Note.length);
}

console.log('\n── ④ 渡さなければ今のまま ──');
{
  const base = plan({ resultStaff2: '佐藤', resultStaff2Note: '帰りのみ' });
  const f = A(base, 'flip', { today: D1 });
  ok('🔴🔴 午後に変更で2人目が消えない', f.insp.resultStaff2 === '佐藤' && f.insp.resultStaff2Note === '帰りのみ', f.insp);
  const c = A(base, 'cancel', { today: D1 });
  ok('🔴 予定の取り消しでも消えない（1人目と同じ）', c.insp.resultStaff2 === '佐藤', c.insp);
  const d = A(base, 'done', { staff: '鈴木', today: D1 });
  ok('🔴 1人目だけ渡した完了でも2人目は残る', d.insp.resultStaff2 === '佐藤', d.insp);
  const o = A(d.insp, 'reopen', { today: D1 });
  ok('🔴🔴 予定に戻すと消える（1人目と同じ）', o.insp.resultStaff2 === '' && o.insp.resultStaff2Note === '', o.insp);
  ok('渡したものは書き換えない', base.resultStaff2 === '佐藤');
  const x = A(base, 'done', { staff: '鈴木', staff2: '', today: D1 });
  ok('🔴 空を渡したら外れる（✕で閉じた時）', x.insp.resultStaff2 === '', x.insp);
}

console.log('\n── ⑤ あとから直せる ──');
{
  const done = A(plan(), 'done', { staff: '鈴木', today: D1 }).insp;
  const e = A(done, 'doneedit', { at: { date: D1, slot: 'am' }, patch: { staff: '鈴木', staff2: '佐藤', staff2Note: '帰りのみ' } });
  ok('🔴🔴 合格の記録に2人目を足せる', e && e.insp.resultStaff2 === '佐藤' && e.insp.resultStaff2Note === '帰りのみ', e && e.insp);
  ok('ログに2人目', e && /鈴木＋佐藤/.test(e.log), e && e.log);
  const e2 = A(e.insp, 'doneedit', { at: { date: D1, slot: 'am' }, patch: { staff2: '' } });
  ok('🔴 外せる', e2 && e2.insp.resultStaff2 === '' && e2.insp.resultStaff2Note === '', e2 && e2.insp);
  const e3 = A(e.insp, 'doneedit', { at: { date: D1, slot: 'am' }, patch: { round: 3 } });
  ok('担当を渡さない直しでは2人目はそのまま', e3 && e3.insp.resultStaff2 === '佐藤', e3 && e3.insp);

  const ng = A(plan(), 'recheck', { staff: '鈴木', today: D1 }).insp;
  const re = A(ng, 'reedit', { at: { i: 0, date: D1, slot: 'am' }, patch: { staff: '鈴木', staff2: '田中', staff2Note: '行きのみ' } });
  ok('🔴🔴 不合格の記録に2人目を足せる', re && re.insp.history[0].staff2 === '田中' && re.insp.history[0].staff2Note === '行きのみ', re && re.insp.history);
  const re2 = A(re.insp, 'reedit', { at: { i: 0, date: D1, slot: 'am' }, patch: { staff2: '' } });
  ok('🔴 外せる', re2 && re2.insp.history[0].staff2 === '' && re2.insp.history[0].staff2Note === '', re2 && re2.insp.history);
}

console.log('\n── ⑥ 不合格の取り消しで2人目も戻る ──');
{
  const ng = A(plan(), 'recheck', { staff: '鈴木', staff2: '佐藤', staff2Note: '帰りのみ', today: D1 }).insp;
  const back = A(ng, 'redrop', { at: { i: 0, date: D1, slot: 'am' }, restore: true });
  ok('🔴 1人目・2人目・理由が予定に戻る', back && back.insp.resultStaff === '鈴木' && back.insp.resultStaff2 === '佐藤' && back.insp.resultStaff2Note === '帰りのみ', back && back.insp);
}

console.log('\n── ⑦ 当日ボードに配る1行 ──');
{
  box.pitIsShaken = () => true;
  const card = { id: 'c1', customer: '山田 太郎', car: 'N-BOX', workType: 'shaken', status: 'working',
                 inspSchedule: plan({ resultStaff2: '佐藤', resultStaff2Note: '帰りのみ' }) };
  const rows = box.pitShakenOnDate([card], D1);
  ok('1行出る', rows.length === 1, rows.length);
  const r = rows[0] || {};
  ok('🔴 staff は1人目のまま（前日LINEの画像が読む）', r.staff === '鈴木', r.staff);
  ok('🔴 staff2 と理由が乗る', r.staff2 === '佐藤' && r.staff2Note === '帰りのみ', r);
  const rows2 = box.pitShakenOnDate([{ ...card, inspSchedule: plan() }], D1);
  ok('2人目がいなければ空', rows2[0] && rows2[0].staff2 === '' && rows2[0].staff2Note === '', rows2[0]);
}

console.log('\n── ⑧ 古い記録の形は変わらない ──');
{
  const r = A(plan(), 'recheck', { staff: '鈴木', today: D1 });
  ok('🔴 2人目なしの不合格の記録に staff2 のキーを足さない', !('staff2' in r.insp.history[0]), r.insp.history[0]);
  ok('出し方＝2人目なしなら1人目だけ', box.pitShakenStaffPair('鈴木', '', '', '', true) === '鈴木');
  ok('出し方＝2人目ありなら「1人目＋2人目（理由）」', box.pitShakenStaffPair('鈴木', '佐藤', '帰りのみ', '', true) === '鈴木＋佐藤（帰りのみ）');
}

console.log('\n── ⑨ 画面の部品 ──');
{
  const h = box.pitShkStaff2Html({ id: 'cv-sh', names: ['鈴木', '佐藤'], staff2: '', note: '' });
  ok('閉じた状態で「＋ 担当者を追加」', /＋ 担当者を追加/.test(h) && !/class="shk-s2 on"/.test(h), h);
  const h2 = box.pitShkStaff2Html({ id: 'cv-sh', names: ['鈴木'], staff2: '退職者', note: '帰りのみ' });
  ok('2人目が入っていれば開いた状態・名簿にいない人も選ばれたまま', /class="shk-s2 on"/.test(h2) && /value="退職者" selected/.test(h2) && /value="帰りのみ"/.test(h2), h2);
  ok('入力例に実在の人の名前を入れない', !/placeholder="[^"]*(小林|ゆうた|雄太)/.test(h));
  const CV = JS('card-view.js'), SH = JS('shaken.js'), MP = JS('master-pit.js');
  ok('予約詳細：記録する／不合格を直す／合格を直す の3つの窓に部品', (CV.match(/_cvS2Html\(/g) || []).length >= 4, (CV.match(/_cvS2Html\(/g) || []).length);
  ok('予約詳細：3つの保存で2人目を渡す', (CV.match(/staff2: *(_s2|s2)\.staff2/g) || []).length >= 3, (CV.match(/staff2: *(_s2|s2)\.staff2/g) || []).length);
  ok('車検予定ボード：窓に部品・保存と控えで読む', /pitShkStaff2Html\(\{ id:'shk'/.test(SH) && (SH.match(/pitShkStaff2Read\('shk'\)/g) || []).length >= 3);
  ok('マスター入力：予定と行った記録に2人目', /resultStaff2/.test(MP) && /'staff2'/.test(MP));
  const MHS = fs.readFileSync(new URL('../../../MHS/index.html', import.meta.url), 'utf8');
  ok('MHS：当日ボードの窓に部品', /pitShkStaff2Html\(\{ id:'ta-shk'/.test(MHS));
  ok('MHS：保存で2人目を渡す', /staff2:s2\.staff2, staff2Note:s2\.staff2Note/.test(MHS));
  ok('MHS：行に2人目の札', /bshk-st2/.test(MHS));
  ok('🔴 MHS：読み込みの必須一覧（KEYS）に足していない（古い PitFlow で車検予定まるごと止めない）',
     !/KEYS=\[[\s\S]*?'pitShkStaff2Html'[\s\S]*?\];/.test(MHS));
}

console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' 件OK／' + fail + ' 件NG');
process.exit(fail ? 1 : 0);
