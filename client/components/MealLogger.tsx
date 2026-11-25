import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Modal,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { COLORS } from '@/components/ui';
import { apiPost, uploadProof, uploadProofBase64 } from '@/utils/api';

interface MealItem {
  name: string;
  matchedName?: string;
  category?: string;
  grams: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sodium: number;
  matched: boolean;
  gramsAssumed?: boolean;
}

const MEALS = ['早餐', '午餐', '晚餐', '加餐'];
const MEAL_FROM_TYPE: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐',
};

function guessMeal(): string {
  const h = new Date().getHours();
  if (h < 10) return '早餐';
  if (h < 15) return '午餐';
  if (h < 21) return '晚餐';
  return '加餐';
}

/**
 * 记录「我实际吃的这一餐」。
 *
 * 推荐菜只是参考，真实吃饭场景里更多是外卖、家里做的、餐馆的。
 * 这里给两条录入路径：
 *   1) 拍照 / 相册 → 大模型认食物 → 系统按成分表算热量 → 用户核对后记录
 *   2) 直接打字填菜名 → 同样按成分表算，不依赖拍照
 * 识别结果可以删项、加项，热量也可以自己改——外卖份量本来就难估准。
 */
export function MealLogger({
  visible, userId, onClose, onSaved,
}: {
  visible: boolean;
  userId?: string;
  onClose: () => void;
  onSaved?: (result: any) => void;
}) {
  const [step, setStep] = useState<'source' | 'review'>('source');
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [items, setItems] = useState<MealItem[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [photoKey, setPhotoKey] = useState('');
  const [meal, setMeal] = useState(guessMeal());
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [kcalInput, setKcalInput] = useState('');
  const [note, setNote] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStep('source');
    setItems([]);
    setImageUrl('');
    setPhotoKey('');
    setMeal(guessMeal());
    setAddName('');
    setKcalInput('');
    setNote('');
    setHint('');
    setBusy(false);
  }, [visible]);

  const total = items.reduce((n, i) => n + i.kcal, 0);

  const uploadMedia = async (asset: ImagePicker.ImagePickerAsset) => {
    const mime = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const isVideo = mime.startsWith('video/');
    if (isVideo) {
      if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) throw new Error('视频太大，请裁短一些');
      const up = await uploadProof(asset.uri, mime, 'meal.mp4');
      return { url: up.url as string, key: up.key as string, isVideo: true };
    }
    // 图片优先走 base64 通道：原生端 multipart 在部分机型会被网关中断
    if (asset.base64) {
      try {
        const up = await uploadProofBase64(asset.base64, mime, 'meal.jpg');
        if (up?.url) return { url: up.url, key: up.key, isVideo: false };
      } catch {
        // 落回表单通道
      }
    }
    const up = await uploadProof(asset.uri, mime, 'meal.jpg');
    return { url: up.url as string, key: up.key as string, isVideo: false };
  };

  const pick = async (source: 'camera' | 'library' | 'video') => {
    if (!userId || busy) return;
    // 网页端没有原生相机接口，拍照/拍视频统一退回相册
    const effective = Platform.OS === 'web' && source !== 'library' ? 'library' : source;
    try {
      if (Platform.OS !== 'web' && effective !== 'library') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('需要相机权限', '在手机设置里打开相机权限，就能拍这一餐了');
          return;
        }
      }

      setBusy(true);
      setBusyText('正在准备…');
      let res: ImagePicker.ImagePickerResult;
      if (effective === 'camera') {
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
      } else if (effective === 'video') {
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 10, quality: 0.5 });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
      }
      if (res.canceled || !res.assets?.length) {
        setBusy(false);
        return;
      }

      setBusyText('正在上传…');
      const media = await uploadMedia(res.assets[0]);

      setBusyText('正在认食物…');
      const r = await apiPost<any>('/api/v1/meals/analyze', {
        userId,
        imageUrl: media.isVideo ? '' : media.url,
        videoUrl: media.isVideo ? media.url : '',
        save: false, // 只是预览，确认后才真正记成一餐
      });

      if (!r?.ok || !r.items?.length) {
        setBusy(false);
        setImageUrl(media.url);
        setPhotoKey(media.key);
        Alert.alert(
          '这张没认出来',
          `${r?.review || r?.note || '画面里没找到食物'}。\n\n可以换一张能看全盘子的照片，或者直接打字填入你吃了什么。`,
        );
        setStep('review');
        setHint('刚才那张图没认出来，手动填一下菜名也可以，热量照成分表算。');
        return;
      }

      setItems(r.items);
      setImageUrl(media.url);
      setPhotoKey(media.key);
      setMeal(MEAL_FROM_TYPE[r.mealType] || guessMeal());
      setNote(r.note || '');
      setHint('');
      setStep('review');
      setBusy(false);
    } catch (e: any) {
      setBusy(false);
      Alert.alert('没能完成', e?.message || '检查一下网络再试，或者直接手动填');
    }
  };

  const addItem = async () => {
    const name = addName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const r = await apiPost<any>('/api/v1/meals/estimate', { items: [{ name }] });
      const got: MealItem[] = r.items || [];
      if (!got.length) {
        Toast.show({ type: 'error', text1: '没算出来', text2: '换个更常见的叫法试试' });
        return;
      }
      setItems((prev) => [...prev, ...got]);
      setAddName('');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '添加失败', text2: e?.message || '请重试' });
    } finally {
      setAdding(false);
    }
  };

  const confirm = async () => {
    if (!userId) return;
    if (!items.length) {
      Alert.alert('还没填内容', '先加一样吃了什么，或者退回上一步拍照');
      return;
    }
    setBusy(true);
    setBusyText('正在记账…');
    try {
      const r = await apiPost<any>('/api/v1/meals/log', {
        userId,
        meal,
        items: items.map((i) => ({ name: i.name, grams: i.grams, category: i.category })),
        imageUrl,
        photoKey,
        kcal: Number(kcalInput) || 0,
      });
      Toast.show({
        type: 'success',
        text1: '记下啦',
        text2: `约 ${r?.totals?.kcal || total} kcal，+${r?.pointsEarned ?? 8} 积分`,
      });
      onSaved?.(r);
      onClose();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: '记录失败', text2: e?.message || '请重试' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/30 justify-end">
        <View
          className="rounded-t-3xl px-5 pt-5"
          style={{ maxHeight: '90%', backgroundColor: COLORS.surface }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-ink text-lg font-bold">
              {step === 'source' ? '记我实际吃的' : '核对一下这餐'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="w-9 h-9 rounded-full bg-surface-container items-center justify-center"
            >
              <MaterialCommunityIcons name="close" size={18} color={COLORS.onSurface} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            {step === 'source' ? (
              <>
                <Text className="text-ink-mute text-xs mt-1 leading-5">
                  不在今日推荐里也能记。拍照让暖暖认，或者直接打字填。
                </Text>

                <View className="gap-2.5 mt-4">
                  {[
                    { key: 'camera', icon: 'camera-outline', title: '拍一张现在的饭菜', desc: '识别后自动算热量' },
                    { key: 'library', icon: 'image-multiple-outline', title: '从相册选一张', desc: '已经吃完了、之前拍的都行' },
                    { key: 'video', icon: 'video-outline', title: '拍一段短视频', desc: '菜多、看不全的时候更好认' },
                  ].map((s) => (
                    <TouchableOpacity
                      key={s.key}
                      disabled={busy}
                      onPress={() => pick(s.key as any)}
                      className="flex-row items-center gap-3 bg-surface-container rounded-2xl px-4 py-3.5"
                      style={{ opacity: busy ? 0.5 : 1 }}
                    >
                      <View className="w-10 h-10 rounded-xl bg-surface items-center justify-center">
                        <MaterialCommunityIcons name={s.icon as any} size={20} color={COLORS.secondary} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-ink text-sm font-semibold">{s.title}</Text>
                        <Text className="text-ink-mute text-[11px] mt-0.5">{s.desc}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.onSurfaceVariant} />
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  disabled={busy}
                  onPress={() => { setStep('review'); setHint('输入菜名，比如「米饭」「番茄炒蛋」，点 + 加入清单。'); }}
                  className="flex-row items-center gap-3 rounded-2xl px-4 py-3.5 mt-2.5 border border-dashed"
                  style={{ borderColor: COLORS.outline, opacity: busy ? 0.5 : 1 }}
                >
                  <View className="w-10 h-10 rounded-xl bg-surface items-center justify-center">
                    <MaterialCommunityIcons name="pencil-outline" size={20} color={COLORS.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-ink text-sm font-semibold">手动填写菜名</Text>
                    <Text className="text-ink-mute text-[11px] mt-0.5">不想拍照，或照片里认不出时用</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.onSurfaceVariant} />
                </TouchableOpacity>

                {busy && (
                  <View className="flex-row items-center justify-center gap-2 mt-5">
                    <ActivityIndicator color={COLORS.primary} />
                    <Text className="text-ink-mute text-xs">{busyText}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                {imageUrl ? (
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <MaterialCommunityIcons name="check-circle" size={13} color={COLORS.primary} />
                    <Text className="text-ink-mute text-[11px]">照片已附在这一餐里</Text>
                  </View>
                ) : null}

                {!!hint && (
                  <View className="bg-primary-container rounded-xl px-3 py-2 mt-3">
                    <Text className="text-ink text-[11px] leading-4">{hint}</Text>
                  </View>
                )}

                {/* 食物清单 */}
                <View className="mt-3">
                  {items.map((it, idx) => (
                    <View key={`${it.name}-${idx}`} className="flex-row items-center gap-2 py-2 border-b" style={{ borderBottomColor: COLORS.outline }}>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-ink text-sm" numberOfLines={1}>{it.name}</Text>
                          {!it.matched ? <Text className="text-[9px] text-[#D99A3D]">估算</Text> : null}
                        </View>
                        <Text className="text-ink-mute text-[11px] mt-0.5">
                          {it.grams}g · {it.kcal} kcal
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="w-7 h-7 rounded-full bg-surface-container items-center justify-center"
                      >
                        <MaterialCommunityIcons name="close" size={14} color={COLORS.onSurfaceVariant} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {!items.length && (
                    <Text className="text-ink-mute text-xs text-center py-4">
                      还没加东西，在下面输入菜名
                    </Text>
                  )}
                </View>

                {/* 加一样 */}
                <View className="flex-row items-center gap-2 mt-3">
                  <View className="flex-1 flex-row items-center bg-surface-container rounded-2xl px-3">
                    <MaterialCommunityIcons name="plus-circle-outline" size={16} color={COLORS.onSurfaceVariant} />
                    <TextInput
                      value={addName}
                      onChangeText={setAddName}
                      placeholder="再加一样，如 红烧肉"
                      placeholderTextColor="#A99F92"
                      className="flex-1 ml-2 py-3 text-ink"
                      selectionColor={COLORS.primary}
                      onSubmitEditing={addItem}
                      returnKeyType="done"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={addItem}
                    disabled={adding || !addName.trim()}
                    className="w-11 h-11 rounded-2xl bg-primary items-center justify-center"
                    style={{ opacity: adding || !addName.trim() ? 0.5 : 1 }}
                  >
                    {adding ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="plus" size={20} color="#fff" />}
                  </TouchableOpacity>
                </View>

                {/* 合计 */}
                <View className="flex-row items-end justify-between mt-4">
                  <Text className="text-ink-mute text-xs">共 {items.length} 样</Text>
                  <Text className="text-ink text-xl font-bold">
                    {total}<Text className="text-xs font-normal text-ink-mute"> kcal</Text>
                  </Text>
                </View>

                {/* 餐次 */}
                <Text className="text-ink-mute text-xs mt-4 mb-2">这是哪一餐？</Text>
                <View className="flex-row flex-wrap gap-2">
                  {MEALS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setMeal(m)}
                      className={`px-4 py-2 rounded-full border ${meal === m ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant'}`}
                    >
                      <Text className="text-ink text-xs">{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 手动改热量 */}
                <Text className="text-ink-mute text-xs mt-4 mb-2">实际热量（知道就填，不知道留空）</Text>
                <View className="flex-row items-center bg-surface-container rounded-2xl px-3">
                  <TextInput
                    value={kcalInput}
                    onChangeText={(t) => setKcalInput(t.replace(/[^\d]/g, ''))}
                    placeholder={`按成分表估算约 ${total} kcal`}
                    placeholderTextColor="#A99F92"
                    keyboardType="number-pad"
                    className="flex-1 py-3 text-ink"
                    selectionColor={COLORS.primary}
                  />
                  <Text className="text-ink-mute text-xs">kcal</Text>
                </View>

                {!!note && (
                  <Text className="text-ink-mute text-[10px] mt-2 leading-4">{note}</Text>
                )}
                <Text className="text-ink-mute text-[10px] mt-2 leading-4">
                  热量按《中国食物成分表》计算，份量为估算，仅作生活方式管理参考。
                </Text>

                <View className="h-4" />
                <TouchableOpacity
                  onPress={confirm}
                  disabled={busy || !items.length}
                  className="rounded-2xl bg-primary items-center justify-center py-3.5"
                  style={{ opacity: busy || !items.length ? 0.5 : 1 }}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">确认记录这一餐</Text>}
                </TouchableOpacity>
                <TouchableOpacity className="h-11 items-center justify-center mt-1" onPress={() => setStep('source')}>
                  <Text className="text-ink-mute text-xs">返回，换张照片</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
