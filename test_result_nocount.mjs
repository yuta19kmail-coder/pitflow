/* PitFlow v2.9.5 ── 🗓 数えない側のカレンダー／「売上なしなのに金額」を出さない
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-25・Z27464 蓮見さんを売上なしアーカイブにしたあと）
     🗣「まだ**データチェックで売上なしなのに金額入ってる**に出てくるのと
     　　**実績の数えない側のカレンダーに反映されない**」
   ◎正体は2つ、どちらも私の見落とし
     ① `_resultDayCards` が `completedAt` **だけ**で日を決めていた。
        売上なしアーカイブは `completedAt` を**入れない**決めごと（v1.99.0・二重の守り）なので、
        **数えない側のカレンダーにも永久に出てこない。**
        v2.6.0 で「数えない側」を作った時に、日付をどこから取るかを見落としていた。
     ② データチェック M08「売上なしなのに金額が入っている」は、
        `cvNoSaleArchive` の 🔴「**金額は書き換えない**」（v1.99.0・ゆうた指定）と**正面衝突**していた。
        ＝ 正しい姿を毎回 🟡 で出していた。金額を消す道はデータを捨てるので取れない。**規則を引っ込めた。**
   ◎この試験がやること
     🔴 ① 数えない側の**来た日**に出ること／数える側には出ないこと
     🔴 ② 数える側は今までどおり `completedAt` だけで決めること（実績の日をブレさせない）
     🔴 ③ M08 が出ないこと／M09（理由が残っていない）は残っていること
   ◎使い方
     node /tmp/srv.js（別ウィンドウ・8991番）
     node test_result_nocount.mjs                                       */
import { chromium } from 'playwright';
import fs from 'fs';
const PORT = process.env.PORT || 8991;
let pass=0, fail=0;
const cp=['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p=>fs.existsSync(p));
const b=await chromium.launch({executablePath:cp});
const p=await b.newPage({viewport:{width:1400,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,180)));
await p.addInitScript(()=>{try{localStorage.setItem('pitflow_sample_authed','1');}catch(e){}});
await p.goto('http://127.0.0.1:'+PORT+'/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitCardDoneDate && window._resultDayCards!==undefined || true',null,{timeout:25000});
await p.waitForTimeout(700);
const r = await p.evaluate(()=>{
  const keep=window.state.cards, keepM=window.state.resultMode;
  /* 蓮見さん相当：売上なしアーカイブ（実績日は空・入庫 8/07・金額 26,800 は残す） */
  const hasumi={ id:'z', resNo:'Z27464', status:'returned', noSale:true, noSaleAt:'2026-08-25', noSaleBy:'社長',
    customer:'蓮見 久美', plate:'松戸 510 せ 5118', car:'ソリオ', amountFinal:26800,
    reserveDate:'2026-08-07', returnDate:'2026-08-07', returnDateFinal:'2026-08-07', completedAt:'' };
  /* ふつうの実績（数える側） */
  const normal={ id:'n', resNo:'N0001', status:'returned', customer:'ふつう', plate:'習志野 500 あ 11-11',
    car:'ノア', amountFinal:100000, reserveDate:'2026-08-05', returnDate:'2026-08-07',
    returnDateFinal:'2026-08-07', completedAt:'2026-08-07' };
  window.state.cards=[hasumi, normal];
  const pick=(mode,d)=>{ window.state.resultMode=mode; return _resultDayCards(d).map(c=>c.resNo); };
  /* 🏢 社内車両：pitInternReturn が completedAt を入れる＝日はそちらで決まる */
  const naibu={ id:'i', resNo:'I0001', status:'returned', internKind:'used', customer:'中古車',
    plate:'習志野 500 う 33-33', car:'ヴィッツ', amountFinal:'',
    reserveDate:'2026-08-01', returnDate:'2026-08-07', returnDateFinal:'2026-08-07', completedAt:'2026-08-07' };
  window.state.cards=[hasumi, normal, naibu];
  const out={
    数えない側_0807: pick('nocount','2026-08-07'),
    数える側_0807:   pick('count','2026-08-07'),
    落とす日: window.pitCardDoneDate(hasumi)
  };
  /* データチェック M08 が消えているか */
  const rules=(window.PIT_INSPECT_RULES||window.pitInspectRules||[]);
  const list=Array.isArray(rules)?rules:(rules.rules||[]);
  out.M08がある = list.some(x=>x&&x.id==='M08');
  out.M09は残っている = list.some(x=>x&&x.id==='M09');
  window.state.cards=keep; window.state.resultMode=keepM;
  return out;
});
const ok=(n,c,x='')=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==''?'  → '+JSON.stringify(x):''));} };
console.log('\n── 🗓 数えない側のカレンダーに出る ──');
ok('🔴 数えない側の 8/07 に蓮見さんが出る', r.数えない側_0807.includes('Z27464'), r);
ok('🔴 社内車両も同じ日に出る（消えない）', r.数えない側_0807.includes('I0001'), r);
ok('🔴 数える側には出ない', !r.数える側_0807.includes('Z27464') && r.数える側_0807.includes('N0001'), r);
ok('　落とす日＝来た日（入庫日）', r.落とす日==='2026-08-07', r);
console.log('\n── 🩺 データチェック ──');
ok('🔴 M08（売上なしなのに金額）は出さない', r.M08がある===false, r);
ok('　M09（理由が残っていない）は残っている', r.M09は残っている===true, r);
ok('エラーなし', errs.length===0, errs);

console.log('\n── 🔍 決めごとを機械で読む ──');
{
  const rd=(f)=>fs.readFileSync('js/'+f,'utf8');
  ok('🔴 数える側は completedAt だけ（緩めていない）',
     /if \(!nc\) return done;/.test(rd('result.js')) && /var done = String\(c\.completedAt \|\| ''\);/.test(rd('result.js')));
  ok('🔴 数えない側も completedAt が先（社内車両を消さない）',
     /if \(done\) return done;/.test(rd('result.js')));
  ok('🔴 数えない側は物差し1本に落とす', /pitCardDoneDate/.test(rd('result.js')));
  ok('🔴 customers.js が物差しを出している', /window\.pitCardDoneDate\s*=/.test(rd('customers.js')));
  ok('🔴 M08 を消さずに「なぜ止めたか」を残してある',
     /M08[\s\S]{0,400}金額は書き換えない/.test(rd('inspect-rules.js')));
  ok('🔴 金額を消す道を作っていない（cvNoSaleArchive は今までどおり）',
     /金額は書き換えない/.test(rd('card-view.js')));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver||'').split('.').map(Number);
  ok('版が v2.9.5 以降', vn[0]>2 || (vn[0]===2 && (vn[1]>9 || (vn[1]===9 && vn[2]>=5))), ver);
}

console.log('\n' + (fail===0?'🎉 ':'⚠ ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail===0?0:1);
