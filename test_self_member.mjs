/* PitFlow v1.51.0 ── 「小林モータース」はアカウントではない（付箋・メンバー一覧に出さない）
   -------------------------------------------------------------------
   ◎背景（ゆうた指摘 2026-08-05）
     「PitFlow の付箋に 小林モータース って出てるからそれは要らない。
       アカウントにも小林モータースってあるが、パブリックアカウントは既にコバモが存在しているから、
       小林モータース（フロント担当などで必要な名前）はアカウントではなく特別扱いの内部処理にしてほしい」

   ◎決めごと
     🔴 「小林モータース」（members-pit.js の SELF_ID='pit_self'・isSelf:true）は
        **人ではなく、整備ソフト側で担当が「小林モータース」になっている分の受け皿**。
        ・**付箋の担当・「全員」・部署一括・受付一括・「自分」の選択肢には出さない**
        ・**メンバー一覧（＝アカウントの一覧）にも出さない**
        ・**フロント担当／予約担当／完TEL担当の候補には今までどおり出す**（そこでは必要）
        ・**昔の付箋に既に入っている分の名前とアイコンは出る**（消さない・化けさせない）

   ◎使い方（PitFlow のフォルダで）
     python -m http.server 8974      ← 別ウィンドウ
     node test_self_member.mjs                                            */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const dir = process.cwd();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

/* ===== ① ソースの見張り ===== */
console.log('\n── ① ソースの見張り ──');
{
  const bn = fs.readFileSync(path.join(dir, 'js', 'board-notes.js'), 'utf8');
  ok('🔴 付箋用に「自社を外した名簿」を作っている', /function _bnStaff\(\)[\s\S]{0,160}?!s\.isSelf/.test(bn));
  const musts = [
    ['担当のチェック一覧', /const list = _bnStaff\(\);/],
    ['「全員」ボタン', /bnQuickSelectAll = function \(\) \{ _editor\.members = _bnStaff\(\)/],
    ['部署の一括選択', /const inDiv = _bnStaff\(\)/],
    ['受付の一括選択', /const recp = _bnStaff\(\)/],
    ['「自分」の選択肢', /const meOpts = _bnStaff\(\)/],
    ['「自分」の既定値', /const staff = _bnStaff\(\);/],
  ];
  musts.forEach(([label, re]) => ok('🔴 ' + label + 'から自社を外している', re.test(bn)));
  ok('名前を出す方は素の state.staff を見る（昔の付箋が化けない）',
     /function _staffById[\s\S]{0,200}?\(state\.staff \|\| \[\]\)\.find/.test(bn), '');

  const mp = fs.readFileSync(path.join(dir, 'js', 'members-pit.js'), 'utf8');
  ok('🔴 メンバー一覧からも自社を外している',
     /var list = \(\(window\.state && state\.staff\) \|\| \[\]\)\.filter\(function \(s\) \{ return !s\.isSelf; \}\);/.test(mp));
  ok('🔴 state.staff 自体からは消していない（フロント担当の候補に要る）',
     /id: SELF_ID, cmId: '', isSelf: true/.test(mp));
  ok('なぜ出さないかを画面に書いてある', /人ではないのでここには出しません/.test(mp));

  const cd = fs.readFileSync(path.join(dir, 'js', 'card-detail.js'), 'utf8');
  ok('🔴 担当の候補は state.staff のまま＝自社が消えていない', !/isSelf/.test(cd) || /!s\.isSelf/.test(cd) === false);

  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const ver = /<meta name="app-version" content="([\d.]+)">/.exec(html);
  ok('版の表示がそろっている（meta＋画面2か所）',
     !!ver && (html.match(new RegExp('v' + ver[1].replace(/\./g, '\\.') + '<', 'g')) || []).length >= 2, ver && ver[1]);
  ok('付箋とメンバーのキャッシュ番号を上げた',
     /board-notes\.js\?v=8/.test(html) && /members-pit\.js\?v=14/.test(html));
}

/* ===== ② 実際に動かす ===== */
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));

