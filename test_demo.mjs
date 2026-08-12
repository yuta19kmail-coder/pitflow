/* PitFlow v1.77.0 ── デモ版（練習用サイト）の見張り
   -------------------------------------------------------------------
   ◎ここで守りたいこと（いちばん大事な順）
     🔴 ① **本番（PIT_DEMO なし）では1ミリも変わらない。**
          デモ版の都合が本番の画面に漏れたら、それがいちばん重い事故。
     🔴 ② デモ版だと**ひと目で分かる**（版の横の印・タブのタイトル）。
          「本番のつもりで練習用を触っていた」も、その逆も防ぐ。
     🔴 ③ デモ版でも**まっさらにして練習し直せる**（設定の「まっさらにする」）。
     ⚠  ④ 案内の窓は**お知らせのポップアップに重ねない**（下の窓が押せなくなる）。

   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8975      ← 別ウィンドウ
     node test_demo.mjs                                                */
import { chromium } from 'playwright';
import fs from 'fs';

const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const BASE = 'http://127.0.0.1:8975/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });

/* デモ版／ふつうのサンプル、どちらでも同じ手順で開く小道具 */
async function open(q, opt) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(BASE + q);
  await p.waitForTimeout(900);
  if (!(opt && opt.stayOnLogin)) {
    await p.evaluate(() => { const g = document.getElementById('pl-google'); if (g) g.click(); });
    await p.waitForFunction(() => document.body.classList.contains('pit-authed'), null, { timeout: 15000 });
    await p.waitForTimeout(2200);   /* 案内の窓が出るまで待つ */
  }
  return { p, errs };
}

/* ================================================================
   ① 🔴 本番のつもり（PIT_DEMO なし）＝何も起きない
   ⚠ ここが落ちたら、デモ版の都合が本番に漏れている。最優先で直すこと。
   ================================================================ */
console.log('\n── ① 🔴 PIT_DEMO が無ければ何も起きない（本番が汚れない） ──');
{
  const { p, errs } = await open('?demo=1&nonews=1');
  ok('🔴 版の横に「デモ版」の印が出ない',
     await p.evaluate(() => document.querySelectorAll('.pit-demo-tag').length) === 0);
  ok('🔴 タブのタイトルが変わっていない',
     !(await p.title()).includes('デモ版'), await p.title());
  ok('🔴 案内の窓が出ない',
     await p.evaluate(() => { const e = document.getElementById('uid-ov'); return !(e && e.classList.contains('open')); }));
  ok('🔴 pitIsDemo() が false',
     await p.evaluate(() => !!window.pitIsDemo && window.pitIsDemo() === false));
  ok('デモ用のCSSも入れていない',
     await p.evaluate(() => !document.getElementById('pit-demo-css')));
  ok('🔴 大きな札も出ない', await p.evaluate(() => !document.querySelector('.pit-demo-flag')));
  ok('🔴 body に印も付かない', await p.evaluate(() => !document.body.classList.contains('pit-demo-mode')));
  /* 🔴 サンプルの中身も今までどおり（試験55本がここを踏んでいる） */
  ok('🔴 サンプルの中身は今までどおり（架空の名前に変わっていない）',
     await p.evaluate(() => !state.cards.some(c => /デモ|テスト|サンプル|レンシュウ/.test((c.customer||'') + (c.car||'') + (c.maker||'')))));
  ok('JSエラー0', errs.length === 0, errs.slice(0, 3));
  await p.close();
}

/* ================================================================
   ② デモ版＝ひと目で分かる
   ================================================================ */
