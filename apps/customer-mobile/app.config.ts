import type { ConfigContext, ExpoConfig } from 'expo/config';

// EAS project @flower-man/flower-man-customer, created with `npx eas-cli init` (not a secret).
// EXPO_PUBLIC_EAS_PROJECT_ID overrides it, e.g. for a staging project.
const EAS_OWNER = 'flower-man';
const EAS_PROJECT_ID = '14adb6fa-ed19-4fa3-a582-a659a7429365';
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: EAS_OWNER,
  name: 'Flower Man',
  slug: 'flower-man-customer',
  scheme: 'flowerman',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'it.flowerman.customer',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Flower Man uses your location to show florists that deliver to you and to fill in the delivery address.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'it.flowerman.customer',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    blockedPermissions: ['ACCESS_BACKGROUND_LOCATION'],
  },
  plugins: [
    'expo-status-bar',
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: 'Flower Man uses your location to show florists that deliver to you.' }],
    ['expo-notifications', { color: '#b5446e' }],
    ['@stripe/stripe-react-native', { merchantIdentifier: process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID ?? 'merchant.it.flowerman', enableGooglePay: true }],
  ],
  extra: {
    eas: { projectId },
  },
  updates: { url: `https://u.expo.dev/${projectId}` },
  runtimeVersion: { policy: 'appVersion' },
});
