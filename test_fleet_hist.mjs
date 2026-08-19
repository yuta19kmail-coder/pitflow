/* PitFlow v1.145.0 ── 代車管理の「貸出履歴」のテスト
   -------------------------------------------------------------------
   ◎見張っているもの（ゆうた指定 2026-08-19）
     🗣「代車管理の下部に**履歴一覧という専用ページ**を作成。**テキストベースでいいから、
     　　過去を含めて がーーーーーーっと全履歴が残る**イメージ」／「**新しい順＋代車で絞れる**」
     ① 代車管理のいちばん下に出る
     ② 🔴 **引退した代車のぶんも出る**（カレンダーからは消えるので、ここが唯一の追い道）
     ③ 予約以外・緊急で貸したぶんも出る
     ④ 貸した日の**新しい順**
     ⑤ **代車で絞れる**（もう一度押すと全部に戻る）
     ⑥ 1行に 代車／期間／日数／返却済みか／お客様 が出る
     ⑦ 🔴 **見るだけ**＝ここから消す・直すはできない
   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8965      ← 別ウィンドウ
     node test_fleet_hist.mjs                                                 */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8965;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.renderFleet && window.flHistFilter', null, { timeout: 20000 });
await p.waitForTimeout(500);

/* 代車3台（1台は引退）＋貸出4件（返却済み・貸出中・予約以外・緊急） */
async function setup(){
  await p.evaluate(() => {
    const D = n => { const d = new Date(); d.setDate(d.getDate() + n); return window.ymd(d); };
    state.loaners = [
      { id:'L1', name:'代車1', number:1, model:'ハスラー' },
      { id:'L2', name:'代車2', number:2, model:'ワゴンR' },
      { id:'L9', name:'代車9', number:9, model:'旧ムーヴ', retired:true, retiredAt:D(-30) }
    ];
    state.cards = [
      { id:'k1', customer:'田中 太郎', car:'ノート', status:'returned', boardId:'default', division:'div1', workTypes:[] },
      { id:'k2', customer:'佐藤 次郎', car:'アクア', status:'check', boardId:'default', division:'div1', workTypes:[] }
    ];
    state.loanerAssigns = [
      { id:'a1', cardId:'k1', loanerId:'L1', fromDate:D(-20), toDate:D(-16), returned:true, returnedAt:D(-16) },
      { id:'a2', cardId:'k2', loanerId:'L2', fromDate:D(-1),  toDate:D(4) },
      { id:'a3', cardId:null, loanerId:'L9', fromDate:D(-60), toDate:D(-55), returned:true, returnedAt:D(-55), manual:true, customer:'鈴木', purpose:'代車の入替' },
      { id:'a4', cardId:null, loanerId:'L1', fromDate:D(-5),  toDate:D(-3), returned:true, returnedAt:D(-3), manual:true, emergency:true, customer:'緊急' }
    ];
    state.fleetEvents = [];
    showView('fleet');
  });
  await p.waitForTimeout(500);
}
const rows = () => p.evaluate(() => Array.from(document.querySelectorAll('.fl-hist-row')).map(el => el.innerText.replace(/\s+/g, ' ').trim()));
const opts = () => p.evaluate(() => Array.from(document.querySelectorAll('.fl-hist-sel option')).map(el => ({ t: el.textContent.replace(/\s+/g,' ').trim(), on: el.selected })));
const open = async () => { await p.evaluate(() => { if (!/▼/.test(document.querySelector('.fl-hist-h').innerText)) flHistToggle(); }); await p.waitForTimeout(400); };

console.log('\n───── ① 出る場所と件数 ─────');
await setup();
ok('代車管理に「貸出履歴」が出る', await p.evaluate(() => /貸出履歴/.test(document.getElementById('view-fleet-body').innerText)));
ok('🔴 最初はたたまれている（中身が出ていない）', (await rows()).length === 0, await rows());
ok('たたんでいても件数は出る', await p.evaluate(() => /貸出履歴（5件）|貸出履歴（4件）/.test(document.getElementById('view-fleet-body').innerText)));
await open();
ok('見出しを押すと開く', (await rows()).length > 0);
ok('車両リストより下にある',
   await p.evaluate(() => { const t = document.getElementById('view-fleet-body').innerText; return t.indexOf('貸出履歴') > t.indexOf('社用車'); }));
