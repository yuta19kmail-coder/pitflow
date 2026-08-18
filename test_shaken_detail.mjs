/* PitFlow v1.120.0 ── 済にしたら、陸運局とラウンドも予約詳細に残る
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-18）
     「最終的に済みにした時点で **陸運局とラウンド**、担当（担当は今も入ってる）を
       **予約詳細にも埋め込む**ようにして」

   ◎決めごと
     🔴 予約詳細の「車検」欄（済のまとめ）に **担当（回送）／陸運局／ラウンド** の3つを出す
     🔴 予約詳細の「車検済にする」からも、その場で陸運局とRを入れられる
     🔴 陸運局の選択肢は CoreMembers の場所マスターの「陸運局」だけ（PitFlowでは作れない）
     🔴 陸運局は **id で持ち、名前は控えの写し**（場所が消えても記録が空にならない）
     🔴 再検の記録にも、その回の陸運局とRを残す。⚠ 古い記録には入っていないので、
        **入っているものだけ**出す（無いものを埋めない＝2026-08-13 の決めごと）

   ◎使い方
     python3 -m http.server 8979      ← 別ウィンドウ
     node test_shaken_detail.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8979;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
            '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1700, height: 1050 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });

await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&nonews=1`);
await p.waitForFunction('window.state && window.openDetail && window.pitRikuunList && window.cvShakenGo', null, { timeout: 25000 });
await p.evaluate(() => { if (window.pitSampleLogin) pitSampleLogin(); });
await p.waitForTimeout(1000);

/* 車検の車を1台だけ置いて、予約詳細を開く */
const openOne = async (insp) => p.evaluate(async (insp) => {
  state.cards = [{ id:'V1', boardId:'default', status:'check', workTypes:['shaken'],
    customer:'詳細', car:'テスト車', plate:'',
    coverCall:{done:false,at:'',staff:''},
    inspSchedule: Object.assign({ mode:'manual', slots:{}, cutBefore:'', history:[] }, insp) }];
  showView('today');
  if (window.closeDetail) try { closeDetail(); } catch(e){}
  openDetail('V1');
  await new Promise(r => setTimeout(r, 600));
}, insp);

/* ===== ① 済のまとめに 担当・陸運局・ラウンドが出る ===== */
await openOne({ result:'done', resultDate:'2026-08-18', resultSlot:'am', resultStaff:'山田',
                office:'sample_rik_noda', officeName:'野田自動車検査登録事務所', round:2 });
const done = await p.evaluate(() => {
  const box = document.querySelector('.cv-shdone');
  return { ある: !!box, 本文: box ? box.textContent.replace(/\s+/g,' ') : '',
           欄: box ? Array.from(box.querySelectorAll('.cv-shwhere .cv-shw')).map(e => e.textContent.replace(/\s+/g,' ').trim()) : null };
});
console.log('\n■ 予約詳細の「車検」欄（済）');
ok('済のまとめが出る',                            done.ある, done);
ok('担当（回送）が出る',                          /担当（回送）：山田/.test(done.本文), done.本文);
ok('🔴 陸運局が出る',                             done.欄 && done.欄.some(t => /陸運局：野田自動車検査登録事務所/.test(t)), done.欄);
ok('🔴 ラウンドが出る',                           done.欄 && done.欄.some(t => /ラウンド：2R/.test(t)), done.欄);

/* ===== ② 入っていなければ「—」（空欄で嘘をつかない） ===== */
await openOne({ result:'done', resultDate:'2026-08-18', resultSlot:'pm', resultStaff:'' });
const empty = await p.evaluate(() => {
  const box = document.querySelector('.cv-shdone');
  return Array.from(box.querySelectorAll('.cv-shwhere .cv-shw')).map(e => e.textContent.replace(/\s+/g,' ').trim());
});
ok('陸運局が空なら「—」',                         empty.some(t => /陸運局：—/.test(t)), empty);
ok('ラウンドが空なら「—」',                       empty.some(t => /ラウンド：—/.test(t)), empty);

/* ===== ③ 名前は CoreMembers が正・写しは後ろ盾だけ ===== */
const live = await p.evaluate(async () => {
  const s = state.cards[0].inspSchedule;
  s.office = 'sample_rik_chiba'; s.officeName = '（ふるい名前）';
  renderCardView(state.cards[0], 'md-body-modal');
  await new Promise(r => setTimeout(r, 200));
  const now = document.querySelector('.cv-shwhere').textContent;
  /* 場所マスターに無い id ＝ 消された場合。この時だけ写しを使う */
  s.office = 'no_such_place'; s.officeName = '消えた陸運局';
  renderCardView(state.cards[0], 'md-body-modal');
  await new Promise(r => setTimeout(r, 200));
  return { 本家: now, 消えた時: document.querySelector('.cv-shwhere').textContent };
});
console.log('\n■ 名前の出どころ');
ok('CoreMembers にある名前が優先される',          /千葉運輸支局/.test(live.本家) && !/ふるい名前/.test(live.本家), live.本家);
ok('場所が消えたら控えの写しで出す',              /消えた陸運局/.test(live.消えた時), live.消えた時);

