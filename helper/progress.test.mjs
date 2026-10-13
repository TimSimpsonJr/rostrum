// Phases of a long step as the panel's bar shows them: one label, one number for the whole step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { progressOf, BUILD, PREPARE } from './progress.mjs';

test('build phases advance in order and the number is the whole build', () => {
  // new pieces being made in the chat, before anything is staged: a small fixed place, begun but far from done
  assert.deepEqual(progressOf('making'), { phase: 'making', label: 'Making new pieces', pct: 3 });
  assert.deepEqual(progressOf('shotlist'), { phase: 'shotlist', label: 'Writing the shot list', pct: 5 });
  assert.deepEqual(progressOf('measure'), { phase: 'measure', label: 'Measuring the screens', pct: 15 });
  assert.deepEqual(progressOf('staging'), { phase: 'staging', label: 'Staging shots', pct: 24 });
  assert.deepEqual(progressOf('checking', { pass: 1 }), { phase: 'checking', label: 'Checking frames 1/3', pct: 48 });
  assert.deepEqual(progressOf('checking', { pass: 2 }), { phase: 'checking', label: 'Checking frames 2/3', pct: 56 });
  assert.deepEqual(progressOf('checking', { pass: 3 }), { phase: 'checking', label: 'Checking frames 3/3', pct: 64 });
  assert.deepEqual(progressOf('sweep'), { phase: 'sweep', label: 'Final check for private data', pct: 72 });
  assert.deepEqual(progressOf('render', { fraction: 0 }), { phase: 'render', label: 'Rendering', pct: 76 });
  assert.deepEqual(progressOf('render', { fraction: 0.5 }), { phase: 'render', label: 'Rendering', pct: 88 });
  assert.deepEqual(progressOf('render', { fraction: 1 }), { phase: 'render', label: 'Built', pct: 100 });
  assert.deepEqual(Object.keys(BUILD), ['making', 'shotlist', 'measure', 'staging', 'checking', 'sweep', 'render']);
  // the number only ever grows through the build, and the six keep their shares of what `making` leaves (within a point)
  const spans = Object.values(BUILD);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i].from === spans[i - 1].to && spans[i].to > spans[i].from, Object.keys(BUILD)[i]);
  const was = { shotlist: 10, measure: 10, staging: 25, checking: 25, sweep: 5, render: 25 };
  for (const [phase, share] of Object.entries(was)) assert.ok(Math.abs((BUILD[phase].to - BUILD[phase].from) - share * 0.95) <= 1, phase);
});

test('prepare phases', () => {
  assert.deepEqual(progressOf('scrub'), { phase: 'scrub', label: 'Cleaning the recording', pct: 0 });
  assert.deepEqual(progressOf('gestures'), { phase: 'gestures', label: 'Reading your gestures', pct: 40 });
  assert.deepEqual(progressOf('transcribe'), { phase: 'transcribe', label: 'Listening to the narration', pct: 50 });
  assert.deepEqual(Object.keys(PREPARE), ['scrub', 'gestures', 'transcribe']);
});

test('what is not a phase is refused; a pass or fraction out of range is clamped', () => {
  assert.throws(() => progressOf('dance'), /unknown phase/);
  assert.equal(progressOf('checking', { pass: 9 }).label, 'Checking frames 3/3');
  assert.equal(progressOf('checking', { pass: 0 }).label, 'Checking frames 1/3');
  assert.equal(progressOf('render', { fraction: 2 }).pct, 100);
  assert.equal(progressOf('render', { fraction: -1 }).pct, 76);
});
