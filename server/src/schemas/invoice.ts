import { z } from 'zod';

export const invoiceSchema = z.object({
  documentReadable: z.boolean(),
  supplierName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  warnings: z.array(z.string()),
});

export type InvoiceData = z.infer<typeof invoiceSchema>;
