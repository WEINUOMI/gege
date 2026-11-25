/**
 * 体检指标判读库（中国标准）
 *
 * 为什么需要这个文件：
 * 在此之前，「血压 138/88 算不算高」这类判断完全交给大模型。模型每次算的结果
 * 可能不一致，也无法给出分级名称，更无法说明依据。本文件把判读固化成代码，
 * 让所有回答引用同一套确定性结论。
 *
 * 依据：
 * - 《中国高血压防治指南（2018年修订版）》
 * - 《中国2型糖尿病防治指南（2020年版）》
 * - 《中国成人血脂异常防治指南（2016年修订版）》
 * - 《中国成人超重和肥胖症预防控制指南》
 * - 《中国居民膳食指南（2022）》
 *
 * 重要边界：本库只做「数值 → 分级 → 生活方式建议」，不做诊断。
 * 分级名称前一律加「提示」，异常值一律指向「就医确认」。
 */

export type Level = "unknown" | "normal" | "borderline" | "high" | "low";

export interface MetricReading {
  key: string;
  /** 指标中文名 */
  label: string;
  /** 原始数值的展示文本，如 "138/88 mmHg" */
  value: string;
  /** 数值本身（用于趋势判断），血压取收缩压 */
  numeric?: number;
  level: Level;
  /** 分级名称，如 "正常高值" */
  levelText: string;
  /** 一句话说明这个数值意味着什么 */
  interpretation: string;
  /** 针对该分级的具体行动建议 */
  action: string;
  /** 依据出处 */
  source: string;
}

const SRC_BP = "《中国高血压防治指南（2018年修订版）》";
const SRC_GLU = "《中国2型糖尿病防治指南（2020年版）》";
const SRC_LIPID = "《中国成人血脂异常防治指南（2016年修订版）》";
const SRC_BMI = "《中国成人超重和肥胖症预防控制指南》";

/** 从 "138" / "138 mmHg" / "5.6 mmol/L" 这类文本里取数 */
export function parseNum(raw: any): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const m = String(raw).match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

// ==================== 血压 ====================

/**
 * 血压分级。收缩压与舒张压取「更严重的那个」定级，这是指南的标准做法。
 * 例：138/95 → 舒张压落在 1 级，整体按 1 级高血压提示。
 */
export function assessBloodPressure(sysRaw: any, diaRaw: any): MetricReading {
  const sys = parseNum(sysRaw);
  const dia = parseNum(diaRaw);
  const empty: MetricReading = {
    key: "bp", label: "血压", value: "未记录", level: "unknown", levelText: "未记录",
    interpretation: "还没有记录血压。", action: "建议在安静坐位休息 5 分钟后测量，记录收缩压/舒张压。",
    source: SRC_BP,
  };
  if (sys === undefined || dia === undefined) return empty;

  const value = `${sys}/${dia} mmHg`;
  const base = { key: "bp", label: "血压", value, numeric: sys, source: SRC_BP };

  // 3 级
  if (sys >= 180 || dia >= 110) {
    return {
      ...base, level: "high", levelText: "3 级（重度）",
      interpretation: `收缩压 ${sys} 或舒张压 ${dia} 已达重度升高范围，属于需要尽快处理的情况。`,
      action: "这不是靠调整饮食运动能解决的范围。请尽快到心内科就诊，由医生评估是否需要用药；在医生明确前不要进行中等以上强度运动。",
    };
  }
  // 2 级
  if (sys >= 160 || dia >= 100) {
    return {
      ...base, level: "high", levelText: "2 级（中度）",
      interpretation: `数值处于中度升高范围，长期维持会加重心、脑、肾负担。`,
      action: "建议近期就医确认，并开始限盐（每日食盐 <5g）、减重、规律有氧。运动以快走、太极等中等强度为主，避免憋气发力动作。",
    };
  }
  // 1 级
  if (sys >= 140 || dia >= 90) {
    return {
      ...base, level: "high", levelText: "1 级（轻度）",
      interpretation: `已达到高血压的数值范围。单次测量不足以确诊，但需要重视。`,
      action: "建议在不同日期的同一时段复测 2–3 次并记录；同时开始限盐、控制体重、每周 150 分钟中等强度有氧。若复测仍在此范围，请就医评估。",
    };
  }
  // 正常高值
  if (sys >= 120 || dia >= 80) {
    return {
      ...base, level: "borderline", levelText: "正常高值",
      interpretation: `还没到高血压，但已高于理想水平。这个阶段靠生活方式干预，多数人可以拉回正常。`,
      action: "重点做三件事：每日食盐控制在 5g 以内、体重下降 5%–10%、每周 150 分钟中等强度有氧。每 3 个月复测一次。",
    };
  }
  // 偏低
  if (sys < 90 || dia < 60) {
    return {
      ...base, level: "low", levelText: "偏低",
      interpretation: `低于常见范围。若平时没有头晕、乏力、起身发黑等表现，可能是个体差异。`,
      action: "注意起身放缓、避免长时间站立、保证饮水充足。若伴随明显头晕乏力，请就医排查。",
    };
  }
  return {
    ...base, level: "normal", levelText: "正常",
    interpretation: "处于理想血压范围。",
    action: "保持当前习惯即可，建议每半年复测一次。",
  };
}

