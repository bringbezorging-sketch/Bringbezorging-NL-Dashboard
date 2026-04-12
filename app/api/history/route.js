import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyToken } from '../../../lib/store';

export async function GET(request) {
  const user = verifyToken(request.headers.get('authorization'));
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  try {
    const db = neon(process.env.DATABASE_URL);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'orders';
    const days = parseInt(searchParams.get('days') || '30');

    if (type === 'log') {
      await db`CREATE TABLE IF NOT EXISTS activity_log (id SERIAL PRIMARY KEY, message TEXT NOT NULL, user_name TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
      const log = await db`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200`;
      return NextResponse.json({ log });
    }

    const rows = await db`SELECT * FROM orders WHERE created_at > NOW() - (${days} || ' days')::INTERVAL ORDER BY created_at DESC`;
    const orders = rows.map(row => ({
      ...row.data,
      binnenStatus: { status: row.binnen_status, by: row.binnen_by, at: row.binnen_at },
      bezStatus: { status: row.bez_status, by: row.bez_by, at: row.bez_at },
      dbCreatedAt: row.created_at,
    }));
    return NextResponse.json({ orders });
  } catch (err) {
    console.error('History fout:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
