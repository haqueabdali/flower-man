// Environment variables read by the API and its CLIs (ADR-002: declared here, read with dot notation).
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly NODE_ENV?: string;
      readonly DATABASE_URL?: string;
      readonly DATABASE_SSL?: string;
    }
  }
}

export {};
