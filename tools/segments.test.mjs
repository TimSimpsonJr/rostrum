// The gap-free clock of a recording with pauses: time inside a gap is dropped, time after it moves back by the gap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collapse, collapseEvents, pausesMissing } from './segments.mjs';

test('a recording that had pauses must come with the segments that account for them', () => {
  const two = [{ from: 1, to: 2 }, { from: 5, to: 9 }];
  assert.equal(pausesMissing(0, undefined), false);                 // never paused: nothing to account for
  assert.equal(pausesMissing(undefined, undefined), false);
  assert.equal(pausesMissing(1, undefined), true);                  // paused, and where never arrived
  assert.equal(pausesMissing(1, [{ from: 1, to: 9 }]), true);       // one stretch cannot hold a pause
  assert.equal(pausesMissing(1, two), false);
  assert.equal(pausesMissing(1, [{ from: 1, to: 2 }, { from: 5, to: null }]), false); // the last one still open
  assert.equal(pausesMissing(2, two), true);                        // a later pause is missing
  assert.equal(pausesMissing(1, [{ from: 1, to: null }, { from: 5, to: 9 }]), true);  // an open one that is not the last
  assert.equal(pausesMissing(1, [{ from: 'x', to: 2 }, { from: 5, to: 9 }]), true);
  assert.equal(pausesMissing(1, 'nonsense'), true);
});

const SEGS = [{ from: 1000, to: 3000 }, { from: 5000, to: 6000 }, { from: 9000, to: 9500 }];

test('one segment, or none, changes nothing', () => {
  assert.equal(collapse([])(123), 123);
  assert.equal(collapse([{ from: 10, to: 20 }])(15), 15);
});

test('time after a gap moves back by the gap; time inside a gap is null', () => {
  const f = collapse(SEGS);
  assert.equal(f(1000), 1000);
  assert.equal(f(3000), 3000);
  assert.equal(f(4000), null);
  assert.equal(f(5000), 3000);
  assert.equal(f(5500), 3500);
  assert.equal(f(9000), 4000);
  assert.equal(f(9500), 4500);
  assert.equal(f(7000), null);
});

test('events inside a gap are dropped and the rest keep their order on the new clock', () => {
  const events = [1000, 2000, 4000, 5000, 5500, 7000, 9200].map((timestamp, i) => ({ timestamp, i }));
  assert.deepEqual(collapseEvents(events, SEGS).map((e) => [e.i, e.timestamp]), [[0, 1000], [1, 2000], [3, 3000], [4, 3500], [6, 4200]]);
});

test('segments are sorted and an open last segment (no `to`) runs to the end', () => {
  const f = collapse([{ from: 5000, to: null }, { from: 1000, to: 2000 }]);
  assert.equal(f(1500), 1500);
  assert.equal(f(6000), 3000);
});
