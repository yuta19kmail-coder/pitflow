/* PitFlow ── 🖨 **代車作業予定ボードの「表紙を印刷」**（v2.166.0・ブラウザは使わない）
   ===================================================================
   🗣 ゆうた指定 2026-10-11「代車作業予定の各予定の看板に表紙を印刷を足したい。
      候補日の場合はテキストエリアに一覧を入れて、確定日は記載しない。代車用の書式にしてほしい」
   （確かめた答え）今の様式を代車向けに直す／確定していれば入庫日の欄に書く

   ◎ここで見張ること
     ① 候補だけ＝入庫日は空・左の罫線に「候補日」と一覧（曜日つき）
     ② 確定あり＝入庫日に確定の初日・候補の一覧は出さない
     ③ お客様向けの欄は空（様・初回・受付タイプ・代車 有/無・課・担当・受付日・TEL）
     ④ ふつうの表紙は今までどおり（様を隠さない・初回が出る）
     ⑤ ボードの行にボタンがある（実績に入った行には出さない）

   ◎使い方
       node _見張り\test_maint_cover.mjs
       node _見張り\test_maint_cover.mjs --break=1 … 候補の一覧を出さない → ①が赤くなるのが正しい
       node _見張り\test_maint_cover.mjs --break=2 … 「様」を隠さない     → ③が赤くなるのが正しい
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
function bend(src) {
  if (BREAK === '1') return src.replace("rows.push('候補日');", "return rows;");
  if (BREAK === '2') return src.replace("if (fl) svg = injectSamaMask(svg);", "if (fl) svg = svg;");
  return src;
}

/* 様式の代わり＝差し込み口だけの小さい SVG（本物の様式は images/様式_お客様情報.svg） */
const TOK = ['name','maker','car','m','d','dow','time','tel','plateA','plateB','repeat','drop','loaner','loanerSpan','loanerCond','fee','course','front','resStaff','bm','bd','bdow'];
const FORM = '<svg xmlns="http://www.w3.org/2000/svg">' + TOK.map(k => '<text data-k="' + k + '">{{' + k + '}}</text>').join('') + '</svg>';
const val = (doc, k) => { const m = doc.match(new RegExp('data-k="' + k + '"[^>]*>([^<]*)<')); return m ? m[1] : null; };
const memo = (doc) => { const m = doc.match(/id="pcv-memo"[^>]*data-rows="([^"]*)"/); return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : []; };

