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
      readonly MAIL_TRANSPORT?: string;
      readonly MAIL_FROM?: string;
      readonly SMTP_URL?: string;
      readonly EMAIL_LINK_BASE_URL?: string;
      readonly PLATFORM_COMMISSION_BPS?: string;
      readonly UNPAID_ORDER_TTL_MINUTES?: string;
      readonly CUSTOM_REQUEST_TTL_HOURS?: string;
      readonly PAYMENT_PROVIDER?: string;
      readonly STRIPE_SECRET_KEY?: string;
      readonly STRIPE_WEBHOOK_SECRET?: string;
      readonly PUSH_ENABLED?: string;
      readonly EXPO_ACCESS_TOKEN?: string;
      readonly STORAGE_DRIVER?: string;
      readonly STORAGE_LOCAL_DIR?: string;
      readonly PLATFORM_OWNER_EMAIL?: string;
      readonly PLATFORM_OWNER_PASSWORD?: string;
      readonly PLATFORM_OWNER_NAME?: string;
      readonly PLATFORM_OWNER_RESET_PASSWORD?: string;
    }
  }
}

export {};
