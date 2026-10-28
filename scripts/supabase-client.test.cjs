const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(relativePath, imports, globals = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
      return typeof imports[name] === 'function' ? imports[name]() : imports[name];
    },
    Error,
    ...globals,
  }, { filename });
  return module.exports;
}

const sessionStorage = loadTypeScript('src/utils/session-storage.ts', {});
const SESSION = { access_token: 'offline-session', user: { id: 'offline-device' } };

// Native storage and Supabase are injected; these tests never contact a service.
function fixture(options = {}) {
  const calls = { nativeProbes: 0, nativeImports: 0, available: 0, clients: [], getSession: 0, signIn: 0, start: 0, stop: 0 };
  const data = new Map();
  const writes = [];
  const listeners = new Set();
  let session = options.session ?? null;
  const processLock = () => {};
  const appState = {
    currentState: options.state ?? 'active',
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const client = loadTypeScript('src/services/supabase-client.ts', {
    expo: {
      requireOptionalNativeModule(name) {
        assert.equal(name, 'ExpoSecureStore');
        calls.nativeProbes++;
        return options.nativeMissing ? null : {};
      },
    },
    '@supabase/supabase-js': {
      processLock,
      createClient(url, key, config) {
        calls.clients.push({ url, key, config });
        return { auth: {
          async getSession() {
            calls.getSession++;
            return { data: { session }, error: options.sessionError ?? null };
          },
          async signInAnonymously() {
            calls.signIn++;
            if (!options.signInError) session = SESSION;
            return { data: { session }, error: options.signInError ?? null };
          },
          startAutoRefresh() { calls.start++; },
          stopAutoRefresh() { calls.stop++; },
        } };
      },
    },
    'expo-secure-store': () => {
      calls.nativeImports++;
      assert.ok(!options.nativeMissing, 'A missing native module must never reach Metro import evaluation');
      if (options.importError) throw new Error('SecureStore package initialization failed');
      return {
        WHEN_UNLOCKED_THIS_DEVICE_ONLY: 42,
        async isAvailableAsync() {
          calls.available++;
          if (options.availabilityError) throw new Error('Native storage unavailable');
          return options.available ?? true;
        },
        async getItemAsync(key) { return data.get(key) ?? null; },
        async setItemAsync(key, value, config) {
          writes.push({ key, value, config });
          data.set(key, value);
        },
        async deleteItemAsync(key) { data.delete(key); },
      };
    },
    'react-native': { Platform: { OS: options.platform ?? 'android' }, AppState: appState },
    '@/utils/session-storage': sessionStorage,
  }, {
    process: { env: {
      EXPO_PUBLIC_SUPABASE_URL: 'https://offline-fixture.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_fixture',
    } },
  });
  return {
    ...client, calls, data, writes, processLock, listeners,
    emit(state) {
      appState.currentState = state;
      for (const listener of listeners) listener(state);
    },
  };
}

async function rejectsWithCode(client, code) {
  await assert.rejects(client.getMailSession(), (error) => {
    assert.ok(error instanceof client.MailSessionError);
    assert.equal(error.code, code);
    return true;
  });
}

test('opening the app and managing its lifecycle never load a missing native storage module', () => {
  const client = fixture({ nativeMissing: true });
  const cleanup = client.manageMailSessionRefresh();
  client.emit('background');
  client.emit('active');
  assert.equal(client.calls.nativeProbes, 0);
  assert.equal(client.calls.nativeImports, 0);
  assert.equal(client.calls.clients.length, 0);
  assert.equal(client.calls.start, 0);
  assert.equal(client.calls.stop, 0);
  cleanup();
  assert.equal(client.listeners.size, 0);
});

test('requesting mail on an old native build reports a controlled error before creating a session', async () => {
  const client = fixture({ nativeMissing: true });
  await rejectsWithCode(client, 'SECURE_STORAGE_UNAVAILABLE');
  assert.equal(client.calls.nativeProbes, 1);
  assert.equal(client.calls.nativeImports, 0);
  assert.equal(client.calls.clients.length, 0);
  assert.equal(client.calls.getSession, 0);
  assert.equal(client.calls.signIn, 0);
  // A failed attempt must not leave the shared session request permanently pending.
  await rejectsWithCode(client, 'SECURE_STORAGE_UNAVAILABLE');
});

test('package initialization failure after a successful native probe remains a controlled error', async () => {
  const client = fixture({ importError: true });
  await rejectsWithCode(client, 'SECURE_STORAGE_UNAVAILABLE');
  assert.equal(client.calls.nativeProbes, 1);
  assert.equal(client.calls.nativeImports, 1);
  assert.equal(client.calls.clients.length, 0);
  assert.equal(client.calls.signIn, 0);
});

test('unavailable or failing native storage never falls back to an insecure persistent session', async () => {
  for (const options of [{ available: false }, { availabilityError: true }]) {
    const client = fixture(options);
    await rejectsWithCode(client, 'SECURE_STORAGE_UNAVAILABLE');
    assert.equal(client.calls.available, 1);
    assert.equal(client.calls.clients.length, 0);
    assert.equal(client.calls.signIn, 0);
  }
});

test('web sessions work without importing or probing native storage', async () => {
  const client = fixture({ platform: 'web', nativeMissing: true, session: SESSION });
  const cleanup = client.manageMailSessionRefresh();
  assert.equal(await client.getMailSession(), SESSION);
  assert.equal(client.calls.nativeProbes, 0);
  assert.equal(client.calls.nativeImports, 0);
  assert.equal(client.calls.available, 0);
  assert.equal(client.calls.clients[0].config.auth.storage, undefined);
  assert.equal(client.listeners.size, 0);
  assert.equal(client.calls.signIn, 0);
  cleanup();
});

test('native sessions retain chunked secure storage and device-only keychain options', async () => {
  const client = fixture({ session: SESSION });
  assert.equal(await client.getMailSession(), SESSION);
  const [{ url, key, config: { auth } }] = client.calls.clients;
  assert.equal(url, 'https://offline-fixture.supabase.co');
  assert.equal(key, 'sb_publishable_offline_fixture');
  assert.equal(auth.storageKey, 'repnet-facturas.mail-session.v1');
  assert.equal(auth.persistSession, true);
  assert.equal(auth.autoRefreshToken, true);
  assert.equal(auth.detectSessionInUrl, false);
  assert.equal(auth.lock, client.processLock);

  const value = JSON.stringify({ access_token: 'token'.repeat(1000), name: '\u{1f4f7}'.repeat(800) });
  await auth.storage.setItem(auth.storageKey, value);
  assert.equal(await auth.storage.getItem(auth.storageKey), value);
  assert.ok(client.writes.length > 2);
  for (const write of client.writes) {
    assert.ok(Buffer.byteLength(write.value, 'utf8') < 2048);
    assert.equal(write.config.keychainAccessible, 42);
  }
  await auth.storage.removeItem(auth.storageKey);
  assert.equal(await auth.storage.getItem(auth.storageKey), null);
  assert.equal(client.data.size, 0);
});

test('concurrent session requests share native initialization and anonymous sign-in, then reuse the client', async () => {
  const client = fixture();
  const sessions = await Promise.all([client.getMailSession(), client.getMailSession(), client.getMailSession()]);
  for (const session of sessions) assert.equal(session, SESSION);
  assert.equal(client.calls.nativeProbes, 1);
  assert.equal(client.calls.nativeImports, 1);
  assert.equal(client.calls.available, 1);
  assert.equal(client.calls.clients.length, 1);
  assert.equal(client.calls.getSession, 1);
  assert.equal(client.calls.signIn, 1);
  assert.equal(await client.getMailSession(), SESSION);
  assert.equal(client.calls.clients.length, 1);
  assert.equal(client.calls.nativeProbes, 1);
  assert.equal(client.calls.nativeImports, 1);
  assert.equal(client.calls.signIn, 1);
  assert.equal(client.calls.getSession, 2);
});

test('native refresh follows app lifecycle after lazy initialization and removes its listener', async () => {
  const client = fixture({ state: 'background', session: SESSION });
  const cleanup = client.manageMailSessionRefresh();
  await client.getMailSession();
  assert.equal(client.calls.stop, 1);
  client.emit('active');
  assert.equal(client.calls.start, 1);
  client.emit('background');
  assert.equal(client.calls.stop, 2);
  cleanup();
  client.emit('active');
  assert.equal(client.calls.start, 1);
});

test('session and anonymous-provider failures retain their actionable error codes', async () => {
  const unavailable = fixture({ sessionError: { message: 'Offline fixture' } });
  await rejectsWithCode(unavailable, 'SESSION_UNAVAILABLE');
  assert.equal(unavailable.calls.signIn, 0);
  const disabled = fixture({ signInError: { code: 'anonymous_provider_disabled' } });
  await rejectsWithCode(disabled, 'ANONYMOUS_SIGNIN_DISABLED');
  assert.equal(disabled.calls.signIn, 1);
});
