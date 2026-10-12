// Cross-platform `rm -rf` for build output (pnpm runs scripts with cmd.exe on Windows).
// Usage: node ../../scripts/clean.mjs dist [other-dir ...]
// Only removes paths strictly inside the current working directory.
import { rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const cwd = process.cwd();
const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error('clean.mjs: no paths given');
  process.exit(1);
}

for (const target of targets) {
  const absolute = resolve(cwd, target);
  if (!absolute.startsWith(cwd + sep)) {
    console.error(`clean.mjs: refusing to remove path outside ${cwd}: ${target}`);
    process.exit(1);
  }
  rmSync(absolute, { recursive: true, force: true });
}
