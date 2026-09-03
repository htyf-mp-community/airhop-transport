import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const outputDir = mkdtempSync(join(tmpdir(), 'airhop-ios-config-'));
const binary = join(outputDir, 'AirhopBLEConfigurationTests');
try {
  const compile = spawnSync('xcrun', [
    'swiftc',
    'ios/AirhopBLEConfiguration.swift',
    'tests/ios/main.swift',
    '-o', binary,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  if (compile.status !== 0) {
    process.stderr.write(compile.stderr || compile.stdout);
    process.exit(compile.status ?? 1);
  }
  const test = spawnSync(binary, [], { encoding: 'utf8' });
  process.stdout.write(test.stdout);
  process.stderr.write(test.stderr);
  process.exit(test.status ?? 1);
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
