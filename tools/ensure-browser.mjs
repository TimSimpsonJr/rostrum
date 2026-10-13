// Fetches the browser Remotion renders with (Chrome Headless Shell, into node_modules/.remotion), if it is not there:
// a render would fetch it by itself, silently and for minutes; setup (tools/setup.mjs) does it where the panel shows it.
// Prints {"pct":n} lines while it downloads. Needs the packages (it is the one setup file that imports one).
import { ensureBrowser } from '@remotion/renderer';

let last = -1;
await ensureBrowser({
  logLevel: 'error',
  onBrowserDownload: () => ({ version: null, onProgress: ({ percent }) => { const pct = Math.round(percent * 100); if (pct !== last) console.log(JSON.stringify({ pct: (last = pct) })); } }),
});
