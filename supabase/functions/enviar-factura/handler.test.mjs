import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import nodemailer from "nodemailer";
import { createInvoiceMailHandler, MAX_IMAGE_BYTES, RECIPIENTS } from "./handler.ts";

// A real 1x1 PNG. Tests use local MIME generation or an injected sender, never SMTP.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=", "base64");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const SENT_AT = "2026-10-24T12:00:00.000Z";

function request({ photo = PNG, type = "image/png", subject = "Factura Nº 123", message = "Estimados:\nAdjunto fotografía de factura.", fields = {}, auth = "Bearer valid-token" } = {}) {
  const form = new FormData();
  if (photo !== null) form.append("photo", new Blob([photo], { type }), "../../unsafe.jpg");
  form.append("subject", subject);
  form.append("message", message);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request("https://example.test/enviar-factura", {
    method: "POST",
    headers: auth ? { Authorization: auth } : {},
    body: form,
  });
}

function fixture(overrides = {}) {
  const records = new Map();
  const sent = [];
  const claims = [];
  const settlements = [];
  const deps = {
    senderAddress: "bodega@autthcomercial.cl",
    authenticate: async (token) => token === "valid-token" ? { id: USER_ID } : null,
    isDeviceApproved: async () => true,
    async claimDelivery(userId, hash) {
      claims.push({ userId, hash });
      const key = `${userId}:${hash}`;
      const record = records.get(key);
      if (record) {
        if (record.status === "sent") return { status: "sent", messageId: record.messageId, sentAt: record.sentAt };
        return { status: record.status === "sending" ? "in_progress" : "uncertain" };
      }
      const deliveryId = `delivery-${records.size + 1}`;
      records.set(key, { deliveryId, status: "sending" });
      return { status: "claimed", deliveryId };
    },
    async settleDelivery(input) {
      settlements.push(input);
      const record = [...records.values()].find((value) => value.deliveryId === input.deliveryId);
      Object.assign(record, { status: input.status, messageId: input.messageId, sentAt: input.status === "sent" ? SENT_AT : null });
      return record;
    },
    async sendMail(message) {
      sent.push(message);
      return { messageId: "<local-message@example.test>", accepted: [...RECIPIENTS], rejected: [] };
    },
    ...overrides,
  };
  return { handler: createInvoiceMailHandler(deps), records, sent, claims, settlements, deps };
}

test("the exact camera image, MIME type, text and fixed recipients reach the sender", async () => {
  const f = fixture();
  const response = await f.handler(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true, messageId: "<local-message@example.test>", sentAt: SENT_AT,
    recipients: [...RECIPIENTS], alreadySent: false,
  });
  const [message] = f.sent;
  assert.deepEqual(message.to, [...RECIPIENTS]);
  assert.equal(message.from.address, "bodega@autthcomercial.cl");
  assert.equal(message.subject, "Factura Nº 123");
  assert.equal(message.text, "Estimados:\nAdjunto fotografía de factura.");
  const [attachment] = message.attachments;
  assert.deepEqual(Buffer.from(attachment.content), PNG);
  assert.equal(attachment.contentType, "image/png");
  assert.equal(attachment.contentDisposition, "attachment");
  assert.match(attachment.filename, /^factura-[a-f0-9]{16}\.png$/);
  assert.equal(f.claims[0].hash, createHash("sha256").update(PNG).digest("hex"));
});

test("Nodemailer produces a real offline MIME attachment without SMTP delivery", async () => {
  let mime;
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const f = fixture({
    async sendMail(message) {
      const generated = await transport.sendMail({
        ...message,
        attachments: message.attachments.map((attachment) => ({ ...attachment, content: Buffer.from(attachment.content) })),
      });
      mime = generated.message.toString("utf8");
      assert.deepEqual(generated.envelope.to.map((value) => value.toLowerCase()), RECIPIENTS.map((value) => value.toLowerCase()));
      return { messageId: generated.messageId, accepted: [...RECIPIENTS], rejected: [] };
    },
  });
  assert.equal((await f.handler(request())).status, 200);
  assert.match(mime, /Content-Type: multipart\/mixed/i);
  assert.match(mime, /Content-Type: image\/png/i);
  assert.match(mime, /Content-Disposition: attachment;/i);
  const encoded = mime.match(/Content-Transfer-Encoding: base64\r\n[^]*?\r\n\r\n([^]*?)\r\n--/i)?.[1];
  assert.ok(encoded, "MIME contains base64 attachment data");
  assert.deepEqual(Buffer.from(encoded.replace(/\s/g, ""), "base64"), PNG);
  transport.close();
});

test("missing, forged or public API credentials cannot send", async () => {
  for (const auth of [null, "Bearer forged-token", "Bearer sb_publishable_public", "Basic ignored"]) {
    const f = fixture();
    assert.equal((await f.handler(request({ auth }))).status, 401);
    assert.equal(f.sent.length, 0);
    assert.equal(f.claims.length, 0);
  }
});

test("an authenticated but unapproved installation gets its ID and cannot claim or send", async () => {
  const f = fixture({ isDeviceApproved: async () => false });
  const response = await f.handler(request());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).deviceId, USER_ID);
  assert.equal(f.sent.length, 0);
  assert.equal(f.claims.length, 0);
});

