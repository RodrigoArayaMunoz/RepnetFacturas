// Regression coverage for GHSA-vcc3-ghjq-m6fr and GHSA-86w9-cpqp-85rv.
// Forge regression fixture: https://github.com/digitalbazaar/forge/pull/1152
// Copyright (c) 2010, Digital Bazaar, Inc. (BSD-3-Clause).
// See ../patches/THIRD_PARTY_LICENSES.md for upstream notices.
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const decode = require('decode-uri-component');
const queryString = require('query-string');
const forge = require('node-forge');

const projectRoot = path.resolve(__dirname, '..');

function withTemporaryFixture(callback) {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(temporaryRoot, 'repnet-security-'));
  try {
    callback(fixture);
  } finally {
    const resolvedFixture = fs.realpathSync(fixture);
    if (path.dirname(resolvedFixture) !== temporaryRoot ||
        !path.basename(resolvedFixture).startsWith('repnet-security-')) {
      throw new Error('Refusing to remove a fixture outside the intended temporary directory.');
    }
    fs.rmSync(resolvedFixture, { recursive: true, force: true });
  }
}

test('URI decoder keeps CommonJS, form encoding and UTF-8 semantics', () => {
  const cases = [
    ['', ''],
    ['Factura+de+Jos%C3%A9', 'Factura de José'],
    ['%2B+%2525', '+ %25'],
    ['%F0%9F%93%84', '📄'],
    ['%E2%82%AC', '€'],
    ['%FE%FF', '\uFFFD\uFFFD'],
    ['%FF%FE', '\uFFFD\uFFFD'],
    ['%C2', '\uFFFD'],
    ['%E0%A4%A', '%E0%A4%A'],
    ['x%00%FF%41y', 'x\u0000%FFAy'],
    ['%25%FF%32%35', '%%FF25'],
    ['%G1%', '%G1%'],
  ];
  assert.equal(typeof decode, 'function');
  for (const [input, expected] of cases) {
    assert.equal(decode(input), expected, input);
  }
  assert.throws(() => decode(null), TypeError);
});

test('query-string retains the API used by Expo Router', () => {
  const parsed = queryString.parse('cliente=Jos%C3%A9+P%C3%A9rez&folio=123&tag=a&tag=b&v=%C2%25');
  assert.deepEqual({ ...parsed }, {
    cliente: 'José Pérez', folio: '123', tag: ['a', 'b'], v: '\uFFFD%',
  });
  const value = { cliente: 'José Pérez', tag: ['a', 'b'], empty: '', absent: null };
  assert.deepEqual({ ...queryString.parse(queryString.stringify(value, { sort: false })) }, value);
});

test('large malformed URI and query input finishes within a bounded child process', () => {
  const childSource = `
    const assert = require('node:assert/strict');
    const decode = require(${JSON.stringify(require.resolve('decode-uri-component'))});
    const queryString = require(${JSON.stringify(require.resolve('query-string'))});
    for (const length of [8192, 32768]) {
      const input = '%00'.repeat(length) + '%FF';
      const expected = String.fromCharCode(0).repeat(length) + '%FF';
      assert.equal(decode(input), expected);
      assert.equal(queryString.parse('value=' + input).value, expected);
    }
  `;
  const child = spawnSync(process.execPath, ['-e', childSource], {
    cwd: projectRoot, encoding: 'utf8', timeout: 5000, windowsHide: true,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
});

test('RSA verification accepts valid signatures and rejects changed messages', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  const signingKey = forge.pki.privateKeyFromPem(privateKey);
  const verifyingKey = forge.pki.publicKeyFromPem(publicKey);
  const digest = forge.md.sha256.create().update('repnet factura', 'utf8');
  const signature = signingKey.sign(digest);
  assert.equal(verifyingKey.verify(digest.digest().getBytes(), signature), true);
  const wrong = forge.md.sha256.create().update('changed invoice', 'utf8');
  assert.equal(verifyingKey.verify(wrong.digest().getBytes(), signature), false);

  // Also cover the optional NULL parameter and an extra child without changing RSA padding.
  const asn1 = forge.asn1;
  const oid = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false,
    asn1.oidToDer(forge.oids.sha256).getBytes());
  const nullParameter = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, '');
  const garbage = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, 'garbage');
  for (const includeNull of [false, true]) {
    for (const includeGarbage of [false, true]) {
      const algorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true,
        [oid, ...(includeNull ? [nullParameter] : []), ...(includeGarbage ? [garbage] : [])]);
      const info = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        algorithm,
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest.digest().getBytes()),
      ]);
      const encoded = asn1.toDer(info).getBytes();
      const craftedSignature = signingKey.sign(encoded, 'NONE');
      if (includeGarbage) {
        assert.throws(() => verifyingKey.verify(digest.digest().getBytes(), craftedSignature),
          /does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo/);
      } else {
        assert.equal(verifyingKey.verify(digest.digest().getBytes(), craftedSignature), true);
      }
    }
  }
});

