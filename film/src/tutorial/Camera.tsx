// One recorded screen under its camera, as a window on the stage (16 px corners, hairline edge, the stage shadow).
// The camera is a plain 2D transform on the screen itself (sharp at any scale: see RecordedScreen), so the corner
// radius and the shadow are divided by the scale to keep their size on the frame.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { RecordedScreen } from '../RecordedScreen';
import { Rule } from '../standins';
import { FPS, H, TOKEN, W, stageShadow } from '../kit/stage';
import { BrowserBar } from '../moves/browser-bar/BrowserBar';
import { BarSpec, barMetrics } from '../moves/browser-bar/bar';
import { Box, CamKey, Scroll, Size, cameraAt, scrollAt } from './cameraAt';

export { cameraAt, project, cameraFaults } from './cameraAt';
export type { Box, Cam, CamKey, Scroll } from './cameraAt';

export const FRAME = { width: W, height: H };

/** One element of a screen alone, for a move that lifts it out (the contract's `lift`): the screen rebuilt once more
 *  with only node `node` showing, where the page laid it out (`unclip`: in a windowed shot, laid out as the window
 *  is), on its own ground, cropped to its measured `box` (screen px) and drawn `width` px wide (default: its own
 *  width). `write`: staged as the shot's own screen is. One more rebuilt screen for as long as it is mounted. */
export const Lifted: React.FC<{ screen: number; extend?: number; node: number; box: Box; width?: number; unclip?: number[]; write?: (doc: Document, mirror: any) => void }> = ({ screen, extend, node, box, width, unclip, write }) => {
  const k = width != null ? width / box.w : 1;
  return (
    <div style={{ width: box.w * k, height: box.h * k, overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: box.w, height: box.h, transformOrigin: '0 0', transform: `scale(${k.toFixed(5)})` }}>
        <RecordedScreen screen={screen} extend={extend} isolate={[node]} unclip={unclip} grounded write={write} style={{ position: 'absolute', left: -box.x, top: -box.y }} />
      </div>
    </div>
  );
};

export const Camera: React.FC<{
  screen: number; standIns?: Rule[]; keys: CamKey[];
  /** the document's scroll, when not its capture's own (RecordedScreen `pageY`; a whole screen only) */
  pageY?: number;
  /** px the screen is rebuilt taller than recorded (RecordedScreen `extend`) */
  extend?: number;
  /** a layer over another capture of the same page (RecordedScreen `layer`): no ground, no shadow, no bar of its own */
  layer?: number[];
  /** the window's own entrance or exit on the stage, on top of the camera: opacity, a scale about the frame's centre, px of rise */
  opacity?: number; scale?: number; rise?: number;
  /** px the window stands to the side of where its camera has it (an open that makes room for the title) */
  shift?: number;
  /** how much (0..1) of a windowed shot's frame is there: its ground, its rounded corners, its shadow. At 0 the
   *  elements stand on the stage by themselves (each on the page's own colour); they do not move as it comes */
  frame?: number;
  /** frame px of blur over the whole window, while the screen recedes behind a list; 0: none, and no filter at all */
  blur?: number;
  /** how far (0..1) the screen has receded under a move that lifts something out of it: at 1 it stands at 0.9 of
   *  its size and 0.4 of its strength, softened by 8 px */
  recede?: number;
  write?: (doc: Document, mirror: any) => void;
  /** the window shows some nodes of the screen alone (`isolate`), laid out unclipped, through this box of the screen;
   *  `scroll`: how far their content has moved up inside it, over time. Without a window: the whole screen */
  window?: Box; isolate?: number[]; scroll?: Scroll[];
  /** a browser bar at the window's top (moves/browser-bar): `out` 0..1 of it is out of the top edge, and the window is
   *  that much taller, upward (the page keeps its place in the screen's own px; the camera's keys move it on the frame) */
  bar?: { spec: BarSpec; viewport: Size; out: number; hover: number; press: number };
}> = ({ screen, pageY, extend, layer, standIns, keys, opacity: own = 1, scale: size = 1, rise = 0, shift = 0, frame: framed = 1, blur: soft = 0, recede = 0, write, window, isolate, scroll, bar }) => {
  const frame = useCurrentFrame(), cam = cameraAt(keys, frame, FRAME);
  const opacity = own * (1 - 0.6 * recede), scale = size * (1 - 0.1 * recede), blur = soft + 8 * recede;
  const camera = `translate(${(W / 2 - cam.s * cam.cx).toFixed(3)}px, ${(H / 2 - cam.s * cam.cy).toFixed(3)}px) scale(${cam.s.toFixed(6)})`;
  const up = bar ? barMetrics(bar.viewport.width).height * bar.out : 0;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity, transformOrigin: '50% 50%', transform: `translate(${shift.toFixed(3)}px, ${rise.toFixed(3)}px) scale(${scale.toFixed(5)})`, ...(blur > 0 ? { filter: `blur(${blur.toFixed(2)}px)` } : {}) }}>
    {window ? (
      // the screen's own px under the camera; in it, the window's box with the frame and shadow, the page shifted so
      // the nodes sit where they were laid out (every measured box stays true), and up by the scroll
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: camera }}>
        {/* (a frame that is not all there: its ground and shadow on a layer under the content, at that strength) */}
        {framed < 1 && framed > 0 ? <div style={{ position: 'absolute', left: window.x, top: window.y, width: window.w, height: window.h, background: TOKEN.card, borderRadius: 16 / cam.s, boxShadow: stageShadow(cam.s), opacity: framed }} /> : null}
        <div style={{ position: 'absolute', left: window.x, top: window.y, width: window.w, height: window.h, overflow: 'hidden', ...(framed < 1 ? { borderRadius: (16 * framed) / cam.s } : { background: TOKEN.card, borderRadius: 16 / cam.s, boxShadow: stageShadow(cam.s) }) }}>
          <RecordedScreen screen={screen} isolate={isolate} unclip={isolate} standIns={standIns} write={write} style={{ position: 'absolute', left: -window.x, top: -window.y, transform: `translate(0px, ${(-scrollAt(scroll, frame / FPS)).toFixed(3)}px)` }} />
        </div>
      </div>
    ) : bar ? (
      // a shot with a bar: the window is the page with the bar above it (from -up to the page's bottom), one frame and
      // shadow round both; the page itself does not move in the screen's px, so every measured box stays true
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: camera }}>
        <div style={{ position: 'absolute', left: 0, top: -up, width: bar.viewport.width, height: bar.viewport.height + up, overflow: 'hidden', background: '#fff', borderRadius: 16 / cam.s, boxShadow: stageShadow(cam.s) }}>
          <RecordedScreen screen={screen} pageY={pageY} extend={extend} layer={layer} standIns={standIns} write={write} style={{ position: 'absolute', left: 0, top: up, overflow: 'hidden' }} />
          {bar.out > 0 ? <BrowserBar spec={bar.spec} width={bar.viewport.width} out={bar.out} hover={bar.hover} press={bar.press} /> : null}
        </div>
      </div>
    ) : (
    <RecordedScreen
      screen={screen} pageY={pageY} extend={extend} layer={layer} standIns={standIns} write={write}
      style={{
        position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', background: layer ? 'transparent' : '#fff', overflow: 'hidden',
        transform: camera,
        borderRadius: 16 / cam.s, boxShadow: layer ? 'none' : stageShadow(cam.s),
      }}
    />
    )}
    </div>
  );
};
