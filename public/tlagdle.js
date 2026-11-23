(function () {
'use strict';

var DICT = 'https://conlangatucsd.com/tlag/data/dictionary.json';
var GLOSS = 'https://conlangatucsd.com/tlag/gloss/?w=';
var SHARE_URL = 'https://tlagdle.conlangatucsd.com';
var LAUNCH = '2026-11-24';
var TZ = 'America/Los_Angeles';
var MAXG = 6, WINDOW = 120, SALT = 'tlagdle-v1';
var TILE_RE = /aa|ts|tl|[\s\S]/g; 
var VOWELS = ['i', 'e', 'a', 'aa', 'v', 'o', 'u'];
var CONS = ['m', 'n', 'g', 'p', 't', 'k', 'b', 'f', 'ts', 'tl', 's', 'z', 'c', 'x', 'h', 'j', 'r', 'l'];
var EMOJI = ['⬛', '🟨', '🟪'];
var STORE = 'tlagdle:v1';

var W, G, KEYS = {}, CHARS = '', flip = -1, toastTimer;
var store;
try { store = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { store = {}; }
store.days = store.days || {};
store.stats = store.stats || { played: 0, won: 0, streak: 0, best: 0, last: '', dist: [0, 0, 0, 0, 0, 0] };

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function tok(s) { return String(s).toLowerCase().match(TILE_RE) || []; }
function save() {
  Object.keys(store.days).sort().slice(0, -30).forEach(function (k) { delete store.days[k]; });
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) {}
}
function unfocus(b) { try { if (!b.matches(':focus-visible')) b.blur(); } catch (e) { b.blur(); } }
function toast(m) {
  var t = $('toast');
  t.textContent = m; t.className = 'toast on';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, 1800);
}

function dayNum(s) { var p = s.split('-'); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); }

function pacific() {
  var o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
  return { date: o.year + '-' + o.month + '-' + o.day, left: 86400 - ((o.hour % 24) * 3600 + o.minute * 60 + +o.second) };
}

