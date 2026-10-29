import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from '@/components/Provider';
import { AppBoundary } from '@/components/AppBoundary';
import { mountGlobalErrorReporters, reportError } from '@/utils/diag';

import '../global.css';

// 仅 Web：在模块加载最早阶段挂载全局错误捕获，把前端闪退根因上报到 /api/v1/diag/log
mountGlobalErrorReporters();

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

// Web 端 react-native-screens 不支持原生堆栈转场动画，开启会让被导航到的屏幕渲染成空白，
// 因此在 Web 上关闭转场动画与手势，避免"闪一下然后空白"。
const isWeb = Platform.OS === 'web';

export default function RootLayout() {
  useEffect(() => {
    if (isWeb) reportError('info', 'app-mounted');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppBoundary>
          <Provider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#F4EFE6' },
                ...(isWeb
                  ? { animation: 'none', gestureEnabled: false }
                  : {
                      animation: 'slide_from_right',
                      gestureEnabled: true,
                      gestureDirection: 'horizontal',
                    }),
              }}
            >
              <Stack.Screen name="(tabs)" options={{ title: '' }} />
              <Stack.Screen name="onboarding" options={{ title: '' }} />
              <Stack.Screen name="goal-setup" options={{ title: '' }} />
              <Stack.Screen name="goal-detail" options={{ title: '' }} />
              <Stack.Screen name="body-records" options={{ title: '' }} />
              <Stack.Screen name="rewards" options={{ title: '' }} />
              <Stack.Screen name="friends" options={{ title: '' }} />
              <Stack.Screen name="diet" options={{ title: '' }} />
              <Stack.Screen name="exercise" options={{ title: '' }} />
            </Stack>
            <StatusBar style="dark" />
            <Toast />
          </Provider>
        </AppBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}