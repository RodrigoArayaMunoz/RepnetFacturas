import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type { InvoiceData, InvoiceProduct } from '@/types/invoice';

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
  const { fileName } = getImageMetadata(photoUri);

  try {
    if (Platform.OS === 'web') {
      const imageResponse = await fetch(photoUri);
      if (!imageResponse.ok) throw new Error('La fotografía no está disponible.');
      const imageBlob = await imageResponse.blob();
      if (imageBlob.size > MAX_IMAGE_BYTES) {
        throw new InvoiceApiError('La fotografía supera el máximo de 10 MB. Toma otra foto de menor tamaño.');
      }
      formData.append('invoice', imageBlob, fileName);
    } else {
      const file = new File(photoUri);
      if (!file.exists || file.size === 0) {
        throw new InvoiceApiError('La fotografía ya no está disponible. Toma otra foto para continuar.');
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new InvoiceApiError('La fotografía supera el máximo de 10 MB. Toma otra foto de menor tamaño.');
      }
      // Expo SDK 57 fetch accepts a File/Blob, not RN's legacy { uri, name, type }.
      formData.append('invoice', file);
    }
  } catch (error) {
    if (error instanceof InvoiceApiError) throw error;
    if (__DEV__) console.warn('[Factura: lectura]', error instanceof Error ? error.message : 'Error desconocido');
    throw new InvoiceApiError('No pudimos leer la fotografía. Toma otra foto e inténtalo nuevamente.');
  }

  let response: Awaited<ReturnType<typeof fetch>>;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    response = await fetch(`${apiUrl}/api/invoices/analyze`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (__DEV__) console.warn('[Factura: envío]', apiUrl, error instanceof Error ? error.message : 'Error desconocido');
    throw new InvoiceApiError(
      controller.signal.aborted
        ? 'El servidor tardó demasiado en responder. Inténtalo nuevamente.'
        : 'No pudimos enviar la fotografía al servidor. Comprueba la conexión e inténtalo nuevamente.',
    );
  } finally {
    clearTimeout(timeout);
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
