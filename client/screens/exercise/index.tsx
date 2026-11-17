import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Linking,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { apiGet, apiPost, uploadProof } from '@/utils/api';

interface Workout {
  id: string;
  name: string;
  emoji: string;
  met: number;
  minutes: number;
  intensity: string;
  parts: string[];
  tags: string[];
  howTo: string[];
  cautions: string[];
  reason: string;
  calories: number;
  videoKeyword: string;
}

const PARTS = ['全身', '下肢', '上肢', '核心', '背部', '心肺'];
const DURATIONS = [
  { label: '15 分钟内', value: 15 },
  { label: '30 分钟内', value: 30 },
  { label: '不限时长', value: 0 },
];

export default function ExerciseScreen() {
  const { userId } = useUser();
  const [part, setPart] = useState('');
  const [maxMin, setMaxMin] = useState(0);
  const [list, setList] = useState<Workout[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [weight, setWeight] = useState(60);
  const [sources, setSources] = useState<string[]>([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [detail, setDetail] = useState<Workout | null>(null);
  const [picking, setPicking] = useState<Workout | null>(null);
  const [minutes, setMinutes] = useState(20);
  const [uploading, setUploading] = useState(false);
  const [today, setToday] = useState<any>({ workoutCalories: 0, workoutMinutes: 0, exercise: [] });

  const loadToday = useCallback(async () => {
    if (!userId) return;
    try { setToday(await apiGet<any>(`/api/v1/records/today?userId=${userId}`)); } catch { /* 忽略 */ }
  }, [userId]);

  const fetchList = useCallback(async (nextOffset: number, append: boolean, p: string, m: number) => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await apiPost<any>('/api/v1/recommend/workouts', {
        userId, parts: p ? [p] : [], minutes: m || undefined, limit: 3, offset: nextOffset,
      });
      const got: Workout[] = r.workouts || [];
      setList((prev) => (append ? [...prev, ...got] : got));
      setOffset(nextOffset);
      setNote(r.safetyNote || '');
      setConditions(r.conditions || []);
      setWeight(Number(r.weight) || 60);
      setSources(r.sources || []);
      setDisclaimer(r.disclaimer || '');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '没取到运动建议', text2: e.message || '请重试' });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadToday();
    if (!list.length) fetchList(0, false, '', 0);
  }, [userId]));

  const kcal = (met: number, min: number) => Math.round((met * 3.5 * weight) / 200 * min);

  const openVideo = async (w: Workout) => {
    const url = `https://search.bilibili.com/all?keyword=${encodeURIComponent(w.videoKeyword)}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error('no');
      await Linking.openURL(url);
    } catch {
      Alert.alert('打不开视频', '可以在 B 站或抖音里搜索：' + w.videoKeyword);
    }
  };

  const pickPhoto = async (fromCamera: boolean) => {
    try {
      if (Platform.OS !== 'web' && fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('需要相机权限', '拍一张运动后的照片，就算完成打卡'); return; }
        const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (res.canceled) return;
        await submit(res.assets[0].uri);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled) return;
      await submit(res.assets[0].uri);
    } catch {
      Alert.alert('没能打开相册', '可以稍后补凭证，这里先跳过');
    }
  };

  const submit = async (uri?: string) => {
    if (!picking || !userId) return;
    setUploading(true);
    try {
      let key: string | undefined;
      if (uri) {
        const up = await uploadProof(uri, 'image/jpeg', 'workout.jpg');
        key = up.key;
      }
      const r = await apiPost<any>('/api/v1/records/workout', {
        userId, name: picking.name, minutes, met: picking.met, calories: kcal(picking.met, minutes), photoKey: key,
      });
      Toast.show({ type: 'success', text1: '运动打卡完成', text2: `约消耗 ${r.calories} kcal，+${r.pointsEarned} 积分` });
      setPicking(null);
      loadToday();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '打卡失败', text2: e.message || '请重试' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="轻盈动起来" right={<MaterialCommunityIcons name="run" size={22} color={COLORS.primary} />} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* 今日数据 */}
        <View className="bg-surface rounded-3xl p-5 mt-4 border border-outline-variant shadow-card">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-on-surface-variant text-xs">今日消耗</Text>
              <Text className="text-primary text-3xl font-bold mt-1">{today.workoutCalories || 0}<Text className="text-base font-normal text-on-surface-variant"> kcal</Text></Text>
            </View>
            <View className="items-end">
              <Text className="text-on-surface-variant text-xs">运动时长</Text>
              <Text className="text-on-surface text-xl font-bold mt-1">{today.workoutMinutes || 0} 分钟</Text>
            </View>
          </View>
          {(today.exercise || []).length > 0 && (
            <View className="mt-3 pt-3 border-t border-outline-variant">
              {(today.exercise || []).slice(0, 3).map((r: any) => (
                <View key={r.id} className="flex-row items-center gap-2 py-1">
                  <MaterialCommunityIcons name="check-circle" size={14} color={COLORS.primary} />
                  <Text className="flex-1 text-on-surface text-xs" numberOfLines={1}>{r.title}</Text>
                  <Text className="text-on-surface-variant text-[10px]">{new Date(r.checkin_date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {!!note && (
          <View className="bg-primary-container rounded-2xl px-4 py-3 mt-3">
            <Text className="text-on-surface text-xs leading-5">{note}</Text>
            {conditions.length > 0 && (
              <Text className="text-on-surface-variant text-[10px] mt-1">已避开与「{conditions.join('、')}」冲突的动作</Text>
            )}
          </View>
        )}

        {/* 筛选 */}
        <Text className="text-on-surface font-bold mt-5 mb-2">想练哪里？</Text>
        <View className="flex-row flex-wrap gap-2">
          <TouchableOpacity
            className={`px-3.5 py-2 rounded-full border ${part === '' ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
            onPress={() => setPart('')}
          >
            <Text className="text-on-surface text-xs">都可以</Text>
          </TouchableOpacity>
          {PARTS.map((p) => (
            <TouchableOpacity
              key={p}
              className={`px-3.5 py-2 rounded-full border ${part === p ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
              onPress={() => setPart(part === p ? '' : p)}
            >
              <Text className="text-on-surface text-xs">{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-on-surface font-bold mt-4 mb-2">有多少时间？</Text>
        <View className="flex-row gap-2">
          {DURATIONS.map((d) => (
            <TouchableOpacity
              key={d.value}
              className={`flex-1 py-2 rounded-full border items-center ${maxMin === d.value ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
              onPress={() => setMaxMin(d.value)}
            >
              <Text className="text-on-surface text-xs">{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity className="bg-primary rounded-2xl py-3.5 items-center mt-4" style={{ opacity: loading ? 0.6 : 1 }} disabled={loading} onPress={() => fetchList(0, false, part, maxMin)}>
          <Text className="text-white font-bold">给我推荐 3 项运动</Text>
        </TouchableOpacity>

        {/* 运动卡片 */}
        <View className="mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-on-surface font-bold">建议今天练这些</Text>
            {list.length > 0 && (
              <TouchableOpacity className="flex-row items-center gap-1" onPress={() => fetchList(offset + 3, false, part, maxMin)}>
                <MaterialCommunityIcons name="refresh" size={15} color={COLORS.primary} />
                <Text className="text-primary text-xs">换一批</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading && !list.length ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : (
            <View className="gap-3">
              {list.map((w) => (
                <View key={w.id} className="bg-surface rounded-3xl p-4 border border-outline-variant shadow-card">
                  <View className="flex-row items-start gap-3">
                    <View className="w-12 h-12 rounded-2xl bg-primary-container items-center justify-center">
                      <Text style={{ fontSize: 22 }}>{w.emoji}</Text>
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-on-surface font-bold">{w.name}</Text>
                        <View className="bg-surface-container px-2 py-0.5 rounded-full">
                          <Text className="text-[10px] text-on-surface-variant">强度 {w.intensity}</Text>
                        </View>
                      </View>
                      <Text className="text-primary text-xs mt-1">
                        {w.minutes} 分钟 · 约消耗 {kcal(w.met, w.minutes)} kcal · MET {w.met}
                      </Text>
                      <Text className="text-on-surface-variant text-[10px] mt-0.5">{w.parts.join(' / ')}</Text>
                    </View>
                  </View>

                  <View className="bg-surface-container rounded-2xl px-3 py-2 mt-3">
                    <Text className="text-on-surface-variant text-[11px] leading-4">💡 {w.reason}</Text>
                  </View>

                  <View className="flex-row gap-2 mt-3">
                    <TouchableOpacity className="flex-1 h-10 rounded-2xl bg-surface-container items-center justify-center flex-row gap-1" onPress={() => setDetail(w)}>
                      <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.onSurface} />
                      <Text className="text-on-surface text-xs font-semibold">怎么做</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="h-10 px-3 rounded-2xl bg-surface-container items-center justify-center flex-row gap-1" onPress={() => openVideo(w)}>
                      <MaterialCommunityIcons name="play-circle-outline" size={14} color={COLORS.secondary} />
                      <Text className="text-secondary text-xs font-semibold">跟练</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-1 h-10 rounded-2xl bg-primary items-center justify-center" onPress={() => { setPicking(w); setMinutes(w.minutes); }}>
                      <Text className="text-white text-xs font-bold">完成打卡</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {list.length > 0 && list.length % 3 === 0 && (
            <TouchableOpacity className="mt-3 h-12 rounded-2xl border border-outline-variant items-center justify-center" onPress={() => fetchList(offset + 3, true, part, maxMin)}>
              <Text className="text-on-surface-variant text-sm">{loading ? '加载中…' : '加载更多'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="mt-5 rounded-2xl px-4 py-3" style={{ backgroundColor: '#F6E9DC' }}>
          <Text className="text-[#8A5A3B] text-[11px] leading-5">
            依据：{sources.join('、') || 'ACSM 运动测试与运动处方指南'}
            {'\n'}{disclaimer || '运动建议仅作生活方式管理参考，不构成运动处方。有基础疾病请先经医师评估。'}
          </Text>
        </View>
      </ScrollView>

      {/* 动作详情 */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View className="flex-1 bg-black/30 justify-end">
          <View className="bg-surface rounded-t-3xl px-5 pt-5" style={{ maxHeight: '84%', backgroundColor: COLORS.surface }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {detail && (
                <>
                  <View className="flex-row items-center gap-3">
                    <Text style={{ fontSize: 28 }}>{detail.emoji}</Text>
                    <View className="flex-1">
                      <Text className="text-on-surface text-lg font-bold">{detail.name}</Text>
                      <Text className="text-on-surface-variant text-xs mt-0.5">{detail.minutes} 分钟 · 强度 {detail.intensity} · 约 {kcal(detail.met, detail.minutes)} kcal</Text>
                    </View>
                    <TouchableOpacity className="w-9 h-9 rounded-full bg-surface-container items-center justify-center" onPress={() => setDetail(null)}>
                      <MaterialCommunityIcons name="close" size={18} color={COLORS.onSurface} />
                    </TouchableOpacity>
                  </View>

                  <Text className="text-on-surface font-bold mt-5 mb-2">动作要点</Text>
                  {detail.howTo.map((h, i) => (
                    <View key={i} className="flex-row gap-2 mb-2">
                      <View className="w-5 h-5 rounded-full bg-primary items-center justify-center mt-0.5">
                        <Text className="text-white text-[10px] font-bold">{i + 1}</Text>
                      </View>
                      <Text className="flex-1 text-on-surface text-sm leading-5">{h}</Text>
                    </View>
                  ))}

                  {detail.cautions.length > 0 && (
                    <>
                      <Text className="text-on-surface font-bold mt-4 mb-2">注意</Text>
                      {detail.cautions.map((c, i) => (
                        <Text key={i} className="text-on-surface-variant text-xs leading-5">· {c}</Text>
                      ))}
                    </>
                  )}

                  <View className="h-4" />
                  <TouchableOpacity className="h-12 rounded-2xl bg-surface-container items-center justify-center flex-row gap-2" onPress={() => openVideo(detail)}>
                    <MaterialCommunityIcons name="play-circle-outline" size={18} color={COLORS.secondary} />
                    <Text className="text-secondary text-sm font-semibold">看「{detail.videoKeyword}」跟练视频</Text>
                  </TouchableOpacity>
                  <View className="h-3" />
                  <PrimaryButton title="练完了，去打卡" onPress={() => { const d = detail; setDetail(null); setPicking(d); setMinutes(d.minutes); }} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 打卡 */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <View className="flex-1 bg-black/30 items-center justify-center px-6">
          <View className="bg-surface rounded-3xl w-full p-5" style={{ backgroundColor: COLORS.surface }}>
            <Text className="text-on-surface font-bold text-center">{picking?.name}</Text>
            <Text className="text-on-surface-variant text-xs text-center mt-1">按体重 {weight}kg 估算</Text>

            <View className="flex-row items-center justify-center gap-5 mt-4">
              <TouchableOpacity className="w-10 h-10 rounded-full bg-surface-container items-center justify-center" onPress={() => setMinutes((m) => Math.max(5, m - 5))}>
                <MaterialCommunityIcons name="minus" size={18} color={COLORS.onSurface} />
              </TouchableOpacity>
              <View className="items-center">
                <Text className="text-on-surface text-2xl font-bold">{minutes}<Text className="text-sm font-normal text-on-surface-variant"> 分钟</Text></Text>
                <Text className="text-primary text-xs mt-1">约消耗 {picking ? kcal(picking.met, minutes) : 0} kcal</Text>
              </View>
              <TouchableOpacity className="w-10 h-10 rounded-full bg-surface-container items-center justify-center" onPress={() => setMinutes((m) => Math.min(180, m + 5))}>
                <MaterialCommunityIcons name="plus" size={18} color={COLORS.onSurface} />
              </TouchableOpacity>
            </View>

            <View className="h-4" />
            <PrimaryButton title="拍照上传运动凭证" onPress={() => pickPhoto(true)} loading={uploading} />
            <View className="h-2" />
            <TouchableOpacity className="h-12 rounded-2xl bg-surface-container items-center justify-center" onPress={() => pickPhoto(false)} disabled={uploading}>
              <Text className="text-on-surface text-sm font-semibold">从相册选一张</Text>
            </TouchableOpacity>
            <View className="h-2" />
            <TouchableOpacity className="h-11 items-center justify-center" onPress={() => submit()} disabled={uploading}>
              <Text className="text-on-surface-variant text-sm">没有照片，先记上</Text>
            </TouchableOpacity>
            <TouchableOpacity className="h-10 items-center justify-center" onPress={() => setPicking(null)}>
              <Text className="text-on-surface-variant text-xs">取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
