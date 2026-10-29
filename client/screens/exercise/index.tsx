import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PageHeader, COLORS } from '@/components/ui';
import { useUser } from '@/contexts/UserContext';
import { apiPost } from '@/utils/api';

export default function ExerciseScreen() {
  const { userId } = useUser();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');

  useFocusEffect(useCallback(() => { if (content) return; handleAsk(''); }, [userId]));

  const handleAsk = async (q: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await apiPost<any>('/api/v1/recommend/exercise', { userId, query: q || undefined });
      setContent(r.content || r.error || '');
    } catch (e: any) { setContent('抱歉，暖暖暂时无法给出建议：' + (e.message || '请重试')); }
    finally { setLoading(false); }
  };

  const paragraphs = content.split('\n').filter(Boolean);

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} backgroundColor={COLORS.bg}>
      <PageHeader title="运动推荐" right={<MaterialCommunityIcons name="run" size={24} color={COLORS.primary} />} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary-container rounded-3xl p-4 my-4">
          <Text className="text-on-surface text-sm leading-6">暖暖基于《ACSM运动指南》建议，结合您的身体状况与目标，为您推荐可完成的多项运动（含时长、强度、热量消耗与安全提示），用于【健康生活方式管理】。</Text>
        </View>

        <View className="flex-row gap-2 mb-4">
          <View className="flex-1 flex-row items-center bg-surface rounded-2xl px-4 border border-outline-variant">
            <MaterialCommunityIcons name="walk" size={18} color={COLORS.onSurfaceVariant} />
            <TextInput value={query} onChangeText={setQuery} placeholder="补充说明，如想重点锻炼的部位…" placeholderTextColor="#A99F92" className="flex-1 ml-2 py-3 text-on-surface" selectionColor={COLORS.primary} />
          </View>
        </View>
        <TouchableOpacity onPress={() => handleAsk(query)} disabled={loading || !query.trim()}>
          <View style={{ opacity: loading || !query.trim() ? 0.5 : 1 }} className="bg-primary rounded-2xl py-3.5 items-center mb-5"><Text className="text-white font-bold">按我的需求推荐运动</Text></View>
        </TouchableOpacity>

        {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          : content ? (<View className="bg-surface rounded-3xl p-5 border border-outline-variant shadow-card">
              {paragraphs.map((p, i) => <Text key={i} className={`text-on-surface leading-6 text-[15px] ${p.startsWith('#') ? 'font-bold text-base mt-2' : 'mb-1.5'}`}>{p}</Text>)}
            </View>)
          : <View className="flex-1 items-center justify-center"><MaterialCommunityIcons name="dumbbell" size={40} color={COLORS.onSurfaceVariant} /><Text className="text-on-surface-variant mt-3">正在为您生成专属运动计划…</Text></View>}

        {content && (
          <View className="rounded-2xl px-4 py-3 mt-4" style={{ backgroundColor: '#F6E9DC' }}>
            <Text className="text-[#8A5A3B] text-xs leading-5">{'暖暖的温柔提醒：运动请循序渐进，量力而行，如有基础疾病请先咨询专业人士，本内容仅用于健康生活方式管理参考。'}</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}