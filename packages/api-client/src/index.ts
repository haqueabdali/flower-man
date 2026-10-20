/**
 * @flower-man/api-client
 *
 * Typed client for the Flower Man REST API, shared by the customer and partner apps.
 * Platform-neutral: token storage is injected (expo-secure-store on mobile).
 */
import {
  API_GLOBAL_PREFIX,
  API_VERSION,
  type ApiErrorResponse,
  type AuthTokensResponse,
  type AuthUser,
} from '@flower-man/contracts';

export interface StoredSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: AuthUser;
}

export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  /** Raw binary body (e.g. a proof photo) with its content type. */
  readonly binary?: { readonly data: Blob | ArrayBuffer; readonly contentType: string };
  readonly headers?: Record<string, string>;
  /** Public endpoints do not need (or send) a token. */
  readonly auth?: boolean;
}

export interface ApiClient {
  readonly baseUrl: string;
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  signIn(email: string, password: string): Promise<AuthUser>;
  register(input: { email: string; password: string; fullName: string; phone?: string }): Promise<AuthUser>;
  signOut(): Promise<void>;
  currentUser(): Promise<AuthUser | null>;
  /** Reloads the user (capabilities, emailVerified) from the API and stores it. */
  refreshUser(): Promise<AuthUser | null>;
  accessToken(): Promise<string | null>;
  onSignedOut(listener: () => void): () => void;
}

export function createApiClient(apiUrl: string, store: SessionStore): ApiClient {
  const baseUrl = `${apiUrl.replace(/\/$/, '')}/${API_GLOBAL_PREFIX}/${API_VERSION}`;
  const listeners = new Set<() => void>();
  let refreshing: Promise<StoredSession | null> | null = null;

  const signedOut = async () => {
    await store.clear();
    listeners.forEach((listener) => listener());
  };

  const saveTokens = async (tokens: AuthTokensResponse): Promise<StoredSession> => {
    const session = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: tokens.user };
    await store.save(session);
    return session;
  };

  /** One refresh at a time: refresh tokens are single use, so parallel refreshes would revoke the session. */
  const refresh = (): Promise<StoredSession | null> => {
    refreshing ??= (async () => {
      const current = await store.load();
      if (!current) return null;
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) {
        await signedOut();
        return null;
      }
      return saveTokens((await response.json()) as AuthTokensResponse);
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (options.binary) {
      headers['Content-Type'] = options.binary.contentType;
      body = options.binary.data;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    return fetch(`${baseUrl}/${path.replace(/^\//, '')}`, { method: options.method ?? 'GET', headers, ...(body === undefined ? {} : { body }) });
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const useAuth = options.auth !== false;
    let session = useAuth ? await store.load() : null;
    let response = await send(path, options, session?.accessToken ?? null);
    if (response.status === 401 && useAuth && session) {
      session = await refresh();
      if (session) response = await send(path, options, session.accessToken);
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiError(response.status, error?.error.code ?? 'UNKNOWN', error?.error.message ?? `Request failed (${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    baseUrl,
    request,
    async signIn(email, password) {
      const tokens = await request<AuthTokensResponse>('auth/login', { method: 'POST', body: { email, password }, auth: false });
      return (await saveTokens(tokens)).user;
    },
    async register(input) {
      const tokens = await request<AuthTokensResponse>('auth/register', { method: 'POST', body: input, auth: false });
      return (await saveTokens(tokens)).user;
    },
    async signOut() {
      await request('auth/logout', { method: 'POST' }).catch(() => undefined);
      await signedOut();
    },
    async currentUser() {
      return (await store.load())?.user ?? null;
    },
    async refreshUser() {
      const current = await store.load();
      if (!current) return null;
      const { user } = await request<{ user: AuthUser }>('auth/me');
      const latest = (await store.load()) ?? current;
      await store.save({ ...latest, user });
      return user;
    },
    async accessToken() {
      return (await store.load())?.accessToken ?? null;
    },
    onSignedOut(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** €12,50 for 1250 (Italian formatting). */
export const formatPrice = (minor: number): string => `€${(minor / 100).toFixed(2).replace('.', ',')}`;

/** Where to load a product photo from: the uploaded photo (served by the API) or an external https image. */
export function productImageUri(client: Pick<ApiClient, 'baseUrl'>, product: { readonly imagePath: string | null; readonly imageUrl: string | null }): string | null {
  return product.imagePath ? `${client.baseUrl}/${product.imagePath}` : product.imageUrl;
}
