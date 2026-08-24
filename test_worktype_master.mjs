/* PitFlow v2.5.0 ── 作業タイプは「コードが唯一の正」／設定からは触れない
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-24）
     「新規は作りたい、ただ細かい挙動とかを入れたいから、設定から入れるってのはもう無くしてほしい」
   ◎この試験がやること
     🔴 ① コードを機械で読む＝設定から増減する口（pitWtAdd / pitWtEdit / pitWtDel /
           pitWtToggleCombo）が**1つも残っていない**こと。復活させないための見張り。
     🔴 ② 設定画面に「＋ タイプを追加」も、名前入力も、色の四角も、ゴミ箱も出ないこと。
     🔴 ③ クラウド（settings.workTypes）に古い作業タイプが残っていても、
           **コードの名前・色・並びで揃え直す**こと。
     🔴 ④ ただし**コードに無い型は消さない**（legacy:true を付けて末尾に残す）
           ＝その型で入っている過去カードのバッジが消えないように。
     🔴 ⑤ 揃えた結果を settings.workTypes に書き戻すこと（**MHS がここを読んでいる**）。
     🔴 ⑥ 設定の引っ越しに作業タイプを入れない／読み込まないこと。
   ◎使い方
     python3 -m http.server 8991      ← 別ウィンドウ
     node test_worktype_master.mjs                                      */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ===================================================================
   ① コードを機械で読む（画面を触る試験だけでは、取り残しに気づけない）
   =================================================================== */
console.log('\n── 🔍 コードを機械で読む ──');
{
  const dir = path.join(process.cwd(), 'js');
  const gone = ['Add', 'Edit', 'Del', 'ToggleCombo'];
  const hits = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      const t = ln.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;   /* 注記は数えない */
      /* 「= で作る」「( で呼ぶ」だけを数える（注記の中で名前を書くのは見張りの説明なので数えない） */
      gone.forEach(g => { if (new RegExp('pitWt' + g + '\\s*[=(]').test(ln)) hits.push({ file: f, line: i + 1, name: 'pitWt' + g }); });
    });
  }
  ok('🔴 設定から作業タイプを増減する口が1つも残っていない', hits.length === 0, hits.slice(0, 8));

  const st = fs.readFileSync(path.join(dir, 'state.js'), 'utf8');
  ok('state.js にマスター（PIT_WORK_TYPES）がある', /window\.PIT_WORK_TYPES\s*=/.test(st));

  const db = fs.readFileSync(path.join(dir, 'db-pit.js'), 'utf8');
  ok('db-pit.js に揃え直し（_applyWorkTypes）がある', /_applyWorkTypes:\s*function/.test(db));
  ok('db-pit.js から「保存で上書き」の旧道が消えている',
     db.indexOf('state.workTypes = state.settings.workTypes') < 0);

  const tr = fs.readFileSync(path.join(dir, 'settings-transfer.js'), 'utf8');
  ok('引っ越しの書き出しに作業タイプを入れていない', tr.indexOf('out.workTypes') < 0);
  ok('引っ越しの読み込みで作業タイプを入れ替えていない', tr.indexOf('state.workTypes = d.workTypes') < 0);
}

/* ===================================================================
   ② 実際に動かす
   =================================================================== */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
