import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Image, TextInput, Alert, ActivityIndicator, Platform, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { apiGet, apiPost, uploadProof, uploadProofBase64 } from '@/utils/api';

interface Goal { id: number; title: string; target_value: string; category: string; status: string; daily_points: number; }
interface Item { id: number; title: string; category: string; planned_time: string; points: number; doneToday: boolean; }
interface Checkin { id: number; title: string; checkin_date: string; proof_url: string; points: number; proof_type: string; user_id: string; }

export default function GoalDetailScreen() {
  const router = useSafeRouter();
  const { id } = useSafeSearchParams<{ id: number }>();
  const { userId, user } = useUser();
  const insets = useSafeAreaInsets();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberStats, setMemberStats] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<any[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ckOpen, setCkOpen] = useState(false);
  const [current, setCurrent] = useState<Item | null>(null);
  const [uploading, setUploading] = useState(false);
  const [commentInput, setCommentInput] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const r = await apiGet<any>(`/api/v1/goals/${id}`);
    setGoal(r.goal); setItems(r.planItems || []); setCheckins(r.checkins || []);
    setMembers(r.members || []); setMemberStats(r.memberStats || {}); setComments(r.comments || []);
  }, [id]);

  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  const pickProof = async (item: Item) => {
    setCurrent(item); setCkOpen(false);
    if (Platform.OS === 'web') return pickAny(item);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('暖暖提醒', '需要相册权限才能上传打卡凭证哦'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.5, base64: true });
    if (res.canceled) return;
    await doCheckin(item, { base64: res.assets[0].base64, uri: res.assets[0].uri });
  };

  const takePhoto = async (item: Item) => {
    setCurrent(item); setCkOpen(false);
    if (Platform.OS === 'web') return pickAny(item);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('暖暖提醒', '需要相机权限才能拍摄打卡凭证哦'); return; }
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.5, base64: true });
    if (res.canceled) return;
    await doCheckin(item, { base64: res.assets[0].base64, uri: res.assets[0].uri });
  };

  // Web 端：相机权限不可用、launchCameraAsync 会卡死无法退出，统一回退到相册选择（可取消退出）
  const pickAny = async (item: Item) => {
    setCurrent(item); setCkOpen(false);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.5 });
      if (res.canceled) return;
      await doCheckin(item, { uri: res.assets[0].uri });
    } catch {
      Alert.alert('暖暖提醒', '未能打开选择器，请重试');
    }
  };

  /**
   * 凭证上传双通道：
   * 1) JSON 通道（base64）：绕开 multipart 解析链路，原生端优先走这条
   * 2) 表单通道（multipart）：Web 端与视频凭证使用
   * 两条都失败时把两个原因都抛出来，避免只看到笼统的 "Network request failed"
   */
  const uploadByAnyChannel = async (proof: { base64?: string | null; uri?: string; isVideo?: boolean }) => {
    const isVideo = !!proof.isVideo;
    const mime = isVideo ? 'video/mp4' : 'image/jpeg';
    const name = isVideo ? 'proof.mp4' : 'proof.jpg';
    const errors: string[] = [];
    if (proof.base64) {
      try {
        const r = await uploadProofBase64(proof.base64, mime, name);
        if (r?.key) return r;
        errors.push('图片通道未返回文件标识');
      } catch (e: any) {
        errors.push(`图片通道：${e?.message || '失败'}`);
      }
    }
    if (proof.uri) {
      try {
        const r = await uploadProof(proof.uri, mime, name);
        if (r?.key) return r;
        errors.push('表单通道未返回文件标识');
      } catch (e: any) {
        errors.push(`表单通道：${e?.message || '失败'}`);
      }
    }
    throw new Error(errors.join('；') || '凭证上传失败');
  };

  const doCheckin = async (item: Item, proof: { base64?: string | null; uri?: string; isVideo?: boolean }) => {
    if (!userId) return;
    setUploading(true);
    try {
      const up = await uploadByAnyChannel(proof);
      await apiPost(`/api/v1/goals/${id}/checkins`, {
        userId, title: item.title, planItemId: item.id, proofKey: up.key, proofType: proof.isVideo ? 'video' : 'image',
      });
      await load();
    } catch (e: any) {
      Alert.alert('打卡失败', e.message || '请重试');
    } finally {
      setUploading(false);
    }
  };

  // 视频凭证：直接从相册选一段视频上传
  const pickVideo = async () => {
    if (!current) return;
    setCkOpen(false);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.4, videoMaxDuration: 15 });
      if (res.canceled) return;
      await doCheckin(current, { uri: res.assets[0].uri, isVideo: true });
    } catch {
      Alert.alert('没能打开视频', '可以先改用照片凭证');
    }
  };

  // 拍一段短视频（原生支持；Web 端回退到相册）
  const recordVideo = async () => {
    if (!current) return;
    setCkOpen(false);
    if (Platform.OS === 'web') return pickVideo();
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('需要相机权限', '开启后就能拍视频凭证'); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 15, quality: 0.4 });
      if (res.canceled) return;
      await doCheckin(current, { uri: res.assets[0].uri, isVideo: true });
    } catch {
      Alert.alert('没能拍摄视频', '可以先改用照片凭证');
    }
  };

  const sendComment = async (checkinId: number) => {
    const content = commentInput.trim();
    if (!content || !userId) return;
    try {
      await apiPost('/api/v1/goals/comment', { checkinId, userId, content });
      setCommentInput('');
      await load();
    } catch { void 0; }
  };

  const goalDone = items.filter((i) => i.doneToday).length;
  const percent = items.length ? Math.round((goalDone / items.length) * 100) : 0;

  const CATEGORY_ICON: Record<string, string> = { diet: 'silverware-fork-knife', exercise: 'run', health: 'heart-pulse', study: 'book-open-page-variant', habit: 'clipboard-check-outline' };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="目标详情" right={
        <TouchableOpacity onPress={() => setMenuOpen(true)}><MaterialCommunityIcons name="dots-horizontal" size={22} color={COLORS.onSurface} /></TouchableOpacity>
      } />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
        {goal && (
          <>
            <View className="bg-surface rounded-3xl p-5 shadow-card border border-outline-variant my-4">
              <Text className="text-ink text-lg font-bold">{goal.title}</Text>
              <Text className="text-ink-mute text-sm mt-1">{goal.target_value || goal.category}</Text>
              <View className="flex-row items-center gap-3 mt-4">
                <View className="flex-1">
                  <View className="flex-row justify-between mb-1"><Text className="text-ink-mute text-xs">今日进度</Text><Text className="text-primary text-xs font-bold">{goalDone}/{items.length}</Text></View>
                  <View className="h-2.5 rounded-full bg-surface-container overflow-hidden"><View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: COLORS.primary }} /></View>
                </View>
                <Text className="text-primary text-2xl font-bold">{percent}%</Text>
              </View>
            </View>

            {/* 每日打卡计划 */}
            <Text className="text-ink font-bold mb-3">今日打卡计划</Text>
            <View className="gap-3 mb-6">
              {items.map((it) => (
                <View key={it.id} className="bg-surface rounded-3xl p-4 shadow-card border border-outline-variant flex-row items-center gap-3">
                  <View className={`w-11 h-11 rounded-2xl items-center justify-center ${it.doneToday ? 'bg-primary' : 'bg-primary-container'}`}>
                    <MaterialCommunityIcons name={it.doneToday ? 'check' : (CATEGORY_ICON[it.category] || 'checkbox-blank-circle-outline') as any} size={22} color={it.doneToday ? '#fff' : COLORS.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-ink font-semibold ${it.doneToday ? 'line-through text-ink-mute' : ''}`}>{it.title}</Text>
                    <Text className="text-ink-mute text-xs mt-0.5">{it.planned_time || '全天'} · +{it.points || 10}积分</Text>
                  </View>
                  {!it.doneToday && (
                    <TouchableOpacity className="bg-primary px-4 py-2 rounded-full" onPress={() => { setCurrent(it); setCkOpen(true); }}>
                      <Text className="text-white text-xs font-bold">去打卡</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            {/* 打卡记录 */}
            <Text className="text-ink font-bold mb-3">打卡记录</Text>
            {checkins.length ? (
              <View className="gap-3 mb-6">
                {checkins.map((c) => (
                  <View key={c.id} className="bg-surface rounded-3xl p-4 shadow-card border border-outline-variant">
                    <View className="flex-row items-center gap-3">
                      {c.proof_url && c.proof_type === 'video' ? (
                        <TouchableOpacity className="w-14 h-14 rounded-2xl bg-surface-container items-center justify-center" onPress={() => Linking.openURL(c.proof_url)}>
                          <MaterialCommunityIcons name="play-circle" size={28} color={COLORS.primary} />
                        </TouchableOpacity>
                      ) : c.proof_url ? (
                        <Image source={{ uri: c.proof_url }} className="w-14 h-14 rounded-2xl" />
                      ) : (
                        <View className="w-14 h-14 rounded-2xl bg-surface-container items-center justify-center"><MaterialCommunityIcons name="image-outline" size={20} color={COLORS.onSurfaceVariant} /></View>
                      )}
                      <View className="flex-1">
                        <Text className="text-ink font-semibold">{c.title}</Text>
                        <Text className="text-ink-mute text-xs mt-0.5">{c.user_id === String(user?.id) ? '我' : '监督同伴'} · {new Date(c.checkin_date).toLocaleDateString()}</Text>
                      </View>
                      <View className="bg-primary-container px-3 py-1 rounded-full"><Text className="text-primary text-xs font-bold">+{c.points || 0}</Text></View>
                    </View>
                    {/* 留言 */}
                    {c.id && comments.filter((cm) => cm.checkin_id === c.id).length > 0 && (
                      <View className="mt-3 gap-2">
                        {comments.filter((cm) => cm.checkin_id === c.id).map((cm) => (
                          <View key={cm.id} className="bg-surface-container rounded-2xl px-3 py-2">
                            <Text className="text-ink-mute text-xs">暖暖的拍拍</Text>
                            <Text className="text-ink text-sm mt-0.5">{cm.content}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View className="flex-row items-center gap-2 mt-3">
                      <TextInput value={commentInput} onChangeText={setCommentInput} placeholder="给同伴留句话鼓励一下…" placeholderTextColor="#A99F92" className="flex-1 bg-surface-container rounded-full px-4 py-2 text-ink text-sm" selectionColor={COLORS.primary} />
                      <TouchableOpacity className="w-9 h-9 rounded-full bg-primary items-center justify-center" onPress={() => sendComment(c.id)}><MaterialCommunityIcons name="send" size={16} color="#fff" /></TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="bg-surface rounded-3xl p-6 items-center mb-6 border border-dashed border-outline-variant">
                <MaterialCommunityIcons name="calendar-blank" size={32} color={COLORS.onSurfaceVariant} />
                <Text className="text-ink-mute mt-2">还没有打卡记录，开始第一天的坚持吧</Text>
              </View>
            )}

            {/* 监督团 */}
            <Text className="text-ink font-bold mb-3">监督团（{members.length} 位好友）</Text>
            <View className="bg-surface rounded-3xl p-4 shadow-card border border-outline-variant mb-6">
              <View className="flex-row gap-3">
                {members.map((m) => (
                  <View key={m.id} className="items-center gap-1">
                    <View className="w-12 h-12 rounded-full bg-primary-container items-center justify-center"><Text className="text-primary font-bold">{(m.avatar_text || m.nickname?.[0] || '友')}</Text></View>
                    <Text className="text-xs text-ink-mute">{m.nickname}</Text>
                    <Text className="text-[11px] text-primary">{memberStats[m.id] ? '今日已打卡' : '今日未打卡'}</Text>
                  </View>
                ))}
              </View>
              <Text className="text-ink-mute text-xs mt-3">好友之间可以看到本目标的所有完成情况，互相监督鼓励一起努力。</Text>
            </View>
          </>
        )}
        {!goal && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 80 }} />}
      </ScrollView>

      {/* 打卡方式选择 */}
      <Modal visible={ckOpen} transparent animationType="fade" onRequestClose={() => setCkOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/30 items-center justify-center" onPress={() => setCkOpen(false)}>
          <View className="bg-surface rounded-3xl w-4/5 p-5" style={{ backgroundColor: COLORS.surface }}>
                    <Text className="text-ink font-bold text-center mb-4">上传《{current?.title}》打卡凭证</Text>
            <PrimaryButton title="拍照打卡" onPress={() => current && takePhoto(current)} loading={uploading} />
            <View className="h-3" />
            <PrimaryButton title="从相册选择照片" onPress={() => current && pickProof(current)} loading={uploading} style={{ backgroundColor: COLORS.secondary }} />
            <View className="h-3" />
            <TouchableOpacity className="h-12 rounded-2xl border border-outline-variant items-center justify-center flex-row gap-2" onPress={recordVideo} disabled={uploading}>
              <MaterialCommunityIcons name="video-outline" size={18} color={COLORS.primary} />
              <Text className="text-ink text-sm font-semibold">拍一段视频凭证</Text>
            </TouchableOpacity>
            <View className="h-2" />
            <TouchableOpacity className="h-12 rounded-2xl border border-outline-variant items-center justify-center flex-row gap-2" onPress={pickVideo} disabled={uploading}>
              <MaterialCommunityIcons name="filmstrip" size={18} color={COLORS.secondary} />
              <Text className="text-ink text-sm font-semibold">从相册选视频</Text>
            </TouchableOpacity>
            <View className="h-3" />
            <TouchableOpacity className="h-12 items-center justify-center" onPress={() => setCkOpen(false)}><Text className="text-ink-mute">取消</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 操作菜单 */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/30 items-center justify-center" onPress={() => setMenuOpen(false)}>
          <View className="bg-surface rounded-3xl w-4/5 p-5">
            <Text className="text-ink font-bold text-center mb-3">目标管理</Text>
            <TouchableOpacity className="bg-primary-container rounded-2xl py-3 items-center mb-2" onPress={async () => { await apiPost(`/api/v1/goals/${id}/pause`, {}); setMenuOpen(false); load(); }}>
              <MaterialCommunityIcons name="pause-circle-outline" size={20} color={COLORS.primary} /><Text className="text-ink font-semibold mt-1">暂停目标（暖暖会轻声提醒哦）</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-surface-container rounded-2xl py-3 items-center" onPress={async () => { await apiPost(`/api/v1/goals/${id}/reset`, {}); setMenuOpen(false); load(); }}>
              <MaterialCommunityIcons name="restart" size={20} color={COLORS.primary} /><Text className="text-ink font-semibold mt-1">重新开始目标</Text>
            </TouchableOpacity>
            <TouchableOpacity className="py-3 items-center mt-2" onPress={() => setMenuOpen(false)}><Text className="text-ink-mute">取消</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}