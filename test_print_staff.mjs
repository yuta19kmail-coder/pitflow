/* PitFlow v1.31.0 ── 表紙印刷の担当は「苗字だけ」（CoreMembers の呼び名／姓を優先）のテスト
   -------------------------------------------------------------------
   ◎考え方
     本体は動かさない。**state.js の本物の pitStaffPrintName** を node で直接動かし、
     さらに **cover-print.js が本当にそれを通しているか**をファイルの中身で見張る。
     ⚠ CoreMembers の姓（lastName）と呼び名（dispName）を state.staff に載せているのは
        members-pit.js。載せ忘れたら落ちるように、そこも見る。
   ◎使い方（PitFlow のフォルダで）
     node test_print_staff.mjs                                               */
import fs from 'fs';
import path from 'path';

const dir = process.cwd();
const read = f => fs.readFileSync(path.join(dir, 'js', f), 'utf8');
const stateSrc = read('state.js');

/* ---- state.js から名前まわりの関数だけ切り出す ---- */
const i = stateSrc.indexOf('function pitSurname(name){');
const j = stateSrc.indexOf('/* v0.85.0 受付タイプの表示ラベル');
if (i < 0 || j < 0 || j < i) throw new Error('state.js から名前まわりの関数を切り出せません（構成が変わった？）');
const CODE = stateSrc.slice(i, j);

/* ---- 名簿（本物と同じ形）----
   name     … 画面に出る名前（呼び名があれば呼び名／無ければ本名フル）
   lastName … CoreMembers の姓
   dispName … CoreMembers の呼び名（優先表示名） */
const STAFF = [
  { id:'p1', name:'チーフ',        realName:'小林 勇太',  lastName:'小林',   dispName:'チーフ' },
  { id:'p2', name:'山田 太郎',     realName:'山田 太郎',  lastName:'山田',   dispName:'' },
  { id:'p3', name:'佐々木 美和子', realName:'佐々木 美和子', lastName:'佐々木', dispName:'' },
  { id:'p4', name:'高橋 一郎',     realName:'高橋 一郎',  lastName:'',       dispName:'' },  /* 姓が未入力（古いデータ） */
  { id:'p5', name:'山田（太）',    realName:'山田 太一',  lastName:'山田',   dispName:'山田（太）' },
  { id:'pit_self', name:'小林モータース', realName:'小林モータース', lastName:'', dispName:'',
    aliases:['小林モータース株式会社','コバモ'] }
];
const win = {
  pitStaffAny: n => STAFF.find(s => s.name === n || (s.aliases || []).indexOf(n) >= 0) || null
};
const N = new Function('window', 'pitStaffAny', CODE + '\nreturn { pitSurname, pitStaffPrintName };')(win, win.pitStaffAny);

let ok = 0, ng = 0;
function eq(label, got, want){
  if (got === want) { ok++; console.log('  ✅ ' + label + '  → 「' + got + '」'); }
  else { ng++; console.log('  ❌ ' + label + '\n        期待: 「' + want + '」\n        実際: 「' + got + '」'); }
}
function yes(label, cond){ if (cond) { ok++; console.log('  ✅ ' + label); } else { ng++; console.log('  ❌ ' + label); } }

console.log('\n── ① CoreMembers の呼び名（表示名）がいちばん強い ──');
eq('呼び名あり＝呼び名',        N.pitStaffPrintName('チーフ'), 'チーフ');
eq('呼び名が「山田（太）」',    N.pitStaffPrintName('山田（太）'), '山田（太）');

console.log('\n── ② 呼び名が無ければ CoreMembers の姓 ──');
eq('山田 太郎 → 山田',          N.pitStaffPrintName('山田 太郎'), '山田');
eq('佐々木 美和子 → 佐々木',    N.pitStaffPrintName('佐々木 美和子'), '佐々木');

console.log('\n── ③ どちらも無ければ、入っている名前の先頭（＝苗字） ──');
eq('姓が未入力でも苗字だけ',    N.pitStaffPrintName('高橋 一郎'), '高橋');

console.log('\n── ④ 名簿に居ない人でも空欄にしない ──');
eq('退職者・整備ソフト由来',    N.pitStaffPrintName('退職 花子'), '退職');
eq('もともと苗字だけ',          N.pitStaffPrintName('椎名'), '椎名');
eq('空は空',                    N.pitStaffPrintName(''), '');
eq('null でも落ちない',         N.pitStaffPrintName(null), '');
eq('前後の空白は落とす',        N.pitStaffPrintName('  山田 太郎  '), '山田');

console.log('\n── ⑤ 自社・法人はそのまま（苗字に切らない） ──');
eq('自社（小林モータース）',    N.pitStaffPrintName('小林モータース'), '小林モータース');
/* 別名（株式会社つき）で呼ばれても、名簿の自社に当たるので短いほうで出る */
eq('別名（株式会社つき）でも自社に当たる', N.pitStaffPrintName('小林モータース株式会社'), '小林モータース');
/* 名簿に無い法人名は、苗字に切らずフル（略記）で出す＝外注先などを担当欄に書いた時 */
eq('名簿に無い法人はフル（略記）', N.pitStaffPrintName('○○自動車株式会社'), '○○自動車㈱');

console.log('\n── ⑥ 本体との食い違い（配線チェック） ──');
const cov = read('cover-print.js');
const mem = read('members-pit.js');
yes('cover-print.js のフロント担当が pitStaffPrintName を通している',
    /front:\s*\(window\.pitStaffPrintName \? pitStaffPrintName\(c\.frontStaff\)/.test(cov));
yes('cover-print.js の予約担当が pitStaffPrintName を通している',
    /resStaff:\s*\(window\.pitStaffPrintName \? pitStaffPrintName\(c\.reserveStaff\)/.test(cov));
yes('members-pit.js が CoreMembers の姓（lastName）を state.staff に載せている',
    /lastName:\s*String\(cm\.lastName \|\| ''\)\.trim\(\)/.test(mem));
yes('members-pit.js が CoreMembers の呼び名（dispName）も載せている',
    /dispName:\s*String\(cm\.dispName \|\| ''\)\.trim\(\)/.test(mem));
yes('退職者にも姓・呼び名が載っている（表紙に退職者が残ることがある）',
    (mem.match(/lastName:\s*String\(cm\.lastName/g) || []).length >= 2);
yes('state.js が pitStaffPrintName を公開している', /window\.pitStaffPrintName\s*=/.test(stateSrc));
yes('画面側の表示（pitSurname / pitCustSurname）は残っている＝印刷だけの話',
    /window\.pitSurname\s*=/.test(stateSrc) && /window\.pitCustSurname\s*=/.test(stateSrc));

console.log('\n===== ' + ok + ' OK / ' + ng + ' NG =====');
process.exit(ng ? 1 : 0);
