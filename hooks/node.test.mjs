// Node for the helper: where it is looked for, in what order, and the version that is good enough.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_PIN, dataDirOf, findNode, installNode, majorOf, nodeArchive, nodeCandidates, nodeOffer, parseHash, portableNode } from './node.ts';

const WIN = { localAppData: 'C:\\Users\\ada\\AppData\\Local', userProfile: 'C:\\Users\\ada', programFiles: 'C:\\Program Files' };
/** A computer where these programs answer `--version` with these words; anything else cannot be started. */
const having = (versions, ran = []) => async (argv) => {
  ran.push(argv);
  assert.deepEqual(argv.slice(1), ['--version']);
  if (!(argv[0] in versions)) throw new Error('ENOENT');
  return { exitCode: 0, stdout: versions[argv[0]] + '\n' };
};

test('the data folder, by platform, as tools/data.mjs has it', () => {
  assert.equal(dataDirOf(WIN, 'windows'), 'C:\\Users\\ada\\AppData\\Local\\Rostrum');
  assert.equal(dataDirOf({ userProfile: 'C:\\Users\\ada\\' }, 'windows'), 'C:\\Users\\ada\\AppData\\Local\\Rostrum');
  assert.equal(dataDirOf({ home: '/Users/ada' }, 'mac'), '/Users/ada/Library/Application Support/Rostrum');
  assert.equal(dataDirOf({ home: '/home/ada' }, 'linux'), '/home/ada/.local/share/rostrum');
  assert.equal(dataDirOf({ home: '/home/ada', xdgData: '/x' }, 'linux'), '/x/rostrum');
  assert.equal(dataDirOf({ ...WIN, data: 'D:\\R' }, 'windows'), 'D:\\R');
  assert.equal(dataDirOf({}, 'mac'), null);
  assert.equal(portableNode(WIN, 'windows'), 'C:\\Users\\ada\\AppData\\Local\\Rostrum\\node\\node.exe');
  assert.equal(portableNode({ home: '/Users/ada' }, 'mac'), '/Users/ada/Library/Application Support/Rostrum/node/bin/node');
});

test('where Node is looked for, in order: ROSTRUM_NODE, PATH, the usual places, the fetched copy', () => {
  assert.deepEqual(nodeCandidates({ ...WIN, node: 'D:\\n\\node.exe' }, 'windows'), ['D:\\n\\node.exe', 'node', 'C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\ada\\AppData\\Local\\mise\\shims\\node.exe', 'C:\\Users\\ada\\AppData\\Local\\Rostrum\\node\\node.exe']);
  assert.deepEqual(nodeCandidates({ home: '/Users/ada' }, 'mac'), ['node', '/opt/homebrew/bin/node', '/usr/local/bin/node', '/Users/ada/Library/Application Support/Rostrum/node/bin/node']);
  assert.deepEqual(nodeCandidates({}, 'linux'), ['node', '/opt/homebrew/bin/node', '/usr/local/bin/node']);
  // the rehearsal switch: a computer with no Node but the one the panel fetched
  assert.deepEqual(nodeCandidates({ ...WIN, node: 'D:\\n\\node.exe', pretendNoNode: '1' }, 'windows'), ['C:\\Users\\ada\\AppData\\Local\\Rostrum\\node\\node.exe']);
});

