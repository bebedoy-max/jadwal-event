import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireAdmin, requireUser, sbJson } from './sb.server';

/* =========================== Sisi admin ================================= */

export type GatewayView = {
  id: string;
  name: string;
  enabled: boolean;
  is_default: boolean;
  mode: string;
  base_url: string;
  /** Hanya penanda terisi/kosong — nilai rahasia tidak pernah dikirim ke browser. */
  filled: Record<string, boolean>;
  fields: string[];
  updated_at: string | null;
};

const FIELDS: Record<string, string[]> = {
  aapay: ['api_key', 'api_secret', 'webhook_secret'],
  midtrans: ['server_key', 'client_key', 'merchant_id'],
  doku: ['client_id', 'secret_key'],
};

function fieldsFor(id: string, config: Record<string, string>) {
  const known = FIELDS[id] ?? ['api_key', 'api_secret', 'webhook_secret'];
  const extra = Object.keys(config ?? {}).filter((k) => !known.includes(k));
  return [...known, ...extra];
}

export const adminListGateways = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }): Promise<GatewayView[]> => {
    await requireAdmin(data.token);
    const { listGateways } = await import('./payments.server');
    const rows = await listGateways();
    return rows.map((g) => {
      const fields = fieldsFor(g.id, g.config ?? {});
      return {
        id: g.id,
        name: g.name,
        enabled: g.enabled,
        is_default: g.is_default,
        mode: g.mode,
        base_url: g.base_url,
        fields,
        filled: Object.fromEntries(fields.map((f) => [f, Boolean((g.config?.[f] ?? '').trim())])),
        updated_at: g.updated_at ?? null,
      };
    });
  });

export const adminSaveGateway = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: {
      token: string;
      id: string;
      name?: string;
      enabled?: boolean;
      is_default?: boolean;
      mode?: string;
      base_url?: string;
      /** Hanya kolom yang diisi yang akan menimpa nilai lama. */
      config?: Record<string, string>;
    }) => {
      if (!d.id?.trim()) throw new Error('Pilih penyedia pembayaran.');
      return d;
    },
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { getGateway } = await import('./payments.server');
    const current = await getGateway(data.id);
    const config = { ...(current?.config ?? {}) };
    for (const [k, v] of Object.entries(data.config ?? {})) {
      const val = (v ?? '').trim();
      if (val === '') continue; // biarkan nilai lama
      if (val === '-') delete config[k]; // "-" untuk mengosongkan
      else config[k] = val;
    }

    const body = {
      id: data.id,
      name: data.name?.trim() || current?.name || data.id,
      enabled: data.enabled ?? current?.enabled ?? false,
      is_default: data.is_default ?? current?.is_default ?? false,
      mode: data.mode || current?.mode || 'live',
      base_url: (data.base_url ?? current?.base_url ?? '').trim(),
      config,
      updated_at: new Date().toISOString(),
    };

    await sbJson('/rest/v1/payment_gateways?on_conflict=id', {
      admin: true,
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body,
    });

    if (body.is_default) {
      await sbJson(`/rest/v1/payment_gateways?id=neq.${encodeURIComponent(data.id)}`, {
        admin: true,
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { is_default: false },
      });
    }
    return { ok: true };
  });

export type PaymentRow = {
  id: number;
  order_id: number | null;
  user_id: string | null;
  gateway: string;
  provider_order_id: string | null;
  amount: number;
  final_amount: number;
  unique_code: number | null;
  status: string;
  expired_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export const adminListPayments = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; status?: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const filter = data.status && data.status !== 'all' ? `&status=eq.${data.status}` : '';
    const rows = await sbJson<PaymentRow[]>(
      `/rest/v1/payments?select=id,order_id,user_id,gateway,provider_order_id,amount,final_amount,unique_code,status,expired_at,paid_at,created_at&order=created_at.desc&limit=200${filter}`,
      { admin: true },
    );
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
    const profiles = ids.length
      ? await sbJson<{ id: string; display_name: string }[]>(
          `/rest/v1/profiles?select=id,display_name&id=in.(${ids.join(',')})`,
          { admin: true },
        )
      : [];
    return rows.map((r) => ({
      ...r,
      user_name: profiles.find((p) => p.id === r.user_id)?.display_name ?? '',
    }));
  });

/** Cek ulang status transaksi ke penyedia, dan penuhi bila sudah lunas. */
export const adminSyncPayment = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: number }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    return refreshPayment(data.id);
  });

/** Tandai lunas manual (transfer manual / rekonsiliasi). */
export const adminMarkPaymentPaid = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: number }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { fulfillPayment } = await import('./payments.server');
    await fulfillPayment(data.id);
    return { ok: true };
  });

/* =========================== Sisi pengguna ============================== */

export type Checkout = {
  id: number;
  gateway: string;
  status: string;
  amount: number;
  final_amount: number;
  unique_code: number | null;
  qris_string: string | null;
  expired_at: string | null;
  plan_name: string;
};