console.log('\n── ② デモ版だとひと目で分かる ──');
{
  /* まずログイン画面のまま見る＝入る前から分かることが大事 */
  const { p } = await open('?demo=1&demoui=1&nonews=1', { stayOnLogin: true });
  const lv = await p.evaluate(() => { const e = document.querySelector('.login-ver'); return e ? e.textContent.trim() : ''; });
  ok('ログイン画面の版の横に「デモ版」', /デモ版/.test(lv), lv);
  ok('🔴 版の数字は消していない（どの版のデモか分かる）', /v\d+\.\d+\.\d+/.test(lv), lv);
  ok('タブのタイトルにも「デモ版」', (await p.title()).includes('デモ版'), await p.title());
  await p.close();
}
{
  const { p, errs } = await open('?demo=1&demoui=1&nonews=1');
  const tv = await p.evaluate(() => { const e = document.querySelector('.ver'); return e ? e.textContent.trim() : ''; });
  ok('トップバーの版の横にも「デモ版」', /デモ版/.test(tv), tv);
  ok('🔴 印は1か所につき1つだけ（二重に付かない）',
     await p.evaluate(() => document.querySelectorAll('.ver .pit-demo-tag').length) === 1);
  ok('pitIsDemo() が true', await p.evaluate(() => window.pitIsDemo() === true));
  ok('保存はこの端末だけ（クラウドにつながっていない）',
     await p.evaluate(() => window.PIT_CLOUD === false));

  /* 🔴 v1.79.0（ゆうた指定）「ヘッダーに**大きく**デモ版と分かるように」
     ⚠ 見間違い（本番のつもりで練習用を触る／その逆）は現場の実害。**小さくしないこと。** */
  const flag = await p.evaluate(() => {
    const f = document.querySelector('#topbar .pit-demo-flag');
    if (!f) return null;
    const r = f.getBoundingClientRect(), cs = getComputedStyle(f);
    return { text: f.innerText.replace(/\s+/g, ' ').trim(), w: Math.round(r.width), h: Math.round(r.height),
             size: parseFloat(cs.fontSize), weight: cs.fontWeight, bg: cs.backgroundImage + cs.backgroundColor,
             inBar: !!f.closest('#topbar') };
  });
  ok('🔴 トップバーに大きな札が出る', !!flag, flag);
  ok('🔴 「デモ版」と書いてある', !!flag && /デモ版/.test(flag.text), flag);
  ok('🔴 本番ではないと言い添えてある', !!flag && /本番ではありません/.test(flag.text), flag);
  ok('🔴 版の横の小さい印より大きい（12px以上）', !!flag && flag.size >= 12, flag);
  ok('🔴 太字（700以上）', !!flag && parseInt(flag.weight, 10) >= 700, flag);
  ok('🔴 オレンジで塗ってある（枠だけにしない）', !!flag && /245, ?158, ?11|f59e0b|249, ?178, ?60/.test(flag.bg), flag);
  ok('🔴 トップバーの中にある', !!flag && flag.inBar, flag);
  ok('🔴 body にも印が付く（画面の上に帯）',
     await p.evaluate(() => document.body.classList.contains('pit-demo-mode')));

  /* 🔴 v1.79.0（ゆうた指定）カードを見て本番と混同しないこと */
  console.log('\n── ②-2 🔴 サンプルの中身が「明らかに架空」 ──');
  const real = await p.evaluate(() => {
    const NG = ['トヨタ','ホンダ','日産','マツダ','スズキ','ダイハツ','スバル','BMW','ベンツ','メルセデス','VW','MINI','アウディ','プジョー','ボルボ',
                'アクア','プリウス','N-BOX','ノート','セレナ','タント','フィット','ハスラー','ゴルフ',
                '佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤'];
    const hit = {};
    const scan = v => { if (!v) return; NG.forEach(w => { if (String(v).indexOf(w) >= 0) hit[w] = (hit[w] || 0) + 1; }); };
    state.cards.forEach(c => { scan(c.customer); scan(c.maker); scan(c.car); scan(c.plate); });
    (state.customers || []).forEach(c => { scan(c.name); (c.vehicles || []).forEach(v => { scan(v.maker); scan(v.car); scan(v.plate); }); });
    return hit;
  });
  ok('🔴 実在の名字・メーカー・車種が1つも出てこない', Object.keys(real).length === 0, real);
  const looks = await p.evaluate(() => ({
    cards: state.cards.length,
    custs: (state.customers || []).length,
    names: state.cards.slice(0, 20).map(c => c.customer).filter(Boolean),
    cars : state.cards.slice(0, 20).map(c => c.car).filter(Boolean),
    tels : state.cards.slice(0, 20).map(c => c.tel).filter(Boolean)
  }));
  ok('🔴 名前が「デモ◯◯」など架空と分かる',
     looks.names.length > 0 && looks.names.every(n => /デモ|テス|サンプル|レンシュウ/.test(n)), looks.names.slice(0, 5));
  ok('🔴 車名が「テスト◯」など架空と分かる',
     looks.cars.length > 0 && looks.cars.every(c => /テスト/.test(c)), looks.cars.slice(0, 5));
  ok('🔴 電話は 000-0000-XXXX（本当にかけてしまわない）',
     looks.tels.length > 0 && looks.tels.every(t => /^000-0000-\d{4}$/.test(t)), looks.tels.slice(0, 3));
  ok('件数は控えめ（カード400枚未満）', looks.cards < 400, looks.cards);
  ok('でも空っぽではない（練習になる程度はある）', looks.cards > 50 && looks.custs > 20, looks);

  /* ③ 最初の1回だけ案内 */
  console.log('\n── ③ 最初の1回だけ「練習用です」と伝える ──');
  const dlg = await p.evaluate(() => {
    const e = document.getElementById('uid-ov');
    return (e && e.classList.contains('open')) ? e.innerText : '';
  });
  ok('案内の窓が出る', /練習用のデモ版/.test(dlg), dlg.slice(0, 60));
  ok('🔴 本番に影響しないと言い切っている', /本番のデータには一切つながっていません/.test(dlg));
  ok('作り直せる場所を教えている', /開発用サンプル/.test(dlg));
  ok('ボタンは「はじめる」', /はじめる/.test(dlg));

  await p.close();
}

