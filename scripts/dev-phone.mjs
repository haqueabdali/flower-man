// Development on a real phone, in one window: API (reachable on your Wi-Fi), admin web, and the JavaScript
// servers of both mobile apps, all pointed at this PC's Wi-Fi address. Ctrl+C stops everything.
//   pnpm dev:phone                     detects the Wi-Fi address
//   LAN_IP=192.168.1.23 pnpm dev:phone  uses the address you give
// The phone must have the development builds installed (docs/runbook.md, section 2) and be on the same Wi-Fi.
import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const VIRTUAL = /(vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback|tailscale|zerotier|vpn|utun|br-|veth)/i;

/** Picks the most likely Wi-Fi/LAN IPv4 address: home networks (192.168.*) first, then 10.*, then 172.16–31.*. */
export function pickLanAddress(interfaces) {
  const rank = (address) => (address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2 : 9);
  const candidates = Object.entries(interfaces)
    .filter(([name]) => !VIRTUAL.test(name))
    .flatMap(([name, list]) => (list ?? []).map((info) => ({ name, ...info })))
    .filter((info) => info.family === 'IPv4' && !info.internal && rank(info.address) < 9)
    .sort((a, b) => rank(a.address) - rank(b.address));
  return candidates[0]?.address ?? null;
}

function run(label, color, args, env = {}) {
  const child = spawn('pnpm', args, { shell: isWindows, env: { ...process.env, ...env, FORCE_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\x1b[${color}m${label.padEnd(9)}\x1b[0m│ `;
  for (const stream of [child.stdout, child.stderr]) {
    let buffered = '';
    stream.on('data', (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
  }
  child.on('exit', (code) => process.stdout.write(`${prefix}stopped (exit ${code ?? 'signal'})\n`));
  return child;
}

function stopAll(children) {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}

async function waitForHealth(url, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function main() {
  const ip = process.env.LAN_IP?.trim() || pickLanAddress(networkInterfaces());
  if (!ip) {
    console.error('✖ No Wi-Fi/LAN address found. Connect to Wi-Fi, or run: LAN_IP=<your IPv4 from ipconfig> pnpm dev:phone');
    process.exitCode = 1;
    return;
  }
  const apiUrl = `http://${ip}:4000`;

  console.log(`Building shared packages…`);
  const build = spawnSync('pnpm', ['run', 'build:core'], { shell: isWindows, stdio: 'inherit' });
  if (build.status !== 0) {
    process.exitCode = build.status ?? 1;
    return;
  }

  const children = [
    run('api', '35', ['--filter', '@flower-man/api', 'run', 'dev'], { HOST: '0.0.0.0' }),
    run('admin', '36', ['--filter', '@flower-man/admin-web', 'run', 'dev']),
    run('customer', '32', ['--filter', '@flower-man/customer-mobile', 'run', 'start', '--port', '8081'], { EXPO_PUBLIC_API_URL: apiUrl }),
    run('partner', '33', ['--filter', '@flower-man/partner-mobile', 'run', 'start', '--port', '8082'], { EXPO_PUBLIC_API_URL: apiUrl }),
  ];
  const shutdown = () => {
    stopAll(children);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const healthy = await waitForHealth(`${apiUrl}/api/v1/health`);
  const banner = [
    '',
    '──────────────────────────────────────────────────────────────────',
    healthy ? `✔ API reachable on your network: ${apiUrl}/api/v1/health` : `✖ API not reachable at ${apiUrl}. Allow Node.js through Windows Firewall (Private networks).`,
    `  Phone, Flower Man app          → enter URL: http://${ip}:8081`,
    `  Phone, Flower Man Partner app  → enter URL: http://${ip}:8082`,
    '  Admin on this PC               → http://localhost:3000',
    '  Demo accounts: pnpm db:seed:demo (password flowerman-demo-2026)',
    '  Stop everything: Ctrl+C',
    '──────────────────────────────────────────────────────────────────',
    '',
  ];
  console.log(banner.join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
