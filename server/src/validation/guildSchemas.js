import { z } from 'zod';

export const createGuildSchema = z.object({
  name: z.string({ required_error: 'Bitte gib einen Servernamen ein.' })
    .trim()
    .min(2, 'Der Servername muss mindestens 2 Zeichen lang sein.')
    .max(80, 'Der Servername darf höchstens 80 Zeichen lang sein.'),
  iconUrl: z.string().url('Die Icon-Adresse ist ungültig.').nullable().optional()
});

export const discoveryQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(''),
  category: z.string().trim().max(40).optional().default('')
});
