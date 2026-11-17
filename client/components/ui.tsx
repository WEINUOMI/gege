import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';

export const COLORS = {
  bg: '#F4EFE6',
  surface: '#FFF9EF',
  surfaceContainer: '#ECE5D9',
  primary: '#8FA68E',
  onSurface: '#2F2A24',
  onSurfaceVariant: '#7D746B',
  secondary: '#B88466',
  outline: '#D8D0C1',
};

/** 二级页返回 Header（沉浸式） */
export function PageHeader({ title, right, onBack }: { title: string; right?: React.ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  return (
    <View style={{ paddingTop: insets.top + 8, backgroundColor: COLORS.bg }} className="px-4 pb-3 flex-row items-center justify-between border-b border-outline-variant">
      <TouchableOpacity
        onPress={onBack || (() => router.back())}
        className="w-11 h-11 rounded-2xl bg-surface items-center justify-center shadow-card"
        style={{ alignSelf: 'flex-start' }}
      >
        <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.onSurface} />
      </TouchableOpacity>
      <Text className="text-lg font-bold text-ink">{title}</Text>
      <View className="w-11 h-11 items-center justify-center">{right}</View>
    </View>
  );
}

export function PrimaryButton({ title, onPress, loading, disabled, style }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; style?: any }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`h-14 rounded-3xl items-center justify-center flex-row shadow-card ${disabled || loading ? 'opacity-40' : ''}`}
      style={[{ backgroundColor: COLORS.primary }, style]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-base font-bold">{title}</Text>}
    </TouchableOpacity>
  );
}

export function GhostButton({ title, onPress, style }: { title: string; onPress: () => void; style?: any }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="h-12 rounded-3xl items-center justify-center border border-outline-variant px-5"
      style={[{ backgroundColor: COLORS.surface }, style]}
    >
      <Text className="text-ink text-sm font-semibold">{title}</Text>
    </TouchableOpacity>
  );
}

/** 圆角无边框输入框 */
export function Field({ value, onChangeText, placeholder, multiline, keyboardType, suffix }: any) {
  return (
    <View className="flex-row items-center rounded-2xl px-4 py-3" style={{ backgroundColor: COLORS.surfaceContainer }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A99F92"
        multiline={multiline}
        keyboardType={keyboardType}
        className="flex-1 text-ink text-base"
        selectionColor={COLORS.primary}
      />
      {suffix ? <Text className="text-ink-mute ml-2">{suffix}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text className="text-ink text-base font-bold mb-3">{children}</Text>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-4 py-2 rounded-full border ${selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface'}`}
    >
      <Text className={`text-sm font-medium ${selected ? 'text-ink' : 'text-ink-mute'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: any }) {
  return (
    <View className={`bg-surface rounded-3xl p-4 shadow-card border border-outline-variant ${className}`} style={style}>
      {children}
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text className="text-ink-mute mt-3">暖暖正在准备中…</Text>
    </View>
  );
}

