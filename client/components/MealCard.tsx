import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from './ui';

interface MealItem {
  name: string;
  matchedName?: string;
  grams: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sodium: number;
  matched: boolean;
}

interface MealData {
  imageUrl?: string;
  mealType: string;
  items: MealItem[];
  totals: { kcal: number; protein: number; carb: number; fat: number; sodium: number };
  note?: string;
  review: string;
  targetKcal: number | null;
  intakeBefore?: number;
  intakeAfter?: number;
  sources?: string[];
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

/**
 * 一餐的营养卡片。
 *
 * 热量与营养素全部来自服务端按《中国食物成分表》计算的结果，
 * 模型只参与识别和措辞，所以卡片上的数字是可复现的——
 * 同一盘菜今天算和明天算是同一个值。
 */
export function MealCard({ raw }: { raw: string }) {
  const [expanded, setExpanded] = useState(false);

  let data: MealData | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    return <Text className="text-ink text-sm">这一餐没能识别出具体食物。</Text>;
  }

  const { totals } = data;
  const target = data.targetKcal;
  const after = data.intakeAfter ?? totals.kcal;
  const pct = target ? Math.min(100, Math.round((after / target) * 100)) : 0;
  const over = target ? after > target : false;
  const barColor = !target ? COLORS.primary : over ? '#C0605C' : pct > 85 ? '#D99A3D' : COLORS.primary;
  const mealLabel = MEAL_LABEL[data.mealType] || '这一餐';

  const shown = expanded ? data.items : data.items.slice(0, 4);
  const restCount = data.items.length - shown.length;

  return (
    <View
      style={{
        backgroundColor: COLORS.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.outline,
        padding: 14,
        width: '100%',
      }}
    >
      {/* 标题行 */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <MaterialCommunityIcons name="silverware-fork-knife" size={14} color={COLORS.secondary} />
          <Text style={{ color: COLORS.onSurface, fontWeight: '700', fontSize: 14 }}>{mealLabel}</Text>
        </View>
        <Text style={{ color: COLORS.onSurface, fontWeight: '700', fontSize: 16 }}>
          {totals.kcal}
          <Text style={{ fontSize: 11, fontWeight: '400', color: COLORS.onSurfaceVariant }}> kcal</Text>
        </Text>
      </View>

      {/* 今日进度 */}
      {target ? (
        <View className="mt-2.5">
          <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceContainer, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(pct, 3)}%`, height: '100%', backgroundColor: barColor, borderRadius: 3 }} />
          </View>
          <View className="flex-row justify-between mt-1">
            <Text style={{ color: COLORS.onSurfaceVariant, fontSize: 10 }}>
              今日累计 {after} / {target} kcal
            </Text>
            <Text style={{ color: over ? '#C0605C' : COLORS.onSurfaceVariant, fontSize: 10, fontWeight: over ? '700' : '400' }}>
              {over ? `超出 ${after - target} kcal` : `还剩 ${Math.max(0, target - after)} kcal`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* 食物清单 */}
      <View className="mt-3">
        {shown.map((it, idx) => (
          <View key={`${it.name}-${idx}`} className="flex-row items-center justify-between py-1">
            <View className="flex-row items-center gap-1.5 flex-1">
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.outline }} />
              <Text style={{ color: COLORS.onSurface, fontSize: 12 }} numberOfLines={1}>
                {it.name}
              </Text>
              <Text style={{ color: COLORS.onSurfaceVariant, fontSize: 10 }}>{it.grams}g</Text>
              {!it.matched ? (
                <Text style={{ color: '#D99A3D', fontSize: 9 }}>估算</Text>
              ) : null}
            </View>
            <Text style={{ color: COLORS.onSurfaceVariant, fontSize: 11 }}>{it.kcal} kcal</Text>
          </View>
        ))}
        {restCount > 0 ? (
          <TouchableOpacity onPress={() => setExpanded(true)} className="pt-1">
            <Text style={{ color: COLORS.primary, fontSize: 11 }}>还有 {restCount} 项，展开 ▾</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 营养素 */}
      <View
        className="flex-row mt-3"
        style={{ borderTopWidth: 1, borderTopColor: COLORS.outline, paddingTop: 10 }}
      >
        {[
          { label: '蛋白', value: `${totals.protein}g` },
          { label: '碳水', value: `${totals.carb}g` },
          { label: '脂肪', value: `${totals.fat}g` },
          { label: '钠', value: `${totals.sodium}mg`, warn: totals.sodium > 800 },
        ].map((n) => (
          <View key={n.label} className="flex-1 items-center">
            <Text style={{ color: n.warn ? '#C0605C' : COLORS.onSurface, fontSize: 12, fontWeight: '600' }}>
              {n.value}
            </Text>
            <Text style={{ color: COLORS.onSurfaceVariant, fontSize: 9, marginTop: 1 }}>{n.label}</Text>
          </View>
        ))}
      </View>

      {/* 点评 */}
      {data.review ? (
        <Text style={{ color: COLORS.onSurface, fontSize: 12.5, lineHeight: 19, marginTop: 10 }}>
          {data.review}
        </Text>
      ) : null}

      {/* 估算说明 */}
      {data.note ? (
        <Text style={{ color: COLORS.onSurfaceVariant, fontSize: 10, lineHeight: 15, marginTop: 6 }}>
          {data.note}
        </Text>
      ) : null}

      <Text style={{ color: COLORS.onSurfaceVariant, fontSize: 9, marginTop: 8, opacity: 0.75 }}>
        热量按《中国食物成分表》计算，份量为画面估算，仅供参考
      </Text>
    </View>
  );
}
