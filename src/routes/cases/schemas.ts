/*
 * Case route schemas
 *
 * - Define the Zod validation schemas for the `/api/cases` endpoints.
 * - `createCaseSchema` validates the payload for creating a new case, including
 *   core metadata like case number, type, status, and court information.
 * - `updateCaseSchema` is a partial version for updating existing cases.
 * - `getCasesQuerySchema` validates optional query parameters used to filter the
 *   list of cases (status, case type, and assigned lawyer).
 */

import { z } from "zod";

export const createCaseSchema = z.object({
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  caseType: z.enum([
    "criminal",
    "civil",
    "commercial",
    "labor",
    "family",
    "administrative",
  ]),
  status: z
    .enum(["open", "in_progress", "pending_hearing", "closed", "archived"])
    .optional(),
  clientInfo: z.string().optional(),
  courtJurisdiction: z.string().optional(),
  filingDate: z.string().optional(), // ISO date string
  nextHearing: z.string().optional(),
});

export const updateCaseSchema = createCaseSchema.partial();

export const getCasesQuerySchema = z.object({
  status: z.string().optional(),
  caseType: z.string().optional(),
  assignedLawyerId: z.coerce.number().optional(),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type GetCasesQuery = z.infer<typeof getCasesQuerySchema>;


