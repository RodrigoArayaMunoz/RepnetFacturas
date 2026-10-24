import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { InvoiceProcessingProvider } from '@/context/invoice-processing-context';
import { manageMailSessionRefresh } from '@/services/supabase-client';

export default function RootLayout() {
  useEffect(manageMailSessionRefresh, []);

  return (
    <InvoiceProcessingProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="camera"
          options={{ animation: 'fade', gestureEnabled: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="processing"
          options={{ animation: 'slide_from_right', gestureEnabled: false }}
        />
        <Stack.Screen
          name="invoice-result"
          options={{ animation: 'slide_from_right', gestureEnabled: false }}
        />
        <Stack.Screen
          name="email-preview"
          options={{ animation: 'slide_from_right', gestureEnabled: false }}
        />
      </Stack>
    </InvoiceProcessingProvider>
  );
}
