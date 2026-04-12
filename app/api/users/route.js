import { NextResponse } from 'next/server';
import { store, findUser, addUser, makeToken, verifyToken } from '../../../lib/store';

export async function POST(request) {
  const body = await request.json();
  if (body.action === 'login') {
    const user = findUser(body.username, body.password);
    if (!user) return NextResponse.json({ error: 'Onjuiste gegevens' }, { status: 401 });
    return NextResponse.json({ token: makeToken(body.username, body.password), user: { id:user.id, name:user.name, username:user.username, role:user.role, color:user.color } });
  }
  if (body.action === 'create') {
    const requester = verifyToken(request.headers.get('authorization'));
    if (!requester || requester.role !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    if (store.users.find(u => u.username.toLowerCase() === body.username.toLowerCase())) return NextResponse.json({ error: 'Gebruikersnaam al in gebruik' }, { status: 409 });
    const newUser = addUser({ name:body.name, username:body.username, password:body.password, role:body.role });
    return NextResponse.json({ ok:true, user:{ id:newUser.id, name:newUser.name, role:newUser.role } });
  }
  return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 });
}

export async function GET(request) {
  const user = verifyToken(request.headers.get('authorization'));
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  return NextResponse.json({ users: store.users.map(u => ({ id:u.id, name:u.name, username:u.username, role:u.role, color:u.color })) });
}
