import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.novira.app',
  appName: 'NOVIRA',
  webDir: 'www/app',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_novira',
      iconColor: '#1ea84e'
    }
  }
};

export default config;