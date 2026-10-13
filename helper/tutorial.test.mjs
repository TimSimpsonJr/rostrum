import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adopt, listTutorials, readTutorial, siteOf, transition, writeTutorial } from './tutorial.mjs';

const T = (state = 'recorded') => ({ id: 'rec-1', title: null, site: 'x.test', brand: null, state, busy: null, error: null, flags: { noMic: false }, renders: [], updatedAt: '' });

test('the happy path, recorded to done, through every event in order', () => {
  let t = T();
  for (const [event, state] of [['prepared', 'recorded'], ['scripted', 'scripted'], ['approved', 'approved'], ['voiced', 'voiced'], ['built', 'built'], ['rebuilt', 'built'], ['reviewed', 'reviewed'], ['done', 'done']]) {
    t = transition(t, event);
    assert.equal(t.state, state, event);
    assert.equal(t.busy, null);
    assert.equal(t.error, null);
  }
});

test('an event from the wrong state throws; an unknown event throws', () => {
  assert.throws(() => transition(T('recorded'), 'approved'), /approved from recorded/);
  assert.throws(() => transition(T('built'), 'voiced'), /voiced from built/);
  assert.throws(() => transition(T(), 'publish'), /unknown event publish/);
});

test('a failure keeps the state with the error and no busy stage; retry clears it; retry with no error throws', () => {
  const busy = transition(T('voiced'), 'busy', { stage: 'render' });
  assert.equal(busy.busy, 'render');
  const failed = transition(busy, 'failed', { stage: 'render', message: 'render failed (exit 1)' });
  assert.equal(failed.state, 'voiced');
  assert.equal(failed.busy, null);
  assert.deepEqual(failed.error, { stage: 'render', message: 'render failed (exit 1)' });
  const again = transition(failed, 'retry');
  assert.equal(again.error, null);
  assert.equal(again.state, 'voiced');
  assert.throws(() => transition(again, 'retry'), /nothing to retry/);
});

test('reopening: an edited script goes back to scripted and must be approved again before it is voiced', () => {
  const back = transition(T('approved'), 'editScript');
  assert.equal(back.state, 'scripted');
  assert.throws(() => transition(back, 'voiced'), /voiced from scripted/);
  assert.equal(transition(transition(back, 'approved'), 'voiced').state, 'voiced');
  assert.equal(transition(T('voiced'), 'revoice').state, 'approved');
  assert.equal(transition(T('reviewed'), 'notes').state, 'built');
  assert.equal(transition(T('done'), 'reopen').state, 'reviewed');                    // a finished tutorial, brought back: approved again
  assert.throws(() => transition(T('built'), 'reopen'), /reopen from built/);
});

test('the error message is cut to 400 characters; a title given with an event is kept', () => {
  assert.equal(transition(T(), 'failed', { stage: 'prepare', message: 'x'.repeat(900) }).error.message.length, 400);
  assert.equal(transition(T(), 'scripted', { title: 'Find the thing' }).title, 'Find the thing');
});

test('state file: written whole and read back; a recording without one is adopted as recorded', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tut-'));
  try {
    const a = path.join(home, 'rec-100'), b = path.join(home, 'rec-200');
    fs.mkdirSync(path.join(a, 'recording'), { recursive: true });
    fs.writeFileSync(path.join(a, 'recording', 'events.ndjson'), JSON.stringify({ type: 4, data: { href: 'https://app.site.test/people/42?token=abc', width: 10, height: 10 }, timestamp: 1 }) + '\n');
    fs.mkdirSync(path.join(a, 'recording', 'assets'), { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    writeTutorial(b, { ...T('built'), title: 'B', renders: ['v1.mp4'] });
    fs.mkdirSync(path.join(home, 'Brands', 'recording'), { recursive: true });        // reserved: never a tutorial
    fs.writeFileSync(path.join(home, 'Brands', 'recording', 'events.ndjson'), '{}\n');
    fs.mkdirSync(path.join(home, 'empty'));                                             // no recording, no state file
    assert.equal(siteOf(a), 'app.site.test');                                           // the host only: no path, no query
    const list = listTutorials(home);
    assert.deepEqual(list.map((t) => t.id).sort(), ['rec-100', 'rec-200']);
    const adopted = list.find((t) => t.id === 'rec-100');
    assert.equal(adopted.state, 'recorded');
    assert.equal(adopted.site, 'app.site.test');
    assert.equal(adopted.flags.noMic, true);                                            // no microphone file at all
    assert.ok(!JSON.stringify(adopted).includes('token'));
    assert.equal(readTutorial(b).title, 'B');
    assert.equal(readTutorial(b).id, 'rec-200');                                        // the folder's name, whatever the file says
    assert.equal(readTutorial(path.join(home, 'empty')), null);
    assert.equal(adopt(path.join(home, 'empty')), null);
    fs.writeFileSync(path.join(a, 'recording', 'mic.webm'), Buffer.alloc(20 * 1024));
    fs.rmSync(path.join(a, 'tutorial.json'));
    assert.equal(adopt(a).flags.noMic, false);
    assert.ok(!fs.existsSync(path.join(a, 'tutorial.json.tmp')));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

const made = [];
const dirWith = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-t-')); made.push(d); writeTutorial(d, { ...t, id: path.basename(d) }); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

test('progress is cleared by a state change and by a failure, kept by busy', () => {
  const t = { ...readTutorial(dirWith({ state: 'voiced', progress: { phase: 'staging', label: 'Staging shots', pct: 20, note: null, at: 'x' } })) };
  assert.equal(transition(t, 'busy', { stage: 'measure' }).progress.phase, 'staging');
  assert.equal(transition(t, 'built').progress, null);
  assert.equal(transition(t, 'failed', { stage: 'measure', message: 'x' }).progress, null);
  assert.deepEqual([readTutorial(dirWith({ state: 'recorded' })).archived, readTutorial(dirWith({ state: 'recorded' })).length], [false, null]);
});

test('a recording with a voice or pauses but no page is shown, with what happened, once it has settled', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tut-'));
  after(() => fs.rmSync(home, { recursive: true, force: true }));
  const make = (id, files, ageMs) => {
    const rec = path.join(home, id, 'recording');
    fs.mkdirSync(rec, { recursive: true });
    for (const f of files) { fs.writeFileSync(path.join(rec, f), 'x'); const at = new Date(Date.now() - ageMs); fs.utimesSync(path.join(rec, f), at, at); }
  };
  make('rec-1', ['mic.webm', 'mic.json', 'segments.json'], 5 * 60 * 1000); // over: nothing has changed for five minutes
  make('rec-2', ['mic.webm'], 10 * 1000);                                  // perhaps still being recorded
  make('rec-3', ['segments.json'], 3 * 60 * 1000);                         // no voice either
  make('rec-4', [], 0);                                                    // an empty folder is nothing
  const list = listTutorials(home);
  assert.deepEqual(list.map((t) => t.id).sort(), ['rec-1', 'rec-3']);
  const t = list.find((x) => x.id === 'rec-1');
  assert.equal(t.state, 'recorded');
  assert.equal(t.error.stage, 'record');
  assert.match(t.error.message, /^The page was not captured in this recording, only your narration\. Record it again/);
  assert.equal(readTutorial(path.join(home, 'rec-1')).error.stage, 'record'); // it has a state file now, so it can be deleted like any other
  assert.equal(adopt(path.join(home, 'rec-2')), null);
  assert.equal(adopt(path.join(home, 'rec-2'), Date.now() + 3 * 60 * 1000).error.stage, 'record'); // two minutes on, it is over too
});
