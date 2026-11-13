const { Pool } = require('pg');
// pg-pool can resolve end() after removing clients but before their sockets end.
// Register before any connection; include clients retired by idle/error removal too.
function createDrainedPool(options) {
  const pool = new Pool(options);
  const connections = [];
  pool.on('connect', client => {
    connections.push(new Promise(resolve => client.once('end', resolve)));
  });
  const end = pool.end.bind(pool);
  pool.end = async () => {
    await end();
    await Promise.all(connections);
  };
  return pool;
}
module.exports = { createDrainedPool };
