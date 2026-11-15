import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase-client';

const tokenStorageKey = (userId: string) => `@artisant/expo-push-token/${userId}`;

export async function hasRegisteredPushToken(userId: string) {
  return Boolean(await AsyncStorage.getItem(tokenStorageKey(userId)));
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerPushToken(userId: string) {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return { granted: false, canAskAgain: false };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1877F2',
      sound: 'default',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    return { granted: false, canAskAgain: permission.canAskAgain };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Identifiant de projet Expo introuvable.');

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { data, error } = await supabase
    .from('push_devices')
    .upsert({
      user_id: userId,
      expo_push_token: token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,expo_push_token' })
    .select('user_id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Le jeton push n’a pas été enregistré pour cet appareil.');
  await AsyncStorage.setItem(tokenStorageKey(userId), token);
  return { granted: true, canAskAgain: permission.canAskAgain };
}

export async function unregisterPushToken(userId: string) {
  const token = await AsyncStorage.getItem(tokenStorageKey(userId));
  if (!token) return;

  const { error } = await supabase
    .from('push_devices')
    .delete()
    .eq('user_id', userId)
    .eq('expo_push_token', token);

  if (error) throw error;
  await AsyncStorage.removeItem(tokenStorageKey(userId));
}