/** Buat transaksi QRIS untuk sebuah pengajuan paket milik user yang masuk. */
export const startPayment = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; orderId: number }) => {
    if (!d.orderId) throw new Error('Pengajuan tidak ditemukan.');
    return d;
  })
  .handler(async ({ data }): Promise<Checkout> => {
    const user = await requireUser(data.token);
    const orders = await sbJson<
      { id: number; user_id: string; plan_id: string; amount: number; status: string }[]
    >(
      `/rest/v1/plan_orders?select=id,user_id,plan_id,amount,status&id=eq.${data.orderId}&limit=1`,
      { admin: true },
    );
    const order = orders[0];
    if (!order || order.user_id !== user.id) throw new Error('Pengajuan tidak ditemukan.');
    if (order.status === 'paid') throw new Error('Pengajuan ini sudah lunas.');
    if (order.amount <= 0) throw new Error('Paket ini gratis, tidak perlu pembayaran.');

    // Pakai transaksi pending yang masih berlaku bila ada.
    const existing = await sbJson<{ id: number }[]>(
      `/rest/v1/payments?select=id&order_id=eq.${order.id}&status=eq.pending&expired_at=gt.${new Date().toISOString()}&order=created_at.desc&limit=1`,
      { admin: true },
    );
    if (existing[0]) return loadCheckout(existing[0].id, user.id);

    const { activeGateway, aapayCreateOrder } = await import('./payments.server');
    const gateway = await activeGateway();
    if (!gateway) throw new Error('Pembayaran online belum diaktifkan. Hubungi admin.');
    if (gateway.id !== 'aapay')
      throw new Error(`Penyedia ${gateway.name} belum tersedia. Hubungi admin.`);

    const inserted = await sbJson<{ id: number }[]>('/rest/v1/payments', {
      admin: true,
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        order_id: order.id,
        user_id: user.id,
        gateway: gateway.id,
        amount: order.amount,
        final_amount: order.amount,
        status: 'pending',
      },
    });
    const paymentId = inserted[0]?.id;
    if (!paymentId) throw new Error('Gagal membuat transaksi.');

    const origin = new URL(getRequest().url).origin;
    try {
      const remote = await aapayCreateOrder(gateway, {
        amount: order.amount,
        external_ref: `pay-${paymentId}`,
        callback_url: `${origin}/api/public/aapay-webhook`,
        expires_in_seconds: 900,
      });
      await sbJson(`/rest/v1/payments?id=eq.${paymentId}`, {
        admin: true,
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: {
          provider_order_id: remote.order_id,
          external_ref: `pay-${paymentId}`,
          final_amount: remote.final_amount,
          unique_code: remote.unique_code,
          qris_string: remote.qris_string ?? null,
          expired_at: remote.expired_at,
          status: remote.status ?? 'pending',
          raw: remote,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      await sbJson(`/rest/v1/payments?id=eq.${paymentId}`, {
        admin: true,
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { status: 'failed', updated_at: new Date().toISOString() },
      });
      throw e;
    }

    return loadCheckout(paymentId, user.id);
  });

async function loadCheckout(id: number, userId: string): Promise<Checkout> {
  const rows = await sbJson<
    {
      id: number;
      user_id: string | null;
      gateway: string;
      status: string;
      amount: number;
      final_amount: number;
      unique_code: number | null;
      qris_string: string | null;
      expired_at: string | null;
      order_id: number | null;
    }[]
  >(
    `/rest/v1/payments?select=id,user_id,gateway,status,amount,final_amount,unique_code,qris_string,expired_at,order_id&id=eq.${id}&limit=1`,
    { admin: true },
  );
  const p = rows[0];
  if (!p || p.user_id !== userId) throw new Error('Transaksi tidak ditemukan.');
  let planName = '';
  if (p.order_id) {
    const orders = await sbJson<{ plan_id: string }[]>(
      `/rest/v1/plan_orders?select=plan_id&id=eq.${p.order_id}&limit=1`,
      { admin: true },
    );
    const planId = orders[0]?.plan_id;
    if (planId) {
      const plans = await sbJson<{ name: string }[]>(
        `/rest/v1/plans?select=name&id=eq.${encodeURIComponent(planId)}&limit=1`,
        { admin: true },
      );
      planName = plans[0]?.name ?? planId;
    }
  }
  return {
    id: p.id,
    gateway: p.gateway,
    status: p.status,
    amount: p.amount,
    final_amount: p.final_amount,
    unique_code: p.unique_code,
    qris_string: p.qris_string,
    expired_at: p.expired_at,
    plan_name: planName,
  };
}

export const getCheckout = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: number }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser(data.token);
    return loadCheckout(data.id, user.id);
  });

/** Polling status (cadangan webhook): tanya penyedia lalu perbarui basis data. */
export const pollPayment = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: number }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser(data.token);
    const own = await sbJson<{ id: number }[]>(
      `/rest/v1/payments?select=id&id=eq.${data.id}&user_id=eq.${user.id}&limit=1`,
      { admin: true },
    );
    if (!own[0]) throw new Error('Transaksi tidak ditemukan.');
    return refreshPayment(data.id);
  });

/** Sinkronkan satu transaksi dengan penyedia (dipakai admin & polling user). */
async function refreshPayment(id: number) {
  const rows = await sbJson<
    { id: number; gateway: string; provider_order_id: string | null; status: string }[]
  >(`/rest/v1/payments?select=id,gateway,provider_order_id,status&id=eq.${id}&limit=1`, {
    admin: true,
  });
  const p = rows[0];
  if (!p) throw new Error('Transaksi tidak ditemukan.');
  if (p.status === 'paid') return { status: 'paid' };
  if (!p.provider_order_id) return { status: p.status };

  const { getGateway, aapayGetOrder, fulfillPayment } = await import('./payments.server');
  const gateway = await getGateway(p.gateway);
  const remote = await aapayGetOrder(gateway, p.provider_order_id);
  if (remote.status === 'paid') {
    await fulfillPayment(p.id);
    return { status: 'paid' };
  }
  if (remote.status !== p.status) {
    await sbJson(`/rest/v1/payments?id=eq.${p.id}`, {
      admin: true,
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { status: remote.status, updated_at: new Date().toISOString() },
    });
  }
  return { status: remote.status };
}
