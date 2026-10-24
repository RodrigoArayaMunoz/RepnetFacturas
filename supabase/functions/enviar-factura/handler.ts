export const RECIPIENTS = [
  "Contacto@autthcomercial.cl",
  "m.arellano@autthcomercial.cl",
] as const;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

export type DeliveryClaim =
  | { status: "claimed"; deliveryId: string }
  | { status: "sent"; messageId: string; sentAt: string }
  | { status: "in_progress" | "uncertain" | "daily_limit" | "device_not_approved" };

export type InvoiceMessage = {
  from: { name: string; address: string };
  to: string[];
  subject: string;
  text: string;
  attachments: {
    filename: string;
    content: Uint8Array;
    contentType: string;
    contentDisposition: "attachment";
  }[];
};

export type MailResult = { messageId: string; accepted: string[]; rejected: string[] };
export type Settlement = {
  deliveryId: string;
  status: "sent" | "uncertain";
  messageId: string | null;
  accepted: string[];
  rejected: string[];
  errorCode: string | null;
};

export type MailDependencies = {
  senderAddress: string;
  authenticate: (token: string) => Promise<{ id: string } | null>;
  isDeviceApproved: (userId: string) => Promise<boolean>;
  claimDelivery: (userId: string, imageHash: string) => Promise<DeliveryClaim>;
  settleDelivery: (input: Settlement) => Promise<{
    status: string;
    messageId: string | null;
    sentAt: string | null;
  }>;
  sendMail: (message: InvoiceMessage) => Promise<MailResult>;
};

class RequestError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

function failure(code: string, message: string, status: number, deviceId?: string) {
  return json({ ok: false, code, message, ...(deviceId ? { deviceId } : {}) }, status);
}

function success(messageId: string, sentAt: string, alreadySent: boolean) {
  return json({ ok: true, messageId, sentAt, recipients: [...RECIPIENTS], alreadySent });
}

async function limitedFormData(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new RequestError("INVALID_REQUEST", "Envía la foto como formulario multipart.");
  }
  const length = request.headers.get("content-length");
  if (length && Number(length) > MAX_REQUEST_BYTES) {
    throw new RequestError("IMAGE_TOO_LARGE", "La imagen debe pesar como máximo 10 MiB.", 413);
  }
  if (!request.body) throw new RequestError("INVALID_REQUEST", "Falta el formulario.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestError("IMAGE_TOO_LARGE", "La imagen debe pesar como máximo 10 MiB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return await new Response(bytes.buffer, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new RequestError("INVALID_REQUEST", "No se pudo leer el formulario.");
  }
}

