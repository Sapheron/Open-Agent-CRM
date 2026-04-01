import { z } from 'zod';

export const SendMessageSchema = z.object({
  conversationId: z.string().cuid(),
  body: z.string().max(4096).optional(),
  mediaUrl: z.string().url().optional(),
  mediaCaption: z.string().max(1024).optional(),
}).refine((d) => d.body || d.mediaUrl, {
  message: 'Either body or mediaUrl is required',
});

export type SendMessageDto = z.infer<typeof SendMessageSchema>;
