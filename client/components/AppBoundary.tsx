import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

/**
 * 顶层错误边界：页面渲染崩溃时给出友好中文提示与重试，避免出现"白屏/空白"。
 */
export class AppBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[AppBoundary]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EFE6', padding: 32 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: '#2F2A24' }}>哎呀，页面遇到了一点小状况</Text>
          <Text style={{ marginTop: 8, color: '#7D746B', textAlign: 'center', fontSize: 14, lineHeight: 22 }}>
            暖暖正在努力修复，请点下面重试，或回到首页继续暖暖的陪伴
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={{ marginTop: 24, backgroundColor: '#8FA68E', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 999 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>刷新重试</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}