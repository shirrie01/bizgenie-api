// Offline reproducibility contract; no registry, subprocess or credential access.
const fs = require("node:fs");
const path = require("node:path");
function checkContainerBuildContract(root = path.join(__dirname, "..")) {
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const ignore = new Set(fs.readFileSync(path.join(root, ".dockerignore"), "utf8").split(/\r?\n/));
  if (!/^FROM node:22[^\s]*@sha256:[a-f0-9]{64}$/m.test(dockerfile)) throw new Error("Docker Node 22 base must have an immutable digest");
  if (!/^RUN npm ci --omit=dev --no-audit --no-fund$/m.test(dockerfile) || /RUN npm install/.test(dockerfile)) throw new Error("Docker must install from the lockfile");
  if (lock.lockfileVersion !== 3 || !lock.packages?.[""]) throw new Error("Expected lockfile v3");
  for (const kind of ["dependencies", "devDependencies", "engines"]) {
    const normalized = value => JSON.stringify(Object.fromEntries(Object.entries(value || {}).sort()));
    if (normalized(manifest[kind]) !== normalized(lock.packages[""][kind])) throw new Error("Manifest and lock root differ");
  }
  for (const name of ["node_modules", ".git", ".env", ".env.*", ".npmrc", ".ssh"]) if (!ignore.has(name)) throw new Error("Unsafe Docker build context");
  return { node_major: 22, install: "npm ci", digest_pinned: true, context_isolated: true };
}
if (require.main === module) console.log(JSON.stringify(checkContainerBuildContract()));
module.exports = { checkContainerBuildContract };
