// Reproducible security backports; package versions and npm audit remain unchanged.
// Sources: https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.1/index.js
// and https://github.com/digitalbazaar/forge/pull/1152 (BSD-3-Clause).
// Upstream copyright and license notices: ../patches/THIRD_PARTY_LICENSES.md.
'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const canonicalize = (source) => source.replace(/\r\n/g, '\n');
const sha256 = (source) => createHash('sha256').update(source).digest('hex');

const specifications = [
  {
    name: 'decode-uri-component',
    version: '0.2.2',
    file: 'index.js',
    originalHash: '3b8ba0a765e1089d11bba9a919d0d8789ecd9a6833ea078d8d9114e1db093863',
    patchedHash: '8ecc1ee9322849a7648df10f94775dc327ae4382b88eeca8c4e18c79770654d0',
    replacement: 'patches/decode-uri-component-0.2.2.cjs',
  },
  {
    name: 'node-forge',
    version: '1.4.0',
    file: 'lib/rsa.js',
    originalHash: 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50',
    patchedHash: 'a6f7ab15752dd6e70a7f24f1f212ead77a9587acb8329d469f5af649ab1a2703',
    before: '            obj.value.length !== 2) {',
    after: [
      '            obj.value.length !== 2 ||',
      '            obj.value[0].value.length !==',
      "            (('parameters' in capture) ? 2 : 1)) {",
    ].join('\n'),
  },
];

function preparePatch(spec, packageDirectory) {
  const metadata = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  if (metadata.name !== spec.name || metadata.version !== spec.version) {
    throw new Error(`Unsupported ${spec.name} version ${metadata.version}; review this security backport before updating.`);
  }

  const target = path.join(packageDirectory, spec.file);
  const source = fs.readFileSync(target, 'utf8');
  const canonicalSource = canonicalize(source);
  const hash = sha256(canonicalSource);
  let replacement;
  if (spec.replacement) {
    replacement = canonicalize(fs.readFileSync(path.join(projectRoot, spec.replacement), 'utf8'));
    if (sha256(replacement) !== spec.patchedHash) {
      throw new Error(`Unexpected replacement hash for ${spec.name}; review the checked-in patch.`);
    }
  }

  if (hash === spec.patchedHash) {
    return { spec, target, source, status: 'already patched' };
  }
  if (hash !== spec.originalHash) {
    throw new Error(`Unexpected source hash for ${spec.name}@${spec.version}: ${hash}; refusing to modify ${target}.`);
  }
  if (!replacement) {
    if (canonicalSource.split(spec.before).length !== 2) {
      throw new Error(`Expected one source anchor for ${spec.name}; refusing an ambiguous patch.`);
    }
    replacement = canonicalSource.replace(spec.before, spec.after);
  }
  if (sha256(replacement) !== spec.patchedHash) {
    throw new Error(`Unexpected patched hash for ${spec.name}; refusing to write.`);
  }
  return {
    spec, target, source, status: 'needs patch',
    replacement: source.includes('\r\n') ? replacement.replace(/\n/g, '\r\n') : replacement,
  };
}

// Inspect package directories and nested node_modules only, including duplicate copies.
// Links are never followed: these backports must not write outside the installation.
function installedTargets(modulesDirectory, targets) {
  if (!fs.existsSync(modulesDirectory)) return;
  for (const entry of fs.readdirSync(modulesDirectory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const packageDirectory = path.join(modulesDirectory, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      installedTargets(packageDirectory, targets);
      continue;
    }
    const spec = specifications.find((candidate) => candidate.name === entry.name);
    if (spec && entry.isSymbolicLink()) {
      throw new Error(`Unsupported linked ${spec.name}; review the installation before patching.`);
    }
    if (!entry.isDirectory()) continue;
    if (spec) targets.push({ spec, packageDirectory });
    installedTargets(path.join(packageDirectory, 'node_modules'), targets);
  }
}

function main(argumentsList = process.argv.slice(2)) {
  if (argumentsList.some((argument) => argument !== '--check')) {
    throw new Error('Usage: node scripts/apply-dependency-security-patches.cjs [--check]');
  }
  const checkOnly = argumentsList.includes('--check');
  const targets = [];
  installedTargets(path.join(projectRoot, 'node_modules'), targets);
  for (const spec of specifications) {
    if (!targets.some((target) => target.spec === spec)) {
      throw new Error(`Missing ${spec.name}; install the locked dependencies before checking security backports.`);
    }
  }
  // Validate every target before modifying any of them.
  const plan = targets.map(({ spec, packageDirectory }) => preparePatch(spec, packageDirectory));
  if (checkOnly && plan.some((patch) => patch.status !== 'already patched')) {
    throw new Error('Security backports are missing; run npm run postinstall before using the app.');
  }
  for (const patch of plan) {
    if (patch.status === 'needs patch') {
      if (fs.readFileSync(patch.target, 'utf8') !== patch.source) {
        throw new Error(`Dependency changed while patching: ${patch.target}; retry after installation finishes.`);
      }
      fs.writeFileSync(patch.target, patch.replacement, 'utf8');
    }
    console.log(`[security backport] ${patch.spec.name}@${patch.spec.version}: ${checkOnly ? 'verified' : patch.status === 'needs patch' ? 'applied' : patch.status}`);
  }
}

module.exports = { preparePatch, specifications, main };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[security backport] ${error.message}`);
    process.exitCode = 1;
  }
}
