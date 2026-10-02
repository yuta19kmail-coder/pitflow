/* PitFlow ── 🤖 売上ビュー「AIレポート」の決めごと（ブラウザ不要）
   ===================================================================
   ◎ゆうた指定（2026-10-02）＝ モック `_資料\01_モック\いま使っているもの\モック_AIレポート_2026-10-02.html`
   ◎ここで見張ること
     🔴🔴 ① 書き出す・書き出し直すのは管理者だけ（画面でも止める。サーバーでも止まる）
     🔴🔴 ② 月締め＝Q1〜Q4 すべてで 残り0・書き込み済み・中身が変わった0
     🔴🔴 ③ 書き出したら数字・目標・文を丸ごと残す（pitSettings/aireport-YYYY-MM）
     🔴  ④ AI への決めごと（数字は資料だけ・保険はボーナス・外注は課題にしない・MINI・理由のある止まり・{{car:ID}}・万で書く）
     🔴  ⑤ 残したレポートから画面を作れる（車は「苗字 車種｜課｜フロント」・押すとカードが開く・太字）
     🔴  ⑥ 課の名前と色は設定の表から（直書きしない）
     🔴  ⑦ Opus 5.5 の「考える」ぶんで文が切れない（上限 40000・切れたらエラー）
   ◎使い方（PitFlow のフォルダで）
       node _見張り/test_sales_ai.mjs
   =================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x !== '' ? '\n       → ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }
};
const SRC = fs.readFileSync(path.join(process.cwd(), 'js', 'sales-ai.js'), 'utf8');
const BODY = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
const SALES = fs.readFileSync(path.join(process.cwd(), 'js', 'sales.js'), 'utf8');
const FN = fs.readFileSync(path.join(process.cwd(), 'functions', 'index.js'), 'utf8');

console.log('── ① 管理者だけ ──');
ok('🔴🔴 書き出す前に管理者か確かめる', /if \(!isAdmin\(\)\)\{[^\n]*書き出せるのは/.test(SRC));
ok('🔴 管理者でない人にはボタンを出さない', /if \(isAdmin\(\)\)\{\s*\n\s*var can =/.test(SRC));
ok('🔴 サーバーでも管理者チェック（pfAsk の assertAdmin）', /exports\.pfAsk[\s\S]*?await assertAdmin\(/.test(FN));

console.log('── ② 月締め ──');
ok('🔴🔴 4つのQすべてで done のときだけ締まる', /out\.closed = out\.qs\.length === 4 && out\.qs\.every\(function \(q\) \{ return q\.done; \}\)/.test(SRC));
ok('🔴🔴 done＝読んだ・まるごと・残り0・未0・変わった0', /q\.done = !!\(g\.res && g\.全部 && q\.残り === 0 && q\.未 === 0 && q\.変わった === 0\)/.test(SRC));
ok('🔴 物差しはクォーターチェックの1本（pitQNokori / pitQWriteCount / pitQCrossLink）', /w\.pitQNokori\(g\.res\)/.test(SRC) && /w\.pitQWriteCount\(g\.res\)/.test(SRC) && /w\.pitQCrossLink\(live\)/.test(SRC));
ok('🔴🔴 締まっていなければ書き出さない（押した時に確かめ、NGならそこで止める）', /if \(!c\.closed\)\{ U\.check = c; throw \{ 止める: true/.test(SRC));
ok('🔴🔴 開いただけでは締めを確かめない（closeState を呼ぶのは書き出しの中だけ）', (SRC.match(/closeState\(ym\)\./g) || []).length === 1 && /closeState\(ym\)\.then\(function \(c\) \{\s*\n\s*c0 = c;/.test(SRC));
ok('🔴🔴 いまの月・未来の月は読みにも行かない・押せない', /if \(!isPast\(ym\)\)\{ U\.saved = null; U\.loaded = true; \}/.test(SRC) && /var can = U\.loaded && !U\.busy && past;/.test(SRC));
ok('🔴 進み具合（4段）と AI の経過時間', /var STEPS = \['締めを確かめる', '数字をまとめる', 'AI が書く', '保存する'\];/.test(SRC) && /id="air-run-t"/.test(SRC));

console.log('── ③ 固定して残す ──');
ok('🔴🔴 書類の名前は aireport-YYYY-MM', /function docId\(ym\)\{ return 'aireport-' \+ ym; \}/.test(SRC));
ok('🔴🔴 数字・文・締め・書き出した日時と人を丸ごと残す', /数字: F, 文: got, 締め: c0/.test(SRC) && /書き出した日時:/.test(SRC) && /書き出した人: me/.test(SRC));
ok('🔴 目標も数字の中に残る（あとで目標を変えても変わらない）', /目標: \{ 下限: tg\.min, 上限: tg\.max/.test(SRC));

console.log('── ④ AI への決めごと ──');
ok('🔴 数字は資料だけ', /数字は渡された資料（JSON）にあるものだけ/.test(SRC));
ok('🔴 保険はボーナス', /保険の車は入金日で実績[\s\S]*?ボーナス/.test(SRC));
ok('🔴 外注は課題に数えない', /外注に出している日数は、自社の場所も手も使わないので課題に数えない/.test(SRC));
ok('🔴 MINI はまとめる（判定は車種名でも）', /BMW のMINI と MINI をまとめて「MINI」/.test(SRC) && /function isMini\(c\)/.test(SRC));
ok('🔴 引継ぎメモの理由で止まりを分ける', /理由のある止まり/.test(SRC) && /function memoTrail\(c\)/.test(SRC));
ok('🔴 車は {{car:ID}} で指す', /\{\{car:ID\}\}/.test(SRC));
ok('🔴 金額は万で書く', /金額は「万」で書く/.test(SRC));
ok('🔴 1課・2課を混ぜない／最後に改善した未来', /預かり日数や台単価を混ぜて語らない/.test(SRC) && /"未来": \{ "div1"/.test(SRC));

console.log('── ⑤ 残したレポートから画面を作る ──');
const ctx = { console, state: { divisions: [{ id: 'div1', label: '1課', color: '#111111' }, { id: 'div2', label: '2課', color: '#222222' }] } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(SRC, ctx);
const dv = (n, c) => ({ 名前: n + '（x）', 短い名前: n, 色: c, 実績: 6000000, 台数: 60, 台単価: 100000, 目標: { min: 7500000, max: 10000000 }, 前月: 7000000,
  大物を除く: { 実績: 6000000, 一日あたり: 9000 }, 大物: [], 預かり: { 中央値: 5, 平均: 8, のべ: 500, 一日あたり: 12000, 平均在庫台数: 16.7 },
  日数帯: [{ 帯: '〜3日', 台数: 10, 金額: 300000, のべ日数: 15, 一日あたり: 20000, 台単価: 30000 }],
  工程: [{ 工程: '作業完了', key: 'workDone', 日数: 50, 台数: 30, 一台あたり: 1.7 }], 作業完了から返車: { 台数: 30, のべ日数: 50, 三日以上: 5 },
  フロント: [{ 名前: '椎名', 台数: 30, 売上: 3000000 }], メカ: [{ 名前: '山田', 台数: 40, 生産: 4000000 }], メーカー: [{ メーカー: 'MINI', 台数: 5, 金額: 500000 }], 作業: [{ 作業: '車検', 台数: 5, 金額: 500000 }],
  予定遅れ: { 台数: 1, 上位: [] }, 引っぱった車: [{ id: 'c1', 作業: '車検', 金額: 500000, 預かり: 10, 一日あたり: 50000 }],
  時間がかかった車: [{ id: 'c1', 預かり: 40, 工程: { workDone: 3 }, 金額: 500000, 一日あたり: 12500, 入庫: '2026-08-01', 完了: '2026-09-10', 返車予定: '2026-09-01', メモ: { いま: '9/5 BO ドイツ本国', 書き換え: [], 症状: '' } }],
  未来: { 空く日数: 100, 内訳: { 作業完了から返車: 40, 中くらいの仕事: 30, 長期預かり: 30 }, 伸ばせる売上: 900000, 空く置き場: 3.3, 見込み: 6900000 }, 入力の抜け: { 作業タイプ: 0, メカ: 0 } });
const F = { 月: '2026-09', 目標: { 下限: 15000000, 上限: 20000000, 国産の割合: 50 },
  全体: { 実績: 12000000, 台数: 120, 前月: 13000000, 営業日: 23, 前月営業日: 27, 一日あたり: 521000, 前月一日あたり: 481000, 地力: 12000000, 日ごとの累計: [0, 100, 200, 300] },
  課: { div1: dv('1課', '#111111'), div2: dv('2課', '#222222') },
  スライド: [{ id: 'c1', 状態: '作業完了', 金額: 100000, 課: 'div1', 実績の日: '2026-10-01' }], 予定から次の月にずれた車: [],
  保険: { 実績に入った: [], 入金待ち: [], 作業完了のまま: [] }, 休み: { 休んだ日: [], 営業した土日祝: [] },
  未来: { 空く日数: 200, 伸ばせる売上: 1800000, 空く置き場: 6.7, 見込み: 13800000 },
  車: { c1: { id: 'c1', 苗字: '熊木', 車種: 'ミニR56', 課: '2課', 課の色: '#222222', フロント: '箱崎' } } };
const R = { 月: '2026-09', 書き出した日時: '2026-10-04T09:12:00Z', 書き出した人: 'チーフ', AI: { model: 'claude-opus-5-5' }, 数字: F,
  文: { 総評: ['**大物**なし {{car:c1}}'], div1: { 課題: ['課題A'] }, div2: { 課題: ['課題B'] }, 全体の課題: ['全体A'], 未来: { div1: ['f1'], div2: ['f2'], 全体: ['fa'] } } };
let html = '';
try { html = ctx.pitAiRepHtml(R); } catch (e) { html = 'ERR ' + e.stack; }
ok('🔴 画面が作れる', html.indexOf('ERR') !== 0 && html.length > 1000, html.slice(0, 200));
ok('🔴🔴 車は「苗字 車種｜課｜フロント」を1つの枠に。枠全体を押すとカードが開く', /<span class="air-car" role="button" tabindex="0" style="--dc:#222222" onclick="pitAiRepOpen\('c1'\)"><span class="nm">熊木 ミニR56<\/span><span class="dv">2課<\/span><span class="fr">箱崎<\/span><\/span>/.test(html), html.match(/air-car[^]{0,260}/) && html.match(/air-car[^]{0,260}/)[0]);
console.log('── 通知表 ──');
const cards = html.match(/<div class="air-card">/g) || [];
ok('🔴🔴 通知表は全体・1課・2課の3つ', cards.length === 3, cards.length);
ok('🔴 4項目（売上・単価・預かり・返車）', /<span>売上<\/span>/.test(html) && /<span>単価<\/span>/.test(html) && /<span>預かり<\/span>/.test(html) && /<span>返車<\/span>/.test(html));
ok('🔴 前月が無い項目は「—」（前月なし）', /<b>—<\/b><i>前月なし<\/i>/.test(html));
ok('🔴 売上の判定：全体 1,200万／下限 1,500万（80%）は ×', /air-g g4" title="目標の上限以上◎[^"]*"><span>売上<\/span><b>×<\/b>/.test(html));
ok('🔴 返車の判定：50日÷30台＝1.7日は △', /<span>返車<\/span><b>△<\/b><i>完了→返車 1\.7日<\/i>/.test(html));
ok('🔴 判定はコード1本（grades）・AI には付け直させない', /function grades\(F\)/.test(SRC) && /評価を自分で付け直さない/.test(SRC));
console.log('── 速く出す（書き出し済みは締めた証） ──');
ok('🔴🔴 書き出し済みの月はレポート1つを読むだけ（締めの確認をしない）', /if \(sv && sv\.数字\)\{[\s\S]{0,300}U\.close = markClosed\(sv\.締め\)[\s\S]{0,200}return;/.test(SRC));
ok('🔴🔴 控え（このパソコン）があれば読む前に出す', /var cached = cacheGet\(ym\);\s*\n\s*if \(cached && cached\.数字\)\{ U\.saved = cached;/.test(SRC));
ok('🔴 本物が書き出し直されていたら差し替える／消されていたら控えも捨てる', /s\(cached\.書き出した日時\) !== s\(sv\.書き出した日時\)/.test(SRC) && /if \(cached\) cachePut\(ym, null\);/.test(SRC));
ok('🔴 タブを押しても書き出し済みの月は忘れない', /!\(MEM\[k\]\.saved && MEM\[k\]\.saved\.数字\)/.test(SRC));
ok('🔴🔴 書き出し直す時も、押した時に締めを確かめてから', /var again = !!\(U\.saved && U\.saved\.数字\);[\s\S]{0,1500}closeState\(ym\)\.then/.test(SRC));
ok('🔴 社長・専務・チーフ・蓮沼さんに仕事を戻す提案をしない', /この4人に仕事を戻す提案はしない/.test(SRC));
ok('🔴 **…** は太字に', /<b>大物<\/b>/.test(html));
ok('🔴 課ごとの課題・全体の課題・改善した未来が出る', /課題A/.test(html) && /課題B/.test(html) && /全体A/.test(html) && /改善した未来/.test(html));
ok('🔴 引継ぎメモ（止まった理由）を表に出す', /9\/5 BO ドイツ本国/.test(html));
ok('🔴 「固定」と書いてある', /この時点のデータと目標で固定/.test(html));

console.log('── ⑥ 課は設定の表から ──');
ok('🔴 課の名前・色の直書きが無い', !/'1課'|'2課'|#1db97a|#ec4899/i.test(BODY));
ok('🔴 課の名前は state.divisions から', /function divRow\(k\)\{ return \(S\(\)\.divisions/.test(SRC));

console.log('── ⑦ 文が切れない ──');
ok('🔴 上限 40000・考える深さ medium', /var MAX_TOKENS = 40000;/.test(SRC) && /var EFFORT = 'medium';/.test(SRC));
ok('🔴 切れたら残さずエラー', /d\.stop === 'max_tokens'/.test(SRC));
ok('🔴 サーバーは公式 SDK のストリーミングで受ける', /client\.messages\.stream\(params\)\.finalMessage\(\)/.test(FN) && /timeoutSeconds: 540/.test(FN));
ok('🔴 AI が断ったらエラー（refusal）', /msg\.stop_reason === "refusal"/.test(FN));

console.log('── タブ ──');
ok('🔴 来店属性の横に AIレポート', /\['visit','来店属性'\],\['ai','AIレポート'\]/.test(SALES));
ok('🔴 PDF 出力にも AIレポートの形', /if\(tab==='ai' && window\.pitAiRepModel\) return pitAiRepModel\(\);/.test(SALES));

console.log(fail ? `⚠ ${pass} OK / ${fail} NG` : `✅ 全部緑（${pass}件）`);
process.exit(fail ? 1 : 0);