function hash(s) {
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function answerFor(pool, date) {
  var n = dayNum(date), start = Math.min(dayNum(LAUNCH), n);
  var win = Math.min(WINDOW, pool.length >> 1), recent = [], blocked = {}, pick, best;
  for (var d = start; d <= n; d++) {
    pick = null; best = -1;
    for (var i = 0; i < pool.length; i++) {
      if (blocked[pool[i].key]) continue;
      var h = hash(SALT + '|' + d + '|' + pool[i].key);
      if (h > best) { best = h; pick = pool[i]; }
    }
    recent.push(pick.key); blocked[pick.key] = 1;
    if (recent.length > win) delete blocked[recent.shift()];
  }
  return pick;
}

function build(dict) {
  var count = {}, all = [], by = Object.create(null), guess = [];
  dict.entries.forEach(function (e) {
    var t = (e.t || '').trim();
    if (!t || /[\s\-'’]/.test(t)) return;
    var k = t.toLowerCase();
    count[k] = (count[k] || 0) + 1;
    all.push({
      key: k, text: t, tiles: tok(k), pos: e.pos || '', cats: e.cats || [], ety: e.ety || '', ipa: e.ipa || '', ex: e.ex || [],
      en: e.en || String(e.enHtml || '').replace(/<[^>]*>/g, ''), hasEn: !!e.en,
      proper: t !== k || e.pos === 'Proper noun'
    });
  });
  all.forEach(function (w) { if (!by[w.key]) { by[w.key] = w; guess.push(w); } });
  var pool = guess.filter(function (w) {
    var n = w.tiles.length;
    return count[w.key] === 1 && !w.proper && w.pos && w.hasEn && n >= 4 && n <= 6;
  });
  return { by: by, guess: guess, pool: pool };
}

function feedback(g, a) {
  var r = [], left = {};
  g.forEach(function (t, i) {
    if (t === a[i]) r[i] = 2;
    else { r[i] = 0; left[a[i]] = (left[a[i]] || 0) + 1; }
  });
  g.forEach(function (t, i) { if (r[i] !== 2 && left[t] > 0) { r[i] = 1; left[t]--; } });
  return r;
}

function mask(en) {
  var pre = /^to\s/i.test(en) ? en.slice(0, 3) : '';
  return pre + en.slice(pre.length).replace(/\p{L}+/gu, function (m) { return m[0] + '•'.repeat(m.length - 1); });
}

function status() {
  G.won = G.guesses.some(function (g) { return g.w === G.answer; });
  G.over = G.won || G.guesses.length >= MAXG;
}

function finish() {
  var d = store.days[G.date], s = store.stats;
  if (d.done) return;
  d.done = 1; s.played++;
  if (G.won) {
    s.won++; s.dist[G.guesses.length - 1]++;
    s.streak = s.last && dayNum(G.date) - dayNum(s.last) === 1 ? s.streak + 1 : 1;
    s.last = G.date; s.best = Math.max(s.best, s.streak);
  } else s.streak = 0;
}

function add(s) {
  if (G.over || tok(G.cur + s).length > G.len) return;
  G.cur += s.toLowerCase(); render();
}
function del() { var t = tok(G.cur); t.pop(); G.cur = t.join(''); render(); }

function submit() {
  if (G.over) return;
  if (tok(G.cur).length < G.len) return toast('Not enough tiles');
  var w = W.by[G.cur];
  if (!w || w.tiles.length !== G.len) return toast('Not in the Tlag dictionary');
  if (G.guesses.some(function (g) { return g.w === w; })) return toast('Already guessed');
  G.guesses.push({ w: w, fb: feedback(w.tiles, G.answer.tiles) });
  G.cur = '';
  (store.days[G.date] = store.days[G.date] || { g: [] }).g.push(w.key);
  status();
  if (G.over) finish();
  save();
  flip = G.guesses.length - 1;
  render();
}

function render() {
  var board = $('board'), n = G.guesses.length;
  board.style.setProperty('--n', G.len); board.textContent = '';
  for (var r = 0; r < MAXG; r++) {
    var row = el('div', 'row'), g = G.guesses[r], cur = r === n && !G.over ? tok(G.cur) : [];
    row.setAttribute('role', 'row');
    for (var c = 0; c < G.len; c++) {
      var txt = g ? g.w.tiles[c] : cur[c] || '', t = el('div', 'tile', txt);
      t.setAttribute('role', 'gridcell');
      if (g) {
        t.className += ' s' + g.fb[c];
        t.setAttribute('aria-label', txt + ', ' + ['not in the word', 'in the word', 'correct'][g.fb[c]]);
        if (r === flip) { t.className += ' flip'; t.style.animationDelay = c * 0.12 + 's'; }
      } else if (txt) t.className += ' fill';
      row.appendChild(t);
    }
    board.appendChild(row);
  }
  flip = -1;

  var ks = {};
  G.guesses.forEach(function (g) { g.w.tiles.forEach(function (t, i) { ks[t] = Math.max(ks[t] == null ? -1 : ks[t], g.fb[i]); }); });
  Object.keys(KEYS).forEach(function (t) { KEYS[t].className = 'key' + (ks[t] != null ? ' s' + ks[t] : ''); });

  $('meta').textContent = 'Puzzle ' + G.no + ': a word with ' + G.len + ' tiles';
  renderHints(); renderSugg(); renderResult();
  if ($('list').open) renderList();
}

function renderHints() {
  var h = $('hints'), a = G.answer, n = G.guesses.length;
  h.hidden = G.over; h.textContent = '';
  [['Part of speech', 0, a.pos.toLowerCase()],
   ['Category', 2, a.cats.join(', ') || 'none listed'],
   ['Origin', 3, a.ety || 'none recorded'],
   ['Meaning, first letters', 4, mask(a.en)],
   ['Meaning', 5, a.en]].forEach(function (x) {
    var li = el('li');
    li.appendChild(el('b', '', x[0]));
    li.appendChild(n >= x[1] ? el('span', 'val', x[2]) : el('span', 'lock', 'unlocks after guess ' + x[1]));
    h.appendChild(li);
  });
}

function renderSugg() {
  var box = $('sugg'), q = G.cur.toLowerCase();
  box.textContent = '';
  if (G.over || !q) return;
  var m = G.words.filter(function (w) { return w.key.indexOf(q) === 0; });
  if (!m.length) { box.textContent = 'No ' + G.len + '-tile Tlag word starts with “' + G.cur + '”.'; return; }
  m.slice(0, 8).forEach(function (w) {
    var b = el('button', 'sug', w.key + ' · ' + w.en);
    b.type = 'button';
    b.onclick = function () { G.cur = w.key; render(); unfocus(b); };
    box.appendChild(b);
  });
}

function renderList() {
  var q = $('q').value.trim().toLowerCase(), ul = $('words');
  ul.textContent = '';
  G.words.forEach(function (w) {
    if (q && w.key.indexOf(q) < 0 && w.en.toLowerCase().indexOf(q) < 0) return;
    var used = G.guesses.some(function (g) { return g.w === w; });
    var li = el('li'), b = el('button', 'wi' + (used ? ' used' : ''));
    b.type = 'button';
    b.appendChild(el('strong', '', w.key));
    b.appendChild(document.createTextNode(' ' + w.en + (w.pos ? ' (' + w.pos.toLowerCase() + ')' : '')));
    b.onclick = function () { if (!G.over) { G.cur = w.key; render(); } unfocus(b); };
    li.appendChild(b); ul.appendChild(li);
  });
}

function streak() {
  var s = store.stats;
  return s.last && dayNum(G.date) - dayNum(s.last) <= 1 ? s.streak : 0;
}

function renderResult() {
  var r = $('result'), a = G.answer, s = store.stats;
  r.hidden = !G.over;
  if (!G.over) return;
  r.textContent = '';
  r.appendChild(el('h2', '', G.won ? 'Solved in ' + G.guesses.length + ' of ' + MAXG : 'Not this time'));
  r.appendChild(el('p', 'word', a.text));
  if (a.ipa) r.appendChild(el('p', 'muted', a.ipa));
  r.appendChild(el('p', '', a.en + (a.pos ? ' (' + a.pos.toLowerCase() + ')' : '')));
  if (a.ety) r.appendChild(el('p', 'muted', 'Origin: ' + a.ety));
  var x = a.ex[0];
  if (x && x.tlag) r.appendChild(el('p', 'muted', 'Example: ' + x.tlag + (x.gloss ? ' (' + x.gloss + ')' : '')));
  var acts = el('div', 'acts'), sh = el('button', 'btn btn--small', 'Copy result');
  sh.type = 'button'; sh.onclick = share;
  var lk = el('a', 'btn btn--small', 'See it in the dictionary');
  lk.href = GLOSS + encodeURIComponent(a.text); lk.target = '_blank'; lk.rel = 'noopener';
  acts.appendChild(sh); acts.appendChild(lk); r.appendChild(acts);
  r.appendChild(el('p', 'muted', 'Played ' + s.played + ', won ' + s.won + '. Current streak ' + streak() + ', best ' + s.best + '.'));
  r.appendChild(el('p', 'muted')).id = 'cd';
}

function share() {
  var txt = 'Tlagdle #' + G.no + ' ' + (G.won ? G.guesses.length : 'X') + '/' + MAXG + '\n' +
    G.guesses.map(function (g) { return g.fb.map(function (f) { return EMOJI[f]; }).join(''); }).join('\n') + '\n' + SHARE_URL;
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
    .then(function () { toast('Copied to clipboard'); }, function () { toast('Could not copy'); });
}

function buildKeys() {
  var set = {}, v, c, rows = [];
  W.guess.forEach(function (w) { w.tiles.forEach(function (t) { set[t] = 1; }); });
  CHARS = Object.keys(set).join('');
  v = VOWELS.filter(function (t) { return set[t]; });
  c = CONS.filter(function (t) { return set[t]; });
  Object.keys(set).sort().forEach(function (t) { if (v.indexOf(t) < 0 && c.indexOf(t) < 0) c.push(t); });
  rows.push(v);
  for (var i = 0; i < c.length; i += 7) rows.push(c.slice(i, i + 7));
  var kb = $('kb');
  rows.forEach(function (tiles) {
    var row = el('div', 'kr');
    tiles.forEach(function (t) {
      var b = el('button', 'key', t);
      b.type = 'button'; KEYS[t] = b;
      b.onclick = function () { add(t); unfocus(b); };
      row.appendChild(b);
    });
    kb.appendChild(row);
  });
  var act = el('div', 'kr'), en = el('button', 'key wide', 'Enter'), bs = el('button', 'key wide', 'Delete');
  en.type = bs.type = 'button';
  en.onclick = function () { submit(); unfocus(en); };
  bs.onclick = function () { del(); unfocus(bs); };
  act.appendChild(en); act.appendChild(bs); kb.appendChild(act);
}

document.addEventListener('keydown', function (e) {
  if (!G || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  var k = e.key;
  if (k === 'Enter') { if (!/BUTTON|SUMMARY|^A$/.test(e.target.tagName)) submit(); }
  else if (k === 'Backspace') del();
  else if (k.length === 1 && CHARS.indexOf(k.toLowerCase()) > -1) add(k);
});

$('q').addEventListener('input', renderList);
$('list').addEventListener('toggle', function () { if ($('list').open) renderList(); });
$('list').querySelector('summary').addEventListener('click', function () { unfocus(this); });

setInterval(function () {
  var c = $('cd'), p = pacific();
  if (!G || !c) return;
  if (p.date !== G.date) { c.textContent = 'A new word is ready. Reload the page to play it.'; return; }
  c.textContent = 'Next word in ' + [p.left / 3600 | 0, (p.left % 3600) / 60 | 0, p.left % 60]
    .map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':');
}, 1000);

fetch(DICT, { cache: 'no-cache' })
  .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(function (dict) {
    W = build(dict);
    var p = pacific(), answer = answerFor(W.pool, p.date);
    G = { date: p.date, no: dayNum(p.date) - dayNum(LAUNCH) + 1, answer: answer, len: answer.tiles.length, guesses: [], cur: '' };
    G.words = W.guess.filter(function (w) { return w.tiles.length === G.len; });
    ((store.days[G.date] || {}).g || []).forEach(function (k) {
      var w = W.by[k];
      if (w && w.tiles.length === G.len) G.guesses.push({ w: w, fb: feedback(w.tiles, answer.tiles) });
    });
    status();
    if (G.over) { store.days[G.date] = store.days[G.date] || { g: [] }; finish(); save(); }
    if (store.stats.played > 0) $('how').open = false;
    buildKeys();
    $('msg').hidden = true; $('game').hidden = false;
    render();
  })
  .catch(function () {
    $('msg').textContent = 'Could not load the Tlag dictionary from conlangatucsd.com. Check your connection and reload.';
  });
})();
