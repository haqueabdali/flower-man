import type { ConfigContext, ExpoConfig } from 'expo/config';

// Values come from the environment (EAS build profiles or a local .env). Never invent EAS project IDs:
// run `npx eas-cli init` once in this folder and put the generated ID in EXPO_PUBLIC_EAS_PROJECT_ID.
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
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
    ...(projectId ? { eas: { projectId } } : {}),
  },
  ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` }, runtimeVersion: { policy: 'appVersion' } } : {}),
});
