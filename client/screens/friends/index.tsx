import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { apiGet, apiPost } from '@/utils/api';

export default function FriendsScreen() {
  const { user, userId } = useUser();
  const [friends, setFriends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try { const r = await apiGet(`/api/v1/friends/${userId}`); setFriends(r.friends || []); }
    catch {} finally { setLoading(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addFriend = async () => {
    if (!code.trim() || !userId) { Alert.alert('暖暖提醒', '请输入朋友的邀请标识'); return; }
    try {
      await apiPost('/api/v1/friends/add', { userId, inviteCode: code.trim() });
      Toast.show({ type: 'success', text1: '暖暖提醒', text2: '添加成功，你们可以互相监督啦' });
      setAddOpen(false); setCode(''); load();
    } catch (e: any) { Alert.alert('添加失败', e.message || '未找到该邀请标识'); }
  };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="好友监督" right={
        <TouchableOpacity onPress={() => setAddOpen(true)}><MaterialCommunityIcons name="account-plus" size={24} color={COLORS.primary} /></TouchableOpacity>
      } />

      {/* 邀请标识 */}
      <View className="rounded-3xl p-5 mx-5 my-4 border border-outline-variant" style={{ backgroundColor: COLORS.surface }}>
        <View className="flex-row items-center gap-2"><MaterialCommunityIcons name="ticket-account" size={20} color={COLORS.primary} /><Text className="text-on-surface-variant text-xs">我的监督邀请标识</Text></View>
        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-primary text-2xl font-bold tracking-widest">{user?.invite_code || 'NKN-????'}</Text>
          <TouchableOpacity className="bg-primary px-4 py-2 rounded-full" onPress={() => Alert.alert('我的邀请标识', '把这个标识告诉你的朋友： ' + (user?.invite_code || 'NKN-????'), [{ text: '好的' }])}><Text className="text-white text-xs">邀请好友</Text></TouchableOpacity>
        </View>
        <Text className="text-on-surface-variant text-xs mt-2">把标识告诉同样使用本应用的朋友，即可互相监督、共享目标完成情况。</Text>
      </View>

      <Text className="text-on-surface font-bold px-5 mb-3">我的监督团（{friends.length}）</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : friends.length ? friends.map((f) => (
        <View key={f.id} className="bg-surface rounded-3xl p-4 mx-5 mb-3 border border-outline-variant shadow-card">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-primary-container items-center justify-center"><Text className="text-primary font-bold">{f.avatar_text || f.nickname?.[0]}</Text></View>
            <View className="flex-1">
              <Text className="text-on-surface font-semibold">{f.nickname}</Text>
              <Text className="text-on-surface-variant text-xs">邀请码 {f.invite_code}</Text>
            </View>
            <View className="bg-surface-container px-3 py-1 rounded-full"><Text className="text-on-surface-variant text-xs">已绑定</Text></View>
          </View>
          {f.goals?.length > 0 && (
            <View className="mt-3 bg-surface-container rounded-2xl p-3">
              <Text className="text-on-surface-variant text-xs mb-1">共同监督目标（{f.goals.length}）</Text>
              {f.goals.map((g: any) => <Text key={g.id} className="text-on-surface text-sm">· {g.title}</Text>)}
            </View>
          )}
        </View>
      )) : (
        <View className="bg-surface rounded-3xl p-6 mx-5 items-center border border-dashed border-outline-variant">
          <MaterialCommunityIcons name="account-heart-outline" size={30} color={COLORS.onSurfaceVariant} />
          <Text className="text-on-surface-variant mt-2 text-center">还没有监督好友{'\n'}邀请朋友一起监督打卡，坚持更容易</Text>
        </View>
      )}
      <View className="h-8" />

      {/* 添加好友 */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/30 items-center justify-center" onPress={() => setAddOpen(false)}>
          <View className="bg-surface rounded-3xl w-4/5 p-5">
            <Text className="text-on-surface font-bold text-center mb-4">通过邀请标识添加好友</Text>
            <TextInput value={code} onChangeText={setCode} placeholder="例如 NKN-XXXX" placeholderTextColor="#A99F92" autoCapitalize="characters" className="bg-surface-container rounded-2xl px-4 py-3 text-on-surface" selectionColor={COLORS.primary} />
            <View className="h-4" />
            <PrimaryButton title="查找并添加" onPress={addFriend} />
            <TouchableOpacity className="py-3 items-center mt-1" onPress={() => setAddOpen(false)}><Text className="text-on-surface-variant">取消</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}