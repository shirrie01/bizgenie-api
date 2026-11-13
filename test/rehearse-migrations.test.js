// BG-LAUNCH-005: the migration rehearsal can never be aimed at a shared or hosted database.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const run = (url, env = {}) => spawnSync("node", [path.join(__dirname, "../scripts/rehearse-migrations.js")], { env: { PATH: process.env.PATH, TEST_DATABASE_URL: url, ...env }, encoding: "utf8", timeout: 20000 });

test("it refuses anything that is not a loopback database, before connecting", () => {
  for (const url of ["postgres://postgres:x@db.zrczojyxebwjgpymbmgu.supabase.co:5432/postgres", "postgres://postgres:x@aws-0-eu-west-1.pooler.supabase.com:6543/postgres", "postgres://u:p@10.0.0.5:5432/postgres", "postgres://u:p@example.com:5432/postgres"]) {
    const r = run(url); assert.equal(r.status, 2, url); assert.match(r.stderr, /refusing/); assert.equal(r.stdout, "");
  }
});

test("it requires a database URL, and a loopback URL that merely names a hosted service is also refused", () => {
  assert.equal(run("").status, 2);
  const r = run("postgres://postgres:x@127.0.0.1:5432/supabase_clone?host=db.supabase.co"); assert.equal(r.status, 2); assert.match(r.stderr, /hosted/);
});
