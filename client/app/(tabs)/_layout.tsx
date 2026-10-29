import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [background, muted, accent, border] = useCSSVariable([
    '--color-background',
    '--color-on-surface-variant',
    '--color-primary',
    '--color-outline',
  ]) as string[];

  let tabBarStyle: any = {
    backgroundColor: background,
    borderTopWidth: 1,
    borderTopColor: border,
    height: 62 + insets.bottom,
    paddingBottom: insets.bottom,
    paddingTop: 6,
  };

  if (Platform.OS === 'web') {
    tabBarStyle = { ...tabBarStyle, height: 'auto' };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '暖心对话',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={(focused ? 'home-heart' : 'home-heart-outline') as any} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '健康管理',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={(focused ? 'shield-heart' : 'shield-heart-outline') as any} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}