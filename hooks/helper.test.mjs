// The panel's knowledge of the helper: addresses, retry routes, prompts, start and open commands, parsing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS, helperArgv, openArgvs, parseTutorial, parseTutorials, platformOf, portOf, refusal, retryRoute, routes, tail, tutorialsDir } from './helper.ts';
import { tutorialsHome } from '../tools/data.mjs';

test('the port is ROSTRUM_PORT when it is a port, else 4600', () => {
  assert.equal(portOf(undefined), 4600);
  assert.equal(portOf(''), 4600);
  assert.equal(portOf('4700'), 4700);
  assert.equal(portOf('abc'), 4600);
  assert.equal(portOf('70000'), 4600);
});

test('the addresses are the helper\'s own routes on 127.0.0.1', () => {
  const at = routes(4600);
  assert.equal(at.health, 'http://127.0.0.1:4600/health');
  assert.equal(at.tutorials, 'http://127.0.0.1:4600/tutorials');
  assert.equal(at.tutorial('rec-1'), 'http://127.0.0.1:4600/tutorials/rec-1');
  assert.equal(at.state('rec-1'), 'http://127.0.0.1:4600/tutorials/rec-1/state');
  assert.equal(at.stage('rec-1', 'prepare'), 'http://127.0.0.1:4600/tutorials/rec-1/prepare');
  assert.equal(at.page('rec-1'), 'http://127.0.0.1:4600/tutorials/rec-1/page');
  assert.equal(at.review('rec-1'), 'http://127.0.0.1:4600/review/?tutorial=rec-1');
  assert.equal(at.prepared('rec-1'), 'http://127.0.0.1:4600/tutorials/rec-1/elements?screen=9999');
  assert.equal(routes(4700).health, 'http://127.0.0.1:4700/health');
});

test('each failed stage is retried on its own route', () => {
  for (const stage of ['prepare', 'transcribe', 'time', 'measure', 'sweep', 'render']) assert.deepEqual(retryRoute(stage), { route: stage });
  assert.deepEqual(retryRoute('stills'), { route: 'stills', body: { moments: true } });
  assert.equal(retryRoute('nonsense'), null);
  assert.equal(retryRoute('constructor'), null);
  assert.equal(retryRoute(''), null);
});

test('the prompts name the skill, the stage and the tutorial', () => {
  assert.equal(PROMPTS.script('rec-1'), 'Rostrum: write the script for tutorial rec-1');
  assert.equal(PROMPTS.showScript('rec-1'), 'Rostrum: show the script for tutorial rec-1');
  assert.equal(PROMPTS.narration('rec-1'), 'Rostrum: add narration for tutorial rec-1');
  assert.equal(PROMPTS.build('rec-1'), 'Rostrum: build tutorial rec-1');
  assert.equal(PROMPTS.notes('rec-1'), 'Rostrum: fix the review notes for tutorial rec-1');
});

test('the platform comes from the OS variable, else uname', () => {
  assert.equal(platformOf('Windows_NT', undefined), 'windows');
  assert.equal(platformOf(undefined, 'Darwin\n'), 'mac');
  assert.equal(platformOf(undefined, 'Linux\n'), 'linux');
  assert.equal(platformOf(undefined, undefined), 'linux');
});

test('a page is opened with the platform\'s own opener', () => {
  const url = 'http://127.0.0.1:4600/review/?tutorial=rec-1';
  // Windows: the shell's own opener, then cmd's; the others have one
  assert.deepEqual(openArgvs('windows', url), [['rundll32', 'url.dll,FileProtocolHandler', url], ['cmd', '/c', 'start', '', url]]);
  assert.deepEqual(openArgvs('mac', url), [['open', url]]);
  assert.deepEqual(openArgvs('linux', url), [['xdg-open', url]]);
});

test('the tutorials folder: the stored one, else ROSTRUM_HOME, else Videos/Rostrum under home', () => {
  const env = { rostrumHome: 'D:\\Films', userProfile: 'C:\\Users\\ada', home: '/home/ada' };
  assert.equal(tutorialsDir({ ...env, stored: 'E:\\Chosen', platform: 'windows' }), 'E:\\Chosen');
  assert.equal(tutorialsDir({ ...env, stored: undefined, platform: 'windows' }), 'D:\\Films');
  assert.equal(tutorialsDir({ ...env, stored: 7, rostrumHome: '', platform: 'windows' }), 'C:\\Users\\ada\\Videos\\Rostrum');
  assert.equal(tutorialsDir({ userProfile: 'C:\\Users\\ada\\', platform: 'windows' }), 'C:\\Users\\ada\\Videos\\Rostrum');
  assert.equal(tutorialsDir({ home: '/home/ada', platform: 'linux' }), '/home/ada/Videos/Rostrum');
  assert.equal(tutorialsDir({ home: '/Users/ada', platform: 'mac' }), '/Users/ada/Movies/Rostrum');
  assert.equal(tutorialsDir({ platform: 'linux' }), null);
  // the helper's own default (tools/data.mjs) is the same folder on the three platforms
  for (const [platform, node, home] of [['windows', 'win32', 'C:\\Users\\ada'], ['mac', 'darwin', '/Users/ada'], ['linux', 'linux', '/home/ada']]) {
    assert.equal(tutorialsHome({ env: {}, platform: node, home }), tutorialsDir({ userProfile: home, home, platform }), platform);
  }
  assert.equal(tutorialsHome({ env: { ROSTRUM_HOME: 'D:\\Films' }, platform: 'win32', home: 'C:\\Users\\ada' }), 'D:\\Films');
});

