/*
 * Regulation route schemas
 *
 * - Define the Zod validation schemas for the `/api/regulations` endpoints.
 * - `createRegulationSchema` validates the payload for creating a new regulation,
 *   including optional metadata such as category, jurisdiction, and status.
 * - `updateRegulationSchema` is a partial version for updating existing regulations.
 * - `getRegulationsQuerySchema` validates optional query parameters used to filter
 *   the list of regulations by category and status.
 */

import { z } from "zod";

export const createRegulationSchema = z.object({
  title: z.string().min(1),
  regulationNumber: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  category: z
    .enum([
      "criminal_law",
      "civil_law",
      "commercial_law",
      "labor_law",
      "procedural_law",
    ])
    .optional(),
  jurisdiction: z.string().optional(),
  status: z
    .enum(["active", "amended", "repealed", "draft"])
    .optional(),
  effectiveDate: z.string().optional(), // ISO date string
});

export const updateRegulationSchema = createRegulationSchema.partial();

export const getRegulationsQuerySchema = z.object({
  category: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type CreateRegulationInput = z.infer<typeof createRegulationSchema>;
export type UpdateRegulationInput = z.infer<typeof updateRegulationSchema>;
export type GetRegulationsQuery = z.infer<typeof getRegulationsQuerySchema>;

