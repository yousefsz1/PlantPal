import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/theme';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // Load session once on mount, then subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Redirect based on auth state once we know the session
  useEffect(() => {
    if (!initialized) return;

    const inTabs = segments[0] === '(tabs)';
    const onAuth = segments[0] === 'auth';

    if (!session && !onAuth) {
      router.replace('/auth');
    } else if (session && !inTabs) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments]);

  // Splash while determining session — prevents flashing the wrong screen
  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}
