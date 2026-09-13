/* PitFlow ── 🔍 **8月の総点検（2026-09-13）で見つかった穴**の見張り（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-09-13）
     🗣「Claudeがガチでいったん8月のPitFlowの整合性取って…チェック自体がバグった箇所はないか、
     　　焼き込みがちゃんと上書きされているか…ここブラして9月も同じ問題抱えるとPitFlow自体の信頼が揺らぐ」

   ◎本番の8月で実際に起きていたこと
     ① クォーターチェックが **残り0** なのに、伝票とのズレが3件「チェック済み」に隠れていた
        ・0785 金額 +171円 … 同じ行に「売上日を直した」記録があるだけで片づいた扱い
        ・0754 担当 … 「専務にした」記録はあるのに、カードは社長に戻っていた
     ② 担当を直しても **名簿の読み直しで元の名前に戻る**（名前だけ変えて、番号を変えていなかった）
     ③ マスター入力で作ったカードの金額が **文字**（"317180"）で入り、平均単価が 839億円 になっていた
     ④ 過ぎた月の売上クォーター画面に「現クォーター」「進行中」が出ていた

   ◎ここで見張ること
     🔴🔴 ① まだズレがある行は、記録があっても「片づいた」にしない（別の種類の記録／戻ってしまった直し）
     🔴  ① 直してズレが消えた行・印を全部押した行は、今までどおり片づいた
     🔴🔴 ② 担当を直すと番号（frontStaffId）も入る。車から担当を引き継ぐ所も番号ごと
     🔴🔴 ③ マスター入力の金額・日数は数字で保存（空欄は空欄）。平均単価は数にしてから足す
     🔴  ④ 「進行中」は今月だけ

   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_aug_audit.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
/* 🔴 自分のコメントに正規表現が当たらないように、コメントを外してから見る */
const bare = (f) => JS(f).replace(/\/\*[\s\S]*?\*\//g, '');

/* ---- quarter-fix.js を読み込む（名簿は2人・担当の名寄せは最小限） ---- */
const ALIAS = { '専務': '小林和枝', '社長': '小林政幸', '小林和枝': '小林和枝', '小林政幸': '小林政幸' };
const ctx = {
  console, setTimeout, clearTimeout, Promise,
  state: { cards: [], staff: [{ id: 'u-shacho', name: '社長' }, { id: 'u-senmu', name: '専務' }] },
  pitQStaffName: (v) => ALIAS[String(v || '').replace(/\s/g, '')] || String(v || ''),
  pitCanEditFinal: () => true
};
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(JS('quarter-fix.js'), ctx, { filename: 'quarter-fix.js' });

const card = (id, o) => { const c = Object.assign({ id, frontStaff: '社長', frontStaffId: 'u-shacho', amountFinal: 400000 }, o || {}); ctx.state.cards.push(c); return c; };
const pair = (id, o) => Object.assign({
  soft: { 売上日: '2026-08-29', 伝票: 'T' + id, 顧客名: 'テスト' + id, ナンバー: '野田 300 あ ' + id, 金額: 400000, 受付担当: '社長' },
  pit: { 生: { id }, 売上日: '2026-08-29', 数える日: '2026-08-29', フロント担当: '社長', 確定金額: 400000, 予約番号: 'R' + id },
  差: 0, 担当一致: true, 売上日ちがい: false, 期間の外: false, 同一性: 'vinOK', 同じ車: true, 日付: { kind: 'same', label: '同じ' }
}, o || {});
const did = (kind, p) => { ctx._pitQMarks = (ctx._pitQMarks || []); ctx._pitQMarks.unshift({ key: 'DID|' + [p.soft.売上日, p.soft.伝票, p.pit.生.id, kind].join('|'), 種類: kind, 直した: true }); };

console.log('\n── ① まだズレがある行は「片づいた」にしない ──');
{
  ctx._pitQMarks = [];
  /* 0785 と同じ形：金額が +171円ちがう行に、売上日を直した記録だけがある */
  card('m1');
  const p = pair('m1', { 差: 171 });
  p.soft.金額 = 400171;
  const kinds = ctx.pitQFixKinds(p).map(k => k.kind);
  ok('（前提）この行には金額のズレがある', kinds.indexOf('金額') >= 0, kinds);
  did('売上日', p);
  ok('🔴🔴 別の種類（売上日）を直した記録だけでは片づいたにしない', ctx.pitQRowDone(p) === false);

  /* 0754 と同じ形：担当を直した記録はあるが、カードは元の担当のまま */
  card('s1');
  const q = pair('s1', { 担当一致: false });
  q.soft.受付担当 = '小林和枝';
  did('担当', q);
  ok('🔴🔴 直した記録があっても、カードが元に戻っていたら片づいたにしない', ctx.pitQRowDone(q) === false);
}

console.log('\n── ① 本当に片づいた行は、今までどおり片づいた ──');
{
  ctx._pitQMarks = [];
  card('c1');
  const p = pair('c1');
  ok('（前提）ズレの無い行', ctx.pitQFixKinds(p).length === 0 && ctx.pitQKeepKinds(p).length === 0);
  ok('記録も印も無ければ片づいたではない', ctx.pitQRowDone(p) === false);
  did('売上日', p);
  ok('🔴 直してズレが消えた行（記録あり）は片づいた', ctx.pitQRowDone(p) === true);

  card('k1');
  const q = pair('k1', { 差: 171 });
  q.soft.金額 = 400171;
  ctx._pitQMarks.unshift({ key: [q.soft.売上日, q.soft.伝票, 'k1', '金額'].join('|'), 種類: '金額' });
  ok('🔴 「伝票を直した」の印を全部押した行は片づいた', ctx.pitQRowDone(q) === true);
}

console.log('\n── ② 担当を直すと番号も入る ──');
{
  ctx._pitQMarks = [];
  const c = card('a1');
  const p = pair('a1', { 担当一致: false });
  p.soft.受付担当 = '小林和枝';
  const r = await ctx.pitQFixApply('担当', p);
  ok('直せた', r === true, r);
  ok('🔴🔴 名前が専務になる', c.frontStaff === '専務', c.frontStaff);
  ok('🔴🔴 番号も専務の番号になる（名簿の読み直しで戻らない）', c.frontStaffId === 'u-senmu', c.frontStaffId);
  /* 名簿の読み直し（members-pit.js）は「番号の人の名前」に揃える＝番号が合っていれば名前は動かない */
  const byId = { 'u-shacho': '社長', 'u-senmu': '専務' };
  if (c.frontStaffId && byId[c.frontStaffId] !== c.frontStaff) c.frontStaff = byId[c.frontStaffId];
  ok('🔴 名簿を読み直しても専務のまま', c.frontStaff === '専務', c.frontStaff);
  const mem = bare('members-pit.js');
  ok('（前提）名簿の読み直しは番号から名前を戻す作りのまま', /\[k \+ 'Id'\]/.test(mem) && /c\[k\] = m\.name/.test(mem));

  ok('🔴 車から担当を引き継ぐ所（予約詳細）も番号ごと', /c\.frontStaff=veh\.frontStaff; c\.frontStaffId=veh\.frontStaffId/.test(bare('card-detail.js')));
  const cu = bare('customers.js');
  ok('🔴 車から担当を引き継ぐ所（お客様から予約）も番号ごと', /c\.frontStaff=v\.frontStaff; c\.frontStaffId=v\.frontStaffId/.test(cu));
  ok('🔴 新規予約に渡す所も番号ごと', /over\.frontStaff=v\.frontStaff; over\.frontStaffId=v\.frontStaffId/.test(cu));
  ok('🔴 名前だけ入れる所が残っていない', !/if\s*\(\s*v(eh)?\.frontStaff\s*\)\s*(c|over)\.frontStaff\s*=/.test(cu + bare('card-detail.js')));
}

console.log('\n── ③ 金額は数字で保存する ──');
{
  const src = bare('master-pit.js');
  const m = src.match(/var NUM_FIELDS = [\s\S]*?\n  function numFields\(c\)\{[\s\S]*?\n  \}/);
  ok('🔴 マスター入力に数字へ直す関数がある', !!m);
  if (m) {
    const box = {}; vm.createContext(box);
    vm.runInContext(m[0] + '\nthis.numFields = numFields;', box);
    const c = { amountFinal: '317180', amountOrder: '317,180', amountQuote: '', estAmount: ' 12000 ', estHoldDays: '3', feeAmount: 'abc', customer: '317180' };
    box.numFields(c);
    ok('🔴🔴 "317180" → 317180（数）', c.amountFinal === 317180, c.amountFinal);
    ok('🔴 カンマや空白が入っていても数になる', c.amountOrder === 317180 && c.estAmount === 12000, c);
    ok('🔴 空欄は空欄のまま（0 にしない）', c.amountQuote === '', c.amountQuote);
    ok('🔴 日数も数になる', c.estHoldDays === 3, c.estHoldDays);
    ok('数にならない文字は空欄にする', c.feeAmount === '', c.feeAmount);
    ok('金額以外の欄には触らない', c.customer === '317180');
  }
  const save = (src.match(/function _save\(print, noSale\)\{[\s\S]*?st\(\)\.cards\.push/) || [''])[0];
  ok('🔴🔴 保存する前に通している（カードになる前）', /numFields\(M\)/.test(save), save.slice(0, 300));
  const st = bare('state.js');
  ok('🔴 平均単価は数にしてから足す（文字の連結にならない）', /a \+ Number\(c\.amountFinal\)/.test(st) && /Number\(c\.amountFinal\) > 0/.test(st));
}

console.log('\n── ④ 「進行中」は今月だけ ──');
{
  const sv = bare('sales.js');
  const body = (sv.match(/function renderQuarterMonth\(wrap\)\{[\s\S]*?wrap\.innerHTML=h;/) || [''])[0];
  ok('🔴 進行中の札は今月の時だけ', /\(i===todayQ&&isThis\)\?'<em>進行中<\/em>'/.test(body));
  ok('🔴 過ぎた月は「現クォーター」と言わない', /isThis\?'現クォーター':/.test(body));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（緑 ' + pass + '件）' : '✅ 全部緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
