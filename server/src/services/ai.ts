import { LLMClient, Config, KnowledgeClient, DataSourceType, HeaderUtils, type Message } from "coze-coding-dev-sdk";
import type { Request } from "express";
import { searchGuidelines, guidelinesToText } from "../data/guidelines";
import { findSubstitutes, substitutesToText } from "../data/substitutions";

export const DIET_SOURCES = ["中国居民膳食指南2022", "食物成分表第6版"];
export const EXERCISE_SOURCES = ["ACSM运动指南"];

export const DIET_DISCLAIMER =
  "本餐食建议仅作为健康生活方式管理参考，内容基于《中国居民膳食指南2022》《食物成分表（第6版）》等公开科普资料整理，不构成医疗诊断，亦不提供任何药物剂量建议。若涉及特定疾病或正在用药，请务必咨询专业医师或营养师后再行调整。";

export const EXERCISE_DISCLAIMER =
  "本运动建议仅作为健康生活方式管理参考，依据《ACSM运动指南》等公开运动科学资料整理，不构成医疗诊断，亦不提供任何药物剂量建议。运动前请确保身体状况允许；若有基础疾病或长期未运动者，请从低强度循序渐进，并咨询专业医护或运动教练后开展。";

function toHeaderRecord(raw: any): Record<string, string> {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (typeof v === "string") h[k] = v;
    else if (Array.isArray(v)) h[k] = v.join(", ");
  }
  return h;
}

function makeClient(req: Request) {
  const config = new Config();
  const headers = HeaderUtils.extractForwardHeaders(toHeaderRecord(req.headers));
  return {
    llm: new LLMClient(config, headers),
    knowledge: new KnowledgeClient(config, headers),
  };
}

const CHAT_SYSTEM = `你是"暖暖"，一款健康陪伴类应用"暖暖·陪跑"的暖心AI助手。请以亲近温馨的口吻称呼用户为"主人"。你的角色定位是"健康生活方式管理"，不做疾病诊断、不提供药物剂量建议。回答简洁友好、温暖治愈，可用少量emoji点缀。

【身体状况的使用方式】上下文中会给出一份系统整理好的身体状况简报，包括体检指标判读、病史约束、营养目标、指标变化趋势和近期打卡情况。这些数值与分级是系统按中国指南算好的，直接采用，不要自己重新计算或改判；能引用具体数字时优先引用（例如"你上周体重从 63.2 降到 62.5"），比泛泛而谈更有用。

【引用纪律（重要）】只有上下文里确实出现了某条指南条文时，才可以说"依据《XX》"。上下文没有提供条文时，就基于通用营养与运动常识回答，并说明这是通用建议、未针对具体指南条文。绝对不要为了显得专业而虚构书名、条文编号或研究结论——用户会信以为真。

【免责】涉及明显异常指标或症状时，提醒必要时就医确认，但这句提醒要自然带过，不要每句都加。

【排版要求】回答会显示在手机聊天气泡里，请遵守：
1. 默认用 2-4 句自然口语回复，不要长篇大论；
2. 不要使用 Markdown 表格、不要用 # 大标题、不要画分隔线；
3. 需要分点时最多 3-5 条，用"- "开头，每条一行、不换行内嵌套；
4. 需要强调时用少量加粗即可，不要整段加粗。`;

const DIET_SYSTEM = `你是营养健康助手"暖暖"。基于用户的身体状况简报、当前目标，以及系统提供的指南条文（若有），给出科学、温和的饮食与菜谱建议。以"主人"称呼用户。

必须做到：
1) 优先使用上下文里已给出的指标判读与营养目标数字（热量、蛋白、钠上限等），不要另算一套；
2) 推荐要个体化：避开用户病史对应的禁忌、避开其饮食偏好中不吃的食材；
3) 只有引用了上下文里真实存在的条文时才标注出处，没有就不要编造；
4) 回答末尾附一句简短免责（健康生活方式管理，不做诊断、不给药物剂量）。`;

