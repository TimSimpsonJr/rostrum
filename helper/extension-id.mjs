// The recorder extension's id. It is fixed by the public key in extension/manifest.json (`key`): Chrome derives an
// unpacked extension's id from that key, so every install of the bundled recorder has this id, and the helper can tell
// the recorder from any other extension in the same browser. helper/extension-id.test.mjs recomputes it from the key.
// A developer who loads the recorder under another id sets ROSTRUM_EXTENSION_ID.
import crypto from 'node:crypto';

export const EXTENSION_ID = 'mhmebnimpilnnobgidbhffnmkeenpcfo';

/** The id Chrome gives an extension whose manifest `key` is this base64 public key (DER SubjectPublicKeyInfo): the
 *  first 16 bytes of its SHA-256, each hex digit 0-f written as a-p. */
export const idOfKey = (key) => [...crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16)]
  .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');
