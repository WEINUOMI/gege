import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { PageHeader, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { apiGet, apiPost } from '@/utils/api';

interface Settlement {
  goal: { id: number; title: string; dailyPoints: number };
  period: string;
  range: string;
  expected: number;
  actual: number;
  rate: number;
  missingCount: number;
  missingDays: string[];
  earnedPoints: number;
  verdict: '达成' | '接近' | '未达成';
  suggestReward: string | null;
  suggestPunishment: string | null;
  bonusPoints: number;
  penaltyPoints: number;
}

const PERIODS = [
  { key: 'week', label: '最近 7 天' },
  { key: 'month', label: '本月至今' },
  { key: 'today', label: '只看今天' },
];

export default function RewardsScreen() {
  const { userId } = useUser();
  const [data, setData] = useState<any>({ total: 0, today: 0, week: 0, list: [] });
  const [goals, setGoals] = useState<any[]>([]);
  const [goalId, setGoalId] = useState<number | null>(null);
  const [period, setPeriod] = useState('week');
  const [st, setSt] = useState<Settlement | null>(null);
  const [loadingSt, setLoadingSt] = useState(false);
  const [settling, setSettling] = useState(false);

  const loadPoints = useCallback(async () => {
    if (!userId) return;
    try { setData(await apiGet(`/api/v1/users/${userId}/points`)); } catch { /* 忽略 */ }
  }, [userId]);

  const loadGoals = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await apiGet<any>(`/api/v1/goals?userId=${userId}&status=active`);
      const list = (r.goals || []).filter((g: any) => !['diet', 'exercise', 'study'].includes(g.category));
      setGoals(list);
      if (list.length && !goalId) setGoalId(list[0].id);
    } catch { /* 忽略 */ }
  }, [userId, goalId]);

  const loadSettlement = useCallback(async (gid: number, p: string) => {
    setLoadingSt(true);
    try {
      setSt(await apiGet<Settlement>(`/api/v1/goals/${gid}/settlement?period=${p}&userId=${userId}`));
    } catch { setSt(null); } finally { setLoadingSt(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadPoints();
    loadGoals();
  }, [userId]));

  useFocusEffect(useCallback(() => {
    if (goalId) loadSettlement(goalId, period);
  }, [goalId, period, loadSettlement]));

  const doSettle = async () => {
    if (!goalId || !userId) return;
    setSettling(true);
    try {
      const r = await apiPost<any>(`/api/v1/goals/${goalId}/settlement`, { userId, period });
      if (r.already) {
        Toast.show({ type: 'info', text1: '已结算过了', text2: r.message || '这个周期不会重复计分' });
      } else if (r.points > 0) {
        Toast.show({ type: 'success', text1: '达成啦', text2: `+${r.points} 分，奖励可以兑现了` });
      } else if (r.points < 0) {
        Toast.show({ type: 'info', text1: '结算完成', text2: `${r.points} 分，补上漏掉的天数就好` });
      } else {
        Toast.show({ type: 'info', text1: '结算完成', text2: '这一周期不奖不罚' });
      }
      loadPoints();
      loadSettlement(goalId, period);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '结算失败', text2: e.message || '请重试' });
    } finally {
      setSettling(false);
    }
  };

  const total = Number(data.total || 0);
  const level = total < 0 ? 0 : Math.min(6, Math.floor(total / 100));
  const levels = ['萌新小暖', '元气新手', '坚持铜章', '自律银章', '金光同行', '终极并肩', '暖暖之王'];
  const next = (level + 1) * 100 - total;

  const verdictStyle = st?.verdict === '达成'
    ? { bg: '#E6EFE3', fg: '#4C7C4F' }
    : st?.verdict === '接近'
      ? { bg: '#FBF3E0', fg: '#8A6A22' }
      : { bg: '#F4DBD8', fg: '#B06A60' };

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

        <Text className="text-ink font-bold mb-2">当前称号：<Text className="text-primary">{levels[level]}</Text></Text>

        {/* 短期结算 */}
        <Text className="text-ink font-bold mt-5 mb-2">短期目标结算</Text>
        {goals.length === 0 ? (
          <View className="bg-surface rounded-3xl p-5 items-center border border-dashed border-outline-variant">
            <MaterialCommunityIcons name="target" size={26} color={COLORS.onSurfaceVariant} />
            <Text className="text-ink-mute text-sm mt-2 text-center">还没有进行中的目标{'\n'}先在「目标设置」里建一个吧</Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
              {goals.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  className={`px-3.5 py-2 rounded-full border ${goalId === g.id ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
                  onPress={() => setGoalId(Number(g.id))}
                >
                  <Text className="text-ink text-xs">{g.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View className="flex-row gap-2 mt-3">
              {PERIODS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  className={`flex-1 py-2 rounded-full border items-center ${period === p.key ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
                  onPress={() => setPeriod(p.key)}
                >
                  <Text className="text-ink text-[11px]">{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="bg-surface rounded-3xl p-4 mt-3 border border-outline-variant shadow-card">
              {loadingSt ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
              ) : st ? (
                <>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-ink-mute text-[11px]">{st.range}</Text>
                    <View className="px-2.5 py-0.5 rounded-full" style={{ backgroundColor: verdictStyle.bg }}>
                      <Text className="text-[11px] font-bold" style={{ color: verdictStyle.fg }}>{st.verdict}</Text>
                    </View>
                  </View>

                  <View className="flex-row items-end gap-2 mt-2">
                    <Text className="text-primary text-3xl font-bold">{st.rate}%</Text>
                    <Text className="text-ink-mute text-xs mb-1.5">完成率 · {st.actual}/{st.expected} 次</Text>
                  </View>

                  <View className="h-2.5 rounded-full bg-surface-container mt-2 overflow-hidden">
                    <View className="h-full rounded-full" style={{ width: `${st.rate}%`, backgroundColor: COLORS.primary }} />
                  </View>

                  <View className="flex-row gap-2 mt-3">
                    <View className="flex-1 bg-surface-container rounded-2xl px-3 py-2">
                      <Text className="text-ink-mute text-[11px]">已得积分</Text>
                      <Text className="text-ink font-bold mt-0.5">{st.earnedPoints}</Text>
                    </View>
                    <View className="flex-1 bg-surface-container rounded-2xl px-3 py-2">
                      <Text className="text-ink-mute text-[11px]">漏卡天数</Text>
                      <Text className="text-ink font-bold mt-0.5">{st.missingCount} 天</Text>
                    </View>
                    <View className="flex-1 bg-surface-container rounded-2xl px-3 py-2">
                      <Text className="text-ink-mute text-[11px]">本次结算</Text>
                      <Text className={`font-bold mt-0.5 ${st.bonusPoints > 0 ? 'text-primary' : 'text-[#B06A60]'}`}>
                        {st.bonusPoints > 0 ? `+${st.bonusPoints}` : st.penaltyPoints}
                      </Text>
                    </View>
                  </View>

                  {st.suggestReward && (
                    <View className="flex-row items-start gap-2 mt-3 bg-primary-container rounded-2xl px-3 py-2">
                      <MaterialCommunityIcons name="gift-outline" size={16} color={COLORS.primary} />
                      <Text className="flex-1 text-ink text-[11px] leading-4">奖励建议：{st.suggestReward}</Text>
                    </View>
                  )}
                  {st.suggestPunishment && (
                    <View className="flex-row items-start gap-2 mt-2 bg-surface-container rounded-2xl px-3 py-2">
                      <MaterialCommunityIcons name="leaf" size={16} color={COLORS.secondary} />
                      <Text className="flex-1 text-ink text-[11px] leading-4">下次这样改：{st.suggestPunishment}</Text>
                    </View>
                  )}

                  {st.missingDays.length > 0 && (
                    <Text className="text-ink-mute text-[11px] mt-2 leading-4">
                      漏掉的日子：{st.missingDays.slice(-6).map((d) => d.slice(5)).join('、')}{st.missingDays.length > 6 ? ' 等' : ''}
                    </Text>
                  )}

                  <TouchableOpacity className="mt-3 h-11 rounded-2xl bg-primary items-center justify-center" onPress={doSettle} disabled={settling} style={{ opacity: settling ? 0.6 : 1 }}>
                    <Text className="text-white text-sm font-bold">{settling ? '结算中…' : '结算这个周期'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text className="text-ink-mute text-xs text-center py-6">这个目标暂时算不出结算数据</Text>
              )}
            </View>
          </>
        )}

        {/* 规则 */}
        <View className="bg-surface rounded-3xl p-4 border border-outline-variant mb-4 mt-5">
          <Text className="text-ink font-bold mb-2">奖惩小规则</Text>
          <View className="flex-row gap-2 items-center mb-1.5"><MaterialCommunityIcons name="check-circle" size={18} color={COLORS.primary} /><Text className="text-ink-mute text-sm flex-1">完成一条打卡计划即可得分，运动记录按运动量给分</Text></View>
          <View className="flex-row gap-2 items-center mb-1.5"><MaterialCommunityIcons name="calendar-remove-outline" size={18} color="#B85C5C" /><Text className="text-ink-mute text-sm flex-1">漏打卡按当日可得积分的一半补扣，单周期最多扣 60 分</Text></View>
          <View className="flex-row gap-2 items-center"><MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.secondary} /><Text className="text-ink-mute text-sm flex-1">同一周期只结算一次，重复点不会重复扣分</Text></View>
        </View>

        {/* 明细 */}
        <Text className="text-ink font-bold mb-3">积分明细</Text>
        {data.list.length ? data.list.map((r: any) => (
          <View key={r.id} className="bg-surface rounded-3xl p-4 border border-outline-variant mb-2 flex-row items-center">
            <View className="w-10 h-10 rounded-2xl bg-surface-container items-center justify-center">
              <MaterialCommunityIcons name={r.amount > 0 ? 'star-four-points' : 'alert-circle-outline'} size={20} color={r.amount > 0 ? COLORS.primary : '#B85C5C'} />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-ink font-medium text-sm" numberOfLines={2}>{r.reason || (r.amount > 0 ? '打卡完成' : '漏打卡惩罚')}</Text>
              <Text className="text-ink-mute text-[11px] mt-0.5">{new Date(r.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <Text className={`text-lg font-bold ${r.amount > 0 ? 'text-primary' : 'text-[#B85C5C]'}`}>{r.amount > 0 ? `+${r.amount}` : r.amount}</Text>
          </View>
        )) : (
          <View className="bg-surface rounded-3xl p-6 items-center border border-dashed border-outline-variant">
            <MaterialCommunityIcons name="star-outline" size={28} color={COLORS.onSurfaceVariant} />
            <Text className="text-ink-mute mt-2 text-sm">还没有积分记录，去完成今日打卡吧</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
