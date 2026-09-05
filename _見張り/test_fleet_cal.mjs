/* PitFlow ── 🗓 **車両カレンダー・代車カレンダーの見た目**（v2.70.0／ブラウザは使わない）
   ===================================================================
   ◎ゆうた指定（2026-09-05・モックを見て決めたこと）
     🗣「今はCSSがぶっ壊れてるのか　そんな美しいみためしてないぞ」
     🗣「月ビューの方に　仮押さえ、候補の日付　などは要らない。あくまでやる事、内容だけ」
     🗣「いろを内容問わず　未割当 赤 ／ 予定 黄色 ／ 確定 グリーン　にしない？
     　　でいまもある一般とかの前の四角で作業タイプ色を示す」
     🗣「車検は3本ぶち抜きのバーにしてほしい」
     🗣「満了日をバーの中から出して、前のように別の1行（左に赤い縦線）に戻す」
     🗣「日ビューの満了だけわかりにくいから変えてほしい。逆に最も目立つぐらいじゃないとだよね？」
     🗣「ここは今の緑やや透過の方が見やすいな。もうほんとちょっと鮮やかで透過で」
     🗣「列幅は86PXでいいや。で基本はこれで実装でOK」
     🗣「太い縦バーで外わくなしは」「連続の日は同士は丸めないで　最初と最後だけ丸める」

   ◎ここで見張ること
     🔴 ① マスは**縦積み**（前は横並び・折り返し＝札が2つ以上で潰れていた）
     🔴 ② **網掛けを1か所も使わない**
     🔴 ③ 字は 11px 以上
     🔴 ④ 色＝**状態**（未割当 赤／予定 黄／確定 緑／超過 ベタ赤）。作業は前の四角
     🔴 ⑤ ベタ塗りは「手遅れになると困る日」だけ＝**超過と満了日**
     🔴 ⑥ 期限は札にしない＝**左に色の縦線の1行**
     🔴 ⑦ 月ビューに**候補の日付・貸出・仮押さえを出さない**
     🔴 ⑧ 列は**固定幅**（86px／56px）＝バーが何マスぶんか計算できる
     🔴 ⑨ 凡例が画面に出る（**凡例に無い見た目は出さない**の受け皿）
     🔴 ⑩ 代車カレンダーの整備＝**縦バーは全部の日／丸めるのは最初と最後だけ**
     🔴 ⑪ 作業の色は**どの画面でも同じ**（js に色を綴らない）

   ◎使い方
       node test_fleet_cal.mjs
       node test_fleet_cal.mjs --break=1  … マスを横並びに戻す            → ① が赤
       node test_fleet_cal.mjs --break=2  … 候補の日付を月ビューに戻す      → ⑦ が赤
       node test_fleet_cal.mjs --break=3  … 網掛けを1か所入れる            → ② が赤
       node test_fleet_cal.mjs --break=4  … 縦バーを全部の日で丸める        → ⑩ が赤
       node test_fleet_cal.mjs --break=5  … 列を可変幅（minmax）に戻す      → ⑧ が赤
       node test_fleet_cal.mjs --break=6  … 満了日を「やること」に混ぜる     → ⑥ が赤
       node test_fleet_cal.mjs --break=7  … 札を1行に戻す                  → ⑧-2 が赤
       node test_fleet_cal.mjs --break=8  … 代車カレンダーの整備をまた押せるようにする → ⑩ が赤
                                             （86px のマスからはみ出す状態）
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').split('=')[1] || '';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const JS  = (f) => fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8');
const CSS = (f) => fs.readFileSync(path.join(process.cwd(), 'css', f), 'utf8');

function bend(name, src){
  if (BREAK === '1' && name === 'fleet-cal.css')
    return src.replace('.fl-cal-new .fl-cal-cell{ display:flex; flex-direction:column;',
                       '.fl-cal-new .fl-cal-cell{ display:flex; flex-direction:row;');
  if (BREAK === '2' && name === 'fleet.js')
    return src.replace("+ _flMbInner(it) + '</div>';",
                       "+ _flMbInner(it) + ' 10/4〜10/6' + '</div>';");
  if (BREAK === '3' && name === 'fleet-cal.css')
    return src.replace('.fl-mb.cand { background:rgba(245,158,11,.16);',
                       '.fl-mb.cand { background:repeating-linear-gradient(45deg,rgba(245,158,11,.2) 0 6px,transparent 6px 12px);');
  if (BREAK === '4' && name === 'fleet-cal.css')
    return src.replace('.lo-mtline{ position:absolute; left:3px; top:-1px; bottom:-1px; width:6px; border-radius:0;',
                       '.lo-mtline{ position:absolute; left:3px; top:3px; bottom:3px; width:6px; border-radius:3px;');
  if (BREAK === '5' && name === 'fleet.js')
    return src.replace("+ FL_COL_NAME + 'px repeat(' + months.length + ', ' + FL_COL_M + 'px)",
                       "+ FL_COL_NAME + 'px repeat(' + months.length + ', minmax(' + FL_COL_M + 'px,1fr))");
  /* v2.72.1 …代車カレンダーの整備をまた押せるようにする（＝貸出を入れたいのに整備の窓が開く） */
  if (BREAK === '8' && name === 'fleet-cal.css')
    return src.replace('  pointer-events:none; background:none; border:0; }',
                       '  cursor:pointer; background:none; border:0; }');
  if (BREAK === '7' && name === 'fleet-cal.css')
    return src.replace('.fl-mb{ display:flex; align-items:center; flex-wrap:wrap;',
                       '.fl-mb{ display:flex; align-items:center; flex-wrap:nowrap;')
              .replace('.fl-mb .st{ flex:1 0 100%;', '.fl-mb .st{ flex:0 0 auto; margin-left:auto;');
  if (BREAK === '6' && name === 'maint-pit.js')
    return src.replace("      ms.sort();", "      ms.sort();\n      if (p.dueDate) out.push({ state:'due', months:ms, months2:1, work:r.work, workDot:'wk-shaken', workShort:'満了', stateLabel:'満了', bar:false, gid:r.groupId, title:'', months:ms });");
  return src;
}

