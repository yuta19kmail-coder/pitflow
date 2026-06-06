/* ========================================
   undetermined.js  -  未定ビュー（入庫：未定/未入庫 ・ 返車：未定）／PitFlow v0.31.0
   ----------------------------------------
   ◎工程の受け皿（ゆうた設計 2026-06-05）
     【入庫】
       ・未定（intakeTbd）＝予約は取ったが入庫日が未定（パーツ待ち等）。日付が決まったら予約へ。
       ・未入庫（cancelled）＝来店なし/連絡なしでキャンセル。1ヶ月後に自動アーカイブ（archived）。
     【返車】
       ・未定（returnTbd）＝作業完了したが返車日が未定（完TEL待ち）。完TELで返車カレンダーへ。
   ◎流れ：予約 →(入庫済)→ タスク →(作業完了)→ 返車・未定 →(完TEL)→ 返車カレンダー →(返車済)→ 実績
   ======================================== */

const UNDET_ARCHIVE_DAYS = 30;   // 未入庫の自動アーカイブまでの日数

/* 起動・描画時に走らせる：古い未入庫を自動アーカイブ */
function pitAutoArchive(){
  const today = new Date(); today.setHours(0,0,0,0);
  let changed = false;
  (state.cards || []).forEach(c => {
    if (c.status === 'cancelled' && !c.archived && c.cancelledAt){
      const p = c.cancelledAt.split('-');
      const cd = new Date(+p[0], +p[1]-1, +p[2]);
      const days = Math.floor((today - cd) / 86400000);
      if (days >= UNDET_ARCHIVE_DAYS){ c.archived = true; changed = true; }
    }
  });
  if (changed && window.PitDB) PitDB.save();
}
window.pitAutoArchive = pitAutoArchive;

function _undTeamColor(c){ return (c.boardId === 'import') ? '#ec4899' : '#1db97a'; }

function renderUndetermined(){
  const wrap = document.getElementById('view-undet-body');
  if (!wrap) return;
  pitAutoArchive();

  const intakeTbd = state.cards.filter(c => c.status === 'reserved' && c.intakeTbd);
  const noShow    = state.cards.filter(c => c.status === 'cancelled' && !c.archived);
  const returnTbd = state.cards.filter(c => c.returnTbd && c.status !== 'returned' && c.status !== 'scrap');

  let h = '<div class="und-cols">';

  /* 左カラム：入庫（未定／未入庫） */
  h += '<div class="today-col">';
  h += '<div class="today-col-head intake"><span class="ic">📥</span>入庫</div>';
  h += '<div class="und-sec"><div class="und-sec-h">🅿️ 未定（パーツ待ち・入庫日決まらず）<span class="und-cnt">' + intakeTbd.length + '</span></div>';
  if (!intakeTbd.length) h += '<div class="today-empty">なし</div>';
  else intakeTbd.forEach(c => h += _undRow(c, 'intakeTbd'));
  h += '</div>';
  h += '<div class="und-sec"><div class="und-sec-h">🚫 未入庫（来店なし・キャンセル）<span class="und-cnt">' + noShow.length + '</span></div>';
  if (!noShow.length) h += '<div class="today-empty">なし</div>';
  else noShow.forEach(c => h += _undRow(c, 'noShow'));
  h += '<div class="und-note">※ 1ヶ月（' + UNDET_ARCHIVE_DAYS + '日）たつと自動でアーカイブされます。</div>';
  h += '</div>';
  h += '</div>';

  /* 右カラム：返車（未定） */
  h += '<div class="today-col">';
  h += '<div class="today-col-head return"><span class="ic">📤</span>返車</div>';
  h += '<div class="und-sec"><div class="und-sec-h">🕒 未定（作業完了・完TEL待ち）<span class="und-cnt">' + returnTbd.length + '</span></div>';
  if (!returnTbd.length) h += '<div class="today-empty">なし</div>';
  else returnTbd.forEach(c => h += _undRow(c, 'returnTbd'));
  h += '<div class="und-note">※ 完TEL（完成電話）で返車日を入れると返車カレンダーへ移ります。</div>';
  h += '</div>';
  h += '</div>';

  h += '</div>';
  wrap.innerHTML = h;
}
window.renderUndetermined = renderUndetermined;

