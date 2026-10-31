// A STAND-IN for a clamd daemon: it speaks the INSTREAM/VERSION wire protocol and "detects" only the industry-standard EICAR test string. It proves how BizGenie's adapter and intake
// behave on each reply; it is NOT a virus scanner and says nothing about ClamAV itself (that needs a real deployed clamd).
const net = require("node:net");
const { createHash } = require("node:crypto");
const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("");

async function startFakeClamd({ builtAt = new Date(), mode = "ok" } = {}) {
  const state = { mode, builtAt, received: [], connections: 0, streams: 0 };
  const server = net.createServer((socket) => {
    state.connections += 1; let buf = Buffer.alloc(0), streaming = false, body = [];
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!streaming) {
        const nul = buf.indexOf(0); if (nul < 0) return; const cmd = buf.subarray(0, nul).toString(); buf = buf.subarray(nul + 1);
        if (state.mode === "hang") return;
        if (cmd === "zVERSION") { socket.end(Buffer.concat([Buffer.from(state.mode === "garbage" ? "not clamav" : `ClamAV 1.4.1/27500/${state.builtAt.toUTCString().replace(" GMT", "")}`), Buffer.from([0])])); return; }
        if (cmd !== "zINSTREAM") { socket.end(Buffer.from("UNKNOWN COMMAND\0")); return; }
        streaming = true;
      }
      for (;;) {
        if (buf.length < 4) return; const len = buf.readUInt32BE(0);
        if (len === 0) {
          const data = Buffer.concat(body); state.streams += 1; state.received.push(createHash("sha256").update(data).digest("hex"));
          const reply = state.mode === "hang" ? null : state.mode === "error" ? "INSTREAM size limit exceeded. ERROR" : state.mode === "garbage" ? "stream: ???" : data.includes(Buffer.from(EICAR)) ? "stream: Eicar-Test-Signature FOUND" : "stream: OK";
          if (reply) socket.end(Buffer.concat([Buffer.from(reply), Buffer.from([0])])); return;
        }
        if (buf.length < 4 + len) return; body.push(buf.subarray(4, 4 + len)); buf = buf.subarray(4 + len);
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: server.address().port, host: "127.0.0.1", state, EICAR: Buffer.from(EICAR), close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); }) };
}
module.exports = { startFakeClamd, EICAR };
