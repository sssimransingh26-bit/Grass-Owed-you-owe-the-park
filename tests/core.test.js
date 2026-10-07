// Run with: node tests/core.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../app/core.js');

const table = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/comfort_table.json'), 'utf8'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  -', name); }
const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi || 0).getTime();

test('computeDebt carries over and never goes below zero', () => {
  const days = { '2026-10-07': 10 };
  // Day 1: 30 owed - 10 outside = 20. Day 2: +30 = 50.
  assert.strictEqual(C.computeDebt(days, 30, '2026-10-07', at(2026, 10, 8, 12)), 50);
  days['2026-10-08'] = 100;
  assert.strictEqual(C.computeDebt(days, 30, '2026-10-07', at(2026, 10, 8, 12)), 0);
});

test('parseICS: UTC, local, all-day skipped, titles never needed', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'SUMMARY:Secret title', 'DTSTART:20261008T040000Z', 'DTEND:20261008T050000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;TZID=Asia/Kolkata:20261008T140000', 'DTEND;TZID=Asia/Kolkata:20261008T150000', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261008', 'DTEND;VALUE=DATE:20261009', 'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const ev = C.parseICS(ics, at(2026, 10, 8, 0), at(2026, 10, 9, 0));
  assert.strictEqual(ev.length, 2);
  assert.strictEqual(ev[0].e - ev[0].s, 3600000);
  assert.deepStrictEqual(Object.keys(ev[0]).sort(), ['e', 's']);
});

test('parseICS: weekly BYDAY rule expands', () => {
  const ics = [
    'BEGIN:VEVENT', 'DTSTART:20261005T100000', 'DTEND:20261005T110000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'END:VEVENT'
  ].join('\n');
  const ev = C.parseICS(ics, at(2026, 10, 5, 0), at(2026, 10, 19, 0));
  // Mon 5, Wed 7, Mon 12, Wed 14
  assert.strictEqual(ev.length, 4);
});

test('bestWindow avoids events and prefers comfortable hours (June)', () => {
  const day = at(2026, 6, 10, 0);
  const win = C.bestWindow([], table, day, at(2026, 6, 10, 7), 30, 15);
  const hour = new Date(win.s).getHours();
  assert.ok(hour >= 20 || hour <= 8, 'expected an early or late slot, got hour ' + hour);
  const busy = [{ s: at(2026, 6, 10, 7), e: at(2026, 6, 10, 21) }];
  const win2 = C.bestWindow(busy, table, day, at(2026, 6, 10, 7), 30, 15);
  assert.ok(win2.s >= at(2026, 6, 10, 21), 'must not overlap the event');
});

test('decideNudge: hot afternoon says wait', () => {
  const now = at(2026, 6, 10, 14, 0);
  const r = C.decideNudge({ nowMs: now, table, events: [], debt: 45, inSession: false, nudgeToday: { count: 0, lastAt: 0 } });
  assert.strictEqual(r.key, 'too_hot_wait');
});

test('decideNudge: pleasant free moment says go now (December 11:00)', () => {
  const now = at(2026, 12, 10, 11, 0);
  const r = C.decideNudge({ nowMs: now, table, events: [], debt: 45, inSession: false, nudgeToday: { count: 0, lastAt: 0 } });
  assert.strictEqual(r.key, 'go_now');
});

test('decideNudge rules: quiet hours, cap, cooldown, session, event, no debt', () => {
  const base = { table, events: [], debt: 45, inSession: false, nudgeToday: { count: 0, lastAt: 0 } };
  const day = (h, m) => at(2026, 12, 10, h, m);
  assert.strictEqual(C.decideNudge({ ...base, nowMs: day(23, 0) }), null, 'quiet 23:00');
  assert.strictEqual(C.decideNudge({ ...base, nowMs: day(6, 30) }), null, 'quiet 06:30');
  assert.strictEqual(C.decideNudge({ ...base, nowMs: day(11, 0), nudgeToday: { count: 3, lastAt: 0 } }), null, 'cap');
  assert.strictEqual(C.decideNudge({ ...base, nowMs: day(11, 0), nudgeToday: { count: 1, lastAt: day(10, 0) } }), null, 'cooldown');
  assert.ok(C.decideNudge({ ...base, nowMs: day(11, 0), nudgeToday: { count: 1, lastAt: day(9, 0) } }), 'after cooldown');
  assert.strictEqual(C.decideNudge({ ...base, nowMs: day(11, 0), inSession: true }), null, 'checked in');
  assert.strictEqual(C.decideNudge({ ...base, nowMs: day(11, 0), events: [{ s: day(10, 30), e: day(11, 30) }] }), null, 'in event');
  assert.strictEqual(C.decideNudge({ ...base, nowMs: day(11, 0), debt: 0 }), null, 'no debt');
});

test('pickLine and fill: bank, fallback, slots', () => {
  const bank = { bank: { go_now: { funny: ['Debt is {minutes} minutes at {temp}C.'] } } };
  const a = C.pickLine(bank, 'go_now', 'funny', 0);
  assert.strictEqual(a.tier, 1);
  assert.strictEqual(C.fill(a.text, { minutes: 90, temp: 31 }), 'Debt is 90 minutes at 31C.');
  const b = C.pickLine(null, 'go_now', 'funny', 0);
  assert.strictEqual(b.tier, 3);
});

console.log('\n' + passed + ' tests passed');
