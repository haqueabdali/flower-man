import { createApiClient, type SessionStore, type StoredSession } from '@flower-man/api-client';
import * as SecureStore from 'expo-secure-store';

const KEY = 'flowerman.partner.session';

export const secureStore: SessionStore = {
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
