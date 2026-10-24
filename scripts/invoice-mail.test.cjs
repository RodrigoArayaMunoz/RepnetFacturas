const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Every transport below is injected. No test imports SMTP or performs a network request.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=',
  'base64',
);
const DEVICE_ID = '00000000-0000-4000-8000-000000000001';
const JWT = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: DEVICE_ID, role: 'authenticated', is_anonymous: true })).toString('base64url'),
  'offline-fixture-signature',
].join('.');
const CONFIG = { url: 'https://offline-fixture.supabase.co', key: 'sb_publishable_offline_fixture' };
const PHOTO_URI = 'file:///camera/factura.png';
const SENT_AT = '2026-10-24T12:00:00.000Z';

function loadTypeScript(relativePath, imports = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
      return imports[name];
    },
    Blob,
    FormData,
    Request,
    Response,
    Headers,
    AbortController,
    ArrayBuffer,
    Uint8Array,
    Error,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
  }, { filename });
  return module.exports;
}

const mailConfig = loadTypeScript('src/config/invoice-email.ts');

function receipt(changes = {}) {
  return {
    ok: true,
    messageId: '<offline-fixture@example.test>',
    sentAt: SENT_AT,
    recipients: Array.from(mailConfig.INVOICE_EMAIL_RECIPIENTS),
    alreadySent: false,
    ...changes,
  };
}

function fixture(options = {}) {
  const calls = [];
  const files = [];
  let sessionCalls = 0;
  class MailSessionError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }
  class CameraFile extends Blob {
    constructor(uri) {
      super([options.bytes ?? PNG], { type: options.type ?? 'image/png' });
      files.push(uri);
      this.exists = options.exists ?? true;
    }
    get size() {
      return options.size ?? super.size;
    }
  }
  const client = loadTypeScript('src/services/invoice-mail.ts', {
    'expo-file-system': { File: CameraFile },
    'expo/fetch': {
      async fetch(url, init) {
        calls.push({ url, init });
        if (!init && options.platform === 'web') {
          return options.photoResponse ?? new Response(PNG, { headers: { 'content-type': 'image/png' } });
        }
        if (options.request) return options.request(url, init);
        return options.response ?? Response.json(receipt());
      },
    },
    'react-native': { Platform: { OS: options.platform ?? 'android' } },
    '@/config/invoice-email': mailConfig,
    '@/services/supabase-client': {
      MailSessionError,
      getMailSupabaseConfig() {
        if (options.configError) throw new MailSessionError('Configura Supabase.', options.configError);
        return CONFIG;
      },
      async getMailSession() {
        sessionCalls++;
        if (options.sessionError) throw new MailSessionError('Sesión no disponible.', options.sessionError);
        return { access_token: JWT, user: { id: DEVICE_ID, is_anonymous: true } };
      },
    },
  });
  return { ...client, calls, files, sessionCalls: () => sessionCalls };
}

function send(client, changes = {}) {
  return client.sendInvoiceEmail({
    photoUri: PHOTO_URI,
    subject: '  Recepción factura Nº 123 — José  ',
    message: 'Estimados,\n\nAdjunto fotografía de la factura.\nSaludos.',
    ...changes,
  });
}

async function rejectsWithCode(client, code, changes = {}) {
  await assert.rejects(send(client, changes), (error) => {
    assert.ok(error instanceof client.InvoiceMailError);
    assert.equal(error.code, code);
    return true;
  });
}

