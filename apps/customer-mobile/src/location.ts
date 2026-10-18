import * as Location from 'expo-location';

import { DEFAULT_LOCATION } from './api';

/** Foreground location only (the customer app never tracks in the background). */
export async function currentLocation(): Promise<{ latitude: number; longitude: number; precise: boolean }> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { ...DEFAULT_LOCATION, precise: false };
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude, precise: true };
  } catch {
    return { ...DEFAULT_LOCATION, precise: false };
  }
}
