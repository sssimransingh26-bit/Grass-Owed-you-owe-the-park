// Grass Owed core logic. Pure functions, no DOM, so they can be tested in Node.
// Everything here runs on the device. Event titles are never read or stored.
(function (root) {
  'use strict';

  var MIN = 60000;
  var DAY = 86400000;
  var DAY_START_H = 7;   // nothing before 07:00
  var DAY_END_H = 22;    // nothing from 22:00
  var MAX_PER_DAY = 3;
  var COOLDOWN_MIN = 90;

  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function startOfDay(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function atHour(ms, h) { var d = new Date(ms); d.setHours(h, 0, 0, 0); return d.getTime(); }
  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // ---------- Debt ledger ----------
  // Each day adds the goal; minutes outside subtract; debt never goes below zero
  // and carries over to the next day.
  function computeDebt(days, goalMin, startKey, todayMs) {
    var p = startKey.split('-').map(Number);
    var cur = new Date(p[0], p[1] - 1, p[2]);
    var end = startOfDay(todayMs);
    var debt = 0;
    while (cur.getTime() <= end) {
      debt = Math.max(0, debt + goalMin - (days[dayKey(cur.getTime())] || 0));
      cur.setDate(cur.getDate() + 1);
    }
    return debt;
  }

  // ---------- ICS parsing ----------
  function icsToMs(v) {
    var m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return null;
    var Y = +m[1], Mo = +m[2] - 1, D = +m[3], h = +m[4], mi = +m[5], s = +m[6];
    return m[7] ? Date.UTC(Y, Mo, D, h, mi, s) : new Date(Y, Mo, D, h, mi, s).getTime();
  }

  // Expands simple DAILY / WEEKLY rules. Other rules keep only the first event.
  function expand(ev, fromMs, toMs) {
    if (!ev.rrule) return [{ s: ev.s, e: ev.e }];
    var p = {};
    ev.rrule.split(';').forEach(function (kv) { var a = kv.split('='); p[a[0]] = a[1]; });
    if (p.FREQ !== 'DAILY' && p.FREQ !== 'WEEKLY') return [{ s: ev.s, e: ev.e }];
    var dur = ev.e - ev.s;
    var base = startOfDay(ev.s);
    var tod = ev.s - base;
    var interval = parseInt(p.INTERVAL || '1', 10);
    var until = p.UNTIL ? icsToMs(p.UNTIL.length === 8 ? p.UNTIL + 'T235959' : p.UNTIL) : Infinity;
    if (until === null) until = Infinity;
    var wd = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    var byday = p.BYDAY ? p.BYDAY.split(',').map(function (x) { return wd[x.slice(-2)]; }) : null;
    var baseDow = new Date(base).getDay();
    var out = [];
    var cur = new Date(base);
    while (cur.getTime() <= toMs) {
      var n = Math.round((cur.getTime() - base) / DAY);
      var ok;
      if (p.FREQ === 'DAILY') {
        ok = n % interval === 0;
      } else {
        var wk = Math.floor(n / 7);
        ok = wk % interval === 0 && (byday ? byday.indexOf(cur.getDay()) >= 0 : cur.getDay() === baseDow);
      }
      if (ok) {
        var s = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()).getTime() + tod;
        if (s > until) break;
        if (s + dur > fromMs) out.push({ s: s, e: s + dur });
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  // Returns [{s, e}] in ms. Only start/end are kept: titles, locations and
  // descriptions are never read. TZID is ignored (times are treated as local).
  function parseICS(text, fromMs, toMs) {
    var lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    var out = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
      if (line === 'END:VEVENT') {
        if (cur && cur.s != null && !cur.allDay) {
          if (cur.e == null || cur.e <= cur.s) cur.e = cur.s + 30 * MIN;
          expand(cur, fromMs, toMs).forEach(function (ev) { out.push(ev); });
        }
        cur = null;
        continue;
      }
      if (!cur) continue;
      var idx = line.indexOf(':');
      if (idx < 0) continue;
      var left = line.slice(0, idx);
      var val = line.slice(idx + 1).trim();
      var name = left.split(';')[0].toUpperCase();
      if (name === 'DTSTART' || name === 'DTEND') {
        if (/VALUE=DATE(?!-)/.test(left)) { cur.allDay = true; continue; }
        var ms = icsToMs(val);
        if (ms == null) continue;
        if (name === 'DTSTART') cur.s = ms; else cur.e = ms;
      } else if (name === 'RRULE') {
        cur.rrule = val;
      }
    }
    return out
      .filter(function (e) { return e.e > fromMs && e.s < toMs; })
      .sort(function (a, b) { return a.s - b.s; });
  }

  // ---------- Comfort and gaps ----------
  function comfortAt(table, ms) {
    var d = new Date(ms);
    var m = table && table.table && table.table[String(d.getMonth() + 1)];
    return (m && m[String(d.getHours())]) || null;
  }

  function windowComfort(table, s, e) {
    var sum = 0, n = 0;
    for (var t = s; t < e; t += 15 * MIN) {
      var c = comfortAt(table, t);
      if (c) { sum += c.comfort; n++; }
    }
    return n ? sum / n : 0;
  }

  // Best window of about targetMin minutes inside a free gap (>= minMin) for the
  // day containing dayMs, starting no earlier than fromMs.
  function bestWindow(events, table, dayMs, fromMs, targetMin, minMin) {
    minMin = minMin || 15;
    var dayS = atHour(dayMs, DAY_START_H);
    var dayE = atHour(dayMs, DAY_END_H);
    var busy = events
      .filter(function (e) { return e.e > dayS && e.s < dayE; })
      .sort(function (a, b) { return a.s - b.s; });
    var gaps = [];
    var cur = Math.max(dayS, fromMs);
    busy.forEach(function (b) {
      if (b.s > cur) gaps.push([cur, Math.min(b.s, dayE)]);
      cur = Math.max(cur, b.e);
    });
    if (dayE > cur) gaps.push([cur, dayE]);
    var best = null;
    gaps.forEach(function (g) {
      var len = (g[1] - g[0]) / MIN;
      if (len < minMin) return;
      var L = Math.min(targetMin, len);
      for (var s = g[0]; s + L * MIN <= g[1] + 1; s += 15 * MIN) {
        var score = windowComfort(table, s, s + L * MIN);
        if (!best || score > best.score + 0.01) best = { s: s, e: s + L * MIN, score: score };
      }
    });
    if (!best) return null;
    var c0 = comfortAt(table, best.s);
    return { s: best.s, e: best.e, score: Math.round(best.score), temp: c0 ? c0.temp : null };
  }

  // Best window today (from now) or, if none is left, tomorrow.
  function nextBestWindow(events, table, nowMs, debt) {
    var target = Math.min(Math.max(debt, 15), 60);
    var today = bestWindow(events, table, nowMs, nowMs, target, 15);
    if (today) return { win: today, day: 'today' };
    var tmr = nowMs + DAY;
    var next = bestWindow(events, table, tmr, atHour(tmr, DAY_START_H), target, 15);
    return next ? { win: next, day: 'tomorrow' } : null;
  }

  // ---------- Rules engine ----------
  // Decides WHEN and WHAT. Returns { key, slots } or null.
  function situation(ctx) {
    var now = ctx.nowMs, table = ctx.table, events = ctx.events, debt = ctx.debt;
    var c = comfortAt(table, now);
    if (!c) return null;
    var inEvent = events.some(function (e) { return e.s <= now && now < e.e; });
    if (inEvent) return null;
    var upcoming = events.filter(function (e) { return e.s > now; }).sort(function (a, b) { return a.s - b.s; })[0];
    var freeMin = upcoming ? (upcoming.s - now) / MIN : 999;

    var nb = nextBestWindow(events, table, now, debt);
    var slots = {
      minutes: debt,
      temp: Math.round(c.temp),
      gap_start: nb ? fmtTime(nb.win.s) : 'later',
      best_time: nb ? (nb.day === 'tomorrow' ? 'tomorrow ' : '') + fmtTime(nb.win.s) : 'later'
    };

    if (c.comfort >= 60 && freeMin >= 15) return { key: 'go_now', slots: slots };
    if (nb && nb.day === 'today' && nb.win.s - now <= 45 * MIN && nb.win.score >= 50) {
      return { key: 'gap_soon', slots: slots };
    }
    if (c.rain >= 0.3) return { key: 'rainy', slots: slots };
    if (c.temp >= 33) return { key: 'too_hot_wait', slots: slots };
    if (c.temp <= 10) return { key: 'too_cold_wait', slots: slots };
    if (debt >= 90) return { key: 'debt_high', slots: slots };
    return null;
  }

  // ctx: { nowMs, table, events, debt, inSession, nudgeToday: {count, lastAt}, ignoreLimits }
  function decideNudge(ctx) {
    if (!ctx.ignoreLimits) {
      var h = new Date(ctx.nowMs).getHours();
      if (h >= DAY_END_H || h < DAY_START_H) return null;       // quiet hours
      if (ctx.inSession) return null;                           // already outside
      var n = ctx.nudgeToday || { count: 0, lastAt: 0 };
      if (n.count >= MAX_PER_DAY) return null;                  // max 3 a day
      if (n.lastAt && ctx.nowMs - n.lastAt < COOLDOWN_MIN * MIN) return null; // cooldown
    }
    if (ctx.debt <= 0) return null;
    return situation(ctx);
  }

  // ---------- Nudge text (tier 1 bank, tier 3 static fallback) ----------
  var FALLBACK = {
    default: [
      'You owe the outdoors {minutes} minutes. A short walk would help.',
      'Debt is {minutes} minutes. The park is open.'
    ]
  };

  function fill(str, slots) {
    return str.replace(/\{(\w+)\}/g, function (_, k) {
      return slots[k] != null ? String(slots[k]) : 'later';
    });
  }

  // bank: { bank: { situation: { tone: [lines] } } } or null. Returns { text, tier }.
  function pickLine(bank, key, tone, seed) {
    var lines = bank && bank.bank && bank.bank[key] && bank.bank[key][tone];
    var tier = 1;
    if (!lines || !lines.length) { lines = FALLBACK[key] || FALLBACK.default; tier = 3; }
    return { text: lines[Math.abs(seed) % lines.length], tier: tier };
  }

  root.Core = {
    MIN: MIN, DAY: DAY, MAX_PER_DAY: MAX_PER_DAY, COOLDOWN_MIN: COOLDOWN_MIN,
    dayKey: dayKey, startOfDay: startOfDay, atHour: atHour, fmtTime: fmtTime,
    computeDebt: computeDebt, parseICS: parseICS, icsToMs: icsToMs,
    comfortAt: comfortAt, bestWindow: bestWindow, nextBestWindow: nextBestWindow,
    decideNudge: decideNudge, fill: fill, pickLine: pickLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Core;
})(typeof window !== 'undefined' ? window : globalThis);
