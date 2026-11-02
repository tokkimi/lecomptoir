import {
  pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, uuid, primaryKey, uniqueIndex, index, date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* Montants stockés en centimes (entiers) pour éviter les erreurs d'arrondi. */

export const roleEnum = pgEnum("role", ["admin", "manager", "staff"]);
export const storeKindEnum = pgEnum("store_kind", ["succursale", "franchise"]);
export const channelEnum = pgEnum("sale_channel", ["comptoir", "click_collect", "livraison", "evenement"]);
export const saleStatusEnum = pgEnum("sale_status", ["completed", "refunded"]);
export const sourceEnum = pgEnum("record_source", ["api", "csv", "manual", "site", "seed"]);
export const leadStatusEnum = pgEnum("lead_status", ["nouveau", "en_cours", "gagne", "perdu", "clos"]);
export const leadKindEnum = pgEnum("lead_kind", ["question", "commande", "partenariat", "franchise", "autre"]);
export const activityKindEnum = pgEnum("activity_kind", ["note", "appel", "email", "sms", "visite", "systeme"]);
export const campaignChannelEnum = pgEnum("campaign_channel", ["email", "sms"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["brouillon", "exportee", "envoyee"]);
export const syncStatusEnum = pgEnum("sync_status", ["ok", "doublon", "erreur"]);

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: storeKindEnum("kind").notNull().default("succursale"),
  franchisee: text("franchisee"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  phone: text("phone"),
  email: text("email"),
  posSystem: text("pos_system"),
  monthlyTargetCents: integer("monthly_target_cents"),
  openedOn: date("opened_on"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("staff"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userStores = pgTable("user_stores", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.userId, t.storeId] })]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // SHA-256 du jeton, jamais le jeton lui-même
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"), // normalisé E.164 (+33…)
  company: text("company"),
  birthday: date("birthday"),
  homeStoreId: uuid("home_store_id").references(() => stores.id, { onDelete: "set null" }),
  optInEmail: boolean("opt_in_email").notNull().default(false),
  optInSms: boolean("opt_in_sms").notNull().default(false),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  notes: text("notes"),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  totalSpentCents: integer("total_spent_cents").notNull().default(0),
  visits: integer("visits").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  source: sourceEnum("source").notNull().default("manual"),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("customers_email_uq").on(t.email),
  uniqueIndex("customers_phone_uq").on(t.phone),
  index("customers_home_store_idx").on(t.homeStoreId),
  index("customers_last_seen_idx").on(t.lastSeenAt),
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  priceCents: integer("price_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "restrict" }),
  externalId: text("external_id").notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  totalCents: integer("total_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  paymentMethod: text("payment_method"),
  channel: channelEnum("channel").notNull().default("comptoir"),
  status: saleStatusEnum("status").notNull().default("completed"),
  pointsEarned: integer("points_earned").notNull().default(0),
  pointsRedeemed: integer("points_redeemed").notNull().default(0),
  source: sourceEnum("source").notNull().default("api"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("sales_store_external_uq").on(t.storeId, t.externalId),
  index("sales_occurred_idx").on(t.occurredAt),
  index("sales_customer_idx").on(t.customerId),
]);

export const saleItems = pgTable("sale_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  sku: text("sku"),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
}, (t) => [index("sale_items_sale_idx").on(t.saleId), index("sale_items_product_idx").on(t.productId)]);

export const rewards = pgTable("rewards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  pointsCost: integer("points_cost").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
  saleId: uuid("sale_id").references(() => sales.id, { onDelete: "set null" }),
  rewardId: uuid("reward_id").references(() => rewards.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("loyalty_customer_idx").on(t.customerId)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const storeApiKeys = pgTable("store_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncEvents = pgTable("sync_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "cascade" }),
  channel: sourceEnum("channel").notNull(),
  status: syncStatusEnum("status").notNull(),
  externalId: text("external_id"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sync_events_store_idx").on(t.storeId, t.createdAt)]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: leadKindEnum("kind").notNull().default("question"),
  status: leadStatusEnum("status").notNull().default("nouveau"),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email").notNull(),
  phone: text("phone"),
  message: text("message").notNull(),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  estimatedValueCents: integer("estimated_value_cents"),
  source: sourceEnum("source").notNull().default("site"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("leads_status_idx").on(t.status)]);

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: activityKindEnum("kind").notNull().default("note"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("activities_customer_idx").on(t.customerId), index("activities_lead_idx").on(t.leadId)]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  channel: campaignChannelEnum("channel").notNull(),
  segment: text("segment").notNull(),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  status: campaignStatusEnum("status").notNull().default("brouillon"),
  audienceCount: integer("audience_count").notNull().default(0),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_created_idx").on(t.createdAt)]);

export type Store = typeof stores.$inferSelect;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