const fleet   = bend('fleet.js', JS('fleet.js'));
const loaner  = bend('loaner.js', JS('loaner.js'));
const maint   = bend('maint-pit.js', JS('maint-pit.js'));
const calcss  = bend('fleet-cal.css', CSS('fleet-cal.css'));
const mStart  = fleet.indexOf('function flMonthCalHtml');
const dStart  = fleet.indexOf('function flDayCalHtml');
const month   = fleet.slice(mStart, dStart);
const day     = fleet.slice(dStart, dStart + 7000);

/* ================================================================= */
console.log('\n── ① マスは縦積み（「たまに変」の正体）──');
{
  /* ⚠ 前は「横に並べて中央寄せ・折り返し」の入れ物なのに、中の札は
     「下に3px空ける＝縦に積むつもり」で書かれていた。だから2つ以上あると両方潰れた。 */
  ok('🔴🔴 マスは縦積みになっている', /\.fl-cal-new \.fl-cal-cell\{[^}]*flex-direction:column/.test(calcss));
  ok('🔴 折り返さない（横に流れない）', /\.fl-cal-new \.fl-cal-cell\{[^}]*flex-wrap:nowrap/.test(calcss));
  ok('マスに高さの余裕がある（58px 以上）', /\.fl-cal-new \.fl-cal-cell\{[^}]*min-height:58px/.test(calcss));
  ok('バーを置けるように position:relative', /\.fl-cal-new \.fl-cal-cell\{[^}]*position:relative/.test(calcss));
}

console.log('\n── ② 網掛けを1か所も使わない ──');
{
  /* 🗣「候補の枠が45度のストライプで、小さい字と重なってチラつく」 */
  ok('🔴🔴 このカレンダーの CSS に網掛け（repeating-linear-gradient）が無い',
     !/repeating-linear-gradient/.test(calcss), (calcss.match(/repeating-linear-gradient[^;]*/g)||[]).slice(0,2));
}

