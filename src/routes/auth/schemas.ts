/*
 * Auth route schemas
 *
 * - Define the Zod validation schemas for the `/api/auth` endpoints.
 * - Supports dual registration modes: joining existing organizations or creating new ones.
 * - `registerSchema` validates the payload for creating a new user, including role-based access.
 * - `loginSchema` validates the credentials used to authenticate an existing user.
 * - Exported `RegisterInput` and `LoginInput` types keep handlers strongly typed and in sync
 *   with the validation rules.
 */

import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters");

// Mode 1: Join existing organization
export const joinOrgRegisterSchema = z.object({
  registrationType: z.literal("join"),
  email: z.string().email(),
  password: passwordSchema,
  confirmPassword: passwordSchema,
  fullName: z.string().min(2),
  organizationId: z.number().int().positive(),
  role: z
    .enum(["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"])
    .optional(),
});

// Mode 2: Create new organization
export const createOrgRegisterSchema = z.object({
  registrationType: z.literal("create"),
  email: z.string().email(),
  password: passwordSchema,
  confirmPassword: passwordSchema,
  fullName: z.string().min(2),
  organizationName: z.string().min(2),
  country: z.string().length(2).default("SA"),
  subscriptionTier: z.string().default("free"),
  role: z
    .enum(["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"])
    .optional(),
});

// Union schema for dual mode registration
export const registerSchema = z
  .discriminatedUnion("registrationType", [
    joinOrgRegisterSchema,
    createOrgRegisterSchema,
  ])
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type JoinOrgRegisterInput = z.infer<typeof joinOrgRegisterSchema>;
export type CreateOrgRegisterInput = z.infer<typeof createOrgRegisterSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

