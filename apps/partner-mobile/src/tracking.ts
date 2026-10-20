import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { api } from './api';
import { t } from './i18n';

/**
 * Background GPS for ACTIVE deliveries only. The courier's position is never recorded when there is no
 * assigned delivery: tracking starts on accept/pickup and stops as soon as the delivery is completed.
 */
export const LOCATION_TASK = 'flowerman-delivery-location';
const ACTIVE_DELIVERY_KEY = 'flowerman.partner.activeDelivery';

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations.length) return;
  const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY);
  if (!deliveryId) {
    await stopTracking();
    return;
  }
  const points = data.locations.slice(-100).map((location) => ({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    ...(location.coords.accuracy !== null ? { accuracyMeters: Math.min(location.coords.accuracy, 10_000) } : {}),
    recordedAt: new Date(location.timestamp).toISOString(),
  }));
  try {
    await api.request(`courier/deliveries/${deliveryId}/locations`, { method: 'POST', body: { points } });
  } catch (caught) {
    // 409 = the delivery is no longer active (completed or cancelled): stop tracking.
    if ((caught as { status?: number }).status === 409 || (caught as { status?: number }).status === 404) await stopTracking();
  }
});

/** Asks for permissions and starts tracking for this delivery. Returns false if the courier refused location. */
export async function startTracking(deliveryId: string): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  await SecureStore.setItemAsync(ACTIVE_DELIVERY_KEY, deliveryId);
  const background = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
  if (background.status === 'granted') {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10_000,
      distanceInterval: 20,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: t('trackingTitle'),
        notificationBody: t('trackingBody'),
        notificationColor: '#b5446e',
      },
    });
  }
  return true;
}

export async function stopTracking(): Promise<void> {
  await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

/** Foreground fallback (e.g. background permission refused, or development in Expo Go): one point now. */
export async function sendCurrentPosition(deliveryId: string): Promise<void> {
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  await api.request(`courier/deliveries/${deliveryId}/locations`, {
    method: 'POST',
    body: {
      points: [
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          ...(position.coords.accuracy !== null ? { accuracyMeters: position.coords.accuracy } : {}),
          recordedAt: new Date(position.timestamp).toISOString(),
        },
      ],
    },
  });
}