/* 本物の board-notes.js を、にせの state だけ与えて動かす */
const page = `<!doctype html><meta charset="utf-8"><body>
<div id="board-notes-area"></div>
<div id="bn-inp-members"></div><div id="bn-group-quick"></div>
<script>
window.state = {
  boardNotes: [], boardLabels: {}, currentView: 'dashboard',
  staff: [
    { id: 'p1', name: 'ゆうた',   realName: '小林 勇太', front: true,  reception: true,  divisions: ['div1'] },
    { id: 'p2', name: 'コバモ',   realName: 'コバモ',     front: true,  reception: true,  divisions: ['div1'] },
    { id: 'p3', name: 'たろう',   realName: '山田 太郎', front: false, reception: false, divisions: ['div2'] },
    { id: 'pit_self', name: '小林モータース', realName: '小林モータース', isSelf: true, front: true, reception: false, divisions: [] }
  ]
};
window.PIT_DIVS = [{ id:'div1', label:'1課' }, { id:'div2', label:'2課' }];
window.PitDB = { save: function(){} };
window.pitToast = function(){};
<\/script>
<script src="js/board-notes.js"><\/script>
<script>window.__ready = 1;<\/script>`;
fs.writeFileSync(path.join(dir, 'test-self-member.html'), page);

await p.goto('http://127.0.0.1:8974/test-self-member.html');
await p.waitForFunction(() => window.__ready === 1);
const ev = (fn, arg) => p.evaluate(fn, arg);

console.log('\n── ② 付箋の担当えらび ──');
/* 選ばれている人を画面から読む（本体に手を入れずに中身を見るため） */
const CHECKED = `(() => Array.from(document.querySelectorAll('#bn-inp-members input[type=checkbox]'))
  .filter(x => x.checked)
  .map(x => (/'([^']+)'/.exec(x.getAttribute('onchange')) || [])[1]))()`;
const checked = () => p.evaluate(CHECKED);

await ev(() => { window.bnQuickClear(); });
await p.waitForTimeout(60);
{
  const html = await ev(() => document.getElementById('bn-inp-members').innerHTML);
  ok('ふつうの人は出る（ゆうた・コバモ・たろう）',
     /ゆうた/.test(html) && /コバモ/.test(html) && /たろう/.test(html));
  ok('🔴 「小林モータース」は担当の候補に出ない', !/小林モータース/.test(html), html.slice(0, 200));
  ok('🔴 パブリックアカウントの「コバモ」はちゃんと出る', /コバモ/.test(html));
}

console.log('\n── ③ 一括選択のボタン ──');
{
  await ev(() => { window.bnQuickClear(); window.bnQuickSelectAll(); });
  const all = await checked();
  ok('🔴 「全員」に自社が混ざらない', all.indexOf('pit_self') < 0, all);
  ok('「全員」はふつうの人3人', all.length === 3, all);
}
{
  await ev(() => { window.bnQuickClear(); window.bnQuickSelectDivision('div1'); });
  const d1 = await checked();
  ok('部署の一括に自社が混ざらない', d1.indexOf('pit_self') < 0, d1);
  await ev(() => { window.bnQuickClear(); window.bnQuickSelectReception(); });
  const rc = await checked();
  ok('🔴 受付の一括に自社が混ざらない（自社は front:true を持っている）', rc.indexOf('pit_self') < 0, rc);
}

console.log('\n── ④ 「自分」の選択肢 ──');
{
  await ev(() => { try { localStorage.removeItem('pitflow_bn_me'); } catch (e) {} window.renderBoardNotes(); });
  await p.waitForTimeout(60);
  const html = await ev(() => document.getElementById('board-notes-area').innerHTML);
  ok('🔴 「自分」の選択肢に自社が出ない', !/value="pit_self"/.test(html));
  ok('「自分」の既定は自社ではない', !/<option value="pit_self"[^>]*selected/.test(html));
}

console.log('\n── ⑤ 昔の付箋に入っている分は化けない ──');
{
  const r = await ev(() => {
    window.state.boardNotes = [{ id: 'n1', title: '古い付箋', body: '', color: 'yellow',
      memberUids: ['pit_self', 'p1'], authorUid: 'pit_self', status: 'open', order: 1 }];
    window.renderBoardNotes();
    return document.getElementById('board-notes-area').innerHTML;
  });
  ok('🔴 昔の付箋に入っている「小林モータース」の名前は出る（消さない・化けさせない）',
     /小林モータース/.test(r), r.indexOf('小林モータース'));
  ok('付箋そのものは消えていない', /古い付箋/.test(r));
}

console.log('\n── ⑥ JSエラー ──');
ok('ページのJSエラーなし', errs.length === 0, errs.slice(0, 4));

await b.close();
if (!process.env.KEEP_HTML) { try { fs.unlinkSync(path.join(dir, 'test-self-member.html')); } catch (e) {} }
console.log('\n' + pass + ' OK / ' + fail + ' NG\n');
process.exit(fail ? 1 : 0);
