import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { AppBoundary } from '@/components/AppBoundary';
import { mountGlobalErrorReporters } from '@/utils/diag';

import '../global.css';

// 仅 Web：挂载全局错误捕获，便于在后台查看前端闪退根因
mountGlobalErrorReporters();

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppBoundary>
        <Provider>
          <Stack
        screenOptions={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          headerShown: false,
          contentStyle: { backgroundColor: '#F4EFE6' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ title: "" }} />
        <Stack.Screen name="onboarding" options={{ title: "", animation: 'fade' }} />
        <Stack.Screen name="goal-setup" options={{ title: "" }} />
        <Stack.Screen name="goal-detail" options={{ title: "" }} />
        <Stack.Screen name="body-records" options={{ title: "" }} />
        <Stack.Screen name="rewards" options={{ title: "" }} />
        <Stack.Screen name="friends" options={{ title: "" }} />
        <Stack.Screen name="diet" options={{ title: "" }} />
        <Stack.Screen name="exercise" options={{ title: "" }} />
        </Stack>
        <StatusBar style="dark" />
        <Toast />
        </Provider>
      </AppBoundary>
    </SafeAreaProvider>
  );
}