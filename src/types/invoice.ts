export type InvoiceData = {
  documentReadable: boolean;
  supplierName: string | null;
  invoiceNumber: string | null;
  warnings: string[];
};

export type InvoiceProcessingStatus =
  | 'idle'
  | 'ready'
  | 'processing'
  | 'success'
  | 'error';
