/* PitFlow ── 👤 **同じお客様が2人に分かれているのを1人にまとめる**（ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-08-30）
     🗣「統合ボタンを **6322人の下に表示**して。でも **2こ探すから専用UIを出して2本検索**できるようにしないと。
     　　で **なんの情報を持つかを選択して実行**の流れか、車両と同じじゃないかな」

   ◎ここで見張ること（車の統合と同じ決めごとを、人でも守れているか）
     🔴 **②は消さない**（アーカイブに移すだけ・中身も残る）＝取り消せる
     🔴 **食い違う欄は黙って上書きしない**（選ばれた時だけ動く）
     🔴 **連絡先は「どっちも残す」が既定**（ゆうた指定）
     🔴 **車も予約も履歴も見失わない**（車は①へ移り、カードは①のお客様になる）
     🔴 **過去のカードの中身は書き換えない**（当時の名前のまま）
     🔴 取り消したら元どおり／取り消せるのは管理者だけ

   ◎使い方
     node test_cust_merge.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
const 日 = (ずらす) => new Date(Date.now() + 86400000 * ずらす).toISOString().slice(0, 10);

function boot(opt) {
  opt = opt || {};
  const 聞かれた = [], 出た札 = [];
  const ctx = {
    console, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener: () => {}, createElement: () => ({ style:{}, classList:{ add(){}, remove(){} } }) },
    state: { customers: [], cards: [], divisions: [], staff: [], loaners: [] },
    PitDB: { save(){} },
    pitToast: (m, code) => 出た札.push({ m, code }), pitOpLog: () => {},
    pitCurrentStaffName: () => 'チーフ'
  };
  if (opt.答え !== undefined) ctx.pitAsk = (msg, o) => { 聞かれた.push({ msg, opt:o }); return Promise.resolve(opt.答え); };
  if (opt.PitArchive) ctx.PitArchive = opt.PitArchive;
  ctx.聞かれた = 聞かれた; ctx.出た札 = 出た札;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(JS('customers.js'), ctx, { filename:'customers.js' });
  vm.runInContext(JS('veh-merge.js'), ctx, { filename:'veh-merge.js' });
  vm.runInContext(JS('cust-merge.js'), ctx, { filename:'cust-merge.js' });
  /* 電話口はカナだけ／来店で漢字＝人ごとダブった姿 */
  ctx.state.customers = [
    { id:'cuA', name:'', kana:'ミゾグチ ハナコ', updatedAt:1,
      contacts:[{ tel:'090-1111-2222', label:'個人携帯', primary:true }],
      vehicles:[{ id:'vA', plate:'', maker:'MINI', car:'ミニF54', updatedAt:1 }] },
    { id:'cuB', name:'溝口 花子', kana:'ミゾグチ ハナコ', updatedAt:1, lineStatus:'ok', lstepId:'12345',
      contacts:[{ tel:'047-000-0000', label:'自宅', primary:true }],
      vehicles:[{ id:'vB', plate:'船橋 312 ち 127', maker:'MINI', car:'ミニF54', karteNo:'K-1', updatedAt:1 }] }
  ];
  ctx.state.cards = [
    { id:'c1', resNo:'B0001', customerId:'cuA', customer:'', kana:'ミゾグチ ハナコ', plate:'',
      status:'returned', completedAt:日(-5) },                       /* ②側の終わった入庫 */
    { id:'c2', resNo:'W0002', customerId:'cuA', customer:'', kana:'ミゾグチ ハナコ', plate:'',
      status:'reserved', reserveDate:日(3) },                        /* ②側の生きている予約 */
    { id:'c3', resNo:'W0003', customerId:'cuB', customer:'溝口 花子', plate:'船橋 312 ち 127', status:'reserved' }
  ];
  return ctx;
}
const 客 = (S, id) => S.customers.find(c => c.id === id);

/* =====================================================================
   ① 2本検索
   ===================================================================== */
