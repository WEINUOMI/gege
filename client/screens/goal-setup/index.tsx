import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, Field, Chip, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { apiPost } from '@/utils/api';

const CATEGORIES = [
  { key: 'weight_loss', label: '体重体型', icon: 'scale-bathroom' },
  { key: 'muscle', label: '增肌塑形', icon: 'dumbbell' },
  { key: 'health_control', label: '三高管理', icon: 'heart-pulse' },
  { key: 'learning', label: '学习计划', icon: 'book-open-page-variant' },
  { key: 'habit', label: '习惯养成', icon: 'clipboard-check-outline' },
];
const METRICS = ['体重', '体脂率', 'BMI', '血压', '血糖', '血脂', '腰围', '学习时长', '睡眠', '步数'];

const REWARD_PRESETS = ['给自己买一件小东西', '看一场电影', '睡到自然醒', '吃一顿想吃的饭', '买一本想读的书', '出去玩半天'];
const PUNISH_PRESETS = ['补上漏掉的天数', '请家人吃一顿饭', '少看一天短视频', '做一次深度复盘', '把手机放下一小时', '捐 20 元给公益'];

export default function GoalSetupScreen() {
  const router = useSafeRouter();
  const { userId } = useUser();
  const [category, setCategory] = useState('weight_loss');
  const [metrics, setMetrics] = useState<string[]>(['体重']);
  const [title, setTitle] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetMetric, setTargetMetric] = useState('');
  const [planMode, setPlanMode] = useState<'system' | 'custom'>('system');
  const [customItems, setCustomItems] = useState<{ title: string; time: string }[]>([]);
  const [ciTitle, setCiTitle] = useState('');
  const [ciTime, setCiTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [rewards, setRewards] = useState<string[]>(['给自己买一件小东西']);
  const [punishments, setPunishments] = useState<string[]>(['补上漏掉的天数']);

  const toggleMetrics = (v: string) => setMetrics((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]));
  const toggleIn = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const addItem = () => {
    if (!ciTitle.trim()) return;
    setCustomItems((l) => [...l, { title: ciTitle.trim(), time: ciTime || '全天' }]);
    setCiTitle(''); setCiTime('');
  };

  const save = async () => {
    if (!title.trim() || !userId) return;
    setSaving(true);
    try {
      /**
       * 服务端文件：server/src/routes/goals.ts
       * 接口：POST /api/v1/goals
       * Body: userId: string, title: string, category: string, metrics: string[], targetValue?: string, targetMetric?: string, startDate?: string, endDate?: string, dailyPoints?: number, planItems?: {title:string;planned_time?:string}[]
       */
      const res = await apiPost('/api/v1/goals', {
        userId, title: title.trim(), category,
        metrics, targetValue: targetValue || undefined, targetMetric: targetMetric || undefined,
        startDate: new Date().toISOString().slice(0, 10),
        dailyPoints: 20,
        rewards,
        punishments,
        planItems: planMode === 'custom' && customItems.length ? customItems.map((c) => ({ title: c.title, planned_time: c.time })) : undefined,
      });
      router.replace('/goal-detail', { id: res.goal.id });
    } catch (e: any) {
      Alert.alert('目标没建成', e?.message || '请检查网络后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <PageHeader title="设定目标" />
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center gap-2 my-4">
            <MaterialCommunityIcons name="auto-fix" size={20} color={COLORS.primary} />
            <Text className="text-ink-mute">告诉暖暖您的愿望，我们一起把它变成每天都能坚持的小确幸</Text>
          </View>

          <Text className="text-ink font-bold mb-3">目标方向</Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {CATEGORIES.map((c) => (
              <TouchableOpacity key={c.key} className={`px-4 py-3 rounded-2xl border flex-row items-center gap-2 ${category === c.key ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface'}`} onPress={() => setCategory(c.key)}>
                <MaterialCommunityIcons name={c.icon as any} size={18} color={category === c.key ? COLORS.primary : COLORS.onSurfaceVariant} />
                <Text className={`font-semibold ${category === c.key ? 'text-ink' : 'text-ink-mute'}`}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-ink font-bold mb-3">关注指标（可多选）</Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {METRICS.map((m) => <Chip key={m} label={m} selected={metrics.includes(m)} onPress={() => toggleMetrics(m)} />)}
          </View>

          <Text className="text-ink font-bold mb-3">目标详情</Text>
          <View className="gap-3">
            <Field value={title} onChangeText={setTitle} placeholder="目标名称，如：3个月减重 5kg" />
            <Field value={targetValue} onChangeText={setTargetValue} placeholder="目标数值，如：12周减5kg" />
            <Field value={targetMetric} onChangeText={setTargetMetric} placeholder="周期，如：12周" />
          </View>

          <View className="mt-6">
            <Text className="text-ink font-bold mb-3">每日打卡计划</Text>
            <View className="flex-row bg-surface-container rounded-2xl p-1 mb-3">
              <TouchableOpacity className={`flex-1 py-2 rounded-xl items-center ${planMode === 'system' ? 'bg-surface shadow-card' : ''}`} onPress={() => setPlanMode('system')}>
                <Text className={`font-semibold ${planMode === 'system' ? 'text-ink' : 'text-ink-mute'}`}>暖心推荐</Text>
              </TouchableOpacity>
              <TouchableOpacity className={`flex-1 py-2 rounded-xl items-center ${planMode === 'custom' ? 'bg-surface shadow-card' : ''}`} onPress={() => setPlanMode('custom')}>
                <Text className={`font-semibold ${planMode === 'custom' ? 'text-ink' : 'text-ink-mute'}`}>自行设置</Text>
              </TouchableOpacity>
            </View>
            {planMode === 'system' ? (
              <View className="bg-primary-container rounded-3xl p-4">
                <Text className="text-ink font-semibold">暖暖将结合您的身体状况与目标，通过科学知识库为您推荐每日打卡计划（如晨起称重、健康饮食拍照、适量运动等）。</Text>
                <Text className="text-ink-mute text-xs mt-2">计划生成后将可在目标详情页查看与打卡。</Text>
              </View>
            ) : (
              <View className="gap-3">
                {customItems.map((it, i) => (
                  <View key={i} className="flex-row items-center gap-2 bg-surface rounded-2xl px-4 py-3 border border-outline-variant">
                    <MaterialCommunityIcons name="check-circle-outline" size={18} color={COLORS.primary} />
                    <Text className="flex-1 text-ink text-sm">{it.title}</Text>
                    <Text className="text-ink-mute text-xs">{it.time}</Text>
                  </View>
                ))}
                <View className="flex-row gap-2">
                  <View className="flex-1"><Field value={ciTitle} onChangeText={setCiTitle} placeholder="打卡项，如：晨跑30分钟" /></View>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1"><Field value={ciTime} onChangeText={setCiTime} placeholder="时间，如 07:00" /></View>
                  <TouchableOpacity className="w-14 h-14 rounded-2xl bg-primary items-center justify-center" onPress={addItem}>
                    <MaterialCommunityIcons name="plus" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          <View className="mt-6">
            <Text className="text-ink font-bold mb-1">达成了怎么奖励自己？</Text>
            <Text className="text-ink-mute text-[11px] mb-2">结算时会按你选的第一项提醒你兑现</Text>
            <View className="flex-row flex-wrap gap-2">
              {REWARD_PRESETS.map((r) => (
                <Chip key={r} label={r} selected={rewards.includes(r)} onPress={() => toggleIn(rewards, setRewards, r)} />
              ))}
            </View>
          </View>

          <View className="mt-6">
            <Text className="text-ink font-bold mb-1">没做到怎么补？</Text>
            <Text className="text-ink-mute text-[11px] mb-2">比「自责」更有效的是定一个具体的补偿动作</Text>
            <View className="flex-row flex-wrap gap-2">
              {PUNISH_PRESETS.map((p) => (
                <Chip key={p} label={p} selected={punishments.includes(p)} onPress={() => toggleIn(punishments, setPunishments, p)} />
              ))}
            </View>
          </View>
        </ScrollView>
        <View className="px-5 pb-6 pt-2" style={{ backgroundColor: COLORS.bg }}>
          <PrimaryButton title={saving ? '正在创建…' : '完成，开启监督之旅'} onPress={save} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}