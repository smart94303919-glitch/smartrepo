import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.benedict.smart',   // ← use a reverse-domain style ID
  appName: 'main',    // ← your app name
  webDir: 'www',
  bundledWebRuntime: false
};

export default config;
