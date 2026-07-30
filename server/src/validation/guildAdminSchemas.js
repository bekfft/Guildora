import { z } from 'zod';

const name = (label, max = 80) => z.string({ required_error: `Bitte gib einen ${label} ein.` })
  .trim()
  .min(1, `${label} darf nicht leer sein.`)
  .max(max, `${label} darf höchstens ${max} Zeichen lang sein.`);

export const guildProfileSchema = z.object({
  name: name('Servernamen'),
  description: z.string().trim().max(1000, 'Die Beschreibung darf höchstens 1.000 Zeichen lang sein.'),
  category: name('Kategorie', 40),
  iconAttachmentId: z.string().uuid().nullable().optional()
}).strict();

export const categorySchema = z.object({
  name: name('Kategorienamen', 60),
  position: z.number().int().min(0).max(10000).optional()
});

export const channelSchema = z.object({
  name: name('Channelnamen', 80),
  type: z.enum(['text', 'voice']),
  categoryId: z.string().uuid().nullable(),
  topic: z.string().trim().max(1024, 'Das Thema darf höchstens 1.024 Zeichen lang sein.').nullable().optional(),
  position: z.number().int().min(0).max(10000).optional()
});

export const rolePermissionsSchema = z.object({
  manageServer: z.boolean().default(false),
  manageChannels: z.boolean().default(false),
  manageRoles: z.boolean().default(false),
  kickMembers: z.boolean().default(false),
  manageMessages: z.boolean().default(false)
});

export const roleSchema = z.object({
  name: name('Rollennamen', 80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Bitte wähle eine gültige Rollenfarbe.').nullable(),
  position: z.number().int().min(0).max(10000).optional(),
  permissions: rolePermissionsSchema
});

export const memberRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).max(100)
});

export const memberNicknameSchema = z.object({
  nickname: z.string().trim().max(80, 'Der Servername darf höchstens 80 Zeichen lang sein.').nullable()
});