test('the version gate: 22 and newer are taken, older ones are passed over and named', async () => {
  assert.deepEqual(['v22.0.0', 'v24.1.3', 'v20.19.0', 'v8.9.4', '22.1.0', 'node', ''].map(majorOf), [22, 24, 20, 8, null, null, null]);
  const ran = [];
  assert.deepEqual(await findNode(having({ node: 'v22.20.0' }, ran), WIN, 'windows'), { node: { path: 'node', version: '22.20.0' }, older: null });
  assert.deepEqual(ran, [['node', '--version']]); // the first good one ends the search
  assert.deepEqual((await findNode(having({ node: 'v24.0.1' }), WIN, 'windows')).node, { path: 'node', version: '24.0.1' });
  // PATH's is too old: the next good one is taken
  assert.deepEqual(await findNode(having({ node: 'v20.11.1', 'C:\\Program Files\\nodejs\\node.exe': 'v22.3.0' }), WIN, 'windows'), { node: { path: 'C:\\Program Files\\nodejs\\node.exe', version: '22.3.0' }, older: null });
  // ROSTRUM_NODE first, when it is good; passed over when it is not there
  assert.equal((await findNode(having({ 'D:\\n\\node.exe': 'v22.1.0', node: 'v23.0.0' }), { ...WIN, node: 'D:\\n\\node.exe' }, 'windows')).node.path, 'D:\\n\\node.exe');
  assert.equal((await findNode(having({ node: 'v23.0.0' }), { ...WIN, node: 'D:\\gone\\node.exe' }, 'windows')).node.path, 'node');
  // only an old one: none, and its version is kept to be said
  assert.deepEqual(await findNode(having({ node: 'v18.20.4' }), WIN, 'windows'), { node: null, older: '18.20.4' });
  // no PATH at all, nothing anywhere
  assert.deepEqual(await findNode(having({}), { home: '/Users/ada' }, 'mac'), { node: null, older: null });
  // the fetched copy is found last
  assert.equal((await findNode(having({ '/Users/ada/Library/Application Support/Rostrum/node/bin/node': 'v22.23.3' }), { home: '/Users/ada' }, 'mac')).node.path, '/Users/ada/Library/Application Support/Rostrum/node/bin/node');
  // a program that answers something else, or fails, is not Node
  assert.equal((await findNode(async () => ({ exitCode: 1, stdout: 'v22.0.0' }), WIN, 'windows')).node, null);
  assert.equal((await findNode(async () => ({ exitCode: 0, stdout: 'hello' }), WIN, 'windows')).node, null);
});

// ── the fetch ──

const SYS = 'C:\\Windows\\System32', DIR = 'C:\\Users\\ada\\AppData\\Local\\Rostrum\\node', ZIP = `${DIR}\\node-v22.23.3-win-x64.zip`;
const CERTUTIL = (hex) => `SHA256 hash of ${ZIP}:\r\n${hex}\r\nCertUtil: -hashfile command completed successfully.\r\n`;
/** A computer for the fetch: every command is kept; `parts` answers a program by its file name (default: it ran well). */
function machine(parts = {}) {
  const ran = [], said = [];
  const run = async (argv, init) => {
    ran.push({ argv, init });
    assert.ok(argv.every((a) => typeof a === 'string'), 'an argument list');
    const name = argv[0].split(/[\\/]/).pop(), part = parts[name];
    if (part === 'throws') throw new Error('ENOENT');
    return { exitCode: 0, stdout: '', ...(typeof part === 'function' ? part(argv) : part) };
  };
  return { ran, said, run, say: async (s) => { said.push(s); }, names: () => ran.map((r) => r.argv[0].split(/[\\/]/).pop()) };
}
const GOOD = { 'certutil.exe': { stdout: CERTUTIL(NODE_PIN.archives.windows.sha256) }, 'node.exe': { stdout: 'v22.23.3\r\n' } };

test('the pin: one version from nodejs.org over https, each archive with a whole SHA-256; which archive a computer gets', () => {
  assert.equal(NODE_PIN.base, `https://nodejs.org/dist/v${NODE_PIN.version}/`);
  for (const a of Object.values(NODE_PIN.archives)) {
    assert.match(a.sha256, /^[0-9a-f]{64}$/);
    assert.ok(a.file.startsWith(`node-v${NODE_PIN.version}-`) && a.mb > 20 && a.mb < 80, a.file);
  }
  assert.equal(new Set(Object.values(NODE_PIN.archives).map((a) => a.sha256)).size, 3);
  assert.equal(nodeArchive('windows', '').file, 'node-v22.23.3-win-x64.zip');
  assert.equal(nodeArchive('mac', 'arm64\n').file, 'node-v22.23.3-darwin-arm64.tar.gz');
  assert.equal(nodeArchive('mac', 'x86_64').file, 'node-v22.23.3-darwin-x64.tar.gz');
  assert.equal(nodeArchive('linux', 'x86_64'), null);
  assert.deepEqual(nodeOffer(WIN, 'windows', ''), { version: '22.23.3', mb: 36, dir: DIR });
  assert.equal(nodeOffer({ home: '/home/ada' }, 'linux', 'x86_64'), null);
  assert.equal(nodeOffer({}, 'mac', 'arm64'), null); // no home named: nowhere to put it
});

