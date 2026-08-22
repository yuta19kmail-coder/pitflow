/* PitFlow v1.175.0 ── 📮 予定依頼（カード詳細の付箋の隣）の見張り
   ===================================================================
   ◎なぜ要るか（2026-08-22・ゆうた指定）
     🗣「PitFlow の方にも、予定依頼を搭載。**各カード詳細の付箋発行ボタンの隣**に搭載。
     　　**客名・車種・作業タイプ・担当者 が入った状態で開いて**、
     　　そこからその車両で依頼を投げられる感じを想定」

   ◎いちばん怖いこと ＝ **窓が2本になること**
     出す口が MHS（上のボタン）と PitFlow（カード詳細）の2つになった。
     欄・言葉・保存する形を PitFlow 側に書き写すと、**片方だけ直る事故**が始まる
     （付箋がそれで3本コピペになり、3つともバラバラだった＝2026-08-18 の反省）。
     🔴 だから **共通部品（_shared / coreflow-req.js）1本**にしてある。ここを毎回数える。

   ◎2つめに怖いこと ＝ **PitFlow が「日を決める」側に回ること**
     PitFlow は **書くだけ**。日・時間・担当を決めるのは MHS 1本。
     ＝ 依頼を保存するのは `scheduleEvents` だけで、`pitCards` には1文字も書かない。

   ◎使い方（PitFlow のフォルダで・ブラウザもサーバも要らない）
     node test_req_pit.mjs
   =================================================================== */
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };
const eq = (n, got, want) => ok(n, JSON.stringify(got) === JSON.stringify(want), { got, want });

const REQJS  = fs.readFileSync('js/coreflow-req.js', 'utf8');
const PITJS  = fs.readFileSync('js/req-pit.js', 'utf8');
const CARDV  = fs.readFileSync('js/card-view.js', 'utf8');
const HTML   = fs.readFileSync('index.html', 'utf8');
const ERRJS  = fs.readFileSync('js/errcode-pit.js', 'utf8');
const MEMJS  = fs.readFileSync('js/members-pit.js', 'utf8');
/* 注釈は「なぜそうしたか」を書く所。数えるのは中身だけ */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ══════════════════════════════════════════════
   Ⅰ 共通部品そのもの（node だけで動く＝画面が無くても答えは同じ）
   ══════════════════════════════════════════════ */
console.log('\n── ① 共通部品は画面が無くても動く ──');
const W = { };
new Function('window', REQJS.replace('typeof globalThis !== \'undefined\' ? globalThis : this', 'window'))(W);
const CFReq = W.CFReq;
ok('CFReq がある', !!CFReq);
eq('いつまでに＝4つ', CFReq.DUE.map(a => a[1]), ['いつでも', '今週中', '今月中', 'この日まで']);
eq('どれくらい＝5つ（🔴 泊まりは作らない・ゆうた指定）', CFReq.LEN.map(a => a[1]), ['30分', '1〜2時間', '半日', '1日', 'わからない']);
eq('急ぎ＝3つ', CFReq.URG.map(a => a[1]), ['ふつう', '早めに', '急ぎ']);
eq('🔴 メンバー候補＝ゆうたが挙げた4つ', CFReq.WHO.map(a => a[1]),
   ['自分が行く', '自部署をメインに', '別部署にお願いしたい', '未定']);
eq('期限の言い方', CFReq.dueLabel({ reqDue: 'date', reqDueDate: '2026-08-26' }), '08/26まで');
eq('自部署は部署名で言い換える', CFReq.whoLabel({ reqWho: 'ownDept', reqDeptName: '整備' }), '整備をメインに');

console.log('\n── ② 車の1行＝客名・車種・作業タイプ・担当者（ゆうたが挙げた4つ）──');
const CAR = { id: 'C1', resNo: 'R-1234', cust: '田中', model: 'ハイエース', work: '車検＋オイル', staff: '椎名 祐太' };
eq('4つがこの順で並ぶ', CFReq.carLine({ reqCar: CAR }), '田中様　ハイエース　車検＋オイル　担当 椎名 祐太');
eq('抜けている所は詰める', CFReq.carLine({ reqCar: { cust: '田中', model: '', work: '', staff: '' } }), '田中様');
eq('車が無ければ空', CFReq.carLine({}), '');
eq('車から出したかどうか', [CFReq.hasCar({ reqCar: CAR }), CFReq.hasCar({})], [true, false]);

