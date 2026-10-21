import { useEffect, useState } from 'react';
import { Image } from 'react-native';

import { api } from './api';

/** An image from a private API endpoint (path relative to the API base), loaded with the signed-in token. */
export function AuthImage({ path, height, label }: { path: string; height: number; label: string }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void api.accessToken().then(setToken);
  }, [path]);
  if (!token) return null;
  return (
    <Image
      source={{ uri: `${api.baseUrl}/${path}`, headers: { Authorization: `Bearer ${token}` } }}
      style={{ height, borderRadius: 8 }}
      resizeMode="cover"
      accessibilityLabel={label}
    />
  );
}