console.log('\n── 🔎 ① 2本の検索で①②を選ぶ ──');
{
  const ctx = boot(); const M = ctx.PitCustMerge;
  ok('1文字では探さない', M.探す('ミ').length === 0);
  ok('カナで両方見つかる', M.探す('ミゾグチ').length === 2, M.探す('ミゾグチ').map(c => c.id));
  ok('ひらがなでも当たる（カタカナとそろえる）', M.探す('みぞぐち').length === 2);
  ok('電話でも当たる', M.探す('090-1111').length === 1);
  ok('ナンバーでも当たる', M.探す('船橋 312').length === 1);
  ok('漢字でも当たる', M.探す('溝口').length === 1);
}

/* =====================================================================
   ② 何が起きるかを先に出す
   ===================================================================== */
console.log('\n── 📋 ② まとめる前に、何が動くかを出す ──');
{
  const ctx = boot(); const M = ctx.PitCustMerge;
  /* ①＝漢字を持っている方（溝口 花子）を残す */
  const P = M.plan('cuB', 'cuA');
  ok('下ごしらえが出る', !!P);
  const k = key => (P.rows.find(r => r.k === key) || null);
  ok('同じ欄（カナ）は出さない', !k('kana'));
  /* ⚠ ②が空の欄は出さない（持っていくものが無い）＝ここでは②に漢字が無いので お名前は出ない */
  ok('②が持っていない欄は出さない（お名前・LINEとも②が空）', !k('name') && !k('lineStatus'), P.rows.map(r => r.k));
  ok('この向きでは食い違う欄が1つも無い', P.rows.length === 0, P.rows.map(r => r.k));

  /* 向きを逆にすると出る（①＝カナだけ・②＝漢字あり＋LINEあり） */
  const P2 = M.plan('cuA', 'cuB');
  const k2 = key => (P2.rows.find(r => r.k === key) || null);
  ok('逆向きなら お名前が出る', !!k2('name'), P2.rows.map(r => r.k));
  ok('🔴 ①が空なので既定は②', k2('name').既定 === 'sub');
  ok('LINEとLステップも出る', !!k2('lineStatus') && !!k2('lstepId'));
  ok('連絡先は両方ぶん見えている', P.連絡先.主.length === 1 && P.連絡先.サブ.length === 1, P.連絡先);
  ok('🔴 かかっている予約を名指しできている（W0002）',
     P.予約.length === 1 && P.予約[0].resNo === 'W0002', P.予約);
  ok('🔴 終わった入庫は「予約」に混ぜない', !P.予約.some(r => r.resNo === 'B0001'));
  ok('付け替えるカードは②の2件', P.カード === 2, P.カード);
  ok('同じナンバーは無い', P.車.かぶり.length === 0);
  ok('自分自身とはまとめられない', M.plan('cuA', 'cuA') === null);
}

/* =====================================================================
   ③ まとめる
   ===================================================================== */
console.log('\n── 🔗 ③ まとめる ──');
let 記録id = '';
{
  const ctx = boot(); const M = ctx.PitCustMerge; const S = ctx.state;
  const 記録 = M.apply('cuB', 'cuA', { 欄:{}, 連絡先:'both' });
  ok('まとめた', !!記録); 記録id = 記録 ? 記録.id : '';
  const A = 客(S,'cuB'), B = 客(S,'cuA');
  ok('🔴 お名前は①のまま（黙って上書きしない）', A.name === '溝口 花子', A.name);
  ok('🔴🔴 連絡先はどっちも残った', (A.contacts||[]).length === 2, (A.contacts||[]).map(x => x.tel));
  ok('優先はひとつだけ', (A.contacts||[]).filter(x => x.primary).length === 1);
  ok('🔴 ②の車が①へ移った（2台）', (A.vehicles||[]).length === 2, (A.vehicles||[]).map(v => v.plate || '(なし)'));
  ok('②に車は残っていない', !(B.vehicles||[]).length);
  ok('🔴🔴 ②のカードが①のお客様になった', S.cards.filter(c => c.customerId === 'cuB').length === 3);
  ok('🔴 過去のカードの名前は書き換えていない', S.cards.find(c => c.id === 'c1').customer === '');
  ok('🔴🔴 終わった入庫も生きている予約も消えていない',
     S.cards.some(c => c.resNo === 'B0001') && S.cards.some(c => c.resNo === 'W0002'));
  ok('🔴🔴 ②は消えていない（アーカイブ）', !!B && !!B.archived);
  ok('②に「主はどれか」が残っている', B.mergedInto === 'cuB');
  /* ⚠ ②の名前が①のカナと同じなら、別名には足さない（同じものを2つ持たない） */
  ok('🔵 ①がもう持っている呼び名は、別名に足さない', !(A.oldNames||[]).length, A.oldNames);
  ok('取り消しの控えが①に残っている', (A.mergeLog||[]).length === 1);
  ok('🔴 吸収された人は、もう引き当ての相手にならない',
     !ctx.PitCustMerge.探す('ミゾグチ').some(c => c.id === 'cuA'), ctx.PitCustMerge.探す('ミゾグチ').map(c => c.id));
}

