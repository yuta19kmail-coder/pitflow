// ============================================================
// test_visit_attr.mjs ― 売上ビュー「来店属性」タブの見張り
//   PitFlow v2.59.0 ／ ゆうた指定 2026-09-04
//
//   🗣「売上に新規ビューを追加。7ページ目の資料をカウントしてビューとしてまとめてほしい」
//     （手で作っていた Excel「2026 来店属性集計」を実データから出す）
//   🗣（判定）「お客様単位の過去来店」
//   🗣（区分）「車検点検＋その他を一般に全部よせる（総計数を伝票数と合わせるイメージ）」
//   🗣（数える日）「実績の日（返車）」／（クォーター）「作る」
//
//   ここで固めている決めごと
//     🔴 数える集合は実績カレンダーの「数える側」と同じ（実績カウント日・売上なしは外す）
//        ＝ **総計が伝票の数と合う**。ここがズレたら表全体の意味が無くなる
//     🔴 車検・点検＝車検か12点が入っているもの。**それ以外はぜんぶ一般**（取りこぼしを作らない）
//     🔴 リピーター＝その実績日より前に、同じお客様の来店があるもの（過去の取り込み伝票も含む）
//        ⚠ 同じ日の2台目は「前の日が無い」ので、どちらも一見
//     🔴 カードの「初回／リピーター」の札は見ない。ただし**食い違った数は出す**
//     🔴 クォーター＝1〜7／8〜15／16〜23／24〜末
//
//   使い方（サーバーもブラウザも要らない）
//     node _見張り/test_visit_attr.mjs
//     node _見張り/test_visit_attr.mjs --break=1 … 売上なしも数える     → ①が赤
//     node _見張り/test_visit_attr.mjs --break=2 … B.Pを一般に入れない  → ②が赤
//     node _見張り/test_visit_attr.mjs --break=3 … 同じ日も過去扱い     → ③が赤
//     node _見張り/test_visit_attr.mjs --break=4 … 札で判定してしまう   → ③が赤
//     node _見張り/test_visit_attr.mjs --break=5 … スライドを週にも入れる → ⑤が赤
//     node _見張り/test_visit_attr.mjs --break=6 … 無い関数を呼ぶ         → ⑦が赤
// ============================================================
import fs from 'fs';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== undefined ? '\n       → ' + JSON.stringify(x) : '')); }
};
const JS = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');

function bend(src) {
  if (BREAK === '1') return src.replace('return !noSale(c);', 'return true;');
  if (BREAK === '2') return src.replace("if (ids[i]==='shaken' || ids[i]==='12pt') return true;",
                                        "if (ids[i]!=='general' && ids[i]!=='oil') return true;");
  if (BREAK === '3') return src.replace('if(a[i] < d) return true;', 'if(a[i] <= d) return true;');
  if (BREAK === '4') return src.replace('put(b, c, isRepeater(c, dates));', "put(b, c, c.repeat==='repeater');");
  if (BREAK === '5') return src.replace('if(isSlide(c)){ put(qs[0].b, c, rep); return; }', 'if(isSlide(c)){ put(qs[0].b, c, rep); }');
  return src;
}

const box = {};
box.window = box; box.globalThis = box; box.console = console;
vm.createContext(box);
vm.runInContext(JS('pit-share.js'), box);
box.PitShare.use({ divisions: () => [], estAmount: () => 0, teamKey: () => 'default' });

let seq = 0;
const card = (o) => Object.assign({
  id: 'c' + (++seq), status: 'returned', boardId: 'default', workTypes: ['general'], repeat: 'first'
}, o);

/* お客様A＝2月と5月に来ている（5月ぶんがリピーター）
   お客様B＝5月に初来店（一見）／同じ日に2台目も来ている（どちらも一見）
   お客様C＝輸入・車検で5月（一見）
   D＝売上なし（社内車両）＝数えない
   E＝まだ返していない＝数えない */
