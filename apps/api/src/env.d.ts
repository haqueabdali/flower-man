// Environment variables read by the API and its CLIs (ADR-002: declared here, read with dot notation).
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly NODE_ENV?: string;
      readonly HOST?: string;
      readonly PORT?: string;
      readonly CORS_ORIGINS?: string;
      readonly TRUST_PROXY?: string;
      readonly APP_VERSION?: string;
      readonly DATABASE_URL?: string;
      readonly DATABASE_SSL?: string;
      readonly AUTH_ACCESS_TOKEN_SECRET?: string;
    }
  }
}

export {};
