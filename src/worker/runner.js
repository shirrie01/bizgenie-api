// A small, dependency-free scheduler for the loops. One failing loop never stops another; a tick that did work is followed by another soon, an idle one waits (with jitter) so
// several workers do not move in lock-step. stop() lets the current tick finish. Concurrency between worker instances is safe by construction (row locks, fences, advisory locks
// inside the services), so running more than one worker is allowed and simply shares the load.
class WorkerRunner {
  constructor({ loops, intervalMs = 2000, busyIntervalMs = 200, jitter = 0.2, logger = console, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout }) {
    Object.assign(this, { loops, intervalMs, busyIntervalMs, jitter, logger, random, setTimer, clearTimer });
    this.running = false; this.timer = null; this.current = null; this.last = { at: null, results: [] };
  }
  async runOnce() {
    const results = [];
    for (const loop of this.loops) {
      try { results.push(await loop.tick()); } catch (error) { this.logger.error?.("worker loop failed", loop.name, error?.code || error?.name || "ERROR"); results.push({ loop: loop.name, errors: [String(error?.code || error?.name || "ERROR")] }); }
    }
    this.last = { at: new Date().toISOString(), results };
    return results;
  }
  busy(results) { return results.some((r) => (r.succeeded || 0) + (r.failed || 0) + (r.pending || 0) + (r.resumed || 0) + (r.reconciled || 0) + (r.published || 0) > 0); }
  start() {
    if (this.running) return; this.running = true;
    const next = (ms) => { if (this.running) this.timer = this.setTimer(loop, ms * (1 + (this.random() * 2 - 1) * this.jitter)); };
    const loop = () => { this.current = this.runOnce().then((r) => { this.logger.log?.("worker tick", JSON.stringify(r)); next(this.busy(r) ? this.busyIntervalMs : this.intervalMs); }).catch(() => next(this.intervalMs)); };
    loop();
  }
  async stop() { this.running = false; if (this.timer) this.clearTimer(this.timer); if (this.current) await this.current.catch(() => {}); }
  status() { return { running: this.running, ...this.last }; }
}
module.exports = { WorkerRunner };
