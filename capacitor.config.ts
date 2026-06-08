import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.splove.app',
  appName: 'SPLove',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    /** WKWebView origin; OAuth must not redirect here — use splove://auth/callback deep link. */
    iosScheme: 'https',
    /** Pas de live-reload localhost — évite CORS / cleartext en prod iOS. */
    // url: undefined,
    cleartext: false,
  },
  plugins: {
    /**
     * Passe fetch/XHR par le client HTTP natif (iOS/Android).
     * Sans cela, les requêtes vers Supabase depuis https://localhost échouent (CORS, status 0).
     */
    CapacitorHttp: {
      enabled: true,
    },
    /** Masquage manuel dès le premier paint React (loader cœur + orbite). */
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#0B0B0F',
      showSpinner: false,
    },
  },
};

export default config;