const EXERCISE_SYSTEM = `你是运动健康助手"暖暖"。基于用户的身体状况简报、当前目标，以及系统提供的指南条文（若有），给出科学、安全、温和的运动建议。以"主人"称呼用户。

必须做到：
1) 结合体检指标与病史给强度：血压偏高时避免憋气发力动作，关节问题避免高冲击，BMI 偏高时优先低冲击有氧；
2) 给具体可执行的量（做什么、多久、一周几次、强度如何自测），不要只说"适量运动"；
3) 只有引用了上下文里真实存在的条文时才标注出处，没有就不要编造；
4) 回答末尾附一句简短免责（健康生活方式管理，不做诊断、不给药物剂量）。`;

export interface HealthContext {
  nickname?: string;
  height?: string;
  weight?: string;
  age?: string;
  gender?: string;
  bloodPressure?: string;
  bloodSugar?: string;
  bloodLipid?: string;
  heartRate?: string;
  medicalHistory?: string[];
  goals?: string[];
  /** 今日打卡计划（时间 + 内容），让对话能引用真实计划而不是泛泛而谈 */
  todayPlan?: string[];
  /** 今日完成情况，如 "2/6" */
  todayProgress?: string;
  /**
   * 身体状况完整简报：由 services/healthBrief.ts 汇总，
   * 含体检指标判读、病史约束、营养目标、指标变化趋势、打卡坚持情况。
   * 有这一段时优先使用它，上面的零散字段只作兜底。
   */
  brief?: string;
}

function ctxText(ctx: HealthContext): string {
  // 有完整简报时直接用，避免与零散字段重复占 token
  if (ctx.brief) {
    const extra: string[] = [];
    if (ctx.goals?.length) extra.push(`【当前目标】${ctx.goals.join("、")}`);
    if (ctx.todayPlan?.length) {
      extra.push(
        `【今日打卡计划】${ctx.todayProgress ? `（已完成 ${ctx.todayProgress}）` : ""}\n${ctx.todayPlan.map((p) => `- ${p}`).join("\n")}`
      );
    }
    return [ctx.brief, ...extra].join("\n\n");
  }

  const parts: string[] = [];
  if (ctx.height) parts.push(`身高${ctx.height}`);
  if (ctx.weight) parts.push(`体重${ctx.weight}`);
  if (ctx.age) parts.push(`年龄${ctx.age}`);
  if (ctx.gender) parts.push(`性别${ctx.gender}`);
  if (ctx.bloodPressure) parts.push(`血压${ctx.bloodPressure}`);
  if (ctx.bloodSugar) parts.push(`空腹血糖${ctx.bloodSugar}`);
  if (ctx.bloodLipid) parts.push(`血脂${ctx.bloodLipid}`);
  if (ctx.heartRate) parts.push(`静息心率${ctx.heartRate}`);
  if (ctx.medicalHistory?.length) parts.push(`过往病史：${ctx.medicalHistory.join("、")}`);
  if (ctx.goals?.length) parts.push(`当前目标：${ctx.goals.join("、")}`);
  let text = parts.length ? `【用户身体状况与目标】\n${parts.map((p) => `- ${p}`).join("\n")}\n` : "";
  if (ctx.todayPlan?.length) {
    text += `\n【今日打卡计划】${ctx.todayProgress ? `（已完成 ${ctx.todayProgress}）` : ""}\n${ctx.todayPlan.map((p) => `- ${p}`).join("\n")}\n`;
  }
  return text;
}

const MODEL = "doubao-seed-2-0-pro-260215";

