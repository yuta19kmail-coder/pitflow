/* =====================================================================
   PitFlow ── 「一瞬だけ写しから」では全部を読み直さない（v2.185.0・棚卸し A-01 の PitFlow の写し）
   ---------------------------------------------------------------------
   ◎前の形：つながりの見張り（db-pit.js の _watchLink）が、線の張り直しで起きる
     「1秒だけ写しから（fromCache）」でも「読み直しが要る」の印を立て、戻るたびに全部を読み直していた
   ◎いま：印は猶予（8秒）を過ぎて本当に「届いていません」と言った時だけ立てる
   ◎見張るもの
     ① 猶予より短い切れ目では、帯も出さず、読み直しもしない
     ② 猶予を過ぎた切れ目では、戻った時に1回だけ読み直す
   使い方：node _見張り/test_link_resync.mjs（直す前の版で赤を見る＝PIT_DB_SRC=<古い db-pit.js>）
   ===================================================================== */
import { makeCloud, boot, 待つ } from './_pit_cloud2.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + JSON.stringify(x) : '')); } };

const cloud = makeCloud({ data: { pitCards: [{ id: 'c1', resNo: 'A1' }] } });
const T = boot(cloud);
T.D.connectCloud({}, {}); await 待つ(40);
T.D._OFF_WAIT = 60;                         /* 8秒の猶予を、見張りの中だけ 60ms に縮める */
let 読み直し = 0;
const 本物 = T.D._resync.bind(T.D);
T.D._resync = function () { 読み直し++; return 本物(); };
const 印 = (fromCache) => T.dev.linkCb({ exists: true, data: () => ({}), metadata: { fromCache } });

console.log('\n── ① 一瞬（猶予より短い）の切れ目 ──');
印(true); await 待つ(20); 印(false); await 待つ(100);
ok('🔴 読み直さない', 読み直し === 0, 読み直し);
ok('帯も出していない（つながっているまま）', T.D._link === true, T.D._link);

console.log('\n── ② 猶予を過ぎた切れ目 ──');
印(true); await 待つ(120);
ok('「つながっていません」と言う', T.D._link === false, T.D._link);
印(false); await 待つ(60);
ok('🔴 戻ったら1回だけ読み直す', 読み直し === 1, 読み直し);
印(false); await 待つ(30);
ok('もう一度届いても読み直さない', 読み直し === 1, 読み直し);

console.log('\n' + (fail ? '  ❌ ' + fail + '件 赤／' + pass + '件 緑' : '  ✅ 全部そろっています（' + pass + '件）'));
process.exit(fail ? 1 : 0);
