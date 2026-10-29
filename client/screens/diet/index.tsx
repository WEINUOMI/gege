import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PageHeader, PrimaryButton, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { apiPost } from '@/utils/api';

export default function DietScreen() {
  const { userId } = useUser();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');

  useFocusEffect(useCallback(() => { if (content) return; handleAsk(''); }, [userId]));

  const handleAsk = async (q: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await apiPost<any>('/api/v1/recommend/diet', { userId, query: q || undefined });
      setContent(r.content || r.error || '');
    } catch (e: any) { setContent('抱歉，暖暖暂时无法给出建议：' + (e.message || '请重试')); }
    finally { setLoading(false); }
  };

  const paragraphs = content.split('\n').filter(Boolean);

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="饮食推荐" right={<MaterialCommunityIcons name="silverware-fork-knife" size={22} color={COLORS.primary} />} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary-container rounded-3xl p-4 my-4">
          <Text className="text-on-surface text-sm leading-6">暖暖基于《中国居民膳食指南（2022）》《中国食物成分表（第6版）》知识库，结合您的身体状况与目标，为【健康生活方式管理】提供温和的饮食建议（不做诊断、不给药物剂量）。</Text>
        </View>

        <View className="flex-row gap-2 mb-4">
          <View className="flex-1 flex-row items-center bg-surface rounded-2xl px-4 border border-outline-variant">
            <MaterialCommunityIcons name="fridge-outline" size={18} color={COLORS.onSurfaceVariant} />
            <TextInput value={query} onChangeText={setQuery} placeholder="告诉我冰箱里有什么食材…" placeholderTextColor="#A99F92" className="flex-1 ml-2 py-3 text-on-surface" selectionColor={COLORS.primary} />
          </View>
        </View>
        <TouchableOpacity onPress={() => handleAsk(query)} disabled={loading || !query.trim()}>
          <View style={{ opacity: loading || !query.trim() ? 0.5 : 1 }} className="bg-primary rounded-2xl py-3.5 items-center mb-5"><Text className="text-white font-bold">根据当前食材推荐菜谱</Text></View>
        </TouchableOpacity>

        {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          : content ? (<View className="bg-surface rounded-3xl p-5 border border-outline-variant shadow-card">
              {paragraphs.map((p, i) => <Text key={i} className={`text-on-surface leading-6 text-[15px] ${p.startsWith('#') ? 'font-bold text-base mt-2' : 'mb-1.5'}`}>{p}</Text>)}
            </View>)
          : <View className="flex-1 items-center justify-center"><MaterialCommunityIcons name="food-apple-outline" size={40} color={COLORS.onSurfaceVariant} /><Text className="text-on-surface-variant mt-3">正在为您生成专属饮食建议…</Text></View>}

        {content && (
          <View className="rounded-2xl px-4 py-3 mt-4" style={{ backgroundColor: '#F6E9DC' }}>
            <Text className="text-[#8A5A3B] text-xs leading-5">{'暖暖的温柔提醒：以上内容基于公开膳食指南与食物成分知识库整理，仅用于健康生活方式管理参考，不构成医疗建议，请根据自身情况量力而行。'}</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}