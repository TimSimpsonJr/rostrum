import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EXTENSION_ID, idOfKey } from './extension-id.mjs';

test('the id the helper trusts is the id of the key in the extension\'s manifest', () => {
  // the committed manifest: extension/manifest.json, or its base while the manifest is still generated
  const file = ['extension/manifest.base.json', 'extension/manifest.json'].map((f) => new URL('../' + f, import.meta.url)).find((u) => fs.existsSync(u) && JSON.parse(fs.readFileSync(u, 'utf8')).key);
  assert.ok(file, 'no manifest with a key');
  const { key } = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.match(EXTENSION_ID, /^[a-p]{32}$/);
  assert.equal(idOfKey(key), EXTENSION_ID);
  assert.ok(!/PRIVATE/.test(fs.readFileSync(file, 'utf8')));
});
