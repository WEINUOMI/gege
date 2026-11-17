import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
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

const SHORTCUTS = [
  { key: 'diet', label: '记一餐', icon: 'silverware-fork-knife', color: '#B88466', desc: '菜谱 · 热量' },
  { key: 'exercise', label: '动一动', icon: 'run', color: '#8FA68E', desc: '跟练 · 消耗' },
  { key: 'study', label: '学一会', icon: 'book-open-page-variant', color: '#D99A3D', desc: '计划 · 打卡' },
  { key: 'friends', label: '看看大家', icon: 'account-group-outline', color: '#6FA05C', desc: '监督团' },
];

export default function HomeScreen() {
  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const { userId, hasProfile, loading } = useUser();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reminders, setReminders] = useState<Rm[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState({ done: 0, total: 0, goals: 0 });
  const [quickOpen, setQuickOpen] = useState(false);
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

  const loadStats = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await apiGet<any>(`/api/v1/goals?userId=${userId}&status=active`);
      const list = r.goals || [];
      const s = r.stats || {};
      let done = 0;
      let total = 0;
      list.forEach((g: any) => {
        const v = s[g.id];
        if (v) { done += v.todayDone || 0; total += v.todayTotal || 0; }
      });
      setStats({ done, total, goals: list.length });
    } catch { void 0; }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
      loadReminders();
      loadStats();
    }, [loadMessages, loadReminders, loadStats])
  );

  useEffect(() => () => { sseRef.current?.close(); }, []);

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
          if (content) {
            acc += content;
            setMessages((m) => {
              const arr = [...m];
              const last = arr[arr.length - 1];
              if (last && last.id === -1) { arr[arr.length - 1] = { ...last, content: acc }; }
              else arr.push({ id: -1, role: 'assistant', content: acc, message_type: 'text', created_at: new Date().toISOString() });
              return arr;
            });
          }
        } catch { void 0; }
      });
      sse.addEventListener('error', () => { sse.close(); setSending(false); loadMessages(); });
      sse.addEventListener('close', () => { setSending(false); loadMessages(); });
    } catch {
      setSending(false);
    }
  };

  const pending = reminders.filter((r) => !r.done);
  const percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

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
          <TouchableOpacity
            className="w-10 h-10 rounded-full bg-surface items-center justify-center shadow-card"
            onPress={() => router.push('/rewards')}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color={COLORS.onSurface} />
            {pending.length > 0 && (
              <View className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ backgroundColor: '#C4554D' }} />
            )}
          </TouchableOpacity>
        </View>

        {/* 今日总进度 */}
        <View className="mx-4 mt-3 bg-surface rounded-3xl p-4 shadow-card border border-outline-variant">
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="text-on-surface-variant text-xs">今天完成</Text>
              <View className="flex-row items-end gap-1.5 mt-0.5">
                <Text className="text-primary text-3xl font-bold">{stats.done}</Text>
                <Text className="text-on-surface-variant text-sm mb-1.5">/ {stats.total} 项</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="text-primary text-lg font-bold">{percent}%</Text>
              <Text className="text-on-surface-variant text-[10px]">{stats.goals} 个目标在推进</Text>
            </View>
          </View>
          <View className="h-2 rounded-full bg-surface-container mt-2.5 overflow-hidden">
            <View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: COLORS.primary }} />
          </View>

          <View className="flex-row gap-2 mt-3">
            {SHORTCUTS.map((s) => (
              <TouchableOpacity
                key={s.key}
                className="flex-1 items-center py-2 rounded-2xl"
                style={{ backgroundColor: s.color + '18' }}
                onPress={() => router.push(`/${s.key}` as any)}
              >
                <MaterialCommunityIcons name={s.icon as any} size={19} color={s.color} />
                <Text className="text-on-surface text-[10px] font-semibold mt-1">{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 今日待办 */}
        {pending.length > 0 && (
          <View className="mx-4 mt-3 bg-surface rounded-3xl p-4 shadow-card border border-outline-variant">
            <View className="flex-row items-center gap-2 mb-2">
              <MaterialCommunityIcons name="calendar-check" size={18} color={COLORS.primary} />
              <Text className="text-on-surface font-bold">还没做的（{pending.length}）</Text>
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
            <TouchableOpacity className="w-10 h-10 rounded-full bg-surface-container items-center justify-center" onPress={() => setQuickOpen(true)}>
              <MaterialCommunityIcons name="plus" size={22} color={COLORS.primary} />
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

      {/* 快捷记录 */}
      <Modal visible={quickOpen} transparent animationType="fade" onRequestClose={() => setQuickOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/30 justify-end" activeOpacity={1} onPress={() => setQuickOpen(false)}>
          <View className="bg-surface rounded-t-3xl px-5 pt-5 pb-8" style={{ backgroundColor: COLORS.surface }}>
            <Text className="text-on-surface font-bold text-center">记点什么？</Text>
            <View className="flex-row flex-wrap gap-3 mt-4">
              {SHORTCUTS.concat([{ key: 'goal-setup', label: '设新目标', icon: 'target', color: '#8FA68E', desc: '目标设置' }] as any).map((s: any) => (
                <TouchableOpacity
                  key={s.key}
                  className="rounded-2xl p-4 border border-outline-variant"
                  style={{ width: '47%' }}
                  onPress={() => { setQuickOpen(false); router.push(`/${s.key}` as any); }}
                >
                  <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: s.color + '22' }}>
                    <MaterialCommunityIcons name={s.icon} size={18} color={s.color} />
                  </View>
                  <Text className="text-on-surface font-semibold text-sm mt-2">{s.label}</Text>
                  <Text className="text-on-surface-variant text-[10px] mt-0.5">{s.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity className="h-11 items-center justify-center mt-2" onPress={() => setQuickOpen(false)}>
              <Text className="text-on-surface-variant text-sm">取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}
