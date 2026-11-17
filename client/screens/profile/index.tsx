import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { COLORS, Card } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { apiGet } from '@/utils/api';

interface Goal { id: number; title: string; category: string; status: string; target_value: string; }
interface Stats { [key: number]: { todayDone: number; todayTotal: number; } }

export default function ProfileScreen() {
  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const { userId, user } = useUser();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [points, setPoints] = useState(0);
  const [friends, setFriends] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      apiGet(`/api/v1/users/${userId}/points`).then((r) => setPoints(r.total || 0)).catch(() => undefined);
      apiGet<any[] | {goals:Goal[];stats:Stats}>(`/api/v1/goals?userId=${userId}`).then((r: any) => { setStats(r.stats || {}); setGoals(r.goals || []); }).catch(() => undefined);
      apiGet(`/api/v1/users/me/${userId}`).then((r) => { setFriends(r.friends || []); setProfile(r.profile || null); }).catch(() => undefined);
    }, [userId])
  );

  const activeGoals = goals.filter((g) => g.status === 'active');
  const entries = [
    { icon: 'heart-pulse', label: '身体状况记录', desc: profile ? '已完善 · 点击查看' : '补充健康档案', color: '#B88466', onPress: () => router.push('/body-records') },
    { icon: 'trophy-outline', label: '奖惩积分', desc: `当前 ${points} 分 · 结算`, color: '#D99A3D', onPress: () => router.push('/rewards') },
    { icon: 'account-group-outline', label: '好友监督', desc: `${friends.length} 位监督好友`, color: '#6FA05C', onPress: () => router.push('/friends') },
    { icon: 'target', label: '目标设置', desc: `${activeGoals.length} 个进行中目标`, color: '#8FA68E', onPress: () => router.push('/goal-setup') },
    { icon: 'book-open-page-variant', label: '学习计划', desc: '4 周计划 · 可打卡', color: '#7C8FA6', onPress: () => router.push('/study') },
  ];

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <ScrollView className="flex-1 px-4 pb-8" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 80 }}>
        {/* 健康档案卡 */}
        <View className="rounded-3xl p-5 shadow-float" style={{ backgroundColor: COLORS.primary }}>
          <View className="flex-row items-center gap-3">
            <View className="w-14 h-14 rounded-full bg-white/90 items-center justify-center">
              <Text className="text-primary text-xl font-bold">{(user?.avatar_text || '初')}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-white text-lg font-bold">主人，早上好</Text>
              <Text className="text-white/80 text-sm">您近期各项指标都保持得很棒哦</Text>
            </View>
          </View>
          <View className="flex-row gap-3 mt-4">
            <View className="flex-1 bg-white/15 rounded-2xl px-4 py-3">
              <Text className="text-white font-bold text-xl">{points}</Text>
              <Text className="text-white/80 text-xs mt-1">累计积分</Text>
            </View>
            <View className="flex-1 bg-white/15 rounded-2xl px-4 py-3">
              <Text className="text-white font-bold text-xl">{activeGoals.length}</Text>
              <Text className="text-white/80 text-xs mt-1">进行中目标</Text>
            </View>
            <View className="flex-1 bg-white/15 rounded-2xl px-4 py-3">
              <Text className="text-white font-bold text-xl">{friends.length}</Text>
              <Text className="text-white/80 text-xs mt-1">监督好友</Text>
            </View>
          </View>
        </View>

        {/* 功能入口 */}
        <View className="flex-row flex-wrap gap-3 mt-5">
          {entries.map((e) => (
            <TouchableOpacity key={e.label} className="w-[48%] bg-surface rounded-3xl p-4 shadow-card border border-outline-variant" onPress={e.onPress}>
              <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: e.color + '22' }}>
                <MaterialCommunityIcons name={e.icon as any} size={22} color={e.color} />
              </View>
              <Text className="text-ink font-bold mt-3">{e.label}</Text>
              <Text className="text-ink-mute text-xs mt-1">{e.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 目标列表 */}
        <View className="flex-row items-center justify-between mt-6 mb-3">
          <Text className="text-ink text-base font-bold">我的目标</Text>
          <TouchableOpacity onPress={() => router.push('/goal-setup')} className="flex-row items-center gap-1">
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color={COLORS.primary} />
            <Text className="text-primary text-sm font-semibold">新建</Text>
          </TouchableOpacity>
        </View>
        <View className="gap-3">
          {activeGoals.map((g) => {
            const s = stats[g.id] || { todayDone: 0, todayTotal: 0 };
            const pct = s.todayTotal ? Math.round((s.todayDone / s.todayTotal) * 100) : 0;
            return (
              <TouchableOpacity key={g.id} className="bg-surface rounded-3xl p-4 shadow-card border border-outline-variant" onPress={() => router.push('/goal-detail', { id: g.id })}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-ink font-bold flex-1" numberOfLines={1}>{g.title}</Text>
                  <Text className="text-primary text-xs font-semibold">{s.todayDone}/{s.todayTotal}</Text>
                </View>
                <Text className="text-ink-mute text-xs mt-1">{g.target_value || '持续精进中'}</Text>
                <View className="h-2 rounded-full bg-surface-container mt-3 overflow-hidden">
                  <View className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS.primary }} />
                </View>
              </TouchableOpacity>
            );
          })}
          {activeGoals.length === 0 && (
            <TouchableOpacity className="bg-surface rounded-3xl p-5 items-center border border-dashed border-outline-variant" onPress={() => router.push('/goal-setup')}>
              <MaterialCommunityIcons name="target" size={28} color={COLORS.onSurfaceVariant} />
              <Text className="text-ink-mute mt-2">还没有目标，点这里开启监督之旅吧</Text>
            </TouchableOpacity>
          )}
          {goals.filter((g) => g.status !== 'active').length > 0 && (
            <Text className="text-ink-mute text-xs mt-1">
              另有 {goals.filter((g) => g.status !== 'active').length} 个目标已暂停/结束，可在「目标设置」中重新唤醒
            </Text>
          )}
        </View>

        {/* 饮食 / 运动快捷入口 */}
        <View className="flex-row gap-3 mt-5">
          <TouchableOpacity className="flex-1 bg-secondary-container rounded-3xl p-4 shadow-card" onPress={() => router.push('/diet')}>
            <View className="w-10 h-10 rounded-full bg-white/70 items-center justify-center"><MaterialCommunityIcons name="silverware-fork-knife" size={20} color={COLORS.secondary} /></View>
            <Text className="text-ink font-bold mt-3">暖心厨房</Text>
            <Text className="text-ink-mute text-xs mt-1">健康饮食推荐</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1 bg-primary-container rounded-3xl p-4 shadow-card" onPress={() => router.push('/exercise')}>
            <View className="w-10 h-10 rounded-full bg-white/70 items-center justify-center"><MaterialCommunityIcons name="run" size={20} color={COLORS.primary} /></View>
            <Text className="text-ink font-bold mt-3">轻盈动起来</Text>
            <Text className="text-ink-mute text-xs mt-1">科学运动计划</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}