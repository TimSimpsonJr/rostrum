// The smallest move: a short authored label on the stage between two cues. It proves the plumbing (tools/moves.mjs,
// beats.ts `moves`, the Template, the Move still) and is a plain label a film can use.
export const about = {
  name: 'mark-time', use: 'moves',
  for: 'A short plain label on the stage, low and centred, from one cue to another: "Step 2", "Before", a name.',
  inputs: { text: 'two to four words (authored)', at: 'the cue it sets on (default: the line start)', until: 'the cue it clears on (default: the line end)' },
  takes: '0.4 s to set, 0.3 s to clear', text: ['text'], reads: ['nothing of the screen'],
  example: { line: 1, moves: [{ move: 'mark-time', text: 'Step 2', at: 'open', until: 'profile' }] },
};
export const check = (i: { text?: unknown }) => (typeof i.text === 'string' && i.text.trim() && i.text.length <= 40 ? null : 'text is two to four words');
export const text = (i: { text: string }) => [i.text];
export const takes = () => 0.7;
