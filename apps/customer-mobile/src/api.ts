import { createApiClient, type SessionStore, type StoredSession } from '@flower-man/api-client';
import * as SecureStore from 'expo-secure-store';

const KEY = 'flowerman.customer.session';

/** Tokens live in the OS keychain/keystore (expo-secure-store), never in plain storage. */
const secureStore: SessionStore = {
  async load() {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  },
  async save(session) {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  },
  async clear() {
    await SecureStore.deleteItemAsync(KEY);
  },
};

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
export const api = createApiClient(API_URL, secureStore);

/** Bergamo city centre: used when location permission is denied. */
export const DEFAULT_LOCATION = { latitude: 45.6949, longitude: 9.6699 };