test('native camera bytes, editable text, JWT and publishable key reach the real multipart contract', async () => {
  const client = fixture();
  const result = await send(client);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.files, [PHOTO_URI]);
  assert.equal(client.sessionCalls(), 1);
  const [{ url, init }] = client.calls;
  assert.equal(url, `${CONFIG.url}/functions/v1/enviar-factura`);
  assert.equal(mailConfig.INVOICE_EMAIL_FUNCTION, 'enviar-factura');
  assert.equal(init.method, 'POST');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${JWT}`);
  assert.equal(headers.get('apikey'), CONFIG.key);
  assert.equal(headers.has('content-type'), false, 'FormData must generate its own multipart boundary');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.body.get('message'), 'Estimados,\n\nAdjunto fotografía de la factura.\nSaludos.');

  const request = new Request(url, init);
  assert.match(request.headers.get('content-type'), /^multipart\/form-data; boundary=/);
  const form = await request.formData();
  assert.deepEqual(Array.from(form.keys()), ['photo', 'subject', 'message']);
  const photo = form.get('photo');
  assert.equal(photo.name, 'foto-factura.png');
  assert.equal(photo.type, 'image/png');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), PNG);
  assert.equal(form.get('subject'), 'Recepción factura Nº 123 — José');
  // Multipart serialization uses CRLF; the real handler restores the editor's LF newlines.
  assert.equal(form.get('message').replace(/\r\n/g, '\n'), 'Estimados,\n\nAdjunto fotografía de la factura.\nSaludos.');
  assert.equal(result.messageId, receipt().messageId);
  assert.equal(result.sentAt, SENT_AT);
  assert.deepEqual(result.recipients, receipt().recipients);
  assert.equal(result.alreadySent, false);
});

test('web camera data URI is read once and its exact bytes are attached', async () => {
  const uri = `data:image/png;base64,${PNG.toString('base64')}`;
  const client = fixture({ platform: 'web' });
  await send(client, { photoUri: uri });
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[0].url, uri);
  assert.equal(client.calls[0].init, undefined);
  assert.equal(client.files.length, 0, 'Web must not instantiate a native File');
  const form = await new Request(client.calls[1].url, client.calls[1].init).formData();
  assert.deepEqual(Buffer.from(await form.get('photo').arrayBuffer()), PNG);
  assert.equal(form.get('photo').type, 'image/png');
});

test('client and real Edge handler agree on photo, text, recipients and duplicate receipt without SMTP', async () => {
  const { createInvoiceMailHandler, RECIPIENTS, MAX_IMAGE_BYTES } = loadTypeScript(
    'supabase/functions/enviar-factura/handler.ts',
  );
  assert.deepEqual(Array.from(RECIPIENTS), Array.from(mailConfig.INVOICE_EMAIL_RECIPIENTS));
  assert.equal(MAX_IMAGE_BYTES, mailConfig.MAX_INVOICE_IMAGE_BYTES);
  const sent = [];
  let storedReceipt;
  const handler = createInvoiceMailHandler({
    senderAddress: 'bodega@autthcomercial.cl',
    authenticate: async (token) => token === JWT ? { id: DEVICE_ID } : null,
    isDeviceApproved: async (id) => id === DEVICE_ID,
    claimDelivery: async () => storedReceipt ?? { status: 'claimed', deliveryId: 'offline-delivery' },
    async settleDelivery(value) {
      storedReceipt = { status: 'sent', messageId: value.messageId, sentAt: SENT_AT };
      return storedReceipt;
    },
    async sendMail(message) {
      sent.push(message);
      return { messageId: receipt().messageId, accepted: Array.from(RECIPIENTS), rejected: [] };
    },
  });
  const client = fixture({ request: (url, init) => handler(new Request(url, init)) });
  const first = await send(client);
  const duplicate = await send(client);
  assert.equal(first.alreadySent, false);
  assert.equal(duplicate.alreadySent, true);
  assert.equal(sent.length, 1, 'A repeated image must not reach the sender twice');
  const [message] = sent;
  assert.deepEqual(Array.from(message.to), receipt().recipients);
  assert.equal(message.subject, 'Recepción factura Nº 123 — José');
  assert.equal(message.text, 'Estimados,\n\nAdjunto fotografía de la factura.\nSaludos.');
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0].contentType, 'image/png');
  assert.equal(message.attachments[0].contentDisposition, 'attachment');
  assert.deepEqual(Buffer.from(message.attachments[0].content), PNG);
});

test('unapproved device preserves its UUID for the authorization panel', async () => {
  const client = fixture({ response: Response.json({
    ok: false,
    code: 'DEVICE_NOT_APPROVED',
    message: 'Autoriza este dispositivo.',
    deviceId: DEVICE_ID,
  }, { status: 403 }) });
  await assert.rejects(send(client), (error) => {
    assert.ok(error instanceof client.InvoiceMailError);
    assert.equal(error.code, 'DEVICE_NOT_APPROVED');
    assert.equal(error.deviceId, DEVICE_ID);
    assert.equal(error.message, 'Autoriza este dispositivo.');
    return true;
  });
});

test('only complete receipts for the two configured recipients can confirm success', async () => {
  const invalidReceipts = [
    receipt({ messageId: '' }),
    receipt({ sentAt: 'not a date' }),
    receipt({ alreadySent: undefined }),
    receipt({ recipients: [mailConfig.INVOICE_EMAIL_RECIPIENTS[0]] }),
    receipt({ recipients: [mailConfig.INVOICE_EMAIL_RECIPIENTS[0], mailConfig.INVOICE_EMAIL_RECIPIENTS[0]] }),
    receipt({ recipients: [mailConfig.INVOICE_EMAIL_RECIPIENTS[0], 'unexpected@example.test'] }),
    receipt({ recipients: [...mailConfig.INVOICE_EMAIL_RECIPIENTS, 'extra@example.test'] }),
  ];
  for (const value of invalidReceipts) {
    await rejectsWithCode(fixture({ response: Response.json(value) }), 'DELIVERY_UNCERTAIN');
  }
  const complete = fixture({ response: Response.json(receipt({
    alreadySent: true,
    recipients: Array.from(mailConfig.INVOICE_EMAIL_RECIPIENTS).reverse().map((address) => address.toUpperCase()),
  })) });
  assert.equal((await send(complete)).alreadySent, true);
});

test('network interruption, abort, malformed JSON and ambiguous response never claim success or permit automatic retry', async () => {
  for (const error of [new TypeError('offline'), new DOMException('aborted', 'AbortError')]) {
    await rejectsWithCode(fixture({ request: async () => { throw error; } }), 'DELIVERY_UNCERTAIN');
  }
  for (const response of [
    new Response('proxy error', { status: 502 }),
    Response.json(null),
    Response.json([]),
    Response.json('not a receipt'),
    Response.json({}),
    Response.json({ message: 'upstream failed' }, { status: 502 }),
  ]) {
    await rejectsWithCode(fixture({ response }), 'DELIVERY_UNCERTAIN');
  }
});

test('explicit backend uncertainty, in-progress and known pre-delivery errors preserve their codes', async () => {
  for (const [code, status] of [
    ['DELIVERY_UNCERTAIN', 409],
    ['DELIVERY_IN_PROGRESS', 409],
    ['DAILY_LIMIT_REACHED', 429],
    ['SERVICE_UNAVAILABLE', 503],
  ]) {
    await rejectsWithCode(fixture({ response: Response.json({ ok: false, code, message: 'Error controlado.' }, { status }) }), code);
  }
});

test('invalid camera photo, unsafe subject and invalid message fail before session or network use', async () => {
  for (const [changes, code] of [
    [{ photoUri: '' }, 'PHOTO_MISSING'],
    [{ subject: ' ' }, 'INVALID_SUBJECT'],
    [{ subject: 'Factura\r\nBcc: unexpected@example.test' }, 'INVALID_SUBJECT'],
    [{ subject: 'a'.repeat(301) }, 'INVALID_SUBJECT'],
    [{ message: ' ' }, 'INVALID_MESSAGE'],
    [{ message: 'a'.repeat(10001) }, 'INVALID_MESSAGE'],
  ]) {
    const client = fixture();
    await rejectsWithCode(client, code, changes);
    assert.equal(client.calls.length, 0);
    assert.equal(client.sessionCalls(), 0);
  }
  for (const [options, code] of [
    [{ exists: false }, 'PHOTO_MISSING'],
    [{ bytes: Buffer.alloc(0) }, 'IMAGE_TOO_LARGE'],
    [{ size: mailConfig.MAX_INVOICE_IMAGE_BYTES + 1 }, 'IMAGE_TOO_LARGE'],
  ]) {
    const client = fixture(options);
    await rejectsWithCode(client, code);
    assert.equal(client.calls.length, 0);
    assert.equal(client.sessionCalls(), 0);
  }
});

test('configuration and session errors retain actionable codes before uploading the image', async () => {
  for (const options of [{ configError: 'MAIL_NOT_CONFIGURED' }, { sessionError: 'ANONYMOUS_SIGNIN_DISABLED' }]) {
    const client = fixture(options);
    await rejectsWithCode(client, options.configError ?? options.sessionError);
    assert.equal(client.calls.length, 0);
  }
});