p.on('dialog', async d => { errs.push('純正ダイアログ:' + d.message()); await d.dismiss().catch(() => {}); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.PitDB && window.showView', null, { timeout: 25000 });
await p.waitForTimeout(700);

console.log('\n── 🧰 マスターの中身 ──');
{
  const m = await p.evaluate(() => (window.PIT_WORK_TYPES || []).map(w => w.id));
  ok('マスターが7種そろっている', m.length === 7, m);
  ok('中身が 車検/12点/一般/オイル/B.P/1Y/3M',
     JSON.stringify(m) === JSON.stringify(['shaken', '12pt', 'general', 'oil', 'bp', 'coat1y', 'coat3m']), m);
  const same = await p.evaluate(() =>
    JSON.stringify((state.workTypes || []).map(w => w.id)) ===
    JSON.stringify(((state.settings || {}).workTypes || []).map(w => w.id)));
  ok('🔴 settings.workTypes にも同じものが入っている（MHS が読む）', same);
}

console.log('\n── ⚙ 設定画面（見るだけになっているか） ──');
{
  await p.evaluate(() => showView('settings'));
  await p.waitForTimeout(500);
  const html = await p.content();
  ok('「＋ タイプを追加」のボタンが無い', html.indexOf('タイプを追加') < 0);
  ok('「見るだけ」と出ている', (await p.locator('.ps-ro-tag:visible').count()) >= 1);
  /* ⚠ .ps-wt-row は外注先の行も使っている。作業タイプの行は .ps-wt-ro（見るだけ）で見る */
  ok('名前を打ち替える入力が無い', (await p.locator('.ps-wt-ro input[type=text]').count()) === 0);
  ok('色の四角（input color）が無い', (await p.locator('.ps-wt-ro input[type=color]').count()) === 0);
  ok('ゴミ箱（削除）が無い', (await p.locator('.ps-wt-ro .rl-del').count()) === 0);
  ok('そもそも作業タイプの行に入力欄が1つも無い', (await p.locator('.ps-wt-ro input').count()) === 0);
  ok('一覧は7行出ている', (await p.locator('.ps-wt-ro').count()) === 7,
     await p.locator('.ps-wt-ro').count());
  const names = await p.locator('.ps-wt-name').allInnerTexts();
  ok('名前が読める（車検が居る）', names.indexOf('車検') >= 0, names);
  const tags = await p.locator('.ps-wt-tag').allInnerTexts();
  ok('併用可の札が3つ（B.P / 1Y / 3M）', tags.filter(t => t === '併用可').length === 3, tags);
}

console.log('\n── 🔧 揃え直し（クラウドに古いものが残っていた時） ──');
{
  const r = await p.evaluate(() => {
    /* クラウドに「名前を変えられた車検」「設定から足された型」「消えた型」が
       残っている状態を作って、揃え直しがどう効くかを見る */
    state.settings.workTypes = [
      { id: 'shaken', label: 'しゃけん（勝手に改名）', color: '#000000' },
      { id: 'w1750000000000', label: '新タイプ', color: '#64748b' }
    ];
    PitDB._wtDirty = false;
    PitDB._applyWorkTypes();
    return {
      ids: state.workTypes.map(w => w.id),
      shaken: state.workTypes.find(w => w.id === 'shaken'),
      old: state.workTypes.find(w => w.id === 'w1750000000000'),
      dirty: PitDB._wtDirty,
      linked: state.settings.workTypes === state.workTypes
    };
  });
  ok('🔴 勝手に変えられた名前がコードの名前に戻る', r.shaken && r.shaken.label === '車検', r.shaken);
  ok('🔴 色もコードに戻る', r.shaken && r.shaken.color === '#ef4444', r.shaken);
  ok('コードの7種が先頭に並ぶ',
     JSON.stringify(r.ids.slice(0, 7)) === JSON.stringify(['shaken', '12pt', 'general', 'oil', 'bp', 'coat1y', 'coat3m']), r.ids);
  ok('🔴 コードに無い型は消さずに末尾に残る', !!r.old && r.ids[7] === 'w1750000000000', r.ids);
  ok('残した型には「旧」の印が付く', !!r.old && r.old.legacy === true, r.old);
  ok('揃え直したので「保存が要る」印が立つ', r.dirty === true);
  ok('🔴 settings.workTypes に書き戻されている（MHS が読む）', r.linked === true);

  /* もう一度呼んでも、こんどは何も変わらない（＝保存が延々と走らない） */
  const again = await p.evaluate(() => { PitDB._wtDirty = false; PitDB._applyWorkTypes(); return PitDB._wtDirty; });
  ok('🔴 2回目は「保存が要る」にならない（書き続けるループにしない）', again === false);
}

console.log('\n── 🧭 まわり ──');
{
  /* 揃え直しで足した「旧」の型を消して、ふつうの状態に戻してから画面を回す */
  await p.evaluate(() => { PitDB._applyWorkTypes(); state.cards = []; });
  await p.evaluate(() => showView('settings'));
  await p.waitForTimeout(200);
  ok('旧の型があると「旧」の札が出る', (await p.locator('.ps-wt-old').count()) === 1,
     await p.locator('.ps-wt-old').count());
  for (const v of ['course1', 'today', 'return', 'reserve', 'settings', 'rules']) {
    await p.evaluate(v => { try { showView(v); } catch (e) {} }, v);
    await p.waitForTimeout(160);
  }
  ok('各ビューを開いてエラーなし', errs.length === 0, errs.slice(0, 5));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v2.5.0 以降', vn[0] > 2 || (vn[0] === 2 && vn[1] >= 5), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
if (errs.length) console.log('  ページのエラー: ' + JSON.stringify(errs.slice(0, 8)));
await b.close();
process.exit(fail === 0 ? 0 : 1);
