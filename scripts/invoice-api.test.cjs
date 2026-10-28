const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

const serverRequire = createRequire(path.resolve(__dirname, '../server/package.json'));
const PHOTO_URI = 'file:///camera/factura.jpg';
const API_URL = 'https://offline-fixture.example.test';
const INVOICE = {
  documentReadable: true,
  supplierName: 'Proveedor de prueba SpA',
  invoiceNumber: '000123-4',
  warnings: [],
};

function loadTypeScript(relativePath, imports = {}) {
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
      return imports[name];
    },
    process: { env: { EXPO_PUBLIC_API_URL: API_URL } },
    __DEV__: false,
    FormData,
    AbortController,
    setTimeout,
    clearTimeout,
  }, { filename });
  return module.exports;
}

const { invoiceSchema } = loadTypeScript('server/src/schemas/invoice.ts', {
  zod: serverRequire('zod'),
});

function fixture(payload) {
  const calls = [];
  class CameraFile extends Blob {
    constructor(uri) {
      assert.equal(uri, PHOTO_URI);
      super(['offline invoice image'], { type: 'image/jpeg' });
      this.exists = true;
    }
  }
  const client = loadTypeScript('src/services/invoice-api.ts', {
    'expo-file-system': { File: CameraFile },
    'expo/fetch': {
      async fetch(url, init) {
        calls.push({ url, init });
        return Response.json(payload);
      },
    },
    'react-native': { Platform: { OS: 'android' } },
  });
  return { ...client, calls };
}

test('the backend two-field contract is accepted without any product details', async () => {
  const backendPayload = invoiceSchema.parse(INVOICE);
  assert.deepEqual(backendPayload, INVOICE);
  const client = fixture(backendPayload);
  const result = await client.analyzeInvoice(PHOTO_URI);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), INVOICE);
  assert.equal(client.calls.length, 1);
  const [{ url, init }] = client.calls;
  assert.equal(url, `${API_URL}/api/invoices/analyze`);
  assert.equal(init.method, 'POST');
  assert.equal(await init.body.get('invoice').text(), 'offline invoice image');
});

test('a previous backend response remains compatible and drops extra invoice details', async () => {
  const previousPayload = {
    ...INVOICE,
    products: [{ productCode: 'legacy-product', quantity: 4 }],
    total: 15000,
  };
  const client = fixture(previousPayload);
  const result = await client.analyzeInvoice(PHOTO_URI);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), INVOICE);
  assert.deepEqual(invoiceSchema.parse(previousPayload), INVOICE);
});

test('unreadable or incomplete fields retain their operational metadata', async () => {
  const payload = {
    documentReadable: false,
    supplierName: null,
    invoiceNumber: null,
    warnings: ['No se puede leer el encabezado.'],
  };
  const client = fixture(invoiceSchema.parse(payload));
  assert.deepEqual(JSON.parse(JSON.stringify(await client.analyzeInvoice(PHOTO_URI))), payload);
});

test('both sides reject malformed names, numbers and readability metadata', async () => {
  for (const changes of [
    { supplierName: 123 },
    { invoiceNumber: 123 },
    { documentReadable: 'true' },
    { warnings: [123] },
    { invoiceNumber: undefined },
  ]) {
    const payload = { ...INVOICE, ...changes };
    assert.equal(invoiceSchema.safeParse(payload).success, false);
    const client = fixture(payload);
    await assert.rejects(client.analyzeInvoice(PHOTO_URI), (error) => {
      assert.ok(error instanceof client.InvoiceApiError);
      assert.equal(error.message, 'Los datos recibidos de la factura no son válidos.');
      return true;
    });
  }
});