box.state = { cards: [
  card({ customerId:'A', customer:'相田', completedAt:'2026-02-10', workTypes:['shaken'], repeat:'first' }),
  card({ customerId:'A', customer:'相田', completedAt:'2026-05-12', workTypes:['oil'],    repeat:'repeater' }),
  card({ customerId:'B', customer:'井上', completedAt:'2026-05-14', workTypes:['general'],repeat:'first' }),
  /* ⚠ 2台目は受付が「リピーター」の札を付けてしまっている＝**札と来店履歴が食い違う例** */
  card({ customerId:'B', customer:'井上', completedAt:'2026-05-14', workTypes:['bp'],     repeat:'repeater' }),
  /* 🔴 上野様＝**売上日が4月**なのに返車が5/20＝スライド（5月に作った仕事ではない） */
  card({ customerId:'C', customer:'上野', completedAt:'2026-05-20', salesDate:'2026-04-28', workTypes:['shaken'], boardId:'import', repeat:'first' }),
  card({ customerId:'D', customer:'江川', completedAt:'2026-05-21', workTypes:['12pt'],   noSale:true }),
  card({ customerId:'E', customer:'尾形', completedAt:'', status:'work', workTypes:['shaken'] }),
  /* 月をまたいだ確認＝1月にも1台（車検・一見） */
  card({ customerId:'F', customer:'加藤', completedAt:'2026-01-09', workTypes:['shaken'], repeat:'first' })
]};

/* 💴 売上日の物差し（スライドの判定に要る）。⚠ 本物を読ませる＝写しを作らない */
vm.runInContext(JS('sales-date.js'), box);
vm.runInContext(bend(JS('sales-visit.js')), box);
const may = box.pitVisitCollect('2026-05-01', '2026-05-31');

console.log('── ① 数える集合＝伝票と同じ ──');
ok('5月は4台（売上なしと未返車は入らない）', may.all === 4, may.all);
ok('売上なし（社内車両）は数えない', may.all === 4 && may.insp.rep + may.insp.first === 1, { insp: may.insp });
ok('まだ返していない車は数えない', may.all === 4);

console.log('── ② 区分＝車検・点検 と 一般だけ ──');
ok('車検・点検は1台（上野様の車検）', may.insp.rep + may.insp.first === 1, may.insp);
ok('B.P も オイル も 一般に寄る（3台）', may.gen.rep + may.gen.first === 3, may.gen);
ok('車検・点検＋一般＝合計（取りこぼし無し）',
   (may.insp.rep + may.insp.first) + (may.gen.rep + may.gen.first) === may.all);

console.log('── ③ リピーターの決め方 ──');
ok('前に来ているお客様はリピーター（1台）', may.gen.rep === 1, may.gen);
ok('同じ日の2台目も「一見」（前の日が無い）', may.gen.first === 2, may.gen);
ok('初来店は一見', may.insp.first === 1, may.insp);
ok('🔴 札で判定していない（食い違いは1件と数えるだけ）', may.mismatch === 1, may.mismatch);

console.log('── ④ 国産・輸入 ──');
ok('スライドは1台（売上日が4月・返車が5月）', may.slide === 1, may.slide);
ok('売上日が同じ月ならスライドではない', may.all === 4 && may.slide === 1);
ok('国産3台・輸入1台', may.dom === 3 && may.imp === 1, { dom: may.dom, imp: may.imp });

console.log('── ⑤ 年度（12月〜翌11月）とクォーター ──');
const yr = box.pitVisitCollectYear(2026);
ok('12か月ぶんの列がある', yr.slots.length === 12, yr.slots.length);
ok('先頭は昨12月', yr.slots[0].label === '昨12月', yr.slots[0].label);
ok('1月に1台・5月に4台', yr.slots[1].b.all === 1 && yr.slots[5].b.all === 4,
   yr.slots.map(s => s.label + ':' + s.b.all));
ok('年度の合計は6台（1月1・2月1・5月4）', yr.total.all === 6, yr.total.all);
const qs = box.pitVisitQuarters(2026, 4);
ok('列はスライド＋4つ', qs.length === 5, qs.length);
ok('区切りは 1〜7／8〜15／16〜23／24〜末',
   qs[1].to.endsWith('-07') && qs[2].to.endsWith('-15') && qs[3].to.endsWith('-23') && qs[4].to.endsWith('-31'),
   qs.slice(1).map(q => q.from + '〜' + q.to));
ok('先頭がスライドの列', qs[0].label === 'スライド' && qs[0].b.all === 1, qs[0].label + ':' + qs[0].b.all);
ok('🔴 スライドは週の枠に入れない（2/4に3台・3/4は0台）',
   qs[2].b.all === 3 && qs[3].b.all === 0, qs.map(q => q.label + ':' + q.b.all));
