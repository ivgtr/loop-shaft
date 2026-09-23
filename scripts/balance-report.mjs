import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report = resolve(root, 'docs/balance-results.json');
if (existsSync(report)) unlinkSync(report);
const result = spawnSync(process.execPath, [
  resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
  '--config', 'vitest.balance.config.ts', 'tests/balanceSimulation.extended.test.ts',
], {
  cwd: root, stdio: 'inherit', env: { ...process.env, BALANCE_REPORT_PATH: report },
});
if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  if (existsSync(report)) {
    const data = JSON.parse(readFileSync(report, 'utf8'));
    data.probeChecksPassed = result.status === 0;
    writeFileSync(report, JSON.stringify(data, null, 2) + '\n');
  }
  process.exitCode = result.status ?? 1;
}
