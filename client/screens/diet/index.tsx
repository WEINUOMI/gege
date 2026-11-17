import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Modal,
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

interface Recipe {
  id: string;
  name: string;
  emoji: string;
  calories: number;
  protein: number;
  carb: number;
  fat: number;
  minutes: number;
  difficulty: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  cautions: string[];
  reason: string;
  source: string;
}

const QUICK_INGREDIENTS = ['鸡蛋', '番茄', '鸡胸肉', '青菜', '豆腐', '牛奶', '燕麦', '香菇', '牛肉', '虾仁', '西兰花', '黄瓜'];
const MEALS = ['早餐', '午餐', '晚餐', '加餐'];

function guessMeal(): string {
  const h = new Date().getHours();
  if (h < 10) return '早餐';
  if (h < 15) return '午餐';
  if (h < 21) return '晚餐';
  return '加餐';
}

export default function DietScreen() {
  const { userId } = useUser();
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [picking, setPicking] = useState<Recipe | null>(null);
  const [meal, setMeal] = useState(guessMeal());
  const [uploading, setUploading] = useState(false);
  const [today, setToday] = useState<any>({ dietCalories: 0, diet: [] });

  const loadToday = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await apiGet<any>(`/api/v1/records/today?userId=${userId}`);
      setToday(r);
    } catch { /* 记录读取失败不影响推荐 */ }
  }, [userId]);

  const fetchRecipes = useCallback(async (nextOffset: number, list: string[], append: boolean) => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await apiPost<any>('/api/v1/recommend/recipes', {
        userId, ingredients: list, limit: 3, offset: nextOffset,
      });
      const got: Recipe[] = r.recipes || [];
      setRecipes((prev) => (append ? [...prev, ...got] : got));
      setOffset(nextOffset);
      setNote(r.safetyNote || '');
      setConditions(r.conditions || []);
      setSources(r.sources || []);
      setDisclaimer(r.disclaimer || '');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '菜谱没取到', text2: e.message || '请检查网络后重试' });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadToday();
    if (!recipes.length) fetchRecipes(0, [], false);
  }, [userId]));

  const addIngredient = (v: string) => {
    const t = v.trim();
    if (!t || ingredients.includes(t)) { setInput(''); return; }
    setIngredients((l) => [...l, t]);
    setInput('');
  };
  const removeIngredient = (v: string) => setIngredients((l) => l.filter((x) => x !== v));

  const pickPhoto = async (fromCamera: boolean) => {
    try {
      if (Platform.OS !== 'web' && fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('需要相机权限', '开启后就能拍下这一餐啦'); return; }
        const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (res.canceled) return;
        await saveDiet(res.assets[0].uri);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled) return;
      await saveDiet(res.assets[0].uri);
    } catch {
      Alert.alert('没能打开相册', '可以先不拍照，直接记录这一餐');
    }
  };

  const saveDiet = async (uri?: string) => {
    if (!picking || !userId) return;
    setUploading(true);
    try {
      let key: string | undefined;
      if (uri) {
        const up = await uploadProof(uri, 'image/jpeg', 'meal.jpg');
        key = up.key;
      }
      const r = await apiPost<any>('/api/v1/records/diet', {
        userId, name: picking.name, calories: picking.calories, meal, photoKey: key,
      });
      Toast.show({ type: 'success', text1: '记下啦', text2: `+${r.pointsEarned} 积分，今日摄入已更新` });
      setPicking(null);
      loadToday();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '记录失败', text2: e.message || '请重试' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader
        title="暖心厨房"
        right={<MaterialCommunityIcons name="silverware-fork-knife" size={22} color={COLORS.primary} />}
      />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* 今日摄入 */}
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1 bg-surface rounded-3xl p-4 border border-outline-variant shadow-card">
            <Text className="text-on-surface-variant text-xs">今日已记录</Text>
            <Text className="text-primary text-2xl font-bold mt-1">{today.dietCalories || 0}<Text className="text-sm font-normal text-on-surface-variant"> kcal</Text></Text>
            <Text className="text-on-surface-variant text-[11px] mt-1">{(today.diet || []).length} 条记录</Text>
          </View>
          <View className="flex-1 bg-surface rounded-3xl p-4 border border-outline-variant shadow-card">
            <Text className="text-on-surface-variant text-xs">今日运动消耗</Text>
            <Text className="text-secondary text-2xl font-bold mt-1">{today.workoutCalories || 0}<Text className="text-sm font-normal text-on-surface-variant"> kcal</Text></Text>
            <Text className="text-on-surface-variant text-[11px] mt-1">{today.workoutMinutes || 0} 分钟</Text>
          </View>
        </View>

        {/* 个性化说明 */}
        {!!note && (
          <View className="bg-primary-container rounded-2xl px-4 py-3 mt-3">
            <Text className="text-on-surface text-xs leading-5">{note}</Text>
            {conditions.length > 0 && (
              <View className="flex-row flex-wrap gap-1.5 mt-2">
                {conditions.map((c) => (
                  <View key={c} className="bg-white/70 px-2 py-0.5 rounded-full">
                    <Text className="text-[10px] text-on-surface-variant">已按「{c}」筛选</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 冰箱食材 */}
        <View className="mt-5">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-on-surface font-bold">冰箱里有什么？</Text>
            <Text className="text-on-surface-variant text-xs">可不填，直接推荐</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="flex-1 flex-row items-center bg-surface rounded-2xl px-3 border border-outline-variant">
              <MaterialCommunityIcons name="fridge-outline" size={18} color={COLORS.onSurfaceVariant} />
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="输入食材，如 鸡胸肉"
                placeholderTextColor="#A99F92"
                className="flex-1 ml-2 py-3 text-on-surface"
                selectionColor={COLORS.primary}
                onSubmitEditing={() => addIngredient(input)}
                returnKeyType="done"
              />
            </View>
            <TouchableOpacity className="w-12 h-12 rounded-2xl bg-primary items-center justify-center" onPress={() => addIngredient(input)}>
              <MaterialCommunityIcons name="plus" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {ingredients.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mt-3">
              {ingredients.map((v) => (
                <TouchableOpacity key={v} className="flex-row items-center gap-1 bg-primary-container px-3 py-1.5 rounded-full" onPress={() => removeIngredient(v)}>
                  <Text className="text-on-surface text-xs">{v}</Text>
                  <MaterialCommunityIcons name="close" size={13} color={COLORS.onSurfaceVariant} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View className="flex-row flex-wrap gap-1.5 mt-3">
            {QUICK_INGREDIENTS.filter((q) => !ingredients.includes(q)).slice(0, 8).map((q) => (
              <TouchableOpacity key={q} className="px-2.5 py-1 rounded-full bg-surface border border-outline-variant" onPress={() => addIngredient(q)}>
                <Text className="text-on-surface-variant text-[11px]">{q}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            className="bg-secondary rounded-2xl py-3.5 items-center mt-4"
            style={{ opacity: loading ? 0.6 : 1 }}
            disabled={loading}
            onPress={() => fetchRecipes(0, ingredients, false)}
          >
            <Text className="text-white font-bold">{ingredients.length ? '用这些食材推荐 3 道' : '按我的身体情况推荐 3 道'}</Text>
          </TouchableOpacity>
        </View>

        {/* 菜谱卡 */}
        <View className="mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-on-surface font-bold">今日推荐</Text>
            {recipes.length > 0 && (
              <TouchableOpacity onPress={() => fetchRecipes(offset + 3, ingredients, false)} className="flex-row items-center gap-1">
                <MaterialCommunityIcons name="refresh" size={15} color={COLORS.secondary} />
                <Text className="text-secondary text-xs">换一批</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading && !recipes.length ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : recipes.length === 0 ? (
            <View className="bg-surface rounded-3xl p-6 items-center border border-dashed border-outline-variant">
              <MaterialCommunityIcons name="food-apple-outline" size={30} color={COLORS.onSurfaceVariant} />
              <Text className="text-on-surface-variant mt-2 text-center text-sm">还没有菜谱{'\n'}点上面的按钮，暖暖马上给你配</Text>
            </View>
          ) : (
            <View className="gap-3">
              {recipes.map((r) => (
                <View key={r.id} className="bg-surface rounded-3xl p-4 border border-outline-variant shadow-card">
                  <View className="flex-row items-start gap-3">
                    <View className="w-12 h-12 rounded-2xl bg-secondary-container items-center justify-center">
                      <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-on-surface font-bold flex-shrink">{r.name}</Text>
                        <View className="bg-surface-container px-2 py-0.5 rounded-full">
                          <Text className="text-[10px] text-on-surface-variant">{r.minutes} 分钟</Text>
                        </View>
                      </View>
                      <Text className="text-secondary text-xs mt-1">{r.calories} kcal · 蛋白 {r.protein}g · 碳水 {r.carb}g · 脂肪 {r.fat}g</Text>
                    </View>
                  </View>

                  <View className="flex-row flex-wrap gap-1.5 mt-3">
                    {r.tags.slice(0, 3).map((t) => (
                      <View key={t} className="bg-primary-container px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] text-on-surface">{t}</Text>
                      </View>
                    ))}
                  </View>

                  <View className="bg-surface-container rounded-2xl px-3 py-2 mt-3">
                    <Text className="text-on-surface-variant text-[11px] leading-4">💡 {r.reason}</Text>
                  </View>

                  <View className="flex-row gap-2 mt-3">
                    <TouchableOpacity className="flex-1 h-10 rounded-2xl bg-surface-container items-center justify-center" onPress={() => setDetail(r)}>
                      <Text className="text-on-surface text-xs font-semibold">看做法</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-1 h-10 rounded-2xl bg-primary items-center justify-center" onPress={() => { setMeal(guessMeal()); setPicking(r); }}>
                      <Text className="text-white text-xs font-bold">我吃了这道</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {recipes.length > 0 && recipes.length % 3 === 0 && (
            <TouchableOpacity className="mt-3 h-12 rounded-2xl border border-outline-variant items-center justify-center" onPress={() => fetchRecipes(offset + 3, ingredients, true)}>
              <Text className="text-on-surface-variant text-sm">{loading ? '加载中…' : '加载更多菜谱'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 出处与免责 */}
        <View className="mt-5 rounded-2xl px-4 py-3" style={{ backgroundColor: '#F6E9DC' }}>
          <Text className="text-[#8A5A3B] text-[11px] leading-5">
            数据来源：{sources.join('、') || '中国居民膳食指南（2022）、中国食物成分表（第6版）'}
            {'\n'}{disclaimer || '以上为生活方式管理参考，不构成医疗或营养治疗建议。'}
          </Text>
        </View>
      </ScrollView>

      {/* 做法详情 */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View className="flex-1 bg-black/30 justify-end">
          <View className="bg-surface rounded-t-3xl px-5 pt-5" style={{ maxHeight: '86%', backgroundColor: COLORS.surface }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {detail && (
                <>
                  <View className="flex-row items-center gap-3">
                    <Text style={{ fontSize: 28 }}>{detail.emoji}</Text>
                    <View className="flex-1">
                      <Text className="text-on-surface text-lg font-bold">{detail.name}</Text>
                      <Text className="text-on-surface-variant text-xs mt-0.5">{detail.minutes} 分钟 · {detail.difficulty} · {detail.calories} kcal</Text>
                    </View>
                    <TouchableOpacity onPress={() => setDetail(null)} className="w-9 h-9 rounded-full bg-surface-container items-center justify-center">
                      <MaterialCommunityIcons name="close" size={18} color={COLORS.onSurface} />
                    </TouchableOpacity>
                  </View>

                  <Text className="text-on-surface font-bold mt-5 mb-2">需要这些食材</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {detail.ingredients.map((i) => (
                      <View key={i} className="bg-surface-container px-2.5 py-1 rounded-full"><Text className="text-on-surface text-xs">{i}</Text></View>
                    ))}
                  </View>

                  <Text className="text-on-surface font-bold mt-5 mb-2">做法</Text>
                  {detail.steps.map((s, i) => (
                    <View key={i} className="flex-row gap-2 mb-2">
                      <View className="w-5 h-5 rounded-full bg-primary items-center justify-center mt-0.5">
                        <Text className="text-white text-[10px] font-bold">{i + 1}</Text>
                      </View>
                      <Text className="flex-1 text-on-surface text-sm leading-5">{s}</Text>
                    </View>
                  ))}

                  {detail.cautions.length > 0 && (
                    <>
                      <Text className="text-on-surface font-bold mt-4 mb-2">要留意</Text>
                      {detail.cautions.map((c, i) => (
                        <Text key={i} className="text-on-surface-variant text-xs leading-5">· {c}</Text>
                      ))}
                    </>
                  )}

                  <Text className="text-on-surface-variant text-[10px] mt-4 leading-4">出处：{detail.source}</Text>

                  <View className="h-4" />
                  <PrimaryButton title="我吃了这道，记一笔" onPress={() => { const d = detail; setDetail(null); setMeal(guessMeal()); setPicking(d); }} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 记录一餐 */}
      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <View className="flex-1 bg-black/30 items-center justify-center px-6">
          <View className="bg-surface rounded-3xl w-full p-5" style={{ backgroundColor: COLORS.surface }}>
            <Text className="text-on-surface font-bold text-center">记录「{picking?.name}」</Text>
            <Text className="text-on-surface-variant text-xs text-center mt-1">约 {picking?.calories} kcal · +8 积分</Text>

            <Text className="text-on-surface-variant text-xs mt-4 mb-2">这是哪一餐？</Text>
            <View className="flex-row flex-wrap gap-2">
              {MEALS.map((m) => (
                <TouchableOpacity
                  key={m}
                  className={`px-4 py-2 rounded-full border ${meal === m ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
                  onPress={() => setMeal(m)}
                >
                  <Text className="text-on-surface text-xs">{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="h-4" />
            <PrimaryButton title="拍照留个凭证" onPress={() => pickPhoto(true)} loading={uploading} />
            <View className="h-2" />
            <TouchableOpacity className="h-12 rounded-2xl bg-surface-container items-center justify-center" onPress={() => pickPhoto(false)} disabled={uploading}>
              <Text className="text-on-surface text-sm font-semibold">从相册选一张</Text>
            </TouchableOpacity>
            <View className="h-2" />
            <TouchableOpacity className="h-11 items-center justify-center" onPress={() => saveDiet()} disabled={uploading}>
              <Text className="text-on-surface-variant text-sm">不拍照，直接记录</Text>
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
