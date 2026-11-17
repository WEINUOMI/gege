import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { apiGet, apiPost } from '@/utils/api';

interface BoardItem {
  user: { id: number | string; nickname: string; avatar_text: string; invite_code: string };
  isMe: boolean;
  todayCount: number;
  weekCount: number;
  streak: number;
  totalPoints: number;
  goals: { id: number; title: string; category: string }[];
  last: { id: number; title: string; goalId: number; at: string; proof_url: string; points: number } | null;
}

export default function FriendsScreen() {
  const { user, userId } = useUser();
  const router = useSafeRouter();
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState('');
  const [commentFor, setCommentFor] = useState<BoardItem | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await apiGet<any>(`/api/v1/friends/${userId}/board`);
      setBoard(r.board || []);
    } catch {
      setBoard([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addFriend = async () => {
    if (!code.trim() || !userId) { Alert.alert('暖暖提醒', '请输入朋友的邀请标识'); return; }
    try {
      await apiPost('/api/v1/friends/add', { userId, inviteCode: code.trim().toUpperCase() });
      Toast.show({ type: 'success', text1: '添加成功', text2: '你们可以互相监督啦' });
      setAddOpen(false); setCode(''); load();
    } catch (e: any) {
      Alert.alert('添加失败', e.message || '未找到该邀请标识');
    }
  };

  const sendComment = async () => {
    const content = comment.trim();
    if (!content || !userId || !commentFor?.last) return;
    setSending(true);
    try {
      await apiPost('/api/v1/goals/comment', { checkinId: commentFor.last.id, userId, content });
      Toast.show({ type: 'success', text1: '留言已送出', text2: `给 ${commentFor.user.nickname} 的打卡留了一句话` });
      setCommentFor(null); setComment('');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '留言失败', text2: e.message || '请重试' });
    } finally {
      setSending(false);
    }
  };

  const others = board.filter((b) => !b.isMe);

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader
        title="好友监督"
        right={<TouchableOpacity onPress={() => setAddOpen(true)}><MaterialCommunityIcons name="account-plus" size={24} color={COLORS.primary} /></TouchableOpacity>}
      />

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* 邀请码 */}
        <View className="rounded-3xl p-4 mt-4 border border-outline-variant" style={{ backgroundColor: COLORS.surface }}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="ticket-account" size={18} color={COLORS.primary} />
            <Text className="text-on-surface-variant text-xs">我的邀请标识</Text>
            <TouchableOpacity className="ml-auto bg-primary px-3 py-1.5 rounded-full" onPress={() => Alert.alert('我的邀请标识', `把这串字符告诉家人：\n\n${user?.invite_code || ''}\n\n对方在「添加」里输入即可。`)}>
              <Text className="text-white text-[11px]">分享给家人</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-primary text-2xl font-bold tracking-widest mt-2">{user?.invite_code || '··-····'}</Text>
        </View>

        {/* 今日速览 */}
        <Text className="text-on-surface font-bold mt-5 mb-2">今天的进度</Text>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
              {board.map((b) => (
                <View key={String(b.user.id)} className="bg-surface rounded-3xl px-4 py-3 border border-outline-variant items-center" style={{ minWidth: 92 }}>
                  <View className={`w-10 h-10 rounded-full items-center justify-center ${b.todayCount > 0 ? 'bg-primary' : 'bg-surface-container'}`}>
                    <Text className={`font-bold ${b.todayCount > 0 ? 'text-white' : 'text-on-surface-variant'}`}>{b.user.avatar_text || b.user.nickname?.[0]}</Text>
                  </View>
                  <Text className="text-on-surface text-xs font-semibold mt-1.5">{b.isMe ? '我' : b.user.nickname}</Text>
                  <Text className={`text-[10px] mt-0.5 ${b.todayCount > 0 ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {b.todayCount > 0 ? `今日 ${b.todayCount} 次` : '还没打卡'}
                  </Text>
                  {b.streak > 0 && <Text className="text-secondary text-[10px]">连续 {b.streak} 天</Text>}
                </View>
              ))}
            </ScrollView>

            {/* 好友明细 */}
            <Text className="text-on-surface font-bold mt-6 mb-2">我的监督团（{others.length}）</Text>
            {others.length === 0 ? (
              <View className="bg-surface rounded-3xl p-6 items-center border border-dashed border-outline-variant">
                <MaterialCommunityIcons name="account-heart-outline" size={30} color={COLORS.onSurfaceVariant} />
                <Text className="text-on-surface-variant mt-2 text-center text-sm">
                  还没有监督好友{'\n'}把上面的邀请标识发给家人，一起打卡更容易坚持
                </Text>
                <TouchableOpacity className="mt-3 px-5 h-10 rounded-full bg-primary items-center justify-center" onPress={() => setAddOpen(true)}>
                  <Text className="text-white text-xs font-bold">添加一位家人</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="gap-3">
                {others.map((b) => (
                  <View key={String(b.user.id)} className="bg-surface rounded-3xl p-4 border border-outline-variant shadow-card">
                    <View className="flex-row items-center gap-3">
                      <View className={`w-11 h-11 rounded-full items-center justify-center ${b.todayCount > 0 ? 'bg-primary' : 'bg-primary-container'}`}>
                        <Text className={`font-bold ${b.todayCount > 0 ? 'text-white' : 'text-primary'}`}>{b.user.avatar_text || b.user.nickname?.[0]}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-on-surface font-bold">{b.user.nickname}</Text>
                        <Text className="text-on-surface-variant text-[11px] mt-0.5">
                          本周 {b.weekCount} 次 · 连续 {b.streak} 天 · 累计 {b.totalPoints} 分
                        </Text>
                      </View>
                      <View className={`px-3 py-1 rounded-full ${b.todayCount > 0 ? 'bg-primary-container' : 'bg-surface-container'}`}>
                        <Text className={`text-[10px] ${b.todayCount > 0 ? 'text-primary' : 'text-on-surface-variant'}`}>
                          {b.todayCount > 0 ? '今日已完成' : '今日未打卡'}
                        </Text>
                      </View>
                    </View>

                    {b.goals.length > 0 && (
                      <View className="flex-row flex-wrap gap-1.5 mt-3">
                        {b.goals.map((g) => (
                          <TouchableOpacity key={g.id} className="bg-surface-container px-2.5 py-1 rounded-full" onPress={() => router.push('/goal-detail', { id: g.id })}>
                            <Text className="text-on-surface text-[10px]">{g.title}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {b.last ? (
                      <View className="flex-row items-center gap-3 mt-3 bg-surface-container rounded-2xl p-2.5">
                        {b.last.proof_url ? (
                          <Image source={{ uri: b.last.proof_url }} style={{ width: 44, height: 44, borderRadius: 12 }} />
                        ) : (
                          <View className="w-11 h-11 rounded-xl bg-white/60 items-center justify-center">
                            <MaterialCommunityIcons name="text-box-outline" size={18} color={COLORS.onSurfaceVariant} />
                          </View>
                        )}
                        <View className="flex-1">
                          <Text className="text-on-surface text-xs" numberOfLines={1}>{b.last.title}</Text>
                          <Text className="text-on-surface-variant text-[10px] mt-0.5">
                            {new Date(b.last.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <TouchableOpacity className="bg-primary px-3 py-1.5 rounded-full" onPress={() => { setCommentFor(b); setComment(''); }}>
                          <Text className="text-white text-[10px] font-bold">留句话</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text className="text-on-surface-variant text-[11px] mt-3">最近还没有打卡记录，去催一句？</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <Text className="text-on-surface-variant text-[10px] mt-4 leading-4">
          好友之间只能看到对方的打卡标题、照片与完成次数；体重、血压等身体数据不会互相可见。
        </Text>
      </ScrollView>

      {/* 添加好友 */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View className="flex-1 bg-black/30 items-center justify-center px-6">
          <View className="bg-surface rounded-3xl w-full p-5" style={{ backgroundColor: COLORS.surface }}>
            <Text className="text-on-surface font-bold text-center mb-1">通过邀请标识添加</Text>
            <Text className="text-on-surface-variant text-xs text-center mb-3">让家人在他/她的「好友监督」页找到那串字符</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="例如 NKN-XXXX"
              placeholderTextColor="#A99F92"
              autoCapitalize="characters"
              className="bg-surface-container rounded-2xl px-4 py-3 text-on-surface"
              selectionColor={COLORS.primary}
            />
            <View className="h-4" />
            <PrimaryButton title="查找并添加" onPress={addFriend} />
            <TouchableOpacity className="py-3 items-center" onPress={() => setAddOpen(false)}>
              <Text className="text-on-surface-variant text-sm">取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 留言 */}
      <Modal visible={!!commentFor} transparent animationType="fade" onRequestClose={() => setCommentFor(null)}>
        <View className="flex-1 bg-black/30 items-center justify-center px-6">
          <View className="bg-surface rounded-3xl w-full p-5" style={{ backgroundColor: COLORS.surface }}>
            <Text className="text-on-surface font-bold text-center">给 {commentFor?.user.nickname} 留句话</Text>
            <Text className="text-on-surface-variant text-xs text-center mt-1" numberOfLines={1}>关于「{commentFor?.last?.title}」</Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="比如：今天也做到了，真棒！"
              placeholderTextColor="#A99F92"
              multiline
              className="bg-surface-container rounded-2xl px-4 py-3 text-on-surface mt-4"
              style={{ minHeight: 76 }}
              selectionColor={COLORS.primary}
            />
            <View className="h-4" />
            <PrimaryButton title={sending ? '送出中…' : '送出去'} onPress={sendComment} loading={sending} />
            <TouchableOpacity className="py-3 items-center" onPress={() => setCommentFor(null)}>
              <Text className="text-on-surface-variant text-sm">取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