console.log('\n── ③ 保存する形は共通部品1本 ──');
CFReq.start({ car: CAR, deptName: '整備' });
CFReq.state().title = 'この車を熊谷の陸運へ回送したい';
CFReq.state().memo = '帰りの足だけ誰か。';
CFReq.state().reqWho = 'self';
const b = CFReq.build({ createdByUid: 'u1', createdByMemberId: 'cm1', createdByName: '椎名', today: '2026-08-22', from: 'pitflow', now: 1, rand: 0.5 });
ok('作れた', !b.err, b);
eq('🔴🔴 req の札が立っている（＝予定表に出ない）', b.doc.req, true);
eq('状態は「出したまま」', b.doc.reqStatus, 'open');
eq('🔴 日付は空（決めるのは MHS）', b.doc.date, '');
eq('🔴 どのアプリから出たかが残る', b.doc.reqFrom, 'pitflow');
eq('🔴 車の札がそのまま乗る', b.doc.reqCar, CAR);
eq('ひとことは社内予定の「補足メモ」に入る', b.doc.memo, '帰りの足だけ誰か。');
eq('「自分が行く」なら担当の下書きに自分が入る', b.doc.who, ['cm1']);
eq('やりとりの記録が始まっている', b.doc.reqLog.length, 1);

console.log('\n── ④ 足りない時は「どこが足りないか」だけ返す（番号は各アプリの台帳）──');
CFReq.start({});
eq('用件が空', CFReq.check().err, 'title');
CFReq.state().title = 'x'; CFReq.state().reqDue = 'date';
eq('「この日まで」なのに日付が空', CFReq.check().err, 'date');
CFReq.state().reqDueDate = '2026-08-26';
eq('そろえば通る', CFReq.check().err, '');
ok('🧭 共通部品にエラー番号を書いていない', strip(REQJS).indexOf('PF-') < 0 && strip(REQJS).indexOf('MH-') < 0);
ok('🧭 共通部品に「予定表に出す／出さない」を書いていない（判定は MHS の mhsHidden 1本）',
   strip(REQJS).indexOf('mhsHidden') < 0 && strip(REQJS).indexOf('draft') < 0);

/* ══════════════════════════════════════════════
   Ⅱ PitFlow 側（入口と、書く先）
   ══════════════════════════════════════════════ */
console.log('\n── ⑤ 入口は「付箋発行の隣」──');
const iFusen = CARDV.indexOf('cvToggleFusen(event)');
const iReq   = CARDV.indexOf('pitReqOpen(');
ok('🔴 付箋の隣にボタンがある', iFusen > 0 && iReq > iFusen, { iFusen, iReq });
ok('🔴 付箋とボタンの間に他のボタンが入っていない（＝ほんとうに隣）',
   iReq > 0 && CARDV.slice(iFusen, iReq).split('cv-iconbtn').length === 2,
   CARDV.slice(iFusen, iReq).length);
ok('その車の番号を渡している', /pitReqOpen\(\\'\'\+c\.id\+\'\\'\)/.test(CARDV));
ok('🔴 絵文字ではなく線画SVG', /data-ic=send/.test(CARDV.slice(iFusen, iReq + 300)));

console.log('\n── ⑥ 窓の中身は共通部品（PitFlow に書き写していない）──');
ok('🔴 CFReq に描かせている', PITJS.indexOf('CFReq.mount(') >= 0 && PITJS.indexOf('CFReq.bodyHTML') < 0);
ok('🔴 保存する形も CFReq.build', PITJS.indexOf('CFReq.build(') >= 0);
ok('🔴🔴 選べるものの表を PitFlow に写していない',
   PITJS.indexOf('今週中') < 0 && PITJS.indexOf('自分が行く') < 0 && PITJS.indexOf('わからない') < 0);
ok('🔴 「いつまでに」「メンバー候補」などの欄も PitFlow に書いていない',
   PITJS.indexOf('<label>') < 0 && PITJS.indexOf('seg-pick') < 0);