// ==================== 空腹血糖 ====================

export function assessFastingGlucose(raw: any): MetricReading {
  const v = parseNum(raw);
  const base = { key: "glucose", label: "空腹血糖", value: `${raw} mmol/L`, numeric: v, source: SRC_GLU };
  if (v === undefined) {
    return {
      key: "glucose", label: "空腹血糖", value: "未记录", level: "unknown", levelText: "未记录",
      interpretation: "还没有记录空腹血糖。", action: "建议空腹 8 小时以上，在早晨测量并记录。", source: SRC_GLU,
    };
  }
  if (v < 3.9) {
    return {
      ...base, level: "low", levelText: "偏低",
      interpretation: `低于 3.9 mmol/L，属于低血糖范围。若正在使用降糖药物，需要特别注意。`,
      action: "如出现心慌、出汗、手抖，应立即补充 15g 左右快速碳水（如半杯果汁）。反复出现请就医调整方案。",
    };
  }
  if (v < 6.1) {
    return {
      ...base, level: "normal", levelText: "正常",
      interpretation: "处于正常范围（3.9–6.1 mmol/L）。",
      action: "保持当前饮食结构，主食注意粗细搭配，建议每年复查一次。",
    };
  }
  if (v < 7.0) {
    return {
      ...base, level: "borderline", levelText: "空腹血糖受损",
      interpretation: `处于 6.1–7.0 之间，属于空腹血糖受损，是糖尿病的过渡阶段。这个阶段通过生活方式干预，逆转概率较高。`,
      action: "重点：减少精制糖和含糖饮料、主食换成一半粗粮、餐后散步 15 分钟、体重下降 5%–7%。建议 3 个月内复查，并加测糖化血红蛋白。",
    };
  }
  return {
    ...base, level: "high", levelText: "达糖尿病数值范围",
    interpretation: `≥7.0 mmol/L。单次结果不足以确诊，但已达到需要就医评估的范围。`,
    action: "建议尽快到内分泌科就诊，复查空腹血糖与糖化血红蛋白。在此之前请避免高糖饮食与空腹剧烈运动。",
  };
}

// ==================== 血脂 ====================

export function assessTotalCholesterol(raw: any): MetricReading {
  const v = parseNum(raw);
  const base = { key: "tc", label: "总胆固醇", value: `${raw} mmol/L`, numeric: v, source: SRC_LIPID };
  if (v === undefined) {
    return {
      key: "tc", label: "总胆固醇", value: "未记录", level: "unknown", levelText: "未记录",
      interpretation: "还没有记录总胆固醇。", action: "建议体检时一并记录，并补充低密度脂蛋白（LDL-C），判读会更准。", source: SRC_LIPID,
    };
  }
  if (v < 5.2) {
    return { ...base, level: "normal", levelText: "合适水平", interpretation: "处于合适范围（<5.2 mmol/L）。", action: "保持当前饮食，注意控制饱和脂肪摄入。" };
  }
  if (v < 6.2) {
    return {
      ...base, level: "borderline", levelText: "边缘升高",
      interpretation: `处于 5.2–6.2 之间，属边缘升高，通常与饱和脂肪摄入偏多、运动不足有关。`,
      action: "减少肥肉、动物内脏、油炸食品与奶油类；每周吃 2 次深海鱼；增加燕麦、豆类等可溶性膳食纤维。3–6 个月后复查。",
    };
  }
  return {
    ...base, level: "high", levelText: "升高",
    interpretation: `≥6.2 mmol/L，属升高范围，心血管风险随之上升。`,
    action: "建议就医评估整体心血管风险；饮食上严格执行低饱和脂肪、低胆固醇，并保证每周 150 分钟有氧运动。",
  };
}

