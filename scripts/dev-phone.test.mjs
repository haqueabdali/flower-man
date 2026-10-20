import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickLanAddress } from './dev-phone.mjs';

const v4 = (address, internal = false) => ({ family: 'IPv4', address, internal });

test('prefers the Wi-Fi address over Docker/WSL adapters', () => {
  assert.equal(
    pickLanAddress({
      'vEthernet (WSL)': [v4('172.25.160.1')],
      'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
      'Ethernet 3': [v4('10.0.0.5')],
      'Wi-Fi': [{ family: 'IPv6', address: 'fe80::1', internal: false }, v4('192.168.1.23')],
    }),
    '192.168.1.23',
  );
});

test('returns null when only virtual or public addresses exist', () => {
  assert.equal(pickLanAddress({ 'vEthernet (Default Switch)': [v4('172.20.0.1')], eth0: [v4('8.8.8.8')] }), null);
});