/* =====================================================================
   ④ 選んだとおりに動く／連絡先の3通り
   ===================================================================== */
console.log('\n── 🖐 ④ 選んだとおりに動く ──');
{
  /* ①＝カナだけ／②＝漢字あり の向きで、お名前を「①のまま」に選べるか */
  const ctx = boot(); const S = ctx.state;
  ctx.PitCustMerge.apply('cuA', 'cuB', { 欄:{ name:'main' }, 連絡先:'sub' });
  const A = 客(S,'cuA');
  ok('🔴 選べば①のまま（既定はサブでも上書きしない）', A.name === '', JSON.stringify(A.name));
  ok('選べば②の連絡先だけになる', (A.contacts||[]).length === 1 && A.contacts[0].tel === '047-000-0000', A.contacts);

  const ctx2 = boot(); const S2 = ctx2.state;
  ctx2.PitCustMerge.apply('cuA', 'cuB', { 欄:{}, 連絡先:'both' });
  ok('既定どおりなら②の漢字が入る', 客(S2,'cuA').name === '溝口 花子', 客(S2,'cuA').name);
}
{
  const ctx = boot(); const S = ctx.state;
  ctx.PitCustMerge.apply('cuB', 'cuA', { 欄:{}, 連絡先:'main' });
  ok('①の連絡先だけも選べる', (客(S,'cuB').contacts||[]).length === 1);
}
{
  /* 🔵 ②の呼び名が①と違う時は、別名として残る（結婚・離婚で苗字が変わった人を探せる） */
  const ctx = boot(); const S = ctx.state;
  客(ctx.state,'cuA').name = '田中 花子'; 客(ctx.state,'cuA').kana = 'タナカ ハナコ';
  ctx.PitCustMerge.apply('cuB', 'cuA', { 欄:{}, 連絡先:'both' });
  ok('🔵 ②のお名前が「別名」として残る', (客(S,'cuB').oldNames||[]).indexOf('田中 花子') >= 0, 客(S,'cuB').oldNames);
}
{
  /* ①が空の欄は、既定でサブを採る（LINEは②だけが持っている） */
  const ctx = boot(); const S = ctx.state;
  客(ctx.state,'cuB').lineStatus = ''; 客(ctx.state,'cuB').lstepId = '';
  客(ctx.state,'cuA').lineStatus = 'ok'; 客(ctx.state,'cuA').lstepId = '999';
  ctx.PitCustMerge.apply('cuB', 'cuA', { 欄:{}, 連絡先:'both' });
  ok('①が空ならLINEは②のものが入る', 客(S,'cuB').lineStatus === 'ok' && 客(S,'cuB').lstepId === '999');
}

/* =====================================================================
   ⑤ 取り消し（管理者だけ）
   ===================================================================== */
