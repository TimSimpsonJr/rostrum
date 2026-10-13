// The tip card at the foot of the panel, under its heading "Did you know": one at a time, a new one each time the
// panel opens. A tip that depends on a feature names it and is shown only while the build has it. The fourteen are the
// design's, each without the heading's words and with its capital.
export const FEATURES = { chalk: false, pause: true, reopen: true, rename: true } as const
export type Feature = keyof typeof FEATURES
export const TIPS: readonly { text: string; needs: Feature | null }[] = [
  { text: 'Circle something with your pointer while you talk, and the film will point at it.', needs: 'chalk' },
  { text: 'You can talk naturally. The script is written from what you say, then tightened.', needs: null },
  { text: 'You can pause mid-walkthrough to sign in or think, and the gap is left out.', needs: 'pause' },
  { text: 'You don\'t have to hide private data. Names, keys and amounts are swapped for stand-ins before Claude reads anything.', needs: null },
  { text: 'If the account you recorded is empty, you can ask Claude to fill it with sample numbers.', needs: null },
  { text: 'You can change any line of the script by saying what to change, before or after approving.', needs: null },
  { text: 'When a line lists things, you can ask for them to appear on screen as a list.', needs: null },
  { text: 'You can hand over narration by dropping the audio file into chat.', needs: null },
  { text: 'You can ask for hand-drawn marks, like a circle or an underline, on any step.', needs: 'chalk' },
  { text: 'You can ask Claude to show the whole screen before zooming in on a step.', needs: null },
  { text: 'The film\'s colours and type follow the site you recorded, unless you set a brand.', needs: null },
  { text: 'Give Claude your branding folder and it sets up your logo, colours and voice.', needs: null },
  { text: 'You can reopen a finished tutorial by asking for it in chat.', needs: 'reopen' },
  { text: 'You can rename, archive or delete a tutorial by asking in chat.', needs: 'rename' },
]
export const tipsAvailable = (): string[] => TIPS.filter((t) => !t.needs || FEATURES[t.needs]).map((t) => t.text)
/** The i-th available tip, round and round. */
export function tipAt(i: number): string {
  const have = tipsAvailable()
  return have[((i % have.length) + have.length) % have.length]!
}
