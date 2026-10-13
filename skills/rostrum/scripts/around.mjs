// What is around a node of a clean screen: the chain of elements that hold it, each with its tag and its measured
// size, and what the node itself holds. For choosing a beat file's `nodes`: the control, its row, the group, card or
// panel that a framing should hold.
//   node --experimental-strip-types around.mjs <tutorial folder> <screen> <node id>
// Reads <tutorial>/film/clean/screen-<i>.json and layout.json (the CLEAN copy only; never <tutorial>/recording/).
// Prints node ids, tags, sizes and, for elements that have a role, their text from the clean copy (40 characters).
import fs from 'node:fs';
import path from 'node:path';
import { elementsIn } from '../../../tools/scrub.mjs';
import { paths } from '../../../tools/paths.mjs';

const [dir, s, n] = process.argv.slice(2), screen = Number(s), id = Number(n);
if (!dir || !Number.isInteger(screen) || !Number.isInteger(id)) { console.log('usage: around.mjs <tutorial folder> <screen> <node id>'); process.exit(1); }
const P = paths(dir), read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const data = read(path.join(P.clean, `screen-${screen}.json`)), manifest = read(P.manifest), vp = manifest?.screens?.find((x) => x.i === screen)?.viewport ?? manifest?.viewport; // the screen's own window
if (!data?.node) { console.log(`no screen ${screen} in the clean copy`); process.exit(1); }
const boxes = read(P.layout)?.[screen]?.boxes ?? null;
const named = new Map(elementsIn(data.node, null, null).map((e) => [e.node, e]));
const chain = [];
(function find(node, line) { if (node.id === id) { chain.push(...line, node); return true; } return (node.childNodes ?? []).some((c) => find(c, [...line, node])); })(data.node, []);
if (!chain.length) { console.log(`node ${id} is not in screen ${screen} (node ids change when the page changes)`); process.exit(1); }
const count = (node) => (node.childNodes ?? []).reduce((sum, c) => sum + (c.tagName ? 1 + count(c) : 0), 0);
const line = (node) => {
  const b = boxes?.[node.id], e = named.get(node.id);
  const size = b ? `${Math.round(b.w)}x${Math.round(b.h)} at ${Math.round(b.x)},${Math.round(b.y)}${vp ? ` (${Math.round((100 * b.w) / vp.width)}% of the window's width)` : ''}` : boxes ? 'covered or hidden in this screen (ask about an earlier screen of the same page)' : 'not measured';
  return `${String(node.id).padStart(6)}  <${node.tagName}>  ${size}  holds ${count(node)} elements${e ? `  ${e.role} "${e.text}"` : ''}`;
};
console.log(`screen ${screen}${boxes ? '' : ' (not measured: no click or gesture on it, so no sizes)'}; from the node outward:`);
for (const node of chain.filter((c) => c.tagName && !['html', 'body'].includes(c.tagName)).reverse()) console.log((node.id === id ? '>' : ' ') + line(node));
const kids = (chain.at(-1).childNodes ?? []).filter((c) => c.tagName);
if (kids.length) { console.log('directly inside it:'); for (const k of kids.slice(0, 30)) console.log(' ' + line(k)); if (kids.length > 30) console.log(`  and ${kids.length - 30} more`); }
