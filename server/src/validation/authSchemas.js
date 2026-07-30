import { z } from 'zod';

const email = z
  .string({ required_error: 'Bitte gib deine E-Mail-Adresse ein.' })
  .trim()
  .email('Bitte gib eine gültige E-Mail-Adresse ein.')
  .max(254)
  .transform((value) => value.toLowerCase());

const username = z
  .string({ required_error: 'Bitte wähle einen Benutzernamen.' })
  .trim()
  .min(2, 'Der Benutzername muss mindestens 2 Zeichen lang sein.')
  .max(32, 'Der Benutzername darf höchstens 32 Zeichen lang sein.')
  .regex(/^[a-z0-9._]+$/i, 'Erlaubt sind nur Buchstaben, Zahlen, Punkte und Unterstriche.')
  .transform((value) => value.toLowerCase());

const password = z
  .string({ required_error: 'Bitte wähle ein Passwort.' })
  .min(8, 'Das Passwort muss mindestens 8 Zeichen lang sein.')
  .regex(/[A-Za-zÄÖÜäöüß]/, 'Das Passwort braucht mindestens einen Buchstaben.')
  .regex(/\d/, 'Das Passwort braucht mindestens eine Zahl.')
  .max(128, 'Das Passwort darf höchstens 128 Zeichen lang sein.');

export const registerSchema = z.object({
  email,
  username,
  password,
  birthdate: z.string({ required_error: 'Bitte gib dein Geburtsdatum an.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Geburtsdatum.'),
  newsletter: z.boolean().optional().default(false)
});

export const loginSchema = z.object({
  identifier: z.string({ required_error: 'Bitte gib deine E-Mail oder deinen Benutzernamen ein.' }).trim().min(1),
  password: z.string({ required_error: 'Bitte gib dein Passwort ein.' }).min(1),
  totpCode: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().regex(/^\d{6}$/).optional()
  )
});
