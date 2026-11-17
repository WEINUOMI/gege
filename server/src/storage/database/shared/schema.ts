import { sql } from "drizzle-orm";
import { pgTable, serial, text, varchar, integer, timestamp, boolean, jsonb, date, index } from "drizzle-orm/pg-core";

// ========== 用户（device 维度，无 Auth，场景 A） ==========
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    nickname: varchar("nickname", { length: 64 }).notNull().default("主人"),
    invite_code: varchar("invite_code", { length: 16 }).notNull().unique(),
    device_id: varchar("device_id", { length: 64 }).notNull().unique(),
    avatar_text: varchar("avatar_text", { length: 8 }).notNull().default("初"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("users_device_idx").on(table.device_id)]
);

// ========== 健康档案（主人当前身体状况总档） ==========
export const healthProfiles = pgTable(
  "health_profiles",
  {
    id: serial("id").primaryKey(),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    height: varchar("height", { length: 16 }),
    weight: varchar("weight", { length: 16 }),
    age: integer("age"),
    gender: varchar("gender", { length: 8 }),
    blood_pressure_systolic: varchar("blood_pressure_systolic", { length: 16 }),
    blood_pressure_diastolic: varchar("blood_pressure_diastolic", { length: 16 }),
    blood_sugar: varchar("blood_sugar", { length: 16 }),
    total_cholesterol: varchar("total_cholesterol", { length: 16 }),
    triglycerides: varchar("triglycerides", { length: 16 }),
    heart_rate: varchar("heart_rate", { length: 16 }),
    bmi: varchar("bmi", { length: 16 }),
    body_fat: varchar("body_fat", { length: 16 }),
    waist: varchar("waist", { length: 16 }),
    medical_history: jsonb("medical_history"),
    diet_prefs: jsonb("diet_prefs"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("hp_user_idx").on(table.user_id)]
);

// ========== 身体历史记录（多维度指标随记录） ==========
export const healthRecords = pgTable(
  "health_records",
  {
    id: serial("id").primaryKey(),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    recorded_at: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    blood_pressure_systolic: varchar("blood_pressure_systolic", { length: 16 }),
    blood_pressure_diastolic: varchar("blood_pressure_diastolic", { length: 16 }),
    blood_sugar: varchar("blood_sugar", { length: 16 }),
    total_cholesterol: varchar("total_cholesterol", { length: 16 }),
    triglycerides: varchar("triglycerides", { length: 16 }),
    heart_rate: varchar("heart_rate", { length: 16 }),
    weight: varchar("weight", { length: 16 }),
    bmi: varchar("bmi", { length: 16 }),
    body_fat: varchar("body_fat", { length: 16 }),
    waist: varchar("waist", { length: 16 }),
  },
  (table) => [index("hr_user_idx").on(table.user_id)]
);

// ========== 目标 ==========
export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    title: varchar("title", { length: 128 }).notNull(),
    category: varchar("category", { length: 32 }).notNull().default("weight_loss"),
    metrics: jsonb("metrics"),
    target_value: varchar("target_value", { length: 32 }),
    target_metric: varchar("target_metric", { length: 32 }),
    start_date: date("start_date"),
    end_date: date("end_date"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    daily_points: integer("daily_points").notNull().default(20),
    rewards: jsonb("rewards"),
    punishments: jsonb("punishments"),
    from_system: boolean("from_system").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("goals_user_idx").on(table.user_id)]
);

// ========== 每日打卡计划项 ==========
export const planItems = pgTable(
  "plan_items",
  {
    id: serial("id").primaryKey(),
    goal_id: integer("goal_id").notNull().references(() => goals.id),
    title: varchar("title", { length: 128 }).notNull(),
    category: varchar("category", { length: 32 }).notNull().default("health"),
    planned_time: varchar("planned_time", { length: 16 }),
    points: integer("points").notNull().default(10),
  },
  (table) => [index("pi_goal_idx").on(table.goal_id)]
);

// ========== 打卡凭证记录 ==========
export const checkins = pgTable(
  "checkins",
  {
    id: serial("id").primaryKey(),
    goal_id: integer("goal_id").notNull().references(() => goals.id),
    plan_item_id: integer("plan_item_id").references(() => planItems.id),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    title: varchar("title", { length: 128 }).notNull(),
    checkin_date: timestamp("checkin_date", { withTimezone: true }).defaultNow().notNull(),
    proof_key: varchar("proof_key", { length: 255 }),
    proof_type: varchar("proof_type", { length: 16 }).notNull().default("image"),
    points: integer("points").notNull().default(10),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("checkins_goal_idx").on(table.goal_id),
    index("checkins_user_idx").on(table.user_id),
    index("checkins_date_idx").on(table.checkin_date),
  ]
);

// ========== 积分变动流水 ==========
export const points = pgTable(
  "points",
  {
    id: serial("id").primaryKey(),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    goal_id: integer("goal_id").references(() => goals.id),
    amount: integer("amount").notNull(),
    reason: varchar("reason", { length: 128 }).notNull().default(""),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("points_user_idx").on(table.user_id)]
);

// ========== 好友关系 ==========
export const friendships = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    friend_user_id: varchar("friend_user_id", { length: 32 }).notNull().references(() => users.id),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("fs_user_idx").on(table.user_id),
    index("fs_friend_idx").on(table.friend_user_id),
  ]
);

// ========== 目标监督团成员 ==========
export const goalMembers = pgTable(
  "goal_members",
  {
    id: serial("id").primaryKey(),
    goal_id: integer("goal_id").notNull().references(() => goals.id),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    role: varchar("role", { length: 16 }).notNull().default("supervisor"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("gm_goal_idx").on(table.goal_id),
    index("gm_user_idx").on(table.user_id),
  ]
);

// ========== 打卡留言评论 ==========
export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    checkin_id: integer("checkin_id").notNull().references(() => checkins.id),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    content: varchar("content", { length: 500 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("comments_checkin_idx").on(table.checkin_id)]
);

// ========== 首页对话消息（微信式） ==========
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    user_id: varchar("user_id", { length: 32 }).notNull().references(() => users.id),
    role: varchar("role", { length: 16 }).notNull().default("assistant"),
    content: text("content").notNull(),
    message_type: varchar("message_type", { length: 24 }).notNull().default("text"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("chat_user_idx").on(table.user_id)]
);
// ========== 客户端诊断日志（前端运行错误上报，辅助排查用） ==========
export const diagLogs = pgTable(
  "diag_logs",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 32 }).notNull().default("error"),
    message: varchar("message", { length: 500 }),
    detail: text("detail"),
    url: varchar("url", { length: 500 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("diag_type_idx").on(table.type)]
);
