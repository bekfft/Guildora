import { z } from 'zod';

const state = z.number().int().min(-1).max(1);

export const channelRolePermissionSchema = z.object({
  viewChannel: state,
  readHistory: state,
  sendMessages: state,
  attachFiles: state,
  manageMessages: state
});
