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

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(32).optional(),
  bio: z.string().trim().max(190).optional(),
  customStatus: z.string().trim().max(80).optional(),
  avatarAttachmentId: z.string().uuid().nullable().optional(),
  bannerAttachmentId: z.string().uuid().nullable().optional()
});

export const guildProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(32).nullable().optional(),
  bio: z.string().trim().max(190).optional().default(''),
  avatarAttachmentId: z.string().uuid().nullable().optional(),
  bannerAttachmentId: z.string().uuid().nullable().optional()
});

export const badgePreferencesSchema = z.object({
  badges: z.array(z.object({
    id: z.string().uuid(),
    visible: z.boolean()
  })).max(20)
});

export const profileReportSchema = z.object({
  reason: z.string().trim().min(3).max(1000)
});

export const dmMessageSchema = z.object({
  content: z.string().max(2000).optional().default(''),
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