/* 🔴 順番＝初対面に「ここは練習用です」を先に読ませる。
   ⚠ お知らせのポップアップ（news-pit.js）はログイン 900ms 後に出る。
      重なると下の窓が押せない／案内が埋もれる。**押さえて、閉じたら出す。**
   ⚠ この節だけ `?nonews=1` を付けない＝本物のデモ版と同じ条件で見る。 */
console.log('\n── ③-2 🔴 案内が先、お知らせのポップアップは後 ──');
{
  const { p, errs } = await open('?demo=1&demoui=1');
  const s1 = await p.evaluate(() => {
    const u = document.getElementById('uid-ov'), n = document.getElementById('nw-pop');
    return { uid: !!(u && u.classList.contains('open')),
             uidTop: (u && u.classList.contains('open')) ? u.innerText.split('\n')[0] : '',
             nw: !!(n && n.classList.contains('open')) };
  });
  ok('ログイン直後は「練習用です」だけ', s1.uid && /練習用のデモ版/.test(s1.uidTop), s1);
  ok('🔴 お知らせのポップアップは重なっていない', s1.nw === false, s1);

  await p.evaluate(() => { const o = document.getElementById('uid-ok'); if (o) o.click(); });
  await p.waitForTimeout(1500);
  const s2 = await p.evaluate(() => {
    const u = document.getElementById('uid-ov'), n = document.getElementById('nw-pop');
    return { uid: !!(u && u.classList.contains('open')), nw: !!(n && n.classList.contains('open')) };
  });
  ok('「はじめる」で案内が閉じる', s2.uid === false, s2);
  ok('🔴 そのあとお知らせが出る（消してしまわない）', s2.nw === true, s2);
  ok('JSエラー0', errs.length === 0, errs.slice(0, 3));
  await p.close();
}

