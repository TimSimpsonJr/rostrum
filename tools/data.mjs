// Where Rostrum keeps what it downloads that is not an npm package (the transcriber and its model): a folder of the
// user's own, never inside the plugin (a plugin update replaces that folder). And where the tutorials folder is
// when nothing names one.
import os from 'node:os';
import path from 'node:path';

/** `ROSTRUM_DATA`, else Windows %LOCALAPPDATA%\Rostrum, macOS ~/Library/Application Support/Rostrum, elsewhere
 *  $XDG_DATA_HOME/rostrum or ~/.local/share/rostrum. */
export function dataDir({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.ROSTRUM_DATA) return path.resolve(env.ROSTRUM_DATA);
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Rostrum');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Rostrum');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'rostrum');
}

/** The tutorials folder when none is named: `ROSTRUM_HOME`, else Rostrum in the home folder's videos folder, which
 *  a Mac calls Movies and Windows and Linux call Videos (hooks/helper.ts `tutorialsDir` gives the panel the same). */
export function tutorialsHome({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  return env.ROSTRUM_HOME || (platform === 'win32' ? path.win32 : path.posix).join(home, platform === 'darwin' ? 'Movies' : 'Videos', 'Rostrum');
}
