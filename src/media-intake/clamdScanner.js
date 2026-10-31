// ClamAV (clamd) scanner adapter (BG-LAUNCH-004). It speaks clamd's documented INSTREAM protocol over TCP to a scanning service that runs OUTSIDE this process (a ClamAV
// sidecar/service); this process never executes a scanner and never writes the upload to disk for it. FAIL CLOSED everywhere: only an explicit "stream: OK" from a daemon whose
// signature database is fresh counts as clean; a refused connection, timeout, ERROR reply, size-limit reply, unparseable reply or stale database all THROW, which the upload
// inspector turns into "inspection unavailable" (the asset stays quarantined). A signature hit returns { clean: false }.
const net = require("node:net");

const CHUNK = 64 * 1024;
const MAX_REPLY = 1024;
const DEFAULTS = Object.freeze({ timeoutMs: 8000, maxSignatureAgeHours: 72, maxBytes: 32 * 1024 * 1024 });

class ScannerUnavailableError extends Error {
  constructor(code) { super("Malware scanning is unavailable"); this.name = "ScannerUnavailableError"; this.code = code; }
}

function exchange({ host, port, timeoutMs, signal }, send) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let reply = Buffer.alloc(0), done = false;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new ScannerUnavailableError("SCANNER_TIMEOUT")), timeoutMs);
    signal?.addEventListener("abort", () => finish(new ScannerUnavailableError("SCANNER_CANCELLED")), { once: true });
    socket.on("error", () => finish(new ScannerUnavailableError("SCANNER_CONNECTION_FAILED")));
    socket.on("connect", () => { try { send(socket); } catch { finish(new ScannerUnavailableError("SCANNER_CONNECTION_FAILED")); } });
    socket.on("data", (chunk) => {
      reply = Buffer.concat([reply, chunk]);
      if (reply.length > MAX_REPLY) return finish(new ScannerUnavailableError("SCANNER_REPLY_INVALID"));
      const end = reply.indexOf(0); // "z" commands are NUL-terminated both ways
      if (end >= 0) finish(null, reply.subarray(0, end).toString("utf8"));
    });
    socket.on("end", () => { if (!done) finish(reply.length ? null : new ScannerUnavailableError("SCANNER_CONNECTION_FAILED"), reply.toString("utf8").replace(/\0.*$/s, "")); });
  });
}

function createClamdScanner({ host, port = 3310, timeoutMs = DEFAULTS.timeoutMs, maxSignatureAgeHours = DEFAULTS.maxSignatureAgeHours, maxBytes = DEFAULTS.maxBytes, now = () => new Date() } = {}) {
  if (typeof host !== "string" || !host || /[\s/]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Invalid clamd address");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 11000) throw new TypeError("clamd timeout must be below the intake inspection deadline (12 s)");
  if (!(maxSignatureAgeHours > 0)) throw new TypeError("Invalid signature age limit");
  const target = { host, port, timeoutMs };

  // The signature database must be recent: an out-of-date scanner is not a scanner. VERSION returns "ClamAV 1.4.1/27500/Fri Oct 31 07:25:10 2026".
  async function assertFresh(signal) {
    const text = await exchange({ ...target, signal }, (s) => s.write("zVERSION\0"));
    const m = /^ClamAV ([\w.+-]{1,24})\/(\d+)\/(.+)$/.exec(text.trim());
    const built = m ? new Date(m[3] + " UTC") : null;
    if (!m || !built || Number.isNaN(built.getTime())) throw new ScannerUnavailableError("SCANNER_VERSION_UNREADABLE");
    if (now().getTime() - built.getTime() > maxSignatureAgeHours * 3600000) throw new ScannerUnavailableError("SCANNER_SIGNATURES_STALE");
    return `clamd-${m[1]}-db${m[2]}`;
  }

  return Object.freeze({
    engine: "clamd",
    async scan({ bytes, signal } = {}) {
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxBytes) throw new ScannerUnavailableError("SCANNER_INPUT_INVALID");
      const version = await assertFresh(signal);
      const text = await exchange({ ...target, signal }, (s) => {
        s.write("zINSTREAM\0");
        for (let i = 0; i < bytes.length; i += CHUNK) { const part = bytes.subarray(i, i + CHUNK); const len = Buffer.alloc(4); len.writeUInt32BE(part.length); s.write(len); s.write(part); }
        s.write(Buffer.alloc(4)); // zero-length chunk ends the stream
      });
      const verdict = text.trim();
      if (verdict === "stream: OK") return { clean: true, engine: version };
      const hit = /^stream: (.{1,200}) FOUND$/.exec(verdict);
      if (hit) return { clean: false, engine: version, signature: hit[1].replace(/[^\w.\-/ ]/g, "?") };
      throw new ScannerUnavailableError("SCANNER_REPLY_INVALID"); // ERROR, size-limit, anything else: never "clean"
    },
  });
}

module.exports = { createClamdScanner, ScannerUnavailableError, DEFAULTS };
