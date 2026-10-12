/* ===================================================================
   🚗 データチェック：車検の記録（S09〜S14）＋ 理由の欄の読み方（v2.175.0・ゆうた 2026-10-12）
   🗣「日常データチェックに車検の履歴系がないよね？ 担当者抜けとか Wってて再検じゃないの？とか 理由ぬけ、など」

   ◎なにを見張るか
     ① S09 担当抜け（合格・不合格の記録とも）
     ② S10 理由抜け（不合格・再検合格）。**マスター入力の古い why も「入っている」と読む**
     ③ S11 2人目がいるのに2人目の理由が空
     ④ S12 同じ日に不合格と合格（要判断）
     ⑤ S13 同じ日・同じ時間帯に不合格が2つ
     ⑥ S14 同じ車の合格が2枚のカードで60日以内（要判断）／離れていれば言わない
     ⑦ きれいな車検の車には何も言わない
     ⑧ 理由は pitShakenHistNote 1本（note／why）・マスター入力は note に書く

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_shaken_check.mjs
       node _見張り/test_shaken_check.mjs --break=1 … 理由を note だけで見る（why を見ない） → ②が赤
       node _見張り/test_shaken_check.mjs --break=2 … S14 の日数を見ない                     → ⑥が赤
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
function bend(f, src){
  const r = (a, b) => { if (src.indexOf(a) < 0) throw new Error('壊し方が当たらない: ' + a); return src.replace(a, b); };
  if (BREAK === '1' && f === 'pit-share.js') return r('return String((h && (h.note || h.why)) || \'\')', 'return String((h && h.note) || \'\')');
  if (BREAK === '2' && f === 'inspect-rules.js') return r('if (n == null || n > LIM.reShaken) continue;', 'if (n == null) continue;');
  return src;
}
function boot(cards){
  const ctx = { console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    state: { cards: cards || [], customers: [], loaners: [], companyCars: [], settings: {},
             workTypes: [{ id:'shaken', label:'車検', color:'#ef4444' }], staff: [], boards: [], inspectMarks: {}, inspectMutes: {} } };
  ctx.window = ctx; vm.createContext(ctx);
  ['intern-pit.js', 'pit-share.js', 'inspect-rules.js'].forEach(f => vm.runInContext(bend(f, JS(f)), ctx, { filename: f }));
  return ctx;
}

const base = { status: 'returned', returnStage: 'returnWait', customer: 'テスト', kana: 'テスト', tel: '0471234567',
               car: 'タント', frontStaff: '社長', workType: 'shaken', workTypes: ['shaken'], amountFinal: 80000,
               reserveDate: '2026-09-01', returnDate: '2026-09-05', completedAt: '2026-09-05' };
const C = (id, plate, insp) => Object.assign({}, base, { id, plate, inspSchedule: Object.assign({ mode:'manual', slots:{}, history:[] }, insp) });
const cards = [
  /* きれい */
  C('ok1', '柏 500 あ 1', { result:'done', resultDate:'2026-09-03', resultStaff:'椎名' }),
  C('ok2', '柏 500 あ 2', { result:'done', resultDate:'2026-09-04', resultStaff:'椎名', repass:true, repassNote:'光軸',
                            history:[{ date:'2026-08-20', slot:'am', result:'recheck', staff:'箱崎', note:'ブーツ切れ' }] }),
  /* 担当抜け（合格・不合格とも） */
  C('st1', '柏 500 あ 3', { result:'done', resultDate:'2026-09-03', resultStaff:'',
                            history:[{ date:'2026-08-28', slot:'am', result:'recheck', staff:'', note:'光軸' }] }),
  /* 理由抜け（不合格・再検合格）＋ マスター入力の古い why は「入っている」 */
  C('nt1', '柏 500 あ 4', { result:'done', resultDate:'2026-09-03', resultStaff:'椎名', repass:true, repassNote:'',
                            history:[{ date:'2026-08-27', slot:'am', result:'recheck', staff:'箱崎', note:'' }] }),
  C('why1', '柏 500 あ 5', { result:'done', resultDate:'2026-09-03', resultStaff:'椎名',
                            history:[{ date:'2026-08-27', slot:'am', result:'recheck', staff:'箱崎', why:'サイドスリップ' }] }),
  /* 2人目の理由抜け */
  C('s2', '柏 500 あ 6', { result:'done', resultDate:'2026-09-03', resultStaff:'椎名', resultStaff2:'菅谷', resultStaff2Note:'' }),
  /* 同じ日に不合格と合格 */
  C('w1', '柏 500 あ 7', { result:'done', resultDate:'2026-09-03', resultStaff:'椎名',
                           history:[{ date:'2026-09-03', slot:'am', result:'recheck', staff:'椎名', note:'光軸' }] }),
  /* 不合格が二重 */
  C('w2', '柏 500 あ 8', { result:'', decided:'', resultStaff:'',
                           history:[{ date:'2026-09-02', slot:'am', result:'recheck', staff:'椎名', note:'光軸' },
                                    { date:'2026-09-02', slot:'am', result:'recheck', staff:'椎名', note:'光軸' }] }),
  /* 同じ車（ナンバー）で 9/3 と 9/20 に別のカードで合格＝17日 */
  C('w3a', '柏 500 あ 9', { result:'done', resultDate:'2026-09-03', resultStaff:'椎名' }),
  C('w3b', '柏 500 あ 9', { result:'done', resultDate:'2026-09-20', resultStaff:'箱崎' }),
  /* 同じ車でも2年あいている＝言わない */
  C('far1', '柏 500 あ 10', { result:'done', resultDate:'2024-09-03', resultStaff:'椎名' }),
  C('far2', '柏 500 あ 10', { result:'done', resultDate:'2026-09-03', resultStaff:'椎名' })
];
const ctx = boot(JSON.parse(JSON.stringify(cards)));
const F = (ctx.pitInspectRun().findings || []);
const hit = (rule, id) => F.filter(f => f.ruleId === rule && f.refId === id);
const ids = (rule) => F.filter(f => f.ruleId === rule).map(f => f.refId).sort();