ok('スライド＋4つの枠＝その月の合計',
   qs.reduce((a, q) => a + q.b.all, 0) === may.all, qs.map(q => q.b.all));

console.log('── ⑥ 画面に出るもの ──');
{
  const wrap = { innerHTML: '' };
  box.pitVisitMonth(wrap, '<i>head</i>', 2026, 4);
  const H = wrap.innerHTML;
  ok('元の表と同じ行が並ぶ',
     H.indexOf('車検・点検　リピーター') > 0 && H.indexOf('IR率　リピーター') > 0 && H.indexOf('KY率　国産率') > 0);
  ok('クォーター結果の表が出る', H.indexOf('クォーター結果') > 0 && H.indexOf('1/4') > 0);
  ok('スライドの列と行が出る', H.indexOf('>スライド<') > 0 && H.indexOf('うちスライド（先月売上・今月返車）') > 0);
  ok('スライドが何かを下に書いてある', H.indexOf('この月に作った仕事ではない') > 0);
  ok('比率は色だけでなく名前と台数と％も出す',
     /リピーター <b>1<\/b>台 25%/.test(H) && /一見 <b>3<\/b>台 75%/.test(H), H.indexOf('リピーター <b>'));
  ok('何を数えたかが下に書いてある', H.indexOf('伝票の数') > 0 && H.indexOf('実績カウント日') > 0);
  const wrap2 = { innerHTML: '' };
  box.pitVisitYear(wrap2, '<i>head</i>', 2026);
  ok('年度は月の列で出る', wrap2.innerHTML.indexOf('昨12月') > 0 && wrap2.innerHTML.indexOf('来店属性集計') > 0);
}

console.log('── ⑦ 売上ビューへのつなぎ ──');
{
  const sv = JS('sales.js');
  ok('タブに「来店属性」がある', /\['visit','来店属性'\]/.test(sv));
  /* 🔴🔴 2026-09-04 の反省＝**文字だけ見ていたので「無い関数を呼んでいる」を拾えなかった。**
     期間の帯を `head()` という**存在しない名前**で呼んでいて、タブを押しても何も起きない状態で出した。
     ＝ ここでは「呼んでいる名前が、そのファイルに本当にあるか」まで見る。 */
  var branch = sv.slice(sv.indexOf("if(tab==='visit'){"), sv.indexOf("if(tab==='quarter')"));
  /* ⚠ コメントの中の言葉は数えない（説明で書いた名前を「呼んでいる」と読み違えるため） */
  branch = branch.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  if (BREAK === '6') branch = branch.replace(/header\(/g, 'head(');
  var calls = (branch.match(/(?:^|[^\w.$])([a-zA-Z_$][\w$]*)\s*\(/g) || [])
    .map(function(x){ return x.replace(/[^\w$]/g, ''); })
    .filter(function(n2){ return ['if','return','function','var','typeof','new'].indexOf(n2) < 0 && n2.indexOf('pitVisit') !== 0; });
  var missing = calls.filter(function(n2){
    return sv.indexOf('function ' + n2 + '(') < 0 && sv.indexOf('window.' + n2 + ' =') < 0 && !global[n2];
  });
  ok('🔴 呼んでいる関数が本当にある（無い名前を呼んでいない）', missing.length === 0, missing);
  ok('期間の帯は売上ビューが作って渡す',
     /pitVisitYear\(wrap, vHead/.test(sv) && /pitVisitMonth\(wrap, vHead/.test(sv) && /header\('year'/.test(branch));
  ok('🔴 PDFも来店属性の紙になる（売上の紙が出ない）', /tab==='visit' && window\.pitVisitCollect/.test(sv));
  const idx = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  ok('index.html に ?v= 付きで載っている',
     /js\/sales-visit\.js\?v=\d+/.test(idx) && /css\/sales-visit\.css\?v=\d+/.test(idx));
  ok('来店属性は sales.js より前に読む', idx.indexOf('js/sales-visit.js') < idx.indexOf('js/sales.js'));
  ok('色は js に直書きしていない（css で持つ）', !/#(1db97a|ec4899|378ADD|f59e0b)/i.test(JS('sales-visit.js')));
}

console.log('\n' + (fail ? '❌ ' + fail + '件 赤（' + pass + '件 緑）' : '✅ ぜんぶ緑（' + pass + '件）'));
process.exit(fail ? 1 : 0);
