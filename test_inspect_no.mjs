/* PitFlow v1.178.0 ── 🔢 データチェックの「1件ごとの番号」
   ===================================================================
   ◎ゆうた指定（2026-08-23）
     🗣「**データチェックの不良箇所に個別に番号を搭載したい**」
     選んでもらった形＝「**毎回おなじ番号**」（画面の並び順の通し番号ではない）

   ◎ここで見張ること（🔴 が本体）
     🔴🔴 **いつ・誰が見ても同じ番号**であること
        ・もう一度チェックしても同じ
        ・ほかの車が増えても、その車の番号は動かない
        ・直って消えたものが、また出た時も**同じ番号に戻る**
        ・番号の元は **key（規則ID＋対象ID）だけ**＝日付・件数・並び順を混ぜていない
     🔴 **ぶつからない**こと（同じ規則の中で、同じ番号が2つ出ない）
     🔴 **エラー番号（PF-0412）と紛れない**こと
     🔴 番号を作る所が **1本だけ**であること（画面で作り直していない）
     ・画面・「ここを直す」の小窓・書き出しの**3か所とも同じ番号**が出ること
     ・押すとコピーできること

   ◎日付について（横断の見張り ④ の決めごと）
     🔴 このファイルに**決め打ちの日付を書かない**。全部「今日から何日」で作る。

   ◎使い方
     python3 -m http.server 8996      ← 別ウィンドウ
     node test_inspect_no.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8996;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.pitInspectRun && window.renderInspect && window.pitInspectNo', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(800);

/* 下ごしらえ＝自分で作った少数のカードだけにする（見本データだと数が日で変わる） */
await p.evaluate(() => {
  const D = n => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  window._D = D;
  let _seq = 0;
  window._clean = (over) => {
    const c = Object.assign({
      boardId:'default', division:'div1',
      customer:'検査 太郎', kana:'ケンサタロウ',
      repeat:'repeat', maker:'トヨタ', car:'アクア',
      workType:'general', workTypes:['general'], menu:'一般整備', dropType:'drop',
      reserveDate:D(1), reserveTime:'10:00', returnDate:D(3), returnTime:'15:00',
      status:'reserved', frontStaff:'椎名', staff:'椎名',
      estAmount:100000, estHoldDays:2, needLoaner:false,
      inspectors:['椎名'], mechanics:['椎名'],
      amountQuote:null, amountOrder:null, amountFinal:null
    }, over || {});
    _seq++;
    if (!c.id)    c.id    = 'x' + _seq;
    if (!c.plate) c.plate = '野田 500 あ ' + String(1000 + _seq);
    if (!c.tel)   c.tel   = '090-1111-' + String(1000 + _seq);
    return c;
  };
  /* 🔴 ここは「番号」の見張りなので、**M01（受注金額が空）だけを見る**。
     ⚠ 土台のカードは、走らせた曜日によっては別の規則（お休みの日の予定など）も鳴らす。
        番号の話とは関係が無いので、数えるのは M01 だけにする。 */
  window._m01 = (res) => res.findings.filter(f => f.ruleId === 'M01');
  window._only = (cards) => {
    state.cards = cards.map(c => window._clean(c));
    state.loanerAssigns = [];
    state.loaners = ['L01','L02','L03','L04'].map((id, i) => ({
      id:id, name:'代車' + (i+1), model:'タント', plate:'○○ 000' + (i+1),
      shakenDate:D(400), tenkenDate:D(300) }));
    state.companyCars = []; state.fleetEvents = []; state.customers = [];
    state.inspectMarks = {}; state.inspectMutes = {};
    return pitInspectRun();
  };
});

