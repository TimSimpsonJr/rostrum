import test from 'node:test';
import assert from 'node:assert/strict';
import { findHits, isolatedIn, keptWords, setUiText } from './sweep.mjs';
import { cssParts, cssValues } from '../film/src/css.ts';

/** A stylesheet as film/src/Sweep.tsx reports it. */
const sheet = (css, id = 3) => { const parts = cssParts(css); return { id, kind: 'css', s: parts.join(' '), parts }; };

// Invented beat files: screen 10 is a mail page shown as a window of two of its nodes.
const nodes = { subject: [10, 40], pane: [10, 41], reply: [10, 77], save: [18, 5], other: [11, 9] };
const windowed = { line: 0, screen: 10, window: ['subject', 'pane'] };

test('a screen the film shows only as a window is read as the film draws it: the window\'s nodes, and every node named on it', () => {
  assert.deepEqual(isolatedIn({ nodes, beats: [windowed, { line: 1 }, { line: 2, screen: 18 }] }), { 10: [40, 41, 77] });
  assert.deepEqual(isolatedIn({ nodes, beats: [{ line: 0, screen: 10, window: 'pane' }] }), { 10: [41, 40, 77] });
  // the same window in two shots is still one way of showing it
  assert.deepEqual(isolatedIn({ nodes, beats: [windowed, { line: 1, screen: 18 }, { ...windowed, line: 2 }] }), { 10: [40, 41, 77] });
  assert.deepEqual(isolatedIn(null), {});
  assert.deepEqual(isolatedIn({ nodes, beats: [{ line: 0, screen: 18 }] }), {});
});

test('it errs on showing: a screen shown any other way as well is read whole', () => {
  const whole = (beats, what) => assert.deepEqual(isolatedIn({ nodes, beats }), {}, what);
  whole([windowed, { line: 1, screen: 18 }, { line: 2, screen: 10 }], 'also shown without a window');
  whole([{ line: 0, screen: 10 }, { line: 1, screen: 18 }, { ...windowed, line: 2 }], 'shown whole first');
  whole([windowed, { line: 1, screen: 18 }, { line: 2, screen: 10, window: ['pane'] }], 'two different windows');
  whole([windowed, { line: 1, screen: 18, change: { kind: 'becomes', screen: 10 } }], 'another shot becomes it');
  whole([windowed, { line: 1, screen: 18, then: [{ change: { kind: 'becomes', screen: 10 } }] }], 'another shot becomes it, in a `then`');
  whole([windowed, { line: 1, screen: 9, sequence: { from: 9, watch: 12 } }], 'a sequence runs through it');
  whole([windowed, { line: 1, screen: 9, sequence: { from: 9, then: [10] } }], 'a sequence ends on it');
  whole([{ ...windowed, sequence: { from: 10 } }], 'its own shot runs a sequence');
  whole([windowed, { line: 1, screen: 18, sequence: { from: 'x' } }], 'a sequence that cannot be read: no screen is taken for a window');
  whole([{ line: 0, screen: 10 }, { line: 1, window: ['pane'] }], 'a window named after the first beat of its shot');
  whole([windowed, { line: 1, window: ['pane'] }], 'a second window inside the shot');
  whole([{ line: 0, screen: 10, window: ['pane', 'other'] }], 'a window node of another screen');
  whole([{ line: 0, screen: 10, window: ['nobody'] }], 'a window name that is no node');
  whole([{ line: 0, screen: 10, window: ['constructor'] }], 'a window name that is no node of the file');
  // after a scene the shot starts again: the same screen without a window is another way of showing it
  whole([windowed, { line: 1, scene: { stage: 'field' } }, { line: 2, screen: 10 }], 'whole after a scene');
});

test('what is outside the window is hidden and does not fail; the same original inside the window still does; a stylesheet always counts', () => {
  const originals = [{ kind: 'name', value: 'Oskar Lindqvist' }]; // (invented)
  const outside = { id: 7, kind: 'text', s: 'From Oskar Lindqvist ', p: 6, hidden: true }, inside = { id: 42, kind: 'text', s: 'Dear Oskar Lindqvist, ', p: 41 };
  const showing = (seen) => findHits(seen, originals).filter((h) => !h.hidden).map((h) => `${h.ids.join('+')} ${h.where}`);
  assert.deepEqual(showing([outside]), []);
  assert.equal(findHits([outside], originals).length, 1); // still listed, as hidden
  assert.deepEqual(showing([outside, inside]), ['42 text']);
  assert.deepEqual(showing([outside, { id: 41, kind: 'attr:aria-label', s: 'Message from Oskar Lindqvist' }]), ['41 attr:aria-label']);
  assert.deepEqual(showing([{ id: 6, kind: 'attr:title', s: 'Oskar Lindqvist', hidden: true }]), []);
  assert.deepEqual(showing([outside, { id: 3, kind: 'css', s: 'Oskar Lindqvist' }]), ['3 css']);
});

