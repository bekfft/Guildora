import { z } from 'zod';

const optionalText = (length) => z.string().trim().max(length).nullable().optional();

export const activitySchema = z.object({
  type: z.enum(['playing', 'streaming', 'listening', 'watching', 'competing']),
  name: z.string().trim().min(1).max(128),
  details: optionalText(128),
  state: optionalText(128),
  startedAt: z.number().int().nonnegative().nullable().optional(),
  endsAt: z.number().int().nonnegative().nullable().optional(),
  applicationId: optionalText(80),
  source: z.enum(['detected', 'rpc']).default('detected'),
  assets: z.object({
    largeImage: optionalText(500),
    largeText: optionalText(128),
    smallImage: optionalText(500),
    smallText: optionalText(128)
  }).strict().nullable().optional(),
  party: z.object({
    id: optionalText(128),
    currentSize: z.number().int().min(0).max(100000),
    maxSize: z.number().int().min(1).max(100000)
  }).strict().refine((party) => party.currentSize <= party.maxSize, {
    message: 'Die aktuelle Gruppengröße darf das Maximum nicht überschreiten.'
  }).nullable().optional(),
  buttons: z.array(z.object({
    label: z.string().trim().min(1).max(32),
    url: z.string().url().max(500).refine((value) => /^https?:\/\//i.test(value), {
      message: 'Aktivitätslinks müssen HTTP oder HTTPS verwenden.'
    })
  }).strict()).max(2).default([]),
  joinSecret: optionalText(256)
}).strict().refine((activity) => !activity.endsAt || !activity.startedAt || activity.endsAt > activity.startedAt, {
  message: 'Das Aktivitätsende muss nach dem Start liegen.'
});
