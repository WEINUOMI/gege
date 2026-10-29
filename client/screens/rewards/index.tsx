import { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PageHeader, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { apiGet } from '@/utils/api';

export default function RewardsScreen() {
  const { userId } = useUser();
  const [data, setData] = useState<any>({ total: 0, today: 0, week: 0, list: [] });

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    apiGet(`/api/v1/users/${userId}/points`).then(setData).catch(() => undefined);
  }, [userId]));

  const total = Number(data.total || 0);
  const level = total < 0 ? 0 : Math.min(6, Math.floor(total / 100));
  const levels = ['萌新小暖', '元气新手', '坚持铜章', '自律银章', '金光同行', '终极并肩', '暖暖之王'];
  const next = (level + 1) * 100 - total;

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="积分与奖惩" />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* 积分总览 */}
        <View className="rounded-3xl p-5 my-4" style={{ backgroundColor: COLORS.secondary, shadowColor: COLORS.secondary, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
          <Text style={{ color: '#fff', opacity: 0.85 }} className="text-sm">当前总积分</Text>
          <Text style={{ color: '#fff' }} className="text-4xl font-bold my-1">{total} <Text className="text-base font-normal">分</Text></Text>
          <View className="flex-row gap-3 mt-2">
            <View className="flex-1 rounded-2xl bg-white/15 px-3 py-2"><Text style={{ color: '#fff', opacity: .8 }} className="text-xs">今日</Text><Text style={{ color: '#fff' }} className="text-lg font-bold">{data.today}</Text></View>
            <View className="flex-1 rounded-2xl bg-white/15 px-3 py-2"><Text style={{ color: '#fff', opacity: .8 }} className="text-xs">本周</Text><Text style={{ color: '#fff' }} className="text-lg font-bold">{data.week}</Text></View>
          </View>
          <View className="w-full h-2.5 bg-white/20 rounded-full mt-4 overflow-hidden"><View className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, ((total % 100) / 100) * 100)}%` }} /></View>
          <Text style={{ color: '#fff', opacity: .85 }} className="text-xs mt-1">{level < 6 ? `距离「${levels[level + 1]}」还差 ${Math.max(0, next)} 分` : '已达到最高等级'}</Text>
        </View>

        {/* 等级 */}
        <Text className="text-on-surface font-bold mb-2">当前称号：<Text className="text-primary">{levels[level]}</Text></Text>

        {/* 规则 */}
        <View className="bg-surface rounded-3xl p-4 border border-outline-variant mb-4">
          <Text className="text-on-surface font-bold mb-2">奖惩小规则</Text>
          <View className="flex-row gap-2 items-center mb-1.5"><MaterialCommunityIcons name="check-circle" size={18} color={COLORS.primary} /><Text className="text-on-surface-variant text-sm flex-1">完成一条打卡计划 +积分</Text></View>
          <View className="flex-row gap-2 items-center mb-1.5"><MaterialCommunityIcons name="close-circle" size={18} color="#B85C5C" /><Text className="text-on-surface-variant text-sm flex-1">漏打卡扣除应得积分的一半（支持负分哦，暖暖会心疼但也要负责）</Text></View>
          <View className="flex-row gap-2 items-center"><MaterialCommunityIcons name="heart" size={18} color={COLORS.secondary} /><Text className="text-on-surface-variant text-sm flex-1">负分不设下限，用自律把积分追回来吧</Text></View>
        </View>

        {/* 明细 */}
        <Text className="text-on-surface font-bold mb-3">积分明细</Text>
        {data.list.length ? data.list.map((r: any) => (
          <View key={r.id} className="bg-surface rounded-3xl p-4 border border-outline-variant mb-2 flex-row items-center">
            <View className="w-10 h-10 rounded-2xl bg-surface-container items-center justify-center">
              <MaterialCommunityIcons name={r.amount > 0 ? 'star-four-points' : 'alert-circle-outline'} size={20} color={r.amount > 0 ? COLORS.primary : '#B85C5C'} />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-on-surface font-medium">{r.reason || (r.amount > 0 ? '打卡完成' : '漏打卡惩罚')}</Text>
              <Text className="text-on-surface-variant text-xs">{new Date(r.created_at).toLocaleString()}</Text>
            </View>
            <Text className={`text-lg font-bold ${r.amount > 0 ? 'text-primary' : 'text-[#B85C5C]'}`}>{r.amount > 0 ? `+${r.amount}` : r.amount}</Text>
          </View>
        )) : (
          <View className="bg-surface rounded-3xl p-6 items-center border border-dashed border-outline-variant">
            <MaterialCommunityIcons name="star-outline" size={28} color={COLORS.onSurfaceVariant} />
            <Text className="text-on-surface-variant mt-2">还没有积分记录，去完成今日打卡吧</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}