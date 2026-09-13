/**
 * Lapisan payment gateway (server-only).
 * Kredensial disimpan di tabel public.payment_gateways (diisi admin lewat panel),
 * dengan cadangan dari environment variable bila kolomnya masih kosong.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sbJson } from './sb.server';

export const AAPAY_DEFAULT_BASE = 'https://aapay.web.id/api/public/v1';

export type GatewayRow = {
  id: string;
  name: string;
  enabled: boolean;
  is_default: boolean;
  mode: string;
  base_url: string;
  config: Record<string, string>;
  updated_at?: string;
};

export async function listGateways() {
  return sbJson<GatewayRow[]>(
    '/rest/v1/payment_gateways?select=id,name,enabled,is_default,mode,base_url,config,updated_at&order=id.asc',
    { admin: true },
  );
}

export async function getGateway(id: string) {
  const rows = await sbJson<GatewayRow[]>(
    `/rest/v1/payment_gateways?select=id,name,enabled,is_default,mode,base_url,config&id=eq.${encodeURIComponent(id)}&limit=1`,
    { admin: true },
  );
  return rows[0] ?? null;
}

/** Gateway yang dipakai untuk transaksi baru. */
export async function activeGateway() {
  const rows = await listGateways();
  const enabled = rows.filter((g) => g.enabled);
  return enabled.find((g) => g.is_default) ?? enabled[0] ?? null;
}

function cred(g: GatewayRow | null, key: string, envName: string) {
  const fromDb = (g?.config?.[key] ?? '').trim();
  return fromDb || (process.env[envName] ?? '').trim();
}

export function aapayCreds(g: GatewayRow | null) {
  return {
    base: (g?.base_url || AAPAY_DEFAULT_BASE).replace(/\/+$/, ''),
    apiKey: cred(g, 'api_key', 'AAPAY_API_KEY'),
    apiSecret: cred(g, 'api_secret', 'AAPAY_API_SECRET'),
    webhookSecret: cred(g, 'webhook_secret', 'AAPAY_WEBHOOK_SECRET'),
  };
}

function hmacHex(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Bandingkan signature tanpa membocorkan waktu eksekusi. */
export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from((a ?? '').trim().toLowerCase(), 'utf8');
  const y = Buffer.from((b ?? '').trim().toLowerCase(), 'utf8');
  if (x.length !== y.length || x.length === 0) return false;
  return timingSafeEqual(x, y);
}

async function aapayCall<T>(
  g: GatewayRow | null,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<T> {
  const { base, apiKey, apiSecret } = aapayCreds(g);
  if (!apiKey || !apiSecret)
    throw new Error('Kredensial AAPay belum diisi di panel admin (Pembayaran).');

  const rawBody = body === undefined ? '' : JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
    'X-API-Secret': apiSecret,
    'X-Timestamp': ts,
    'X-Signature': hmacHex(apiSecret, `${ts}.${rawBody}`),
  };
  const init: RequestInit = { method, headers };
  if (rawBody) init.body = rawBody;

  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* biarkan null */
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string } } | null)?.error;
    throw new Error(`AAPay ${res.status}: ${err?.message ?? text.slice(0, 200)}`);
  }
  return (json as { data?: T })?.data ?? (json as T);
}

export type AapayOrder = {
  order_id: string;
  external_ref?: string;
  base_amount: number;
  unique_code: number;
  final_amount: number;
  status: string;
  expired_at: string;
  created_at?: string;
  qris_string?: string;
};

export function aapayCreateOrder(
  g: GatewayRow | null,
  body: {
    amount: number;
    external_ref?: string;
    callback_url?: string;
    expires_in_seconds?: number;
  },
) {
  return aapayCall<AapayOrder>(g, '/orders', 'POST', body);
}

export function aapayGetOrder(g: GatewayRow | null, orderId: string) {
  return aapayCall<AapayOrder>(g, `/orders/${encodeURIComponent(orderId)}`, 'GET');
}

export function aapayCancelOrder(g: GatewayRow | null, orderId: string) {
  return aapayCall<AapayOrder>(g, `/orders/${encodeURIComponent(orderId)}/cancel`, 'POST', {});
}

/* --------------------- Pemenuhan setelah pembayaran --------------------- */

/** Tandai pembayaran lunas, setujui pengajuan, dan aktifkan langganan. Idempotent. */
export async function fulfillPayment(paymentId: number, paidAt?: string) {
  const rows = await sbJson<
    {
      id: number;
      order_id: number | null;
      user_id: string | null;
      status: string;
    }[]
  >(`/rest/v1/payments?select=id,order_id,user_id,status&id=eq.${paymentId}&limit=1`, {
    admin: true,
  });
  const p = rows[0];
  if (!p) return { ok: false };
  if (p.status === 'paid') return { ok: true, already: true };

  await sbJson(`/rest/v1/payments?id=eq.${p.id}`, {
    admin: true,
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: {
      status: 'paid',
      paid_at: paidAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  if (p.order_id) {
    const orders = await sbJson<{ user_id: string; plan_id: string }[]>(
      `/rest/v1/plan_orders?select=user_id,plan_id&id=eq.${p.order_id}&limit=1`,
      { admin: true },
    );
    const order = orders[0];
    await sbJson(`/rest/v1/plan_orders?id=eq.${p.order_id}`, {
      admin: true,
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { status: 'paid', updated_at: new Date().toISOString() },
    });
    if (order) await activateSubscription(order.user_id, order.plan_id);
  }
  return { ok: true };
}

/** Aktifkan/perpanjang langganan user sesuai masa aktif paket. */
export async function activateSubscription(userId: string, planId: string) {
  const plans = await sbJson<{ id: string; days: number }[]>(
    `/rest/v1/plans?select=id,days&id=eq.${encodeURIComponent(planId)}&limit=1`,
    { admin: true },
  );
  const days = plans[0]?.days ?? 30;
  const expires = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  await sbJson('/rest/v1/subscriptions?on_conflict=user_id', {
    admin: true,
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: {
      user_id: userId,
      plan_id: planId,
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: expires,
    },
  });
}
