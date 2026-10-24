import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';

import { INVOICE_EMAIL_FUNCTION, INVOICE_EMAIL_RECIPIENTS, MAX_INVOICE_IMAGE_BYTES } from '@/config/invoice-email';
import { getMailSession, getMailSupabaseConfig, MailSessionError } from '@/services/supabase-client';

export type InvoiceEmailReceipt = {
  messageId: string;
  sentAt: string;
  recipients: string[];
  alreadySent: boolean;
};

export class InvoiceMailError extends Error {
  constructor(message: string, public readonly code: string, public readonly deviceId?: string) {
    super(message);
    this.name = 'InvoiceMailError';
  }
}

type EmailInput = { photoUri: string; subject: string; message: string };

function isReceipt(value: Record<string, unknown>): value is Record<string, unknown> & InvoiceEmailReceipt {
  return value.ok === true && typeof value.messageId === 'string' && value.messageId.length > 0 &&
    typeof value.sentAt === 'string' && Number.isFinite(Date.parse(value.sentAt)) &&
    typeof value.alreadySent === 'boolean' && Array.isArray(value.recipients) &&
    value.recipients.length === INVOICE_EMAIL_RECIPIENTS.length &&
    INVOICE_EMAIL_RECIPIENTS.every((expected) => (value.recipients as unknown[]).some(
      (item) => typeof item === 'string' && item.toLowerCase() === expected.toLowerCase(),
    ));
}

export async function sendInvoiceEmail({ photoUri, subject, message }: EmailInput): Promise<InvoiceEmailReceipt> {
  if (!photoUri) throw new InvoiceMailError('Toma una foto antes de enviar la factura.', 'PHOTO_MISSING');
  if (!subject.trim() || subject.length > 300 || /[\r\n]/.test(subject)) {
    throw new InvoiceMailError('El asunto debe tener entre 1 y 300 caracteres, en una sola línea.', 'INVALID_SUBJECT');
  }
  if (!message.trim() || message.length > 10000) {
    throw new InvoiceMailError('El mensaje debe tener entre 1 y 10.000 caracteres.', 'INVALID_MESSAGE');
  }

  let photo: Blob;
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(photoUri);
      if (!response.ok) throw new Error('Foto no disponible.');
      photo = await response.blob();
    } else {
      const file = new File(photoUri);
      if (!file.exists) throw new Error('Foto no disponible.');
      photo = file;
    }
  } catch {
    throw new InvoiceMailError('La fotografía ya no está disponible. Vuelve a tomarla.', 'PHOTO_MISSING');
  }
  if (photo.size === 0 || photo.size > MAX_INVOICE_IMAGE_BYTES) {
    throw new InvoiceMailError('La fotografía debe pesar entre 1 byte y 10 MB.', 'IMAGE_TOO_LARGE');
  }

  let accessToken: string;
  let url: string;
  let key: string;
  try {
    ({ url, key } = getMailSupabaseConfig());
    accessToken = (await getMailSession()).access_token;
  } catch (error) {
    if (error instanceof MailSessionError) throw new InvoiceMailError(error.message, error.code);
    throw new InvoiceMailError('No pudimos preparar el envío. Revisa la conexión e inténtalo nuevamente.', 'SESSION_UNAVAILABLE');
  }

  const form = new FormData();
  // The Edge Function verifies the actual image bytes, independently of the filename/type.
  const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
  form.append('photo', photo, `foto-factura.${extension}`);
  form.append('subject', subject.trim());
  form.append('message', message);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(`${url}/functions/v1/${INVOICE_EMAIL_FUNCTION}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
      body: form,
      signal: controller.signal,
    });
    let result: Record<string, unknown>;
    try {
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta inválida');
      result = value as Record<string, unknown>;
    } catch {
      throw new InvoiceMailError(
        'No pudimos confirmar el resultado. Revisa Enviados en el correo de bodega antes de volver a intentarlo.',
        'DELIVERY_UNCERTAIN',
      );
    }
    if (!response.ok || result.ok !== true) {
      if (result.ok !== false || typeof result.code !== 'string' || !result.code ||
          typeof result.message !== 'string') {
        throw new InvoiceMailError(
          'No pudimos confirmar el resultado. Revisa Enviados en el correo de bodega antes de volver a intentarlo.',
          'DELIVERY_UNCERTAIN',
        );
      }
      throw new InvoiceMailError(
        result.message,
        result.code,
        typeof result.deviceId === 'string' ? result.deviceId : undefined,
      );
    }
    if (!isReceipt(result)) {
      throw new InvoiceMailError(
        'El servidor no confirmó todos los datos del envío. Revisa Enviados en el correo de bodega.',
        'DELIVERY_UNCERTAIN',
      );
    }
    return { messageId: result.messageId, sentAt: result.sentAt,
      recipients: result.recipients, alreadySent: result.alreadySent };
  } catch (error) {
    if (error instanceof InvoiceMailError) throw error;
    throw new InvoiceMailError(
      'La conexión se interrumpió y no pudimos confirmar el envío. Revisa Enviados en el correo de bodega.',
      'DELIVERY_UNCERTAIN',
    );
  } finally {
    clearTimeout(timeout);
  }
}
