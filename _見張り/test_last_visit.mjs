/* PitFlow v2.9.4 ── 🗓 「最終入庫」は来店した日であって、レコードを触った日ではない
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-25・QS-695822 を追いかけていて見つかった）
     🗣「成田 脩人。このひとだが**カードがない**と。……
     　　**最終入庫 2026/8/20 なぜか残っている。でも実績にはない。これなんだ？？**」
   ◎正体
     顧客画面と検索が `cust.updatedAt` ／ `vehicle.updatedAt`
     （＝**レコードを最後に触った時刻**）を「最終入庫」と書いて出していた。
     成田さんの車は **8/20 に 11/07 の車検予約を作った時**に更新されただけで、
     **8/20 に入庫した事実は無い**。＝ **札が嘘をついていた。**
   ◎この試験がやること
     🔴 ① カードが1枚も無ければ**空**（updatedAt を代わりに出さない）
     🔴 ② 未来の予約だけでも**空**（まだ来ていない）
     🔴 ③ 実績があれば、そのいちばん新しい日
     🔴 ④ 物差しは customers.js の1本。search.js は借りるだけ
   ◎使い方
     node /tmp/srv.js（別ウィンドウ・8991番）
     node test_last_visit.mjs                                           */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const PORT = process.env.PORT || 8991;
const cp=['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p=>fs.existsSync(p));
let pass=0, fail=0;
const b=await chromium.launch({executablePath:cp});
const p=await b.newPage({viewport:{width:1400,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,180)));
await p.addInitScript(()=>{try{localStorage.setItem('pitflow_sample_authed','1');}catch(e){}});
await p.goto('http://127.0.0.1:'+PORT+'/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitCustLastVisit',null,{timeout:25000});
await p.waitForTimeout(500);
const r = await p.evaluate(()=>{
  const keepC=window.state.customers, keepK=window.state.cards;
  const cust={ id:'cu_t', name:'成田 脩人', kana:'ナリタ シュウト',
    updatedAt: Date.parse('2026-08-20T10:00:00'),   /* ← レコードを触った時刻（入庫ではない） */
    vehicles:[{ id:'v_t', plate:'習志野 301 ら 7575', car:'インプレッサWRX',
                updatedAt: Date.parse('2026-08-20T10:00:00') }] };
  window.state.customers=[cust];
  const out={};
  /* ① カードが1枚も無い（＝一度も来ていない） */
  window.state.cards=[];
  out.カードなし = window.pitCustLastVisit(cust);
  /* ② 未来の予約が1枚だけ（＝まだ来ていない） */
  window.state.cards=[{ id:'k1', resNo:'H02511', status:'reserved', customerId:'cu_t',
    plate:'習志野 301 ら 7575', reserveDate:'2026-11-07' }];
  out.未来の予約だけ = window.pitCustLastVisit(cust);
  /* ③ 実際に返車した実績がある */
  window.state.cards=[
    { id:'k1', resNo:'H02511', status:'reserved', customerId:'cu_t', plate:'習志野 301 ら 7575', reserveDate:'2026-11-07' },
    { id:'k2', resNo:'A00001', status:'returned', customerId:'cu_t', plate:'習志野 301 ら 7575',
      reserveDate:'2026-05-01', returnDate:'2026-05-03', completedAt:'2026-05-03', amountFinal:50000 },
    { id:'k3', resNo:'A00002', status:'returned', customerId:'cu_t', plate:'習志野 301 ら 7575',
      reserveDate:'2026-07-01', returnDate:'2026-07-04', completedAt:'2026-07-04', amountFinal:80000 }];
  out.実績あり = window.pitCustLastVisit(cust);
  window.state.customers=keepC; window.state.cards=keepK;
  return out;
});
const ok=(n,c,x='')=>{ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(x!==''?'  → '+JSON.stringify(x):''));} };
console.log('\n── 🗓 最終入庫は「来店した日」であって「レコードを触った日」ではない ──');
ok('🔴 カードが無ければ空（8/20 と嘘をつかない）', r.カードなし==='', r);
ok('🔴 未来の予約だけでも空（まだ来ていない）', r.未来の予約だけ==='', r);
ok('🔴 実績があれば、そのいちばん新しい日', r.実績あり==='2026-07-04', r);
ok('エラーなし', errs.length===0, errs);

console.log('\n── 🔍 物差しは1本 ──');
{
  const rd=(f)=>fs.readFileSync(path.join(process.cwd(),'js',f),'utf8');
  const 素=(f)=>rd(f).replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'');
  ok('🔴 customers.js が物差しを出している', /window\.pitCustLastVisit\s*=/.test(rd('customers.js')));
  /* ⚠ search.js の 224行目の `updatedAt` は**検索結果の並び順**。別の話なので触らない。
     見るのは `custLastVisit` の中だけ。 */
  const fn = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return '';
    let d = 0, k = src.indexOf('{', i);
    for (let m = k; m < src.length; m++){ if (src[m]==='{') d++; else if (src[m]==='}'){ d--; if(!d) return src.slice(k, m+1); } }
    return ''; };
  ok('🔴 search.js は借りるだけ（最終入庫に updatedAt を使っていない）',
     !/updatedAt/.test(fn(素('search.js'), 'custLastVisit')) && /pitCustLastVisit/.test(rd('search.js')),
     fn(素('search.js'), 'custLastVisit').slice(0, 120));
  ok('🔴 顧客画面も updatedAt を最終入庫に使っていない',
     !/最終入庫[^\n]*fmtDate\(last\)/.test(rd('customers.js')));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver||'').split('.').map(Number);
  ok('版が v2.9.4 以降', vn[0]>2 || (vn[0]===2 && (vn[1]>9 || (vn[1]===9 && vn[2]>=4))), ver);
}

console.log('\n' + (fail===0?'🎉 ':'⚠ ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail===0?0:1);