console.log('\n── ① S09 担当抜け ──');
ok('合格と不合格の両方の担当抜けを1件にまとめて言う', hit('S09', 'st1').length === 1 && /合格 9\/3 の担当が空/.test(hit('S09','st1')[0].text) && /不合格 8\/28 の担当が空/.test(hit('S09','st1')[0].text), hit('S09','st1'));
ok('担当が入っている車には言わない', ids('S09').join() === 'st1', ids('S09'));

console.log('\n── ② S10 理由抜け ──');
ok('不合格の理由が空・再検合格の落ちた所が空を言う', hit('S10', 'nt1').length === 1 && /不合格 8\/27 の理由が空/.test(hit('S10','nt1')[0].text) && /再検合格 9\/3 の落ちた所が空/.test(hit('S10','nt1')[0].text), hit('S10','nt1'));
ok('🔴 マスター入力の古い why に理由があれば言わない', hit('S10', 'why1').length === 0, hit('S10','why1'));
ok('理由が入っている車には言わない', hit('S10', 'ok2').length === 0);

console.log('\n── ③ S11 2人目の理由 ──');
ok('2人目がいて理由が空を言う', hit('S11', 's2').length === 1 && /菅谷/.test(hit('S11','s2')[0].text), hit('S11','s2'));
ok('2人目がいない車には言わない', ids('S11').join() === 's2', ids('S11'));

console.log('\n── ④ S12 同じ日に不合格と合格 ──');
ok('9/3 に不合格と合格を言う', hit('S12', 'w1').length === 1 && /9\/3 に不合格と合格/.test(hit('S12','w1')[0].text), hit('S12','w1'));
ok('要判断（確認したで閉じられる）', !!(hit('S12','w1')[0] || {}).judge);
ok('違う日の不合格→合格には言わない', hit('S12', 'ok2').length === 0);

console.log('\n── ⑤ S13 不合格が二重 ──');
ok('同じ日・同じ時間帯に2件を言う', hit('S13', 'w2').length === 1 && /9\/2 AM に不合格が2件/.test(hit('S13','w2')[0].text), hit('S13','w2'));
ok('ほかの車には言わない', ids('S13').join() === 'w2', ids('S13'));

console.log('\n── ⑥ S14 同じ車で2回の合格 ──');
ok('17日あいだの2枚目に言う（1件だけ）', ids('S14').join() === 'w3b', F.filter(f => f.ruleId === 'S14'));
ok('要判断', !!(hit('S14','w3b')[0] || {}).judge);
ok('2年あいている車には言わない', hit('S14', 'far2').length === 0);

console.log('\n── ⑦ きれいな車 ──');
ok('きれいな ok1 には車検の所見が無い', F.filter(f => f.refId === 'ok1' && /^S/.test(f.ruleId)).length === 0, F.filter(f => f.refId === 'ok1'));

console.log('\n── ⑧ 理由の読み方は1本 ──');
ok('pitShakenHistNote は note を読む', ctx.pitShakenHistNote({ note:'光軸' }) === '光軸');
ok('🔴 pitShakenHistNote は古い why も読む', ctx.pitShakenHistNote({ why:'サイドスリップ' }) === 'サイドスリップ');
const mp = JS('master-pit.js');
ok('🔴 マスター入力は理由を note に書く（why に書かない）', /pitMasterShkSet\(' \+ i \+ ',\\'note\\'/.test(mp) && !/pitMasterShkSet\(' \+ i \+ ',\\'why\\'/.test(mp));
ok('マスター入力は開いた時に why を note へ移す', /if \(x && x\.why != null\)\{ if \(!t\(x\.note\)\) x\.note = x\.why; delete x\.why; \}/.test(mp));
['shaken-log.js', 'shaken-line.js', 'shaken.js', 'card-view.js'].forEach(f =>
  ok('読む側が1本を通っている：' + f, /pitShakenHistNote/.test(JS(f))));

console.log('\n────────────────────────────');
console.log((fail ? '❌' : '✅') + ' ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
