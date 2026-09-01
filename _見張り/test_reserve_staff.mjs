/* PitFlow v1.24.0 ── 新規予約「予約担当」の候補のテスト
   -------------------------------------------------------------------
   ◎考え方
     本体は動かさない。**card-detail.js から切り出した本物の staffSelect /
     _staffInDiv / _staffDivision / _syncStaffToDivision** をそのまま node で動かし、
     出てくる <option> の顔ぶれを確かめる。
     ⚠ 関数名や絞り込みの条件が変わるとここが落ちる＝仕様が崩れたと気づける。
   ◎使い方（PitFlow のフォルダで）
     node test_reserve_staff.mjs                                            */
import fs from 'fs';
import path from 'path';

const dir = process.cwd();
const src = fs.readFileSync(path.join(dir, 'js', 'card-detail.js'), 'utf8');

/* ---- 必要な関数だけ切り出す ---- */
function cut(startMark, endMark, label){
  const i = src.indexOf(startMark);
  const j = src.indexOf(endMark, i + 1);
  if (i < 0 || j < 0 || j < i) throw new Error('card-detail.js から ' + label + ' を切り出せません（構成が変わった？）');
  return src.slice(i, j);
}
const code = cut('function staffSelect(c, key){', '/* ===== 内容セクションのテンプレ', 'staffSelect一式');

const sandbox = {};
const factory = new Function('state', 'window', 'pitStaffAny', 'pitStaffByName',
  code + '\nreturn { staffSelect, _staffInDiv, _staffDivision, _syncStaffToDivision };');

/* ---- 名簿（PitFlow の state.staff と同じ形） ----
   front=フロント / reception=受付（＝予約担当） / mech=メカ
   divisions=CoreMembers の部署から作られる（div1=1課 / div2=2課 / recept=受付課 / other=その他）*/
const STAFF = [
  { id:'m1', name:'1課フロント',      divisions:['div1'],        front:true,  reception:false, mech:false },
  { id:'m2', name:'1課フロント受付',  divisions:['div1'],        front:true,  reception:true,  mech:false },
  { id:'m3', name:'1課受付のみ',      divisions:['div1'],        front:false, reception:true,  mech:false },
  { id:'m4', name:'2課フロント',      divisions:['div2'],        front:true,  reception:false, mech:false },
  { id:'m5', name:'2課受付のみ',      divisions:['div2'],        front:false, reception:true,  mech:false },
  { id:'m6', name:'受付課の人',       divisions:['recept'],      front:false, reception:true,  mech:false },
  { id:'m7', name:'その他の人',       divisions:['other'],       front:false, reception:true,  mech:false },
  { id:'m8', name:'兼任フロント',     divisions:['div1','div2'], front:true,  reception:true,  mech:false },
  { id:'m9', name:'1課メカのみ',      divisions:['div1'],        front:false, reception:false, mech:true  },
  { id:'m10',name:'2課メカのみ',      divisions:['div2'],        front:false, reception:false, mech:true  }
];

const state = { staff: STAFF };
const win = {
  pitStaffAny: n => STAFF.find(s => s.name === n) || null,
  pitStaffByName: n => STAFF.find(s => s.name === n) || null
};
const F = factory(state, win, win.pitStaffAny, win.pitStaffByName);

/* ---- 判定の道具 ---- */
let ok = 0, ng = 0;
function opts(html){
  return [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)]
    .map(m => m[2]).filter(x => x !== '―');
}
function eq(label, got, want){
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { ok++; console.log('  OK  ' + label); }
  else { ng++; console.log('  NG  ' + label + '\n        期待: ' + b + '\n        実際: ' + a); }
}
function has(label, html, name, want){
  const got = opts(html).indexOf(name) >= 0;
  if (got === want) { ok++; console.log('  OK  ' + label); }
  else { ng++; console.log('  NG  ' + label + '（' + name + ' が ' + (want ? '出ない' : '出てしまう') + '）'); }
}

const RCV_ALL = ['1課フロント受付','1課受付のみ','2課受付のみ','受付課の人','その他の人','兼任フロント'];

console.log('\n■ 予約担当＝「受付」チェックの人が、課に関係なく全員出る（v1.24.0 の本題）');
eq('課なし',   opts(F.staffSelect({ division:''     }, 'reserveStaff')), RCV_ALL);
eq('1課を選択', opts(F.staffSelect({ division:'div1' }, 'reserveStaff')), RCV_ALL);
eq('2課を選択', opts(F.staffSelect({ division:'div2' }, 'reserveStaff')), RCV_ALL);

