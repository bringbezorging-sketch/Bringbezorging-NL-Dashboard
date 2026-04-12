import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyToken, store } from '../../../lib/store';

export async function GET(request) {
  const user = verifyToken(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  try {
    const db = neon(process.env.DATABASE_URL);
    await db`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, shopify_id BIGINT UNIQUE, data JSONB NOT NULL, binnen_status TEXT DEFAULT 'pending', binnen_by TEXT, binnen_at TEXT, bez_status TEXT DEFAULT 'wachten', bez_by TEXT, bez_at TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`;
    const rows = await db`SELECT * FROM orders ORDER BY created_at DESC`;
    const orders = rows.map(row => ({
      ...row.data,
      binnenStatus: { status: row.binnen_status, by: row.binnen_by, at: row.binnen_at },
      bezStatus: { status: row.bez_status, by: row.bez_by, at: row.bez_at },
    }));
    return NextResponse.json({ orders, routeConfig: store.routes });
  } catch (err) {
    console.error('Orders GET fout:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const user = verifyToken(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  try {
    const { orderId, type, status } = await request.json();
    const at = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    const db = neon(process.env.DATABASE_URL);

    if (type === 'binnen') {
      await db`UPDATE orders SET binnen_status=${status}, binnen_by=${user.username}, binnen_at=${at}, updated_at=NOW() WHERE id=${orderId}`;
    } else {
      await db`UPDATE orders SET bez_status=${status}, bez_by=${user.username}, bez_at=${at}, updated_at=NOW() WHERE id=${orderId}`;
    }

    // Log activiteit
    await db`CREATE TABLE IF NOT EXISTS activity_log (id SERIAL PRIMARY KEY, message TEXT NOT NULL, user_name TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
    const labels = { done:'klaargezet voor bezorging', onderweg:'onderweg gemeld', afgeleverd:'afgeleverd', mislukt:'bezorging mislukt' };
    await db`INSERT INTO activity_log (message, user_name) VALUES (${`${user.name} heeft ${orderId} ${labels[status]||status}`}, ${user.name})`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Orders PATCH fout:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