console.log('\n── ↩️ ⑤ 取り消し ──');
{
  const 管理者じゃない = { canArchive:()=>true, canRestore:()=>false, archiveCust:()=>true, restoreCust:()=>true,
                          custArchived:(c)=>!!(c&&c.archived), custVisible:()=>true, vehSelfArchived:(v)=>!!(v&&v.archived) };
  const ctx = boot({ PitArchive:管理者じゃない }); const M = ctx.PitCustMerge;
  const 記録 = M.apply('cuB', 'cuA', { 欄:{}, 連絡先:'both' });
  ok('🔴 管理者でなければ取り消せない', M.undo(記録.id) === false);
  ok('番号つきで知らせている（PF-6006）', ctx.出た札.some(x => x.code === 'PF-6006'));
}
{
  const ctx = boot(); const M = ctx.PitCustMerge; const S = ctx.state;
  const 記録 = M.apply('cuB', 'cuA', { 欄:{}, 連絡先:'both' });
  ok('取り消せた', M.undo(記録.id) === true);
  const A = 客(S,'cuB'), B = 客(S,'cuA');
  ok('お名前が戻った', A.name === '溝口 花子', A.name);
  ok('連絡先が戻った', (A.contacts||[]).length === 1 && A.contacts[0].tel === '047-000-0000', A.contacts);
  ok('🔴 車が②へ返った', (A.vehicles||[]).length === 1 && (B.vehicles||[]).length === 1);
  ok('🔴 カードの持ち主も戻った', S.cards.filter(c => c.customerId === 'cuA').length === 2);
  ok('②がアーカイブから戻った', !B.archived && !B.mergedInto);
  ok('別名を片づけた', !(A.oldNames||[]).length, A.oldNames);
  ok('控えを片づけた', !(A.mergeLog||[]).length);
  ok('無い記録は取り消せない', M.undo('cmXXXX') === false);
}

/* =====================================================================
   ⑥ 画面（ブラウザは使わないが、組み立てる所は本物を通す）
   ===================================================================== */
console.log('\n── 🖥 ⑥ 窓の組み立てと、押した時の道 ──');
{
  const ctx = boot({ 答え:true }); const M = ctx.PitCustMerge; const S = ctx.state;
  let H = '';
  ctx.custShowModal = (h) => { H = h; };
  ctx.custCloseModal = () => {};
  ctx.custOpen = () => {};
  ctx.renderCustomers = () => {};

  M.open();
  ok('専用の窓が開く', /お客様をまとめる/.test(H));
  ok('🔴 検索が2本ある', (H.match(/um-input/g) || []).length === 2, (H.match(/um-input/g) || []).length);
  ok('この時点では「まとめる」は出さない', H.indexOf('PitCustMerge.go()') < 0);

  M.q(1, 'ミゾグチ');
  ok('打つと候補が出る', (H.match(/um-row/g) || []).length >= 2);
  ok('🔴 候補の並びにも車種とナンバーが出る', /um-sub2/.test(H) && /ミニF54/.test(H));
  /* ①＝カナだけの方／②＝漢字の方（食い違う欄が出る向き） */
  M.pick(1, 'cuA');
  ok('①が決まると印が出る', /um-one on1/.test(H));
  ok('②はまだ検索のまま', /um-input/.test(H));
  M.q(2, 'ミゾグチ'); M.pick(2, 'cuB');
  ok('②も決まる', /um-one on2/.test(H));
  /* 🔴 v2.36.2 ①②は「顧客カードをそのまま2枚」＝車種・ナンバー・カルテまで見える */
  ok('🔴 カードに車のナンバーが出る', /船橋 312 ち 127/.test(H));
  ok('🔴 カードに車種が出る', /ミニF54/.test(H));
  ok('🔴 カードにカルテNoが出る', /カルテ K-1/.test(H));
  ok('🔴 カードに連絡先が出る', /047-000-0000/.test(H) && /自宅/.test(H));
  ok('🔴 カードにLINEの状態が出る', /LINE 登録済/.test(H));
  ok('🔴 カードに来店回数と最終入庫が出る', /来店 /.test(H) && /最終 |まだ来店なし/.test(H));
  ok('🔴 どちらが残ってどちらが片付くか、言葉で出る', /残す/.test(H) && /アーカイブへ/.test(H));
  ok('ここで初めて「まとめる」が出る', /PitCustMerge\.go\(\)/.test(H));
  ok('🔴 かかっている予約を番号のまま出している', /W0003/.test(H));
  ok('🔴 連絡先の「どっちも残す」が既定で選ばれている', /vm-opt both on/.test(H));

  M.setField('name', 'main');
  ok('欄の選び直しが効く', /vm-opt on/.test(H));
  M.setTel('main');
  ok('連絡先の選び直しも効く', H.indexOf('vm-opt both on') < 0);
  M.setTel('both');

  M.go();
  await new Promise(r => setTimeout(r, 5));
  ok('🔴 押したらまず確認の窓が出る', ctx.聞かれた.length === 1 && /よろしいですか/.test(ctx.聞かれた[0].msg));
  ok('確認の窓に①②がどれか書いてある',
     (ctx.聞かれた[0].opt.detail||[]).some(x => /^① 残す/.test(x)) && (ctx.聞かれた[0].opt.detail||[]).some(x => /^② 寄せる/.test(x)));
  ok('🔴 確認の窓に予約の番号が出る', (ctx.聞かれた[0].opt.detail||[]).some(x => /W0003/.test(x)),
     ctx.聞かれた[0].opt.detail);
  ok('🔴 「はい」なら本当にまとまる', (客(S,'cuA').vehicles||[]).length === 2, (客(S,'cuA').vehicles||[]).length);
}
{
  /* 「いいえ」なら1文字も動かない */
  const ctx = boot({ 答え:false }); const M = ctx.PitCustMerge; const S = ctx.state;
  ctx.custShowModal = () => {}; ctx.custCloseModal = () => {}; ctx.custOpen = () => {}; ctx.renderCustomers = () => {};
  M.open(); M.pick(1,'cuA'); M.pick(2,'cuB');
  const 前 = JSON.stringify(S.customers);
  M.go();
  await new Promise(r => setTimeout(r, 5));
  ok('🔴 「いいえ」なら1文字も動かない', JSON.stringify(S.customers) === 前);
}

