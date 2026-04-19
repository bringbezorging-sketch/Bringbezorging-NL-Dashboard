import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyToken } from '../../../../lib/store';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

async function shopify(path, opts = {}) {
    const url = `https://${SHOP}/admin/api/${API_VERSION}${path}`;
    const r = await fetch(url, {
          ...opts,
          headers: {
                  'X-Shopify-Access-Token': TOKEN,
                  'Content-Type': 'application/json',
                  ...(opts.headers || {}),
          },
    });
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok) {
          const err = new Error(`Shopify ${r.status}: ${text.slice(0, 500)}`);
          err.status = r.status;
          err.data = data;
          throw err;
    }
    return data;
}

async function getFulfillmentOrders(shopifyOrderId) {
    const { fulfillment_orders } = await shopify(
          `/orders/${shopifyOrderId}/fulfillment_orders.json`
        );
    return fulfillment_orders || [];
}

async function createFulfillmentForOrder(shopifyOrderId, notifyCustomer) {
    const fos = await getFulfillmentOrders(shopifyOrderId);
    const open = fos.filter(f => f.status === 'open' || f.status === 'in_progress');
    if (open.length === 0) {
          throw new Error('Geen open fulfillment order gevonden in Shopify');
    }
    const line_items_by_fulfillment_order = open.map(fo => ({
          fulfillment_order_id: fo.id,
    }));
    const body = {
          fulfillment: {
                  message: 'Klaar voor bezorging door BringBezorging',
                  notify_customer: !!notifyCustomer,
                  line_items_by_fulfillment_order,
          },
    };
    const { fulfillment } = await shopify(`/fulfillments.json`, {
          method: 'POST',
          body: JSON.stringify(body),
    });
    return fulfillment;
}

async function getLatestFulfillmentId(shopifyOrderId) {
    const { fulfillments } = await shopify(
          `/orders/${shopifyOrderId}/fulfillments.json`
        );
    if (!fulfillments || fulfillments.length === 0) return null;
    return fulfillments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].id;
}

async function markInTransit(shopifyOrderId) {
    const fulfillmentId = await getLatestFulfillmentId(shopifyOrderId);
    if (!fulfillmentId) {
          // Nog geen fulfillment: maak er een aan (status open = in_transit bij lokale bezorging)
      return await createFulfillmentForOrder(shopifyOrderId, false);
    }
    // Shopify moved this to POST /fulfillments/{id}/update_tracking.json for tracking,
  // but the status transition for local delivery apps uses the move endpoint via FO.
  // We keep the fulfillment open (which represents "in transit") and just log it.
  return { id: fulfillmentId, status: 'in_transit' };
}

async function markDelivered(shopifyOrderId) {
    const fulfillmentId = await getLatestFulfillmentId(shopifyOrderId);
    if (!fulfillmentId) {
          throw new Error('Geen fulfillment om als afgeleverd te markeren');
    }
    // Close the fulfillment order(s) -> marks order as fulfilled (=delivered)
  const fos = await getFulfillmentOrders(shopifyOrderId);
    for (const fo of fos) {
          if (fo.status === 'in_progress' || fo.status === 'open') {
                  try {
                            await shopify(`/fulfillment_orders/${fo.id}/close.json`, {
                                        method: 'POST',
                                        body: JSON.stringify({ message: 'Afgeleverd door BringBezorging' }),
                            });
                  } catch (e) { /* already closed is fine */ }
          }
    }
    return { id: fulfillmentId, status: 'delivered' };
      }

export async function POST(request) {
    const user = verifyToken(request.headers.get('authorization'));
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  if (!SHOP || !TOKEN) {
        return NextResponse.json(
          { error: 'Shopify env vars ontbreken (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN)' },
          { status: 500 }
              );
  }

  let body;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }

  const { orderId, action, notifyCustomer } = body || {};
    if (!orderId || !action) {
          return NextResponse.json({ error: 'orderId en action zijn verplicht' }, { status: 400 });
    }

  try {
        const db = neon(process.env.DATABASE_URL);
        const rows = await db`SELECT shopify_id FROM orders WHERE id=${orderId} LIMIT 1`;
        if (rows.length === 0) {
                return NextResponse.json({ error: 'Order niet gevonden' }, { status: 404 });
        }
        const shopifyId = rows[0].shopify_id;
        if (!shopifyId) {
                return NextResponse.json({ error: 'Order heeft geen Shopify ID (handmatig aangemaakt?)' }, { status: 400 });
        }

      let result;
        if (action === 'ready')      result = await createFulfillmentForOrder(shopifyId, !!notifyCustomer);
        else if (action === 'in_transit') result = await markInTransit(shopifyId);
        else if (action === 'delivered')  result = await markDelivered(shopifyId);
        else return NextResponse.json({ error: 'Onbekende action' }, { status: 400 });

      return NextResponse.json({ ok: true, shopifyId: String(shopifyId), result });
  } catch (err) {
        console.error('Shopify fulfillment fout:', err);
        return NextResponse.json(
          { error: err.message || 'Onbekende fout', data: err.data },
          { status: err.status && err.status < 600 ? err.status : 500 }
              );
  }
}