function _undRow(c, kind){
  const wt = (state.workTypes || []).find(w => w.id === c.workType);
  const teamColor = _undTeamColor(c);
  let meta = '';
  if (kind === 'noShow' && c.cancelledAt){
    const p = c.cancelledAt.split('-');
    const left = UNDET_ARCHIVE_DAYS - Math.floor((new Date().setHours(0,0,0,0) - new Date(+p[0], +p[1]-1, +p[2])) / 86400000);
    meta = '<span class="und-meta">キャンセル ' + c.cancelledAt.slice(5).replace('-', '/') + '・あと' + Math.max(0, left) + '日</span>';
  }
  let act = '';
  if (kind === 'intakeTbd') act = '<button class="und-act" onclick="event.stopPropagation();pitUndSetIntake(\'' + c.id + '\')">📅 入庫日を入れる</button>';
  if (kind === 'noShow')    act = '<button class="und-act" onclick="event.stopPropagation();pitUndRestore(\'' + c.id + '\')">↩ 予約に戻す</button>';
  if (kind === 'returnTbd') act = '<button class="und-act" onclick="event.stopPropagation();pitUndComplete(\'' + c.id + '\')">📞 完TEL → 返車日</button>';

  let h = '<div class="und-row" style="--team:' + teamColor + '" onclick="openDetail(\'' + c.id + '\')">';
  h += '<div class="und-main"><div class="und-headline"><b>' + (c.customer || '（未入力）') + ' 様</b>'
     + (c.car ? '<span class="und-car">' + (c.maker ? c.maker + ' ' : '') + c.car + '</span>' : '') + '</div>'
     + '<div class="und-sub">' + (c.plate ? c.plate + '　' : '') + (wt ? wt.label : '') + meta + '</div></div>';
  h += '<div class="und-actwrap">' + act + '</div>';
  h += '</div>';
  return h;
}

/* 入庫・未定 → 入庫日を入れて予約へ戻す（プロンプトで日付） */
window.pitUndSetIntake = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const d = prompt('入庫日を入れてください（例 2026-06-20）', c.reserveDate || ymd(new Date()));
  if (!d) return;
  c.reserveDate = d.trim();
  c.intakeTbd = false;
  if (window.logFlow) logFlow(c, '入庫日を設定（予約へ）');
  if (window.PitDB) PitDB.save();
  renderUndetermined();
  if (window.pitToast) pitToast('📅 ' + c.reserveDate + ' の予約に入れました');
};

/* 未入庫 → 予約に戻す（再度連絡が来た等） */
window.pitUndRestore = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  c.status = 'reserved';
  c.cancelled = false; c.cancelledAt = null; c.archived = false;
  if (!c.reserveDate) c.intakeTbd = true;   // 日付が無ければ未定へ
  if (window.logFlow) logFlow(c, '未入庫から予約に復帰');
  if (window.PitDB) PitDB.save();
  renderUndetermined();
  if (window.pitToast) pitToast('↩ 予約に戻しました');
};

/* 返車・未定 → 完TEL：返車日を入れて返車カレンダーへ */
window.pitUndComplete = function(id){
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  const d = prompt('完TEL！ 返車日を入れてください（例 2026-06-20）', c.returnDate || ymd(new Date()));
  if (!d) return;
  c.returnDate = d.trim();
  c.returnTbd = false;
  c.completeCallAt = ymd(new Date());
  if (window.logFlow) logFlow(c, '完TEL → 返車日設定');
  if (window.PitDB) PitDB.save();
  renderUndetermined();
  if (window.pitToast) pitToast('📞 ' + c.returnDate + ' の返車予定に入れました');
};
