// The one place a download is named: where it comes from, how big it is, and the SHA-256 it must have. Nothing is
// fetched without a checksum here and nothing fetched is unpacked or run unless it matches (tools/fetch.mjs).
// A pin whose `sha256` is null is NOT YET PINNED: that download is refused, and Rostrum goes on without it.
// One download is named elsewhere: Node itself, which the panel fetches before there is a Node to run this file
// (hooks/node.ts `NODE_PIN`, with its checksums; a mod may import only its own files).

/** Hosts a pin may name (https only). A download may be redirected to the host's own storage: the checksum is the check. */
export const HOSTS = ['github.com', 'huggingface.co', 'nodejs.org'];

export const PINS = {
  // whisper.cpp's own Windows build, from its release page. Size and checksum are the ones GitHub publishes for the
  // file (the release API's `digest`); the download made on Oct 13 2026 matched both. `exe` is the program's path
  // inside the archive, which holds one folder, `Release`: the program, the libraries it loads from beside it
  // (whisper.dll, ggml.dll, ggml-base.dll, a ggml-cpu-*.dll chosen for the processor) and programs Rostrum never runs.
  // Nothing in it is signed, and it needs the Microsoft Visual C++ runtime that most Windows machines already have.
  // To move to another release: its `digest` must be there in the API, and helper/whisper.mjs's flags and the shape
  // of the JSON it reads must be checked again on real speech.
  // `keep`: what stays of the archive besides `exe` (paths inside it; `*` is any run of characters in a name). Each
  // must be there, and every file that none of them names is removed before the folder is put in place
  // (tools/fetch.mjs `keepOnly`): the server, stream, bench, talk-llama, parakeet and test programs, main.exe, SDL2.dll
  // (the program does not import it). A later release's new file is removed too until it is named here.
  'whisper-win32-x64': {
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip',
    version: 'v1.9.2',
    size: 8194445,
    sha256: '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a',
    exe: 'Release/whisper-cli.exe',
    keep: ['Release/whisper.dll', 'Release/ggml.dll', 'Release/ggml-base.dll', 'Release/ggml-cpu-*.dll'],
  },
  // The English "small" model, at one revision of the model repository (an address that cannot change under us).
  // Size and checksum are the ones Hugging Face publishes for the file (its LFS record); the fetch checks both.
  model: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.en.bin',
    size: 487614201,
    sha256: 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d',
  },
};

/** Is this a pin a download may be made from? (a checksum of 64 hex digits, a size, https on a host named above) */
export function isPinned(pin) {
  let url = null;
  try { url = new URL(pin?.url); } catch { return false; }
  return /^[0-9a-f]{64}$/.test(pin.sha256 ?? '') && Number.isInteger(pin.size) && pin.size > 0 && url.protocol === 'https:' && HOSTS.includes(url.hostname);
}
