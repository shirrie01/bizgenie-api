const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { describe, it } = require("node:test");
const { run, parseTarget, loadReviewedModule, classify, REVIEWED, EXIT, TABLES } = require("../docs/staging/pool-diagnostic/pool-diagnostic.proposal.cjs");

// Deterministic stubs only: no database, no network, no Cloud Run. These tests prove the PROPOSAL's fail-closed behaviour, not any deployed system.
const REF = "zrczojyxebwjgpymbmgu";
const GOOD_URL = `postgresql://postgres:CANARY_PASSWORD_123@db.${REF}.supabase.co:5432/postgres?sslmode=require`;
const goodEnv = (over = {}) => ({ BRAND_BRAIN_DATABASE_URL: GOOD_URL, ...over });
const grantRow = (t, o = {}) => ({ table_name: t, can_select: true, can_insert: true, can_update: true, rls_enabled: true, rls_forced: false, rls_effective_for_role: false, owner_name: "postgres", is_owner: true, policies: t === "workspace_onboarding_profiles" ? 0 : 1, policies_applicable_to_role: 0, ...o });
function fakePg({ failConnect = false, failOn = null, rollbackFails = false, releaseFails = false, endFails = false, grants = null, calls = [] } = {}) {
  class Pool {
    constructor(cfg) { calls.push(["pool", cfg]); }
    async connect() {
      if (failConnect) throw new Error("connect refused CANARY_PASSWORD_123");
      return {
        async query(sql) {
          calls.push(["q", String(sql).slice(0, 40)]);
          if (failOn && failOn.test(sql)) throw new Error("boom CANARY_PASSWORD_123");
          if (/^rollback/.test(sql)) { if (rollbackFails) throw new Error("rb"); return { rows: [] }; }
          if (/^begin|^set local/.test(sql)) return { rows: [] };
          if (/row_security_active/.test(sql)) return { rows: grants || TABLES.map((t) => grantRow(t)) };
          if (/current_user as current_user_name/.test(sql)) return { rows: [{ current_user_name: "postgres", session_user_name: "postgres", database_name: "postgres", server_version: "17.6", row_security_setting: "on" }] };
          if (/from pg_roles where rolname = current_user/.test(sql)) return { rows: [{ rolsuper: false, rolbypassrls: true, rolinherit: true }] };
          if (/pg_stat_ssl/.test(sql)) return { rows: [{ ssl_in_use: true }] };
          throw new Error("unexpected sql");
        },
        release() { calls.push(["release"]); if (releaseFails) throw new Error("rel"); },
      };
    }
    async end() { calls.push(["end"]); if (endFails) throw new Error("end"); }
  }
  return { Pool };
}
const okMod = (...a) => () => ({ preflight: async () => (a.length ? a[0] : { professional: true }), layout_root: "/app", verified: true });
const throwingPreflight = () => ({ preflight: async () => { throw new Error("secret detail CANARY_PASSWORD_123"); }, layout_root: "/app", verified: true });
const text = (r) => JSON.stringify(r.output);

