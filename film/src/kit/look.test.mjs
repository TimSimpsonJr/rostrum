import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLook } from './look.ts';

test('the look, property by property: the brand, else the recorded site, else none', () => {
  const site = { host: 'app.site.test', accent: '#112233', font: 'Inter' };
  assert.deepEqual(resolveLook({ colours: { accent: '#abcdef' }, font: 'Brand Sans' }, site), { accent: '#abcdef', font: 'Brand Sans' });
  assert.deepEqual(resolveLook({ colours: { accent: '#abcdef' }, font: null }, site), { accent: '#abcdef', font: 'Inter' });   // each property on its own
  assert.deepEqual(resolveLook({ name: null, mark: null, colours: { accent: null }, font: null }, site), { accent: '#112233', font: 'Inter' });
  assert.deepEqual(resolveLook(null, site), { accent: '#112233', font: 'Inter' });
  assert.deepEqual(resolveLook(null, null), { accent: null, font: null });
  assert.deepEqual(resolveLook({}, { accent: null, font: null }), { accent: null, font: null });
});