test('RSA rejects the upstream nested DigestAlgorithm regression vector', () => {
  const modulus = [
    'E932AC92252F585B3A80A4DD76A897C8B7652952FE788F6EC8DD640587A1EE56',
    '47670A8AD4C2BE0F9FA6E49C605ADF77B5174230AF7BD50E5D6D6D6D28CCF0A8',
    '86A514CC72E51D209CC772A52EF419F6A953F3135929588EBE9B351FCA61CED7',
    '8F346FE00DBB6306E5C2A4C6DFC3779AF85AB417371CF34D8387B9B30AE46D7A',
    '5FF5A655B8D8455F1B94AE736989D60A6F2FD5CADBFFBD504C5A756A2E6BB5CE',
    'CC13BCA7503F6DF8B52ACE5C410997E98809DB4DC30D943DE4E812A47553DCE5',
    '4844A78E36401D13F77DC650619FED88D8B3926E3D8E319C80C744779AC5D6AB',
    'E252896950917476ECE5E8FC27D5F053D6018D91B502C4787558A002B9283DA7',
  ].join('');
  const signature = forge.util.hexToBytes([
    'a4ae63dd5e7712b78f4870d0f51e294df5503d4f16c5d27ae33370981fb57f0de49f',
    '50f3d6a04666774cd984cd13972db9bf8e12bd294ef0ddc916c7c86cbae63efd7b6b',
    '97885e69760c208a40f1aecc76a90d7af5145177efce1bb55807a8d05c20b1596753',
    'ba710642fc9acdde6c160232654662c77cc4466c8257a38edb49f894e8845d0fd987',
    'b857ced88f4b62505a080bd87ef700d35d392a6e8f6fde34250c50b86fae606cb551',
    '215e8f4813239b77651d5565ad453698c071d48c31e8e526fb4a37610f64b3e1fb8e',
    '5be5898e408ad08197a0947794a530b54f84485377ce4a7488ed485ce4e5e105dd89',
    '698a472f390c3b1b76bc16b73276c4d1c81d',
  ].join(''));
  const publicKey = forge.pki.rsa.setPublicKey(new forge.jsbn.BigInteger(modulus, 16),
    new forge.jsbn.BigInteger('3'));
  const digest = forge.md.sha256.create().update('hello world!', 'utf8').digest().getBytes();
  assert.throws(() => publicKey.verify(digest, signature, undefined, { _skipPaddingChecks: true }),
    /does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo/);
});

test('patch installer refuses changed versions and unrecognized source before writing', () => {
  const { preparePatch, specifications } = require('./apply-dependency-security-patches.cjs');
  withTemporaryFixture((fixture) => {
    for (const spec of specifications) {
      const directory = path.join(fixture, spec.name);
      const target = path.join(directory, spec.file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: spec.name, version: '99.0.0' }));
      fs.writeFileSync(target, 'unrecognized source\n');
      assert.throws(() => preparePatch(spec, directory), /Unsupported .* version/);
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: spec.name, version: spec.version }));
      assert.throws(() => preparePatch(spec, directory), /Unexpected source hash/);
      assert.equal(fs.readFileSync(target, 'utf8'), 'unrecognized source\n');
    }
  });
});

test('patch installer accepts repeated LF/CRLF patches and exact original Forge sources', () => {
  const { preparePatch, specifications } = require('./apply-dependency-security-patches.cjs');
  withTemporaryFixture((fixture) => {
    for (const spec of specifications) {
      const installedDirectory = path.dirname(require.resolve(`${spec.name}/package.json`));
      const installedSource = fs.readFileSync(path.join(installedDirectory, spec.file), 'utf8')
        .replace(/\r\n/g, '\n');
      const directory = path.join(fixture, spec.name);
      const target = path.join(directory, spec.file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: spec.name, version: spec.version }));
      for (const newline of ['\n', '\r\n']) {
        const patchedSource = installedSource.replace(/\n/g, newline);
        fs.writeFileSync(target, patchedSource);
        assert.equal(preparePatch(spec, directory).status, 'already patched');
        assert.equal(fs.readFileSync(target, 'utf8'), patchedSource);
        if (spec.before) {
          // Reconstruct the exact release source; its pinned SHA256 must validate.
          fs.writeFileSync(target, installedSource.replace(spec.after, spec.before).replace(/\n/g, newline));
          const plan = preparePatch(spec, directory);
          assert.equal(plan.status, 'needs patch');
          assert.equal(plan.replacement, patchedSource);
        }
      }
    }
  });
});
