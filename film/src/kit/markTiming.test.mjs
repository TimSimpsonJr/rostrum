// A mark that builds on the end card (markTiming.ts): when each part starts and lands, and the end card's times.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, SWEEP_AT, buildPlan, lineAt, partAt } from './markTiming.ts';
import { closeOf } from '../tutorial/close.ts';

test('mark build: parts land outward from the first, in order, all down before the plain mark takes over', () => {
  for (const [n, from, line] of [[13, 10, true], [13, 10, false], [2, 0, false], [5, 2, true], [40, 0, true], [40, 39, false]]) {
    const plan = buildPlan(n, from, line), name = `${n} parts from ${from}`;
    assert.ok(plan.end < BUILD + 1e-9 && BUILD < SWEEP_AT, name);
    for (let i = 0; i < n; i++) {
      assert.ok(plan.start(i) >= -1e-9 && plan.start(i) < plan.land(i), name);
      if (i !== from) assert.ok(plan.land(i) > plan.land(i + Math.sign(from - i)), `${name}: part ${i} lands after its neighbour nearer the first`);
      // a pure function of time: nothing before its start, whole and at rest from its landing on, never going back
      if (line && i === from) continue;
      assert.deepEqual(partAt(plan.start(i), i, plan).thin, 0);
      const done = partAt(BUILD, i, plan);
      assert.deepEqual([done.thin, done.full, Math.abs(done.dx), Math.abs(done.dy)], [1, 1, 0, 0], name);
      let last = 0;
      for (let u = 0; u <= BUILD; u += 1 / 120) { const p = partAt(u, i, plan); assert.ok(p.full >= last && p.full <= p.thin, name); last = p.full; }
    }
  }
  // the first mark it was made for: 13 parts spreading from the eleventh, 3.3 frames apart, the others starting while the line still closes
  const plan = buildPlan(13, 10, true);
  assert.ok(Math.abs(plan.land(8) - plan.land(9) - 3.3 / 30) < 1e-9 && plan.land(9) === plan.land(11) && plan.start(9) < plan.land(10));
  assert.ok(Math.abs(plan.end - 1.773) < 0.001);
});

test('mark build: the line is drawn before it is whole, at its own width by then', () => {
  assert.deepEqual(lineAt(0), { k: 0, swell: 0, whole: false });
  const before = lineAt(0.6 - 1e-6), at = lineAt(0.6);
  assert.ok(before.k === 1 && before.swell > 0.999999 && !before.whole && at.whole);
});

test('the close: a built mark has a longer reveal that holds its sweep; without one nothing moves', () => {
  const timing = (len) => ({ fps: 30, dir: 'n', sentences: [{ i: 0, file: null, clipAt: 0, clipDur: 0, start: 10, end: 10 + len, words: [] }] });
  const plain = closeOf(timing(1)), built = closeOf(timing(1), true), long = timing(4);
  assert.deepEqual([plain.endCard, plain.revealed, plain.total], [9.65, 9.65 + 1.85, 9.65 + 1.85 + 2.2]);
  assert.deepEqual(closeOf(timing(1), false), plain);
  assert.ok(built.endCard === plain.endCard && built.revealed >= built.endCard + SWEEP_AT + 0.66 && Math.abs(built.total - built.revealed - 2.2) < 1e-9 && Math.abs(plain.total - plain.revealed - 2.2) < 1e-9); // the same hold
  assert.equal(closeOf(long, true).total, closeOf(long).total); // a closing line longer than the reveal: the film is no longer
});
