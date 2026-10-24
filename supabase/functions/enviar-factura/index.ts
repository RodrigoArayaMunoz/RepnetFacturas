import { Buffer } from "node:buffer";
import nodemailer from "npm:nodemailer@10.2.1";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createInvoiceMailHandler, type DeliveryClaim, type Settlement } from "./handler.ts";

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function adminKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const key = keys ? JSON.parse(keys).default : undefined;
  return key || required("SUPABASE_SERVICE_ROLE_KEY");
}

// All privileged keys and Gmail credentials stay inside this Edge Function.
const admin = createClient(required("SUPABASE_URL"), adminKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const senderAddress = required("SMTP_USER");
const smtpPassword = required("SMTP_PASS").replace(/\s/g, "");

const handler = createInvoiceMailHandler({
  senderAddress,
  async authenticate(token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error) {
      if (error.status === 401 || error.status === 403 || error.status === 400) return null;
      throw new Error("Auth unavailable");
    }
    return data.user ? { id: data.user.id } : null;
  },
  async isDeviceApproved(userId) {
    const { data, error } = await admin.from("invoice_mail_devices")
      .select("enabled").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Device authorization unavailable");
    return data?.enabled === true;
  },
  async claimDelivery(userId, imageHash) {
    const { data, error } = await admin.rpc("claim_invoice_mail_delivery", {
      p_user_id: userId,
      p_image_sha256: imageHash,
    });
    if (error || !data) throw new Error("Delivery claim unavailable");
    return data as DeliveryClaim;
  },
  async settleDelivery(input: Settlement) {
    const { data, error } = await admin.rpc("settle_invoice_mail_delivery", {
      p_delivery_id: input.deliveryId,
      p_status: input.status,
      p_message_id: input.messageId,
      p_accepted: input.accepted,
      p_rejected: input.rejected,
      p_error_code: input.errorCode,
    });
    if (error || !data) throw new Error("Delivery recording unavailable");
    return data;
  },
  async sendMail(message) {
    const smtp = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: senderAddress, pass: smtpPassword },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 45000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const result = await smtp.sendMail({
        ...message,
        attachments: message.attachments.map((attachment) => ({
          ...attachment,
          content: Buffer.from(attachment.content),
        })),
      });
      const addresses = (values: unknown[] = []) => values.map((value) =>
        typeof value === "string" ? value : String((value as { address?: string }).address ?? ""));
      return {
        messageId: result.messageId,
        accepted: addresses(result.accepted),
        rejected: addresses(result.rejected),
      };
    } finally {
      smtp.close();
    }
  },
});

Deno.serve(handler);