describe("positive path", () => {
  it("accepted only when preflight is professional, privileges exist and RLS does not deny all; exit 0; output is bounded and says what it is", async () => {
    const calls = []; const r = await run({ env: goodEnv(), pgModule: fakePg({ calls }), loader: okMod() });
    assert.equal(r.status, "accepted"); assert.equal(r.exit, 0); assert.equal(r.output.accepted, true);
    assert.equal(r.output.existing_app_pool_observed, false); assert.match(r.output.evidence_class, /NOT_EXISTING_APP_POOL/); assert.equal(r.output.tenant_isolation_asserted, false);
    assert.equal(r.output.target.identity, "url-binding-only"); assert.equal(r.output.preflight.professional, true);
    assert.deepEqual(calls.filter((c) => c[0] === "release" || c[0] === "end").map((c) => c[0]), ["release", "end"]);
    assert.ok(calls.some((c) => c[0] === "q" && /^set local statement_timeout/.test(c[1])) && calls.some((c) => c[0] === "q" && /^set local lock_timeout/.test(c[1])));
    assert.equal(calls.find((c) => c[0] === "pool")[1].max, 1);
    assert.doesNotMatch(text(r), /CANARY_PASSWORD|postgresql:\/\//);
  });
  it("the pooler form bound to the staging project is accepted", () => {
    assert.equal(parseTarget(goodEnv({ BRAND_BRAIN_DATABASE_URL: `postgresql://postgres.${REF}:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres` })).host_kind, "pooler");
  });
});

describe("the five defects reproduced by Codex are closed", () => {
  it("1 missing/empty/ambiguous URL never reaches a pool or a query", async () => {
    for (const env of [{}, { BRAND_BRAIN_DATABASE_URL: "" }, { BRAND_BRAIN_DATABASE_URL: "   " }, { BRAND_BRAIN_DATABASE_URL: "not a url" }, goodEnv({ PGHOST: "x" }), goodEnv({ PGUSER: "y" })]) {
      const calls = []; const r = await run({ env, pgModule: fakePg({ calls }), loader: okMod() });
      assert.equal(r.status, "config_invalid", JSON.stringify(Object.keys(env))); assert.equal(r.exit, EXIT.config_invalid); assert.equal(calls.length, 0);
    }
  });
  it("2 statement and lock timeouts are set inside the read-only transaction before any statement", async () => {
    const calls = []; await run({ env: goodEnv(), pgModule: fakePg({ calls }), loader: okMod() });
    const sql = calls.filter((c) => c[0] === "q").map((c) => c[1]); assert.match(sql[0], /^begin read only/);
    assert.ok(sql.indexOf(sql.find((s) => /statement_timeout/.test(s))) < sql.indexOf(sql.find((s) => /current_user/.test(s))));
  });
  it("3 a thrown preflight is a failure with nonzero exit and no raw detail", async () => {
    const r = await run({ env: goodEnv(), pgModule: fakePg(), loader: throwingPreflight }); assert.equal(r.status, "preflight_failed"); assert.equal(r.exit, EXIT.preflight_failed); assert.notEqual(r.exit, 0);
    assert.doesNotMatch(text(r), /secret detail|CANARY/);
  });
  it("3b {professional:false} and a missing result are not accepted", async () => {
    for (const result of [{ professional: false }, undefined, null, {}]) { const r = await run({ env: goodEnv(), pgModule: fakePg(), loader: okMod(result) }); assert.equal(r.status, "schema_not_accepted"); assert.notEqual(r.exit, 0); }
  });
  it("4 a failing metadata query still rolls back, releases and ends the pool, with the first failure preserved", async () => {
    const calls = []; const r = await run({ env: goodEnv(), pgModule: fakePg({ calls, failOn: /pg_stat_ssl/, rollbackFails: true, releaseFails: true, endFails: true }), loader: okMod() });
    assert.equal(r.status, "query_failed"); assert.equal(r.output.cleanup_ok, false);
    assert.ok(calls.some((c) => c[0] === "q" && c[1] === "rollback")); assert.ok(calls.some((c) => c[0] === "release")); assert.ok(calls.some((c) => c[0] === "end"));
  });
  it("5 module-loading failures are bounded codes, not escapes", async () => {
    const unavailable = () => { throw Object.assign(new Error("Cannot find module /x CANARY"), { code: "MODULE_NOT_FOUND" }); };
    const r = await run({ env: goodEnv(), pgModule: fakePg(), loader: () => { try { unavailable(); } catch { return require("../docs/staging/pool-diagnostic/pool-diagnostic.proposal.cjs").loadReviewedModule({ roots: ["/nonexistent-root"] }); } } });
    assert.equal(r.status, "module_unavailable"); assert.doesNotMatch(text(r), /CANARY|MODULE_NOT_FOUND/);
  });
});

describe("additional safeguards", () => {
  it("target allowlist: wrong user, wrong host, production ref, non-postgres protocol, host override via query are all refused", () => {
    const bad = [`postgresql://postgres:pw@db.otherref.supabase.co:5432/postgres`, `postgresql://admin:pw@db.${REF}.supabase.co:5432/postgres`, `postgresql://postgres:pw@db.uvgblmejpbswkvlqvqmz.supabase.co:5432/postgres`,
      `postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres?x=uvgblmejpbswkvlqvqmz`, `mysql://postgres:pw@db.${REF}.supabase.co/postgres`, `postgresql://postgres:pw@db.${REF}.supabase.co/postgres?host=evil.example`,
      `postgresql://postgres:pw@evil.example/postgres`, `postgresql://postgres:@db.${REF}.supabase.co/postgres`];
    for (const u of bad) assert.throws(() => parseTarget({ BRAND_BRAIN_DATABASE_URL: u }), (e) => ["config_invalid", "target_not_allowed"].includes(e.code), u);
  });
  it("a connect failure preserves connect_failed, ends the pool and never leaks the message", async () => {
    const calls = []; const r = await run({ env: goodEnv(), pgModule: fakePg({ calls, failConnect: true, endFails: true }), loader: okMod() });
    assert.equal(r.status, "connect_failed"); assert.ok(calls.some((c) => c[0] === "end")); assert.doesNotMatch(text(r), /CANARY|refused/);
  });
  it("the module loader accepts only files whose sha256 equals the reviewed digest, and has no environment path override", () => {
    const names = Object.keys(REVIEWED); const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
    const content = Object.fromEntries(names.map((n) => [`/app/src/workspace-onboarding/${n}`, Buffer.from("reviewed " + n)]));
    const reviewed = Object.fromEntries(names.map((n) => [n, sha(Buffer.from("reviewed " + n))]));
    const fsImpl = (files) => ({ existsSync: (p) => p in files, readFileSync: (p) => files[p] });
    const loaded = loadReviewedModule({ fsImpl: fsImpl(content), requireImpl: () => ({ preflight() {} }), reviewed });
    assert.equal(loaded.verified, true); assert.equal(typeof loaded.preflight, "function"); assert.equal(loaded.layout_root, "/app");
    const tampered = { ...content, "/app/src/workspace-onboarding/preflight.js": Buffer.from("tampered") };
    assert.throws(() => loadReviewedModule({ fsImpl: fsImpl(tampered), requireImpl: () => ({ preflight() {} }), reviewed }), (e) => e.code === "module_mismatch");
    assert.throws(() => loadReviewedModule({ fsImpl: fsImpl(content), requireImpl: () => ({}), reviewed }), (e) => e.code === "module_unavailable");
    assert.throws(() => loadReviewedModule({ fsImpl: fsImpl(content), requireImpl: () => { throw new Error("syntax CANARY"); }, reviewed }), (e) => e.code === "module_unavailable");
    process.env.PREFLIGHT_PATH = "/tmp/evil.js";
    try { assert.throws(() => loadReviewedModule({ fsImpl: fsImpl({}), requireImpl: () => { throw new Error("must not load"); }, reviewed }), (e) => e.code === "module_unavailable"); } finally { delete process.env.PREFLIGHT_PATH; }
    assert.throws(() => loadReviewedModule({ fsImpl: fsImpl(content), requireImpl: () => ({ preflight() {} }) }), (e) => e.code === "module_mismatch"); // real reviewed digests reject substituted content
  });
  it("RLS classification distinguishes not-applied, applied-with-policy and applied-no-policy; the last is not accepted", () => {
    const base = TABLES.map((t) => grantRow(t));
    assert.equal(classify(base, { professional: true }).status, "accepted");
    assert.deepEqual(new Set(classify(base, { professional: true }).rls.map((r) => r.effect)), new Set(["not_applied_to_this_role"]));
    const withPolicy = TABLES.map((t) => grantRow(t, { rls_effective_for_role: true, policies_applicable_to_role: 1 }));
    assert.equal(classify(withPolicy, { professional: true }).status, "accepted"); assert.equal(classify(withPolicy, { professional: true }).rls[0].effect, "applied_with_policy");
    const denyAll = TABLES.map((t) => grantRow(t, { rls_effective_for_role: true, policies_applicable_to_role: 0 }));
    const v = classify(denyAll, { professional: true }); assert.equal(v.status, "rls_not_accepted"); assert.equal(v.rls[0].effect, "applied_no_policy_denies_all");
  });
  it("missing INSERT/UPDATE on the onboarding table is privilege_not_accepted; the diagnostic never asserts tenant isolation", async () => {
    const g = TABLES.map((t) => grantRow(t, t === "workspace_onboarding_profiles" ? { can_insert: false } : {}));
    const r = await run({ env: goodEnv(), pgModule: fakePg({ grants: g }), loader: okMod() });
    assert.equal(r.status, "privilege_not_accepted"); assert.notEqual(r.exit, 0); assert.equal(r.output.tenant_isolation_asserted, false);
  });
  it("an overall deadline produces timeout, not a hang", async () => {
    const slow = { Pool: class { constructor() {} async connect() { await new Promise((r) => setTimeout(r, 200)); return { async query() { return { rows: [] }; }, release() {} }; } async end() {} } };
    const r = await run({ env: goodEnv(), pgModule: slow, loader: okMod(), overallMs: 30 }); assert.equal(r.status, "timeout"); assert.equal(r.exit, EXIT.timeout);
  });
  it("no SQL touches an application row: every statement is a catalog/GUC/privilege query", async () => {
    const calls = []; await run({ env: goodEnv(), pgModule: fakePg({ calls }), loader: okMod() });
    const src = require("node:fs").readFileSync(require.resolve("../docs/staging/pool-diagnostic/pool-diagnostic.proposal.cjs"), "utf8");
    assert.doesNotMatch(src, /\b(insert\s+into|update\s+public|delete\s+from|truncate|create\s+table|alter\s+table|drop\s+)/i);
    assert.doesNotMatch(src, /select\s+\*|from\s+public\.(workspace_onboarding_profiles|tenant_memberships|projects|brand_brains)\b/i);
  });
});