/* ===== ④ 「車検済にする」の窓から陸運局とRを入れられる ===== */
await openOne({ decided:'2026-08-18', decidedSlot:'am' });
const popup = await p.evaluate(async () => {
  cvShakenGo('done');
  await new Promise(r => setTimeout(r, 300));
  return {
    日: !!document.getElementById('cv-shdate'),
    担当: !!document.getElementById('cv-shstaff'),
    陸運局: !!document.getElementById('cv-shoffice'),
    R: !!document.getElementById('cv-shround'),
    Rの中身: Array.from(document.querySelectorAll('#cv-shround option')).map(o => o.textContent),
    陸運局の中身: Array.from(document.querySelectorAll('#cv-shoffice option')).map(o => o.textContent),
    担当の見出し: Array.from(document.querySelectorAll('.cv-shpb label')).map(e => e.textContent)
  };
});
console.log('\n■ 予約詳細の「車検済にする」の窓');
ok('陸運局の欄がある',                            popup.陸運局, popup);
ok('Rの欄がある',                                 popup.R, popup);
ok('R は 1R〜4R ＋（未定）',                      JSON.stringify(popup.Rの中身) === JSON.stringify(['（未定）','1R','2R','3R','4R']), popup.Rの中身);
ok('陸運局は CoreMembers の陸運局だけ',           popup.陸運局の中身.length >= 2 && popup.陸運局の中身[0] === '（未定）', popup.陸運局の中身);
ok('担当の見出しが「回送＝実際に車検に行った人」', popup.担当の見出し.some(t => /回送/.test(t)), popup.担当の見出し);

/* ===== ⑤ 記録すると保存され、まとめに出る ===== */
const rec = await p.evaluate(async () => {
  const offEl = document.getElementById('cv-shoffice');
  const opt = offEl.querySelector('option:nth-child(2)');
  offEl.value = opt.value;
  document.getElementById('cv-shround').value = '3';
  const stEl = document.getElementById('cv-shstaff');
  const stName = stEl.value;
  cvShConfirm('done');
  await new Promise(r => setTimeout(r, 400));
  const s = state.cards[0].inspSchedule;
  return { 保存: { office: s.office, officeName: s.officeName, round: s.round, staff: s.resultStaff, result: s.result },
           欲しい: { office: opt.value, name: opt.textContent, staff: stName },
           まとめ: (document.querySelector('.cv-shwhere')||{}).textContent || '',
           窓が閉じた: !document.querySelector('#cv-shpop.show'),
           フロー: (state.cards[0].log || []).map(f => f.label || '').join(' / ') };
});
console.log('\n■ 記録すると保存される');
ok('陸運局が id で保存される',                    rec.保存.office === rec.欲しい.office, rec);
ok('陸運局の名前も控えとして残る',                rec.保存.officeName === rec.欲しい.name, rec);
ok('R が数字で保存される',                        rec.保存.round === 3, rec);
ok('済になる',                                    rec.保存.result === 'done', rec);
ok('まとめにその陸運局とRが出る',                 rec.まとめ.includes(rec.欲しい.name) && /3R/.test(rec.まとめ), rec.まとめ);
ok('窓が閉じる',                                  rec.窓が閉じた, rec);
ok('フローに陸運局とRが残る',                     /3R/.test(rec.フロー) && rec.フロー.includes(rec.欲しい.name), rec.フロー);

/* ===== ⑥ 再検の記録にも残る／古い記録は埋めない ===== */
await openOne({ decided:'2026-08-18', decidedSlot:'am',
                history:[{ date:'2026-07-01', slot:'am', result:'recheck', staff:'佐藤' }] });   /* ← 古い記録＝陸運局なし */
const re = await p.evaluate(async () => {
  cvShakenGo('recheck');
  await new Promise(r => setTimeout(r, 300));
  const offEl = document.getElementById('cv-shoffice');
  offEl.value = offEl.querySelector('option:nth-child(2)').value;
  const name = offEl.querySelector('option:nth-child(2)').textContent;
  document.getElementById('cv-shround').value = '4';
  cvShConfirm('recheck');
  await new Promise(r => setTimeout(r, 400));
  const s = state.cards[0].inspSchedule;
  const last = s.history[s.history.length - 1];
  return { 新しい記録: { office: last.office, officeName: last.officeName, round: last.round },
           name,
           残った: { office: s.office, round: s.round },
           表示: (document.querySelector('.cv-shrc')||{}).textContent || '' };
});
console.log('\n■ 再検の記録');
ok('再検の記録にも陸運局とRが入る',               re.新しい記録.officeName === re.name && re.新しい記録.round === 4, re);
ok('新しい記録は陸運局とRつきで出る',             re.表示.includes(re.name) && /4R/.test(re.表示), re.表示);
/* ⚠ 表示は「7/1(水) AM・佐藤」の形。古い記録は担当のあとに何も足さない＝末尾が「佐藤」で終わる */
const 古い = re.表示.split('　').find(t => /7\/1/.test(t)) || '';
ok('🔴 古い記録は担当だけ（無いものを埋めない）',  /・佐藤$/.test(古い.trim()), 古い);
ok('再検にしても陸運局とRは残す（入れ直させない）', !!re.残った.office && re.残った.round === 4, re.残った);

console.log('\n■ JSエラー');
ok('画面のエラーなし', errs.length === 0, errs.slice(0, 3));

console.log('\n────────────  ' + pass + ' OK / ' + fail + ' NG  ────────────');
await b.close();
process.exit(fail ? 1 : 0);
