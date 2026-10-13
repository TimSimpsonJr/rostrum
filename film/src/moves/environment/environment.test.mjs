import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR, about, check, wallOf } from './move.ts';

test('environment: a wall lit from one side and a floor low in the frame; its inputs are choices', () => {
  assert.equal(about.use, 'stage'); assert.equal(check(about.example.stage), null); assert.equal(check({}), null); assert.equal(check({ light: 'top', floor: false, tone: 'dark' }), null);
  assert.match(check({ light: 'below' }), /light is/); assert.match(check({ floor: 'yes' }), /floor is/); assert.match(check({ tone: 'grey' }), /tone is/);
  assert.deepEqual([wallOf(), wallOf('right'), wallOf('top')], ['to right', 'to left', 'to bottom']);
  assert.ok(FLOOR > 0.5 && FLOOR < 0.8);
  assert.match(about.for, /no reflection/);
});
