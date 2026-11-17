import { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, Field, Chip, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { apiGet, apiPost } from '@/utils/api';

const HISTORIES = ['高血压', '糖尿病', '高血脂', '冠心病', '痛风', '甲状腺疾病', '骨质疏松', '哮喘', '慢性胃炎', '肾脏疾病', '脂肪肝'];
const DIET_PREFS = ['清淡', '少盐少油', '素食', '高蛋白', '少甜食', '多蔬果'];

export default function BodyRecordsScreen() {
  const { userId } = useUser();
  const [form, setForm] = useState<any>({});
  const [records, setRecords] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await apiGet<any>(`/api/v1/users/me/${userId}`);
      setForm(r.profile || {});
    } catch { /* 忽略 */ }
    apiGet<any>(`/api/v1/users/${userId}/health-records`).then((r) => setRecords(r.records || [])).catch(() => undefined);
    apiGet<any>(`/api/v1/records/trend?userId=${userId}&days=7`).then((r) => setTrend(r.trend || [])).catch(() => undefined);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  const toggleIn = (k: string, v: string) => setForm((f: any) => {
    const arr: string[] = Array.isArray(f[k]) ? f[k] : [];
    return { ...f, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
  });

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await apiPost(`/api/v1/users/${userId}/health-profile`, {
        height: form.height, weight: form.weight, age: Number(form.age || 0) || undefined, gender: form.gender,
        bloodPressureSystolic: form.blood_pressure_systolic, bloodPressureDiastolic: form.blood_pressure_diastolic,
        bloodSugar: form.blood_sugar, totalCholesterol: form.total_cholesterol, heartRate: form.heart_rate,
        waist: form.waist, bodyFat: form.body_fat,
        medicalHistory: form.medical_history || [], dietPrefs: form.diet_prefs || [],
      });
      // 说明：health-profile 接口内部已经会同步写一条 health_records 历史，
      // 这里不再重复调用，避免每次保存产生两条一模一样的记录。
      Toast.show({ type: 'success', text1: '已保存', text2: '之后的饮食与运动推荐会按新数据调整' });
      load();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '保存失败', text2: e.message });
    } finally {
      setSaving(false);
    }
  };

  const maxVal = Math.max(1, ...trend.map((t) => Math.max(t.intake || 0, t.burn || 0)));

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="身体状况记录" />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary-container rounded-3xl p-4 my-4">
          <Text className="text-on-surface text-xs leading-6">
            这些信息用来筛选饮食与运动建议，定位是【健康生活方式管理】，不做诊断、不给药物剂量。随时可以回来修改。
          </Text>
        </View>

        <Text className="text-on-surface font-bold mb-3">基础信息</Text>
        <View className="gap-3 mb-5">
          <Field value={form.height} onChangeText={set('height')} placeholder="身高（cm）" suffix="cm" />
          <Field value={form.weight} onChangeText={set('weight')} placeholder="体重（kg）" suffix="kg" />
          <View className="flex-row gap-3">
            <View className="flex-1"><Field value={form.waist} onChangeText={set('waist')} placeholder="腰围（cm）" suffix="cm" /></View>
            <View className="flex-1"><Field value={form.body_fat} onChangeText={set('body_fat')} placeholder="体脂率（%）" suffix="%" /></View>
          </View>
          <Field value={form.age?.toString()} onChangeText={set('age')} placeholder="年龄" suffix="岁" />
        </View>

        <Text className="text-on-surface font-bold mb-3">健康指标</Text>
        <View className="gap-3 mb-6">
          <View className="flex-row gap-3">
            <View className="flex-1"><Field value={form.blood_pressure_systolic} onChangeText={set('blood_pressure_systolic')} placeholder="收缩压" suffix="mmHg" /></View>
            <View className="flex-1"><Field value={form.blood_pressure_diastolic} onChangeText={set('blood_pressure_diastolic')} placeholder="舒张压" suffix="mmHg" /></View>
          </View>
          <Field value={form.blood_sugar} onChangeText={set('blood_sugar')} placeholder="空腹血糖（mmol/L）" />
          <Field value={form.total_cholesterol} onChangeText={set('total_cholesterol')} placeholder="总胆固醇（mmol/L）" />
          <Field value={form.heart_rate} onChangeText={set('heart_rate')} placeholder="静息心率（bpm）" suffix="bpm" />
        </View>

        <Text className="text-on-surface font-bold mb-2">过往病史（多选）</Text>
        <Text className="text-on-surface-variant text-[11px] mb-2">勾选后，系统会自动避开不适配的菜谱与运动</Text>
        <View className="flex-row flex-wrap gap-2 mb-6">
          {HISTORIES.map((h) => (
            <Chip key={h} label={h} selected={(form.medical_history || []).includes(h)} onPress={() => toggleIn('medical_history', h)} />
          ))}
        </View>

        <Text className="text-on-surface font-bold mb-2">饮食偏好</Text>
        <View className="flex-row flex-wrap gap-2 mb-6">
          {DIET_PREFS.map((d) => (
            <Chip key={d} label={d} selected={(form.diet_prefs || []).includes(d)} onPress={() => toggleIn('diet_prefs', d)} />
          ))}
        </View>

        <PrimaryButton title={saving ? '正在保存…' : '保存身体记录'} onPress={save} loading={saving} />

        {/* 趋势 */}
        <Text className="text-on-surface font-bold mt-6 mb-1">最近 7 天摄入与消耗</Text>
        <Text className="text-on-surface-variant text-[11px] mb-3">数据来自「暖心厨房」与「轻盈动起来」里的记录</Text>
        <View className="bg-surface rounded-3xl p-4 border border-outline-variant shadow-card">
          {trend.some((t) => (t.intake || 0) + (t.burn || 0) > 0) ? (
            <>
              <View className="flex-row items-end justify-between" style={{ height: 120 }}>
                {trend.map((t) => (
                  <View key={t.date} className="flex-1 items-center justify-end" style={{ height: '100%' }}>
                    <View className="flex-row items-end gap-0.5" style={{ height: '100%' }}>
                      <View style={{ width: 8, height: Math.max(2, ((t.intake || 0) / maxVal) * 100), backgroundColor: COLORS.secondary, borderRadius: 3 }} />
                      <View style={{ width: 8, height: Math.max(2, ((t.burn || 0) / maxVal) * 100), backgroundColor: COLORS.primary, borderRadius: 3 }} />
                    </View>
                  </View>
                ))}
              </View>
              <View className="flex-row justify-between mt-2">
                {trend.map((t) => (
                  <Text key={t.date} className="text-on-surface-variant text-[9px] flex-1 text-center">{t.date.slice(5)}</Text>
                ))}
              </View>
              <View className="flex-row gap-4 mt-3 justify-center">
                <View className="flex-row items-center gap-1.5">
                  <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.secondary }} />
                  <Text className="text-on-surface-variant text-[10px]">摄入 kcal</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.primary }} />
                  <Text className="text-on-surface-variant text-[10px]">消耗 kcal</Text>
                </View>
              </View>
            </>
          ) : (
            <View className="items-center py-4">
              <MaterialCommunityIcons name="chart-line" size={26} color={COLORS.onSurfaceVariant} />
              <Text className="text-on-surface-variant text-xs mt-2 text-center">还没有记录{'\n'}在厨房或运动页记一笔，这里就会长出柱状图</Text>
            </View>
          )}
        </View>

        {/* 历史 */}
        <Text className="text-on-surface font-bold mt-6 mb-3">历史记录</Text>
        {records.length ? records.slice(0, 10).map((r) => (
          <View key={r.id} className="bg-surface rounded-3xl p-4 border border-outline-variant mb-2 shadow-card">
            <Text className="text-on-surface-variant text-xs">{new Date(r.recorded_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
            <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
              {r.blood_pressure_systolic && <Text className="text-on-surface text-sm">血压 {r.blood_pressure_systolic}/{r.blood_pressure_diastolic}</Text>}
              {r.blood_sugar && <Text className="text-on-surface text-sm">血糖 {r.blood_sugar}</Text>}
              {r.heart_rate && <Text className="text-on-surface text-sm">心率 {r.heart_rate}</Text>}
              {r.weight && <Text className="text-on-surface text-sm">体重 {r.weight}kg</Text>}
              {r.waist && <Text className="text-on-surface text-sm">腰围 {r.waist}cm</Text>}
            </View>
          </View>
        )) : (
          <View className="bg-surface rounded-3xl p-6 items-center border border-dashed border-outline-variant">
            <MaterialCommunityIcons name="chart-line" size={28} color={COLORS.onSurfaceVariant} />
            <Text className="text-on-surface-variant mt-2 text-sm">还没有历史记录，点上方保存即可生成第一条</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