const ctx = { console, window: null, document: {}, state: { cards: [], loaners: [], workTypes: [{ id:'shaken', label:'車検' }, { id:'12pt', label:'12点' }] } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(bend(JS('cover-print.js')), ctx, { filename: 'cover-print.js' });

const card = { id:'c1', resNo:'R01-1', internKind:'loanercar', customer:'自社代車', workType:'shaken', workTypes:['shaken'],
               menu:'車検一式\nワイパー交換', needLoaner:false, workSpecials:[], repeat:'', dropType:'drop' };
const base = { name:'代車3', maker:'ダイハツ', car:'タント', plate:'足立 580 あ 1234',
               cands:[{ fromDate:'2026-10-14', toDate:'2026-10-16' }, { fromDate:'2026-10-21', toDate:'2026-10-21' }] };

console.log('\n── ① 候補だけ ──');
{
  const doc = ctx.pitBuildCoverDoc(card, { formSvg: FORM, noPrint: true, fleet: Object.assign({}, base, { fixed: null }) });
  ok('入庫日は空', val(doc, 'm') === '' && val(doc, 'd') === '' && val(doc, 'dow') === '');
  const rows = memo(doc);
  ok('🔴 左の罫線に作業内容 → 1行空け → 候補日', rows[0] === '車検一式' && rows[2] === null && rows[3] === '候補日', rows);
  ok('🔴 候補は曜日つきで期間', rows[4] === '・10/14(水) 〜 10/16(金)', rows[4]);
  ok('1日だけの候補は1日だけ書く', rows[5] === '・10/21(水)', rows[5]);
  ok('作業バッジが出る', /車検/.test(doc));
}

console.log('\n── ② 確定あり ──');
{
  const doc = ctx.pitBuildCoverDoc(card, { formSvg: FORM, noPrint: true,
    fleet: Object.assign({}, base, { fixed: { fromDate:'2026-11-12', toDate:'2026-11-14' } }) });
  ok('🔴 入庫日に確定の初日', val(doc, 'm') === '11' && val(doc, 'd') === '12' && val(doc, 'dow') === '木');
  ok('🔴 候補の一覧は出さない', memo(doc).indexOf('候補日') < 0, memo(doc));
}

console.log('\n── ③ お客様向けの欄は空 ──');
{
  const doc = ctx.pitBuildCoverDoc(card, { formSvg: FORM, noPrint: true, fleet: Object.assign({}, base, { fixed: null }) });
  ok('お名前欄＝車の名前', val(doc, 'name') === '代車3');
  ok('車種欄＝メーカー＋車種', val(doc, 'maker') === 'ダイハツ' && val(doc, 'car') === 'タント');
  ok('ナンバーが出る', val(doc, 'plateB') === '12-34' && val(doc, 'plateA') === '足立 580 あ');
  ok('🔴 初回/リピーター・受付タイプ・代車・課・担当・受付日・TEL は空',
     ['repeat','drop','loaner','loanerSpan','loanerCond','fee','course','front','resStaff','bm','bd','bdow','tel','time'].every(k => val(doc, k) === ''),
     ['repeat','drop','loaner','tel'].map(k => k + '=' + val(doc, k)));
  ok('🔴 「様」を白で隠す', /id="pcv-samamask"/.test(doc));
  ok('代車管理費のチェックは付けない', !/pcv-loanerfee/.test(doc));
  ok('題名は代車の整備', /<title>表紙 代車3（代車の整備）<\/title>/.test(doc));
}

console.log('\n── ④ ふつうの表紙は今までどおり ──');
{
  const c = { id:'c2', customer:'山田', car:'ゴルフ', reserveDate:'2026-10-20', repeat:'', workTypes:['shaken'], menu:'車検', needLoaner:true, loanerId:'' };
  const doc = ctx.pitBuildCoverDoc(c, { formSvg: FORM, noPrint: true });
  ok('様を隠さない', !/pcv-samamask/.test(doc));
  ok('初回が出る', val(doc, 'repeat') === '初回');
  ok('代車ありは管理費にチェック', /pcv-loanerfee/.test(doc));
  ok('入庫日が出る', val(doc, 'm') === '10' && val(doc, 'd') === '20');
}

console.log('\n── ④b 紐づけのカルテNo（v2.167.0） ──');
{
  const doc = ctx.pitBuildCoverDoc(card, { formSvg: FORM, noPrint: true, fleet: Object.assign({}, base, { fixed: null, karteNo: 'K-123' }) });
  const rows = memo(doc);
  ok('🔴 先頭に「カルテNo：」→ 1行空けて作業内容', rows[0] === 'カルテNo：K-123' && rows[1] === null && rows[2] === '車検一式', rows);
  const doc2 = ctx.pitBuildCoverDoc(card, { formSvg: FORM, noPrint: true, fleet: Object.assign({}, base, { fixed: null, karteNo: '' }) });
  ok('紐づけが無ければ出さない', memo(doc2)[0] === '車検一式');
  /* 🏁 v2.168.0 リース車両＝カルテNo の場所に「リース車両」 */
  const doc3 = ctx.pitBuildCoverDoc(card, { formSvg: FORM, noPrint: true, fleet: Object.assign({}, base, { fixed: null, lease: true }) });
  ok('🔴 リース車両は先頭に「リース車両」', memo(doc3)[0] === 'リース車両' && memo(doc3)[1] === null, memo(doc3));
  ok('ボードから lease を渡している', /lease: !!v\.lease/.test(JS('maint-pit.js')));
  const mp = JS('maint-pit.js');
  ok('カルテNo はスペック表と同じ pitFleetLinkTarget から', /pitFleetLinkTarget\(v\)[\s\S]{0,120}karteNo/.test(mp));
}

console.log('\n── ⑥ 内容を見る・直す（v2.167.0） ──');
{
  const mp = JS('maint-pit.js');
  ok('🔴 ボードの行に「内容」の行がある', /class="mb-line mb-menu"><span>内容<\/span>/.test(mp));
  ok('「直す」は実績に入った行には出さない', /r\.doneReady \? '' : '<span class="mb-chip add" onclick="flMaintEdit/.test(mp));
  ok('🔴 計算の目標（車検・12点）は作業と月を変えさせない', /var work = manual \? _mbaWork : r\.work;/.test(mp) && /var ym = manual \?/.test(mp));
  ok('一般・B.P は内容が要る（足す時と同じ PF-3051）', (mp.match(/code:'PF-3051'/g) || []).length >= 2);
  ok('直したら記録（カードの log と操作ログ）', /代車の作業予定を直した（/.test(mp) && /pitLog\('代車の作業予定を直した'/.test(mp));
  ok('カードが無い目標は内容を入れた時だけカードを作る', /if \(!menu\)\{ flMaintClose\(\); return; \}[\s\S]{0,120}newMaintCard\(vehId, r\.work, r\.plan\.ym/.test(mp));
}

console.log('\n── ⑤ ボードの行 ──');
{
  const mp = JS('maint-pit.js');
  ok('ボードの行に「表紙を印刷」', /flMaintCover\(\\'' \+ r\.vehicleId/.test(mp) && /表紙を印刷<\/button>/.test(mp));
  ok('実績に入った行には出さない', /r\.doneReady \? '' : '<button class="vh-btn" onclick="flMaintCover/.test(mp));
  ok('🔴 候補はまだ来ていないものだけ（live）', /cands: r\.live, fixed: r\.fixed/.test(mp));
  ok('印刷のためにカードを作らない（保存しない）', !/flMaintCover[\s\S]{0,1600}saveCards\(\)/.test(mp.slice(mp.indexOf('w.flMaintCover'), mp.indexOf('w.flMaintGoto'))));
}

console.log('\n─────────────────────────────');
if (BREAK) {
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  if (fail > 0) { console.log('🟢 正しい＝壊したら赤くなった（この見張りは効いている）'); process.exit(0); }
  console.log('🔴 まずい＝壊したのに全部緑のまま。見張りが効いていない'); process.exit(1);
}
console.log('✅ ' + pass + ' / ❌ ' + fail);
process.exit(fail ? 1 : 0);
