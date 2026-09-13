import { createFileRoute } from '@tanstack/react-router';

/**
 * Webhook AAPay: POST /api/public/aapay-webhook
 * Header X-Signature = HMAC-SHA256 hex dari RAW BODY memakai webhook secret.
 */
export const Route = createFileRoute('/api/public/aapay-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get('x-signature') ?? '';

        const { getGateway, aapayCreds, safeEqualHex, aapayGetOrder, fulfillPayment } = await import(
          '@/lib/payments.server'
        );
        const { sbJson } = await import('@/lib/sb.server');

        let gateway: Awaited<ReturnType<typeof getGateway>> = null;
        try {
          gateway = await getGateway('aapay');
        } catch {
          // Tabel pembayaran belum dibuat di basis data.
          return json({ ok: false, error: 'not_configured' }, 503);
        }
        const { webhookSecret } = aapayCreds(gateway);
        if (!webhookSecret) return json({ ok: false, error: 'not_configured' }, 503);

        const { createHmac } = await import('node:crypto');
        const expected = createHmac('sha256', webhookSecret).update(raw).digest('hex');
        if (!safeEqualHex(signature, expected)) return json({ ok: false, error: 'unauthorized' }, 401);

        let body: { order_id?: string; external_ref?: string; status?: string; paid_at?: string };
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: 'validation_error' }, 400);
        }
        if (!body.order_id) return json({ ok: false, error: 'validation_error' }, 400);

        // Cari transaksi lokal berdasarkan order penyedia atau external_ref.
        const rows = await sbJson<{ id: number; status: string }[]>(
          `/rest/v1/payments?select=id,status&provider_order_id=eq.${encodeURIComponent(body.order_id)}&limit=1`,
          { admin: true },
        );
        let payment = rows[0];
        if (!payment && body.external_ref) {
          const alt = await sbJson<{ id: number; status: string }[]>(
            `/rest/v1/payments?select=id,status&external_ref=eq.${encodeURIComponent(body.external_ref)}&limit=1`,
            { admin: true },
          );
          payment = alt[0];
        }
        // Balas 2xx walau tidak dikenali agar penyedia tidak retry tanpa akhir.
        if (!payment) return json({ ok: true, ignored: 'unknown_order' });
        if (payment.status === 'paid') return json({ ok: true, ignored: 'already_processed' });

        if (body.status === 'paid') {
          // Konfirmasi ulang ke penyedia sebelum memenuhi pesanan.
          const remote = await aapayGetOrder(gateway, body.order_id);
          if (remote.status !== 'paid') return json({ ok: true, ignored: 'not_paid_upstream' });
          await fulfillPayment(payment.id, body.paid_at);
          return json({ ok: true });
        }

        await sbJson(`/rest/v1/payments?id=eq.${payment.id}`, {
          admin: true,
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: { status: body.status ?? 'pending', updated_at: new Date().toISOString() },
        });
        return json({ ok: true });
      },
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
