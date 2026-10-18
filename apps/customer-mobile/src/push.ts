import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Registers this device for push. Remote push needs a development/release build with an EAS project ID
 * (it is not available in Expo Go); without one, the in-app inbox still works.
 */
export async function registerForPush(app: 'customer' | 'partner'): Promise<void> {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? (Constants.expoConfig?.extra?.['eas'] as { projectId?: string } | undefined)?.projectId;
  if (!Device.isDevice || !projectId) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Flower Man', importance: Notifications.AndroidImportance.HIGH });
  }
  const existing = await Notifications.getPermissionsAsync();
  const status = existing.status === 'granted' ? existing.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.request('me/push-tokens', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', app } });
}
