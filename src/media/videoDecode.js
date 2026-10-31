// Full-decode check (BG-LAUNCH-003): ffprobe reads headers only, so a file can pass inspection and still be undecodable midway. This decodes every frame to a null sink
// with ffmpeg and passes only if ffmpeg reports no error at all. Same isolation model as videoInspection.js (no shell, no network, resource limits, optional bubblewrap).
const { spawn } = require("node:child_process");
const { mkdtemp, writeFile, chmod, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");

const result = (status, reason) => Object.freeze({ status, reason });

function createVideoDecodeCheck({ executable = "/usr/bin/ffmpeg", timeoutMs = 20000, isolation = "local" } = {}) {
  if (!["local", "bubblewrap"].includes(isolation) || !path.isAbsolute(executable) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError("Invalid decode configuration");
  let active = 0;
  return async function decodeVideo(bytes, { signal } = {}) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 16) return result("invalid", "INVALID_BYTES");
    if (signal?.aborted) return result("unavailable", "CANCELLED");
    if (active >= 2) return result("unavailable", "DECODE_BUSY");
    active += 1; let directory;
    try {
      directory = await mkdtemp(path.join(tmpdir(), "bg-video-decode-"));
      const file = path.join(directory, "asset.mp4");
      await writeFile(file, Buffer.from(bytes), { flag: "wx", mode: 0o600 });
      if (isolation === "bubblewrap") await chmod(file, 0o444);
      const input = isolation === "bubblewrap" ? "/input/asset.mp4" : file;
      const ffArgs = ["-nostdin", "-v", "error", "-xerror", "-max_alloc", "268435456", "-threads", "1", "-protocol_whitelist", "file", "-i", input, "-map", "0:v:0", "-f", "null", "-"];
      const inner = isolation === "bubblewrap"
        ? ["/usr/bin/bwrap", "--unshare-all", "--unshare-net", "--unshare-user", "--disable-userns", "--assert-userns-disabled", "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--uid", "65534", "--gid", "65534",
          "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64", "--proc", "/proc", "--dev", "/dev", "--size", "1048576", "--tmpfs", "/tmp", "--dir", "/input",
          "--ro-bind", file, input, "--chdir", "/input", "--clearenv", "--setenv", "LANG", "C", "--setenv", "LC_ALL", "C", "--", executable, ...ffArgs]
        : [executable, ...ffArgs];
      const outcome = await new Promise((resolve) => {
        let child, stderr = "", stopped;
        const stop = (why) => { stopped ||= why; child?.kill("SIGKILL"); };
        const timer = setTimeout(() => stop("DECODE_TIMEOUT"), timeoutMs);
        signal?.addEventListener("abort", () => stop("CANCELLED"), { once: true });
        try {
          child = spawn("/usr/bin/prlimit", ["--as=2147483648", "--cpu=30", "--nofile=64", "--core=0", "--", ...inner], { shell: false, cwd: directory, env: { LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "ignore", "pipe"] });
        } catch { clearTimeout(timer); resolve({ unavailable: "DECODE_TOOL_UNAVAILABLE" }); return; }
        child.stderr.on("data", (c) => { if (stderr.length < 4096) stderr += c.toString("utf8").slice(0, 4096 - stderr.length); });
        child.on("error", () => { stopped ||= "DECODE_TOOL_UNAVAILABLE"; });
        child.on("close", (code, sig) => {
          clearTimeout(timer);
          if (stopped) return resolve({ unavailable: stopped });
          if (code === 127 || /(?:bwrap:|prlimit:)/.test(stderr)) return resolve({ unavailable: "DECODE_SANDBOX_UNAVAILABLE" });
          if (sig) return resolve({ unavailable: "DECODE_RESOURCE_LIMIT" });
          resolve(code === 0 && stderr.trim() === "" ? { ok: true } : { invalid: true });
        });
      });
      if (outcome.unavailable) return result("unavailable", outcome.unavailable);
      return outcome.ok ? Object.freeze({ status: "decoded" }) : result("invalid", "DECODE_FAILED");
    } catch { return result("unavailable", "DECODE_IO_UNAVAILABLE"); }
    finally { active -= 1; if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {}); }
  };
}

module.exports = { createVideoDecodeCheck };