test('the helper is started with type stripping, from its own file, on the tutorials folder', () => {
  assert.deepEqual(helperArgv(undefined, 'C:\\T'), ['node', '--experimental-strip-types', 'helper/server.mjs', '--tutorials', 'C:\\T']);
  assert.deepEqual(helperArgv('C:\\node\\node.exe', null), ['C:\\node\\node.exe', '--experimental-strip-types', 'helper/server.mjs']);
  assert.deepEqual(helperArgv('  ', null)[0], 'node');
});

test('the last lines of the output are kept, across pieces that end anywhere', () => {
  let lines = tail([], 'one\ntw');
  lines = tail(lines, 'o\r\nthree\n');
  assert.deepEqual(lines.filter(Boolean), ['one', 'two', 'three']);
  for (let i = 0; i < 20; i++) lines = tail(lines, `line ${i}\n`);
  assert.deepEqual(lines.filter(Boolean), ['line 16', 'line 17', 'line 18', 'line 19']);
  assert.equal(tail([], 'x'.repeat(500))[0].length, 200);
});

const ONE = { id: 'rec-1760000000000', title: null, site: 'app.example.test', brand: null, state: 'recorded', busy: null, error: null, flags: { noMic: true }, renders: [], sweep: null, updatedAt: 'x' };

test('the list is read as the helper sends it, and nothing else passes', () => {
  const s = parseTutorials(JSON.stringify({ tutorials: [ONE, { id: '../x', state: 'recorded' }, null, { ...ONE, id: 'b', error: { stage: 'sweep', message: 'm'.repeat(900) }, title: ' T ' }], recorder: { lastSeen: 5 }, brands: ['a', 3, 'b'], home: 'C:\\T' }));
  assert.equal(s.tutorials.length, 2);
  assert.deepEqual(s.tutorials[0], { id: 'rec-1760000000000', title: null, site: 'app.example.test', brand: null, state: 'recorded', busy: null, error: null, noMic: true, renders: [], progress: null, archived: false, length: null });
  assert.equal(s.tutorials[1].title, 'T');
  assert.equal(s.tutorials[1].error.message.length, 400);
  assert.equal(s.lastSeen, 5);
  assert.deepEqual(s.brands, ['a', 'b']);
  assert.equal(s.home, 'C:\\T');
  assert.equal(parseTutorials('ok'), null);
  assert.equal(parseTutorials('{"tutorials":3}'), null);
  assert.equal(parseTutorials(JSON.stringify({ tutorials: [] })).lastSeen, null);
  assert.equal(parseTutorial(JSON.stringify({ ...ONE, dir: 'C:\\T\\rec-1' })).id, ONE.id);
  assert.equal(parseTutorial('{"error":"no such tutorial"}'), null);
});

test('a refusal is the helper\'s own short words', () => {
  assert.equal(refusal('{"error":"busy: prepare"}'), 'busy: prepare');
  assert.equal(refusal('origin'), 'origin');
  assert.equal(refusal('<html>' + 'x'.repeat(100)), '');
});

test('a tutorial carries progress, archived and length; the snapshot carries requests', () => {
  const body = JSON.stringify({ tutorials: [{ ...ONE, progress: { phase: 'checking', label: 'Checking frames 2/3', pct: 53, note: 'Fixed a shot.', at: '2026-10-12T10:00:00.000Z' }, archived: true, length: 54.6 }, { ...ONE, id: 'b', progress: 'no', length: 'long' }], recorder: { lastSeen: null }, brands: [], home: null, requests: [{ n: 3, id: 'a', kind: 'notes' }, { n: 'x' }, { n: 4, id: '../x', kind: 'notes' }] });
  const s = parseTutorials(body);
  assert.deepEqual(s.tutorials[0].progress, { phase: 'checking', label: 'Checking frames 2/3', pct: 53, note: 'Fixed a shot.', at: Date.parse('2026-10-12T10:00:00.000Z') });
  // a time that is not one: none
  assert.equal(parseTutorial(JSON.stringify({ ...ONE, progress: { phase: 'making', label: 'Making new pieces', pct: 3, note: null, at: 'x' } })).progress.at, null);
  assert.deepEqual([s.tutorials[0].archived, s.tutorials[0].length], [true, 54.6]);
  assert.deepEqual([s.tutorials[1].progress, s.tutorials[1].archived, s.tutorials[1].length], [null, false, null]);
  assert.deepEqual(s.requests, [{ n: 3, id: 'a', kind: 'notes' }]);
  assert.deepEqual(parseTutorials(JSON.stringify({ tutorials: [] })).requests, []);
});

test('the new routes and prompts', () => {
  const r = routes(4600);
  assert.equal(r.install, 'http://127.0.0.1:4600/recorder/install');
  assert.equal(r.requestDone(3), 'http://127.0.0.1:4600/requests/3/done');
  assert.equal(r.progress('a'), 'http://127.0.0.1:4600/tutorials/a/progress');
  assert.equal(PROMPTS.setup('the transcriber'), 'Rostrum: set up the transcriber');
  assert.equal(PROMPTS.setup('Node for the helper'), 'Rostrum: set up Node for the helper');
  assert.deepEqual(openArgvs('windows', 'chrome://extensions'), [['cmd', '/c', 'start', '', 'chrome', 'chrome://extensions']]);
  assert.deepEqual(openArgvs('mac', 'chrome://extensions'), [['open', '-a', 'Google Chrome', 'chrome://extensions']]);
  assert.deepEqual(openArgvs('linux', 'chrome://extensions'), [['google-chrome', 'chrome://extensions']]);
});