test('the checksum is read from what certutil and shasum print', () => {
  const hex = NODE_PIN.archives.windows.sha256;
  assert.equal(parseHash(CERTUTIL(hex)), hex);
  assert.equal(parseHash(CERTUTIL(hex.toUpperCase())), hex);
  assert.equal(parseHash(CERTUTIL(hex.match(/../g).join(' '))), hex); // older Windows: a space between bytes
  assert.equal(parseHash(`${hex}  /Users/ada/Library/Application Support/Rostrum/node/node-v22.23.3-darwin-arm64.tar.gz\n`), hex);
  assert.equal(parseHash('CertUtil: -hashfile command FAILED: 0x80070002\r\n'), null);
  assert.equal(parseHash(''), null);
  assert.equal(parseHash(hex.slice(1)), null);
});

test('the fetch: download, checksum, and only then unpack and try it; every program by its full path with a fixed argument list', async () => {
  const m = machine(GOOD);
  assert.equal(await installNode(m.run, WIN, 'windows', '', m.say), `${DIR}\\node.exe`);
  assert.deepEqual(m.ran.map((r) => r.argv), [
    [`${SYS}\\curl.exe`, '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--retry', '3', '--create-dirs', '--output', ZIP, 'https://nodejs.org/dist/v22.23.3/node-v22.23.3-win-x64.zip'],
    [`${SYS}\\certutil.exe`, '-hashfile', ZIP, 'SHA256'],
    [`${SYS}\\tar.exe`, '-xf', ZIP, '-C', DIR, '--strip-components=1'],
    [`${DIR}\\node.exe`, '--version'],
    [`${SYS}\\WindowsPowerShell\\v1.0\\powershell.exe`, '-NoProfile', '-NonInteractive', '-Command', 'Remove-Item -LiteralPath $env:ROSTRUM_REMOVE -Force'],
  ]);
  assert.deepEqual(m.ran.at(-1).init, { env: { ROSTRUM_REMOVE: ZIP } }); // the path is never part of the command's text
  assert.deepEqual([m.ran[0].init.timeoutMs, m.ran[2].init.timeoutMs], [600_000, 600_000]);
  assert.deepEqual(m.said.map((s) => [s.state, s.label, s.pct]), [['fetching', 'Downloading Node 22.23.3', 5], ['verifying', 'Checking the download', 70], ['unpacking', 'Unpacking Node', 80], ['done', 'Node 22.23.3 is ready', 100]]);
  // SystemRoot elsewhere; a Mac's own programs and places
  const d = machine(GOOD);
  await installNode(d.run, { ...WIN, systemRoot: 'D:\\WinNT' }, 'windows', '', d.say);
  assert.equal(d.ran[0].argv[0], 'D:\\WinNT\\System32\\curl.exe');
  const mac = machine({ shasum: { stdout: `${NODE_PIN.archives['mac-arm64'].sha256}  x\n` }, node: { stdout: 'v22.23.3\n' } }), home = '/Users/ada/Library/Application Support/Rostrum/node';
  assert.equal(await installNode(mac.run, { home: '/Users/ada' }, 'mac', 'arm64', mac.say), `${home}/bin/node`);
  assert.deepEqual(mac.ran.map((r) => r.argv[0]), ['/usr/bin/curl', '/usr/bin/shasum', '/usr/bin/tar', `${home}/bin/node`, '/bin/rm']);
  assert.deepEqual(mac.ran[1].argv, ['/usr/bin/shasum', '-a', '256', `${home}/node-v22.23.3-darwin-arm64.tar.gz`]);
  assert.deepEqual(mac.ran.at(-1).argv, ['/bin/rm', '-f', `${home}/node-v22.23.3-darwin-arm64.tar.gz`]);
});

