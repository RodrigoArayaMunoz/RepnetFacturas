import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

let db;
let userId;
const hash = (number) => number.toString(16).padStart(64, "0");
const recipients = ["Contacto@autthcomercial.cl", "m.arellano@autthcomercial.cl"];

before(async () => {
  // Embedded PostgreSQL runs in memory; no Supabase credentials or network.
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
  `);
  await db.exec(await readFile(new URL("../migrations/202610240001_invoice_mail.sql", import.meta.url), "utf8"));
});

beforeEach(async () => {
  await db.exec("delete from public.invoice_mail_deliveries; delete from public.invoice_mail_devices; delete from auth.users;");
  userId = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [userId]);
});

after(async () => { await db?.close(); });

async function approve() {
  await db.query("insert into public.invoice_mail_devices (user_id, enabled) values ($1, true)", [userId]);
}

async function claim(number = 1, id = userId) {
  return (await db.query("select public.claim_invoice_mail_delivery($1, $2) as result", [id, hash(number)])).rows[0].result;
}

async function settle(deliveryId, status = "sent", accepted = recipients, rejected = []) {
  return (await db.query("select public.settle_invoice_mail_delivery($1, $2, $3, $4, $5, $6) as result", [
    deliveryId, status, "<local@example.test>", accepted, rejected, status === "sent" ? null : "SMTP_ERROR",
  ])).rows[0].result;
}

test("migration denies automatic approval and denies administrative access to client roles", async () => {
  assert.equal((await claim()).status, "device_not_approved");
  await db.query("insert into public.invoice_mail_devices (user_id) values ($1)", [userId]);
  assert.equal((await claim()).status, "device_not_approved");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query("select * from public.invoice_mail_devices"), { code: "42501" });
      await assert.rejects(db.query("update public.invoice_mail_devices set enabled = true"), { code: "42501" });
      await assert.rejects(claim(), { code: "42501" });
      await assert.rejects(settle(randomUUID()), { code: "42501" });
    } finally {
      await db.exec("reset role");
    }
  }
});

test("service_role can reserve and settle; the same image remains idempotent", async () => {
  await approve();
  await db.exec("set role service_role");
  try {
    const first = await claim();
    assert.equal(first.status, "claimed");
    assert.equal((await claim()).status, "in_progress");
    const completed = await settle(first.deliveryId);
    assert.equal(completed.status, "sent");
    assert.ok(completed.sentAt);
    const duplicate = await claim();
    assert.equal(duplicate.status, "sent");
    assert.equal(duplicate.messageId, "<local@example.test>");
    assert.equal(duplicate.sentAt, completed.sentAt);
    assert.equal((await db.query("select count(*)::int as total from public.invoice_mail_deliveries")).rows[0].total, 1);
  } finally {
    await db.exec("reset role");
  }
});

test("uncertain and interrupted deliveries never obtain another sending claim", async () => {
  await approve();
  const first = await claim();
  await settle(first.deliveryId, "uncertain");
  assert.equal((await claim()).status, "uncertain");
  // A late success cannot erase an already ambiguous record.
  assert.equal((await settle(first.deliveryId)).status, "uncertain");
  const interrupted = await claim(2);
  await db.query("update public.invoice_mail_deliveries set created_at = now() - interval '11 minutes' where id = $1", [interrupted.deliveryId]);
  assert.equal((await claim(2)).status, "uncertain");
  const row = (await db.query("select error_code from public.invoice_mail_deliveries where id = $1", [interrupted.deliveryId])).rows[0];
  assert.equal(row.error_code, "WORKER_INTERRUPTED");
});

test("a partial SMTP result cannot be recorded as a complete success", async () => {
  await approve();
  const first = await claim();
  await assert.rejects(settle(first.deliveryId, "sent", [recipients[0]], [recipients[1]]), { code: "22023" });
  assert.equal((await claim()).status, "in_progress");
  await settle(first.deliveryId, "uncertain", [recipients[0]], [recipients[1]]);
  assert.equal((await claim()).status, "uncertain");
});

test("the rolling quota includes uncertain attempts and is global across installations", async () => {
  await approve();
  await db.query(`insert into public.invoice_mail_deliveries (user_id, image_sha256, status)
    select $1, lpad(to_hex(number), 64, '0'), 'uncertain' from generate_series(1, 49) as number`, [userId]);
  const otherUserId = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [otherUserId]);
  await db.query("insert into public.invoice_mail_devices (user_id, enabled) values ($1, true)", [otherUserId]);
  assert.equal((await claim(50, otherUserId)).status, "claimed");
  assert.equal((await claim(51)).status, "daily_limit");
  assert.equal((await claim(1)).status, "uncertain");
  await db.query("update public.invoice_mail_deliveries set created_at = now() - interval '25 hours' where image_sha256 = $1", [hash(1)]);
  assert.equal((await claim(51)).status, "claimed");
});

test("revoking an installation prevents further claims even for previously sent images", async () => {
  await approve();
  const first = await claim();
  await settle(first.deliveryId);
  await db.query("update public.invoice_mail_devices set enabled = false where user_id = $1", [userId]);
  assert.equal((await claim()).status, "device_not_approved");
  assert.equal((await claim(2)).status, "device_not_approved");
});
