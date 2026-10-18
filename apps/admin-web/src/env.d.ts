declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly NODE_ENV?: string;
      /** Server-only: base URL of the Flower Man API (no trailing slash), e.g. http://127.0.0.1:4000 */
      readonly ADMIN_API_URL?: string;
    }
  }
}

export {};