test('a download that does not match its checksum is removed, and never unpacked or run', async () => {
  for (const certutil of [{ stdout: CERTUTIL('0'.repeat(64)) }, { stdout: 'CertUtil: -hashfile command FAILED\r\n', exitCode: 1 }, { stdout: '' }, 'throws']) {
    const m = machine({ ...GOOD, 'certutil.exe': certutil });
    assert.equal(await installNode(m.run, WIN, 'windows', '', m.say), null);
    assert.deepEqual(m.names(), ['curl.exe', 'certutil.exe', 'powershell.exe'], 'no tar, no node');
    assert.deepEqual(m.said.at(-1), { state: 'failed', label: 'Not downloaded', pct: 0, note: 'The download did not match the checksum nodejs.org publishes for it, so it was not unpacked or run, and it was removed. Press again.' });
  }
  // the checksum of another platform's archive is not this one's
  const other = machine({ ...GOOD, 'certutil.exe': { stdout: CERTUTIL(NODE_PIN.archives['mac-x64'].sha256) } });
  assert.equal(await installNode(other.run, WIN, 'windows', '', other.say), null);
  assert.deepEqual(other.names(), ['curl.exe', 'certutil.exe', 'powershell.exe']);
  // it could not even be removed: said without the claim
  const stuck = machine({ ...GOOD, 'certutil.exe': { stdout: CERTUTIL('0'.repeat(64)) }, 'powershell.exe': { exitCode: 1 } });
  await installNode(stuck.run, WIN, 'windows', '', stuck.say);
  assert.equal(stuck.said.at(-1).note, 'The download did not match the checksum nodejs.org publishes for it, so it was not unpacked or run. Press again.');
});

test('the fetch fails in plain words: no connection, an archive that will not unpack, a Node that will not run, nothing to fetch', async () => {
  const down = machine({ ...GOOD, 'curl.exe': { exitCode: 6 } });
  assert.equal(await installNode(down.run, WIN, 'windows', '', down.say), null);
  assert.deepEqual(down.names(), ['curl.exe', 'powershell.exe']); // what was left of it is removed; nothing is hashed, unpacked or run
  assert.equal(down.said.at(-1).note, 'The download did not finish. Check the connection and press again.');
  const noCurl = machine({ ...GOOD, 'curl.exe': 'throws' });
  await installNode(noCurl.run, WIN, 'windows', '', noCurl.say);
  assert.equal(noCurl.said.at(-1).note, 'The download did not finish. Check the connection and press again.');
  const bad = machine({ ...GOOD, 'tar.exe': { exitCode: 1 } });
  assert.equal(await installNode(bad.run, WIN, 'windows', '', bad.say), null);
  assert.deepEqual(bad.names(), ['curl.exe', 'certutil.exe', 'tar.exe']);
  assert.equal(bad.said.at(-1).note, 'The download could not be unpacked. Press again.');
  const wrong = machine({ ...GOOD, 'node.exe': { stdout: 'v20.0.0\n' } });
  assert.equal(await installNode(wrong.run, WIN, 'windows', '', wrong.say), null);
  assert.equal(wrong.said.at(-1).note, 'The Node that was unpacked did not run on this computer. Ask Claude to fix this.');
  const linux = machine();
  assert.equal(await installNode(linux.run, { home: '/home/ada' }, 'linux', 'x86_64', linux.say), null);
  assert.deepEqual(linux.ran, []);
  assert.equal(linux.said.at(-1).note, 'Node cannot be downloaded for this computer. Install Node 22 from nodejs.org, then press Start Rostrum again.');
});