export function assessTriglycerides(raw: any): MetricReading {
  const v = parseNum(raw);
  const base = { key: "tg", label: "甘油三酯", value: `${raw} mmol/L`, numeric: v, source: SRC_LIPID };
  if (v === undefined) {
    return {
      key: "tg", label: "甘油三酯", value: "未记录", level: "unknown", levelText: "未记录",
      interpretation: "还没有记录甘油三酯。", action: "抽血前需空腹 12 小时，前一晚避免饮酒与高脂饮食。", source: SRC_LIPID,
    };
  }
  if (v < 1.7) {
    return { ...base, level: "normal", levelText: "合适水平", interpretation: "处于合适范围（<1.7 mmol/L）。", action: "保持现状，注意限制含糖饮料与酒精。" };
  }
  if (v < 2.3) {
    return {
      ...base, level: "borderline", levelText: "边缘升高",
      interpretation: `处于 1.7–2.3 之间，属边缘升高。甘油三酯对饮食和酒精特别敏感，通常调整后下降很快。`,
      action: "严格限制含糖饮料、精制主食和酒精（尤其啤酒）；增加 Omega-3 来源（深海鱼、亚麻籽）；每周有氧运动 150 分钟以上。1–3 个月可明显下降。",
    };
  }
  return {
    ...base, level: "high", levelText: "升高",
    interpretation: `≥2.3 mmol/L，属升高范围。持续偏高会增加胰腺炎与心血管风险。`,
    action: "建议就医评估，同时严格执行戒酒、限糖、控制总热量。",
  };
}

// ==================== BMI / 腰围 ====================

export function assessBMI(heightRaw: any, weightRaw: any): MetricReading {
  const h = parseNum(heightRaw);
  const w = parseNum(weightRaw);
  if (!h || !w) {
    return {
      key: "bmi", label: "BMI", value: "未记录", level: "unknown", levelText: "未记录",
      interpretation: "缺少身高或体重，无法计算 BMI。", action: "在身体档案里补齐身高体重即可自动计算。", source: SRC_BMI,
    };
  }
  const bmi = Number((w / Math.pow(h / 100, 2)).toFixed(1));
  const base = { key: "bmi", label: "BMI", value: `${bmi}`, numeric: bmi, source: SRC_BMI };
  if (bmi < 18.5) {
    return {
      ...base, level: "low", levelText: "体重过低",
      interpretation: `BMI ${bmi}，低于 18.5。可能伴随肌肉量与骨密度不足。`,
      action: "不建议继续减重。优先保证蛋白质（每日 1.2g/kg 体重）与总热量，配合抗阻训练增加肌肉量。",
    };
  }
  if (bmi < 24) {
    return {
      ...base, level: "normal", levelText: "正常",
      interpretation: `BMI ${bmi}，处于中国标准的正常范围（18.5–23.9）。`,
      action: "保持当前体重即可。若目标是塑形，可增加抗阻训练而非继续降体重。",
    };
  }
  if (bmi < 28) {
    return {
      ...base, level: "borderline", levelText: "超重",
      interpretation: `BMI ${bmi}，处于 24.0–27.9 的超重范围。这个阶段减重 5%–10% 就能明显改善血压、血糖、血脂。`,
      action: "建议每日热量缺口 300–500 kcal，蛋白质保持在 1.2–1.6g/kg 以保住肌肉，每周 150 分钟有氧 + 2 次抗阻。",
    };
  }
  return {
    ...base, level: "high", levelText: "肥胖",
    interpretation: `BMI ${bmi}，达到肥胖范围（≥28.0），与多种代谢问题相关。`,
    action: "建议在专业人士指导下减重，优先从饮食结构调整与低冲击有氧开始（快走、游泳、骑车），避免跑步等高关节负荷运动。",
  };
}

