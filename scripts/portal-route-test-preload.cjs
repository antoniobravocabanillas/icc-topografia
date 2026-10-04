// Standalone route tests run outside Next's compiler. Keep normal React exports
// for next/navigation while neutralizing only the compile-time server marker.
// This preload is test-only and is never imported by application code.
const marker = require.resolve('server-only');
require.cache[marker] = { id: marker, filename: marker, loaded: true, exports: {} };
