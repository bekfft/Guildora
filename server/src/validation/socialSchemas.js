import { z } from 'zod';

export const userSearchSchema = z.object({
  q: z.string().trim().min(2, 'Bitte gib mindestens zwei Zeichen ein.').max(50)
});

export const friendRequestSchema = z.object({
  username: z.string().trim().min(2).max(32)
});

export const friendActionSchema = z.object({
  action: z.enum(['accept', 'decline'])
});

export const dmMessageSchema = z.object({
  content: z.string().max(2000).optional().default(''),
  attachmentIds: z.array(z.string().uuid()).max(5).optional().default([])
}).refine((data) => data.content.trim().length > 0 || data.attachmentIds.length > 0, {
  message: 'Eine Nachricht braucht Text oder einen Anhang.'
});

export const moderationSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().default('')
});

export const timeoutSchema = moderationSchema.extend({
  durationMinutes: z.number().int().min(1).max(40320)
});

export const reportSchema = z.object({
  reportedUserId: z.string().uuid().nullable().optional(),
  messageId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3).max(1000)
});

export const reportActionSchema = z.object({
  status: z.enum(['resolved', 'dismissed'])
});
