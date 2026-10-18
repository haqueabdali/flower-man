// Static repository / build configuration checks (fast, no network, no secrets needed).
// Usage: node scripts/release-check.mjs   (pnpm release:check also runs typecheck and tests)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '✔' : '✖'} ${message}`);
  if (!ok) failures.push(message);
};
const read = (path) => readFileSync(join(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

// Required files
for (const path of [
  'pnpm-workspace.yaml', 'tsconfig.base.json', '.gitattributes', '.env.example', '.env.production.example',
  'infra/compose.yaml', 'infra/database/migrations/README.md', 'docs/decisions.md', 'docs/runbook.md',
  'apps/api/src/main.ts', 'apps/admin-web/next.config.ts',
  'apps/customer-mobile/app.config.ts', 'apps/customer-mobile/eas.json',
  'apps/partner-mobile/app.config.ts', 'apps/partner-mobile/eas.json',
]) {
  check(existsSync(join(root, path)), `exists: ${path}`);
}

// Migrations: contiguous numbering, valid names
const migrations = readdirSync(join(root, 'infra/database/migrations')).filter((name) => name.endsWith('.sql')).sort();
const numbered = migrations.map((name) => /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.exec(name));
check(numbered.every(Boolean), `migration names are NNNN_snake_case.sql (${migrations.length} files)`);
check(numbered.every((match, index) => match && Number(match[1]) === index + 1), 'migration versions are contiguous from 0001');

// Package manager and toolchain pins
const rootPackage = json('package.json');
check(rootPackage.packageManager === 'pnpm@11.19.0', 'packageManager pinned to pnpm@11.19.0');
const workspace = read('pnpm-workspace.yaml');
check(/minimumReleaseAgeStrict:\s*true/.test(workspace) && /strictDepBuilds:\s*true/.test(workspace), 'supply-chain settings enabled (minimumReleaseAgeStrict, strictDepBuilds)');

// Mobile apps are distinct applications
const customerConfig = read('apps/customer-mobile/app.config.ts');
const partnerConfig = read('apps/partner-mobile/app.config.ts');
const id = (config, key) => new RegExp(`${key}:\\s*'([^']+)'`).exec(config)?.[1];
check(id(customerConfig, 'bundleIdentifier') && id(customerConfig, 'bundleIdentifier') !== id(partnerConfig, 'bundleIdentifier'), 'customer and partner iOS bundle identifiers differ');
check(id(customerConfig, 'package') && id(customerConfig, 'package') !== id(partnerConfig, 'package'), 'customer and partner Android packages differ');
check(id(customerConfig, 'slug') !== id(partnerConfig, 'slug'), 'customer and partner Expo slugs differ');
check(!/projectId:\s*'[0-9a-f-]{36}'/.test(customerConfig + partnerConfig), 'no hard-coded EAS project IDs (they come from EXPO_PUBLIC_EAS_PROJECT_ID)');
check(/isAndroidBackgroundLocationEnabled:\s*true/.test(partnerConfig) && /UIBackgroundModes:\s*\['location'\]/.test(partnerConfig), 'partner app declares background location');
check(/blockedPermissions:\s*\['ACCESS_BACKGROUND_LOCATION'\]/.test(customerConfig), 'customer app never requests background location');

// Secrets must not be committed
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
check(!tracked.some((file) => /(^|\/)\.env(\.[a-z]+)?$/.test(file) && !file.endsWith('.example')), 'no .env files are tracked');
const secretPatterns = [/sk_live_[A-Za-z0-9]{10,}/, /rk_live_[A-Za-z0-9]{10,}/, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/];
const leaked = tracked.filter((file) => !/\.(png|jpe?g|webp|ico|lock|yaml)$/.test(file) && !file.startsWith('scripts/release-check')).filter((file) => {
  try {
    const content = readFileSync(join(root, file), 'utf8');
    return secretPatterns.some((pattern) => pattern.test(content));
  } catch {
    return false;
  }
});
check(leaked.length === 0, `no live secrets in tracked files${leaked.length ? ` (${leaked.join(', ')})` : ''}`);

// Production example must not contain usable values
const productionExample = read('.env.production.example');
check(/PAYMENT_PROVIDER=stripe/.test(productionExample) && /DATABASE_SSL=true/.test(productionExample), '.env.production.example uses stripe and TLS');

console.log(failures.length === 0 ? '\nRelease configuration OK.' : `\n${failures.length} check(s) failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;
