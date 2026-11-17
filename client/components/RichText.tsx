import React from 'react';
import { Text, View } from 'react-native';

/**
 * 轻量 Markdown 渲染（不引入额外依赖）
 * 目的：大模型回复里常带 ### 标题、**加粗**、- 列表、| 表格 |，
 * 直接塞进气泡会露出原始符号，读起来很乱。这里做最小必要处理：
 * 标题 → 小标题、列表 → 带圆点、表格 → 用间隔号连成一行、分隔线 → 细线。
 */

const DEFAULT_INK = '#2F2A24';
const DEFAULT_MUTE = '#6B6259';
const HAIRLINE = '#E2D8C8';

function inline(text: string, keyBase: string) {
  // 拆出 **加粗** 片段
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p !== '');
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return (
        <Text key={`${keyBase}-${i}`} style={{ fontWeight: '700' }}>
          {p.slice(2, -2)}
        </Text>
      );
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return (
        <Text key={`${keyBase}-${i}`} style={{ fontWeight: '600' }}>
          {p.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={`${keyBase}-${i}`}>{p}</Text>;
  });
}

function cleanLine(raw: string) {
  let s = raw.replace(/\r/g, '').trimEnd();
  // 表格行：| 餐次 | 搭配建议 |  →  餐次 · 搭配建议
  if (s.trim().startsWith('|')) {
    const cells = s
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '' && !/^:?-{2,}:?$/.test(c));
    if (!cells.length) return '';
    s = cells.join(' · ');
  }
  return s;
}

export function RichText({
  content,
  color = DEFAULT_INK,
  muted = DEFAULT_MUTE,
  size = 15,
}: {
  content: string;
  color?: string;
  muted?: string;
  size?: number;
}) {
  const lines = String(content || '').split('\n');
  const lineHeight = Math.round(size * 1.6);

  return (
    <View>
      {lines.map((raw, i) => {
        const line = cleanLine(raw);
        const trimmed = line.trim();

        if (!trimmed) return <View key={`b-${i}`} style={{ height: 6 }} />;

        // 分隔线
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          return <View key={`hr-${i}`} style={{ height: 1, backgroundColor: HAIRLINE, marginVertical: 8 }} />;
        }

        // 标题 # / ## / ###
        const h = trimmed.match(/^(#{1,6})\s*(.+)$/);
        if (h) {
          return (
            <Text
              key={`h-${i}`}
              style={{
                color,
                fontSize: size + 1,
                fontWeight: '700',
                lineHeight: lineHeight + 2,
                marginTop: i === 0 ? 0 : 8,
                marginBottom: 2,
              }}
            >
              {h[2].replace(/\*\*/g, '')}
            </Text>
          );
        }

        // 无序列表
        const bullet = trimmed.match(/^[-*•·]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={`u-${i}`} style={{ flexDirection: 'row', marginTop: 3 }}>
              <Text style={{ color: muted, marginRight: 6, lineHeight }}>·</Text>
              <Text style={{ flex: 1, color, fontSize: size, lineHeight }}>{inline(bullet[1], `u${i}`)}</Text>
            </View>
          );
        }

        // 有序列表
        const ordered = trimmed.match(/^(\d{1,2}[.、)])\s*(.*)$/);
        if (ordered) {
          return (
            <View key={`o-${i}`} style={{ flexDirection: 'row', marginTop: 3 }}>
              <Text style={{ color: muted, marginRight: 6, lineHeight, fontSize: size }}>{ordered[1]}</Text>
              <Text style={{ flex: 1, color, fontSize: size, lineHeight }}>{inline(ordered[2], `o${i}`)}</Text>
            </View>
          );
        }

        // 引用 / 提示
        const quote = trimmed.match(/^>\s?(.*)$/);
        if (quote) {
          return (
            <View
              key={`q-${i}`}
              style={{
                borderLeftWidth: 2,
                borderLeftColor: muted,
                paddingLeft: 8,
                marginVertical: 4,
              }}
            >
              <Text style={{ color: muted, fontSize: size - 1, lineHeight }}>{inline(quote[1], `q${i}`)}</Text>
            </View>
          );
        }

        return (
          <Text key={`p-${i}`} style={{ color, fontSize: size, lineHeight, marginTop: i === 0 ? 0 : 3 }}>
            {inline(trimmed, `p${i}`)}
          </Text>
        );
      })}
    </View>
  );
}