console.log('\n── ① 形（規則の記号＋6桁） ──');
{
  const r = await p.evaluate(() => {
    const res = window._only([
      { id:'a1', status:'work', amountOrder:null },
      { id:'a2', status:'work', amountOrder:null },
      { id:'a3', status:'work', amountOrder:null }
    ]);
    const m = window._m01(res);
    return {
      n: m.length,
      nos: m.map(f => f.no),
      heads: res.findings.map(f => (f.no || '').split('-')[0]),
      rules: res.findings.map(f => f.ruleId),
      blank: res.findings.filter(f => !f.no).length
    };
  });
  ok('🔴 所見が全部そろっている（3件）', r.n === 3, r);
  ok('🔴 番号が空の所見が1件も無い', r.blank === 0, r);
  ok('🔴 形が「記号-6桁」（例 F05-483102）', r.nos.every(x => /^[A-Z]+\d+-\d{6}$/.test(x)), r.nos);
  ok('🔴 頭は、その所見の規則の記号そのもの',
     r.heads.every((h, i) => h === r.rules[i]), r);
  ok('🔴 同じ規則の3件が、それぞれ別の番号', new Set(r.nos).size === 3, r.nos);
}

console.log('\n── ②🔴🔴 いつ・誰が見ても同じ番号 ──');
{
  const r = await p.evaluate(() => {
    const one = () => window._only([
      { id:'b1', status:'work', amountOrder:null },
      { id:'b2', status:'work', amountOrder:null }
    ]).findings.reduce((o, f) => { o[f.key] = f.no; return o; }, {});
    const a = one(), c = one();          /* もう一度チェックを押した */
    /* ほかの車が増えても、元の車の番号は動かないこと */
    const more = window._only([
      { id:'b0', status:'work', amountOrder:null },
      { id:'b1', status:'work', amountOrder:null },
      { id:'b2', status:'work', amountOrder:null },
      { id:'b9', status:'work', amountOrder:null }
    ]).findings.reduce((o, f) => { o[f.key] = f.no; return o; }, {});
    /* 直って消えて、あとでまた出た時 */
    window._only([{ id:'b1', status:'work', amountOrder:200000 }]);   /* 直した＝所見が消える */
    const back = window._only([{ id:'b1', status:'work', amountOrder:null }])
      .findings.reduce((o, f) => { o[f.key] = f.no; return o; }, {});
    return { a:a, c:c, more:more, back:back };
  });
  const keys = Object.keys(r.a);
  ok('🔴🔴 もう一度チェックしても同じ番号',
     keys.every(k => r.a[k] === r.c[k]), { a:r.a, c:r.c });
  ok('🔴🔴 ほかの車が増えても、その車の番号は動かない',
     keys.every(k => r.a[k] === r.more[k]), { a:r.a, more:r.more });
  ok('🔴🔴 直って消えたものが、また出た時も同じ番号に戻る',
     keys.filter(k => /:b1$/.test(k)).every(k => r.a[k] === r.back[k]), { a:r.a, back:r.back });
}
{
  /* 🔴 番号の元は key だけ＝**変わるものを混ぜていない**。
     ⚠ 日付をずらしても、カードの中身を変えても、key が同じなら番号は同じ。 */
  const r = await p.evaluate(() => {
    const direct = pitInspectNo('M01:zz9');
    const a = window._only([{ id:'zz9', status:'work', amountOrder:null, customer:'あ', estAmount:1 }])
      .findings.filter(f => f.ruleId === 'M01').map(f => f.no)[0];
    const b = window._only([{ id:'zz9', status:'work', amountOrder:null, customer:'べつの名前', estAmount:999999,
                              reserveDate: window._D(-40), returnDate: window._D(-38) }])
      .findings.filter(f => f.ruleId === 'M01').map(f => f.no)[0];
    return { direct:direct, a:a, b:b };
  });
  ok('🔴 中身（名前・金額・日付）を変えても番号は同じ', r.a === r.b, r);
  ok('🔴 番号の物差しを直に呼んでも同じ答え（写しが無い）', r.direct === r.a, r);
}

console.log('\n── ③🔴 ぶつからない／エラー番号と紛れない ──');
{
  const r = await p.evaluate(() => {
    /* 同じ規則の中に800件あっても、同じ番号が2つ出ないこと */
    const nos = [];
    for (let i = 0; i < 800; i++) nos.push(pitInspectNo('M01:card_' + i));
    const dup = nos.length - new Set(nos).size;
    /* 別の規則どうしは、6桁が同じでも記号が違うので紛れない */
    const cross = pitInspectNo('M01:zzz') === pitInspectNo('F05:zzz');
    return { dup:dup, cross:cross, sample:nos.slice(0, 3) };
  });
  ok('🔴 同じ規則で800件でも、同じ番号が2つ出ない', r.dup === 0, r);
  ok('🔴 規則が違えば、同じ対象でも別の番号', r.cross === false, r);
}
{
  /* 🔴 エラー番号（PF-0412／CF-1002 など）の形になっていないこと。
     ＝ 現場で「番号」と言われた時に、どちらの話か迷わせない。 */
  const r = await p.evaluate(() => {
    const nos = [];
    for (let i = 0; i < 200; i++) nos.push(pitInspectNo('M01:e' + i));
    return { bad: nos.filter(x => /^[A-Z]{2}-\d{4}$/.test(x)) };
  });
  ok('🔴 エラー番号の形（2文字-4桁）になっていない', r.bad.length === 0, r.bad);
}

