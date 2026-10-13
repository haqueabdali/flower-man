// Development runner for the API (no extra dependencies, works with cmd.exe and Git Bash):
//   1. `tsc --watch` recompiles src/ into dist/ on every change
//   2. `node --watch` restarts dist/main.js whenever the compiled output changes
// Ctrl+C stops both. Run through `pnpm dev:api` (it builds once first).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');

const children = [
  spawn(process.execPath, [tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], { stdio: 'inherit' }),
  spawn(process.execPath, ['--watch', '--env-file-if-exists=../../.env', 'dist/main.js'], { stdio: 'inherit' }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

for (const child of children) {
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
