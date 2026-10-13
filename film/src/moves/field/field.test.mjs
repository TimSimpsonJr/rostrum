import test from 'node:test';
import assert from 'node:assert/strict';
import { about, angleAt, check } from './move.ts';

test('field: one colour, or two; a colour is a plain CSS colour and nothing else; the angle only wanders', () => {
  assert.equal(about.use, 'stage'); assert.equal(check(about.example.stage), null);
  assert.equal(check({ colour: 'oklch(0.3 0.1 272)' }), null); assert.equal(check({ colour: 'accent' }), null); assert.equal(check({ from: '#fff', to: 'navy', angle: 0 }), null);
  assert.match(check({ from: '#fff' }), /one colour, or from and to/); assert.match(check({}), /one colour/); assert.match(check({ colour: '#fff', to: '#000' }), /one colour/);
  for (const bad of ['url(https://x.test/a.png)', 'red; background: url(x)', 'rgb(0,0,0) url(x)', 'var(--x)', 12]) assert.match(check({ colour: bad }), /a colour is/, String(bad));
  assert.match(check({ colour: '#fff', angle: 360 }), /angle/); assert.match(check({ colour: '#fff', tone: 'dim' }), /tone is light or dark/);
  for (let t = 0; t < 600; t += 7) assert.ok(Math.abs(angleAt(160, t) - 160) <= 2);
  assert.equal(angleAt(), 160);
});
