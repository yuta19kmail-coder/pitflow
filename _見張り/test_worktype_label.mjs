/* ============================================================
   test_worktype_label.mjs
   「この車に付いている作業タイプは何か」の見張り。

   きっかけ：ゆうた 2026-08-25
     「BPを選択した時に予約詳細カードの表示が　作業　になる」

   何が起きていたか：
     作業タイプの持ち方は2枠ある。
       c.workType   … 基本（車検 / 12点 / 一般 / オイル）＝1つだけ
       c.workAddons … 併用可（B.P / 1Y / 3M / 車販依頼）＝いくつでも
     予約詳細（card-view.js）は **c.workType だけ**を見ていた。
     B.P は combinable:true なので c.workAddons 側に入る。
     → 「B.Pだけ」の車は c.workType が null → 「作業」という言い訳の文字＋一般の緑色。
     → 「車検＋B.P」でも B.P が消えていた（＝予約カードのバッジと言うことが違う）。
     顧客の来店履歴・顧客詳細・駐車場では、同じ理由で「—」と出ていた。

   直し方（v2.9.7）：
     pit-share.js に `pitCardWorkIds` / `pitCardWorkTypes` を**1本**置いて、
     見せる所は全部そこを通す。併用は「車検＋B.P」と**両方並べる**（ゆうた指定）。

   使い方：
     node /tmp/srv.js &            ← 8991
     NODE_PATH=... node test_worktype_label.mjs
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cp   = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = process.env.PORT || 8991;
let OK = 0, NG = 0;
function ok(name, cond, extra){
  if (cond) { OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
/* 🔴 自分のコメントに正規表現が当たる事故を何度もやっているので、必ず先に外す */
function bare(f){
  return fs.readFileSync(path.join(process.cwd(), f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

console.log('\n── 📐 物差しは1本 ──');
{
  const share = bare('js/pit-share.js');
  ok('pit-share.js に本家がある（pitCardWorkIds）', /w\.pitCardWorkIds\s*=/.test(share));
  ok('pit-share.js に名前と色の本家がある（pitCardWorkTypes）', /w\.pitCardWorkTypes\s*=/.test(share));
  ['js/card-view.js', 'js/customers.js', 'js/parking.js'].forEach(function (f) {
    const s = bare(f);
    ok('🔴 ' + f + ' が本家を呼んでいる', /pitCardWorkTypes\s*\(/.test(s));
    ok('🔴 ' + f + ' に自前の workTypes.find が残っていない',
       !/\(\s*state\.workTypes\s*\|\|\s*\[\]\s*\)\s*\.find/.test(s), (s.match(/\(state\.workTypes\|\|\[\]\)\.find[^\n]*/g) || []).slice(0, 2));
  });
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderCardView && window.pitCardWorkTypes', null, { timeout: 25000 });
await p.waitForTimeout(700);

console.log('\n── 🔧 拾い方そのもの ──');
{
  const r = await p.evaluate(() => {
    const f = c => pitCardWorkIds(c);
    return {
      写しがあればそれ: f({ workTypes: ['shaken', 'bp'], workType: 'shaken', workAddons: ['bp'] }),
      写しが無ければ組み立てる: f({ workType: 'shaken', workAddons: ['bp'] }),
      併用だけ: f({ workAddons: ['bp'] }),
      基本だけ: f({ workType: 'oil' }),
      からっぽ: f({}),
      ぬる: f(null),
      重複はまとめる: f({ workType: 'bp', workAddons: ['bp', 'coat1y'] })
    };
  });
  ok('写し（c.workTypes）があればそれをそのまま', JSON.stringify(r.写しがあればそれ) === '["shaken","bp"]', r.写しがあればそれ);
  ok('🔴 写しが無い古いカードは 基本→併用 の順で組み立てる',
     JSON.stringify(r.写しが無ければ組み立てる) === '["shaken","bp"]', r.写しが無ければ組み立てる);
  ok('🔴 併用だけ（B.P）でも拾える', JSON.stringify(r.併用だけ) === '["bp"]', r.併用だけ);
  ok('基本だけでも拾える', JSON.stringify(r.基本だけ) === '["oil"]', r.基本だけ);
  ok('からっぽは空の配列', JSON.stringify(r.からっぽ) === '[]', r.からっぽ);
  ok('null を渡しても落ちない', JSON.stringify(r.ぬる) === '[]', r.ぬる);
  ok('同じものを2回入れない', JSON.stringify(r.重複はまとめる) === '["bp","coat1y"]', r.重複はまとめる);

  const m = await p.evaluate(() => ({
    名前と色: pitCardWorkTypes({ workTypes: ['shaken', 'bp'] }).map(x => x.label + '/' + x.color),
    消した型: pitCardWorkTypes({ workTypes: ['zzz-むかしの型'] }).map(x => x.label)
  }));
  ok('名前と色が付いてくる', JSON.stringify(m.名前と色) === '["車検/#ef4444","B.P/#3b82f6"]', m.名前と色);
  ok('🔴 マスターに無い古い型でも落とさない（バッジを消さない）',
     JSON.stringify(m.消した型) === '["zzz-むかしの型"]', m.消した型);
}

console.log('\n── 🪪 予約詳細カードの作業タイプ欄 ──');
{
  const r = await p.evaluate(() => {
    const cases = [
      { n: 'B.Pだけ',        w: null,     a: ['bp'],      t: ['bp'] },
      { n: '車検＋B.P',      w: 'shaken', a: ['bp'],      t: ['shaken', 'bp'] },
      { n: '1Yだけ',         w: null,     a: ['coat1y'],  t: ['coat1y'] },
      { n: '3Mだけ',         w: null,     a: ['coat3m'],  t: ['coat3m'] },
      { n: '車販依頼だけ',   w: null,     a: ['carsale'], t: ['carsale'] },
      { n: '車検だけ',       w: 'shaken', a: [],          t: ['shaken'] },
      { n: '古いカード',     w: 'bp',     a: undefined,   t: undefined },
      { n: 'なにも無し',     w: null,     a: [],          t: [] }
    ];
    let host = document.getElementById('wt-probe');
    if (!host) { host = document.createElement('div'); host.id = 'wt-probe'; document.body.appendChild(host); }
    const out = {};
    cases.forEach(function (cs, i) {
      const c = { id: 'WT-' + i, boardId: 'default', customer: 'テスト', car: 'プリウス',
                  status: 'reserved', reserveDate: '2026-08-25',
                  workType: cs.w, workAddons: cs.a, workTypes: cs.t, workSpecials: [] };
      state.cards.push(c);
      renderCardView(c, 'wt-probe');
      const el = host.querySelector('.cv-wftype');
      out[cs.n] = { 字: el ? el.textContent.trim() : '(無し)', 色: el ? el.style.color : '' };
    });
    state.cards = state.cards.filter(function (c) { return String(c.id).indexOf('WT-') !== 0; });
    return out;
  });
  ok('🔴 B.Pだけ → 「B.P」（「作業」と出さない）', r['B.Pだけ'].字 === 'B.P', r['B.Pだけ']);
  ok('🔴 B.Pだけ → 色も B.P の青', r['B.Pだけ'].色 === 'rgb(59, 130, 246)', r['B.Pだけ']);
  ok('🔴 車検＋B.P → 両方出す（ゆうた指定）', r['車検＋B.P'].字 === '車検＋B.P', r['車検＋B.P']);
  ok('車検＋B.P → 色は先頭（車検の赤）', r['車検＋B.P'].色 === 'rgb(239, 68, 68)', r['車検＋B.P']);
  ok('1Yだけ → 「1Y」', r['1Yだけ'].字 === '1Y', r['1Yだけ']);
  ok('3Mだけ → 「3M」', r['3Mだけ'].字 === '3M', r['3Mだけ']);
  ok('車販依頼だけ → 「車販依頼」', r['車販依頼だけ'].字 === '車販依頼', r['車販依頼だけ']);
  ok('車検だけ → 今までどおり「車検」', r['車検だけ'].字 === '車検', r['車検だけ']);
  ok('写しが無い古いカードでも出る', r['古いカード'].字 === 'B.P', r['古いカード']);
  ok('本当に何も無い時だけ「作業」', r['なにも無し'].字 === '作業', r['なにも無し']);
}

console.log('\n── 🧭 まわり ──');
{
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  const ver = await p.evaluate(() => (document.querySelector('meta[name=app-version]') || {}).content || '');
  /* 🔴 版くらべは**数で**。文字のままだと '2.10.0' < '2.9.6' になって落ちる
     （2026-08-25 に踏んだ。2.9 の次が 2.10 になった瞬間、見張りが全部赤くなった）。 */
  const vn = (String(ver).match(/\d+/g) || []).map(Number);
  const need = '2.9.7'.split('.').map(Number);
  const ge = (a, b) => (a[0]||0) !== (b[0]||0) ? (a[0]||0) > (b[0]||0)
                     : (a[1]||0) !== (b[1]||0) ? (a[1]||0) > (b[1]||0)
                     : (a[2]||0) >= (b[2]||0);
  ok('版が v2.9.7 以降', ge(vn, need), ver);
}

await b.close();
console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
process.exit(NG ? 1 : 0);
