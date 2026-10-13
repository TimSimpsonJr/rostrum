// A stand-in for a Windows program that cannot start because a library it needs is not on the computer: it ends with
// the code Windows gives then (STATUS_DLL_NOT_FOUND; tools/fetch.mjs NO_RUNTIME). Only Windows keeps all 32 bits of it.
process.exit(0xC0000135);
