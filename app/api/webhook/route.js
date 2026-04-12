import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { transformOrder } from '../../../lib/store';

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const topic = request.headers.get('x-shopify-topic') || '';

    // Verificeer webhook
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (secret) {
      const hmac = request.headers.get('x-shopify-hmac-sha256') || '';
      const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
      if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const data = JSON.parse(rawBody);
    const db = neon(process.env.DATABASE_URL);

    // Zorg dat tabel bestaat
    await db`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        shopify_id BIGINT UNIQUE,
        data JSONB NOT NULL,
        binnen_status TEXT DEFAULT 'pending',
        binnen_by TEXT,
        binnen_at TEXT,
        bez_status TEXT DEFAULT 'wachten',
        bez_by TEXT,
        bez_at TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    if (topic === 'orders/delete') {
      await db`DELETE FROM orders WHERE shopify_id = ${data.id}`;
    } else {
      const order = transformOrder(data);
      const orderJson = JSON.stringify(order);
      await db`
        INSERT INTO orders (id, shopify_id, data, created_at)
        VALUES (${order.id}, ${order.shopifyId}, ${orderJson}, NOW())
        ON CONFLICT (shopify_id) DO UPDATE
        SET data = ${orderJson}, updated_at = NOW()
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook fout:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
