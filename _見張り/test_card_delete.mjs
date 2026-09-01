/* ===================================================================
   test_card_delete.mjs － カードの「消去」と「アーカイブ扱い」の見張り
   PitFlow v2.47.0（ゆうた報告 2026-08-31）
   -------------------------------------------------------------------
   🗣「Y79397　これが代車から起こしたカードなんだが消去できない　アーカイブになっちゃう
      代車ルートだからなのか、もともとなのかきりわけなが原因を直して」
      → 切り分けた結果、**穴は2つ・別の原因**だった。

   ◎守るもの
     🔴 ① **代車から起こしたカードは、点検待ちの時点でアーカイブ済みにしない**（代車ルートの穴）
        「売上に数えない（pitCardNoSale）」と「もう片付いた（cardArchived）」は別物。
     🔴 ② アーカイブ扱いにするのは **人が手で付けた「売上なし」の印だけ**（pitCardNoSaleMarked）
     🔴 ③ 完TELまで行った社内車両は **実績側**のアーカイブ（戻し先が違う）
     🔴 ④ 代車カードの ⋮ は、ふつうのタスクボードの車と同じ3択になる
     🔴🔴 ⑤ **消去の2枚目が、窓の click で閉じられない**（もともとの穴）
        1枚目の resolve → `.then`（マイクロタスク）で2枚目を開く → **同じ click** が document に
        上がって `closeAllPop()` ＝ 開いた瞬間に閉じる。v1.136.0 から**1度も消去できていなかった**。
     ⚠ ⑥ `ui-dialog.js` 側で click を止めてはいけない（エラー番号のコピーが document で待っている）

   ◎使い方
       node test_card_delete.mjs
       node test_card_delete.mjs --break=1  … アーカイブ判定を pitCardNoSale に戻す → ①④が赤
       node test_card_delete.mjs --break=2  … 無視リストから #uid-ov を外す         → ⑤が赤
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
function bend(name, src) {
  if (BREAK === '1' && name === 'archive-pit.js')
    return src.replace('if (w.pitCardNoSaleMarked && w.pitCardNoSaleMarked(c)) return true;',
                       'if (w.pitCardNoSale && w.pitCardNoSale(c)) return true;');
  if (BREAK === '2' && name === 'card-view.js')
    return src.replace(".cv-optmenu,.cv-optwrap,#uid-ov'", ".cv-optmenu,.cv-optwrap'");
  return src;
}

const node = () => ({ innerHTML:'', style:{setProperty(){}},
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, remove(){}, children:[], value:'',
  querySelector(){return null;}, querySelectorAll(){return [];} });

function boot(){
  const ctx = { console, setTimeout(){}, clearTimeout, Promise, Date, Math, JSON,
    String, Number, Array, Object, isFinite, RegExp,
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    document:{ body:node(), head:node(), documentElement:node(), getElementById(){return null;},
      createElement:()=>node(), querySelector(){return null;}, querySelectorAll(){return [];},
      addEventListener(){}, dispatchEvent(){} },
    state:{ cards:[], customers:[], staff:[], boards:[], settings:{} },
    PitDB:{ save(){} }, pitAlert(){}, pitLog(){} };
  ctx.window = ctx; vm.createContext(ctx);
  ['pit-share.js','intern-pit.js','archive-pit.js'].forEach(f => vm.runInContext(bend(f, JS(f)), ctx));
  return ctx;
}

/* 代車から起こしたカード（maint-pit.js の pitMaintIntake が作る形） */
const 代車 = () => ({ id:'c1', resNo:'Y79397', status:'check', internKind:'loanercar',
  workType:'shaken', customer:'小林モータース株式会社', car:'タント',
  maintGroupId:'mg_l3_shaken_2026-08', maintRecId:'m1' });
const 普通 = () => ({ id:'c2', resNo:'A00001', status:'check', customer:'山田', car:'ノート' });

console.log('\n── ① 代車から起こしたカードは、点検待ちでアーカイブ扱いにしない ──');
{
  const c = boot();
  const lo = 代車(), nm = 普通();
  ok('代車から起こしたカードは社内車両として拾える', c.pitCardIntern(lo) === true);
  ok('売上には数えない（ここは今までどおり）', c.pitCardNoSale(lo) === true);
  ok('🔴🔴 点検待ちの代車カードはアーカイブ済みではない', c.PitArchive.cardArchived(lo) === false,
     'cardArchived → ' + c.PitArchive.cardArchived(lo));
  ok('🔴 📦の帯も出ない', c.PitArchive.cardArchiveNote(lo) === '');
  ok('ふつうの車も今までどおり（点検待ち＝アーカイブではない）', c.PitArchive.cardArchived(nm) === false);
}

