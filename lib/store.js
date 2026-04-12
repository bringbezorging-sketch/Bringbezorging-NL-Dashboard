export const USERS = [
  { id:1, name:'Admin',   username:'admin',   password:'bring2024!', role:'admin',    color:'#8c52ff' },
  { id:2, name:'Sophie',  username:'sophie',  password:'sophie123',  role:'binnen',   color:'#8c52ff' },
  { id:3, name:'Daan',    username:'daan',    password:'daan123',    role:'binnen',   color:'#a67dff' },
  { id:4, name:'Youssef', username:'youssef', password:'youssef123', role:'bezorger', color:'#5ce1e6' },
  { id:5, name:'Fatima',  username:'fatima',  password:'fatima123',  role:'bezorger', color:'#3ecf72' },
];

const g = global._bb || (global._bb = { users: [...USERS], routes: {
  'Route A': ['5911','5912','5913'],
  'Route B': ['5914','5915','5916'],
  'Route C': ['5921','5922','5923'],
  'Route D': ['5924','5925','5931'],
}});
export const store = g;

export function getRoute(postcode) {
  if (!postcode) return 'Overig';
  const pc4 = postcode.replace(/\s/g,'').slice(0,4);
  for (const [name, pcs] of Object.entries(store.routes)) {
    if (pcs.includes(pc4)) return name;
  }
  return 'Overig';
}

export function detectFraud(o) {
  const reasons = []; let score = 0;
  
  // Als al betaald via iDEAL — nooit verdacht
  if (o.financial_status === 'paid') return { isFraud: false, reasons: [], noHouseNr: false };

  if ((o.customer?.orders_count||0) <= 0) { reasons.push('Eerste bestelling'); score+=2; }
  if (o.financial_status === 'pending') { reasons.push('Contant betaald'); score+=3; }
  const total = parseFloat(o.total_price||0);
  if (total >= 40) { reasons.push(`Hoog bedrag (€${total.toFixed(2)})`); score+=2; }
  const email = (o.email||'').toLowerCase();
  if (/^[a-z]{1,3}\d{4,}@/.test(email)||email.includes('temp')||email.includes('fake')) { reasons.push('Verdacht e-mailadres'); score+=2; }
  const addr = o.shipping_address?.address1||'';
  const noHouseNr = addr.length>0 && !/\d/.test(addr);
  if (noHouseNr) { reasons.push('Geen huisnummer'); score+=3; }
  return { isFraud: score>=5, reasons, noHouseNr };
}

export function transformOrder(o) {
  const s = o.shipping_address||{};
  const addr = [s.address1,s.address2,s.zip,s.city].filter(Boolean).join(', ');
  const fraud = detectFraud(o);
  // Betaalmethode bepalen
  let payment = 'iDEAL';
  if (o.financial_status === 'pending') payment = 'Contant';
  else if ((o.payment_gateway||'').toLowerCase().includes('ideal')) payment = 'iDEAL';
  else if ((o.payment_gateway||'').toLowerCase().includes('cash') || (o.payment_gateway||'').toLowerCase().includes('cod')) payment = 'Contant';
  return {
    id: `#${o.order_number}`,
    shopifyId: o.id,
    name: `${o.customer?.first_name||''} ${o.customer?.last_name||''}`.trim()||'Onbekend',
    addr, postcode: s.zip||'', route: getRoute(s.zip),
    amount: parseFloat(o.total_price||0),
    payment, email: o.email||'',
    fraud: fraud.isFraud, fraudReasons: fraud.reasons, noHouseNr: fraud.noHouseNr,
    createdAt: o.created_at,
  };
}

export function findUser(username, password) {
  return store.users.find(u => u.username.toLowerCase()===username.toLowerCase() && u.password===password);
}

export function addUser(data) {
  const colors = ['#8c52ff','#5ce1e6','#3ecf72','#f5a623','#a67dff'];
  const u = { id: Date.now(), color: colors[store.users.length%colors.length], ...data };
  store.users.push(u);
  return u;
}

export function makeToken(username, password) {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

export function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const [username, password] = Buffer.from(authHeader.slice(7),'base64').toString().split(':');
    return findUser(username, password);
  } catch { return null; }
}
