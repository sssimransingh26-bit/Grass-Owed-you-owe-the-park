// Grass Owed UI. All data stays on this device (localStorage). Nothing is sent anywhere.
(function () {
  'use strict';
  var C = window.Core;
  var qs = new URLSearchParams(location.search);

  // Testing aid: open the app with ?t=2026-10-08T14:00 to pretend it is that local time.
  // Test mode uses a separate storage key so it never touches your real ledger.
  var fakeParam = qs.get('t');
  var FAKE = fakeParam ? new Date(fakeParam).getTime() : NaN;
  var TEST = !isNaN(FAKE);
  var T0 = Date.now();
  function nowMs() { return TEST ? FAKE + (Date.now() - T0) : Date.now(); }

  var LS = TEST ? 'grass-owed-test' : 'grass-owed-v1';
  var table = null, bank = null, flash = '', offlineReady = false;
  var state = load();

  function defaults() {
    return {
      goalMin: 30, tone: 'funny', startKey: C.dayKey(nowMs()),
      days: {}, sessionStart: null, events: [],
      spots: ['Nearest park', 'Tree-lined street', 'Rooftop or garden'],
      notify: false, nudges: {}, lastNudge: null
    };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS));
      if (s) return Object.assign(defaults(), s);
    } catch (e) { /* ignore */ }
    return defaults();
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- derived values ----------
  function liveDays() {
    var d = Object.assign({}, state.days);
    if (state.sessionStart) {
      var k = C.dayKey(nowMs());
      d[k] = (d[k] || 0) + Math.floor((nowMs() - state.sessionStart) / C.MIN);
    }
    return d;
  }
  function minutesToday() { return liveDays()[C.dayKey(nowMs())] || 0; }
  function debtNow() { return C.computeDebt(liveDays(), state.goalMin, state.startKey, nowMs()); }
  function pickSpot() {
    var spots = state.spots.filter(Boolean);
    if (!spots.length) return 'outside';
    var doy = Math.floor((nowMs() - new Date(new Date(nowMs()).getFullYear(), 0, 0)) / C.DAY);
    return spots[doy % spots.length];
  }
  function ctx(extra) {
    var now = nowMs();
    return Object.assign({
      nowMs: now, table: table, events: state.events, debt: debtNow(),
      inSession: !!state.sessionStart,
      nudgeToday: state.nudges[C.dayKey(now)] || { count: 0, lastAt: 0 }
    }, extra || {});
  }

  // ---------- nudges ----------
  function makeNudge(c) {
    var sit = C.decideNudge(c);
    if (!sit) return null;
    var t0 = performance.now();
    var line = C.pickLine(bank, sit.key, state.tone, Math.floor(c.nowMs / C.MIN));
    var slots = Object.assign({ spot: pickSpot() }, sit.slots);
    return {
      key: sit.key, text: C.fill(line.text, slots), tier: line.tier, at: c.nowMs,
      latencyMs: Math.round((performance.now() - t0) * 100) / 100
    };
  }

  function notify(title, body) {
    if (!state.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(function (reg) {
        reg.showNotification(title, { body: body, icon: 'icons/icon-192.png', tag: 'grass-owed' });
      }).catch(function () { try { new Notification(title, { body: body }); } catch (e) { /* ignore */ } });
    } else {
      try { new Notification(title, { body: body }); } catch (e) { /* ignore */ }
    }
  }

  function tick() {
    if (!table) return;
    var c = ctx();
    var n = makeNudge(c);
    if (n) {
      var k = C.dayKey(c.nowMs);
      var cur = state.nudges[k] || { count: 0, lastAt: 0 };
      state.nudges[k] = { count: cur.count + 1, lastAt: c.nowMs };
      state.lastNudge = n;
      save();
      notify('Grass Owed', n.text);
    }
    // Do not redraw while the person is typing in a field.
    var a = document.activeElement;
    if (!n && a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    render();
  }

  // ---------- render ----------
  function fmtRange(w) { return C.fmtTime(w.s) + ' to ' + C.fmtTime(w.e); }

  function render() {
    var app = document.getElementById('app');
    if (!table) { app.textContent = 'Loading…'; return; }
    var now = nowMs();
    var debt = debtNow();
    var today = minutesToday();
    var pct = Math.min(100, Math.round((today / Math.max(1, state.goalMin)) * 100));
    var nb = C.nextBestWindow(state.events, table, now, debt);
    var cNow = C.comfortAt(table, now);
    var n = state.lastNudge;
    var openBefore = app.querySelector('details') && app.querySelector('details').open;

    var gapHtml;
    if (debt <= 0) gapHtml = '<p>Debt cleared. Nothing owed right now.</p>';
    else if (!nb) gapHtml = '<p>No free gap found. Try loading your calendar, or step out between tasks.</p>';
    else gapHtml = '<p class="nudge"><strong>' + esc(fmtRange(nb.win)) + '</strong> ' + (nb.day === 'tomorrow' ? '(tomorrow)' : '') + '</p>' +
      '<p class="meta">Comfort ' + nb.win.score + '/100' + (nb.win.temp != null ? ', about ' + Math.round(nb.win.temp) + '°C' : '') +
      '. Try: ' + esc(pickSpot()) + '.</p>';

    var nudgeHtml = n
      ? '<p class="nudge">' + esc(n.text) + '</p><p class="meta">' + (n.demo ? 'Preview' : 'Sent') + ' at ' + esc(C.fmtTime(n.at)) +
        ' · tier ' + n.tier + ' · ' + n.latencyMs + ' ms</p>'
      : '<p class="meta">No nudge yet. They only appear at sensible moments (max 3 a day, quiet 22:00 to 07:00).</p>';

    var weatherHtml = cNow
      ? '<p class="meta">Right now at this hour: about ' + Math.round(cNow.temp) + '°C, comfort ' + cNow.comfort + '/100, rain chance ' + Math.round(cNow.rain * 100) + '%.</p>'
      : '';

    app.innerHTML =
      '<h1>Grass Owed</h1><p class="sub">you owe the park' + (TEST ? ' · <span class="warn">test clock</span>' : '') + '</p>' +

      '<section class="card"><div class="label">Outdoor debt</div>' +
      '<div class="big">' + debt + ' <small>min owed</small></div>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<div class="meta">Today: ' + today + ' of ' + state.goalMin + ' min outside</div>' +
      '<div class="row">' +
      (state.sessionStart
        ? '<button class="primary" data-act="back">I\'m back</button>'
        : '<button class="primary" data-act="out">I\'m out</button>') +
      '<button data-act="add10">+10 min</button></div></section>' +

      '<section class="card"><div class="label">Best gap</div>' + gapHtml + weatherHtml + '</section>' +

      '<section class="card"><div class="label">Nudge</div>' + nudgeHtml +
      (flash ? '<p class="meta warn">' + esc(flash) + '</p>' : '') +
      '<div class="row"><button data-act="preview">Show me a nudge</button></div></section>' +

      '<details class="card"><summary>Settings</summary>' +
      '<label class="field">Daily goal (minutes)<input type="number" min="5" max="240" step="5" data-set="goal" value="' + state.goalMin + '"></label>' +
      '<label class="field">Tone<select data-set="tone">' +
      ['gentle', 'funny', 'cheeky'].map(function (t) { return '<option' + (t === state.tone ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="field">Nearby green spots (one per line, 3 to 5)<textarea rows="4" data-set="spots">' + esc(state.spots.join('\n')) + '</textarea></label>' +
      '<label class="field">Calendar file (.ics)<input type="file" accept=".ics,text/calendar" data-set="ics"></label>' +
      '<p class="meta">' + state.events.length + ' events loaded. Only start and end times are kept; titles are never read. ' +
      'Repeating events are expanded for the next 14 days, so re-import now and then.</p>' +
      '<div class="row"><button data-act="clearcal">Clear calendar</button>' +
      '<button data-act="notify">' + (state.notify ? 'Turn notifications off' : 'Turn notifications on') + '</button>' +
      '<button data-act="reset">Reset everything</button></div>' +
      '<p class="meta">Notifications only fire while the app is open or running in the background; closed-app delivery is not guaranteed on every phone.</p>' +
      '</details>' +

      '<p class="foot">' + (offlineReady ? 'Ready to work offline' : 'Offline mode not ready yet') + ' · data stays on this device</p>';
    if (openBefore) app.querySelector('details').open = true;
  }

  // ---------- actions ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    flash = '';
    if (act === 'out') {
      state.sessionStart = nowMs();
    } else if (act === 'back') {
      var mins = Math.max(1, Math.round((nowMs() - state.sessionStart) / C.MIN));
      var k = C.dayKey(nowMs());
      state.days[k] = (state.days[k] || 0) + mins;
      state.sessionStart = null;
    } else if (act === 'add10') {
      var k2 = C.dayKey(nowMs());
      state.days[k2] = (state.days[k2] || 0) + 10;
    } else if (act === 'preview') {
      var c = ctx({ ignoreLimits: true });
      var n = makeNudge(c);
      if (n) { n.demo = true; state.lastNudge = n; }
      else flash = debtNow() <= 0 ? 'Debt is clear, so there is nothing to nudge about.' : 'Nothing worth saying at this moment.';
    } else if (act === 'clearcal') {
      state.events = [];
    } else if (act === 'notify') {
      if (state.notify) { state.notify = false; }
      else if (!('Notification' in window)) { flash = 'This browser does not support notifications. In-app nudges still work.'; }
      else {
        Notification.requestPermission().then(function (p) {
          state.notify = p === 'granted';
          if (!state.notify) flash = 'Notification permission was not granted. In-app nudges still work.';
          save(); render();
        });
        return;
      }
    } else if (act === 'reset') {
      if (confirm('Delete your ledger, calendar and settings from this device?')) state = defaults();
    }
    save(); render();
  });

  document.addEventListener('change', function (e) {
    var t = e.target.getAttribute && e.target.getAttribute('data-set');
    if (!t) return;
    if (t === 'goal') state.goalMin = Math.min(240, Math.max(5, parseInt(e.target.value, 10) || 30));
    else if (t === 'tone') state.tone = e.target.value;
    else if (t === 'spots') {
      state.spots = e.target.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5);
    } else if (t === 'ics') {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var from = C.startOfDay(nowMs());
        state.events = C.parseICS(String(r.result), from, from + 14 * C.DAY);
        flash = state.events.length ? '' : 'No timed events found in that file for the next 14 days.';
        save(); render();
      };
      r.readAsText(f);
      return;
    }
    save(); render();
  });

  // ---------- startup ----------
  function init() {
    Promise.all([
      fetch('data/comfort_table.json').then(function (r) { return r.json(); }),
      fetch('data/nudge_bank.json').then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      table = res[0]; bank = res[1];
      render(); tick();
    }).catch(function () {
      document.getElementById('app').textContent = 'Could not load the comfort table. Open the app once while online.';
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; })
        .then(function () { offlineReady = true; render(); })
        .catch(function () { /* offline mode unavailable (e.g. not served over http/https) */ });
    }
    setInterval(tick, 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  }
  init();
})();