console.log('\n■ 予約担当に出てはいけない人');
[['div1'],['div2'],['']].forEach(d => {
  const h = F.staffSelect({ division:d[0] }, 'reserveStaff');
  has('受付チェック無しのフロントは出ない（課=' + (d[0]||'なし') + '）', h, '1課フロント', false);
  has('メカだけの人は出ない（課=' + (d[0]||'なし') + '）',              h, '1課メカのみ', false);
  has('2課フロント（受付なし）も出ない（課=' + (d[0]||'なし') + '）',   h, '2課フロント', false);
});

console.log('\n■ 課をまたいだ人がちゃんと出る（今回いちばん直したかった所）');
has('1課を選んでも2課の受付が出る', F.staffSelect({ division:'div1' }, 'reserveStaff'), '2課受付のみ', true);
has('2課を選んでも1課の受付が出る', F.staffSelect({ division:'div2' }, 'reserveStaff'), '1課受付のみ', true);
has('受付課の人はどの課でも出る',   F.staffSelect({ division:'div2' }, 'reserveStaff'), '受付課の人', true);

console.log('\n■ フロント担当は今までどおり（課で絞る・フロントだけ）＝退行していないこと');
eq('フロント／1課', opts(F.staffSelect({ division:'div1' }, 'frontStaff')), ['1課フロント','1課フロント受付','兼任フロント']);
eq('フロント／2課', opts(F.staffSelect({ division:'div2' }, 'frontStaff')), ['2課フロント','兼任フロント']);
eq('フロント／課なし', opts(F.staffSelect({ division:'' }, 'frontStaff')), ['1課フロント','1課フロント受付','2課フロント','兼任フロント']);

console.log('\n■ 完TEL担当は今までどおり（課で絞る・受付＋フロント）＝退行していないこと');
eq('完TEL／1課', opts(F.staffSelect({ division:'div1' }, 'completeCallStaff')),
   ['1課フロント','1課フロント受付','1課受付のみ','受付課の人','その他の人','兼任フロント']);
eq('完TEL／2課', opts(F.staffSelect({ division:'div2' }, 'completeCallStaff')),
   ['2課フロント','2課受付のみ','受付課の人','その他の人','兼任フロント']);

console.log('\n■ いま入っている担当は、候補に居なくても消えない（v1.8.0 の保険）');
{
  const h = F.staffSelect({ division:'div1', reserveStaff:'1課メカのみ' }, 'reserveStaff');
  has('候補外でも選択肢に残る', h, '1課メカのみ', true);
  eq('選ばれたままになっている', /value="1課メカのみ" selected/.test(h), true);
}
{
  const h = F.staffSelect({ division:'div1', reserveStaff:'辞めた人' }, 'reserveStaff');
  eq('名簿に無い人は（名簿外）付きで残る', /辞めた人（名簿外）/.test(h), true);
}

console.log('\n■ 課を切り替えても予約担当は消えない（フロントだけ消える）');
{
  const c = { division:'div2', frontStaff:'1課フロント', reserveStaff:'1課受付のみ' };
  F._syncStaffToDivision(c);
  eq('別の課のフロントは消える',   c.frontStaff, '');
  eq('別の課の予約担当は残る',     c.reserveStaff, '1課受付のみ');
}
{
  const c = { division:'div1', frontStaff:'1課フロント', reserveStaff:'2課受付のみ' };
  F._syncStaffToDivision(c);
  eq('同じ課のフロントは残る',     c.frontStaff, '1課フロント');
  eq('2課の予約担当も残る',        c.reserveStaff, '2課受付のみ');
}

console.log('\n■ 予約担当を選んでも課は勝手に動かない（v1.24.0）');
eq('_syncStaffToDivision が見るのは frontStaff だけ',
   /\['frontStaff'\]\.forEach/.test(src), true);
eq('担当→課の自動セットは frontStaff だけ',
   /if \(key === 'frontStaff' && v\) \{/.test(src), true);

console.log('\n────────────────────────────');
console.log(ok + ' OK / ' + ng + ' NG');
process.exit(ng ? 1 : 0);
