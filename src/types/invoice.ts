export type InvoiceProduct = {
  productCode: string | null;
  quantity: number | null;
};

export type InvoiceData = {
  documentReadable: boolean;
  supplierName: string | null;
  invoiceNumber: string | null;
  products: InvoiceProduct[];
  warnings: string[];
};

export type InvoiceProcessingStatus =
  | 'idle'
  | 'ready'
  | 'processing'
  | 'success'
  | 'error';
