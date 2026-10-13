// Copies generated inputs into place (all gitignored): browser-side scripts into extension/vendor/ (the recorder the
// worker injects into the recorded tab), and the three fixture recordings, prepared, into fixtures/tutorials/<id>/film/clean/ (see tools/prepare-recording.mjs), so a fixture
// renders like any tutorial: npm run still -- fixtures/tutorials/<id> Screen-keys <out.png>.
import fs from 'node:fs';
import { prepare } from './prepare-recording.mjs';

fs.mkdirSync('extension/vendor', { recursive: true });
fs.copyFileSync('node_modules/rrweb/umd/rrweb.js', 'extension/vendor/rrweb.js');
fs.copyFileSync('film/public/kit/GeistVF.woff2', 'extension/vendor/GeistVF.woff2'); // the popup's typeface
// The extension copy of page.js gets a message listener appended: the MAIN world has no chrome.*, so
// extension/bridge.js drives it with window.postMessage. 'ready' lets the bridge answer if it loaded first.
const BRIDGE_LISTENER = `
(() => {
  addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.ct === 'start') {
      const id = e.data.id;
      window.__rostrum.start({
        id,
        post: (events) => window.postMessage({ ct: 'events', id, events }, location.origin),
        assets: (urls) => window.postMessage({ ct: 'assets', urls }, location.origin),
      });
    } else if (e.data.ct === 'stop') window.__rostrum.stop();
  });
  window.postMessage({ ct: 'ready' }, location.origin);
})();
`;
fs.writeFileSync('extension/vendor/page.js', fs.readFileSync('recorder/page.js', 'utf8') + BRIDGE_LISTENER);

// extension/manifest.json is a committed, static file (it names no site: the recorder may run on any page and records
// only the tab it is started on); nothing here writes it.

for (const id of ['fixture-1', 'fixture-keys', 'fixture-keys-dark']) if (fs.existsSync(`recordings/${id}/events.ndjson`)) prepare(`fixtures/tutorials/${id}`, { from: `recordings/${id}` });
