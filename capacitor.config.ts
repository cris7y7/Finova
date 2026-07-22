import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.finova.app',
  appName: 'FINOVA',
  webDir: 'www/app',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_finova',
      iconColor: '#1ea84e'
    }
  }
};

export default config;