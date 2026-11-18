// Token Radar dashboard: board, detail view, filters, live-token evidence, model.
// Reads window.RADAR (written by main.ts from the same board as board.json). No network:
// no fetch, no links out, everything on this page.
(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  var meta = document.getElementById('meta');
  if (!R) {
    app.innerHTML = '<p class="empty">No data found. Run main.ts to write data.js beside this page.</p>';
    return;
  }
  var rows = R.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  meta.textContent = 'Snapshot ' + R.as_of + ' \u00b7 ' + R.rows.length + ' pre-token protocols ranked \u00b7 ' +
    R.watchlist_size + ' on the watchlist, ' + R.early_size + ' early finds below the floor \u00b7 ' +
    R.live.length + ' live-token protocols as market evidence \u00b7 model ' + R.model_version;

  function money(v) {
    if (v === null || v === undefined) return '\u2014';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function moneyFull(v) {
    if (v === null || v === undefined) return '\u2014';
    return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pct(v) {
    if (v === null || v === undefined) return '\u2014';
    var s = (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v >= 0 ? 'up' : 'down') + '">' + s + '</span>';
  }
  function ageText(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d < 30) return d + ' days';
    if (d < 365) return Math.round(d / 30) + ' mo';
    return (d / 365).toFixed(1) + ' yr';
  }
  function catName(c) { return c || 'Uncategorized'; }

  var categories = [];
  rows.forEach(function (r) { if (categories.indexOf(catName(r.category)) < 0) categories.push(catName(r.category)); });
  categories.sort();
  var chains = [];
  rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
  chains.sort();
  var watchSet = {};
  // The watchlist is the floor: rows whose rank sits in the top watchlist_size are not the
  // watchlist itself, so the flag travels in data.js rows only via this set built from board order.
  // (The board file itself carries token_status; here we mark watchlist rows by their slug set.)
  (R.watchlist_slugs || []).forEach(function (s) { watchSet[s] = true; });

  var state = { q: '', cat: 'all', chain: 'all', minTvl: 0, watchOnly: false, sort: 'value' };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.cat !== 'all' && catName(r.category) !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.watchOnly && !watchSet[r.slug]) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'change') return (b.change_7d || 0) - (a.change_7d || 0);
      if (key === 'age') return (b.age_days || 0) - (a.age_days || 0);
      if (key === 'name') return a.name < b.name ? -1 : 1;
      return a.rank - b.rank;
    });
    return list;
  }

  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }

  function boardHTML() {
    var list = filtered();
    var h = '<div class="controls">' +
      '<div><label>Search</label><input type="search" id="f-q" placeholder="name or slug" value="' + esc(state.q) + '"></div>' +
      '<div><label>Category</label><select id="f-cat">' + opt('all', 'All categories', state.cat === 'all') +
      categories.map(function (c) { return opt(c, c, state.cat === c); }).join('') + '</select></div>' +
      '<div><label>Chain</label><select id="f-chain">' + opt('all', 'All chains', state.chain === 'all') +
      chains.map(function (c) { return opt(c, c, state.chain === c); }).join('') + '</select></div>' +
      '<div><label>Min TVL</label><select id="f-tvl">' +
      opt('0', 'Any', state.minTvl === 0) + opt('50000000', '$50M+', state.minTvl === 50000000) +
      opt('100000000', '$100M+', state.minTvl === 100000000) + opt('500000000', '$500M+', state.minTvl === 500000000) +
      opt('1000000000', '$1B+', state.minTvl === 1000000000) + '</select></div>' +
      '<div><label>Sort by</label><select id="f-sort">' +
      opt('value', 'Implied value', state.sort === 'value') + opt('tvl', 'TVL', state.sort === 'tvl') +
      opt('change', '7-day change', state.sort === 'change') + opt('age', 'Age', state.sort === 'age') +
      opt('name', 'Name', state.sort === 'name') + '</select></div>' +
      '<label class="check"><input type="checkbox" id="f-watch"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '</div>' +
      '<p class="count">Showing <b>' + list.length + '</b> of ' + rows.length + ' ranked protocols' +
      (state.cat !== 'all' ? ' \u00b7 category <b>' + esc(state.cat) + '</b>' : '') +
      (state.chain !== 'all' ? ' \u00b7 chain <b>' + esc(state.chain) + '</b>' : '') + '.</p>';
    if (!list.length) return h + '<p class="empty">Nothing matches these filters.</p>' + modelHTML() + liveHTML();
    h += '<table><thead><tr><th>#</th><th>Protocol</th><th class="num">TVL</th><th class="num">7d</th>' +
      '<th class="num hide">Age</th><th class="num">Implied value</th></tr></thead><tbody>';
    list.forEach(function (r) {
      h += '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b>' +
        (watchSet[r.slug] ? '<span class="badge watch">watchlist</span>' : '<span class="badge">early</span>') +
        '<span class="sub">' + esc(catName(r.category)) + ' \u00b7 ' +
        esc(r.chains.slice(0, 3).join(', ') || 'no chain listed') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num hide">' + ageText(r.age_days) + '</td>' +
        '<td class="num value">' + money(r.implied_value_usd) + '</td></tr>';
    });
    h += '</tbody></table>' + modelHTML() + liveHTML();
    return h;
  }

  function detailHTML(r) {
    var steps = r.farm_steps.map(function (s) {
      var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
      if (!m) return '<li>' + esc(s) + '</li>';
      return '<li>' + esc(m[1]) + ' <span class="cost">Cost: ' + esc(m[2]) + '. Time: ' + esc(m[3]) + '.</span></li>';
    }).join('');
    return '<a class="back" href="#board">&larr; Back to the board</a>' +
      '<section class="detail"><h2>#' + r.rank + ' &middot; ' + esc(r.name) + '</h2>' +
      '<div class="facts"><span>Category <b>' + esc(catName(r.category)) + '</b></span>' +
      '<span>Chains <b>' + esc(r.chains.join(', ') || 'not listed') + '</b></span>' +
      '<span>TVL <b>' + moneyFull(r.tvl_usd) + '</b></span>' +
      '<span>7-day TVL <b>' + (r.change_7d === null ? 'not reported' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') + '</b></span>' +
      '<span>Tracked since <b>' + esc(r.listed_at || 'not reported') + '</b> (' + ageText(r.age_days) + ')</span>' +
      '<span>Token <b>none on record</b></span></div>' +
      '<div class="big">' + moneyFull(r.implied_value_usd) + ' <small>implied value &mdash; the board&rsquo;s central estimate for this protocol&rsquo;s token, if it ever issues one</small></div>' +
      '<div class="modelbox"><table><thead><tr><th>Model step</th><th class="num">Figure</th><th>What it means</th></tr></thead><tbody>' +
      '<tr><td>Size curve at this TVL</td><td class="num">&times;' + r.size_multiple.toFixed(3) + '</td><td>Market multiple for a protocol of this size (base ' + moneyFull(Math.round(r.tvl_usd * r.size_multiple)) + ')</td></tr>' +
      '<tr><td>Category factor</td><td class="num">&times;' + r.category_factor.toFixed(3) + '</td><td>' + esc(catName(r.category)) + ' peers trade at this much of the curve</td></tr>' +
      '<tr><td>7-day momentum</td><td class="num">&times;' + r.growth_multiplier.toFixed(3) + '</td><td>TVL moved ' + (r.change_7d === null ? 'unreported' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + ' in 7 days, at half weight</td></tr>' +
      '<tr><td>Maturity</td><td class="num">&times;' + r.maturity_multiplier.toFixed(3) + '</td><td>' + ageText(r.age_days) + ' of track record</td></tr>' +
      '<tr><td>Chain reach</td><td class="num">&times;' + r.chains_multiplier.toFixed(3) + '</td><td>' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</td></tr>' +
      '</tbody></table></div>' +
      '<h3>How to farm it</h3><ol class="steps">' + steps + '</ol>' +
      '<p class="note"><b>Read this first:</b> DefiLlama&rsquo;s record lists no token for ' + esc(r.name) +
      '. That is a record, not a promise: this protocol may never issue a token, and farming it may return nothing. Never pay to claim anything, and never deposit more than you can afford to lose.</p>' +
      '</section>';
  }

  function modelHTML() {
    var c = R.curve;
    var f = '<h2 class="sec">How the value is priced</h2>' +
      '<p class="sec">The model is fitted from this snapshot, at run time, from the ' + c.n +
      ' live-token protocols that carry both a market cap and a TVL. A regression of log(market cap) on log(TVL) gives ' +
      '<b>log(mcap) = ' + c.intercept.toFixed(2) + ' + ' + c.slope.toFixed(2) + ' &times; log(tvl)</b>. ' +
      'The multiple a token commands falls as TVL grows: about &times;0.67 at $5M of TVL, &times;0.22 at $50M, &times;0.05 at $1B. ' +
      'Each category with at least three live peers is then adjusted by its peers&rsquo; median residual against that curve, ' +
      'shrunk toward no adjustment and clamped to &times;0.50&ndash;&times;2.00. Momentum, age and chain count add small bounded multipliers. ' +
      'The residuals spread widely (standard deviation ' + c.residual_sd.toFixed(2) + ' in log terms), so every implied value is a rough central estimate, not a forecast.</p>' +
      '<table><thead><tr><th>Category</th><th class="num">Factor</th><th class="num">Live peers</th><th class="num">Median residual</th></tr></thead><tbody>';
    R.category_factors.forEach(function (cf) {
      f += '<tr><td>' + esc(cf.category) + '</td><td class="num">&times;' + cf.factor.toFixed(3) +
        '</td><td class="num">' + cf.peers + '</td><td class="num">' + (cf.median_residual >= 0 ? '+' : '') + cf.median_residual.toFixed(3) + '</td></tr>';
    });
    f += '</tbody></table>';
    return f;
  }

  function liveHTML() {
    var h = '<h2 class="sec">The market evidence: tokens that already trade</h2>' +
      '<p class="sec">The ' + R.live.length + ' largest live-token protocols by market cap. Their market-cap-to-TVL multiples are the raw material the size curve is fitted from &mdash; the board keeps them separate from the pre-token ranking, so a protocol that already trades never competes with one still to come.</p>' +
      '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>';
    R.live.forEach(function (p) {
      h += '<tr><td><b>' + esc(p.name) + '</b><span class="sub">' + esc(catName(p.category)) + '</span></td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.multiple === null ? '\u2014' : '&times;' + p.multiple.toFixed(3)) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  function render() {
    var hash = window.location.hash || '#board';
    app.setAttribute('aria-busy', 'false');
    if (hash.indexOf('#detail-') === 0) {
      var slug = decodeURIComponent(hash.slice(8));
      var r = bySlug[slug];
      app.innerHTML = r ? detailHTML(r) : '<p class="empty">No protocol with that slug on the board.</p><a class="back" href="#board">&larr; Back to the board</a>';
      window.scrollTo(0, 0);
      return;
    }
    if (hash.indexOf('#filter-') === 0) {
      var cat = decodeURIComponent(hash.slice(8));
      if (categories.indexOf(cat) >= 0) state.cat = cat;
    }
    app.innerHTML = boardHTML();
    bind();
  }

  function bind() {
    var q = document.getElementById('f-q');
    if (q) q.addEventListener('input', function () { state.q = q.value; rerenderBoard(); });
    var cat = document.getElementById('f-cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; rerenderBoard(); });
    var ch = document.getElementById('f-chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; rerenderBoard(); });
    var tvl = document.getElementById('f-tvl');
    if (tvl) tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value); rerenderBoard(); });
    var sort = document.getElementById('f-sort');
    if (sort) sort.addEventListener('change', function () { state.sort = sort.value; rerenderBoard(); });
    var w = document.getElementById('f-watch');
    if (w) w.addEventListener('change', function () { state.watchOnly = w.checked; rerenderBoard(); });
    app.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { window.location.hash = '#detail-' + tr.getAttribute('data-slug'); });
    });
  }

  function rerenderBoard() {
    // Re-render the board in place, keeping the filter controls' focus where it was.
    var active = document.activeElement && document.activeElement.id;
    var val = document.activeElement && document.activeElement.value;
    render();
    if (active) {
      var el = document.getElementById(active);
      if (el) { el.focus(); if (val !== undefined && el.tagName === 'INPUT') { el.value = val; el.setSelectionRange(val.length, val.length); } }
    }
  }

  window.addEventListener('hashchange', render);
  render();
})();
