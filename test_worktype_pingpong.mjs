/* PitFlow v2.8.1 ── 版のちがう端末どうしで、作業タイプを書き戻し合わない
   -------------------------------------------------------------------
   ◎ゆうた報告（2026-08-25・本番が止まった）
     🗣「同期中と同期済が超絶点滅を繰り返してて、まともに操作できない。全デバイスで発生してる」
   ◎なにが起きていたか（本番のコンソールで確かめた）
     [PitDB] 作業タイプをコード基準に揃え直しました（保存します）
     [PitDB] 保存しました（1件）      ← 8秒で95往復
     `pitSettings/main` が "label":"車販"（v2.7.0以前）と "label":"車販依頼"（v2.7.1以降）の
     **間を永久に往復**していた。v2.5.0 の「コードが正・クラウドへ書き戻す」は、
     **版のちがう端末が2台開くと、どちらも折れずに喧嘩する。**
   ◎この試験がやること
     🔴 ① 版の印（workTypesVer）が残ること
     🔴 ② **自分より新しい版の印**が付いていたら、書き戻さないこと（古い端末が黙る）
     🔴 ③ 印を知らない古い端末が相手でも、**4回目で折れて必ず止まる**こと
     🔴 ④ 折れたあとは `state.settings.workTypes` を**1バイトも触らない**こと
           （触ると差分保存が勝手に書きにいって止まらない）
     🔴 ⑤ 折れても**画面の作業タイプはコードのまま**（表示は自分の版で正しい）
     🔴 ⑥ 受け取るたびに書き戻す増幅器が、コードから消えていること
     🔴 ⑦ ふつうの時（版がそろっている）は今までどおり1回だけ揃えて終わること
   ◎使い方
     node /tmp/srv.js（別ウィンドウ・8991番）
     node test_worktype_pingpong.mjs                                    */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ================= ① コードを機械で読む ================= */
console.log('\n── 🔍 増幅器が外れているか ──');
{
  const src = fs.readFileSync(path.join(process.cwd(), 'js', 'db-pit.js'), 'utf8');
  /* 設定の購読ハンドラの中に _flushWorkTypes() が残っていないこと */
  const i = src.indexOf("collection('pitSettings').doc('main').onSnapshot");
  const watchBlock = i < 0 ? '' : src.slice(i, i + 2200);
  ok('🔴 受信のたびに書き戻していない', i > 0 && !/^\s*self\._flushWorkTypes\(\);/m.test(watchBlock), watchBlock.slice(0, 0));
  ok('空回り止めがある（_wtGaveUp）', /_wtGaveUp/.test(src));
  ok('往復を数えている（_wtSpins）', /_wtSpins/.test(src));
  ok('版の印がある（workTypesVer）', /workTypesVer/.test(src));
  ok('版くらべが文字比較になっていない', /_verCmp/.test(src) && /split\('\.'\)\.map\(Number\)/.test(src));
}

/* ================= ② 実際に動かす ================= */
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.PitDB && window.PitDB._applyWorkTypes', null, { timeout: 25000 });
await p.waitForTimeout(600);

/* 相手の端末を模す＝クラウドに「別の版が書いた作業タイプ」を置いた状態を作る。
   ⚠ 本物のクラウドには繋がない。`state.settings` を直に置いて `_applyWorkTypes` を呼ぶだけ。 */
const sim = (opt) => p.evaluate((o) => {
  const D = window.PitDB;
  const keepS = JSON.parse(JSON.stringify(window.state.settings || {}));
  const keepW = window.state.workTypes;
  const keep = { dirty: D._wtDirty, spins: D._wtSpins, gave: D._wtGaveUp, saves: [] };
  const realSave = D.save; D.save = function () { keep.saves.push(1); };
  D._wtDirty = false; D._wtSpins = 0; D._wtGaveUp = false;
  try {
    /* 相手が書いた作業タイプ（名前だけ違う）を置く */
    const theirs = (window.PIT_WORK_TYPES || []).map(w => Object.assign({}, w));
    if (theirs.length) theirs[theirs.length - 1].label = o.相手のラベル;
    window.state.settings.workTypes = theirs;
    if (o.印) window.state.settings.workTypesVer = o.印; else delete window.state.settings.workTypesVer;

    const 記録 = [];
    for (let n = 0; n < o.往復; n++) {
      /* 相手が書き戻す → 自分が受け取る → 揃え直す → 書き戻すか？ */
      const before = JSON.stringify(window.state.settings.workTypes);
      D._applyWorkTypes();
      D._flushWorkTypes();
      const after = JSON.stringify(window.state.settings.workTypes);
      記録.push({ 書いた: before !== after, 直後: (JSON.parse(after).slice(-1)[0] || {}).label });
      /* 相手はこちらの書き戻しを見て、また自分のを書く（版の印は消さずに残す＝古い端末の動き）。
         ⚠ なので**最後に読むラベルは相手のもの**になる。こちらが何を書いたかは `直後` で見ること。 */
      if (before !== after) window.state.settings.workTypes = theirs;
    }
    return {
      書いた回数: 記録.filter(r => r.書いた).length,
      書いた直後のラベル: (記録.filter(r => r.書いた).slice(-1)[0] || {}).直後 || '',
      保存を呼んだ回数: keep.saves.length,
      折れた: D._wtGaveUp,
      設定のラベル: (window.state.settings.workTypes.slice(-1)[0] || {}).label,
      画面のラベル: (window.state.workTypes.slice(-1)[0] || {}).label,
      印: window.state.settings.workTypesVer || ''
    };
  } finally {
    D.save = realSave;
    window.state.settings = keepS; window.state.workTypes = keepW;
    D._wtDirty = keep.dirty; D._wtSpins = keep.spins; D._wtGaveUp = keep.gave;
  }
}, opt);