/** 通用文本调用：供学习计划等需要模型做个性化微调的场景使用 */
export async function llmText(req: Request, system: string, user: string, temperature = 0.6): Promise<string> {
  const { llm } = makeClient(req);
  const res = await llm.invoke(
    [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    { model: MODEL, temperature }
  );
  return res.content || "";
}

export async function chatReply(req: Request, history: { role: string; content: string }[], ctx: HealthContext): Promise<string> {
  const { llm } = makeClient(req);
  const messages: Message[] = [
    { role: "system" as const, content: CHAT_SYSTEM },
    { role: "system" as const, content: ctxText(ctx) },
  ];

  // 用用户最后一句话去本地知识库里检索，命中才注入。
  // 命中为 0 时不注入任何条文，让模型老实说"这是通用建议"，
  // 而不是塞一堆不相关的条文逼它硬凑一句"依据《XX指南》"。
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";
  const refs: string[] = [];
  const hits = searchGuidelines(lastUser, 3);
  if (hits.length) refs.push(guidelinesToText(hits));
  // 用户问"不吃X能换什么""痛风能吃虾吗"时，给可执行的替代方案而不是只给禁令
  const subs = findSubstitutes(lastUser, 2);
  if (subs.length) refs.push(substitutesToText(subs));
  if (refs.length) {
    messages.push({ role: "system" as const, content: refs.join("\n\n") });
  }

  for (const m of history) {
    messages.push({ role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant", content: m.content });
  }

  // 确保至少一条 user
  if (!messages.some((m) => m.role === "user")) messages.push({ role: "user" as const, content: "你好" });
  const res = await llm.invoke(messages, { model: MODEL, temperature: 0.8 });
  return res.content;
}

export async function recommendDiet(req: Request, ctx: HealthContext, query: string): Promise<{ content: string; sources: string[]; disclaimer: string }> {
  const { llm, knowledge } = makeClient(req);
  let kb = "";
  try {
    const r = await knowledge.search(query, DIET_SOURCES, 5, 0.55);
    kb = r.code === 0 && r.chunks?.length ? r.chunks.map((c) => c.content).join("\n") : "";
  } catch {
    kb = "";
  }
  // 扣子知识库目前是空的，检索必为 0；用本地条文库兜底，保证模型手里真有东西可引
  const hits = searchGuidelines(query, 3);
  const refs: string[] = [];
  if (kb.trim()) refs.push(kb);
  if (hits.length) refs.push(guidelinesToText(hits));

  const messages: Message[] = [
    { role: "system", content: DIET_SYSTEM },
    { role: "system", content: ctxText(ctx) },
  ];
  if (refs.length) messages.push({ role: "system", content: `【可引用的参考资料】\n${refs.join("\n\n")}` });
  messages.push({ role: "user", content: query });
  const res = await llm.invoke(messages, { model: MODEL, temperature: 0.7 });

  // 只汇报真实存在的来源，不再无脑返回 DIET_SOURCES（那会让人以为查过指南原文）
  const sources = [...new Set([
    ...(kb.trim() ? DIET_SOURCES : []),
    ...hits.map((h) => h.source),
  ])];
  return { content: res.content, sources, disclaimer: DIET_DISCLAIMER };
}

export async function recommendExercise(req: Request, ctx: HealthContext, query: string): Promise<{ content: string; sources: string[]; disclaimer: string }> {
  const { llm, knowledge } = makeClient(req);
  let kb = "";
  try {
    const r = await knowledge.search(query, EXERCISE_SOURCES, 5, 0.55);
    kb = r.code === 0 && r.chunks?.length ? r.chunks.map((c) => c.content).join("\n") : "";
  } catch {
    kb = "";
  }
  const hits = searchGuidelines(query, 3);
  const refs: string[] = [];
  if (kb.trim()) refs.push(kb);
  if (hits.length) refs.push(guidelinesToText(hits));

  const messages: Message[] = [
    { role: "system", content: EXERCISE_SYSTEM },
    { role: "system", content: ctxText(ctx) },
  ];
  if (refs.length) messages.push({ role: "system", content: `【可引用的参考资料】\n${refs.join("\n\n")}` });
  messages.push({ role: "user", content: query });
  const res = await llm.invoke(messages, { model: MODEL, temperature: 0.7 });

  const sources = [...new Set([
    ...(kb.trim() ? EXERCISE_SOURCES : []),
    ...hits.map((h) => h.source),
  ])];
  return { content: res.content, sources, disclaimer: EXERCISE_DISCLAIMER };
}

export { DataSourceType };