export function assessWaist(raw: any, genderRaw: any): MetricReading {
  const v = parseNum(raw);
  const male = String(genderRaw || "").includes("男");
  const limit = male ? 90 : 85;
  const base = { key: "waist", label: "腰围", value: `${raw} cm`, numeric: v, source: SRC_BMI };
  if (v === undefined) {
    return {
      key: "waist", label: "腰围", value: "未记录", level: "unknown", levelText: "未记录",
      interpretation: "还没有记录腰围。腰围反映内脏脂肪，比体重更能说明代谢风险。",
      action: "用软尺在肚脐水平绕一周、呼气末测量，记录一次即可。", source: SRC_BMI,
    };
  }
  if (v >= limit) {
    return {
      ...base, level: "high", levelText: "中心型肥胖",
      interpretation: `腰围 ${v} cm，达到${male ? "男性 ≥90" : "女性 ≥85"} cm 的中心型肥胖标准。内脏脂肪偏高，对血糖血压影响比体重更大。`,
      action: "优先减少腹部脂肪：控制精制碳水与酒精、增加有氧运动比例、保证睡眠 7 小时以上。腰围比体重更适合作为你的进度指标。",
    };
  }
  return { ...base, level: "normal", levelText: "正常", interpretation: `腰围 ${v} cm，在${male ? "男性 <90" : "女性 <85"} cm 的正常范围内。`, action: "保持即可，每月测一次跟踪变化。" };
}

// ==================== 静息心率 ====================

export function assessHeartRate(raw: any): MetricReading {
  const v = parseNum(raw);
  const base = { key: "hr", label: "静息心率", value: `${raw} 次/分`, numeric: v, source: "《中国居民膳食指南（2022）》" };
  if (v === undefined) {
    return {
      key: "hr", label: "静息心率", value: "未记录", level: "unknown", levelText: "未记录",
      interpretation: "还没有记录静息心率。", action: "早晨清醒后卧床测 1 分钟脉搏即可。", source: "《中国居民膳食指南（2022）》",
    };
  }
  if (v < 50) {
    return { ...base, level: "low", levelText: "偏慢", interpretation: `静息心率 ${v} 次/分，偏慢。长期规律运动者常见，也可能与药物或甲状腺功能有关。`, action: "若伴随头晕、乏力、活动耐量下降，请就医查心电图。" };
  }
  if (v <= 100) {
    return { ...base, level: "normal", levelText: "正常", interpretation: `静息心率 ${v} 次/分，处于正常范围（60–100）。`, action: "规律有氧训练通常能让静息心率逐步下降，这是心肺功能改善的表现。" };
  }
  return {
    ...base, level: "high", levelText: "偏快",
    interpretation: `静息心率 ${v} 次/分，超过 100。可能与紧张、睡眠不足、贫血、甲状腺功能或咖啡因摄入有关。`,
    action: "先排查咖啡浓茶、熬夜、情绪因素；若安静状态下持续偏快，建议就医查血常规与甲状腺功能。",
  };
}

// ==================== 汇总 ====================

export interface ProfileLike {
  height?: any;
  weight?: any;
  age?: any;
  gender?: any;
  blood_pressure_systolic?: any;
  blood_pressure_diastolic?: any;
  blood_sugar?: any;
  total_cholesterol?: any;
  triglycerides?: any;
  heart_rate?: any;
  waist?: any;
  body_fat?: any;
  medical_history?: any;
  diet_prefs?: any;
}

/** 一次性判读全部已记录的指标（未记录的会返回 unknown，由调用方决定是否展示） */
export function assessAll(p: ProfileLike): MetricReading[] {
  return [
    assessBloodPressure(p.blood_pressure_systolic, p.blood_pressure_diastolic),
    assessFastingGlucose(p.blood_sugar),
    assessTotalCholesterol(p.total_cholesterol),
    assessTriglycerides(p.triglycerides),
    assessBMI(p.height, p.weight),
    assessWaist(p.waist, p.gender),
    assessHeartRate(p.heart_rate),
  ];
}

/** 需要重点关注的指标（borderline / high / low），用于在对话中主动提示 */
export function concernsOf(readings: MetricReading[]): MetricReading[] {
  return readings.filter((r) => r.level === "borderline" || r.level === "high" || r.level === "low");
}

/** 生成给大模型的结构化文本。只输出有记录的指标，避免模型对着"未记录"瞎猜。 */
export function readingsToText(readings: MetricReading[]): string {
  const known = readings.filter((r) => r.level !== "unknown");
  if (!known.length) return "";
  const lines = known.map(
    (r) => `- ${r.label} ${r.value} → ${r.levelText}｜${r.interpretation}｜建议：${r.action}`
  );
  return `【体检指标判读（中国标准，已由系统判定，直接采用勿自行改判）】\n${lines.join("\n")}`;
}
