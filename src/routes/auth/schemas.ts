/*
 * Auth route schemas
 *
 * - Define the Zod validation schemas for the `/api/auth` endpoints.
 * - `registerSchema` validates the payload for creating a new user, including role-based access.
 * - `loginSchema` validates the credentials used to authenticate an existing user.
 * - Exported `RegisterInput` and `LoginInput` types keep handlers strongly typed and in sync
 *   with the validation rules.
 */

import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  organizationId: z.number().int().positive(),
  role: z
    .enum(["admin", "senior_lawyer", "lawyer", "paralegal", "clerk"])
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
