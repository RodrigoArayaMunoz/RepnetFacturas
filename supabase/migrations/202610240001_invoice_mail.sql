-- Administrative tables have RLS and deliberately have no client policies.
-- Approve each installation manually; an anonymous Auth account is not approval.
create table public.invoice_mail_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 120),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.invoice_mail_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'sending' check (status in ('sending', 'sent', 'uncertain')),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  sent_at timestamptz,
  smtp_message_id text,
  accepted text[] not null default '{}',
  rejected text[] not null default '{}',
  error_code text,
  unique (user_id, image_sha256),
  check (status <> 'sent' or (sent_at is not null and smtp_message_id is not null))
);

create index invoice_mail_deliveries_created_at_idx
  on public.invoice_mail_deliveries (created_at);

alter table public.invoice_mail_devices enable row level security;
alter table public.invoice_mail_deliveries enable row level security;
revoke all on public.invoice_mail_devices from public, anon, authenticated;
revoke all on public.invoice_mail_deliveries from public, anon, authenticated;
grant all on public.invoice_mail_devices to service_role;
grant all on public.invoice_mail_deliveries to service_role;

-- One transaction reserves a hash and one place in the rolling global quota.
-- Count all attempts, including uncertain ones, so failures cannot bypass limits.
create function public.claim_invoice_mail_delivery(p_user_id uuid, p_image_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_delivery public.invoice_mail_deliveries%rowtype;
begin
  if p_image_sha256 is null or p_image_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid image hash' using errcode = '22023';
  end if;

  -- A single lock covers different devices/hashes as well as duplicate requests.
  perform pg_catalog.pg_advisory_xact_lock(914635, 240001);
  select enabled into v_enabled from public.invoice_mail_devices
    where user_id = p_user_id for share;
  if not coalesce(v_enabled, false) then
    return pg_catalog.jsonb_build_object('status', 'device_not_approved');
  end if;

  select * into v_delivery from public.invoice_mail_deliveries
    where user_id = p_user_id and image_sha256 = p_image_sha256 for update;
  if found then
    if v_delivery.status = 'sent' then
      return pg_catalog.jsonb_build_object(
        'status', 'sent', 'messageId', v_delivery.smtp_message_id,
        'sentAt', v_delivery.sent_at
      );
    end if;
    if v_delivery.status = 'sending' then
      -- Longer than the hosted worker lifetime: never take over an expired send.
      if v_delivery.created_at < clock_timestamp() - interval '10 minutes' then
        update public.invoice_mail_deliveries set status = 'uncertain',
          completed_at = clock_timestamp(), error_code = 'WORKER_INTERRUPTED'
          where id = v_delivery.id;
        return pg_catalog.jsonb_build_object('status', 'uncertain');
      end if;
      return pg_catalog.jsonb_build_object('status', 'in_progress');
    end if;
    return pg_catalog.jsonb_build_object('status', 'uncertain');
  end if;

  if (select count(*) from public.invoice_mail_deliveries
      where created_at >= clock_timestamp() - interval '24 hours') >= 50 then
    return pg_catalog.jsonb_build_object('status', 'daily_limit');
  end if;

  insert into public.invoice_mail_deliveries (user_id, image_sha256)
    values (p_user_id, p_image_sha256) returning * into v_delivery;
  return pg_catalog.jsonb_build_object('status', 'claimed', 'deliveryId', v_delivery.id);
end;
$$;

-- No client can settle a delivery or forge a successful audit record.
create function public.settle_invoice_mail_delivery(
  p_delivery_id uuid,
  p_status text,
  p_message_id text,
  p_accepted text[],
  p_rejected text[],
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.invoice_mail_deliveries%rowtype;
begin
  if p_status is null or p_status not in ('sent', 'uncertain') then
    raise exception 'Invalid delivery status' using errcode = '22023';
  end if;
  if p_status = 'sent' and (
    p_message_id is null or p_message_id = '' or
    coalesce(cardinality(p_rejected), 0) <> 0 or
    coalesce(cardinality(p_accepted), 0) <> 2 or
    not coalesce(array['contacto@autthcomercial.cl', 'm.arellano@autthcomercial.cl']
      <@ array(select lower(address) from unnest(p_accepted) as address), false)
  ) then
    raise exception 'Complete SMTP acceptance is required' using errcode = '22023';
  end if;

  select * into v_delivery from public.invoice_mail_deliveries
    where id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found' using errcode = 'P0002';
  end if;
  if v_delivery.status = 'sending' then
    update public.invoice_mail_deliveries set
      status = p_status,
      completed_at = clock_timestamp(),
      sent_at = case when p_status = 'sent' then clock_timestamp() else null end,
      smtp_message_id = left(p_message_id, 1000),
      accepted = coalesce(p_accepted, '{}'),
      rejected = coalesce(p_rejected, '{}'),
      error_code = left(p_error_code, 100)
      where id = p_delivery_id returning * into v_delivery;
  end if;
  -- An ambiguous or completed record is terminal; retries never reset it.
  return pg_catalog.jsonb_build_object(
    'status', v_delivery.status, 'messageId', v_delivery.smtp_message_id,
    'sentAt', v_delivery.sent_at
  );
end;
$$;

revoke all on function public.claim_invoice_mail_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.settle_invoice_mail_delivery(uuid, text, text, text[], text[], text)
  from public, anon, authenticated;
grant execute on function public.claim_invoice_mail_delivery(uuid, text) to service_role;
grant execute on function public.settle_invoice_mail_delivery(uuid, text, text, text[], text[], text)
  to service_role;

comment on table public.invoice_mail_devices is
  'Admin-only approval of invoice email installations; no automatic approval.';
comment on table public.invoice_mail_deliveries is
  'SMTP acceptance audit. Uncertain/sending hashes are never retried automatically.';
