import { z } from 'zod';

const content = z.string({ required_error: 'Bitte gib eine Nachricht ein.' })
  .max(2000, 'Eine Nachricht darf höchstens 2.000 Zeichen lang sein.')
  .refine((value) => value.trim().length > 0, 'Eine Nachricht darf nicht leer sein.');

export const createMessageSchema = z.object({
  content: z.string().max(2000).optional().default(''),
  replyToId: z.string().uuid('Die Antwortreferenz ist ungültig.').nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).max(5).optional().default([]),
  voiceMessage: z.object({
    attachmentId: z.string().uuid(),
    durationMs: z.number().int().min(250).max(300000),
    waveform: z.array(z.number().int().min(1).max(100)).min(20).max(64)
  }).nullable().optional()
}).refine((data) => data.content.trim().length > 0 || data.attachmentIds.length > 0, {
  message: 'Eine Nachricht braucht Text oder einen Anhang.'
}).refine((data) => !data.voiceMessage || data.attachmentIds.includes(data.voiceMessage.attachmentId), {
  message: 'Die Sprachnachricht muss als Anhang übertragen werden.'
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
  around: z.string().uuid('Die Zielnachricht ist ungültig.').optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
}).refine((value) => !(value.before && value.around), {
  message: 'before und around können nicht gemeinsam verwendet werden.'
});

export const markReadSchema = z.object({
  messageId: z.string().uuid('Die Nachricht ist ungültig.').nullable().optional()
});

export const notificationQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional().default('false')
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

export const messageSearchSchema = z.object({
  q: z.string().trim().min(2, 'Bitte gib mindestens zwei Zeichen ein.').max(100),
  channelId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
}).refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
  message: 'Der Startzeitpunkt muss vor dem Endzeitpunkt liegen.'
});
