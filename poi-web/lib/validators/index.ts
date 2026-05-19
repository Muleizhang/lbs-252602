import { z } from "zod/v4";

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  email: z.string().email().optional(),
  role: z.enum(["public", "admin"]).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

export const createPoiSchema = z.object({
  name: z.string().min(1).max(255),
  province: z.string().max(100).optional(),
  address: z.string().optional(),
  category: z.string().max(100).optional(),
  batch: z.string().max(100).optional(),
  age: z.string().max(255).optional(),
  heritageCode: z.number().optional(),
  classCode: z.number().optional(),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  imageUrl: z.string().url().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  remark: z.string().optional(),
});

export const updatePoiSchema = createPoiSchema.partial().extend({
  lng: z.number().min(-180).max(180).optional(),
  lat: z.number().min(-90).max(90).optional(),
});

export const poiListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  name: z.string().optional(),
  province: z.string().optional(),
  category: z.string().optional(),
  batch: z.string().optional(),
  hasImage: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  hasWebsite: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const bboxQuerySchema = z.object({
  minLng: z.coerce.number().min(-180).max(180),
  minLat: z.coerce.number().min(-90).max(90),
  maxLng: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const radiusQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radius: z.coerce.number().min(1).max(500000),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
