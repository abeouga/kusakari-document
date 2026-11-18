// Kusakari 日報の表示とコメントの処理。
// データは data/index.js(日付の一覧)と data/<日付>.js(1日分)が window.NIPPO に入れる。
// 外から来た文章(issueの本文、コメント、名前)は必ず textContent で入れ、HTMLとして解釈させない。
(function () {
  'use strict';

  var NIPPO = (window.NIPPO = window.NIPPO || {});
  NIPPO.days = NIPPO.days || {};
  NIPPO.index = NIPPO.index || [];

  var STATUS = { confirmed: '確定', proposed: '提案中', in_progress: '作業中', dropped: '取り下げ' };
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var MAX_TEXT = 2000;
  var MAX_IMAGES = 4;                 // 1つのコメントに付けられる画像の数
  var IMAGE_MAX_SIDE = 1600;          // 保存する画像の長い辺(px)
  var IMAGE_KEEP_BYTES = 1024 * 1024; // これ以下で長い辺も小さい画像は、縮めずにそのまま保存する
  var IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  var IMAGE_ERRORS = {
    too_large: '画像が大きすぎます(1枚20MBまで)。',
    unsupported_type: 'この形式の画像は付けられません。PNG・JPEG・GIF・WebP の画像を選んでください。',
    invalid_request: '画像を保存できませんでした。別の画像で試してください。',
    quota_or_state: '画像を保存できる量の上限に達しています。',
    rate_limited: '続けて送りすぎました。少し待ってからもう一度試してください。',
    not_granted: '画像を付けられるのは「編集者」として招待されている人だけです。',
  };
  var NICK_KEY = 'kusakari-nippo-nick';
  var ORDER_KEY = 'kusakari-nippo-order'; // コメントの並び順('new' か 'old')。見ている人のブラウザに覚えておく
  // 新着の印を出し始めた時刻。これより前のコメントは、だれにとっても既読として扱う。
  var UNREAD_SINCE = '2026-11-16T08:57:00.000Z';
  var NEWS_MAX = 10;                  // ページの上の「新着コメント」に並べる数

  var state = {
    date: null,       // 表示中の日付
    db: null,         // コメントの保存先。claude.ai 上で開いたときだけ入る
    user: null,
    assets: null,     // 画像の保存先。画像を保存できる人(編集者)が claude.ai 上で開いたときだけ入る
    bigImage: null,   // 大きく表示している画像のID
    me: null,         // 見ている人
    posts: [],        // 全コメント(新しい順、最大1000件)
    loaded: false,    // 保存先から最初の答えが来たか
    slow: false,      // 10秒たっても答えが無い
    readOnly: false,  // 書き込みを断られた
    editing: null,    // { id, text } 編集中のコメント
    confirmDelete: null,
    open: {},         // 項目ID -> true。コメント欄を開いている項目
    order: 'new',     // コメントの並び順。'new' は新しい順、'old' は古い順
    names: {},        // id -> { name, color }
    reads: null,      // 見ている人の既読の記録 { since, marks }。読めるまでは null(新着の印を出さない)
    readsRef: null,   // 既読の記録の保存先(見ている人だけが読み書きできる場所)
    readsWriting: false,
    readsDirty: false,
    fresh: {},        // コメントID -> true。この日を表示している間に既読にしたコメント(「新着」の印を残す)
    talkSeen: false,  // 「この日の会話」が画面に見えているか
    jump: null,       // { date, item } 「新着コメント」の行から移る先
  };
  var talkObserver = null;

  // ---- 小さな道具 ----
  function h(tag, props, children) {
    var node = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (key) {
      var value = props[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'on') Object.keys(value).forEach(function (ev) { node.addEventListener(ev, value[ev]); });
      else node.setAttribute(key, value === true ? '' : value);
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }
  function link(label, url) {
    var safe = typeof url === 'string' && /^https:\/\//.test(url);
    return safe ? h('a', { href: url, target: '_blank', rel: 'noopener', text: label }) : h('span', { text: label });
  }
  function paragraphs(text, cls) {
    return String(text || '').split(/\n+/).filter(function (t) { return t.trim(); }).map(function (t) {
      return h('p', { class: cls, text: t });
    });
  }
  function weekday(date) { return WEEK[new Date(date + 'T00:00:00Z').getUTCDay()]; }
  function longDate(date) {
    var p = date.split('-');
    return Number(p[0]) + '年' + Number(p[1]) + '月' + Number(p[2]) + '日(' + weekday(date) + ')';
  }
  function shortStamp(iso) { // 2026-11-12T03:00:00+09:00 -> 11/12 03:00
    return iso ? iso.slice(5, 7) + '/' + iso.slice(8, 10) + ' ' + iso.slice(11, 16) : '';
  }
  function postStamp(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }
  function readNick() { try { return localStorage.getItem(NICK_KEY) || ''; } catch (e) { return ''; } }
  function saveNick(value) { try { localStorage.setItem(NICK_KEY, value); } catch (e) { /* 保存できなくても動く */ } }
  function readOrder() { try { return localStorage.getItem(ORDER_KEY) === 'old' ? 'old' : 'new'; } catch (e) { return 'new'; } }
  function saveOrder(value) { try { localStorage.setItem(ORDER_KEY, value); } catch (e) { /* 保存できなくても動く */ } }
  state.order = readOrder();

  // ---- 新着(まだ読んでいないコメント) ----
  // 既読の記録は、見ている人ごとに1つ。since より前のコメントはすべて既読。
  // marks は「日付|項目ID」(日報全体の欄は項目IDが空)ごとの、最後に読んだ時刻。
  // 自分のコメントは、いつも既読として扱う。
  function isUnread(post) {
    var r = state.reads;
    if (!r || !state.me || !state.me.id) return false;
    if (post.author && post.author === state.me.id) return false;
    if (!(post.at > r.since)) return false;
    var mark = r.marks[post.date + '|' + post.item];
    return !(mark && post.at <= mark);
  }
  function isNew(post) { return isUnread(post) || Boolean(state.reads && state.fresh[post.id]); }
  function unreadCounts() {
    var counts = {};
    state.posts.forEach(function (p) { if (isUnread(p)) counts[p.date] = (counts[p.date] || 0) + 1; });
    return counts;
  }
  /** いま見えているコメント欄の新着を、既読にする。開いている項目の欄と、画面に入った「この日の会話」が対象。 */
  function markSeen() {
    if (!state.reads || document.visibilityState !== 'visible') return;
    var ids = itemIds();
    var now = new Date().toISOString();
    // 先に対象を集める(印を付けながら調べると、同じ欄の2件目からが既読に見えてしまう)。
    var seen = state.posts.filter(function (p) {
      if (p.date !== state.date || !isUnread(p)) return false;
      var key = ids[p.item] ? p.item : ''; // 日報から消えた項目へのコメントは「この日の会話」に出ている
      return key === '' ? state.talkSeen : Boolean(state.open[key]);
    });
    if (!seen.length) return;
    seen.forEach(function (p) {
      state.fresh[p.id] = true;
      // ほかの人の時計が進んでいても既読になるよう、コメントの時刻より前には戻さない。
      var k = p.date + '|' + p.item;
      var mark = p.at > now ? p.at : now;
      if (!(state.reads.marks[k] >= mark)) state.reads.marks[k] = mark;
    });
    saveReads();
    renderList();
  }
  function markAllRead() {
    if (!state.reads) return;
    var now = new Date().toISOString();
    var newest = state.posts.length ? state.posts[0].at : '';
    state.reads = { since: newest > now ? newest : now, marks: {} };
    saveReads();
    renderList();
    refreshThreads();
  }
  /** 既読の記録を保存する。同じ記録への書き込みは1つずつ行い、途中で変わった分は終わってからもう一度書く。 */
  function saveReads() {
    if (!state.readsRef || !state.reads) return;
    if (state.readsWriting) { state.readsDirty = true; return; }
    state.readsWriting = true;
    state.readsDirty = false;
    var r = state.reads;
    var marks = Object.keys(r.marks).filter(function (k) { return r.marks[k] > r.since; })
      .map(function (k) { return { k: k, t: r.marks[k] }; });
    state.readsRef.set({ since: r.since, marks: marks }).then(function () {
      state.readsWriting = false;
      if (state.readsDirty) saveReads();
    }, function (error) {
      state.readsWriting = false;
      // 書き込めない人(閲覧だけの招待など)は既読を残せないので、新着の印をやめる。
      if (error && error.code === 'invalid_argument') stopReads();
    });
  }
  function stopReads() {
    state.reads = null;
    state.readsRef = null;
    renderList();
    refreshThreads();
  }
  function startReads() {
    if (!state.db || !state.me || !state.me.id) return;
    try { state.readsRef = state.db.doc('data/users/' + state.me.id + '/reads'); }
    catch (e) { state.readsRef = null; return; }
    state.readsRef.onSnapshot(function (snap) {
      if (!state.readsRef) return;
      var d = (snap.exists && snap.data()) || {};
      // 既読は進むだけなので、手元の記録と保存先の記録の、新しいほうを取る(別の端末で読んだ分も合わさる)。
      var local = state.reads || { since: UNREAD_SINCE, marks: {} };
      var since = typeof d.since === 'string' && d.since > local.since ? d.since : local.since;
      var marks = {};
      Object.keys(local.marks).forEach(function (k) { marks[k] = local.marks[k]; });
      (Array.isArray(d.marks) ? d.marks : []).forEach(function (m) {
        if (!m || typeof m.k !== 'string' || typeof m.t !== 'string') return;
        if (!(marks[m.k] >= m.t)) marks[m.k] = m.t;
      });
      state.reads = { since: since, marks: marks };
      renderList();
      refreshThreads();
    }, function () { stopReads(); });
  }

  // ページの上の「新着コメント」。日をまたいで、まだ読んでいないコメントを新しい順に並べる。
  function itemTitle(date, itemId) {
    var day = NIPPO.days[date];
    if (!day) return null;
    var found = day.specs.concat(day.changes, day.manual ? day.manual.items : []).filter(function (i) { return i.id === itemId; })[0];
    return found ? found.title : '日報から消えた項目';
  }
  var quietLoads = {};
  /** 項目の題名を出すために、表示していない日のデータを読み込む。 */
  function loadDayQuietly(date) {
    if (NIPPO.days[date] || quietLoads[date]) return;
    quietLoads[date] = true;
    var script = document.createElement('script');
    script.src = 'data/' + date + '.js';
    script.onload = function () { refreshNews(); };
    document.head.appendChild(script);
  }
  function refreshNews() {
    var box = document.getElementById('news');
    if (!box) return;
    var known = {};
    NIPPO.index.forEach(function (e) { known[e.date] = true; });
    var list = state.posts.filter(function (p) { return known[p.date] && isUnread(p); });
    var rows = list.slice(0, NEWS_MAX).map(function (p) {
      if (p.item) loadDayQuietly(p.date);
      var where = p.item ? (itemTitle(p.date, p.item) || '項目へのコメント') : 'この日の会話';
      var said = p.text ? p.text.replace(/\s+/g, ' ').slice(0, 60) : '(画像)';
      return { post: p, when: p.date.slice(5).replace('-', '/'), where: where, what: displayName(p) + '「' + said + '」' };
    });
    // 中身が同じなら作り直さない(キーボードで操作している途中に、フォーカスが外れないようにする)。
    var sig = list.length + '\n' + rows.map(function (r) { return r.post.id + r.where + r.what; }).join('\n');
    if (box.getAttribute('data-sig') === sig) return;
    box.setAttribute('data-sig', sig);
    box.textContent = '';
    box.hidden = !list.length;
    if (!list.length) return;
    box.appendChild(h('div', { class: 'news-head' }, [
      h('h2', { text: '新着コメント ' + list.length + '件' }),
      h('button', { type: 'button', class: 'btn', text: 'すべて既読にする', on: { click: markAllRead } }),
    ]));
    box.appendChild(h('ol', { class: 'news-list' }, rows.map(function (r) {
      return h('li', {}, [h('button', { type: 'button', class: 'news-row', on: { click: function () { jumpTo(r.post); } } }, [
        h('span', { class: 'mono when', text: r.when }),
        h('span', { class: 'where', text: r.where }),
        h('span', { class: 'what', text: r.what }),
      ])]);
    })));
    if (list.length > rows.length) box.appendChild(h('p', { class: 'news-more', text: 'ほか ' + (list.length - rows.length) + ' 件。日付の一覧の「新着」から開けます。' }));
  }
  function jumpTo(post) {
    state.jump = { date: post.date, item: post.item };
    if (post.date !== state.date) { location.hash = '#d-' + post.date; return; } // 日付が変わると、表示のあとで applyJump が呼ばれる
    applyJump();
  }
  function applyJump() {
    var j = state.jump;
    if (!j || j.date !== state.date || !NIPPO.days[state.date]) return;
    state.jump = null;
    var target = document.getElementById('talk');
    var inItem = Boolean(j.item && itemIds()[j.item]);
    if (inItem) {
      state.open[j.item] = true;
      refreshThreads();
      var article = document.getElementById('i-' + j.item);
      var slot = article && article.querySelector('.thread-slot');
      // 欄の上には投稿フォームがあるので、新着のコメントがあればそこへ移る。
      target = (slot && slot.querySelector('.post.is-new')) || slot || target;
    }
    if (target) target.scrollIntoView({ block: inItem ? 'center' : 'start' });
  }

  // ---- 日付の一覧 ----
  // ---- 要確認を外す ----
  // 「要確認を外す」ボタンで書いたコメント(close: true)が1件でも残っている項目は「確認済み」と表示する。
  // 日報のデータの needsCheck は変えない。表示だけを、ページを開いたときにコメントから決める。
  function closersOf(date, itemId) {
    return state.posts.filter(function (p) { return p.close && p.date === date && p.item === itemId; })
      .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }
  function openChecks(entry) {
    var ids = entry.needsCheckIds;
    if (!state.db || !Array.isArray(ids)) return entry.counts.needsCheck;
    return ids.filter(function (id) { return !closersOf(entry.date, id).length; }).length;
  }
  function needsCheckItem(itemId) {
    var day = NIPPO.days[state.date];
    return Boolean(day && day.specs.some(function (s) { return s.id === itemId && s.needsCheck; }));
  }
  function refreshChecks() {
    document.querySelectorAll('[data-check]').forEach(function (chip) {
      var closers = closersOf(state.date, chip.getAttribute('data-check'));
      if (closers.length) {
        var names = closers.map(displayName).filter(function (n, i, a) { return a.indexOf(n) === i; });
        chip.className = 'chip checked';
        chip.textContent = '確認済み';
        chip.title = names.join('、') + ' が要確認を外しました';
      } else {
        chip.className = 'chip check';
        chip.textContent = '要確認';
        chip.removeAttribute('title');
      }
    });
  }
  function countFor(date) {
    return state.posts.filter(function (p) { return p.date === date; }).length;
  }
  function renderList() {
    var list = document.getElementById('day-list');
    list.textContent = '';
    var unread = unreadCounts();
    NIPPO.index.forEach(function (entry) {
      var marks = [];
      if (entry.provisional) marks.push(h('span', { class: 'chip prov', text: '暫定' }));
      var open = openChecks(entry);
      if (open) marks.push(h('span', { class: 'chip check', text: '要確認 ' + open }));
      marks.push(h('span', { text: '確定 ' + entry.counts.confirmed + ' ・ 提案 ' + entry.counts.proposed }));
      var comments = state.db ? countFor(entry.date) : 0;
      if (comments) marks.push(h('span', { class: 'mono', text: 'コメント ' + comments }));
      if (unread[entry.date]) marks.push(h('span', { class: 'chip new', text: '新着 ' + unread[entry.date] }));
      list.appendChild(h('li', {}, [
        h('a', { class: 'day-link', href: '#d-' + entry.date, 'aria-current': entry.date === state.date ? 'page' : null }, [
          h('span', {}, [h('span', { class: 'd', text: entry.date.slice(5).replace('-', '/') }), h('span', { class: 'w', text: weekday(entry.date) })]),
          h('span', { class: 'marks' }, marks),
          h('span', { class: 'sum', text: entry.summary }),
        ]),
      ]));
    });
  }

  // ---- 1日分 ----
  // コメント欄の置き場所。key は項目のID、日報全体の欄は空文字。
  function threadSlot(key) {
    var slot = h('div', { class: 'thread-slot', 'data-key': key });
    slot.hidden = !state.db || (key !== '' && !state.open[key]);
    return slot;
  }
  function itemTalk(item) {
    var toggle = h('button', { type: 'button', class: 'btn thread-toggle', 'data-key': item.id, 'aria-expanded': state.open[item.id] ? 'true' : 'false', text: 'コメント' });
    toggle.addEventListener('click', function () {
      if (state.open[item.id]) delete state.open[item.id];
      else state.open[item.id] = true;
      refreshThreads();
      if (state.open[item.id]) {
        var area = document.getElementById('c-' + item.id);
        if (area) area.focus();
      }
    });
    var fresh = h('span', { class: 'chip new', 'data-new': item.id });
    fresh.hidden = true;
    var wrap = h('div', { class: 'item-talk' }, [h('div', { class: 'talk-row' }, [toggle, fresh]), threadSlot(item.id)]);
    wrap.hidden = !state.db;
    return wrap;
  }
  function itemNode(item, chips) {
    var main = [h('h3', { text: item.title })].concat(paragraphs(item.body, 'body'));
    if (item.reason) main.push(h('p', { class: 'reason' }, [h('b', { text: '判定理由 ' }), item.reason]));
    var meta = [];
    if (item.repo) meta.push(h('span', { class: 'mono', text: item.repo }));
    if (item.authors && item.authors.length) meta.push(h('span', { text: item.authors.join('、') }));
    if (meta.length) main.push(h('div', { class: 'meta' }, meta));
    if (item.links && item.links.length) {
      main.push(h('div', { class: 'links' }, item.links.map(function (l) { return link(l.label, l.url); })));
    }
    main.push(itemTalk(item));
    return h('article', { class: 'item', id: 'i-' + item.id }, [h('div', { class: 'side' }, chips), h('div', { class: 'main' }, main)]);
  }
  function block(title, note, nodes, emptyText) {
    var head = [h('h2', { text: title }), h('span', { class: 'count', text: String(nodes.length) })];
    if (note) head.push(h('span', { class: 'note', text: note }));
    var children = [h('div', { class: 'block-head' }, head)];
    if (nodes.length) children = children.concat(nodes);
    else if (emptyText) children.push(h('p', { class: 'empty', text: emptyText }));
    return h('section', { class: 'block' }, children);
  }
  function specNodes(day, status) {
    return day.specs.filter(function (s) { return s.status === status; }).map(function (s) {
      var chips = [h('span', { class: 'chip ' + s.status, text: STATUS[s.status] })];
      if (s.needsCheck) chips.push(h('span', { class: 'chip check', 'data-check': s.id, text: '要確認' }));
      return itemNode(s, chips);
    });
  }

  function renderDay() {
    var main = document.getElementById('day');
    var day = NIPPO.days[state.date];
    main.textContent = '';
    if (!day) return;

    var pos = NIPPO.index.map(function (e) { return e.date; }).indexOf(state.date);
    var newer = pos > 0 ? NIPPO.index[pos - 1].date : null;
    var older = pos >= 0 && pos < NIPPO.index.length - 1 ? NIPPO.index[pos + 1].date : null;
    var pager = [];
    if (older) pager.push(h('a', { href: '#d-' + older, text: '← ' + older.slice(5).replace('-', '/') }));
    if (newer) pager.push(h('a', { href: '#d-' + newer, text: newer.slice(5).replace('-', '/') + ' →' }));

    var headLine = [
      h('span', { class: 'mono', text: shortStamp(day.window.start) + ' → ' + shortStamp(day.window.end) }),
      h('span', { text: '作成 ' + shortStamp(day.generatedAt) }),
    ];
    var news = h('section', { class: 'news', id: 'news', 'aria-label': '新着コメント' });
    news.hidden = true;
    main.appendChild(news);
    var head = [h('h1', { text: longDate(day.date) }), h('div', { class: 'line' }, headLine)];
    if (pager.length) head.push(h('div', { class: 'pager' }, pager));
    if (day.provisional) {
      head.push(h('p', { class: 'notice', text: 'この日はまだ終わっていない時点で作った暫定版です。次に作り直すと内容が変わることがあります。' }));
    }
    main.appendChild(h('header', { class: 'day-head' }, head));

    main.appendChild(h('ol', { class: 'summary' }, day.summary.map(function (s) { return h('li', {}, [h('span', { text: s })]); })));

    var withSpec = day.changes.filter(function (c) { return c.withSpec; }).length;
    main.appendChild(block(
      '確定した仕様',
      withSpec ? '決まったと読み取れるもの。実装も入ったものは「変更内容」にまとめています' : 'mainに入った、または決まったと読み取れるもの',
      specNodes(day, 'confirmed'),
      withSpec ? 'この日に確定した仕様は、どれも実装と一緒に「変更内容」に書いています。' : 'この日に確定した仕様はありません。'
    ));
    main.appendChild(block('提案中の仕様', 'まだ決まっていないもの', specNodes(day, 'proposed'), 'この日に出た提案はありません。'));
    var wip = specNodes(day, 'in_progress');
    if (wip.length) main.appendChild(block('作業中', 'ブランチにだけあるもの', wip));
    var dropped = specNodes(day, 'dropped');
    if (dropped.length) main.appendChild(block('取り下げ', '', dropped));

    if (day.manual && day.manual.items.length) {
      main.appendChild(block('口頭・チャットで決定', 'GitHub上に根拠がありません', day.manual.items.map(function (m) {
        return itemNode(m, [h('span', { class: 'chip manual', text: '手入力' })]);
      })));
    }

    main.appendChild(block('変更内容', withSpec ? '機能ごとにまとめています。「仕様確定」は、決まった仕様とその実装を一緒に書いたもの' : '機能ごとにまとめています', day.changes.map(function (c) {
      var chips = [h('span', { class: 'chip read', text: c.repo.replace(/^kusakari-/, '') })];
      if (c.withSpec) chips.push(h('span', { class: 'chip confirmed', text: '仕様確定' }));
      return itemNode(c, chips);
    }), 'この日の変更はありません。'));

    var talkNew = h('span', { class: 'chip new', 'data-new': '' });
    talkNew.hidden = true;
    var talk = h('section', { class: 'block', id: 'talk' }, [
      h('div', { class: 'block-head' }, [h('h2', { text: 'この日の会話' }), talkNew, h('span', { class: 'note', text: '日報全体についてのコメント' })]),
      threadSlot(''),
    ]);
    talk.hidden = !state.db;
    main.appendChild(talk);

    // 「この日の会話」は、画面に入ったときに既読にする(半分以上、または120px以上が見えたとき)。
    if (talkObserver) talkObserver.disconnect();
    talkObserver = null;
    state.talkSeen = !('IntersectionObserver' in window);
    if (!state.talkSeen) {
      talkObserver = new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        var seen = e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= 120);
        if (seen === state.talkSeen) return;
        state.talkSeen = seen;
        if (seen) refreshThreads();
      }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
      talkObserver.observe(talk);
    }

    refreshThreads();
    applyJump();
  }

  // ---- コメント ----
  // 項目へのコメントは item に項目のIDを、日報全体へのコメントは空文字を入れて保存する。
  function itemIds() {
    var day = NIPPO.days[state.date];
    var ids = {};
    if (!day) return ids;
    day.specs.concat(day.changes, day.manual ? day.manual.items : []).forEach(function (i) { ids[i.id] = true; });
    return ids;
  }
  /** key の欄に出すコメント。作り直しで項目が消えたときは、そのコメントを日報全体の欄に出す。 */
  function postsFor(key, ids) {
    return state.posts.filter(function (p) {
      if (p.date !== state.date) return false;
      if (key !== '') return p.item === key;
      return p.item === '' || !ids[p.item];
    }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }
  function displayName(post) {
    var known = post.author && state.names[post.author];
    return (known && known.name) || post.nick || '名前なし';
  }
  function canWrite() { return state.db && !state.readOnly; }

  function postNode(post) {
    var mine = Boolean(post.author && state.me && state.me.id && post.author === state.me.id);
    var owner = Boolean(state.me && state.me.isOwner);
    var known = post.author && state.names[post.author];
    var dot = h('span', { class: 'dot' });
    if (known && known.color) dot.style.background = known.color;
    var who = [dot, h('span', { class: 'name', text: displayName(post) }), h('span', { class: 'mono', text: postStamp(post.at) })];
    if (post.editedAt) who.push(h('span', { text: '編集済み' }));
    var fresh = isNew(post);
    if (fresh) who.push(h('span', { class: 'tag new', text: '新着' }));
    if (post.close && !post.orphan) who.push(h('span', { class: 'tag ok', text: '要確認を外した' }));
    if (post.orphan) who.push(h('span', { class: 'tag', text: '日報から消えた項目 ' + post.item + ' へのコメント' }));
    var children = [h('div', { class: 'who' }, who)];

    if (state.editing && state.editing.id === post.id) {
      var area = h('textarea', { id: 'edit-' + post.id, maxlength: String(MAX_TEXT), 'aria-label': 'コメントを編集' });
      area.value = state.editing.text;
      area.addEventListener('input', function () { state.editing.text = area.value; });
      children.push(area);
      if (post.images.length) children.push(imagesNode(post));
      children.push(h('div', { class: 'acts' }, [
        h('button', { type: 'button', class: 'btn primary', text: '保存', on: { click: function () { saveEdit(post); } } }),
        h('button', { type: 'button', class: 'btn', text: 'やめる', on: { click: function () { state.editing = null; refreshThreads(); } } }),
      ]));
    } else {
      if (post.text) children.push(h('p', { class: 'text', text: post.text }));
      if (post.images.length) children.push(imagesNode(post));
      var acts = [];
      if (state.confirmDelete === post.id) {
        acts.push(h('span', { text: 'このコメントを消しますか?' }));
        acts.push(h('button', { type: 'button', class: 'btn danger', text: '消す', on: { click: function () { removePost(post); } } }));
        acts.push(h('button', { type: 'button', class: 'btn', text: 'やめる', on: { click: function () { state.confirmDelete = null; refreshThreads(); } } }));
      } else if (canWrite()) {
        if (mine) acts.push(h('button', { type: 'button', class: 'btn', text: '編集', on: { click: function () { state.editing = { id: post.id, text: post.text }; refreshThreads(); } } }));
        if (mine || owner) acts.push(h('button', { type: 'button', class: 'btn', text: '削除', on: { click: function () { state.confirmDelete = post.id; refreshThreads(); } } }));
      }
      if (acts.length) children.push(h('div', { class: 'acts' }, acts));
    }
    return h('div', { class: fresh ? 'post is-new' : 'post' }, children);
  }

  function composerNode(key) {
    var area = h('textarea', {
      id: key ? 'c-' + key : 'c-day',
      maxlength: String(MAX_TEXT),
      placeholder: key ? 'この項目へのコメント' : 'この日の日報へのコメント',
      'aria-label': key ? 'この項目にコメントを書く' : 'この日の日報にコメントを書く',
    });
    var msg = h('p', { class: 'msg', role: 'status' });
    msg.hidden = true;
    var row = [];
    var nick = null;
    // 名前を画面に出せない人(招待のされ方によっては名前が届かない)は、表示名を自分で入れられる。
    if (!(state.me && state.me.name)) {
      nick = h('input', { id: key ? 'n-' + key : 'n-day', type: 'text', maxlength: '30', placeholder: '表示名', 'aria-label': '表示名' });
      nick.value = readNick();
      row.push(nick);
    }
    var send = h('button', { type: 'button', class: 'btn primary', text: '書き込む' });

    // ---- 画像を付ける(画像を保存できる人にだけ出す) ----
    var pending = []; // { file, url } まだ送っていない画像
    var thumbs = h('div', { class: 'thumbs' });
    thumbs.hidden = true;
    function showMsg(text) { msg.textContent = text; msg.hidden = !text; }
    function drawThumbs() {
      thumbs.textContent = '';
      thumbs.hidden = !pending.length;
      pending.forEach(function (p, i) {
        thumbs.appendChild(h('div', { class: 'thumb' }, [
          h('img', { src: p.url, alt: '付ける画像 ' + (i + 1) }),
          h('button', { type: 'button', class: 'btn', text: '外す', 'aria-label': (i + 1) + '枚目の画像を外す', on: { click: function () {
            URL.revokeObjectURL(p.url);
            pending.splice(i, 1);
            drawThumbs();
          } } }),
        ]));
      });
    }
    // Android などでは、選んだ画像の形式(type)が空のまま届くことがある。そのときはファイル名の拡張子で画像かを見る。
    // PNG・JPEG・GIF・WebP 以外の画像(HEIC など)も受け取り、保存の前に JPEG か WebP に変換する(変換できなければ知らせる)。
    function isImageFile(f) {
      if (!f) return false;
      if (/^image\//.test(f.type)) return true;
      return !f.type && /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i.test(f.name || '');
    }
    function addFiles(list, fromPicker) {
      var all = Array.prototype.slice.call(list || []);
      var files = all.filter(isImageFile);
      if (!files.length) {
        if (all.length && fromPicker) showMsg('画像として読み込めないファイルでした。PNG・JPEG・GIF・WebP の画像を選んでください。');
        return false;
      }
      var room = MAX_IMAGES - pending.length;
      if (room <= 0) { showMsg('画像は1つのコメントに' + MAX_IMAGES + '枚までです。'); return true; }
      files.slice(0, room).forEach(function (f) { pending.push({ file: f, url: URL.createObjectURL(f) }); });
      if (files.length > room) showMsg('画像は1つのコメントに' + MAX_IMAGES + '枚までです。');
      drawThumbs();
      return true;
    }
    if (state.assets) {
      // accept は image/* にする。形式を細かく並べると、Android では写真の選択画面ではなくファイルの画面が開き、写真を選べないことがある。
      var picker = h('input', { id: (key ? 'f-' + key : 'f-day'), type: 'file', accept: 'image/*', multiple: true, class: 'file-input', tabindex: '-1', 'aria-hidden': 'true' });
      picker.addEventListener('change', function () {
        showMsg('');
        addFiles(picker.files, true);
        picker.value = '';
      });
      var attach = h('button', { type: 'button', class: 'btn attach', text: '画像を付ける' });
      attach.addEventListener('click', function () { picker.click(); });
      row.push(attach);
      row.push(picker);
      area.addEventListener('paste', function (e) {
        var items = e.clipboardData ? e.clipboardData.files : null;
        if (items && items.length && addFiles(items)) e.preventDefault();
      });
      area.addEventListener('dragover', function (e) { e.preventDefault(); });
      area.addEventListener('drop', function (e) {
        if (e.dataTransfer && addFiles(e.dataTransfer.files)) e.preventDefault();
      });
    }
    // 投稿する操作のボタンはひとまとめにする(1行に収まれば右端、折り返したら次の行の左に並ぶ)。
    var submitGroup = h('div', { class: 'submit' }, [send]);
    row.push(submitGroup);
    // 要確認の項目のコメント欄にだけ、「要確認を外す」ボタンを出す。外す理由を書いてから押す。
    var closeBtn = null;
    if (key && needsCheckItem(key)) {
      closeBtn = h('button', { type: 'button', class: 'btn close-check', text: '要確認を外す' });
      submitGroup.appendChild(closeBtn);
      closeBtn.addEventListener('click', function () { submit(true); });
    }
    send.addEventListener('click', function () { submit(false); });

    function submit(close) {
      var text = area.value.trim();
      if (close && !text) { showMsg('要確認を外す理由を入力してから押してください。'); area.focus(); return; }
      if (!text && !pending.length) { showMsg('コメントを入力してください。'); return; }
      var nickValue = nick ? nick.value.trim() : '';
      if (nick) saveNick(nickValue);
      send.disabled = true;
      if (closeBtn) closeBtn.disabled = true;
      showMsg(pending.length ? '画像を保存しています。' : '');
      var uploaded = [];
      // 画像を1枚ずつ縮めて保存し、そのあとでコメントを書き込む。
      pending.reduce(function (chain, p) {
        return chain.then(function () { return shrinkImage(p.file); })
          .then(function (blob) { return state.assets.upload(blob); })
          .then(function (res) { uploaded.push(res.id); });
      }, Promise.resolve()).then(function () {
        return state.db.collection('posts').add({
          date: state.date,
          item: key,
          text: text.slice(0, MAX_TEXT),
          images: uploaded,
          close: Boolean(close),
          author: (state.me && state.me.id) || null,
          nick: nickValue,
          at: new Date().toISOString(),
        });
      }).then(function () {
        area.value = '';
        pending.forEach(function (p) { URL.revokeObjectURL(p.url); });
        pending = [];
        drawThumbs();
        showMsg('');
        send.disabled = false;
        if (closeBtn) closeBtn.disabled = false;
      }).catch(function (error) {
        // コメントを書き込めなかったときは、このとき保存した画像を消す(どのコメントにも付かない画像を残さない)。
        if (uploaded.length && state.assets) uploaded.forEach(function (id) { state.assets.delete(id).catch(function () {}); });
        send.disabled = false;
        if (closeBtn) closeBtn.disabled = false;
        showMsg((error && error.code && IMAGE_ERRORS[error.code]) || writeError(error));
        if (state.readOnly) refreshThreads();
      });
    }
    var parts = [area, thumbs, h('div', { class: 'row' }, row)];
    // Android の Claude アプリでは、画像を選ぶ画面が開かない(アプリの中のブラウザが対応していない)。そのときだけ案内を出す。
    if (state.assets && inAndroidApp()) {
      parts.push(h('p', { class: 'app-hint', text: 'Android の Claude アプリでは画像を選べません。Chrome で claude.ai を開くと付けられます。' }));
    }
    parts.push(msg);
    return h('div', { class: 'composer' }, parts);
  }

  // ---- 画像 ----
  /** Android のアプリの中のブラウザ(WebView)で開いているか。WebView は User-Agent に「; wv)」を含む。Chrome は含まない。 */
  function inAndroidApp() {
    var ua = navigator.userAgent || '';
    return /Android/.test(ua) && /; wv\)/.test(ua);
  }
  /** 大きい画像は、長い辺を IMAGE_MAX_SIDE までに縮めてから保存する。GIF は動きを残すためそのまま。 */
  function shrinkImage(file) {
    if (file.type === 'image/gif') return Promise.resolve(file);
    // 保存できる形式でない(形式が空、HEIC など)ときは、必ず変換する。
    var mustConvert = IMAGE_TYPES.indexOf(file.type) < 0;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, hgt = img.naturalHeight;
        var scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(w, hgt));
        if (!mustConvert && scale === 1 && file.size <= IMAGE_KEEP_BYTES) { resolve(file); return; }
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(hgt * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          // WebP で書き出せないブラウザは PNG を返すので、そのときは JPEG にする。
          if (blob && blob.type === 'image/webp') { resolve(blob); return; }
          canvas.toBlob(function (jpeg) {
            if (jpeg) resolve(jpeg);
            else if (mustConvert) reject({ code: 'unsupported_type' });
            else resolve(file);
          }, 'image/jpeg', 0.85);
        }, 'image/webp', 0.85);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        // このブラウザで開けない形式(HEIC など)。そのまま送っても保存できないので、知らせる。
        if (mustConvert) reject({ code: 'unsupported_type' });
        else resolve(file);
      };
      img.src = url;
    });
  }
  function imagesNode(post) {
    return h('div', { class: 'images' }, post.images.map(function (id, i) {
      var big = state.bigImage === id;
      var img = h('img', { src: '/_blob/' + id, alt: displayName(post) + 'さんが付けた画像 ' + (i + 1), loading: 'lazy' });
      img.addEventListener('error', function () {
        var box = img.parentNode;
        if (box) { box.textContent = ''; box.appendChild(h('span', { class: 'img-missing', text: '画像を表示できません' })); }
      });
      return h('button', {
        type: 'button', class: 'img-btn' + (big ? ' big' : ''), 'aria-expanded': big ? 'true' : 'false',
        'aria-label': big ? '画像を小さく戻す' : '画像を大きく表示する',
        on: { click: function () { state.bigImage = big ? null : id; refreshThreads(); } },
      }, [img]);
    }));
  }
  function writeError(error) {
    if (error && error.code === 'invalid_argument') {
      state.readOnly = true;
      return '書き込めませんでした。このページに「編集者」として招待されている人だけが書き込めます。';
    }
    if (error && error.code === 'quota_exceeded') return '保存できる量の上限に達しています。古いコメントを消すと書き込めます。';
    return '書き込めませんでした。少し待ってからもう一度試してください。';
  }
  function saveEdit(post) {
    var text = (state.editing ? state.editing.text : '').trim();
    if (!text) return;
    state.db.doc('posts/' + post.id).update({ text: text.slice(0, MAX_TEXT), editedAt: new Date().toISOString() })
      .then(function () { state.editing = null; refreshThreads(); })
      .catch(function (error) { state.editing = null; state.notice = writeError(error); refreshThreads(); });
  }
  function removePost(post) {
    state.db.doc('posts/' + post.id).delete()
      .then(function () {
        // コメントと一緒に、付けた画像も消す(元に戻せない)。画像を保存できない人の削除では画像は残る。
        if (state.assets) post.images.forEach(function (id) { state.assets.delete(id).catch(function () {}); });
        state.confirmDelete = null;
        refreshThreads();
      })
      .catch(function (error) { state.confirmDelete = null; state.notice = writeError(error); refreshThreads(); });
  }

  /** コメント欄をすべて、いまのコメントで描き直す。書きかけの入力欄は作り直さない。 */
  function refreshThreads() {
    if (!state.db) return;
    if (!NIPPO.days[state.date]) return;
    var ids = itemIds();
    markSeen();
    document.querySelectorAll('.thread-toggle').forEach(function (btn) {
      var key = btn.getAttribute('data-key');
      var n = postsFor(key, ids).length;
      btn.textContent = state.open[key] ? 'コメントを閉じる' : (n ? 'コメント ' + n : 'コメントする');
      btn.setAttribute('aria-expanded', state.open[key] ? 'true' : 'false');
    });
    document.querySelectorAll('.thread-slot').forEach(function (slot) {
      var key = slot.getAttribute('data-key') || '';
      var visible = key === '' || Boolean(state.open[key]);
      slot.hidden = !visible;
      if (visible) renderThread(slot, key, ids);
    });
    document.querySelectorAll('[data-new]').forEach(function (chip) {
      var n = postsFor(chip.getAttribute('data-new'), ids).filter(isUnread).length;
      chip.hidden = !n;
      chip.textContent = '新着 ' + n;
    });
    refreshNews();
    refreshChecks();
    state.notice = null;
  }
  /** 並び順の切り替え。選んだ順は、開いているすべてのコメント欄に効き、次に開いたときも同じ順になる。 */
  function sortNode() {
    function button(order, label) {
      return h('button', { type: 'button', class: 'btn', 'data-order': order, 'aria-pressed': 'false', text: label, on: { click: function () {
        if (state.order === order) return;
        state.order = order;
        saveOrder(order);
        refreshThreads();
      } } });
    }
    return h('div', { class: 'sort', role: 'group', 'aria-label': 'コメントの並び順' }, [
      h('span', { class: 'sort-label', text: '並び順' }),
      button('new', '新しい順'),
      button('old', '古い順'),
    ]);
  }
  function renderThread(slot, key, ids) {
    var posts = postsFor(key, ids).map(function (p) {
      return key === '' && p.item ? Object.assign({}, p, { orphan: true }) : p;
    });

    if (state.order === 'new') posts.reverse(); // postsFor は古い順で返す

    // 上から、投稿フォーム(.foot)、並び順の切り替え(.sort)、コメントの一覧(.posts)。
    // 投稿フォームと並び順のボタンは、書きかけの入力やフォーカスを失わないよう、作り直さない。
    var thread = slot.querySelector(':scope > .thread');
    if (!thread) {
      thread = h('div', { class: 'thread' }, [h('div', { class: 'foot' }), sortNode(), h('div', { class: 'posts' })]);
      slot.appendChild(thread);
    }

    var sort = thread.querySelector('.sort');
    sort.hidden = posts.length < 2; // 並べ替えるものが無いときは出さない
    sort.querySelectorAll('button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-order') === state.order ? 'true' : 'false');
    });

    var list = thread.querySelector('.posts');
    list.textContent = '';
    if (state.notice) list.appendChild(h('p', { class: 'msg', text: state.notice }));
    if (!state.loaded) list.appendChild(h('p', { class: 'hint', text: state.slow ? 'コメントをまだ読み込めていません。通信の状態を確認してください。' : 'コメントを読み込んでいます。' }));
    else if (!posts.length) list.appendChild(h('p', { class: 'hint', text: 'まだコメントはありません。気づいたことや質問を書けます。' }));
    posts.forEach(function (p) { list.appendChild(postNode(p)); });

    var foot = thread.querySelector('.foot');
    if (state.readOnly) {
      foot.textContent = '';
      foot.appendChild(h('p', { class: 'hint', text: 'このページに「編集者」として招待されている人だけが書き込めます。' }));
    } else if (!foot.querySelector('.composer')) {
      foot.textContent = '';
      foot.appendChild(composerNode(key));
    }
  }

  function resolveNames() {
    if (!state.user) return;
    var ids = {};
    state.posts.forEach(function (p) { if (p.author) ids[p.author] = true; });
    var list = Object.keys(ids);
    if (!list.length) return;
    state.user.profiles(list).then(function (profiles) {
      var changed = false;
      list.forEach(function (id) {
        var p = profiles[id];
        if (!p) return;
        var before = state.names[id];
        if (!before || before.name !== p.name || before.color !== p.color) { state.names[id] = { name: p.name, color: p.color }; changed = true; }
      });
      if (changed) refreshThreads();
    });
  }

  function startComments() {
    var claude = window.claude;
    if (!claude || typeof claude.use !== 'function') return; // 手元のファイルを開いたとき。コメント欄は出さない
    // 画像の保存先は編集者にだけ渡される。ほかの人は null で、画像を見ることだけできる。
    var assetsReady = claude.use('assets').catch(function () { return null; });
    Promise.all([claude.use('db'), claude.use('user'), assetsReady]).then(function (found) {
      var db = found[0];
      if (!db) return;
      state.db = db;
      state.user = found[1];
      state.assets = found[2] || null;
      var whoAmI = state.user ? state.user.me() : Promise.resolve(null);
      whoAmI.then(function (me) {
        state.me = me;
        document.querySelectorAll('.item-talk, #talk').forEach(function (n) { n.hidden = false; });
        startReads();
        var timer = setTimeout(function () { state.slow = true; refreshThreads(); }, 10000);
        // 購読は1回だけ。新しい順に1000件までを受け取り、日付や項目ごとの絞り込みは画面側でする。
        db.collection('posts').orderBy('at', 'desc').limit(1000).onSnapshot(function (snap) {
          state.posts = snap.docs.map(function (doc) {
            var d = doc.data() || {};
            return {
              id: doc.id,
              date: String(d.date || ''),
              item: String(d.item || ''),
              text: String(d.text || ''),
              close: d.close === true,
              images: Array.isArray(d.images) ? d.images.filter(function (id) { return typeof id === 'string' && /^[0-9a-f]{32}$/.test(id); }).slice(0, MAX_IMAGES) : [],
              author: typeof d.author === 'string' ? d.author : null,
              nick: String(d.nick || '').slice(0, 30),
              at: String(d.at || ''),
              editedAt: d.editedAt ? String(d.editedAt) : null,
            };
          });
          if (!snap.metadata.fromCache) { clearTimeout(timer); state.slow = false; }
          state.loaded = true;
          renderList();
          refreshThreads();
          resolveNames();
        }, function () {
          clearTimeout(timer);
          state.loaded = true;
          state.notice = 'コメントを読み込めませんでした。';
          refreshThreads();
        });
        refreshThreads();
      });
    });
  }

  // ---- 日付の切り替え ----
  function dateFromHash() {
    var m = /^#d-(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
    return m ? m[1] : null;
  }
  function show(date) {
    state.date = date;
    state.editing = null;
    state.confirmDelete = null;
    state.open = {};
    state.fresh = {};
    state.talkSeen = false;
    renderList();
    document.getElementById('days').classList.remove('open');
    document.getElementById('days-toggle').setAttribute('aria-expanded', 'false');
    var main = document.getElementById('day');
    if (NIPPO.days[date]) { renderDay(); return; }
    main.textContent = '';
    main.appendChild(h('p', { class: 'empty', text: date + ' の日報を読み込んでいます。' }));
    var script = document.createElement('script');
    script.src = 'data/' + date + '.js';
    script.onload = function () { if (state.date === date) renderDay(); };
    script.onerror = function () {
      if (state.date !== date) return;
      main.textContent = '';
      main.appendChild(h('p', { class: 'empty', text: date + ' の日報が見つかりません。' }));
    };
    document.head.appendChild(script);
  }
  function route() {
    var known = NIPPO.index.map(function (e) { return e.date; });
    var wanted = dateFromHash();
    if (!known.length) {
      renderList();
      var main = document.getElementById('day');
      main.textContent = '';
      main.appendChild(h('p', { class: 'empty', text: 'まだ日報がありません。/daily-report を実行すると、ここに1日分が追加されます。' }));
      return;
    }
    show(wanted && known.indexOf(wanted) >= 0 ? wanted : known[0]);
  }

  document.getElementById('days-toggle').addEventListener('click', function () {
    var open = document.getElementById('days').classList.toggle('open');
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('hashchange', route);
  // ほかのタブから戻ったときに、開いているコメント欄の新着を既読にする。
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refreshThreads(); });
  route();
  startComments();
})();