console.log('\n── ④ 画面に出る（押すとコピー） ──');
{
  const r = await p.evaluate(() => {
    const res = window._only([
      { id:'c1', status:'work', amountOrder:null },
      { id:'c2', status:'work', amountOrder:null }
    ]);
    window._insp.level = ''; window._insp.cat = '';
    renderInspect();
    const body = document.getElementById('inspect-body');
    const els = Array.from(body.querySelectorAll('.ins-row .ins-no'));
    return {
      rows: body.querySelectorAll('.ins-rows .ins-row').length,
      n: els.length,
      txt: els.map(e => e.textContent.trim()),
      m01: window._m01(res).map(f => f.no),
      want: res.findings.map(f => f.no),
      copy: els.every(e => /pitInspectCopyNo/.test(e.getAttribute('onclick') || '')),
      title: els.every(e => /コピー/.test(e.getAttribute('title') || '')),
      gid: Array.from(body.querySelectorAll('.ins-g-id')).map(e => e.textContent.trim())
    };
  });
  ok('🔴 行の数だけ番号が出ている（1行に1つ・欠けが無い）', r.n === r.rows && r.n >= 2, r);
  ok('🔴 出ている番号が、所見の番号と一致している',
     r.txt.length === r.want.length && r.txt.every(x => r.want.indexOf(x) >= 0), r);
  ok('🔴 直す2件の番号が、そのまま画面に出ている',
     r.m01.length === 2 && r.m01.every(x => r.txt.indexOf(x) >= 0), r);
  ok('🔴 押すとコピーできる口がある', r.copy === true, r);
  ok('押すとコピーできる、と書いてある', r.title === true, r);
  ok('🔴 規則の見出しに規則の記号が出ている（番号の頭と同じ字）',
     r.gid.length > 0 && r.txt.every(x => r.gid.indexOf(x.split('-')[0]) >= 0), r);
}
{
  /* コピーの仕掛けは**エラー番号の部品を借りる**（書き写していない） */
  const r = await p.evaluate(() => {
    let got = '';
    const real = window.CFErr && window.CFErr.copy;
    if (window.CFErr) window.CFErr.copy = (v) => { got = v; };
    pitInspectCopyNo('M01-123456');
    if (window.CFErr) window.CFErr.copy = real;
    return { got:got, has: !!(window.CFErr && real) };
  });
  ok('🔴 コピーはエラー番号の部品を借りている（写しを作っていない）',
     r.has === true && r.got === 'M01-123456', r);
}

console.log('\n── ⑤ 「ここを直す」の小窓と、書き出し ──');
{
  const r = await p.evaluate(() => {
    window.PIT_CLOUD = true;
    window.pitCanEditFinal = function(){ return true; };
    const res = window._only([{ id:'d1', status:'work', amountOrder:null }]);
    renderInspect();
    const f = res.findings.filter(x => x.ruleId === 'M01')[0];
    pitFixOpen(f.key);
    const win = document.getElementById('ins-fix');
    const el = win && win.querySelector('.ins-no');
    const out = { no: f.no, win: el ? el.textContent.trim() : '',
                  copy: el ? /pitInspectCopyNo/.test(el.getAttribute('onclick') || '') : false };
    pitFixClose();
    const ex = pitInspectExport(res);
    out.ex = (ex.所見[0] || {}).番号 || '';
    out.first = Object.keys(ex.所見[0] || {})[0];
    return out;
  });
  ok('🔴 「ここを直す」の小窓にも同じ番号が出る', r.win === r.no && !!r.no, r);
  ok('小窓の番号も押すとコピーできる', r.copy === true, r);
  ok('🔴 書き出しにも同じ番号が入っている', r.ex === r.no, r);
  ok('書き出しは番号がいちばん頭にある（②③で読みやすいように）', r.first === '番号', r);
}

