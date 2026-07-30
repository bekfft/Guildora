import { z } from 'zod';

export const createInviteSchema = z.object({
  expiresIn: z.number().int().min(300).max(604800).nullable().default(86400),
  maxUses: z.number().int().min(1).max(100).nullable().default(null)
}).strict();

export const inviteCodeSchema = z.string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,32}$/, 'Dieser Einladungscode ist ungültig.');
