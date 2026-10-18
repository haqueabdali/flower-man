// Public build-time configuration (inlined by Expo; never put secrets in EXPO_PUBLIC_*).
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly EXPO_PUBLIC_API_URL?: string;
      readonly EXPO_PUBLIC_EAS_PROJECT_ID?: string;
      readonly EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
      readonly EXPO_PUBLIC_STRIPE_MERCHANT_ID?: string;
      readonly EXPO_PUBLIC_PRIVACY_POLICY_URL?: string;
      readonly EXPO_PUBLIC_TERMS_OF_SERVICE_URL?: string;
    }
  }
}

export {};
