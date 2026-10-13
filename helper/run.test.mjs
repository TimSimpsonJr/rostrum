import test from 'node:test';
import assert from 'node:assert/strict';
import { run, withNode } from './run.mjs';

test('a child finds `node` by name: the running Node\'s folder is first on PATH, whatever the variable is called', async () => {
  assert.deepEqual(withNode({ Path: 'C:\\Windows', A: '1' }, 'C:\\data\\node\\node.exe', 'win32'), { Path: 'C:\\data\\node;C:\\Windows', A: '1' });
  assert.deepEqual(withNode({ PATH: '/usr/bin:/bin' }, '/opt/homebrew/bin/node', 'darwin'), { PATH: '/opt/homebrew/bin:/usr/bin:/bin' });
  assert.deepEqual(withNode({}, '/data/node/bin/node', 'linux'), { PATH: '/data/node/bin' });
  // for real: a child given an empty PATH still starts `node` by name
  const r = await run({ cmd: process.execPath, args: ['-e', "console.log(require('node:child_process').spawnSync('node', ['--version']).status)"], env: { ...process.env, PATH: '', Path: '' } });
  assert.equal(r.stdout.trim(), '0');
});
