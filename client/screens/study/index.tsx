import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { apiGet, apiPost } from '@/utils/api';

interface Task { title: string; minutes: number; slot?: string; }
interface Week { index: number; focus: string; tasks: Task[]; }
interface Plan {
  direction: string;
  summary: string;
  weeks: Week[];
  resources: { title: string; kind: string; note: string }[];
}

const DIRECTIONS = [
  { key: 'AI / 大模型入门', label: 'AI 入门', icon: 'robot-outline' },
  { key: '英语口语', label: '英语口语', icon: 'translate' },
  { key: '编程 / Python', label: 'Python', icon: 'code-tags' },
  { key: '写作 / 自媒体', label: '写作', icon: 'pencil-outline' },
  { key: '考证 / 系统学习', label: '考证', icon: 'certificate-outline' },
  { key: '读书', label: '读书', icon: 'book-open-page-variant' },
];

export default function StudyScreen() {
  const { userId } = useUser();
  const router = useSafeRouter();
  const [direction, setDirection] = useState('AI / 大模型入门');
  const [custom, setCustom] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [personalized, setPersonalized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openWeek, setOpenWeek] = useState(1);
  const [goalId, setGoalId] = useState<number | null>(null);
  const [todayStudy, setTodayStudy] = useState<any[]>([]);

  const loadExisting = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await apiGet<any>(`/api/v1/goals?userId=${userId}&status=active`);
      const hit = (r.goals || []).find((g: any) => g.category === 'learning');
      setGoalId(hit ? Number(hit.id) : null);
      const t = await apiGet<any>(`/api/v1/records/today?userId=${userId}`);
      setTodayStudy(t.study || []);
    } catch { /* 忽略 */ }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadExisting(); }, [userId]));

  const generate = async () => {
    if (!userId) return;
    const dir = direction === '__custom' ? custom.trim() : direction;
    if (!dir) { Toast.show({ type: 'info', text1: '先写下你想学什么' }); return; }
    setLoading(true);
    try {
      const r = await apiPost<any>('/api/v1/recommend/study-plan', { userId, direction: dir, weeks: 4 });
      setPlan(r.plan);
      setPersonalized(!!r.personalized);
      setOpenWeek(1);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '计划没生成出来', text2: e.message || '请重试' });
    } finally {
      setLoading(false);
    }
  };

  /** 把某一周的任务变成可打卡的每日计划 */
  const applyWeek = async (week: Week) => {
    if (!userId || !plan) return;
    setSaving(true);
    try {
      const payload = week.tasks.map((t) => ({ title: t.title, category: 'study', planned_time: t.slot || '20:00', points: 10 }));
      if (goalId) {
        await apiPost(`/api/v1/goals/${goalId}/plan-items`, { planItems: payload });
        Toast.show({ type: 'success', text1: '已切换', text2: `本周（${week.focus}）的任务已设为每日打卡项` });
      } else {
        const r = await apiPost<any>('/api/v1/goals', {
          userId,
          title: `${plan.direction} · 4 周计划`,
          category: 'learning',
          targetValue: `每周 ${week.tasks.reduce((s, t) => s + t.minutes, 0)} 分钟起`,
          metrics: ['学习时长'],
          dailyPoints: 20,
          planItems: payload,
        });
        setGoalId(Number(r.goal.id));
        Toast.show({ type: 'success', text1: '学习目标已创建', text2: '每天按计划打卡就行' });
      }
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '设置失败', text2: e.message || '请重试' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="学习计划" right={<MaterialCommunityIcons name="book-open-page-variant" size={22} color={COLORS.primary} />} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* 今日学习记录 */}
        <View className="bg-surface rounded-3xl p-4 mt-4 border border-outline-variant shadow-card">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="school-outline" size={18} color={COLORS.primary} />
            <Text className="text-on-surface font-bold">今天已学</Text>
            <Text className="text-primary text-sm ml-auto">{todayStudy.length} 次打卡</Text>
          </View>
          {todayStudy.length ? (
            <View className="mt-2">
              {todayStudy.slice(0, 3).map((r: any) => (
                <View key={r.id} className="flex-row items-center gap-2 py-1">
                  <MaterialCommunityIcons name="check-circle" size={13} color={COLORS.primary} />
                  <Text className="flex-1 text-on-surface-variant text-xs" numberOfLines={1}>{r.title}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-on-surface-variant text-xs mt-2">今天还没有学习打卡，先定一个能立刻开始的小任务吧</Text>
          )}
        </View>

        {/* 方向 */}
        <Text className="text-on-surface font-bold mt-5 mb-2">你想学什么？</Text>
        <View className="flex-row flex-wrap gap-2">
          {DIRECTIONS.map((d) => (
            <TouchableOpacity
              key={d.key}
              className={`px-3.5 py-2 rounded-2xl border flex-row items-center gap-1.5 ${direction === d.key ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
              onPress={() => setDirection(d.key)}
            >
              <MaterialCommunityIcons name={d.icon as any} size={15} color={direction === d.key ? COLORS.primary : COLORS.onSurfaceVariant} />
              <Text className="text-on-surface text-xs">{d.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            className={`px-3.5 py-2 rounded-2xl border flex-row items-center gap-1.5 ${direction === '__custom' ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
            onPress={() => setDirection('__custom')}
          >
            <MaterialCommunityIcons name="plus" size={15} color={COLORS.onSurfaceVariant} />
            <Text className="text-on-surface text-xs">自己写</Text>
          </TouchableOpacity>
        </View>

        {direction === '__custom' && (
          <View className="mt-3">
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder="比如：学会用 Excel 做数据透视表"
              placeholderTextColor="#A99F92"
              className="bg-surface rounded-2xl px-4 py-3 text-on-surface border border-outline-variant"
              selectionColor={COLORS.primary}
            />
          </View>
        )}

        <TouchableOpacity className="bg-primary rounded-2xl py-3.5 items-center mt-4" style={{ opacity: loading ? 0.6 : 1 }} disabled={loading} onPress={generate}>
          <Text className="text-white font-bold">{loading ? '暖暖在排计划…' : '生成 4 周学习计划'}</Text>
        </TouchableOpacity>

        {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />}

        {plan && !loading && (
          <>
            <View className="bg-secondary-container rounded-3xl p-4 mt-5">
              <Text className="text-on-surface font-bold text-sm">{plan.direction}</Text>
              <Text className="text-on-surface-variant text-xs leading-5 mt-1.5">{plan.summary}</Text>
              <Text className="text-[10px] text-on-surface-variant mt-2">
                {personalized ? '已结合你的目标和身体情况做过微调' : '按通用方法框架生成（模型未参与微调）'}
              </Text>
            </View>

            <Text className="text-on-surface font-bold mt-5 mb-2">每周安排</Text>
            <View className="gap-2">
              {plan.weeks.map((w) => {
                const expanded = openWeek === w.index;
                const total = w.tasks.reduce((s, t) => s + t.minutes, 0);
                return (
                  <View key={w.index} className="bg-surface rounded-3xl border border-outline-variant shadow-card overflow-hidden">
                    <TouchableOpacity className="flex-row items-center gap-3 p-4" onPress={() => setOpenWeek(expanded ? 0 : w.index)}>
                      <View className="w-9 h-9 rounded-full bg-primary-container items-center justify-center">
                        <Text className="text-primary font-bold text-xs">{w.index}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-on-surface font-semibold text-sm">{w.focus}</Text>
                        <Text className="text-on-surface-variant text-[11px] mt-0.5">{w.tasks.length} 个任务 · 每天约 {total} 分钟</Text>
                      </View>
                      <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.onSurfaceVariant} />
                    </TouchableOpacity>

                    {expanded && (
                      <View className="px-4 pb-4">
                        {w.tasks.map((t, i) => (
                          <View key={i} className="flex-row items-start gap-2 py-1.5">
                            <MaterialCommunityIcons name="circle-small" size={16} color={COLORS.primary} />
                            <Text className="flex-1 text-on-surface text-xs leading-5">{t.title}</Text>
                            <Text className="text-on-surface-variant text-[10px]">{t.minutes}′</Text>
                          </View>
                        ))}
                        <TouchableOpacity
                          className="mt-2 h-10 rounded-2xl bg-primary items-center justify-center"
                          onPress={() => applyWeek(w)}
                          disabled={saving}
                          style={{ opacity: saving ? 0.6 : 1 }}
                        >
                          <Text className="text-white text-xs font-bold">{goalId ? '用这一周的任务当打卡项' : '设为我的学习目标'}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {goalId && (
              <TouchableOpacity className="mt-3 h-12 rounded-2xl border border-outline-variant items-center justify-center" onPress={() => router.push('/goal-detail', { id: goalId })}>
                <Text className="text-on-surface text-sm">去看学习目标的打卡页 →</Text>
              </TouchableOpacity>
            )}

            <Text className="text-on-surface font-bold mt-5 mb-2">配套资料</Text>
            <View className="gap-2">
              {plan.resources.map((r, i) => (
                <View key={i} className="bg-surface rounded-2xl p-3.5 border border-outline-variant">
                  <View className="flex-row items-center gap-2">
                    <View className="bg-primary-container px-2 py-0.5 rounded-full"><Text className="text-[10px] text-on-surface">{r.kind}</Text></View>
                    <Text className="flex-1 text-on-surface text-sm font-medium">{r.title}</Text>
                  </View>
                  <Text className="text-on-surface-variant text-[11px] mt-1">{r.note}</Text>
                </View>
              ))}
            </View>
            <Text className="text-on-surface-variant text-[10px] mt-3 leading-4">
              计划为通用方法框架，具体书目、课程与考试要求请以官方来源为准。
            </Text>
          </>
        )}

        {!plan && !loading && (
          <View className="bg-surface rounded-3xl p-6 items-center border border-dashed border-outline-variant mt-5">
            <MaterialCommunityIcons name="book-open-outline" size={30} color={COLORS.onSurfaceVariant} />
            <Text className="text-on-surface-variant mt-2 text-center text-sm">
              先选一个方向，暖暖会给你排一份{'\n'}每天能照着做的 4 周计划
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
