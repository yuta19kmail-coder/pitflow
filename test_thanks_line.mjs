/* ================================================================================
   💬 お礼LINE ＝ LINEが繋がっているお客様にだけ聞く（v2.13.3）
   --------------------------------------------------------------------------------
   🗣 ゆうた 2026-08-25
      「お礼ラインの表示とチェックを促すポップアップで、そもそも**Lステップリンクが
       顧客情報にあるものに限って**ほしい。無いやつは**LINEが未接続です みたいな
       グレーアウト**にしてほしい」
      （「登録済だけどLステップ番号が入っていない」人は？と聞いた）→「**押せる**」
   --------------------------------------------------------------------------------
   🔴 見張るのは4つ。
      ① 4つの状態を正しく分ける（未案内／お断り／登録済・番号なし／登録済・番号あり）
      ② 灰色の**理由を1つの文でごまかさない**（お断りの人に「未接続」と言わない＝嘘）
      ③ 見るのは**顧客情報**。カードの写しが古くてもお客様を正とする
      ④ 画面で灰色にするだけにしない。**書き込む所でも同じ物差しで止める**
   ================================================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let OK = 0, NG = 0;
const ok = (n, c, x) => { if (c) { OK++; console.log('  ✅ ' + n); }
                          else { NG++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const bare = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n── 🔍 コードの決めごと ──');
{
  const sh = bare('js/pit-share.js');
  ok('💬 物差しが1本ある（pitThanksLineOK / pitThanksLineWhy）',
     /w\.pitThanksLineOK\s*=/.test(sh) && /w\.pitThanksLineWhy\s*=/.test(sh));
  ok('🔴 お客様を先に見る（カードの写しはそのあと）',
     /pitVehByPlate[\s\S]{0,200}h\.cust\.lineStatus/.test(sh));
  ok('🔴 Lステップ番号は押せる／押せないに使わない（LINEが繋がっているかは lineStatus）',
     !/lstepId/.test(sh), (sh.match(/lstepId/g) || []).length);
  const cv = bare('js/card-view.js'), rp = bare('js/return-popup.js'), hv = bare('js/card-hover.js');
  ok('🖥 出す所は3つとも同じものに聞く（カード詳細・返車の窓・ホバー）',
     /pitThanksLineWhy\(/.test(cv) && /pitThanksLineWhy\(/.test(rp) && /pitThanksLineWhy\(/.test(hv));
  /* 🔴 画面から消しただけにしない＝書き込む所でも止める（v1.97.0 の決めごとと同じ） */
  ok('🔴 書き込む所でも止める（3か所とも）',
     /pitThanksLineOK\(_c\)/.test(cv) && /pitThanksLineOK\(c\)/.test(rp) && /pitThanksLineOK\(c\)/.test(hv));
  ok('🔴 欄ごとは消さない（灰色の型がある）',
     /is-off/.test(cv) && /is-off/.test(rp) && /is-off/.test(hv));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed','1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitThanksLineWhy && window.PitReturnPopup', null, { timeout: 25000 });
await p.waitForTimeout(900);

console.log('\n── 💬 4つの状態 ──');
{
  const r = await p.evaluate(() => {
    const cu = window.state.customers.find(c => c.vehicles && c.vehicles[0] && c.vehicles[0].plate);
    const c = { id:'T1', plate: cu.vehicles[0].plate };
    const 見る = (st, id) => { cu.lineStatus = st; cu.lstepId = id;
      return { 押せる: window.pitThanksLineOK(c), 理由: window.pitThanksLineWhy(c) }; };
    const out = {
      未案内:   見る('', ''),
      お断り:   見る('ng', ''),
      番号なし: 見る('ok', ''),
      番号あり: 見る('ok', '12345')
    };
    /* カードの写しが古い（お客様は登録済／カードは空）→ お客様を正とする */
    cu.lineStatus = 'ok'; cu.lstepId = '12345';
    out.写しが古い = window.pitThanksLineOK({ plate: cu.vehicles[0].plate, lineStatus: '' });
    /* お客様が引けない（ナンバー無し）→ カードの写しで見る＝行き止まりにしない */
    out.引けない  = window.pitThanksLineOK({ plate: '', lineStatus: 'ok' });
    out.引けない未 = window.pitThanksLineOK({ plate: '', lineStatus: '' });
    return out;
  });
  ok('🔴 未案内は押せない／理由は「LINEが未接続です」',
     r.未案内.押せる === false && r.未案内.理由 === 'LINEが未接続です', r.未案内);
  ok('🔴🔴 お断りは押せない／理由は**「未接続」ではなく「お断り」**（嘘をつかない）',
     r.お断り.押せる === false && r.お断り.理由 === 'LINEお断りのお客様です', r.お断り);
  ok('🔴🔴 登録済（番号なし）は**押せる**（LINEでは繋がっている・ゆうた指定）',
     r.番号なし.押せる === true && r.番号なし.理由 === '', r.番号なし);
  ok('🔴 登録済（番号あり）も押せる', r.番号あり.押せる === true && r.番号あり.理由 === '', r.番号あり);
  ok('🔴 カードの写しが古くても、お客様を正とする', r.写しが古い === true, r);
  ok('🔴 お客様が引けない時はカードの写しで見る（行き止まりにしない）',
     r.引けない === true && r.引けない未 === false, r);
}