ok('coreflow-req.js を index.html で読んでいる', HTML.indexOf('js/coreflow-req.js') >= 0);
ok('coreflow-req.css を index.html で読んでいる', HTML.indexOf('css/coreflow-req.css') >= 0);
ok('🔴 req-pit.js は coreflow-req.js より後ろで読む',
   HTML.indexOf('js/coreflow-req.js') < HTML.indexOf('js/req-pit.js'));

console.log('\n── ⑦ 車から拾うものは PitFlow の物差しから借りる（写しを作らない）──');
ok('🔴 客名は pitCustName', PITJS.indexOf('pitCustName') >= 0);
ok('🔴 車種は pitCarLabel', PITJS.indexOf('pitCarLabel') >= 0);
ok('🔴 担当者は pitStaffFull（フルネームの物差し）', PITJS.indexOf('pitStaffFull') >= 0);
ok('🔴 作業タイプの名前は state.workTypes から', PITJS.indexOf('state.workTypes') >= 0);
ok('🧭 お客様名を自分で組み立てていない（規則②）',
   PITJS.indexOf('c.customer ||') < 0 || PITJS.indexOf('pitCustName') >= 0);
ok('🔴 場所は CoreMembers の場所マスター（PitFlow では作らない）',
   PITJS.indexOf('pitLocList') >= 0 && MEMJS.indexOf('window.pitLocList') >= 0);

console.log('\n── ⑧ 書く先（🔴 PitFlow は「書くだけ」）──');
ok('🔴🔴 scheduleEvents に書いている（MHS と同じ入れ物）', PITJS.indexOf("collection('scheduleEvents')") >= 0);
ok('🔴🔴 pitCards には1文字も書いていない', strip(PITJS).indexOf('pitCards') < 0);
ok('🔴 PitFlow 側の保存（save / db-pit）を呼んでいない',
   !/[^a-zA-Z]save\(\)/.test(strip(PITJS)) && strip(PITJS).indexOf('PitDB') < 0);
ok('🔴 日・時間・担当を決める処理を持っていない（決めるのは MHS 1本）',
   PITJS.indexOf('reqStatus') < 0 && PITJS.indexOf("'done'") < 0 && PITJS.indexOf('予定にする') < 0);
ok('⚠ この端末だけのモードでは出さずに、その旨を言う', PITJS.indexOf('fb.cloud') >= 0 && PITJS.indexOf('PF-0063') >= 0);
ok('⚠ 保存に失敗したら黙って捨てない', PITJS.indexOf('.catch(') >= 0 && PITJS.indexOf('PF-0064') >= 0);

console.log('\n── ⑨ エラー番号は台帳にある（1アプリ1台帳）──');
['PF-0060', 'PF-0061', 'PF-0062', 'PF-0063', 'PF-0064'].forEach(function (c) {
  ok(c + ' が台帳にある', ERRJS.indexOf("['" + c + "'") >= 0);
  ok(c + ' が実際に使われている', PITJS.indexOf(c) >= 0);
});

console.log('\n── ⑩ 絵文字を画面に書いていない（線画SVG・ゆうた指定）──');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23F0}-\u{23FF}]/u;
const dirty = strip(PITJS).split('\n').filter(l => EMOJI.test(l));
ok('🔴 req-pit.js の中身に絵文字が1つも無い', dirty.length === 0, dirty.slice(0, 3));
const dirty2 = strip(REQJS).split('\n').filter(l => EMOJI.test(l));
ok('🔴 共通部品の中身にも絵文字が1つも無い', dirty2.length === 0, dirty2.slice(0, 3));

console.log('\n── ⑪ 共通部品は _shared の写しと同じか（本体はあちら）──');
let sharedSame = 'skip';
try {
  const A = fs.readFileSync('../../_shared/coreflow-req.js', 'utf8');
  sharedSame = (A === REQJS);
} catch (e) { sharedSame = 'skip'; }
if (sharedSame === 'skip') console.log('  ⏭ _shared が見えないので飛ばす（配布前の環境）');
else ok('🔴 _shared と1文字も違わない（直す時は _shared → sync-shared.ps1）', sharedSame === true);

console.log(`\n════ ${pass} OK / ${fail} NG ════\n`);
process.exit(fail ? 1 : 0);
