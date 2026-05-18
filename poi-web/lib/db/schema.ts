import { pgTable, serial, varchar, text, timestamp, integer, bigint, customType } from "drizzle-orm/pg-core";

const geometryPoint = customType<{
  data: { lng: number; lat: number };
  driverData: string;
}>({
  dataType() {
    return "geometry(Point, 4326)";
  },
  toDriver(value: { lng: number; lat: number }): string {
    return `ST_SetSRID(ST_MakePoint(${value.lng}, ${value.lat}), 4326)`;
  },
  fromDriver(value: unknown): { lng: number; lat: number } {
    if (typeof value === "string") {
      const match = value.match(/POINT\(([^ ]+) ([^)]+)\)/i);
      if (match) return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
    return { lng: 0, lat: 0 };
  },
});

export const pois = pgTable("pois", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  province: varchar("province", { length: 100 }),
  address: text("address"),
  category: varchar("category", { length: 100 }),
  batch: varchar("batch", { length: 100 }),
  age: varchar("age", { length: 255 }),
  heritageCode: bigint("heritage_code", { mode: "number" }),
  classCode: integer("class_code"),
  location: geometryPoint("location").notNull(),
  imageUrl: text("image_url"),
  website: text("website"),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("public"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Poi = typeof pois.$inferSelect;
export type NewPoi = typeof pois.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
