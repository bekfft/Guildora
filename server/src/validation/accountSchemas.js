import { z } from 'zod';

const password = z.string().min(8).max(128);
const optionalTime = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.null()]);

export const accountUpdateSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-z0-9._]+$/i).transform((value) => value.toLowerCase()).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  currentPassword: z.string().min(1)
}).refine((value) => value.username || value.email, { message: 'Keine Änderung angegeben.' });

export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password
});

export const passwordConfirmationSchema = z.object({
  currentPassword: z.string().min(1),
  confirmation: z.string().optional()
});

export const totpConfirmSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/)
});

export const totpDisableSchema = z.object({
  currentPassword: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/)
});

export const settingsSchema = z.object({
  friend_requests: z.enum(['everyone', 'shared_servers', 'none']).optional(),
  direct_messages: z.enum(['everyone', 'shared_servers', 'friends', 'none']).optional(),
  content_filter: z.enum(['all', 'non_friends', 'off']).optional(),
  desktop_notifications: z.boolean().optional(),
  notification_sounds: z.boolean().optional(),
  notify_mentions: z.boolean().optional(),
  notify_direct_messages: z.boolean().optional(),
  notify_friend_requests: z.boolean().optional(),
  quiet_hours_start: optionalTime.optional(),
  quiet_hours_end: optionalTime.optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  accent_color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  message_density: z.enum(['cozy', 'compact']).optional(),
  font_scale: z.number().int().min(80).max(140).optional(),
  app_zoom: z.number().int().min(80).max(150).optional(),
  reduce_motion: z.boolean().optional(),
  high_contrast: z.boolean().optional(),
  color_vision: z.enum(['none', 'deuteranopia', 'protanopia', 'tritanopia']).optional(),
  screen_reader: z.boolean().optional(),
  captions: z.boolean().optional(),
  language: z.enum(['de', 'en']).optional(),
  date_format: z.enum(['de-DE', 'en-US', 'en-GB']).optional(),
  time_format: z.enum(['24h', '12h']).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  spellcheck: z.boolean().optional(),
  voice_input_device: z.string().max(300).nullable().optional(),
  voice_output_device: z.string().max(300).nullable().optional(),
  voice_camera_device: z.string().max(300).nullable().optional(),
  voice_input_mode: z.enum(['voice_activity', 'push_to_talk']).optional(),
  voice_sensitivity: z.number().int().min(0).max(100).optional(),
  voice_noise_suppression: z.boolean().optional(),
  voice_echo_cancellation: z.boolean().optional(),
  voice_auto_gain: z.boolean().optional(),
  push_to_talk_key: z.string().trim().min(1).max(40).optional()
}).strict();
