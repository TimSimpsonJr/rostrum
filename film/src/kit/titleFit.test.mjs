import test from 'node:test';
import assert from 'node:assert/strict';
import { FIT, emWidth, fitTitle } from './titleFit.ts';

const MAX = FIT * 1920, T = -0.035;

test('titleFit: a short title is one line at the card\'s size', () => {
  assert.deepEqual(fitTitle('Find your user API key', 116, MAX, T), { lines: ['Find your user API key'], size: 116 });
});

test('titleFit: a long one breaks in two at the space nearest the middle, each line inside the frame; too long for two, the type comes down', () => {
  const long = 'Find a payee\'s signed ACH authorization';
  assert.ok(emWidth(long, T) * 116 > 1920, 'on one line it runs off the frame');
  const fit = fitTitle(long, 116, MAX, T);
  assert.deepEqual(fit, { lines: ['Find a payee\'s signed', 'ACH authorization'], size: 116 });
  const huge = 'Reconcile every outstanding vendor disbursement against the quarterly ledger export';
  const down = fitTitle(huge, 116, MAX, T);
  assert.equal(down.lines.length, 2);
  assert.ok(down.size < 116 && Math.max(...down.lines.map((l) => emWidth(l, T) * down.size)) <= MAX, JSON.stringify(down));
  const word = fitTitle('Supercalifragilisticexpialidociouslylongword', 116, MAX, T);
  assert.equal(word.lines.length, 1, 'no space: one line, smaller');
  assert.ok(emWidth(word.lines[0], T) * word.size <= MAX);
});

test('titleFit: every printable ASCII character has a width; others count as wide', () => {
  for (let c = 32; c < 127; c++) assert.ok(emWidth(String.fromCharCode(c)) > 0.1, String.fromCharCode(c));
  assert.equal(emWidth('é'), 0.6);
});
