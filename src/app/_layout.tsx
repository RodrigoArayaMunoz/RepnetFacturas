import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
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
    </>
  );
}
