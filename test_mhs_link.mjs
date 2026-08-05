/* PitFlow v1.22.0 ── 新規予約の「担当の予定」（MHS連携）のテスト
   -------------------------------------------------------------------
   ◎考え方
     本体は動かさない。**本物の js/mhs-pit.js** と、
     **card-detail.js から切り出した本物の _cfsMhsHtml / _cfsMhsFoot** を
     小さなページに載せて、偽のFirestoreからデータを流し込んで確かめる。
     ⚠ card-detail.js 側の関数名や、MHSが配るキー（t / ty / l）が食い違うと
        ここが落ちる＝連携が切れたことに気づける。
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8943      ← 別ウィンドウ
     node test_mhs_link.mjs                                                 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();

/* ---- card-detail.js から「MHS欄を組み立てる所」だけを切り出す ---- */
function cutMhsFns(){
  const src = fs.readFileSync(path.join(dir, 'js', 'card-detail.js'), 'utf8');
  const i = src.indexOf('function _cfsMhsHtml(c){');
  const j = src.indexOf('/* v0.84.0 MHS予定取得フック');
  if (i < 0 || j < 0 || j < i) throw new Error('card-detail.js から _cfsMhsHtml を切り出せません（構成が変わった？）');
  return src.slice(i, j);
}

/* ---- 試験台を組み立てる ---- */
(function build(){
  const mhsFns = cutMhsFns();
  const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="css/polish.css">
<style>
:root{--bg:#12161f;--bg2:#161c28;--bg3:#1e2634;--border:#2b3547;--border2:#39455c;--text:#dbe3ef;--text2:#93a2bb;--text3:#63718a;--brand:#1db97a}
body{margin:0;background:var(--bg);color:var(--text);font-family:sans-serif;padding:16px;width:340px}
</style><body>
<div id="out"></div>
<script src="js/coreflow-icons.js"><\/script>
<script>
/* ---- 本体から借りる最小の道具 ---- */
window.ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
window._pe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
var _pe=window._pe, ymd=window.ymd;

/* ---- 名簿（PitFlow の state.staff と同じ形） ---- */
/* 🔴 v1.29.0 ここが「予定が出ない」の正体。本物の state.staff は
   id ＝ CoreFlow名簿（portalMembers）のID、cmId ＝ CoreMembers のID で**別物**。
   MHS が配る「日×人」のキーは **CoreMembers のID**。だから cmId で引かないと当たらない。
   以前のこのテストは id と キーを同じにしていたので、本番だけ落ちていた。 */
window.state={ staff:[
  {id:'pm1',cmId:'cm1',name:'小林 勇太',aliases:['ゆうた'],photo:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'},
  {id:'pm2',cmId:'cm2',name:'佐藤 花子'},
  {id:'pm3',cmId:'cm3',name:'高橋 一郎'},
  {id:'pm4',cmId:'',   name:'名簿だけ 太郎'}      /* CoreMembers に居ない人＝id で当たる保険 */
]};
window.pitStaffByName=n=>state.staff.find(x=>x.name===n)||null;
window.pitStaffAny=n=>state.staff.find(x=>x.name===n||(x.aliases||[]).indexOf(n)>=0)||null;

/* ---- 偽の Firestore（onSnapshot を手で発火できるようにする） ---- */
window.__subs={}; window.__subCount={};
window.fb={ currentCompanyId:'kobayashi_motors', db:{
  collection:c=>({ doc:()=>({ collection:()=>({
    doc:function(id){ return { onSnapshot:function(ok,ng){
      var ym=String(id).replace('mhsDigest-','');
      window.__subCount[ym]=(window.__subCount[ym]||0)+1;
      window.__subs[ym]={ok:ok,ng:ng};
      return function(){};
    } }; }
  }) }) })
}};
/* 月ぶんのデータを流し込む。exists=false／エラーも作れる。 */
window.__push=function(ym,days,ageDays){
  var s=window.__subs[ym]; if(!s) return false;
  var at=Date.now()-(ageDays||0)*86400000;
  s.ok({ exists:true, data:()=>({ ym:ym, ver:1, days:days, updatedAt:{ toMillis:()=>at } }) });
  return true;
};
window.__pushMissing=function(ym){ var s=window.__subs[ym]; if(!s) return false; s.ok({exists:false}); return true; };
window.__pushError  =function(ym){ var s=window.__subs[ym]; if(!s) return false; s.ng(new Error('permission-denied')); return true; };

/* ---- 描き直しの入口が呼ばれたか数える（card-detail.js が出す窓口） ---- */
window.__repaints=0;
window.pitCardRepaint=function(){ window.__repaints++; };
<\/script>
<script src="js/mhs-pit.js"><\/script>
<script>
/* ---- ここから下は card-detail.js の本物のコード（切り出し） ---- */
${mhsFns}
/* ---- 画面に出す ---- */
/* 組み立てた「そのままの文字列」を返す。
   ⚠ innerHTML を返すと ICapply がアイコンをSVGに差し替えた後になり、data-ic が消えて見えない。 */
window.__render=function(c){ var s=_cfsMhsHtml(c); document.getElementById('out').innerHTML=s; if(window.icHydrate) icHydrate(document.getElementById('out')); return s; };
window.__ready=1;
<\/script>`;
  fs.writeFileSync(path.join(dir, 'test-mhs.html'), page);
})();

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 420, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:8943/test-mhs.html');
await p.waitForFunction('window.__ready===1');

const sched = (who, ds) => p.evaluate(([w, d]) => window.pitMhsSchedule(w, d), [who, ds]);
const stat  = (ds)      => p.evaluate(d => window.pitMhsStatus(d), ds);
const html  = (c)       => p.evaluate(c => window.__render(c), c);

const YM = '2026-08';
const D1 = '2026-08-10', D2 = '2026-08-11';
const DAYS = {
  [D1]: {
    cm1: [
      { t: '',      ty: 'off',     l: '休み' },
      { t: '13:30', ty: 'out',     l: '車検場へ' },
      { t: '09:00', ty: 'mtg',     l: '朝礼' },
      { t: '',      ty: 'routine', l: '倉庫の片付け' },
      { t: '17:00', ty: 'duty',    l: '戸締り当番' },
      { t: '11:00', ty: 'ナゾ',    l: '未知の種別' }
    ],
    cm2: [{ t: '10:00', ty: 'mtg', l: '<script>×escape' }, { t: '', ty: 'off', l: '休み' }],
    pm4: [{ t: '09:30', ty: 'mtg', l: 'CoreMembersに居ない人の予定' }]
  },
  [D2]: { cm3: [{ t: '08:30', ty: 'mtg', l: '朝ミーティング' }] }
};

console.log('\n── ① まだ届いていない時 ──');
ok('届く前は空を返す（勝手に「予定なし」と言わない）', (await sched('小林 勇太', D1)).length === 0);
let st = await stat(D1);
ok('状態＝loading', st && st.state === 'loading', st);
ok('その月を1回だけ購読する', (await p.evaluate(y => window.__subCount[y], YM)) === 1, await p.evaluate(y => window.__subCount[y], YM));
await sched('佐藤 花子', D1); await sched('小林 勇太', D2);
ok('同じ月を何度聞いても購読は1本のまま', (await p.evaluate(y => window.__subCount[y], YM)) === 1);

console.log('\n── ② データが届いた ──');
ok('流し込めた', await p.evaluate(([y, d]) => window.__push(y, d, 0), [YM, DAYS]));
await p.waitForTimeout(220);
ok('届いたらカードを描き直す（pitCardRepaint が呼ばれる）', (await p.evaluate(() => window.__repaints)) >= 1, await p.evaluate(() => window.__repaints));

let L = await sched('小林 勇太', D1);
console.log('   ', JSON.stringify(L));
/* v1.29.0：**当番は出さない／休みは行に出さない**（休みは下の休み欄・大きい表示にまわす） */
ok('その人の件数が合う（当番と休みを除いた4件）', L.length === 4, L.length);
ok('時刻順に並ぶ', L.map(x => x.t).join(',') === '09:00,11:00,13:30,', L.map(x => x.t));
ok('時刻なしは後ろ（ルーティン）', L[3].t === '');
ok('out → out', L.find(x => x.label === '車検場へ').type === 'out');
ok('🔴 当番は出さない', !L.some(x => x.type === 'duty' || x.label === '戸締り当番'), L.map(x => x.label));
ok('🔴 休みは行として出さない', !L.some(x => x.type === 'off'), L.map(x => x.type));
ok('routine → routine', L.find(x => x.label === '倉庫の片付け').type === 'routine');
ok('知らない種別は mtg に寄せる（崩さない）', L.find(x => x.label === '未知の種別').type === 'mtg');

console.log('\n── ③ 名前からメンバーを引く ──');
ok('通称（別名）でも引ける', (await sched('ゆうた', D1)).length === 4);
ok('🔴 CoreMembers のID（cmId）で引けている', (await sched('小林 勇太', D1)).length === 4);
ok('🔴 CoreMembers に居ない人は CoreFlow名簿のID で引ける', (await sched('名簿だけ 太郎', D1)).length === 1);
ok('別の人は別の予定', (await sched('佐藤 花子', D1)).length === 1);
ok('名簿にない名前は空', (await sched('居ない 人', D1)).length === 0);
ok('空の担当名は空', (await sched('', D1)).length === 0);
ok('別の日はその日ぶんだけ', (await sched('高橋 一郎', D2)).length === 1 && (await sched('高橋 一郎', D1)).length === 0);
ok('予定の無い人はその日も空', (await sched('高橋 一郎', D1)).length === 0);

console.log('\n── ④ 「いつ時点か」 ──');
st = await stat(D1);
ok('状態＝ok', st.state === 'ok', st);
ok('更新時刻が入る', st.updatedAt > 0);
ok('古さ＝0日', st.staleDays === 0, st.staleDays);

console.log('\n── ⑤ 画面（card-detail.js の本物の組み立て） ──');
let h = await html({ frontStaff: '', reserveDate: D1 });
ok('担当未選択：選ぶよう促す', /フロント担当を選ぶと/.test(h));

h = await html({ frontStaff: '小林 勇太', reserveDate: D1 });
ok('見出しに担当名', /小林 勇太 の予定/.test(h));
ok('4行出る（当番と休みは行にしない）', (h.match(/class="mhs-row/g) || []).length === 4, (h.match(/class="mhs-row/g) || []).length);
ok('時刻なしは「終日」と書く', /終日/.test(h));
ok('MHS更新の行が出る', /class="mhs-foot"/.test(h));
ok('古い印は付かない（今日ぶん）', !/mhs-foot old/.test(h));
ok('ルーティンのアイコンが出る', /data-ic=recycle/.test(h));
ok('🔴 当番のアイコンは出ない', !/data-ic=flag/.test(h));

console.log('\n── ⑤-2 休み＝本人は大きく／ほかの人はアバター ──');
ok('🔴 本人が休みの日は「担当者休み」と大きく出る', /class="mhs-big"/.test(h) && /担当者休み/.test(h));
ok('大きい表示に本人の名前が入る', /class="mhs-big-n">小林 勇太</.test(h));
ok('休み欄（アバター）も出る', /class="mhs-off"/.test(h));
ok('休み欄に出るのは**ほかの人だけ**（本人は混ぜない）',
   (h.match(/class="bn-av mhs-av/g) || []).length === 1 && /title="佐藤 花子/.test(h) && !/title="小林 勇太/.test(h),
   (h.match(/class="bn-av mhs-av/g) || []).length);
{
  const h2 = await html({ frontStaff: '高橋 一郎', reserveDate: D1 });
  ok('休みでない人の時は大きい表示は出ない', !/class="mhs-big"/.test(h2));
  ok('その日休みの2人がアバターで並ぶ', (h2.match(/class="bn-av mhs-av/g) || []).length === 2,
     (h2.match(/class="bn-av mhs-av/g) || []).length);
  ok('顔写真がある人は img で出る', /<img src="data:image\/gif/.test(h2));
  ok('顔写真が無い人は頭2文字', /class="bn-av mhs-av"[^>]*>佐藤</.test(h2) || /佐藤/.test(h2));
}

h = await html({ frontStaff: '佐藤 花子', reserveDate: D1 });
ok('タグ等はエスケープされる（そのまま流し込まない）', /&lt;script&gt;/.test(h) && !/<script>×/.test(h));

h = await html({ frontStaff: '高橋 一郎', reserveDate: D1 });
ok('その日の予定が無い＝「入っていません」', /この日の予定は入っていません/.test(h), h.slice(0, 300));
ok('予定なしでも更新時刻は出す', /class="mhs-foot"/.test(h));

console.log('\n── ⑥ 古い時 ──');
await p.evaluate(([y, d]) => window.__push(y, d, 5), [YM, DAYS]);
await p.waitForTimeout(60);
st = await stat(D1);
ok('古さ＝5日', st.staleDays === 5, st.staleDays);
h = await html({ frontStaff: '小林 勇太', reserveDate: D1 });
ok('2日以上前は色が変わる（old）', /mhs-foot old/.test(h));
ok('「◯日前」と書く', /5日前/.test(h));

console.log('\n── ⑦ 届いていない月・読めない時 ──');
const YM2 = '2026-09', D3 = '2026-09-01';
await sched('小林 勇太', D3);                     /* ここで9月の購読が始まる */
await p.waitForTimeout(30);
ok('9月も購読を始める', (await p.evaluate(y => window.__subCount[y], YM2)) === 1);
await p.evaluate(y => window.__pushMissing(y), YM2);
await p.waitForTimeout(60);
st = await stat(D3);
ok('ドキュメント無し＝none', st.state === 'none', st);
h = await html({ frontStaff: '小林 勇太', reserveDate: D3 });
ok('「まだ届いていません」と書く', /まだ届いていません/.test(h), h.slice(0, 300));
ok('届いていない時は更新時刻を出さない', !/mhs-foot/.test(h));

const YM3 = '2026-10', D4 = '2026-10-01';
await sched('小林 勇太', D4);
await p.waitForTimeout(30);
await p.evaluate(y => window.__pushError(y), YM3);
await p.waitForTimeout(60);
st = await stat(D4);
ok('読めない＝error', st.state === 'error', st);
h = await html({ frontStaff: '小林 勇太', reserveDate: D4 });
ok('「読めませんでした」と書く', /読めませんでした/.test(h), h.slice(0, 300));

console.log('\n── ⑧ 入庫日が未定でも落ちない ──');
h = await html({ frontStaff: '小林 勇太', reserveDate: '' });
ok('入庫日なしでも組み立てられる（今日で見る）', /の予定/.test(h) && h.length > 0);

console.log('\n── ⑨ 本体との食い違い（配線チェック） ──');
const idx = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ok('index.html が js/mhs-pit.js を読み込んでいる', /<script src="js\/mhs-pit\.js/.test(idx));
ok('mhs-pit.js は card-detail.js より後ろ', idx.indexOf('js/mhs-pit.js') > idx.indexOf('js/card-detail.js'));
/* ⚠ 版は上がっていくので数字は固定しない。3か所がそろっているかだけ見る。 */
{
  const _m = (idx.match(/<div class="login-ver">v([\d.]+)<\/div>/) || [])[1] || '';
  const _t = (idx.match(/<span class="ver">v([\d.]+)<\/span>/) || [])[1] || '';
  const _a = (idx.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  ok('画面の版2か所と app-version がそろっている', !!_m && _m === _t && _m === _a, [_m, _t, _a]);
}
const cd = fs.readFileSync(path.join(dir, 'js', 'card-detail.js'), 'utf8');
ok('card-detail.js が pitCardRepaint を出している', /window\.pitCardRepaint\s*=/.test(cd));
ok('card-detail.js が pitMhsStatus を見ている', /window\.pitMhsStatus/.test(cd));
ok('「準備中」の文言は消えている', !/MHS連携は準備中/.test(cd));
const css = fs.readFileSync(path.join(dir, 'css', 'polish.css'), 'utf8');
ok('polish.css に .mhs-foot がある', /\.mhs-foot\{/.test(css));
ok('polish.css に休み欄（.mhs-off）がある', /\.mhs-off\{/.test(css));
ok('polish.css に大きい表示（.mhs-big）がある', /\.mhs-big\{/.test(css));
const mp = fs.readFileSync(path.join(dir, 'js', 'mhs-pit.js'), 'utf8');
ok('🔴 mhs-pit.js が cmId を先に見ている（ID食い違いの再発防止）',
   /if \(s && s\.cmId\) out\.push/.test(mp) && mp.indexOf('s.cmId') < mp.indexOf("out.indexOf(String(s.id))"));
ok('mhs-pit.js が休みの一覧（pitMhsOff）を出している', /window\.pitMhsOff\s*=/.test(mp));
ok('card-detail.js が pitMhsOff を使っている', /window\.pitMhsOff/.test(cd));

ok('JSエラー0', errs.length === 0, errs.slice(0, 3));

await html({ frontStaff: '小林 勇太', reserveDate: D1 });
await p.waitForTimeout(120);
await p.screenshot({ path: 'shot_mhs_link.png' });
await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail ? 1 : 0);