console.log('\n── ③ 字は 11px 以上 ──');
{
  const sizes = (calcss.match(/font-size:([0-9.]+)px/g) || []).map(s => parseFloat(s.split(':')[1]));
  ok('🔴 9.5px のような小さい字が無い', sizes.every(s => s >= 10.5), sizes.filter(s => s < 10.5));
  ok('札の字は 11px 以上', /\.fl-mb\{[^}]*font-size:11\.5px/.test(calcss));
  ok('バーの字も 11px 以上', /\.fl-bar3\{[^}]*font-size:11\.5px/.test(calcss));
}

console.log('\n── ④ 色は「状態」。作業の種類は前の四角 ──');
{
  ok('🔴 未割当＝赤', /\.fl-mb\.tbd\s*\{[^}]*rgba\(239,68,68/.test(calcss));
  ok('🔴 予定＝黄', /\.fl-mb\.cand\s*\{[^}]*rgba\(245,158,11/.test(calcss));
  ok('🔴 確定＝グリーン', /\.fl-mb\.fixed\{[^}]*rgba\(29,185,122/.test(calcss));
  ok('🔴 超過＝ベタ赤', /\.fl-mb\.over\s*\{[^}]*background:var\(--red\)/.test(calcss));
  ok('🔴 作業の四角が4つある', /\.wk-shaken/.test(calcss) && /\.wk-12pt/.test(calcss)
     && /\.wk-general/.test(calcss) && /\.wk-bp/.test(calcss));
  ok('四角は札の色に負けないように縁がある', /\.fl-dot\{[^}]*box-shadow:0 0 0 1px/.test(calcss));
  /* 🔴 ⑪ 作業の色は js に綴らない＝クラス名だけを配る */
  ok('🔴🔴 js に作業の色を綴っていない（クラス名だけ）',
     /function workDot/.test(maint) && !/wk-shaken\s*:\s*['"]#/.test(maint) && !/#84cc16/.test(maint));
  ok('🔴 ボードの作業タグも同じ色にそろえた（画面ごとに意味が変わらない）',
     /mb-k-general/.test(maint) && /mb-k-bp/.test(maint)
     && /\.mb-k-general\{[^}]*132,204,22/.test(calcss) && /\.mb-k-bp\s*\{[^}]*168,85,247/.test(calcss));
}

console.log('\n── ⑤ ベタ塗りは「手遅れになると困る日」だけ ──');
{
  /* 🗣「日ビューの満了だけわかりにくい。逆に最も目立つぐらいじゃないと」 */
  ok('🔴🔴 日ビューの満了日はマスごと赤く塗る', /\.fl-cal-cell\.d-exp\{[^}]*background:var\(--red\)/.test(calcss));
  ok('中の字は白抜きで大きい', /\.fl-big\{[^}]*font-size:13px/.test(calcss) && /\.fl-big\{[^}]*font-weight:900/.test(calcss));
  ok('🔴 日ビューが満了日を塗っている', /d-exp/.test(day));
  /* 🔴 v2.71.0（ゆうた 2026-09-05）「12点は満了日の記載はいらない。あくまで位だから」
     ＝ 12ヶ月点検に期限の日は無い。塗ると「この日が期限」に見えるので**塗らない**。 */
  ok('🔴🔴 12点の日はマスを塗らない（期限ではなく目安）',
     !/d-tkc/.test(day) && !/d-tkc/.test(calcss));
  /* ⚠ ベタ塗りは超過と満了・12点だけ。ほかは枠＋薄い塗り。 */
  const solid = (calcss.match(/\.fl-(mb|bar3)\.[a-z]+\s*\{[^}]*background:var\(--red\)/g) || []);
  ok('🔴 札とバーでベタ塗りなのは「超過」だけ', solid.every(s => /\.over/.test(s)), solid);
}

console.log('\n── ⑥ 期限は札にしない（左に色の縦線の1行）──');
{
  ok('🔴🔴 満了は縦線の1行', /\.fl-due\{[^}]*border-left:3px solid var\(--red\)/.test(calcss));
  ok('🔴 月ビューが満了日を別の行で出している', /fl-due/.test(month) && /満了 /.test(month));
  /* 🔴 v2.71.0 期限として日付を出すのは**車検の満了日だけ**。12点は目安なので日付を出さない。 */
  ok('🔴🔴 月ビューに12点の日付を出さない',
     !/fl-due tk/.test(month) && !/pitTenkenFromShaken/.test(month) && !/\.fl-due\.tk\{/.test(calcss));
  /* ⚠ 満了日は「やること」ではない＝物差しの側に混ぜない */
  ok('🔴🔴 物差しは満了日を「やること」として返さない',
     !/state:\s*'due'/.test(maint), 'pitMaintCalItems が state:"due" を返している');
}

console.log('\n── ⑦ 月ビューは「やること・内容」だけ ──');
{
  /* 🗣「月ビューの方に仮押さえ、候補の日付などは要らない。あくまでやる事、内容だけ」 */
  /* ⚠ マスに見えている字は `_flMbInner`（四角＋作業名＋状態）だけ。
     候補の日付は **title（カーソルを乗せた時）** に回す＝マスには出さない。 */
  const mbInner = fleet.slice(fleet.indexOf('function _flMbInner'), fleet.indexOf('/* 月モードのカレンダー */'));
  ok('🔴🔴 月ビューの札は「作業＋状態」だけ（候補の日付を出さない）',
     /workShort/.test(mbInner) && /stateLabel/.test(mbInner) && !/〜/.test(mbInner) && !/md\(/.test(mbInner), mbInner);
  ok('🔴 月ビューは日の軸の物差しを呼ばない', !/pitMaintDayBars/.test(month));
  /* ⚠ 札の中身は `_flMbInner` **だけ**。ここに何か足すと、また日付が戻ってくる。 */
  ok('🔴🔴 札に後から字を足していない',
     /\+ _flMbInner\(it\) \+ '<\/div>'/.test(month) && /\+ _flMbInner\(b\.it\) \+ '<\/div>'/.test(month),
     '月ビューの札に _flMbInner 以外の字が足されている');
  ok('🔴 月ビューに貸出・仮押さえを出さない', !/fl-use/.test(month) && !/day\.lends/.test(month) && !/day\.holds/.test(month));
  ok('🔴 日と貸出は日ビューの仕事', /fl-use/.test(day) && /day\.lends/.test(day));
  ok('自由イベントは4文字で切らない（名前ぜんぶ）', /fl-ev/.test(month) && !/slice\(0, 4\)/.test(month));
}

console.log('\n── ⑧ 列は固定幅（バーが何マスぶんか計算できる）──');
{
  ok('🔴 月ビューの列は 86px（ゆうた確定）', /FL_COL_M = 86/.test(fleet));
  ok('日ビューの列は 56px', /FL_COL_D = 56/.test(fleet));
  ok('🔴🔴 月ビューの列は固定幅（minmax を使っていない）',
     /repeat\(' \+ months\.length \+ ', ' \+ FL_COL_M \+ 'px\)/.test(month), '月ビューが可変幅に戻っている');
  ok('🔴 日ビューの列も固定幅', /repeat\(' \+ last \+ ', ' \+ FL_COL_D \+ 'px\)/.test(day));
  ok('🔴 車検は3ヶ月ぶち抜きの1本のバー', /fl-bar3/.test(month) && /b\.span/.test(month));
  ok('バーが乗るマスは上に場所を空ける', /barpad/.test(month) && /\.fl-cal-cell\.barpad\{[^}]*padding-top:35px/.test(calcss));
  ok('🔴 日ビューの枠も期間ぜんぶで1本', /pitMaintDayBars\(/.test(day) && /fl-bar3/.test(day));
  ok('画面の外へ続く側は角を落として点線', /cutL/.test(day) && /\.fl-bar3\.cutL\{[^}]*border-left-style:dashed/.test(calcss));
}

console.log('\n── ⑧-2 1マスに収まっているか（v2.71.1）──');
{
  /* 🗣 ゆうた「テキストが1せるだと入り切ってない」
     ◎計算 … 月の列は 86px。マスの内側は 74px、札の内側は **56px しか無い**。
       そこへ「四角＋作業名＋状態」を1行（約79px）で入れていた＝はみ出していた。
     ◎いま … **行を増やして収める**（字は小さくしない＝決めごと③）。 */
  ok('🔴🔴 月ビューの札は2行にする（状態が次の行へ回る）',
     /\.fl-mb\{[^}]*flex-wrap:wrap/.test(calcss) && /\.fl-mb \.st\{[^}]*flex:1 0 100%/.test(calcss));
  ok('🔴 字は小さくしていない（11.5px のまま）', /\.fl-mb\{[^}]*font-size:11\.5px/.test(calcss));
  /* ⚠ 1マスぶんしか見えていない帯は、バーにすると必ずはみ出す＝札で出す */
  ok('🔴 1マスしか見えていない帯はバーにしない', /b && b\.span > 1/.test(month) && /else if \(b\)/.test(month));
  ok('🔴 その時は上に場所も空けない', /if \(span > 1\) for/.test(month));
  /* ⚠ 日ビューの列は 56px。1日だけの枠はバーの内側が 26px しか無い＝作業名を入れると切れる */
  ok('🔴🔴 日ビューは幅で出す字を変える（1日＝四角だけ）',
     /_w >= 2 \? '<b>/.test(day) && /_w >= 4 \?/.test(day) && /_w < 2 \? ' tiny'/.test(day));
  ok('1日だけの枠は四角を真ん中に置く', /\.fl-bar3\.tiny\{[^}]*justify-content:center/.test(calcss));
  /* ⚠ 予定か確定かは**色**が言っている（凡例に出してある）ので、字が消えても意味は落ちない */
  ok('自由イベントの長い名前は2行まで折り返す',
     /\.fl-ev span\{[^}]*line-clamp:2/.test(calcss) && /<span>' \+ _fleetEsc\(x\.label\)/.test(fleet));
}

console.log('\n── ⑨ 凡例（凡例に無い見た目は出さない、の受け皿）──');
{
  ok('🔴 凡例が画面に出る', /flCalLegendHtml\(\)/.test(fleet) && /function flCalLegendHtml/.test(fleet));
  ok('状態の4つが凡例にある', /未割当/.test(fleet) && /fl-mb cand/.test(fleet) && /fl-mb fixed/.test(fleet) && /fl-mb over/.test(fleet));
  ok('作業の四角が凡例にある', /dot\('shaken','車検'\)/.test(fleet) && /dot\('bp','B\.P'\)/.test(fleet));
  ok('月ビューでは期限の見方が出る', /左に赤い縦線の1行/.test(fleet));
  ok('日ビューでは満了・貸出の見方が出る', /fl-lg-sq exp/.test(fleet) && /fl-lg-sw lend/.test(fleet));
  /* ⚠ 画面から消したものは凡例からも消す（凡例と画面は1対1） */
  ok('🔴 凡例からも12点の日付・塗りを外した', !/fl-due tk/.test(fleet) && !/fl-lg-sq tkc/.test(fleet));
  ok('🔴 バーの長さの決めごとが凡例に出る', /12点＝目安の月＋その前/.test(fleet) && /12点に期限日はありません/.test(fleet));
}

console.log('\n── ⑩ 代車カレンダーの整備予定（太い縦バー・外わくなし）──');
{
  /* 🗣「太い縦バーで外わくなしは」「連続の日は同士は丸めないで　最初と最後だけ丸める」 */
  ok('🔴🔴 代車カレンダーが整備を読むようになった', /day\.maints/.test(loaner));
  ok('🔴 縦バーは期間ぜんぶの日に引く', /lo-mtline/.test(loaner) && !/isStart \? '<span class="lo-mtline/.test(loaner));
  ok('🔴🔴 途中の日は丸めない', /\.lo-mtline\{[^}]*border-radius:0/.test(calcss));
  ok('🔴🔴 最初の日だけ上を丸める', /\.lo-mtline\.st\{[^}]*border-top-left-radius:3px/.test(calcss));
  ok('🔴🔴 最後の日だけ下を丸める', /\.lo-mtline\.en\{[^}]*border-bottom-left-radius:3px/.test(calcss));
  ok('🔴 途中の日は上下にはみ出して地続きになる', /\.lo-mtline\{[^}]*top:-1px[^}]*bottom:-1px/.test(calcss));
  ok('🔴 札は最初の日だけ', /mt\.isStart/.test(loaner));
  ok('🔴 貸出の札が乗る日には整備の札を出さない（重ねない）', /isStart \? '' : mtTag/.test(loaner));
  ok('確定と予定で濃さを変える', /\.lo-mtline\.cand\{/.test(calcss) && /\.lo-mt\.cand\{/.test(calcss));
  ok('🔴 マスの外わくは足していない（バーが期間の目印）', !/\.lo-mt\{[^}]*border:1px/.test(calcss));
  /* 🔴🔴 v2.72.1（ゆうた指定 2026-09-05）
     🗣「代車カレンダー本体側からは修理系のイベントはさわれなくていい。
     　　あったとしても仮押さえみたいな通常のクリック挙動をするようにして」
     ＝ 札も縦バーも**クリックを受けない**。押した先はマスに素通しされて、空きマス・仮押さえと同じ動きになる。
     ⚠ ここは貸出を入れる画面。押した時に整備の窓が開くと、やりたいことと違う所へ飛ぶ。 */
  ok('🔴🔴 この画面では押せない（マスに素通しする）',
     !/flMaintChip/.test(loaner) && /\.lo-mt\{[^}]*pointer-events:none/.test(calcss));
  ok('🔴 縦バーもクリックを受けない', /\.lo-mtline\{[^}]*pointer-events:none/.test(calcss));
  /* ⚠ 押せないぶん、何が入っているかは**マスの title**（カーソルを乗せた時）で言う */
  ok('🔴 かわりにマスにカーソルを乗せると中身が出る',
     /if \(mtTitle\) attrs \+= ' title="'/.test(loaner) && /まだ貸せます/.test(loaner));
  /* ⚠ 候補は代車をふさがない＝今までどおり貸せる。使い方にもそう書く。 */
  ok('🔴 使い方に「確定は貸せない／予定はまだ貸せる」と書いてある',
     /確定は貸せません／予定はまだ貸せます/.test(loaner));
  ok('🔴 使い方に「この画面では押せない」と書いてある',
     /この画面では押せません/.test(loaner) && /空きマス・仮押さえと同じ動き/.test(loaner));
}

console.log('\n── ⑪ 決めごとの後始末 ──');
{
  const polish = CSS('polish.css');
  ok('🔴 古いバッジ（fl-mbdg / fl-mn）は使っていない',
     !/fl-mbdg/.test(fleet) && !/class="fl-mn/.test(fleet));
  /* ⚠ 説明文に名前が出るのは構わない。見るのは**配っているか・呼んでいるか**。 */
  ok('🔴 使われなくなった物差し（pitMaintBadges）を配っていない・呼んでいない',
     !/w\.pitMaintBadges\s*=/.test(maint) && !/pitMaintBadges\s*\(/.test(fleet));
  ok('fleet-cal.css は polish.css より後ろに読む（上書きする側）', (function(){
    const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    return idx.indexOf('fleet-cal.css') > idx.indexOf('polish.css');
  })());
  ok('⚠ polish.css 側の古いカレンダーの色は残っているが、上書きされる（消すのは次の片付け）',
     /fl-cal-cell/.test(polish));
}

console.log('\n─────────────────────────────');
if (BREAK){
  console.log('わざと壊したモード（--break=' + BREAK + '）：✅ ' + pass + ' / ❌ ' + fail);
  console.log(fail > 0 ? '🟢 正しい＝壊したら赤くなった（この見張りは効いている）'
                       : '🔴 おかしい＝壊しても赤くならない（見張りが効いていない）');
} else {
  console.log('✅ ' + pass + ' / ❌ ' + fail);
}
process.exit(BREAK ? 0 : (fail ? 1 : 0));
