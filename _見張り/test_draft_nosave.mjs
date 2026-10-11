/* PitFlow ── ⚡ 新規予約の書きかけで「全データの見比べ」を走らせない（v2.170.0・ブラウザは使わない）
   ===================================================================
   🗣 ゆうた報告 2026-10-11「新規予約で代車有や作業タイプを押したときに異常に時間がかかる。
      話を聞きながら予約を完了できない位。ただ俺のだと気にならない」
   ◎正体（本番で測った）
     新規予約の文字の欄などが PitDB.save を直接呼んでいた → 0.5秒後に _cloudFlush が全データ（本番 7,333件）を
     1件ずつ文字にして見比べ → 書きかけは送らないので**送る物0件の空回り**。本番・速いPCで1回 0.32〜0.36秒止まる。
     打つ手を止めるたびに起き、その間に押したバッジ・代車有が待たされていた（遅いPCほど長い）。
   ◎ここで見張ること
     ① card-detail.js で PitDB.save を直接呼ぶのは「画面を閉じる時」と _cfSaveFor の中だけ
     ② _cfSaveFor は書きかけなら控え（pitKeepDraft）だけ
     ③ 見比べの文字（_js）は前の書き方と1文字も変わらない（id はどの深さでも外す・キーは並べ替え）
   ◎使い方
       node _見張り\test_draft_nosave.mjs
       node _見張り\test_draft_nosave.mjs --break=1 … 入力欄に PitDB.save を戻す → ①が赤くなるのが正しい
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');

console.log('\n── ① 新規予約の画面は PitDB.save を直接呼ばない ──');
{
  let cd = JS('card-detail.js');
  if (BREAK === '1') cd = cd.replace("c[key] = v;\n      if (_cardCheckOn) _cardMarkMisses(c, root);   // 入力したら、その項目の赤枠はその場で外れる\n      _cfSaveFor(c);",
                                     "c[key] = v;\n      if (_cardCheckOn) _cardMarkMisses(c, root);   // 入力したら、その項目の赤枠はその場で外れる\n      if (window.PitDB) PitDB.save();");
  const code = cd.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, ''));
  const hits = [];
  code.forEach((l, i) => { if (/PitDB\.save\(/.test(l)) hits.push(i + 1); });
  ok('🔴 直接呼ぶのは2か所だけ（閉じる時・_cfSaveFor の中）', hits.length === 2, hits);
  ok('_cfSaveFor の中にある', /function _cfSaveFor\(c\)\{[^}]*\}\s*\n?\s*if \(window\.PitDB\) PitDB\.save\(\);/.test(cd) || /function _cfSaveFor\(c\)\{\n\s*if \(c && c\._draft\)[^\n]*\n\s*if \(window\.PitDB\) PitDB\.save\(\);/.test(cd));
  ok('閉じる時（顧客控え・代車の同期のあと）にある', /pitSyncLoanerAssigns\(\);[^\n]*\n\s*if \(window\.PitDB\) PitDB\.save\(\);/.test(cd));
  ok('🔴 文字の欄の input は _cfSaveFor', /c\[key\] = v;\n\s*if \(_cardCheckOn\)[^\n]*\n\s*_cfSaveFor\(c\);/.test(cd));
  ok('呼んでいる所が19か所以上', (cd.match(/_cfSaveFor\(c\);/g) || []).length >= 19, (cd.match(/_cfSaveFor\(c\);/g) || []).length);
}

console.log('\n── ② 書きかけなら控えだけ ──');
{
  const cd = JS('card-detail.js');
  const m = cd.match(/function _cfSaveFor\(c\)\{[\s\S]*?\n\}/);
  const ctx = { window: null, saved: 0, kept: 0 };
  ctx.window = ctx;
  ctx.PitDB = { save() { ctx.saved++; } };
  ctx.pitKeepDraft = () => { ctx.kept++; };
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  ctx._cfSaveFor({ _draft: true });
  ok('🔴 書きかけ＝保存 0回・控え 1回', ctx.saved === 0 && ctx.kept === 1, { saved: ctx.saved, kept: ctx.kept });
  ctx._cfSaveFor({ id: 'c1' });
  ok('ふつうの予約＝今までどおり保存', ctx.saved === 1);
}

console.log('\n── ③ 見比べの文字は前と同じ ──');
{
  const src = JS('db-pit.js');
  const a = src.indexOf('_jsRep: function'), b = src.indexOf('/* ---- ログイン直後に呼ばれる');
  const obj = vm.runInNewContext('({' + src.slice(a, b).replace(/,\s*$/, '') + '})');
  const old = function (v) { const self = this; if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v); if (Array.isArray(v)) return '[' + v.map(x => self._js(x)).join(',') + ']'; const keys = Object.keys(v).filter(k => k !== 'id' && typeof v[k] !== 'function' && v[k] !== undefined).sort(); return '{' + keys.map(k => JSON.stringify(k) + ':' + self._js(v[k])).join(',') + '}'; };
  const O = { _js: old };
  const samples = [
    { id: 'c1', b: 2, a: 1, nested: { id: 'x', z: [1, { id: 'y', q: 'あ', p: null }], u: undefined }, f() {}, s: '"\\\n' },
    { id: 'k', list: [], obj: {}, n: 0, t: true, neg: -1.5, big: 1e21, nan: NaN, emo: '🚙' },
    { contacts: [{ tel: '090', primary: true, label: '' }], maintSpans: [{ sid: 's', from: '2026-10-01', to: '2026-10-02' }], ts: { seconds: 1, nanoseconds: 2 } },
    null, 'str', 12, undefined
  ];
  const r = samples.map(s => [old.call(O, s), obj._js(s)]);
  ok('🔴 7種類の形で前と1文字も変わらない', r.every(([x, y]) => x === y), r.filter(([x, y]) => x !== y));
  ok('id はどの深さでも外す', !/"id"/.test(obj._js(samples[0])));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
