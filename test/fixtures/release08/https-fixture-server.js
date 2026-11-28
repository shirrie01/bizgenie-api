'use strict';
// Loopback HTTPS stand-in used ONLY by the curl default-configuration test: node https-fixture-server.js <role> <dir> <logfile>
// role "canonical": answers the A0 smoke checks like the tagged bridge; role "evil": answers 200 to everything. Every request is logged (method, path, whether an Authorization header was present and its length, never its value).
const https = require('node:https'); const fs = require('node:fs'); const path = require('node:path');
const [role, dir, log] = process.argv.slice(2);
if (!role || !dir || !log) process.exit(0); // collected by `node --test` as a file under test/: with no arguments it is a no-op
const server = https.createServer({ key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) }, (req, res) => {
  const auth = req.headers.authorization; fs.appendFileSync(log, JSON.stringify({ role, method: req.method, path: req.url, auth: Boolean(auth), authLength: auth ? auth.length : 0, origin: req.headers.origin || null }) + '\n');
  const send = (code, body = '') => { res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }); res.end(body); };
  if (role === 'evil') return send(200, '{"leaked":true}');
  if (req.method === 'OPTIONS') return send(req.headers.origin === 'https://foreign.test' ? 403 : 204);
  if (req.method === 'GET' && req.url === '/customer/workspace') return auth ? send(200, JSON.stringify({ workspaces: [{ project_id: 'project-sentinel-55' }] })) : send(401, '{"error":"AUTH"}');
  if (req.method === 'POST' && /^\/customer\/(workspace\/bootstrap|assets\/uploads)$/.test(req.url)) return send(403, '{}');
  if (req.method === 'POST' && req.url === '/customer/workspace/brands') return send(401, '{}');
  return send(404, '{}');
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`PORT ${server.address().port}\n`));