const CODE = await p.evaluate(() => (window.PIT_WORK_TYPES.slice(-1)[0] || {}).label);
const VER  = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
console.log('  （コードの最後の作業タイプ＝「' + CODE + '」／この版＝' + VER + '）');

console.log('\n── 🚨 ③古い端末が相手（印を知らない）＝必ず止まる ──');
{
  const r = await sim({ 相手のラベル: '車販', 印: '', 往復: 30 });
  ok('🔴 30回ぶつけても、書き戻しは4回で止まる', r.書いた回数 <= 4, r);
  ok('🔴 折れたことを覚えている（_wtGaveUp）', r.折れた === true, r);
  ok('🔴 折れたあとは設定に触らない（相手の中身のまま）', r.設定のラベル === '車販', r);
  ok('🔴 でも画面はコードのまま（' + CODE + '）', r.画面のラベル === CODE, r);
}

console.log('\n── 🪪 ②自分より新しい版の印が付いている＝黙る ──');
{
  const r = await sim({ 相手のラベル: '車販', 印: '99.0.0', 往復: 10 });
  ok('🔴 1回も書き戻さない', r.書いた回数 === 0, r);
  ok('🔴 保存も呼ばない', r.保存を呼んだ回数 === 0, r);
  ok('　設定は相手のまま（新しい端末の言うことを聞く）', r.設定のラベル === '車販', r);
  ok('　画面はコードのまま', r.画面のラベル === CODE, r);
  ok('　空回り止めまで行かない（折れていない）', r.折れた === false, r);
}

console.log('\n── 🪪 自分より古い版の印なら、こちらが正す ──');
{
  const r = await sim({ 相手のラベル: '車販', 印: '1.0.0', 往復: 1 });
  ok('🔴 1回で正す', r.書いた回数 === 1, r);
  ok('　書いた中身がコードのものになっている', r.書いた直後のラベル === CODE, r);
  ok('🔴 印が自分の版に変わる', r.印 === VER, r);
}

console.log('\n── ✅ ⑦ふつうの時（版がそろっている） ──');
{
  const r = await sim({ 相手のラベル: CODE, 印: VER, 往復: 10 });
  ok('🔴 1回も書かない（無駄打ちしない）', r.書いた回数 === 0, r);
  ok('　保存も呼ばない', r.保存を呼んだ回数 === 0, r);
  ok('　折れてもいない', r.折れた === false, r);
}

console.log('\n── 🆕 印がまだ無いクラウド（初めて） ──');
{
  const r = await sim({ 相手のラベル: CODE, 印: '', 往復: 3 });
  ok('🔴 印を1回だけ立てる', r.書いた回数 <= 1 && r.印 === VER, r);
  ok('　折れない', r.折れた === false, r);
}

console.log('\n── 🧭 まわり ──');
{
  const lab = await p.evaluate(() => {
    try { showView('settings'); } catch (e) {}
    return (window.state.workTypes || []).map(w => w.label).join('／');
  });
  await p.waitForTimeout(400);
  ok('作業タイプが画面に出ている', /車販依頼/.test(lab), lab);
  ok('エラーなし', errs.length === 0, errs.slice(0, 4));
  const vn = String(VER || '').split('.').map(Number);
  ok('版が v2.8.1 以降', vn[0] > 2 || (vn[0] === 2 && (vn[1] > 8 || (vn[1] === 8 && vn[2] >= 1))), VER);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail === 0 ? 0 : 1);