test('a `keep` word clears an original that is exactly that word, of any kind but the secret ones; never a longer original, never without the entry', () => {
  // another page of the film: a button captioned with the word, and the word in a tooltip
  const seen = [{ id: 1, kind: 'text', s: 'Test Webhook ', p: 2 }, { id: 3, kind: 'attr:title', s: 'Test' }, { id: 4, kind: 'value', s: 'test' }];
  const hits = (originals) => findHits(seen, originals).map((h) => `${h.ids[0]} ${h.where} ${h.original}`).sort();
  const CLEARED = ['series', 'number', 'name', 'company', 'email', 'phone', 'digits', 'greeked', 'option', 'control'], SECRET = ['key', 'card', 'account', 'taxid', 'money', 'amount', 'field'];
  try {
    for (const kind of [...CLEARED, ...SECRET, 'nobody-thought-of-this']) assert.equal(hits([{ kind, value: 'Test' }]).length, 3, `${kind}: with no keep entry it fails, as text, as an attribute and as a value`);
    setUiText(['  TEST ']); // (case and outer space aside)
    for (const kind of CLEARED) assert.deepEqual(hits([{ kind, value: 'Test' }, { kind, value: ' test ' }]), [], kind);
    // the secret kinds, and a kind nobody listed: the word changes nothing
    for (const kind of [...SECRET, 'nobody-thought-of-this']) assert.deepEqual(hits([{ kind, value: 'Test' }]), [`1 text ${kind}`, `3 attr:title ${kind}`, `4 value ${kind}`], kind);
    // the same text is also a secret somewhere: it is still looked for
    assert.equal(hits([{ kind: 'series', value: 'Test' }, { kind: 'key', value: 'test' }]).length, 3);
    // a longer original that holds the word, or starts with it, is not the word
    assert.deepEqual(hits([{ kind: 'series', value: 'Test Webhook' }]), ['1 text series']);
    assert.deepEqual(findHits([{ id: 9, kind: 'text', s: 'Re: test results for Oskar ' }], [{ kind: 'series', value: 'test results' }, { kind: 'series', value: 'Testing' }, { kind: 'series', value: 'test' }]).map((h) => h.length), [12]);
    // what was let through is counted by kind, and only what really was
    assert.deepEqual(keptWords([{ kind: 'series', value: 'Test' }, { kind: 'series', value: 'TEST' }, { kind: 'name', value: 'test' }, { kind: 'series', value: 'Test Webhook' }, { kind: 'key', value: 'Other' }]), { series: 2, name: 1 });
    assert.deepEqual(keptWords([{ kind: 'series', value: 'Test' }, { kind: 'key', value: 'test' }]), {});
    setUiText([]); // the entry removed: it fails again
    assert.equal(hits([{ kind: 'series', value: 'Test' }]).length, 3);
    assert.deepEqual(keptWords([{ kind: 'series', value: 'Test' }]), {});
  } finally { setUiText([]); }
});

test('a stylesheet is stripped one declaration at a time: an original inside one value is found however it is punctuated; digits of unrelated declarations do not add up to one', () => {
  const originals = [{ kind: 'amount', value: '$4,312.77' }, { kind: 'account', value: '000123456789' }]; // (invented)
  const found = (css) => findHits([sheet(css)], originals).map((h) => h.original).sort();
  // inside ONE value: as written, and with other punctuation or spacing
  for (const css of ['.a::after { content: "$4,312.77" }', '.a::after { content: "4 312 77" }', '.a::after { content: "paid 4-312-77 in full" }', '.a { background: url(https://cdn.site.test/$4,312.77.png) }',
    '.a { background: url("https://cdn.site.test/4312/77.png") }', '.a { --paid: 4 3 1 2 7 7 }', '.a { --paid: "43" 12 77 }', '[data-sum="4.312,77"] { top: 0 }', '.a { order: 4312-77x }', '@import "https://cdn.site.test/4312-77.css";']) assert.deepEqual(found(css), ['amount'], css);
  assert.deepEqual(found('.a { --acct: 0001-2345-6789 } .b::before { content: "$4,312.77" }'), ['account', 'amount']);
  assert.deepEqual(found('a{--acct:0001 2345 6789}'), ['account']); // (no space, no last semicolon)
  // split over two declarations, or two rules: nothing holds it
  for (const css of ['.a { --x: 0 0 4 3 1; --y: 2 7 7 0 }', '.a { --x: 4312 } .b { --y: 77 }', '.a::after { content: "4312" } .b::after { content: "77" }', '.a { --x: 0001 2345; --y: 6789 }', '.a { --x: 000123; background: url(https://cdn.site.test/456789.png) }'])
    assert.deepEqual(found(css), [], css);
  // every value is still read, in the same order, and a stylesheet reported without its parts is stripped whole
  const css = '.a { --x: 0 0 4 3 1; --y: 2 7 7 0; content: "q" } [data-x="r"] { top: 0 }';
  assert.equal(cssParts(css).join(' '), cssValues(css));
  assert.deepEqual(cssParts(css), ['0 0 4 3 1', '2 7 7 0', 'q', 'r']);
  assert.deepEqual(findHits([{ id: 3, kind: 'css', s: cssValues(css) }], originals).map((h) => h.original), ['amount']);
});