console.log('\n── 🖥 カード詳細（表紙チェック・完了アーカイブ） ──');
{
  const r = await p.evaluate(async () => {
    const c = (window.state.cards || []).find(x => x && x.status === 'returned');
    const cu = window.state.customers.find(x => (x.vehicles || []).some(v => v.plate === c.plate));
    if (cu){ cu.lineStatus = ''; cu.lstepId = ''; } else { c.lineStatus = ''; }
    c.noThanksLine = false;
    window.pitOpenCardDetail(c.id);
    await new Promise(r => setTimeout(r, 700));
    const 読み = document.body.innerText;
    if (window.cvArchEdit){ window.cvArchEdit(); await new Promise(r => setTimeout(r, 400)); }
    const row = document.querySelector('.cv-pickrow.is-off');
    const 前 = c.noThanksLine;
    const chip = row && row.querySelector('.cv-chip');
    if (chip) chip.click();
    await new Promise(r => setTimeout(r, 250));
    return { 読みに理由: /LINEが未接続です/.test(読み),
             灰色: !!row, ボタンは残っている: !!chip,
             押しても動かない: c.noThanksLine === 前 };
  });
  ok('🔴 返車済みの表示にも理由が出る（要／不要ではなく）', r.読みに理由 === true, r);
  ok('🔴 編集でも灰色になる', r.灰色 === true, r);
  ok('🔴 ボタンごと消さない（無いのか押せないのか分かるように）', r.ボタンは残っている === true, r);
  ok('🔴🔴 灰色のボタンを押しても値が動かない', r.押しても動かない === true, r);
}

console.log('\n── 🪟 返車のポップアップ ──');
{
  const r = await p.evaluate(async () => {
    const c = (window.state.cards || []).find(x => x && !x.returnStage && x.status !== 'returned');
    const cu = window.state.customers.find(x => (x.vehicles || []).some(v => v.plate === c.plate));
    const 出す = async (st) => {
      if (cu){ cu.lineStatus = st; cu.lstepId = (st === 'ok' ? '999' : ''); } else { c.lineStatus = st; }
      window.PitReturnPopup.open(c, 'callDone');
      await new Promise(r => setTimeout(r, 300));
      /* ⚠ 待ち・当日の車は「1枚目」を挟む（v1.97.0）。通常側で進める。 */
      const bd = document.getElementById('rp-backdrop');
      if (!bd || !bd.classList.contains('show')){ window.PitReturnPopup.kind(0);
        await new Promise(r => setTimeout(r, 400)); }
      const f = document.getElementById('rp-line-field');
      const o = { 灰色: !!(f && f.classList.contains('is-off')),
                  理由: (document.getElementById('rp-line-why') || {}).textContent || '',
                  ボタンは残っている: !!document.getElementById('rp-line-1') };
      window.PitReturnPopup.close(false);
      await new Promise(r => setTimeout(r, 300));
      return o;
    };
    return { 未案内: await 出す(''), お断り: await 出す('ng'), 登録済: await 出す('ok') };
  });
  ok('🔴 未案内は灰色＋「LINEが未接続です」',
     r.未案内.灰色 && r.未案内.理由 === 'LINEが未接続です', r.未案内);
  ok('🔴 お断りは灰色＋「LINEお断りのお客様です」',
     r.お断り.灰色 && r.お断り.理由 === 'LINEお断りのお客様です', r.お断り);
  ok('🔴 登録済は今までどおり押せる', r.登録済.灰色 === false && r.登録済.理由 === '', r.登録済);
  ok('🔴 どの状態でもボタンごとは消さない',
     r.未案内.ボタンは残っている && r.お断り.ボタンは残っている, r);
}

console.log('\n── 🧭 まわり ──');
ok('エラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
await b.close();
process.exit(NG ? 1 : 0);
