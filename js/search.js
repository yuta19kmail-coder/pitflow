/* ========================================
   search.js  -  マスター検索（PitFlow v0.65.0）
   ----------------------------------------
   ダッシュボード最上部の「検索」BOX。手元の小さな手がかり（名前・カナ・車・
   メーカー・ナンバー・予約番号・代車・日付・担当・メモ・電話）から全カードを
   横断検索し、ヒットしたカードをクリックで開く。
   ・スペース区切りで複数語＝すべて含む（AND）。例「6/13 アクア」
   ・日付は 2026-06-13 / 6/13 / 0613 / 20260613 などの表記でも当たる
   ・代車は「代車3」「L03」やナンバーでも、その代車を使っているカードに当たる
   ======================================== */
(function () {
  'use strict';

  // 正規化：空白除去・全角英数→半角・カタカナ→ひらがな・小文字化
  function norm(s) {
    return (s == null ? '' : String(s))
      .replace(/\s+/g, '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .toLowerCase();
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ステータスの日本語ラベル
  function statusLabel(c) {
    if (c.status === 'reserved') return '予約';
    if (c.status === 'returned') return '返車済み';
    const board = (state.boards || []).find(b => b.id === c.boardId) || (state.boards || [])[0];
    const col = board && (board.cols || []).find(x => x.id === c.status);
    return col ? col.name : (c.status || '');
  }
  function teamLabel(c) { return c.boardId === 'import' ? '輸入車' : (c.boardId === 'default' ? '国産車' : ''); }

  // 日付を複数表記で検索対象に（2026-06-13 / 6/13 / 06/13 / 0613 / 20260613）
  function dateForms(d) {
    if (!d) return [];
    const p = String(d).split('-');
    if (p.length !== 3) return [d];
    const y = p[0], m = p[1], day = p[2];
    return [d, m + '/' + day, (+m) + '/' + (+day), m + day, y + m + day];
  }

  // カード1枚の検索用テキスト（全部つなげて正規化）
  function cardBlob(c) {
    const parts = [c.resNo, c.customer, c.kana, c.car, c.maker, c.plate, c.tel, c.menu, c.frontStaff, c.staff, c.memo, c.office, statusLabel(c), teamLabel(c)];
    (c.contacts || []).forEach(ct => { parts.push(ct.tel, ct.label); });
    dateForms(c.reserveDate).forEach(x => parts.push(x));
    dateForms(c.returnDate).forEach(x => parts.push(x));
    if (c.loanerId) {
      const l = (state.loaners || []).find(x => x.id === c.loanerId);
      if (l) parts.push(l.name, l.model, l.plate);
      parts.push(c.loanerId, '代車');
    }
    return norm(parts.filter(Boolean).join(' '));
  }

  // 顧客台帳（人＋車両）の検索用テキスト
  function custPrimaryTel(cust) {
    const cs = (cust && cust.contacts) || [];
    const p = cs.find(x => x.primary) || cs[0];
    return p ? (p.tel || '') : '';
  }
  function custBlob(cust) {
    const parts = [cust.name, cust.kana];
    (cust.contacts || []).forEach(ct => { parts.push(ct.tel, ct.label); });
    (cust.vehicles || []).forEach(v => { parts.push(v.plate, v.maker, v.car); });
    return norm(parts.filter(Boolean).join(' '));
  }
  function searchCustomers(words) {
    const list = state.customers || [];
    const hits = [];
    for (let i = 0; i < list.length; i++) {
      const blob = custBlob(list[i]);
      if (words.every(w => blob.indexOf(w) >= 0)) hits.push(list[i]);
    }
    hits.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return hits;
  }

  // 検索本体：全語(AND)を含むカードを新しい順で返す
  function search(qStr) {
    // norm は空白を消すので、入力時のスペースで先に語分割してから各語を正規化
    const raw = String(qStr || '').trim();
    const words = raw ? raw.split(/\s+/).map(norm).filter(Boolean) : [];
    if (!words.length) return [];
    const cards = state.cards || [];
    const hits = [];
    for (let i = 0; i < cards.length; i++) {
      const blob = cardBlob(cards[i]);
      if (words.every(w => blob.indexOf(w) >= 0)) hits.push(cards[i]);
    }
    hits.sort((a, b) => (b.reserveDate || '').localeCompare(a.reserveDate || ''));
    return hits;
  }

  function resultRow(c) {
    const no = c.resNo ? '<span class="psr-no">' + esc(c.resNo) + '</span>' : '';
    const st = statusLabel(c);
    const team = c.boardId === 'import' ? '#ec4899' : '#1db97a';
    const loaner = c.loanerId ? ' ・代車' : '';
    return '<div class="psr-row" onclick="pitSearchOpen(\'' + esc(c.id) + '\')">'
      + no
      + '<div class="psr-main">'
      + '<div class="psr-l1"><b>' + esc(c.customer || '（未入力）') + ' 様</b>'
      + '<span class="psr-car">' + esc(c.car || '') + (c.maker ? '（' + esc(c.maker) + '）' : '') + '</span></div>'
      + '<div class="psr-l2">' + esc(c.plate || '') + '　' + esc(c.reserveDate || '') + (c.returnDate && c.returnDate !== c.reserveDate ? '〜' + esc(c.returnDate) : '') + loaner + '</div>'
      + '</div>'
      + '<span class="psr-st" style="border-color:' + team + ';color:' + team + '">' + esc(st) + '</span>'
      + '</div>';
  }

  // 顧客（人）1件の結果行
  function custRow(cust) {
    const tel = custPrimaryTel(cust);
    const vs = cust.vehicles || [];
    const v0 = vs[0] || {};
    const carStr = ((v0.maker ? v0.maker + ' ' : '') + (v0.car || '')).trim();
    const more = vs.length > 1 ? '　ほか' + (vs.length - 1) + '台' : '';
    return '<div class="psr-row" onclick="pitSearchOpenCust(\'' + esc(cust.id) + '\')">'
      + '<span class="psr-no psr-cust">👤</span>'
      + '<div class="psr-main">'
      + '<div class="psr-l1"><b>' + esc(cust.name || '（無名）') + ' 様</b>'
      + (cust.kana ? '<span class="psr-car">' + esc(cust.kana) + '</span>' : '') + '</div>'
      + '<div class="psr-l2">' + esc(tel || '') + (carStr ? '　' + esc(carStr) : '') + (v0.plate ? '　' + esc(v0.plate) : '') + more + '</div>'
      + '</div>'
      + '<span class="psr-st" style="border-color:var(--text3);color:var(--text2)">顧客</span>'
      + '</div>';
  }

  // 入力ハンドラ
  window.pitSearchInput = function (q) {
    const box = document.getElementById('pit-search-results');
    if (!box) return;
    const raw = String(q || '').trim();
    if (!raw) { box.classList.remove('open'); box.innerHTML = ''; return; }
    const words = raw.split(/\s+/).map(norm).filter(Boolean);
    const cardHits = search(q);
    const custHits = searchCustomers(words);
    if (!cardHits.length && !custHits.length) {
      box.innerHTML = '<div class="psr-empty">「' + esc(raw) + '」に当てはまるものはありません</div>';
      box.classList.add('open');
      return;
    }
    const MAXC = 30, MAXP = 30;
    let html = '';
    if (cardHits.length) {
      html += '<div class="psr-head">🗂 カード ' + cardHits.length + '件' + (cardHits.length > MAXC ? '（上位' + MAXC + '件）' : '') + '</div>';
      html += cardHits.slice(0, MAXC).map(resultRow).join('');
    }
    if (custHits.length) {
      html += '<div class="psr-head">👤 顧客 ' + custHits.length + '件' + (custHits.length > MAXP ? '（上位' + MAXP + '件）' : '') + '</div>';
      html += custHits.slice(0, MAXP).map(custRow).join('');
    }
    box.innerHTML = html;
    box.classList.add('open');
  };

  // 顧客の結果クリック＝顧客ビューを開いてその人で絞り込み
  window.pitSearchOpenCust = function (custId) {
    const cust = (state.customers || []).find(c => c.id === custId);
    pitSearchClose();
    if (window.showView) showView('customers');
    if (cust && window.custFilter) custFilter(cust.name || '');
  };

  // 結果クリック＝カードを開く
  window.pitSearchOpen = function (id) {
    pitSearchClose();
    if (window.openDetail) openDetail(id);
  };

  window.pitSearchClose = function () {
    const box = document.getElementById('pit-search-results');
    const inp = document.getElementById('pit-search-input');
    if (box) { box.classList.remove('open'); box.innerHTML = ''; }
    if (inp) inp.value = '';
  };

  // 外側クリックで結果を閉じる（入力は残す）
  document.addEventListener('click', function (e) {
    const wrap = document.getElementById('pit-search-wrap');
    const box = document.getElementById('pit-search-results');
    if (!wrap || !box) return;
    if (!wrap.contains(e.target)) box.classList.remove('open');
  });
  // 入力にフォーカスが戻ったら、語があれば再表示
  document.addEventListener('focusin', function (e) {
    if (e.target && e.target.id === 'pit-search-input' && e.target.value.trim()) {
      window.pitSearchInput(e.target.value);
    }
  });

  console.log('[search] ready');
})();
