import { z } from 'zod';

export const messageBodySchema = z.object({
  content: z.string({ required_error: 'Bitte gib eine Nachricht ein.' })
    .max(2000, 'Eine Nachricht darf höchstens 2.000 Zeichen lang sein.')
    .refine((value) => value.trim().length > 0, 'Eine Nachricht darf nicht leer sein.')
});

export const messageQuerySchema = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});
