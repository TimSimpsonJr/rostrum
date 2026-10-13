// Page-side recorder. window.__rostrum.start({ id, post, assets }) / .stop(). `post(events)` delivers a batch;
// optional `assets(urls)` gets the URLs of stylesheets, fonts and images the page loaded, each URL once per page.
(() => {
  if (window.__rostrum) return;
  let stopFn = null;
  let buf = [];
  let timer = null;
  let settling = null;
  let wired = false;
  let flush = () => {};
  let report = null;
  const sent = new Set();
  const ASSET = /\.(css|woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp)$/i;
  const pathOf = (u) => { try { return new URL(u).pathname; } catch { return ''; } };
  // ponytail: Chrome keeps 250 resource entries by default; raised so a heavy page does not drop late fonts.
  try { performance.setResourceTimingBufferSize(2000); } catch {}
  const reportAssets = () => {
    if (!report) return;
    const urls = [
      ...performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'css' || r.initiatorType === 'link' || ASSET.test(pathOf(r.name))).map((r) => r.name),
      ...[...document.styleSheets].map((s) => s.href),
    ].filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u) && !sent.has(u));
    const fresh = [...new Set(urls)];
    fresh.forEach((u) => sent.add(u));
    if (fresh.length) report(fresh);
  };
  const snap = () => { if (stopFn) { try { rrweb.record.takeFullSnapshot(); } catch {} } };
  // Settle snapshot: the first snapshot (at DOMContentLoaded) can catch images and web fonts mid-load.
  // Poll after `load` until both are in, give up at 3 s, then take one more full snapshot.
  const settle = () => {
    const t0 = Date.now();
    clearInterval(settling);
    settling = setInterval(() => {
      const done = [...document.images].every((i) => i.complete) && document.fonts.status === 'loaded';
      if (!done && Date.now() - t0 < 3000) return;
      clearInterval(settling);
      snap();
    }, 100);
  };
  window.__rostrum = {
    start({ id, post, assets }) {
      if (stopFn) return;
      report = assets ?? null;
      // every flush also reports new asset URLs: after the settle snapshot, on pagehide, on stop, and in between
      flush = () => { reportAssets(); if (buf.length) { const b = buf; buf = []; post(b); } };
      timer = setInterval(flush, 500);
      stopFn = rrweb.record({
        emit: (e) => { buf.push({ ...e, session: id, href: location.href }); },
        recordAfter: 'DOMContentLoaded',
        maskAllInputs: true,
        inlineStylesheet: true,
        inlineImages: true,
        collectFonts: true,
        recordCanvas: true,
        checkoutEveryNms: 5000,
      });
      if (!wired) { // once per page, however many times start is called
        wired = true;
        // a full snapshot at every click: each step's screen can be rebuilt without replaying mutations
        addEventListener('click', snap, { capture: true, passive: true });
        addEventListener('pagehide', () => flush());
        addEventListener('load', () => { if (stopFn) settle(); });
      }
      if (document.readyState === 'complete') settle(); // started on an already loaded page
    },
    stop() { if (stopFn) { stopFn(); stopFn = null; clearInterval(timer); clearInterval(settling); flush(); } },
  };
})();
