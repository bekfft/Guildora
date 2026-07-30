import { z } from 'zod';

const content = z.string({ required_error: 'Bitte gib eine Nachricht ein.' })
  .max(2000, 'Eine Nachricht darf höchstens 2.000 Zeichen lang sein.')
  .refine((value) => value.trim().length > 0, 'Eine Nachricht darf nicht leer sein.');

export const createMessageSchema = z.object({
  content,
  replyToId: z.string().uuid('Die Antwortreferenz ist ungültig.').nullable().optional()
});

export const updateMessageSchema = z.object({
  content
});

export const reactionSchema = z.object({
  emoji: z.string({ required_error: 'Bitte wähle eine Reaktion aus.' })
    .trim()
    .min(1, 'Bitte wähle eine Reaktion aus.')
    .max(16, 'Diese Reaktion ist zu lang.')
    .refine((value) => !/\s/.test(value) && [...value].length <= 4, 'Diese Reaktion ist ungültig.')
});

export const messageQuerySchema = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});
