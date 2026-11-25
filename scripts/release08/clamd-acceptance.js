// BG-RELEASE08 scanner acceptance probe. Run from a checkout of the accepted API SHA against the scanner under test. No secrets; prints only PASS/FAIL lines.
const { createClamdScanner } = require('./src/media-intake/clamdScanner');
const host = process.env.CLAMD_HOST || '127.0.0.1', port = Number(process.env.CLAMD_PORT || 3310);
// The standard EICAR test string, assembled from parts so this file is not itself flagged by scanners. It is harmless.
const EICAR = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!', '$H+H*'].join(''));
const make = (extra = {}) => createClamdScanner({ host, port, timeoutMs: 10000, ...extra });
const checks = [
  ['clean bytes -> clean=true, signatures fresh', async () => { const r = await make().scan({ bytes: Buffer.from('fonzo clean test payload') }); if (r.clean !== true || !/^clamd-/.test(r.engine)) throw Error('unexpected result'); }],
  ['EICAR test string -> clean=false (signature hit)', async () => { const r = await make().scan({ bytes: EICAR }); if (r.clean !== false) throw Error('infected sample was not flagged'); }],
  ['32 MiB stream is accepted (StreamMaxLength >= 32 MiB)', async () => { const r = await make({ timeoutMs: 11000 }).scan({ bytes: Buffer.alloc(33554432, 0x41) }); if (r.clean !== true) throw Error('large stream not clean'); }],
  ['stale-signature guard fails closed', async () => { try { await make({ maxSignatureAgeHours: 0.0001 }).scan({ bytes: Buffer.from('x') }); } catch (e) { if (e.code === 'SCANNER_SIGNATURES_STALE') return; throw e; } throw Error('accepted a stale database'); }],
  ['unreachable scanner fails closed', async () => { try { await make({ port: port === 65535 ? 65534 : port + 1, timeoutMs: 2000 }).scan({ bytes: Buffer.from('x') }); } catch (e) { if (['SCANNER_CONNECTION_FAILED', 'SCANNER_TIMEOUT'].includes(e.code)) return; throw e; } throw Error('scanned without a scanner'); }],
];
(async () => { let bad = 0; for (const [name, run] of checks) { try { await run(); console.log('PASS', name); } catch (e) { bad++; console.log('FAIL', name, '-', e.code || e.message); } } process.exit(bad ? 1 : 0); })();
