const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Client, Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { createDrainedPool } = require('./helpers/drained-pg-pool');
const url = process.env.TEST_DATABASE_URL;
const pgTest = url ? test : test.skip;
pgTest('real PostgreSQL: raw Pool.end resolves before gated socket close; drained pool waits before DROP', async () => {
  const admin = createDrainedPool({ connectionString:url });
  const db = 'pool_end_' + randomUUID().replaceAll('-','');
  const gates = [];
  class GatedClient extends Client {
    end(callback) { gates.push(() => super.end(callback)); }
  }
  let raw,drained;
  await admin.query(`create database "${db}"`);
  const target = new URL(url); target.pathname='/'+db;
  try {
    raw = new Pool({ connectionString:target.toString(),Client:GatedClient });
    await raw.query('select 1');
    let rawClosed=false;
    const rawClient=await raw.connect();
    const rawEnded=new Promise(resolve=>rawClient.once('end',()=>{rawClosed=true;resolve();}));
    rawClient.release();
    await raw.end();
    assert.equal(rawClosed,false,'raw end has not closed its PostgreSQL socket');
    await assert.rejects(admin.query(`drop database "${db}"`),{code:'55006'});
    // Explicitly observe the same server error the old FORCE teardown left after its test.
    const failed=new Promise(resolve=>raw.once('error',resolve));
    await admin.query(`drop database "${db}" with(force)`);
    const error=await failed;assert.equal(error.code,'57P01');
    gates.splice(0).forEach(release=>release());await rawEnded;
    await admin.query(`create database "${db}"`);
    drained=createDrainedPool({ connectionString:target.toString(),Client:GatedClient });
    await drained.query('select 1');
    let finished=false;
    const ending=drained.end().then(()=>{finished=true;});
    await new Promise(setImmediate);
    assert.equal(finished,false,'drain must not claim completion while a socket is gated');
    gates.splice(0).forEach(release=>release());await ending;
    await admin.query(`drop database "${db}"`); // no FORCE, sleeps or retries
  } finally {
    gates.splice(0).forEach(release=>release());
    if(drained&&!drained.ending)await drained.end();
    if(raw&&!raw.ending)await raw.end();
    await admin.query(`drop database if exists "${db}"`);
    await admin.end();
  }
});
