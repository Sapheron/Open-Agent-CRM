import { z } from 'zod';

export const CreateContactSchema = z.object({
  phoneNumber: z.string().min(7).max(20),
  displayName: z.string().max(100).optional(),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  email: z.string().email().optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  customFields: z.record(z.unknown()).default({}),
  notes: z.string().max(2000).optional(),
});

export const UpdateContactSchema = CreateContactSchema.partial();

export type CreateContactDto = z.infer<typeof CreateContactSchema>;
export type UpdateContactDto = z.infer<typeof UpdateContactSchema>;
