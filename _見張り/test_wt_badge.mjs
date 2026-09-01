/* ===================================================================
   🏷 札まわりの決めごと（v2.51.0・A-3 / A-5 / G / H）

   ◎なにを見張るか
     ① A-3 コンパクトなカードは「車販依頼」を**それだけの時しか出さない**
        （隠す仲間しかいない時は隠さない＝全部消えるのを防ぐ）
     ② A-5 B.P＋保険＝保険板金／一般＋保証＝保証修理。ホバーの言い方は**変えない**
     ③ A-5 言い換えに使った付加は、その画面ではバッジを出さない
     ④ H 検切は耳のタブに出る。**4つ以上になったら1文字**（押し出して消さない）
     ⑤ H 検切は**車ごとの注意ではない**（c.drive を触らない）
     ⑥ G 物販は単独で立つ／売上に数えない側（pitCardNoSale）に**入らない**

   ◎使い方
       node _見張り/test_wt_badge.mjs
       node _見張り/test_wt_badge.mjs --break=1 … 隠す仲間しかいない時も隠す      → ①が赤
       node _見張り/test_wt_badge.mjs --break=2 … 言い換えの表を空にする          → ②③が赤
       node _見張り/test_wt_badge.mjs --break=3 … 4つ以上でも縮めない（押し出す） → ④が赤
       node _見張り/test_wt_badge.mjs --break=4 … 物販を売上なし側へ合流させる    → ⑥が赤
   ⚠ 壊し方が空振りしていないか（＝赤くなるか）を必ず確かめること。
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
  if (BREAK === '1' && name === 'reserve.js')
    return src.replace('if (_wtsC.some(function(id){ return !_isHide(id); })) _wtsC = _wtsC.filter(function(id){ return !_isHide(id); });',
                       '_wtsC = _wtsC.filter(function(id){ return !_isHide(id); });');
  if (BREAK === '2' && name === 'pit-share.js')
    return src.replace("{ work:'bp',      special:'insurance', label:'保険板金' },", '');
  if (BREAK === '3' && name === 'pit-share.js')
    return src.replace('if (opt.narrow && out.length >= 4){', 'if (false){')
              .replace('return out;\n  }\n  w.pitCardTabs', 'return out.slice(0, 3);\n  }\n  w.pitCardTabs');
  if (BREAK === '4' && name === 'pit-share.js')
    return src.replace('    if (c.noSale) return true;', '    if (c.noSale) return true;\n    if (w.pitCardGoods && w.pitCardGoods(c)) return true;');
  return src;
}

const el = () => ({ innerHTML:'', style:{setProperty(){}},
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, remove(){}, children:[], value:'',
  querySelector(){return null;}, querySelectorAll(){return [];} });

function boot(){
  const ctx = { console, setTimeout(){}, clearTimeout, Promise, Date, Math, JSON,
    String, Number, Array, Object, isFinite, RegExp, parseInt, parseFloat,
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    document:{ body:el(), head:el(), documentElement:el(), getElementById(){return null;},
      createElement:()=>el(), querySelector(){return null;}, querySelectorAll(){return [];},
      addEventListener(){}, dispatchEvent(){} },
    state:{ cards:[], customers:[], staff:[], boards:[{id:'default',label:'国産車',cols:[]}], settings:{},
      workTypes:[], dropTypes:[{id:'drop',label:'預'},{id:'wait',label:'待'},{id:'sameDay',label:'当'}] },
    PitDB:{ save(){} }, pitAlert(){}, pitLog(){}, pitToast(){}, statusColor(){return '#fff';},
    statusLabel(s){ return s; }, advanceCard(){}, openDetail(){} };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(bend('state.js', JS('state.js')), ctx);
  ['pit-share.js','intern-pit.js','loaner-free.js','return-slot.js','coreflow-return-plan.js','approval-pit.js','reserve.js']
    .forEach(f => { try { vm.runInContext(bend(f, JS(f)), ctx); } catch(e){ console.log('   （読み飛ばし '+f+'：'+e.message+'）'); } });
  return ctx;
}
const W = boot();
const card = (o) => Object.assign({ id:'x', customer:'山田 太郎', car:'ノート', status:'check',
  boardId:'default', reserveDate:'2026-09-01', workTypes:[], workAddons:[], workSpecials:[], drive:[] }, o);
/* コンパクトなカードに出ている作業タイプの札だけ拾う */
const wtOf = (c) => [...W.cardHtml(c, { compact:true }).matchAll(/class="pcm-wt[^"]*"[^>]*>([^<]+)</g)].map(m => m[1]);
const tabOf = (c) => [...W.cardHtml(c, { compact:true }).matchAll(/class="pcm-caut([^"]*)"[^>]*>([^<]+)</g)].map(m => ({ exp:m[1].indexOf('exp')>=0, t:m[2] }));

console.log('\n── ① 車販依頼は、それだけの時しか出さない（A-3）──');
ok('車販依頼だけ → 出る', wtOf(card({ workTypes:['carsale'] })).join() === '車販依頼', wtOf(card({ workTypes:['carsale'] })));
ok('車検＋車販依頼 → 車販依頼は出ない', wtOf(card({ workTypes:['shaken','carsale'] })).indexOf('車販依頼') < 0, wtOf(card({ workTypes:['shaken','carsale'] })));
ok('車検＋車販依頼 → 車検は出る', wtOf(card({ workTypes:['shaken','carsale'] })).indexOf('車検') >= 0);
ok('🔴 隠す仲間しかいない時は隠さない（全部消えない）', wtOf(card({ workTypes:['carsale'] })).length > 0);

console.log('\n── ② 組み合わせの言い換え（A-5）──');
const bp = card({ workTypes:['bp'], workSpecials:['insurance'] });
const gw = card({ workTypes:['general'], workSpecials:['warranty'] });
ok('B.P＋保険 → 保険板金', wtOf(bp).join() === '保険板金', wtOf(bp));
ok('一般＋保証 → 保証修理', wtOf(gw).join() === '保証修理', wtOf(gw));
ok('表に無い組み合わせ（一般＋保険）は変えない', wtOf(card({ workTypes:['general'], workSpecials:['insurance'] })).join() === '一般');
ok('付加が無ければ変えない（B.Pだけ）', wtOf(card({ workTypes:['bp'] })).join() === 'B.P');
ok('🔴 ホバーの言い方は変えない（表を引くのは画面側の仕事）', (W.pitWtPair(bp) || {}).label === '保険板金');

console.log('\n── ③ 言い換えに使った付加はバッジを出さない（A-5）──');
ok('保険板金のとき、保険は隠す', W.pitSpecialHidden(bp, 'insurance') === true);
ok('保険板金のとき、社員は隠さない', W.pitSpecialHidden(bp, 'employee') === false);
ok('言い換えが無ければ何も隠さない', W.pitSpecialHidden(card({ workTypes:['bp'] }), 'insurance') === false);

console.log('\n── ④ 検切の耳タブ（H）──');
const t1 = tabOf(card({ shakenExpired:true }));
ok('検切だけ → 「検切」1つ・赤', t1.length === 1 && t1[0].t === '検切' && t1[0].exp, t1);
const t2 = tabOf(card({ shakenExpired:true, drive:['noShoes'] }));
ok('検切＋土禁 → 2つ、検切が先頭', t2.map(x=>x.t).join() === '検切,土禁', t2.map(x=>x.t));
const t3 = tabOf(card({ shakenExpired:true, drive:['leftHand','mt','lowCar','noShoes'] }));
ok('🔴 4つ以上 → 1文字に縮める', t3.map(x=>x.t).join() === '切,左MT,高,土', t3.map(x=>x.t));
ok('🔴 4つ以上でも1つも消えない', t3.length === 4, t3.length);
ok('検切なし・注意3つ → 今までどおり', tabOf(card({ drive:['leftHand','mt','lowCar','noShoes'] })).map(x=>x.t).join() === '左M/T,車高,土禁');

console.log('\n── ⑤ 検切は「この予約だけ」（H）──');
const cc = card({ shakenExpired:true });
W.cardHtml(cc, { compact:true });
ok('🔴 車ごとの注意（drive）に混ざっていない', cc.drive.length === 0, cc.drive);
ok('車両注意の物差しは検切を返さない', W.pitCarCautions(cc).length === 0);
ok('検切の物差しは1本ある', typeof W.pitCardExpired === 'function' && W.pitCardExpired(cc) === true);

console.log('\n── ⑥ 物販（G）──');
const g = card({ workTypes:['goods'], workType:'goods' });
ok('マスターに物販がある', !!W.state.workTypes.find(x => x.id === 'goods'));
ok('物販は引き出し（drawer）に置く', !!(W.state.workTypes.find(x => x.id === 'goods') || {}).drawer);
ok('物販は単独で立つ（alone）', !!(W.state.workTypes.find(x => x.id === 'goods') || {}).alone);
ok('物販の物差しがある', typeof W.pitCardGoods === 'function' && W.pitCardGoods(g) === true);
ok('🔴🔴 物販は「売上に数えない」側に入らない', W.pitCardNoSale(g) === false, '中古と同じ扱いにすると売上から静かに消える');
ok('中古（社内区分）は今までどおり売上に数えない', W.pitCardNoSale(card({ internKind:'used' })) === true);

console.log('\n────────────────────────────');
console.log((fail ? '❌' : '✅') + ' ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
