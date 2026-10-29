import { LLMClient, Config, KnowledgeClient, DataSourceType, HeaderUtils, type Message } from "coze-coding-dev-sdk";
import type { Request } from "express";

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

const CHAT_SYSTEM = `你是"暖暖"，一款健康陪伴类应用"暖暖·陪跑"的暖心AI助手。请以亲近温馨的口吻称呼用户为"主人"。你的角色定位是"健康生活方式管理"，不做疾病诊断、不提供药物剂量建议。回答简洁友好、温暖治愈，可用少量emoji点缀。当涉及饮食/运动建议时，说明依据来源并附免责提示。`;

const DIET_SYSTEM = `你是营养健康助手"暖暖"。基于用户身体状况、当前目标，以及知识库检索到的《中国居民膳食指南2022》《食物成分表（第6版）》内容，给出科学、温和的饮食与菜谱建议。以"主人"称呼用户。必须：1) 明确标注推荐依据的知识库来源；2) 附上固定免责声明（定位为健康生活方式管理，不做诊断、不给药物剂量）；3) 推荐要个体化，考虑体检指标与病史。输出结构清晰。`;

const EXERCISE_SYSTEM = `你是运动健康助手"暖暖"。基于用户身体状况、当前目标，以及知识库检索到的《ACSM运动指南》内容，给出科学、安全、温和的运动计划建议。以"主人"称呼用户。必须：1) 明确标注依据的知识库来源《ACSM运动指南》；2) 附上固定免责声明（定位为健康生活方式管理，不做诊断、不给药物剂量）；3) 运动强度、频率、安全注意事项需结合用户体检指标与病史。输出结构清晰。`;

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
}

function ctxText(ctx: HealthContext): string {
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
  return parts.length ? `【用户身体状况与目标】\n${parts.map((p) => `- ${p}`).join("\n")}\n` : "";
}

export async function chatReply(req: Request, history: { role: string; content: string }[], ctx: HealthContext): Promise<string> {
  const { llm } = makeClient(req);
  const messages = [
    { role: "system" as const, content: CHAT_SYSTEM },
    { role: "system" as const, content: ctxText(ctx) },
    ...history.map((m) => ({ role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant", content: m.content })),
  ];
  // 确保至少一条 user
  if (!messages.some((m) => m.role === "user")) messages.push({ role: "user" as const, content: "你好" });
  const res = await llm.invoke(messages, { model: "doubao-seed-2-0-pro-260215", temperature: 0.8 });
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
  const messages: Message[] = [
    { role: "system", content: DIET_SYSTEM },
    { role: "system", content: ctxText(ctx) },
  ];
  if (kb.trim()) messages.push({ role: "system", content: `【知识库检索参考】\n${kb}` });
  messages.push({ role: "user", content: query });
  const res = await llm.invoke(messages, { model: "doubao-seed-2-0-pro-260215", temperature: 0.7 });
  return { content: res.content, sources: DIET_SOURCES, disclaimer: DIET_DISCLAIMER };
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
  const messages: Message[] = [
    { role: "system", content: EXERCISE_SYSTEM },
    { role: "system", content: ctxText(ctx) },
  ];
  if (kb.trim()) messages.push({ role: "system", content: `【知识库检索参考】\n${kb}` });
  messages.push({ role: "user", content: query });
  const res = await llm.invoke(messages, { model: "doubao-seed-2-0-pro-260215", temperature: 0.7 });
  return { content: res.content, sources: EXERCISE_SOURCES, disclaimer: EXERCISE_DISCLAIMER };
}

export { DataSourceType };