import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RNSSE from 'react-native-sse';
import dayjs from 'dayjs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { COLORS } from '@/components/ui';
import { useFocusEffect } from 'expo-router';
import { useUser } from '@/contexts/UserContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { apiGet, API } from '@/utils/api';

interface Msg { id: number; role: string; content: string; message_type: string; created_at: string; }
interface Rm { goalId: number; goalTitle: string; id: number; title: string; category: string; time: string; done: boolean; }

const CATEGORY_ICON: Record<string, string> = { diet: 'silverware-fork-knife', exercise: 'run', health: 'heart-pulse', study: 'book-open-page-variant', habit: 'clipboard-check-outline' };

export default function HomeScreen() {
  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const { userId, hasProfile, loading } = useUser();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reminders, setReminders] = useState<Rm[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sseRef = useRef<RNSSE | null>(null);

  useEffect(() => {
    if (!loading && !hasProfile) router.replace('/onboarding');
  }, [loading, hasProfile]);

  const loadMessages = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiGet(`/api/v1/chat/${userId}/messages`);
      setMessages(res.messages || []);
      if (!res.messages?.length) {
        await apiGet(`/api/v1/chat/${userId}/greeting`);
        const again = await apiGet(`/api/v1/chat/${userId}/messages`);
        setMessages(again.messages || []);
      }
    } catch { void 0; }
  }, [userId]);

  const loadReminders = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiGet(`/api/v1/chat/${userId}/today-reminders`);
      setReminders(res.reminders || []);
    } catch { void 0; }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
      loadReminders();
    }, [loadMessages, loadReminders])
  );

  useEffect(() => {
    return () => { sseRef.current?.close(); };
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || !userId || sending) return;
    setInput('');
    setMessages((m) => [...m, { id: Date.now(), role: 'user', content: text, message_type: 'text', created_at: new Date().toISOString() }]);
    setSending(true);
    let acc = '';
    try {
      const sse = new RNSSE(`${API}/api/v1/chat/${userId}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      sseRef.current = sse;
      sse.addEventListener('message', (event: any) => {
        if (!event.data) return;
        if (event.data === '[DONE]') { sse.close(); return; }
        try {
          const { content } = JSON.parse(event.data);
          if (content) { acc += content; setMessages((m) => {
            const arr = [...m];
            const last = arr[arr.length - 1];
            if (last && last.id === -1) { arr[arr.length - 1] = { ...last, content: acc }; }
            else arr.push({ id: -1, role: 'assistant', content: acc, message_type: 'text', created_at: new Date().toISOString() });
            return arr;
          }); }
        } catch { void 0; }
      });
      sse.addEventListener('error', () => { sse.close(); setSending(false); loadMessages(); });
      sse.addEventListener('close', () => { setSending(false); loadMessages(); });
    } catch (e) {
      setSending(false);
    }
  };

  const pending = reminders.filter((r) => !r.done);

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View className="px-4 pb-3 flex-row items-center justify-between border-b border-outline-variant" style={{ paddingTop: insets.top + 8 }}>
          <View className="flex-row items-center gap-2">
            <View className="w-10 h-10 rounded-full bg-primary-container items-center justify-center">
              <MaterialCommunityIcons name="heart" size={20} color={COLORS.primary} />
            </View>
            <Text className="text-xl font-bold text-on-surface">暖暖 · 陪跑</Text>
          </View>
          <TouchableOpacity className="w-10 h-10 rounded-full bg-surface items-center justify-center shadow-card">
            <MaterialCommunityIcons name="bell-outline" size={20} color={COLORS.onSurface} />
          </TouchableOpacity>
        </View>

        {/* 今日提醒卡 */}
        {pending.length > 0 && (
          <View className="mx-4 mt-3 bg-surface rounded-3xl p-4 shadow-card border border-outline-variant">
            <View className="flex-row items-center gap-2 mb-2">
              <MaterialCommunityIcons name="calendar-check" size={18} color={COLORS.primary} />
              <Text className="text-on-surface font-bold">今日待办（{pending.length}）</Text>
            </View>
            <View className="gap-2">
              {pending.slice(0, 4).map((r) => (
                <TouchableOpacity key={r.id} className="flex-row items-center gap-2 bg-surface-container rounded-2xl px-3 py-2.5" onPress={() => router.push('/goal-detail', { id: r.goalId })}>
                  <MaterialCommunityIcons name={(CATEGORY_ICON[r.category] || 'calendar-check') as any} size={16} color={COLORS.onSurfaceVariant} />
                  <Text className="flex-1 text-on-surface text-sm" numberOfLines={1}>{r.title}</Text>
                  <Text className="text-on-surface-variant text-xs">{r.time}</Text>
                  <View className="bg-primary px-3 py-1 rounded-full"><Text className="text-white text-xs font-bold">去打卡</Text></View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 消息区 */}
        <ScrollView ref={scrollRef} className="flex-1 px-4 py-3" onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          <View className="gap-3">
            {messages.map((m) => (
              <View key={m.id} className={`flex-row ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                {m.role !== 'user' && (
                  <View className="w-8 h-8 rounded-full bg-primary-container items-center justify-center">
                    <MaterialCommunityIcons name="heart" size={16} color={COLORS.primary} />
                  </View>
                )}
                <View className={`max-w-[78%] rounded-3xl px-4 py-2.5 ${m.role === 'user' ? 'bg-primary rounded-br-sm' : 'bg-surface rounded-bl-sm shadow-card'}`}>
                  <Text className={m.role === 'user' ? 'text-white leading-5' : 'text-on-surface leading-5'}>{m.content}</Text>
                  <Text className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-white/70' : 'text-on-surface-variant'}`}>{dayjs(m.created_at).format('HH:mm')}</Text>
                </View>
              </View>
            ))}
            {sending && (
              <View className="flex-row items-end gap-2">
                <View className="w-8 h-8 rounded-full bg-primary-container items-center justify-center"><MaterialCommunityIcons name="heart" size={16} color={COLORS.primary} /></View>
                <View className="bg-surface rounded-3xl rounded-bl-sm px-4 py-3"><ActivityIndicator color={COLORS.primary} /></View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* 输入区 */}
        <View className="px-4 pt-2 pb-2 border-t border-outline-variant" style={{ backgroundColor: COLORS.surface }}>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity className="w-10 h-10 rounded-full bg-surface-container items-center justify-center">
              <MaterialCommunityIcons name="camera-outline" size={20} color={COLORS.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity className="w-10 h-10 rounded-full bg-surface-container items-center justify-center">
              <MaterialCommunityIcons name="image-outline" size={20} color={COLORS.onSurfaceVariant} />
            </TouchableOpacity>
            <TextInput
              className="flex-1 rounded-3xl bg-surface-container px-4 py-2.5 text-on-surface text-base"
              placeholder="和暖暖聊聊今天的安排吧…"
              placeholderTextColor="#A99F92"
              value={input}
              onChangeText={setInput}
              multiline
              selectionColor={COLORS.primary}
            />
            <TouchableOpacity onPress={send} disabled={sending} className="w-10 h-10 rounded-full bg-primary items-center justify-center">
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}