import { z } from "zod";

export const optionSchema = z.object({
  value: z.string(),
  recommended: z.boolean().default(false),
});

export const questionSchema = z.object({
  tier: z.enum(["required", "optional"]),
  kind: z.enum(["exit", "entry", "risk"]).describe("질문 종류"),
  options: z.array(optionSchema).min(2),
});

export const judgeSchema = z.object({
  questions: z.array(questionSchema),
  quality: z.number().int().min(0).max(5),
  bestCandidateId: z.string(),
});
