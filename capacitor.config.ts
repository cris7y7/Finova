import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.novyra.app',
  appName: 'NOVYRA',
  webDir: 'www/app',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_novyra',
      iconColor: '#1ea84e'
    }
  }
};

export default config;