console.log('\n── ② アーカイブにするのは「手で付けた印」だけ ──');
{
  const c = boot();
  ok('🔴 pitCardNoSaleMarked が居る（数える／片付いた の使い分け）', typeof c.pitCardNoSaleMarked === 'function');
  ok('印が無ければ false（社内車両でも）', c.pitCardNoSaleMarked(代車()) === false);
  ok('手で付けたら true', c.pitCardNoSaleMarked({ noSale:true }) === true);
  const lo = 代車(); lo.noSale = true; lo.noSaleAt = '2026-08-31';
  ok('🔴 手で「売上なしでアーカイブ」した代車は、ちゃんとアーカイブ済み', c.PitArchive.cardArchived(lo) === true);
  ok('帯は「売上なし」と日付', c.PitArchive.cardArchiveNote(lo).indexOf('売上なし') >= 0
     && c.PitArchive.cardArchiveNote(lo).indexOf('2026-08-31') >= 0);
}

console.log('\n── ③ 完TELまで行った代車は「実績」側のアーカイブ ──');
{
  const c = boot();
  const lo = 代車(); lo.status = 'returned'; lo.completedAt = '2026-08-31';
  ok('返車済みはアーカイブ済み', c.PitArchive.cardArchived(lo) === true);
  ok('🔴 実績側（戻し先が「完TEL済」になる方）', c.PitArchive.cardIsResult(lo) === true);
  ok('帯は「実績」', c.PitArchive.cardArchiveNote(lo).indexOf('実績') >= 0,
     c.PitArchive.cardArchiveNote(lo));
}

console.log('\n── ④ 代車カードの ⋮ は、ふつうのタスクボードの車と同じ3択 ──');
{
  /* card-view.js から optMenuHtml だけ切り出して動かす（画面全部は起こさない） */
  const src = JS('card-view.js');
  const s = src.indexOf('function optMenuHtml(c){');
  const e = src.indexOf('\n  }', src.indexOf("cv-danger", s));
  const c = boot();
  const ctx = { window: c, PitArchive: c.PitArchive, pitApprovalPending(){ return false; }, console };
  ctx.window = c; vm.createContext(ctx);
  vm.runInContext(src.slice(s, e + 4) + '\nthis.__m = optMenuHtml;', ctx);
  const h = ctx.__m(代車());
  ok('🔴🔴 「アーカイブから戻す」が出ない（まだ手元にある車）', h.indexOf('cvAskUnarchive') < 0 && h.indexOf('cvDenyRestore') < 0);
  ok('🔴 「入庫を取り消して予約に戻す」が出る', h.indexOf('cvAskBackToReserve') >= 0);
  ok('🔴 「売上なしでアーカイブする」が出る', h.indexOf('cvAskNoSale') >= 0);
  ok('🔴 「消去する」が出る', h.indexOf('cvAskDelete') >= 0);
  const h2 = ctx.__m({ id:'x', status:'returned', internKind:'loanercar', completedAt:'2026-08-31' });
  ok('⚠ 完TEL済の代車は今までどおりアーカイブの顔（戻す＋消去）', h2.indexOf('cvAskDelete') >= 0
     && (h2.indexOf('cvAskUnarchive') >= 0 || h2.indexOf('cvDenyRestore') >= 0));
}

console.log('\n── ⑤ 消去の2枚目が、窓の click で閉じられない（もともとの穴） ──');
{
  const cv = bend('card-view.js', JS('card-view.js'));
  const i = cv.indexOf("closeAllPop();\n  });");
  const line = cv.slice(cv.lastIndexOf('closest(', i), i);
  ok('🔴🔴 無視する場所に #uid-ov（UI.confirm の覆い）が入っている', /#uid-ov/.test(line), line.trim());
  ok('2枚目（.cv-delpop）も今までどおり無視される', /\.cv-delpop/.test(line));
  /* ⚠ 直し方をまちがえない見張り＝窓の側で止めてはいけない */
  const ud = JS('ui-dialog.js');
  const okBtn = ud.slice(ud.indexOf("getElementById('uid-ok').onclick"), ud.indexOf("getElementById('uid-ok').onclick") + 160);
  ok('⚠ ui-dialog.js の OK は click を止めていない（エラー番号のコピーが document で待っている）',
     okBtn.indexOf('stopPropagation') < 0);
  ok('⚠ エラー番号のコピーは document で click を待っている（止めたら壊れる）',
     /document\.addEventListener\('click'/.test(JS('coreflow-errcode.js')));
  /* 消す処理そのものは触っていない */
  ok('消去の中身（cvDeleteCard）は今までどおり state.cards から本当に消す',
     /state\.cards\.splice\(idx,\s*1\)/.test(cv));
  ok('🔴 消す時に代車の予定も外す（v1.154.0 のまま）', /pitLoanerReleaseForCard\(_c\.id/.test(cv));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