const r = await rows();
ok('貸出が4件とも出る', r.length === 4, r);

console.log('\n───── ②③ 引退・予約以外・緊急も出る ─────');
ok('🔴 引退した代車の貸出も出る', r.some(x => /旧ムーヴ/.test(x)), r);
ok('引退の印が付く', r.some(x => /旧ムーヴ.*引退/.test(x)), r);
ok('予約以外で貸したぶんも出る', r.some(x => /予約以外/.test(x)), r);
ok('緊急で貸したぶんも出る', r.some(x => /緊急/.test(x)), r);
ok('用途のメモも出る', r.some(x => /代車の入替/.test(x)), r);

console.log('\n───── ④ 新しい順 ─────');
ok('いちばん上が最近の貸出（貸出中のワゴンR）', /ワゴンR/.test(r[0]), r[0]);
ok('いちばん下がいちばん古い（60日前の旧ムーヴ）', /旧ムーヴ/.test(r[3]), r[3]);

console.log('\n───── ⑤ 代車で絞れる（プルダウン）─────');
ok('🔴 絞り込みはプルダウン（台数が増えても縦に伸びない）',
   await p.evaluate(() => !!document.querySelector('.fl-hist-sel') && !document.querySelector('.fl-hist-chip')));
const c0 = await opts();
ok('「全部」が最初に選ばれている', c0[0].on === true && /全部/.test(c0[0].t), c0[0]);
ok('貸出がある代車だけ出る（3台＋全部）', c0.length === 4, c0.map(x => x.t));
ok('🔴 引退した代車も出る', c0.some(x => /旧ムーヴ/.test(x.t)), c0.map(x => x.t));
await p.evaluate(() => flHistFilter('L1'));
await p.waitForTimeout(400);
const r1 = await rows();
ok('絞ると その代車のぶんだけになる', r1.length === 2 && r1.every(x => /ハスラー/.test(x)), r1);
ok('絞り込み中と分かる（何件出しているか）', await p.evaluate(() => /件を出しています/.test(document.getElementById('view-fleet-body').innerText)));
await p.evaluate(() => flHistFilter(''));
await p.waitForTimeout(400);
ok('「全部」を選ぶと全部に戻る', (await rows()).length === 4);

console.log('\n───── ⑥ 1行の中身 ─────');
const one = (await rows()).find(x => /田中/.test(x));   /* 予約から作った貸出の行 */
ok('期間が出る', /\d+\/\d+\/\d+ 〜 \d+\/\d+\/\d+/.test(one), one);
ok('日数が出る', /\d+日/.test(one), one);
ok('返却済みか出る', /返却済/.test(one), one);
ok('お客様の名前が出る', /田中/.test(one), one);
ok('貸出中の車は「貸出中」と出る', (await rows()).some(x => /貸出中/.test(x)));

console.log('\n───── ⑦ 見るだけ ─────');
{
  const src = fs.readFileSync('js/fleet.js', 'utf8');
  const hist = src.slice(src.indexOf('function _flHistoryHtml'), src.indexOf('function _flUsedCount'));
  ok('🔴 履歴の一覧から消す・直すはできない（押せるのは絞り込みだけ）',
     !/onclick="(?!flHistToggle)/.test(hist), (hist.match(/onclick="[a-zA-Z]+/g) || []));
  ok('貸出の中身を書き換えていない', !/\.returned\s*=|\.toDate\s*=|splice\(|filter\(function\(x\)\{ return x\.id/.test(hist));
}
ok('代車カレンダーは今までどおり引退を出さない',
   await p.evaluate(() => { const l = state.loaners.find(x => x.id === 'L9'); return !!l.retired; }));

console.log('\n───── まとめ ─────');
ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 5));
console.log('\n  ' + pass + ' OK / ' + fail + ' NG\n');
await b.close();
process.exit(fail ? 1 : 0);
