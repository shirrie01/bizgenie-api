// STAGING PREFLIGHT (BG-LAUNCH-003). Read-only and free. It never calls a generation, publishing, billing-write or database-write endpoint and never prints a secret.
//   node scripts/staging/preflight.js [--env-file scripts/staging/staging.env] [--json]
// Output separates what this runtime already HAS from what the FOUNDER must provide, and exits non-zero until every required row passes. An unconfigured environment is never
// reported as operational.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const envFile = args.includes("--env-file") ? args[args.indexOf("--env-file") + 1] : null;
const env = { ...process.env };
if (envFile) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line); if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const rows = [];
const add = (owner, area, check, ok, detail = "") => rows.push({ owner, area, check, ok, detail });
const has = (n) => typeof env[n] === "string" && env[n].length > 0;
const need = (owner, area, n, hint) => add(owner, area, `env ${n}`, has(n), hint);
const tool = (n) => { const r = spawnSync("sh", ["-c", `command -v ${n}`], { encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : ""; };

(async () => {
  // ---- 1. what this runtime provides (no founder action) ---------------------------------------------------------------------------------------------------------------
  add("runtime", "node", "Node 22", process.versions.node.startsWith("22."), process.versions.node);
  for (const t of ["ffmpeg", "ffprobe", "prlimit"]) add("runtime", "media toolchain", `${t} installed`, Boolean(tool(t)), tool(t) || "missing: use the production Dockerfile image (it installs the pinned toolchain) or install it");
  try { const out = execFileSync("node", [path.join(__dirname, "toolchain-selftest.js")], { env: { ...env, VIDEO_INSPECTION_ISOLATION: env.VIDEO_INSPECTION_ISOLATION || "bubblewrap" }, encoding: "utf8", timeout: 60000 }); add("runtime", "media toolchain", `self-test in ${env.VIDEO_INSPECTION_ISOLATION || "bubblewrap"} isolation`, JSON.parse(out).ok, "real H.264 file measured and fully decoded; damaged file and disguised playlist rejected"); }
  catch (e) { const code = e.status; add("runtime", "media toolchain", `self-test in ${env.VIDEO_INSPECTION_ISOLATION || "bubblewrap"} isolation`, false, (code === 2 ? "isolation unavailable here (fails closed): bubblewrap + user namespaces are needed; for disposable staging only set VIDEO_INSPECTION_ISOLATION=local. " : "") + String(e.stdout || e.message).replace(/\s+/g, " ").slice(0, 140)); }
  add("config", "isolation", "VIDEO_INSPECTION_ISOLATION is allowed for this environment", ["local", "bubblewrap"].includes(env.VIDEO_INSPECTION_ISOLATION || "bubblewrap") && (env.VIDEO_INSPECTION_ISOLATION !== "local" || env.BIZGENIE_ENVIRONMENT === "staging"), `${env.VIDEO_INSPECTION_ISOLATION || "bubblewrap (default, hardened)"}; local is for disposable staging only${tool("bwrap") ? "" : "; bwrap not installed on this machine"}`);

  // ---- 2. environment settings the composition requires ----------------------------------------------------------------------------------------------------------------
  add("config", "environment", "BIZGENIE_ENVIRONMENT=staging", env.BIZGENIE_ENVIRONMENT === "staging", `value: ${env.BIZGENIE_ENVIRONMENT || "unset"} (production is refused by this preflight)`);
  for (const f of ["MEDIA_STORAGE_ENABLED", "IMAGE_GENERATION_ENABLED", "VIDEO_GENERATION_ENABLED", "QUOTED_GENERATION_ENABLED"]) add("config", "flags", `${f}=true`, env[f] === "true", `value: ${env[f] || "unset"}`);
  add("config", "flags", "TEXT_GENERATION_MODEL (text generation)", has("TEXT_GENERATION_MODEL"), env.TEXT_GENERATION_MODEL || "unset: text jobs stay unavailable");
  add("config", "video", "VIDEO_DURATION_SECONDS is 4 (demo cap)", (env.VIDEO_DURATION_SECONDS || "4") === "4", `value: ${env.VIDEO_DURATION_SECONDS || "4 (default)"}`);
  for (const f of ["SOCIAL_PUBLISHING_ENABLED", "LEARNING_ENABLED", "STRATEGY_WORKFLOWS_ENABLED", "MEDIA_INTAKE_ENABLED"]) add("config", "kept off for the media demo", `${f} not true`, env[f] !== "true", `value: ${env[f] || "unset"}`);

  // ---- 3. founder-controlled prerequisites ----------------------------------------------------------------------------------------------------------------------------
  need("founder", "database", "TEST_DATABASE_URL", "a DISPOSABLE PostgreSQL 17 superuser URL (never shared or production)");
  need("founder", "auth", "SUPABASE_URL", "an ISOLATED Supabase project (staging), not zrczojyxebwjgpymbmgu/uvgblmejpbswkvlqvqmz unless you decide so");
  need("founder", "auth", "SUPABASE_PUBLISHABLE_KEY", "publishable (anon) key of that project");
  need("founder", "auth", "SUPABASE_SERVICE_ROLE_KEY", "server-side key of that project; never in the browser");
  need("founder", "google", "GOOGLE_CLOUD_PROJECT", "an ISOLATED project with Vertex AI enabled and Veo 3.1 access");
  need("founder", "google", "MEDIA_STORAGE_BUCKET", "private bucket: uniform access, public access prevention enforced");
  need("founder", "google", "VIDEO_PROVIDER_OUTPUT_STORAGE_URI", "gs://<bucket>/<prefix>/ where Veo writes (the service account writes, BizGenie reads)");
  add("founder", "google", "credentials (GOOGLE_APPLICATION_CREDENTIALS or workload identity)", has("GOOGLE_APPLICATION_CREDENTIALS") || has("GOOGLE_CLOUD_QUOTA_PROJECT") || has("K_SERVICE"), "service account: Vertex AI User + object admin on that bucket only");
  need("founder", "openai", "OPENAI_API_KEY", "a project key with a hard monthly spend limit");
  need("founder", "stripe", "STRIPE_SECRET_KEY", "TEST-mode key only (sk_test_...)");
  if (has("STRIPE_SECRET_KEY")) add("founder", "stripe", "Stripe key is test-mode", /^sk_test_/.test(env.STRIPE_SECRET_KEY) || /^rk_test_/.test(env.STRIPE_SECRET_KEY), "a live key is refused");
  if (has("VIDEO_PROVIDER_OUTPUT_STORAGE_URI")) add("founder", "google", "VIDEO_PROVIDER_OUTPUT_STORAGE_URI is gs://bucket/prefix/", /^gs:\/\/[a-z0-9._-]{3,63}\/[^\s]+\/$/.test(env.VIDEO_PROVIDER_OUTPUT_STORAGE_URI), "must end with / so a prefix, never the bucket root, is allowed as a copy source");
  if (has("MEDIA_STORAGE_BUCKET") && has("VIDEO_PROVIDER_OUTPUT_STORAGE_URI")) add("founder", "google", "Veo output prefix is in the same private bucket", env.VIDEO_PROVIDER_OUTPUT_STORAGE_URI.startsWith(`gs://${env.MEDIA_STORAGE_BUCKET}/`), "the single private bucket keeps ownership and cleanup simple");
  if (env.MEDIA_INTAKE_ENABLED === "true") { add("config", "uploads", "MALWARE_SCANNER=clamd with MALWARE_SCANNER_HOST (or staging-only structural opt-in)", env.MALWARE_SCANNER === "clamd" && has("MALWARE_SCANNER_HOST") || (env.BIZGENIE_ENVIRONMENT === "staging" && env.MEDIA_INTAKE_STRUCTURAL_INSPECTION === "true" && env.MEDIA_INTAKE_ALLOW_UNSCANNED === "true"), "customer uploads stay quarantined and unusable without a scanner; UNSCANNED is never accepted in production"); }
  if (has("SUPABASE_URL")) add("founder", "auth", "SUPABASE_URL is https", /^https:\/\//.test(env.SUPABASE_URL), "");

  // ---- 4. database version (free read) --------------------------------------------------------------------------------------------------------------------------------
  if (has("TEST_DATABASE_URL")) {
    try { const { Pool } = require("pg"); const pool = new Pool({ connectionString: env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 }); const v = (await pool.query("show server_version_num")).rows[0].server_version_num; await pool.end();
      add("runtime", "database", "PostgreSQL 17+", Number(v) >= 170000, `server_version_num ${v}`); }
    catch (e) { add("founder", "database", "database reachable", false, e.message.slice(0, 100)); }
  }

  // ---- 5. network reachability from THIS machine (any HTTP status means the host answered) ------------------------------------------------------------------
  for (const [owner, area, host] of [["runtime", "google", "us-central1-aiplatform.googleapis.com"], ["runtime", "google", "storage.googleapis.com"], ["runtime", "openai", "api.openai.com"], ["runtime", "stripe", "api.stripe.com"], ["runtime", "docs", "developers.facebook.com"], ["runtime", "docs", "learn.microsoft.com"]]) {
    let ok = false, detail = ""; try { const r = await fetch(`https://${host}/`, { signal: AbortSignal.timeout(6000) }); ok = true; detail = `HTTP ${r.status}`; } catch (e) { detail = `blocked by this environment's network policy (${e.cause?.code || e.message})`; }
    add(owner, area, `network ${host}`, ok, detail);
  }

  // ---- 6. free authenticated reads, only when credentials exist -------------------------------------------------------------------------------------------------
  if (has("GOOGLE_CLOUD_PROJECT")) {
    try {
      const { GoogleAuth } = require("google-auth-library"); const token = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getAccessToken(); add("founder", "google", "access token obtainable", Boolean(token));
      if (token && has("MEDIA_STORAGE_BUCKET")) { const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(env.MEDIA_STORAGE_BUCKET)}?fields=iamConfiguration`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }); const j = r.ok ? await r.json() : {}; add("founder", "google", "bucket private (uniform access + public access prevention)", Boolean(j.iamConfiguration?.uniformBucketLevelAccess?.enabled && j.iamConfiguration?.publicAccessPrevention === "enforced"), r.ok ? "" : `HTTP ${r.status}`); }
      if (token) for (const m of ["veo-3.1-fast-generate-001"]) { const r = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/publishers/google/models/${m}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }); add("founder", "google", `Veo model visible: ${m}`, r.ok, `HTTP ${r.status}`); }
    } catch (e) { add("founder", "google", "access token obtainable", false, e.message.slice(0, 100)); }
  }
  if (has("OPENAI_API_KEY")) { try { const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(8000) }); add("founder", "openai", "key accepted (free model list)", r.ok, `HTTP ${r.status}`); } catch (e) { add("founder", "openai", "key accepted", false, "unreachable"); } }
  if (has("STRIPE_SECRET_KEY") && /^(s|r)k_test_/.test(env.STRIPE_SECRET_KEY)) { try { const r = await fetch("https://api.stripe.com/v1/balance", { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(8000) }); add("founder", "stripe", "test key accepted (free balance read)", r.ok, `HTTP ${r.status}`); } catch { add("founder", "stripe", "test key accepted", false, "unreachable"); } }

  const failed = rows.filter((r) => !r.ok);
  if (flag("--json")) console.log(JSON.stringify({ ready: failed.length === 0, rows }, null, 1));
  else {
    const w = Math.max(...rows.map((r) => `${r.area}: ${r.check}`.length));
    for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.owner.padEnd(7)} ${`${r.area}: ${r.check}`.padEnd(w)}  ${r.detail}`);
    const by = (o) => failed.filter((r) => r.owner === o).length;
    console.log(`\n${rows.length - failed.length}/${rows.length} ready. Missing: runtime ${by("runtime")}, config ${by("config")}, founder ${by("founder")}.`);
    console.log(failed.length ? "NOT READY: nothing was generated, published, charged or written." : "READY for the founder-approved bounded run.");
    const asks = failed.filter((r) => r.owner === "founder").map((r) => `  - ${r.area}: ${r.check.replace(/^env /, "")}${r.detail ? " - " + r.detail : ""}`);
    if (asks.length) console.log("\nFounder-controlled actions still needed:\n" + asks.join("\n"));
    const net = failed.filter((r) => r.owner === "runtime" && /network/.test(r.check)).map((r) => r.check.replace("network ", ""));
    if (net.length) console.log("\nHosts this machine cannot reach (allow them in its network policy, or run from a machine that can): " + net.join(", "));
  }
  process.exit(failed.length ? 1 : 0);
})();
