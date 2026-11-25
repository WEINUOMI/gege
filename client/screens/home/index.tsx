import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Image, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import RNSSE from 'react-native-sse';
import dayjs from 'dayjs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { COLORS } from '@/components/ui';
import { useFocusEffect } from 'expo-router';
import { useUser } from '@/contexts/UserContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { apiGet, apiPost, API, uploadProof, uploadProofBase64 } from '@/utils/api';
import { RichText } from '@/components/RichText';

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
  const [uploadingImg, setUploadingImg] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
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

  /**
   * 发送图片/视频给暖暖。
   * 原来只有一个入口且直接调 launchImageLibraryAsync（相册），
   * 菜单上却写“拍照/从相册选择”——文案与行为不符，拍不了也录不了。
   * 这里按微信的做法拆成三个独立入口：拍照、拍视频、相册（相册可同时选图和视频）。
   */
  const sendChatMedia = async (source: 'camera-photo' | 'camera-video' | 'library') => {
    setQuickOpen(false);
    if (!userId || uploadingImg) return;

    // 网页端没有原生相机接口，拍照/拍视频统一退回相册（可取消退出）
    const effective = Platform.OS === 'web' && source !== 'library' ? 'library' : source;

    if (Platform.OS !== 'web') {
      if (effective === 'library') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('暖暖提醒', '需要相册权限，才能从相册选照片和视频哦'); return; }
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('暖暖提醒', '需要相机权限才能拍摄哦，可以在手机设置里开启'); return; }
      }
    }

    try {
      setUploadingImg(true);
      let res: ImagePicker.ImagePickerResult;
      if (effective === 'camera-photo') {
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.5, base64: true });
      } else if (effective === 'camera-video') {
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 10, quality: 0.5 });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsEditing: false, quality: 0.5, base64: true });
      }
      if (res.canceled || !res.assets?.length) return;

      const asset = res.assets[0];
      const mime = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const isVideo = mime.startsWith('video/');

      // 体积/时长前置校验：不先拦，等传到一半被网关断开，用户只看到一句“网络错误”
      if (isVideo) {
        if (asset.duration && asset.duration > 35000) {
          Alert.alert('视频太长', '聊天里的视频请控制在 30 秒内，长视频建议发到打卡凭证里'); return;
        }
        if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) {
          Alert.alert('视频太大', '请裁短一些，或换用相册里的短视频'); return;
        }
      } else if (asset.fileSize && asset.fileSize > 12 * 1024 * 1024) {
        Alert.alert('图片太大', '请换一张小一些的图片'); return;
      }

      const fileName = isVideo ? 'chat.mp4' : 'chat.jpg';
      let up: any = null;
      // 图片优先走 base64 + JSON 通道（绕开 multipart 在部分网关被中断）；
      // 视频体积大、base64 还会再膨胀 33%，只能走表单通道。
      if (!isVideo && asset.base64) {
        try { up = await uploadProofBase64(asset.base64, mime, fileName); } catch { up = null; }
      }
      if (!up?.key) up = await uploadProof(asset.uri, mime, fileName);

      await apiPost(`/api/v1/chat/${userId}/messages`, {
        role: 'user',
        content: up.url,
        messageType: isVideo ? 'video' : 'image',
      });
      await loadMessages();
    } catch (e: any) {
      Alert.alert('发送失败', e?.message || '请重试');
    } finally {
      setUploadingImg(false);
    }
  };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        {/* Header */}
        <View className="px-4 pb-3 flex-row items-center justify-between border-b border-outline-variant" style={{ paddingTop: insets.top + 8 }}>
          <View className="flex-row items-center gap-2">
            <View className="w-10 h-10 rounded-full bg-primary-container items-center justify-center">
              <MaterialCommunityIcons name="heart" size={20} color={COLORS.primary} />
            </View>
            <Text className="text-xl font-bold text-ink">暖暖 · 陪跑</Text>
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
              <Text className="text-ink-mute text-xs">今天完成</Text>
              <View className="flex-row items-end gap-1.5 mt-0.5">
                <Text className="text-primary text-3xl font-bold">{stats.done}</Text>
                <Text className="text-ink-mute text-sm mb-1.5">/ {stats.total} 项</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="text-primary text-lg font-bold">{percent}%</Text>
              <Text className="text-ink-mute text-[11px]">{stats.goals} 个目标在推进</Text>
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
                <Text className="text-ink text-[11px] font-semibold mt-1">{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 今日待办：默认收成一行摘要，点击展开全部（不截断），避免挤占聊天区 */}
        {pending.length > 0 && (
          <View className="mx-4 mt-3 bg-surface rounded-3xl shadow-card border border-outline-variant overflow-hidden">
            <TouchableOpacity className="flex-row items-center px-4 py-3" onPress={() => setPendingOpen((v) => !v)}>
              <MaterialCommunityIcons name="calendar-check" size={18} color={COLORS.primary} />
              <Text className="text-ink font-bold ml-2">今日还有 {pending.length} 项没做</Text>
              <MaterialCommunityIcons name={pendingOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.onSurfaceVariant} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            {pendingOpen && (
              <View className="gap-2 px-4 pb-4">
                {pending.map((r) => (
                  <TouchableOpacity key={r.id} className="flex-row items-center gap-2 bg-surface-container rounded-2xl px-3 py-2.5" onPress={() => router.push('/goal-detail', { id: r.goalId })}>
                    <MaterialCommunityIcons name={(CATEGORY_ICON[r.category] || 'calendar-check') as any} size={16} color={COLORS.onSurfaceVariant} />
                    <Text className="flex-1 text-ink text-sm" numberOfLines={1}>{r.title}</Text>
                    <Text className="text-ink-mute text-xs">{r.time}</Text>
                    <View className="bg-primary px-3 py-1 rounded-full"><Text className="text-white text-xs font-bold">去打卡</Text></View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
                  {m.role === 'user' ? (
                    m.message_type === 'video' ? (
                      <Video
                        source={{ uri: m.content }}
                        style={{ width: 180, height: 240, borderRadius: 12, backgroundColor: '#000' }}
                        useNativeControls
                        resizeMode={ResizeMode.COVER}
                        isLooping={false}
                      />
                    ) : m.message_type === 'image' ? (
                      <Image source={{ uri: m.content }} style={{ width: 180, height: 180, borderRadius: 12 }} resizeMode="cover" />
                    ) : (
                      <Text className="text-white leading-5">{m.content}</Text>
                    )
                  ) : (
                    <RichText content={m.content} color="#2F2A24" muted="#6B6259" size={15} />
                  )}
                  <Text className={`text-[11px] mt-1 ${m.role === 'user' ? 'text-white/70' : 'text-ink-mute'}`}>{dayjs(m.created_at).format('HH:mm')}</Text>
                </View>
              </View>
            ))}
            {uploadingImg && (
              <View className="flex-row justify-end">
                <View className="bg-primary/70 rounded-3xl rounded-br-sm px-4 py-3 flex-row items-center gap-2">
                  <ActivityIndicator color="#fff" size="small" />
                  <Text className="text-white text-sm">发送中…</Text>
                </View>
              </View>
            )}
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
              className="flex-1 rounded-3xl bg-surface-container px-4 text-ink text-base"
              style={{ minHeight: 40, maxHeight: 120, paddingTop: 10, paddingBottom: 10, textAlignVertical: Platform.OS === 'android' ? 'top' : 'center' }}
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
            <Text className="text-ink font-bold text-center">添加点什么？</Text>
            <View className="flex-row mt-5">
              {([
                { key: 'photo', label: '拍照', icon: 'camera-outline', color: '#B88466', onPress: () => sendChatMedia('camera-photo') },
                { key: 'video', label: '拍视频', icon: 'video-outline', color: '#D99A3D', onPress: () => sendChatMedia('camera-video') },
                { key: 'library', label: '相册', icon: 'image-multiple-outline', color: '#8FA68E', onPress: () => sendChatMedia('library') },
                { key: 'goal-setup', label: '新目标', icon: 'target', color: '#6FA05C', onPress: () => { setQuickOpen(false); router.push('/goal-setup' as any); } },
              ] as any[]).map((s: any) => (
                <TouchableOpacity key={s.key} className="flex-1 items-center" activeOpacity={0.7} onPress={s.onPress}>
                  <View
                    className="w-14 h-14 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: s.color + '1A', borderWidth: 1, borderColor: s.color + '33' }}
                  >
                    <MaterialCommunityIcons name={s.icon} size={24} color={s.color} />
                  </View>
                  <Text className="text-ink text-xs mt-2">{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-ink-faint text-[11px] text-center mt-4">拍照、拍视频需在 App 内使用；相册可选图片或视频</Text>
            <TouchableOpacity className="h-11 items-center justify-center mt-1" onPress={() => setQuickOpen(false)}>
              <Text className="text-ink-mute text-sm">取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}
