import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Field, PrimaryButton, Chip, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { apiPost } from '@/utils/api';

const HISTORIES = ['高血压', '糖尿病', '高血脂', '冠心病', '痛风', '甲状腺疾病', '骨质疏松', '哮喘', '慢性胃炎', '肾脏疾病', '脂肪肝'];

export default function OnboardingScreen() {
  const router = useSafeRouter();
  const { userId, refresh } = useUser();
  const [step, setStep] = useState(1);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bpS, setBpS] = useState('');
  const [bpD, setBpD] = useState('');
  const [bloodSugar, setBloodSugar] = useState('');
  const [bloodLipid, setBloodLipid] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [dietPrefs, setDietPrefs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (arr: string[], set: any, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const next = () => {
    if (step === 1 && !height) return;
    setStep((s) => s + 1);
  };

  const submit = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      /**
       * 服务端文件：server/src/routes/users.ts
       * 接口：POST /api/v1/users/:userId/health-profile
       * Body: height: string, weight: string, age: number, gender: string, bloodPressureSystolic: string, bloodPressureDiastolic: string, bloodSugar: string, totalCholesterol: string, heartRate: string, medicalHistory: string[], dietPrefs: string[]
       */
      await apiPost(`/api/v1/users/${userId}/health-profile`, {
        height, weight, age: Number(age || 0) || undefined, gender,
        bloodPressureSystolic: bpS, bloodPressureDiastolic: bpD,
        bloodSugar: '空腹血糖 ' + (bloodSugar || ''), totalCholesterol: bloodLipid, heartRate,
        medicalHistory: history, dietPrefs,
      });
      await refresh();
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center justify-between mt-2">
            <View className="w-11" />
            <Text className="text-lg font-bold text-ink">暖暖 · 认识主人啦</Text>
            <TouchableOpacity onPress={() => router.replace('/')}><Text className="text-ink-mute text-sm">跳过</Text></TouchableOpacity>
          </View>

          <View className="items-center mt-6">
            <View className="w-16 h-16 rounded-full bg-primary-container items-center justify-center">
              <MaterialCommunityIcons name="heart" size={30} color={COLORS.primary} />
            </View>
            <Text className="text-2xl font-bold text-ink mt-3">欢迎回家，主人</Text>
            <Text className="text-ink-mute text-center mt-2 leading-6">为了让暖暖更好地依据您的身体情况科学推荐饮食与运动，请先完善这份健康小档案。这些信息仅用于【健康生活方式管理】。</Text>
          </View>

          {/* 步骤条 */}
          <View className="flex-row items-center gap-2 mt-6">
            {[1, 2, 3].map((s) => (
              <View key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-outline-variant'}`} />
            ))}
            <Text className="text-ink-mute text-xs ml-1">{step}/3</Text>
          </View>

          {step === 1 && (
            <View className="mt-6 gap-5">
              <Text className="text-ink font-semibold">基本信息</Text>
              <Field value={height} onChangeText={setHeight} placeholder="身高（cm）" keyboardType="numeric" suffix="cm" />
              <Field value={weight} onChangeText={setWeight} placeholder="体重（kg）" keyboardType="numeric" suffix="kg" />
              <Field value={age} onChangeText={setAge} placeholder="年龄" keyboardType="numeric" suffix="岁" />
              <View>
                <Text className="text-ink-mute text-sm mb-2">性别</Text>
                <View className="flex-row gap-3">
                  {['男', '女'].map((g) => (
                    <Chip key={g} label={g} selected={gender === g} onPress={() => setGender(g)} />
                  ))}
                </View>
              </View>
              <PrimaryButton title="下一步" onPress={next} />
            </View>
          )}

          {step === 2 && (
            <View className="mt-6 gap-5">
              <Text className="text-ink font-semibold">健康指标</Text>
              <View className="flex-row gap-3">
                <View className="flex-1"><Field value={bpS} onChangeText={setBpS} placeholder="收缩压" keyboardType="numeric" suffix="mmHg" /></View>
                <View className="flex-1"><Field value={bpD} onChangeText={setBpD} placeholder="舒张压" keyboardType="numeric" suffix="mmHg" /></View>
              </View>
              <Field value={bloodSugar} onChangeText={setBloodSugar} placeholder="空腹血糖（mmol/L）" keyboardType="numeric" />
              <Field value={bloodLipid} onChangeText={setBloodLipid} placeholder="总胆固醇（mmol/L）" keyboardType="numeric" />
              <Field value={heartRate} onChangeText={setHeartRate} placeholder="静息心率（bpm）" keyboardType="numeric" suffix="bpm" />
              <View>
                <Text className="text-ink-mute text-sm mb-2">过往病史（可多选）</Text>
                <View className="flex-row flex-wrap gap-2">
                  {HISTORIES.map((h) => <Chip key={h} label={h} selected={history.includes(h)} onPress={() => toggle(history, setHistory, h)} />)}
                </View>
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity className="flex-1 h-14 rounded-3xl bg-surfaceContainer items-center justify-center border border-outline-variant" onPress={() => setStep(1)}>
                  <Text className="text-ink font-bold">上一步</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1" onPress={() => setStep(3)}><View className="h-14 rounded-3xl bg-primary items-center justify-center"><Text className="text-white font-bold">下一步</Text></View></TouchableOpacity>
              </View>
            </View>
          )}

          {step === 3 && (
            <View className="mt-6 gap-5">
              <Text className="text-ink font-semibold">生活习惯（可选）</Text>
              <Text className="text-ink-mute text-sm mb-2">饮食偏好</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {['清淡', '少盐少油', '素食', '高蛋白', '少甜食', '多蔬果'].map((d) => <Chip key={d} label={d} selected={dietPrefs.includes(d)} onPress={() => toggle(dietPrefs, setDietPrefs, d)} />)}
              </View>
              <View className="bg-primary-container rounded-3xl p-4">
                <MaterialCommunityIcons name="leaf" size={22} color={COLORS.primary} />
                <Text className="text-ink font-semibold mt-2">暖暖的小承诺</Text>
                <Text className="text-ink-mute text-sm mt-1 leading-5">您的健康信息仅用于健康生活方式管理建议，不做疾病诊断、不提供药物剂量。涉及特定疾病请咨询专业医护哦。</Text>
              </View>
              <View className="flex-row gap-3 mt-2">
                <TouchableOpacity className="rounded-3xl h-14 bg-surfaceContainer items-center justify-center flex-1 border border-outline-variant" onPress={() => setStep(2)}>
                  <Text className="text-ink font-bold">上一步</Text>
                </TouchableOpacity>
                <PrimaryButton title={saving ? '正在保存…' : '开始暖暖的陪伴之旅'} onPress={submit} loading={saving} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}