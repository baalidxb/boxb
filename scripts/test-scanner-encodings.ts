// Phase 9.6 — scanner encoding smoke test.
//
// Regression guard for the Day-2 bug where UTF-16 files (PowerShell's default
// output encoding on Windows) were misclassified as binary and silently
// skipped. Writes the same AWS test key in six encodings and asserts the
// scanner detects it in EVERY one.
//
// Run:  npx tsx scripts/test-scanner-encodings.ts
// (engine.ts is pure Node — no Electron — and its only @shared import is
//  type-only, so tsx runs it directly with no alias setup.)

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanFile } from '../src/main/scanner/engine';

const CONTENT = "const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE'\n";

const utf8 = (s: string): Buffer => Buffer.from(s, 'utf8');
const utf8Bom = (s: string): Buffer =>
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, 'utf8')]);
const utf16leBom = (s: string): Buffer => Buffer.from('﻿' + s, 'utf16le');
const utf16le = (s: string): Buffer => Buffer.from(s, 'utf16le');
// Big-endian = encode LE (with/without BOM) then byte-swap.
const utf16beBom = (s: string): Buffer => {
  const le = Buffer.from('﻿' + s, 'utf16le');
  le.swap16();
  return le;
};
const utf16be = (s: string): Buffer => {
  const le = Buffer.from(s, 'utf16le');
  le.swap16();
  return le;
};

const CASES: { name: string; bytes: Buffer }[] = [
  { name: 'utf8 (no BOM)', bytes: utf8(CONTENT) },
  { name: 'utf8 (BOM)', bytes: utf8Bom(CONTENT) },
  { name: 'utf16-le (BOM)', bytes: utf16leBom(CONTENT) },
  { name: 'utf16-be (BOM)', bytes: utf16beBom(CONTENT) },
  { name: 'utf16-le (no BOM)', bytes: utf16le(CONTENT) },
  { name: 'utf16-be (no BOM)', bytes: utf16be(CONTENT) }
];

async function run(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'boxb-scan-enc-'));
  let failures = 0;
  try {
    for (let i = 0; i < CASES.length; i++) {
      const test = CASES[i]!;
      const file = join(dir, `secret-${i}.js`);
      writeFileSync(file, test.bytes);
      const results = await scanFile(file);
      const hit = results.some((r) => r.patternId === 'aws-access-key');
      const status = hit ? 'PASS' : 'FAIL';
      if (!hit) failures++;
      console.log(
        `${status}  ${test.name.padEnd(20)} (${test.bytes.length} bytes) → ${results.length} match(es)`
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} encoding case(s) FAILED.`);
    process.exit(1);
  }
  console.log('\nAll encoding cases detected the AWS key. ✓');
}

void run();
