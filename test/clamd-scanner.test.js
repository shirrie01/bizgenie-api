// BG-LAUNCH-004: the clamd adapter's wire behaviour and fail-closed rules, against a protocol stand-in (test/helpers/fake-clamd.js), not a real scanner.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");
const { createClamdScanner, ScannerUnavailableError } = require("../src/media-intake/clamdScanner");
const { startFakeClamd } = require("./helpers/fake-clamd");

const scanner = (d, over = {}) => createClamdScanner({ host: d.host, port: d.port, timeoutMs: 600, ...over });

test("a clean stream is clean, and a large stream arrives intact across many chunks", async () => {
  const d = await startFakeClamd(); try {
    const big = randomBytes(300 * 1024 + 7); const r = await scanner(d).scan({ bytes: big });
    assert.deepEqual([r.clean, r.engine], [true, "clamd-1.4.1-db27500"]);
    assert.equal(d.state.received.at(-1), createHash("sha256").update(big).digest("hex"));
  } finally { await d.close(); }
});

test("a signature hit is a rejection, not an error", async () => {
  const d = await startFakeClamd(); try {
    const r = await scanner(d).scan({ bytes: Buffer.concat([randomBytes(2000), d.EICAR, randomBytes(2000)]) });
    assert.deepEqual([r.clean, r.signature], [false, "Eicar-Test-Signature"]);
  } finally { await d.close(); }
});

test("every failure mode is unavailable (a throw), never clean", async () => {
  const bytes = randomBytes(1000);
  for (const [mode, code] of [["error", "SCANNER_REPLY_INVALID"], ["garbage", "SCANNER_VERSION_UNREADABLE"], ["hang", "SCANNER_TIMEOUT"]]) {
    const d = await startFakeClamd({ mode }); try { await assert.rejects(scanner(d).scan({ bytes }), (e) => e instanceof ScannerUnavailableError && e.code === code, mode); } finally { await d.close(); }
  }
  const d = await startFakeClamd(); const { host, port } = d; await d.close(); // nothing is listening any more
  await assert.rejects(createClamdScanner({ host, port, timeoutMs: 600 }).scan({ bytes }), { code: "SCANNER_CONNECTION_FAILED" });
  for (const bad of [Buffer.alloc(0), "text", null, Buffer.alloc(33 * 1024 * 1024)]) await assert.rejects(scanner({ host, port }).scan({ bytes: bad }), { code: "SCANNER_INPUT_INVALID" });
});

test("a scanner whose signature database is stale is not trusted", async () => {
  const d = await startFakeClamd({ builtAt: new Date(Date.now() - 5 * 24 * 3600000) }); try {
    await assert.rejects(scanner(d).scan({ bytes: randomBytes(100) }), { code: "SCANNER_SIGNATURES_STALE" });
    assert.equal((await scanner(d, { maxSignatureAgeHours: 24 * 7 }).scan({ bytes: randomBytes(100) })).clean, true);
  } finally { await d.close(); }
});

test("it will not be configured with an unsafe address or a deadline past the intake's own", () => {
  for (const host of ["", "a b", "x/y", null, undefined]) assert.throws(() => createClamdScanner({ host }), /Invalid clamd address/);
  assert.throws(() => createClamdScanner({ host: "h", port: 0 }), /Invalid clamd address/);
  assert.throws(() => createClamdScanner({ host: "h", timeoutMs: 30000 }), /deadline/);
});
