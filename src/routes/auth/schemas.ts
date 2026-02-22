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

const userRoleSchema = z.enum([
  "admin",
  "senior_lawyer",
  "lawyer",
  "paralegal",
  "clerk",
]);

export const registerSchema = z
  .object({
    registrationType: z.enum(["personal", "join", "create"]).optional(),
    email: z.string().email(),
    password: passwordSchema,
    confirmPassword: passwordSchema,
    fullName: z.string().min(2),
    organizationId: z.number().int().positive().optional(),
    organizationName: z.string().min(2).optional(),
    country: z.string().length(2).optional(),
    subscriptionTier: z.string().optional(),
    role: userRoleSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const registrationType = data.registrationType ?? "personal";

    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
    }

    if (registrationType === "join" && !data.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "organizationId is required when registrationType is join",
        path: ["organizationId"],
      });
    }

    if (registrationType === "create" && !data.organizationName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "organizationName is required when registrationType is create",
        path: ["organizationName"],
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema> & {
  registrationType?: "personal" | "join" | "create";
};
export type RegisterType = "personal" | "join" | "create";
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Backward-compatible exports for callers that still import these names.
export const joinOrgRegisterSchema = z.object({
  registrationType: z.literal("join"),
  email: z.string().email(),
  password: passwordSchema,
  confirmPassword: passwordSchema,
  fullName: z.string().min(2),
  organizationId: z.number().int().positive(),
  role: userRoleSchema.optional(),
});

export const createOrgRegisterSchema = z.object({
  registrationType: z.literal("create"),
  email: z.string().email(),
  password: passwordSchema,
  confirmPassword: passwordSchema,
  fullName: z.string().min(2),
  organizationName: z.string().min(2),
  country: z.string().length(2).default("SA"),
  subscriptionTier: z.string().default("free"),
  role: userRoleSchema.optional(),
});
export type JoinOrgRegisterInput = z.infer<typeof joinOrgRegisterSchema>;
export type CreateOrgRegisterInput = z.infer<typeof createOrgRegisterSchema>;