function imageExtension(type: string, bytes: Uint8Array): string | null {
  if (type === "image/jpeg" && bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (type === "image/png" && bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "png";
  if (type === "image/webp" && bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "webp";
  return null;
}

async function parseInvoice(request: Request) {
  const form = await limitedFormData(request);
  const allowed = new Set(["photo", "subject", "message"]);
  for (const key of form.keys()) {
    if (!allowed.has(key) || form.getAll(key).length !== 1) {
      throw new RequestError("INVALID_REQUEST", "El formulario contiene campos no permitidos o repetidos.");
    }
  }
  const photo = form.get("photo");
  const subject = form.get("subject");
  const message = form.get("message");
  if (!(photo instanceof Blob) || photo.size === 0) {
    throw new RequestError("PHOTO_REQUIRED", "Adjunta la foto de la factura.");
  }
  if (photo.size > MAX_IMAGE_BYTES) {
    throw new RequestError("IMAGE_TOO_LARGE", "La imagen debe pesar como máximo 10 MiB.", 413);
  }
  if (typeof subject !== "string" || !subject.trim() || subject.length > 300 || /[\r\n]/.test(subject)) {
    throw new RequestError("INVALID_SUBJECT", "El asunto debe tener entre 1 y 300 caracteres, sin saltos de línea.");
  }
  if (typeof message !== "string" || message.length > 10000) {
    throw new RequestError("INVALID_MESSAGE", "El texto debe tener como máximo 10000 caracteres.");
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const type = photo.type.toLowerCase();
  const extension = imageExtension(type, bytes);
  if (!extension) {
    throw new RequestError("INVALID_IMAGE", "Usa una imagen JPEG, PNG o WebP válida.");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { bytes, type, extension, hash, subject: subject.trim(), message: message.replace(/\r\n/g, "\n") };
}

function safeSmtpCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,50}$/.test(code) ? code : "SMTP_ERROR";
}

export function createInvoiceMailHandler(deps: MailDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== "POST") return failure("METHOD_NOT_ALLOWED", "Usa POST.", 405);

    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
    if (!match) return failure("AUTH_REQUIRED", "No se pudo identificar este dispositivo.", 401);

    let user: { id: string } | null;
    try {
      user = await deps.authenticate(match[1]);
    } catch {
      return failure("AUTH_UNAVAILABLE", "No se pudo verificar el dispositivo. Intenta nuevamente.", 503);
    }
    if (!user) return failure("INVALID_SESSION", "La sesión del dispositivo no es válida.", 401);

    try {
      if (!await deps.isDeviceApproved(user.id)) {
        return failure("DEVICE_NOT_APPROVED", "Este dispositivo todavía no está autorizado para enviar facturas.", 403, user.id);
      }
      const invoice = await parseInvoice(request);
      const claim = await deps.claimDelivery(user.id, invoice.hash);
      if (claim.status === "device_not_approved") {
        return failure("DEVICE_NOT_APPROVED", "Este dispositivo todavía no está autorizado para enviar facturas.", 403, user.id);
      }
      if (claim.status === "sent") return success(claim.messageId, claim.sentAt, true);
      if (claim.status === "daily_limit") {
        return failure("DAILY_LIMIT_REACHED", "Se alcanzó el límite de 50 facturas en las últimas 24 horas.", 429);
      }
      if (claim.status === "in_progress") {
        return failure("DELIVERY_IN_PROGRESS", "Esta foto ya se está enviando. Espera antes de consultar nuevamente.", 409);
      }
      if (claim.status === "uncertain") {
        return failure("DELIVERY_UNCERTAIN", "Este envío requiere revisión en Bodega antes de volver a enviarlo.", 409);
      }
      if (claim.status !== "claimed") throw new Error("Invalid delivery claim");

      let result: MailResult;
      try {
        result = await deps.sendMail({
          from: { name: "Bodega", address: deps.senderAddress },
          to: [...RECIPIENTS],
          subject: invoice.subject,
          text: invoice.message,
          attachments: [{
            filename: `factura-${invoice.hash.slice(0, 16)}.${invoice.extension}`,
            content: invoice.bytes,
            contentType: invoice.type,
            contentDisposition: "attachment",
          }],
        });
      } catch (error) {
        await markUncertain(deps, claim.deliveryId, safeSmtpCode(error));
        return failure("DELIVERY_UNCERTAIN", "No se pudo confirmar el envío. Revisa el correo de Bodega antes de volver a enviarlo.", 409);
      }
      const accepted = new Set(result.accepted.map((address) => address.toLowerCase()));
      const complete = result.messageId && result.rejected.length === 0 &&
        RECIPIENTS.every((address) => accepted.has(address.toLowerCase()));
      if (!complete) {
        await markUncertain(deps, claim.deliveryId, "PARTIAL_DELIVERY", result);
        return failure("DELIVERY_UNCERTAIN", "No se confirmó la entrega a todos los destinatarios. Revisa el correo de Bodega.", 409);
      }
      try {
        const record = await deps.settleDelivery({
          deliveryId: claim.deliveryId,
          status: "sent",
          messageId: result.messageId,
          accepted: result.accepted,
          rejected: result.rejected,
          errorCode: null,
        });
        if (record.status !== "sent" || !record.messageId || !record.sentAt) {
          throw new Error("Delivery not recorded");
        }
        return success(record.messageId, record.sentAt, false);
      } catch {
        await markUncertain(deps, claim.deliveryId, "RECORDING_FAILED", result);
        return failure("DELIVERY_UNCERTAIN", "El servidor de correo aceptó el envío, pero no se pudo registrar. Revisa Bodega antes de reenviarlo.", 409);
      }
    } catch (error) {
      if (error instanceof RequestError) return failure(error.code, error.message, error.status);
      return failure("SERVICE_UNAVAILABLE", "No se pudo preparar el envío. Intenta nuevamente.", 503);
    }
  };
}

async function markUncertain(deps: MailDependencies, deliveryId: string, errorCode: string, result?: MailResult) {
  try {
    await deps.settleDelivery({
      deliveryId,
      status: "uncertain",
      messageId: result?.messageId || null,
      accepted: result?.accepted ?? [],
      rejected: result?.rejected ?? [],
      errorCode,
    });
  } catch {
    // A persisted "sending" claim also blocks a retry, even if this write fails.
  }
}