/* =====================================================================
   ⑦ 決めごとを守っているか（ソースを見る）
   ===================================================================== */
console.log('\n── 🧭 ⑦ 決めごと ──');
{
  const cus = JS('customers.js'), cm = JS('cust-merge.js');
  ok('🔴 入口は顧客一覧（件数の下）に**アイコンだけ**', /cust-mergeico[\s\S]{0,200}PitCustMerge\.open\(\)/.test(cus));
  ok('🔴 言葉は並べない（アイコンだけ・title で伝える）',
     /cust-mergeico[\s\S]{0,240}<\/i><\/button>/.test(cus) && cus.indexOf('お客様をまとめる</button>') < 0);
  /* 🔴 v2.36.1 打っている間に窓を描き直さない（IMEが飛ぶ） */
  ok('🔴 打っている間は候補の並びだけ差し替える', /q: *function\(n, v\)[\s\S]{0,120}_paint\(n\)/.test(cm));
  ok('🔴 入力欄は id を持って据え置かれる', /id="um-q' \+ n \+ '"/.test(cm) && /id="um-list' \+ n \+ '"/.test(cm));
  ok('🔴 吸収された人は引き当ての相手にしない', /pitCustMerged\(x\)/.test(cus));
  ok('🔴 ②は消さずアーカイブ', /archiveCust/.test(cm) && cm.indexOf('splice(') > 0);
  ok('🔴 連絡先の既定は「どっちも」', /連絡先: *'both'/.test(cm));
  ok('同じナンバーがあれば車の統合へ渡す', /PitVehMerge\.open\(aid\)/.test(cm));
  const idx = fs.readFileSync('index.html', 'utf8');
  ok('🔴 index.html に `?v=` 付きで載っている', /js\/cust-merge\.js\?v=\d+/.test(idx));
  const meta = (idx.match(/app-version" content="([\d.]+)"/)||[])[1];
  const 画面 = (idx.match(/class="ver">v([\d.]+)</)||[])[1];
  const ログイン = (idx.match(/class="login-ver">v([\d.]+)</)||[])[1];
  ok('🔴 版が3か所そろっている', meta && meta === 画面 && meta === ログイン, { meta, 画面, ログイン });
  ok('台帳に PF-6008 が載っている', JS('errcode-pit.js').indexOf("['PF-6008'") >= 0);
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' 件が緑／' + fail + ' 件が赤\n');
process.exit(fail ? 1 : 0);
