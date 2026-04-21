import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import type { QuestionEntry } from "../shared/contracts.js";

const rawQuestionSchema = z.object({
  id: z.string().trim().min(1),
  left_label: z.string().trim().min(1).optional(),
  leftLabel: z.string().trim().min(1).optional(),
  left_value: z.number().finite().optional(),
  leftValue: z.number().finite().optional(),
  right_label: z.string().trim().min(1).optional(),
  rightLabel: z.string().trim().min(1).optional(),
  right_value: z.number().finite().optional(),
  rightValue: z.number().finite().optional()
});

const datasetSchema = z.array(rawQuestionSchema).min(10);

function normalizeQuestion(input: z.infer<typeof rawQuestionSchema>): QuestionEntry {
  const leftLabel = input.left_label ?? input.leftLabel;
  const leftValue = input.left_value ?? input.leftValue;
  const rightLabel = input.right_label ?? input.rightLabel;
  const rightValue = input.right_value ?? input.rightValue;

  if (!leftLabel || leftValue === undefined || !rightLabel || rightValue === undefined) {
    throw new Error(`Question ${input.id} is missing one or more required fields.`);
  }

  return {
    id: input.id,
    leftLabel,
    leftValue,
    rightLabel,
    rightValue
  };
}

export function loadQuestions(): QuestionEntry[] {
  const datasetPath = resolve(process.cwd(), "data", "higher_lower_top150.json");
  const raw = readFileSync(datasetPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const questions = datasetSchema.parse(parsed).map(normalizeQuestion);
  const uniqueIds = new Set<string>();

  for (const question of questions) {
    if (uniqueIds.has(question.id)) {
      throw new Error(`Duplicate question id detected: ${question.id}`);
    }
    uniqueIds.add(question.id);
  }

  return questions;
}
