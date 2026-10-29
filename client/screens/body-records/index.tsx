import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, Field, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { apiGet, apiPost } from '@/utils/api';

export default function BodyRecordsScreen() {
  const { userId } = useUser();
  const [, force] = useState(0);
  const [form, setForm] = useState<any>({});
  const [records, setRecords] = useState<any[]>([]);
  const [saveRec, setSaveRec] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    apiGet(`/api/v1/users/me/${userId}`).then((r) => setForm(r.profile || {})).catch(() => undefined);
    apiGet(`/api/v1/users/${userId}/health-records`).then((r) => setRecords(r.records || [])).catch(() => undefined);
  }, [userId]));
  void force;

  const set = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await apiPost(`/api/v1/users/${userId}/health-profile`, {
        height: form.height, weight: form.weight, age: Number(form.age || 0) || undefined, gender: form.gender,
        bloodPressureSystolic: form.blood_pressure_systolic, bloodPressureDiastolic: form.blood_pressure_diastolic,
        bloodSugar: form.blood_sugar, totalCholesterol: form.total_cholesterol, heartRate: form.heart_rate,
        medicalHistory: form.medical_history || [], dietPrefs: form.diet_prefs || [],
      });
      await apiPost(`/api/v1/users/${userId}/health-records`, {
        bloodPressureSystolic: form.blood_pressure_systolic, bloodPressureDiastolic: form.blood_pressure_diastolic,
        bloodSugar: form.blood_sugar, totalCholesterol: form.total_cholesterol, heartRate: form.heart_rate, weight: form.weight,
      });
      Toast.show({ type: 'success', text1: '暖暖提醒', text2: '身体记录已保存，记得持续关注健康哦' });
      apiGet(`/api/v1/users/${userId}/health-records`).then((r) => setRecords(r.records || [])).catch(() => undefined);
    } catch (e: any) { Toast.show({ type: 'error', text1: '保存失败', text2: e.message }); }
    finally { setSaving(false); }
  };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="身体状况记录" />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary-container rounded-3xl p-4 my-4">
          <Text className="text-on-surface font-semibold leading-6">这些信息用于暖暖为您科学推荐饮食与运动，定位为【健康生活方式管理】，不做诊断、不给药物剂量。</Text>
        </View>

        <Text className="text-on-surface font-bold mb-3">基础信息</Text>
        <View className="gap-3 mb-5">
          <Field value={form.height} onChangeText={set('height')} placeholder="身高（cm）" suffix="cm" />
          <Field value={form.weight} onChangeText={set('weight')} placeholder="体重（kg）" suffix="kg" />
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

        <PrimaryButton title={saving ? '正在保存…' : '保存身体记录'} onPress={save} loading={saving} />

        <Text className="text-on-surface font-bold mt-6 mb-3">历史记录</Text>
        {records.length ? records.slice(0, 10).map((r) => (
          <View key={r.id} className="bg-surface rounded-3xl p-4 border border-outline-variant mb-2 shadow-card">
            <Text className="text-on-surface-variant text-xs">{new Date(r.recorded_at).toLocaleString()}</Text>
            <View className="flex-row flex-wrap gap-2 mt-2">
              {r.blood_pressure_systolic && <Text className="text-on-surface text-sm">血压 {r.blood_pressure_systolic}/{r.blood_pressure_diastolic}</Text>}
              {r.blood_sugar && <Text className="text-on-surface text-sm">血糖 {r.blood_sugar}</Text>}
              {r.heart_rate && <Text className="text-on-surface text-sm">心率 {r.heart_rate}</Text>}
              {r.weight && <Text className="text-on-surface text-sm">体重 {r.weight}</Text>}
            </View>
          </View>
        )) : (
          <View className="bg-surface rounded-3xl p-6 items-center border border-dashed border-outline-variant">
            <MaterialCommunityIcons name="chart-line" size={28} color={COLORS.onSurfaceVariant} />
            <Text className="text-on-surface-variant mt-2">还没有历史记录，点击上方保存即可生成</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}