console.log('\n── ⑥🧭 ソースの見張り（番号を作る所は1本だけ） ──');
{
  const ir = fs.readFileSync('js/inspect-rules.js', 'utf8');
  const iv = fs.readFileSync('js/inspect.js', 'utf8');
  const ix = fs.readFileSync('js/inspect-fix.js', 'utf8');
  const ic = fs.readFileSync('css/inspect.css', 'utf8');
  const hp = fs.readFileSync('js/help-content.js', 'utf8');
  const live = (t) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  /* 🔴 作る所は規則の側の1本。画面と小窓は**持っているものを出すだけ** */
  ok('🔴 番号を作る手順が規則の側に1本ある', /function inspectNo/.test(ir) && /w\.pitInspectNo\s*=/.test(ir), '');
  ok('🔴🔴 画面が番号を作り直していない', !/function inspectNo|0x811c9dc5/.test(live(iv)), '');
  ok('🔴🔴 「ここを直す」も番号を作り直していない', !/function inspectNo|0x811c9dc5/.test(live(ix)), '');
  /* 🔴 元にするのは key だけ＝変わるものを混ぜていない */
  {
    const fn = (ir.match(/function inspectNo\([\s\S]*?\n  \}/) || [''])[0];
    ok('🔴🔴 番号の元に「今日」「件数」「並び順」を混ぜていない',
       fn.length > 50 && !/\btoday\b|new Date|state\.|findings|\.sort\(|Math\.random/i.test(fn),
       fn.slice(0, 160));
  }
  ok('🔴 所見が番号を持って出ていく（no を積んでいる）', /no:\s*inspectNo\(key\)/.test(ir), '');
  ok('🔴 書き出しにも番号を載せている', /番号:\s*f\.no/.test(ir), '');
  ok('画面に番号の見た目がある（.ins-no）', /^\.ins-no\{/m.test(ic), '');
  ok('等幅の字にしている（0とO・1とlを取り違えないため）', /\.ins-no\{[^}]*monospace/.test(ic.replace(/\n/g, '')), '');
  ok('🔴 ヘルプにも番号のことが書いてある', /1件ごとに番号が付いています/.test(hp), '');
  ok('🔴 ヘルプが「いつ・誰が見ても同じ」と言っている', /いつ・誰が見ても同じです/.test(hp), '');
}

console.log('\n── ⑦ まわりを壊していない ──');
{
  const r = await p.evaluate(() => {
    const res = window._only([{ id:'e1', status:'work', amountOrder:null }]);
    renderInspect();
    const body = document.getElementById('inspect-body');
    return { n: window._m01(res).length, open: res.openN >= 1,
             rules: (window.PIT_INSPECT_RULES || []).length,
             hasRow: !!body.querySelector('.ins-row'),
             hasFix: !!body.querySelector('.ins-fixb') };
  });
  ok('所見の数は変わっていない（受注金額の抜けが1件）', r.n === 1 && r.open === true, r);
  ok('規則の数は 48本のまま', r.rules === 48, r.rules);
  ok('行も「ここを直す」も今までどおり出る', r.hasRow && r.hasFix, r);
}
ok('🔴 画面がつまずいていない（赤いエラーが1つも出ていない）', errs.length === 0, errs.slice(0, 3));

/* 版がそろっていること（🔴 数字は直書きしない＝3か所が一致しているかだけを見る） */
{
  const html = fs.readFileSync('index.html', 'utf8');
  const meta = (html.match(/name="app-version" content="([\d.]+)"/) || [])[1] || '';
  const login = (html.match(/class="login-ver">v([\d.]+)</) || [])[1] || '';
  const ver = (html.match(/class="ver">v([\d.]+)</) || [])[1] || '';
  ok('🔴 版が3か所そろっている', !!meta && meta === login && meta === ver, { meta, login, ver });
}

await b.close();
console.log('\n合計：' + pass + ' OK / ' + fail + ' NG');
process.exit(fail ? 1 : 0);
