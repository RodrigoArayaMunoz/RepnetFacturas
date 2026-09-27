import { Platform } from 'react-native';

import type { InvoiceData, InvoiceProduct } from '@/types/invoice';

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export class InvoiceApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'InvoiceApiError';
    this.status = status;
  }
}

function getImageMetadata(uri: string) {
  const dataUriType = uri.match(/^data:(image\/(?:jpeg|png|webp));base64,/i)?.[1];
  const extensionMatch = uri.match(/\.(jpe?g|png|webp)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const extension = extensionMatch === 'jpeg' ? 'jpg' : (extensionMatch ?? 'jpg');
  const type = dataUriType?.toLowerCase() ??
    (extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg');

  return {
    fileName: `factura-${Date.now()}.${extension}`,
    type,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isInvoiceProduct(value: unknown): value is InvoiceProduct {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const product = value as Record<string, unknown>;

  return (
    isNullableString(product.productCode) &&
    (product.quantity === null || typeof product.quantity === 'number')
  );
}

function isInvoiceData(value: unknown): value is InvoiceData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const invoice = value as Record<string, unknown>;

  return (
    typeof invoice.documentReadable === 'boolean' &&
    isNullableString(invoice.supplierName) &&
    isNullableString(invoice.invoiceNumber) &&
    Array.isArray(invoice.products) &&
    invoice.products.every(isInvoiceProduct) &&
    Array.isArray(invoice.warnings) &&
    invoice.warnings.every((warning) => typeof warning === 'string')
  );
}

function readErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const message = (value as Record<string, unknown>).message;
  return typeof message === 'string' ? message : null;
}

export async function analyzeInvoice(photoUri: string): Promise<InvoiceData> {
  if (!apiUrl) {
    throw new InvoiceApiError(
      'Falta configurar EXPO_PUBLIC_API_URL. Revisa el archivo .env.local.',
    );
  }

  const formData = new FormData();
  const { fileName, type } = getImageMetadata(photoUri);

  if (Platform.OS === 'web') {
    const imageResponse = await fetch(photoUri);
    const imageBlob = await imageResponse.blob();
    formData.append('invoice', imageBlob, fileName);
  } else {
    formData.append(
      'invoice',
      {
        name: fileName,
        type,
        uri: photoUri,
      } as unknown as Blob,
    );
  }

  let response: Response;

  try {
    response = await fetch(`${apiUrl}/api/invoices/analyze`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new InvoiceApiError(
      'No pudimos conectar con el servidor. Verifica que el backend esté iniciado y que el teléfono use la misma red Wi-Fi.',
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new InvoiceApiError(
      'El servidor respondió con un formato inesperado.',
      response.status,
    );
  }

  if (!response.ok) {
    throw new InvoiceApiError(
      readErrorMessage(payload) ?? 'No fue posible procesar la factura.',
      response.status,
    );
  }

  if (!isInvoiceData(payload)) {
    throw new InvoiceApiError('Los datos recibidos de la factura no son válidos.');
  }

  return payload;
}