console.log('\n── ③-3 2回目からは案内を出さない ──');
{
  const { p, errs } = await open('?demo=1&demoui=1&nonews=1');
  /* 1回目を済ませる */
  await p.evaluate(() => { const o = document.getElementById('uid-ok'); if (o) o.click(); });
  await p.waitForTimeout(400);
  await p.reload();
  await p.waitForTimeout(900);
  await p.evaluate(() => { const g = document.getElementById('pl-google'); if (g) g.click(); });
  await p.waitForFunction(() => document.body.classList.contains('pit-authed'), null, { timeout: 15000 });
  await p.waitForTimeout(2200);
  ok('🔴 2回目からは出ない（毎回うるさくしない）',
     await p.evaluate(() => { const e = document.getElementById('uid-ov'); return !(e && e.classList.contains('open')); }));
  ok('でも印は出たまま',
     await p.evaluate(() => document.querySelectorAll('.pit-demo-tag').length) > 0);

  /* ④ まっさらにする（設定） */
  console.log('\n── ④ デモ版でも「まっさらにする」で練習し直せる ──');
  await p.evaluate(() => { if (window.showView) showView('settings'); });
  await p.waitForTimeout(900);
  const box = await p.evaluate(() => {
    const e = document.getElementById('pit-reset-box');
    return e ? e.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  ok('設定に入口が出る', !!box, box);
  ok('見出しがデモ版の言い方', /ぜんぶ消して、まっさらにする/.test(box || ''), box);
  ok('🔴 本番の言い方（本番データの初期化）は出さない', !/本番データの初期化/.test(box || ''), box);
  ok('サンプルの戻し方を書いてある', /開発用サンプル/.test(box || ''), box);

  await p.evaluate(() => pitOpenReset());
  await p.waitForTimeout(400);
  const ovl = await p.evaluate(() => {
    const e = document.getElementById('pit-reset-ovl');
    return e ? e.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  ok('確認の窓が開く', !!ovl, ovl);
  ok('🔴 デモ版だと言い添えてある', /本番のデータには影響しません/.test(ovl || ''), ovl);
  ok('🔴 関門は本番と同じ＝「初期化」と打たないと押せない',
     await p.evaluate(() => { const b = document.getElementById('pr-run'); return !!b && b.disabled === true; }));
  ok('件数を出している（何が消えるか分かる）', /予約カード/.test(ovl || '') && /合計/.test(ovl || ''), ovl);

  /* 本当に消えるところまで見る */
  const before = await p.evaluate(() => state.cards.length);
  await p.evaluate(() => {
    const i = document.getElementById('pr-type');
    i.value = '初期化';
    i.dispatchEvent(new Event('input'));
  });
  ok('打ち込めばボタンが押せるようになる',
     await p.evaluate(() => document.getElementById('pr-run').disabled === false));
  await p.evaluate(() => pitRunReset());
  await p.waitForTimeout(800);
  const after = await p.evaluate(() => state.cards.length);
  ok('カードがあった状態から始めている', before > 0, before);
  ok('🔴 まっさらになる', after === 0, { before, after });
  ok('🔴 サンプルを入れ直す道が残っている',
     await p.evaluate(() => typeof window.seedSampleReservations === 'function'));
  ok('JSエラー0', errs.length === 0, errs.slice(0, 3));
  await p.close();
}

/* ================================================================
   ⑤ 🔴 作りの見張り（次の人が写しを作らないように）
   ================================================================ */
console.log('\n── ⑤ 🔴 作りの見張り（デモ版の中身を散らかさない） ──');
{
  const demo = fs.readFileSync('js/demo-pit.js', 'utf8');
  ok('🔴 demo-pit.js は PIT_DEMO でなければ早々に帰る（本番は素通り）',
     /if\s*\(!isDemo\(\)\)\s*return;/.test(demo));
  ok('🔴 判定の物差しは pitIsDemo の1本（外に公開している）',
     /window\.pitIsDemo\s*=\s*isDemo/.test(demo) || /w\.pitIsDemo\s*=\s*isDemo/.test(demo));
  const reset = fs.readFileSync('js/reset-pit.js', 'utf8');
  /* 注記（コメント）の中の言葉は数えない＝中身のコードだけを見る */
  const resetCode = reset.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('🔴 reset-pit.js は自分で location.search を読まず pitIsDemo を借りている',
     /pitIsDemo/.test(resetCode) && !/location\.search/.test(resetCode));
  ok('🔴 消す処理は1本だけ（デモ用の別処理を作っていない）',
     (resetCode.match(/\[t\.key\]\.length = 0/g) || []).length === 1);
  ok('🔴 言い方の切り替えは L() の1か所だけ',
     (resetCode.match(/function L\(\)/g) || []).length === 1);
  /* デモ版だけのファイルが増えていないか＝増えるほど古くなる */
  const html = fs.readFileSync('index.html', 'utf8');
  ok('🔴 デモ版のために読むファイルは demo-pit.js の1本だけ',
     (html.match(/js\/demo-[a-z-]*\.js/g) || []).length === 1,
     html.match(/js\/demo-[a-z-]*\.js/g));
  /* 🔴 v1.79.0 読み込む場所が変わった。
     sample-*.js が**読み込みのその場で** pitIsDemo() を見て中身を切り替えるので、
     demo-pit.js は**サンプルより前**に居ないと間に合わない。
     ⚠ pitAlert（ask-pit.js）はもっと後ろだが、案内はログイン後なので問題ない。 */
  ok('🔴 demo-pit.js は firebase-init.js より後ろ（PIT_DEMO が決まってから）',
     html.indexOf('js/demo-pit.js') > html.indexOf('js/firebase-init.js'));
  ok('🔴 demo-pit.js は sample-data.js より前（サンプルが pitIsDemo を見るため）',
     html.indexOf('js/demo-pit.js') < html.indexOf('js/sample-data.js'));
  ok('🔴 demo-pit.js は sample-customers.js より前',
     html.indexOf('js/demo-pit.js') < html.indexOf('js/sample-customers.js'));
  ok('🔴 demo-pit.js は sample-fleet.js より前',
     html.indexOf('js/demo-pit.js') < html.indexOf('js/sample-fleet.js'));
  ok('demo-pit.js は reset-pit.js より前（pitIsDemo を先に用意する）',
     html.indexOf('js/demo-pit.js') < html.indexOf('js/reset-pit.js'));

  /* 🔴 サンプルの中身の切り替えは「表」だけ＝作る手順を2本にしない */
  const sc = fs.readFileSync('js/sample-customers.js', 'utf8');
  ok('🔴 sample-customers.js は pitIsDemo を借りている（自分で location を読まない）',
     /pitIsDemo/.test(sc) && !/location\.search/.test(sc));
  ok('🔴 人を作る手順は1本だけ（デモ用の別関数を作っていない）',
     (sc.match(/function genPerson/g) || []).length === 1);
  const sf = fs.readFileSync('js/sample-fleet.js', 'utf8');
  ok('🔴 カードを作る手順も1本だけ',
     (sf.match(/function baseCard/g) || []).length === 1);

  /* 🔴 お知らせのリンク＝アプリを閉じてしまわないこと */
  const np = fs.readFileSync('js/news-pit.js', 'utf8');
  const linkLine = (np.match(/<a class="nw-btn[^>]*>/) || [''])[0];
  ok('お知らせにデモ版のURLが入っている', /pitflow-demo/.test(np), linkLine);
  ok('🔴 別のタブで開く（target="_blank"）', /target="_blank"/.test(linkLine), linkLine);
  ok('🔴 rel="noopener" が付いている', /rel="noopener"/.test(linkLine), linkLine);
}

await b.close();
console.log(`\n===== ${pass} OK / ${fail} NG =====`);
process.exit(fail ? 1 : 0);
