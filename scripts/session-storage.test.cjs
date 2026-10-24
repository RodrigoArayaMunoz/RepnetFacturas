const assert = require('node:assert/strict');
const test = require('node:test');

async function fixture() {
  const { createChunkedSessionStorage } = await import('../src/utils/session-storage.ts');
  const data = new Map();
  let rejectWrite = () => false;
  return {
    data,
    failWhen: (predicate) => { rejectWrite = predicate; },
    storage: createChunkedSessionStorage({
      async getItem(key) { return data.get(key) ?? null; },
      async setItem(key, value) {
        if (rejectWrite(key)) throw new Error('Simulated secure-storage failure');
        assert.ok(Buffer.byteLength(value, 'utf8') < 2048);
        data.set(key, value);
      },
      async removeItem(key) { data.delete(key); },
    }),
  };
}

test('persists long Unicode sessions without exceeding native value limits', async () => {
  const { storage } = await fixture();
  const session = JSON.stringify({ token: 'a'.repeat(4500), name: '📷á'.repeat(800) });
  await storage.setItem('session', session);
  assert.equal(await storage.getItem('session'), session);
});

test('failed refresh preserves the previously committed session', async () => {
  const { storage, failWhen } = await fixture();
  await storage.setItem('session', 'original-session');
  failWhen((key) => key.endsWith('.1'));
  await assert.rejects(storage.setItem('session', 'new'.repeat(1000)));
  assert.equal(await storage.getItem('session'), 'original-session');
});

test('failed manifest update preserves the old session and removes uncommitted chunks', async () => {
  const { storage, data, failWhen } = await fixture();
  await storage.setItem('session', 'original-session');
  const oldKeys = [...data.keys()];
  failWhen((key) => key.endsWith('.manifest'));
  await assert.rejects(storage.setItem('session', 'replacement'));
  assert.equal(await storage.getItem('session'), 'original-session');
  assert.deepEqual([...data.keys()], oldKeys);
});

test('serializes concurrent refreshes and clears every persisted session fragment', async () => {
  const { storage, data } = await fixture();
  await Promise.all([
    storage.setItem('session', 'old'.repeat(1000)),
    storage.setItem('session', 'new'.repeat(1000)),
  ]);
  assert.equal(await storage.getItem('session'), 'new'.repeat(1000));
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(data.size, 0);
});

test('incomplete session is never returned as a valid credential', async () => {
  const { storage, data } = await fixture();
  await storage.setItem('session', 'session'.repeat(200));
  const fragment = [...data.keys()].find((key) => key.endsWith('.1'));
  data.delete(fragment);
  assert.equal(await storage.getItem('session'), null);
});