test("approval is checked again atomically when claiming", async () => {
  const f = fixture({ claimDelivery: async () => ({ status: "device_not_approved" }) });
  const response = await f.handler(request());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "DEVICE_NOT_APPROVED");
  assert.equal(f.sent.length, 0);
});

test("arbitrary recipients, repeated fields, missing images, forged types and unsafe text are rejected", async () => {
  const cases = [
    [{ fields: { to: "somebody@example.test" } }, "INVALID_REQUEST"],
    [{ fields: { subject: "second subject" } }, "INVALID_REQUEST"],
    [{ photo: null }, "PHOTO_REQUIRED"],
    [{ photo: Buffer.from("not an image") }, "INVALID_IMAGE"],
    [{ type: "image/jpeg" }, "INVALID_IMAGE"],
    [{ type: "image/svg+xml" }, "INVALID_IMAGE"],
    [{ subject: "invoice\r\nBcc: attacker@example.test" }, "INVALID_SUBJECT"],
    [{ subject: "a".repeat(301) }, "INVALID_SUBJECT"],
    [{ message: "a".repeat(10001) }, "INVALID_MESSAGE"],
  ];
  for (const [input, code] of cases) {
    const f = fixture();
    const response = await f.handler(request(input));
    assert.equal(response.status, 400, code);
    assert.equal((await response.json()).code, code);
    assert.equal(f.sent.length, 0);
    assert.equal(f.claims.length, 0);
  }
});

test("image and streamed multipart limits reject oversized uploads without SMTP", async () => {
  const f = fixture();
  const response = await f.handler(request({ photo: Buffer.alloc(MAX_IMAGE_BYTES + 1) }));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "IMAGE_TOO_LARGE");
  const huge = request();
  huge.headers.set("Content-Length", String(MAX_IMAGE_BYTES + 100000));
  assert.equal((await f.handler(huge)).status, 413);
  const oversizedStream = new Request("https://example.test/enviar-factura", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "multipart/form-data; boundary=offline-test",
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES + 128 * 1024));
        controller.close();
      },
    }),
    duplex: "half",
  });
  assert.equal(oversizedStream.headers.has("Content-Length"), false);
  assert.equal((await f.handler(oversizedStream)).status, 413);
  assert.equal(f.sent.length, 0);
});

test("duplicate images return their previous success without another SMTP operation", async () => {
  const f = fixture();
  await f.handler(request());
  const second = await f.handler(request({ subject: "changed subject" }));
  assert.equal(second.status, 200);
  assert.equal((await second.json()).alreadySent, true);
  assert.equal(f.sent.length, 1);
});

test("concurrent calls cannot send the same image twice", async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  let sends = 0;
  const f = fixture({
    async sendMail() {
      sends += 1;
      signalStarted();
      await waiting;
      return { messageId: "<concurrent@example.test>", accepted: [...RECIPIENTS], rejected: [] };
    },
  });
  const first = f.handler(request());
  await started;
  const second = await f.handler(request());
  assert.equal(second.status, 409);
  assert.equal((await second.json()).code, "DELIVERY_IN_PROGRESS");
  release();
  assert.equal((await first).status, 200);
  assert.equal(sends, 1);
});

test("SMTP interruption and partial acceptance become terminal uncertainty", async () => {
  for (const sendMail of [
    async () => { throw Object.assign(new Error("private SMTP details"), { code: "ETIMEDOUT" }); },
    async () => ({ messageId: "<partial@example.test>", accepted: [RECIPIENTS[0]], rejected: [RECIPIENTS[1]] }),
  ]) {
    let sends = 0;
    const f = fixture({ sendMail: async (message) => { sends++; return sendMail(message); } });
    const first = await f.handler(request());
    assert.equal(first.status, 409);
    const body = await first.json();
    assert.equal(body.code, "DELIVERY_UNCERTAIN");
    assert.doesNotMatch(JSON.stringify(body), /private SMTP/);
    assert.equal((await (await f.handler(request())).json()).code, "DELIVERY_UNCERTAIN");
    assert.equal(sends, 1);
    assert.equal(f.settlements[0].status, "uncertain");
  }
});

test("a failed audit write after SMTP acceptance blocks automatic resending", async () => {
  const f = fixture({ settleDelivery: async () => { throw new Error("database unavailable"); } });
  assert.equal((await (await f.handler(request())).json()).code, "DELIVERY_UNCERTAIN");
  assert.equal((await (await f.handler(request())).json()).code, "DELIVERY_IN_PROGRESS");
  assert.equal(f.sent.length, 1);
});

test("quota and backend failures fail closed without sending", async () => {
  const limited = fixture({ claimDelivery: async () => ({ status: "daily_limit" }) });
  assert.equal((await limited.handler(request())).status, 429);
  assert.equal(limited.sent.length, 0);
  const unavailable = fixture({ isDeviceApproved: async () => { throw new Error("database unavailable"); } });
  assert.equal((await unavailable.handler(request())).status, 503);
  assert.equal(unavailable.sent.length, 0);
});

test("CORS preflight and unsupported methods never authenticate or send", async () => {
  const f = fixture({ authenticate: async () => { throw new Error("must not run"); } });
  const preflight = await f.handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /authorization/);
  assert.equal((await f.handler(new Request("https://example.test"))).status, 405);
  assert.equal(f.sent.length, 0);
});

