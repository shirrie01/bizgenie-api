// The one place the media-inspection resource limits live (BG-LAUNCH-004). Every inspector subprocess runs under prlimit with these, with no shell, no network protocols,
// a private temp directory and (hardened mode) a bubblewrap namespace with no network and a 1 MiB tmpfs. Container-level CPU/memory/timeout are set where the service is
// deployed (Cloud Run settings); these are the per-process ceilings inside it.
const MiB = 1024 * 1024;
const limits = {
  input: { maxBytes: 32 * MiB },                              // largest file either tool will be handed
  probe: { timeoutMs: 5000, cpuSeconds: 5, addressSpaceBytes: 1024 * MiB, maxOutputBytes: 256 * 1024 },
  decode: { timeoutMs: 20000, cpuSeconds: 30, addressSpaceBytes: 2048 * MiB, maxAlloc: 256 * MiB },
  common: { maxOpenFiles: 64, maxFileWriteBytes: 1 * MiB, coreDumpBytes: 0, sandboxTmpfsBytes: 1 * MiB, allowedProtocols: "file", allowedFormats: "mov" },
};
const deepFreeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; };
const prlimitArgs = (kind) => [`--as=${limits[kind].addressSpaceBytes}`, `--cpu=${limits[kind].cpuSeconds}`, `--nofile=${limits.common.maxOpenFiles}`, `--fsize=${limits.common.maxFileWriteBytes}`, `--core=${limits.common.coreDumpBytes}`];
module.exports = { limits: deepFreeze(limits), prlimitArgs };
