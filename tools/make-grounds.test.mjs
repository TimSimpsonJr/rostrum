import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { png } from './make-grounds.mjs';

test('make-grounds: a picture drawn here is a PNG of the size asked for, holding the colours it was given', () => {
  const file = png(4, 2, (x, y) => [255 * x, 255 * y, 300]);
  assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(file.toString('latin1', 12, 16), 'IHDR'); assert.deepEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [4, 2]);
  const at = file.indexOf('IDAT'), raw = zlib.inflateSync(file.subarray(at + 4, at + 4 + file.readUInt32BE(at - 4)));
  assert.equal(raw.length, 2 * (1 + 3 * 4));
  assert.deepEqual([...raw.subarray(0, 4)], [0, 0, 0, 255], 'a row starts with its filter byte; a value is held to 0..255');
  assert.deepEqual([...raw.subarray(13 + 10, 13 + 13)], [255, 255, 255]);
});
