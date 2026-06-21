import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.koushik.cattracker',
  appName: 'CAT 2026 Tracker',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
