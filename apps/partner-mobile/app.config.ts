import type { ConfigContext, ExpoConfig } from 'expo/config';

// Never invent EAS project IDs: run `npx eas-cli init` in this folder and set EXPO_PUBLIC_EAS_PROJECT_ID.
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Flower Man Partner',
  slug: 'flower-man-partner',
  scheme: 'flowermanpartner',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'it.flowerman.partner',
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ['location'],
      NSLocationWhenInUseUsageDescription: 'Flower Man Partner shares your position with the customer while you deliver an order.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'During an active delivery, Flower Man Partner keeps sharing your position with the customer even when the app is in the background. Tracking stops when the delivery ends.',
      NSCameraUsageDescription: 'Flower Man Partner uses the camera to photograph the delivered flowers as proof of delivery.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'it.flowerman.partner',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'CAMERA'],
  },
  plugins: [
    'expo-status-bar',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: 'During an active delivery, Flower Man Partner shares your position with the customer, also in the background.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    ['expo-image-picker', { cameraPermission: 'Flower Man Partner uses the camera for proof of delivery photos.', photosPermission: false }],
    ['expo-notifications', { color: '#b5446e' }],
  ],
  extra: {
    ...(projectId ? { eas: { projectId } } : {}),
  },
  ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` }, runtimeVersion: { policy: 'appVersion' } } : {}),
});
