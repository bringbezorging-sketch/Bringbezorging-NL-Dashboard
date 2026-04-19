'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

export default function Dashboard() {
  const [screen, setScreen] = useState(() => { try { return localStorage.getItem('bb_token') ? 'app' : 'login'; } catch { return 'login'; } });
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('bb_user')); } catch { return null; } });
  const [token, setToken] = useState(() => { try { return localStorage.getItem('bb_token'); } catch { return null; } });
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [log, setLog] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyDays, setHistoryDays] = useState(7);
  const [tabB, setTabB] = useState('routes');
  const [tabZ, setTabZ] = useState('open');
  const [tabA, setTabA] = useState('vandaag');
  const [loginErr, setLoginErr] = useState('');
  const [timers, setTimers] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const now = () => new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
  const todayStr = () => new Date().toLocaleDateString('nl-NL');
  const initials = n => (n||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  const api = useCallback(async (url, opts={}) => {
    return fetch(url, { ...opts, headers: { 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json', ...opts.headers } });
  }, [token]);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api('/api/orders');
      if (!res.ok) return;
      const d = await res.json();
      const all = d.orders || [];
      if (user?.role === 'admin') {
        setOrders(all);
      } else {
        setOrders(all.filter(o => {
          if (!o.createdAt) return true;
          return new Date(o.createdAt).toLocaleDateString('nl-NL') === todayStr();
        }));
      }
    } catch(e) { console.error(e); }
  }, [token, api, user?.role]);

  useEffect(() => {
    if (!token) return;
    loadOrders();
    pollRef.current = setInterval(loadOrders, 8000);
    return () => clearInterval(pollRef.current);
  }, [token, loadOrders]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimers(t => {
        const n = {...t};
        orders.forEach(o => { if (o.binnenStatus?.status !== 'done' && !o.fraud) n[o.id] = Math.min((n[o.id]||0)+1, 700); });
        return n;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [orders]);

  const loadAdminData = useCallback(async (tok) => {
    const t = tok || token;
    if (!t) return;
    const headers = { 'Authorization':`Bearer ${t}`, 'Content-Type':'application/json' };
    try {
      const [ur, lr] = await Promise.all([fetch('/api/users',{headers}), fetch('/api/history?type=log',{headers})]);
      if (ur.ok) { const d = await ur.json(); setUsers(d.users||[]); }
      if (lr.ok) { const d = await lr.json(); setLog(d.log||[]); }
    } catch(e) { console.error(e); }
  }, [token]);

  const loadHistory = useCallback(async (days) => {
    try {
      const res = await api(`/api/history?type=orders&days=${days}`);
      if (res.ok) { const d = await res.json(); setHistory(d.orders||[]); }
    } catch(e) { console.error(e); }
  }, [api]);

  useEffect(() => {
    if (tabA === 'geschiedenis') loadHistory(historyDays);
    if (tabA === 'activiteit') loadAdminData();
  }, [tabA, historyDays]);

  async function doLogin(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'login', username:e.target.username.value.trim(), password:e.target.password.value }) });
      if (!res.ok) { setLoginErr('Onjuiste gegevens.'); return; }
      const d = await res.json();
      setToken(d.token); setUser(d.user); setScreen('app'); setLoginErr('');
      localStorage.setItem('bb_token', d.token);
      localStorage.setItem('bb_user', JSON.stringify(d.user));
      if (d.user.role === 'admin') loadAdminData(d.token);
    } catch { setLoginErr('Verbindingsfout.'); }
  }

  function doLogout() {
    setToken(null); setUser(null); setOrders([]); setScreen('login');
    localStorage.removeItem('bb_token'); localStorage.removeItem('bb_user');
    clearInterval(pollRef.current); clearInterval(timerRef.current);
  }

  async function setStatus(orderId, type, status) {
    try {
      await api('/api/orders', { method:'PATCH', body: JSON.stringify({orderId,type,status}) });
      try { const _a = (type==='binnen'&&status==='done')?'ready':(type==='bez'&&status==='onderweg')?'in_transit':(type==='bez'&&status==='afgeleverd')?'delivered':null; if (_a) await api('/api/shopify/fulfillment', { method:'POST', body: JSON.stringify({ orderId, action:_a }) }); } catch(_e) { console.warn('Shopify sync faalde:', _e); }
      await loadOrders();
    } catch(e) { console.error(e); }
  }

  async function createUser(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await api('/api/users', { method:'POST', body: JSON.stringify({ action:'create', name:fd.get('name'), username:fd.get('username'), password:fd.get('password'), role:fd.get('role') }) });
      if (!res.ok) { const d=await res.json(); alert(d.error); return; }
      e.target.reset();
      await loadAdminData();
    } catch(e) { console.error(e); }
  }

  const S = styles;
  const payBadge = p => p==='Contant'
    ? <span style={S.payCash}>CONTANT</span>
    : <span style={S.payIdeal}>iDEAL</span>;

  if (screen === 'login') return (
    <div style={S.loginScreen}>
      <div style={{width:'100%',maxWidth:380,padding:'0 1.5rem'}}>
        <div style={{textAlign:'center',marginBottom:'2.5rem'}}>
          <div style={{fontSize:30,fontWeight:600,letterSpacing:-1}}><span style={{color:'#a67dff'}}>Bring</span><span style={{color:'#5ce1e6'}}>Bezorging</span></div>
          <div style={{fontSize:12,color:'#4e4a6a',marginTop:6,fontFamily:'monospace'}}>Venlo · Intern systeem</div>
        </div>
        <form style={S.loginCard} onSubmit={doLogin}>
          <div style={S.loginTitle}>Inloggen</div>
          {loginErr && <div style={S.loginErr}>{loginErr}</div>}
          <div style={{marginBottom:'1rem'}}><label style={S.label}>Gebruikersnaam</label><input style={S.input} name="username" autoComplete="username" required /></div>
          <div style={{marginBottom:'1rem'}}><label style={S.label}>Wachtwoord</label><input style={S.input} name="password" type="password" autoComplete="current-password" required /></div>
          <button style={S.btnPrimary} type="submit">Inloggen</button>
        </form>
      </div>
    </div>
  );

  const grouped = {};
  orders.forEach(o => { const r=o.route||'Overig'; if(!grouped[r]) grouped[r]=[]; grouped[r].push(o); });
  Object.keys(grouped).forEach(r => { grouped[r].sort((a,b) => (a.binnenStatus?.status==='done'?1:0)-(b.binnenStatus?.status==='done'?1:0)); });
  const openOrders = orders.filter(o => !['afgeleverd','mislukt'].includes(o.bezStatus?.status));
  const doneOrders = orders.filter(o => ['afgeleverd','mislukt'].includes(o.bezStatus?.status));
  const sortedOpen = [...openOrders].sort((a,b) => (a.binnenStatus?.status==='done'?0:1)-(b.binnenStatus?.status==='done'?0:1));
  const todayLabel = new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:'#0d0d14',color:'#f0eeff',minHeight:'100vh'}}>
      <nav style={S.topnav}>
        <div style={{fontSize:16,fontWeight:600}}><span style={{color:'#a67dff'}}>Bring</span><span style={{color:'#5ce1e6'}}>Bezorging</span></div>
        <div style={{fontSize:11,color:'#4e4a6a',fontFamily:'monospace'}}>{todayLabel}</div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
          <div style={S.userPill}>
            <div style={{...S.avatar,background:user?.color}}>{initials(user?.name)}</div>
            <span style={{fontSize:13,color:'#8a85aa'}}>{user?.name}</span>
            <span style={{...S.roleBadge,...S['role_'+user?.role]}}>{user?.role}</span>
          </div>
          <button style={S.btnLogout} onClick={doLogout}>Uitloggen</button>
        </div>
      </nav>

      <div style={S.main}>

        {/* BINNENWERKER */}
        {user?.role==='binnen'&&<>
          <div style={S.statsGrid}>
            {[{l:'Vandaag',v:orders.length,c:''},{l:'Klaar',v:orders.filter(o=>o.binnenStatus?.status==='done').length,c:'green'},{l:'Nog open',v:orders.filter(o=>o.binnenStatus?.status!=='done'&&!o.fraud).length,c:'amber'},{l:'Verdacht',v:orders.filter(o=>o.fraud&&o.binnenStatus?.status!=='done').length,c:'red'}]
              .map(s=><div key={s.l} style={S.statCard}><div style={S.statLabel}>{s.l}</div><div style={{...S.statVal,...(s.c?S['sv_'+s.c]:{})}}>{s.v}</div></div>)}
          </div>
          <div style={S.tabRow}>
            {[['routes','Routes'],['alerts','Meldingen']].map(([k,v])=><button key={k} style={{...S.tab,...(tabB===k?S.tabActive:{})}} onClick={()=>setTabB(k)}>{v}</button>)}
          </div>
          {tabB==='routes'&&Object.keys(grouped).sort().map(route=>{
            const ro=grouped[route];
            const openCount=ro.filter(o=>o.binnenStatus?.status!=='done').length;
            const doneCount=ro.filter(o=>o.binnenStatus?.status==='done').length;
            const allDone=openCount===0;
            const hasFraud=ro.some(o=>o.fraud&&o.binnenStatus?.status!=='done');
            const hasAtt=ro.some(o=>!o.fraud&&o.binnenStatus?.status!=='done'&&(timers[o.id]||0)>=600);
            const isCollapsed=collapsed[route];
            return <div key={route} style={S.routeBlock}>
              <div style={{...S.routeHeader,cursor:allDone?'pointer':'default'}} onClick={()=>allDone&&setCollapsed(c=>({...c,[route]:!c[route]}))}>
                <span style={S.routeLabel}>{route}</span>
                <span style={{fontSize:12,color:'#4e4a6a',fontFamily:'monospace'}}>{openCount} open · {doneCount} klaar</span>
                <span style={{...S.badge,...(hasFraud?S.bRed:allDone?S.bGreen:hasAtt?S.bAmber:S.bGray)}}>{hasFraud?'Controleer':allDone?'Klaar ✓':hasAtt?'Aandacht':'Bezig'}</span>
                {allDone&&<span style={{fontSize:11,color:'#4e4a6a'}}>{isCollapsed?'▶':'▼'}</span>}
              </div>
              {isCollapsed?<div style={{padding:'10px 16px',fontSize:13,color:'#4e4a6a'}}>{ro.length} bestellingen klaargezet</div>
              :ro.map(o=>{
                const isDone=o.binnenStatus?.status==='done';
                const t=timers[o.id]||0;
                const pct=Math.min(100,Math.round(t/6));
                const fc=pct>=100?'#ff4d4d':pct>60?'#f5a623':'#3ecf72';
                const bz=o.bezStatus?.status;
                return <div key={o.id} style={{...S.orderRow,...(isDone?{opacity:0.55}:{})}}>
                  <div style={S.orderTop}>
                    <div style={{...S.dot,background:isDone?'#3ecf72':o.fraud?'#ff4d4d':t>=600?'#f5a623':'#4e4a6a'}}/>
                    <span style={S.orderId}>{o.id}</span>
                    <span style={S.orderName}>{o.name}</span>
                    <span style={S.orderAddr}>{o.addr}</span>
                    <span style={S.orderAmt}>€{(o.amount||0).toFixed(2)}</span>
                    {payBadge(o.payment)}
                    {bz==='onderweg'&&<span style={{...S.badge,...S.bBez}}>Onderweg</span>}
                    {bz==='afgeleverd'&&<span style={{...S.badge,...S.bGreen}}>Afgeleverd</span>}
                    {bz==='mislukt'&&<span style={{...S.badge,...S.bRed}}>Mislukt</span>}
                  </div>
                  {o.fraud&&!isDone&&<div style={S.fraudLine}>BEL KLANT — {o.fraudReasons?.join(' · ')}</div>}
                  {o.noHouseNr&&!isDone&&<div style={S.fraudLine}>Geen huisnummer in adres</div>}
                  {isDone&&o.binnenStatus?.by&&<div style={S.whoLine}>✓ Klaargezet door {o.binnenStatus.by} om {o.binnenStatus.at}</div>}
                  {bz&&bz!=='wachten'&&o.bezStatus?.by&&<div style={S.whoLine}>Bezorger: {o.bezStatus.by} — {bz} om {o.bezStatus.at}</div>}
                  {!isDone&&<div style={{paddingLeft:16,marginTop:6}}>
                    <div style={S.timerBar}><div style={{...S.timerFill,width:`${pct}%`,background:fc}}/></div>
                    <div style={S.timerText}>{Math.floor(t/60)}:{(t%60).toString().padStart(2,'0')} / 10:00</div>
                  </div>}
                  {!isDone&&<div style={S.btnRow}><button style={{...S.btn,...S.btnSend}} onClick={()=>setStatus(o.id,'binnen','done')}>Klaar voor bezorging</button></div>}
                </div>;
              })}
            </div>;
          })}
          {tabB==='alerts'&&(()=>{
            const fO=orders.filter(o=>o.fraud&&o.binnenStatus?.status!=='done');
            const aO=orders.filter(o=>!o.fraud&&o.binnenStatus?.status!=='done'&&(timers[o.id]||0)>=600);
            if(!fO.length&&!aO.length) return <div style={S.empty}>Geen meldingen.</div>;
            return <>{fO.map(o=><div key={o.id} style={S.alert}><div style={S.alertIcon}>!</div><div style={S.alertBody}><strong>Verdachte bestelling {o.id} — BEL DE KLANT</strong><br/>{o.name} · €{(o.amount||0).toFixed(2)} · {o.payment}<br/>{o.fraudReasons?.join(', ')}</div></div>)}
            {aO.map(o=><div key={o.id} style={{...S.alert,...S.alertAmber}}><div style={{...S.alertIcon,background:'#f5a623'}}>!</div><div style={{...S.alertBody,color:'#f5a623'}}><strong>{o.id} heeft aandacht nodig</strong><br/>{o.name} · 10+ min niet klaargezet</div></div>)}</>;
          })()}
        </>}

        {/* BEZORGER */}
        {user?.role==='bezorger'&&<>
          <div style={S.statsGrid}>
            {[{l:'Vandaag',v:orders.length,c:''},{l:'Onderweg',v:orders.filter(o=>o.bezStatus?.status==='onderweg').length,c:'bez'},{l:'Afgeleverd',v:orders.filter(o=>o.bezStatus?.status==='afgeleverd').length,c:'green'},{l:'Mislukt',v:orders.filter(o=>o.bezStatus?.status==='mislukt').length,c:'red'}]
              .map(s=><div key={s.l} style={S.statCard}><div style={S.statLabel}>{s.l}</div><div style={{...S.statVal,...(s.c?S['sv_'+s.c]:{})}}>{s.v}</div></div>)}
          </div>
          <div style={S.tabRow}>
            {[['open','Te bezorgen'],['done','Afgerond']].map(([k,v])=><button key={k} style={{...S.tab,...(tabZ===k?S.tabActive:{})}} onClick={()=>setTabZ(k)}>{v}</button>)}
          </div>
          {tabZ==='open'&&(sortedOpen.length===0?<div style={S.empty}>Alles afgerond!</div>:sortedOpen.map(o=>{
            const bs=o.bezStatus?.status,isReady=o.binnenStatus?.status==='done';
            return <div key={o.id} style={{...S.bezCard,...(!isReady?{opacity:0.5}:{})}}>
              <div style={S.bezHead}>
                <div style={{...S.dot,background:bs==='onderweg'?'#5ce1e6':isReady?'#3ecf72':'#4e4a6a'}}/>
                <span style={S.bezId}>{o.id}</span>
                <div style={{fontSize:14,fontWeight:500,color:'#f0eeff',flex:1}}>{o.name}</div>
                <span style={{...S.badge,...(bs==='onderweg'?S.bBez:isReady?S.bGreen:S.bGray)}}>{bs==='onderweg'?'Onderweg':isReady?'Klaar voor bezorging':'Wacht op binnenwerker'}</span>
              </div>
              <div style={{padding:'12px 16px'}}>
                <div style={{fontSize:14,color:'#f0eeff',marginBottom:4}}>{o.addr}</div>
                <div style={{fontSize:13,color:'#4e4a6a',marginBottom:10,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <span>€{(o.amount||0).toFixed(2)}</span>{payBadge(o.payment)}
                  {o.binnenStatus?.by&&<span>klaar om {o.binnenStatus.at}</span>}
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {!isReady&&bs==='wachten'&&<button style={{...S.btn,...S.btnDisabled}} disabled>Wacht op binnenwerker...</button>}
                  {isReady&&bs==='wachten'&&<button style={{...S.btn,...S.btnBez}} onClick={()=>setStatus(o.id,'bez','onderweg')}>Onderweg</button>}
                  {bs==='onderweg'&&<><button style={{...S.btn,...S.btnGreen}} onClick={()=>setStatus(o.id,'bez','afgeleverd')}>Afgeleverd</button><button style={{...S.btn,...S.btnRed}} onClick={()=>setStatus(o.id,'bez','mislukt')}>Bezorging mislukt</button></>}
                </div>
              </div>
            </div>;
          }))}
          {tabZ==='done'&&(doneOrders.length===0?<div style={S.empty}>Nog niets afgerond.</div>:doneOrders.map(o=>(
            <div key={o.id} style={{...S.bezCard,opacity:0.7}}>
              <div style={S.bezHead}>
                <div style={{...S.dot,background:o.bezStatus?.status==='afgeleverd'?'#3ecf72':'#ff4d4d'}}/>
                <span style={S.bezId}>{o.id}</span>
                <div style={{fontSize:14,fontWeight:500,color:'#f0eeff',flex:1}}>{o.name}</div>
                <span style={{...S.badge,...(o.bezStatus?.status==='afgeleverd'?S.bGreen:S.bRed)}}>{o.bezStatus?.status==='afgeleverd'?'Afgeleverd':'Mislukt'}</span>
              </div>
              <div style={{padding:'12px 16px'}}>
                <div style={{fontSize:14,color:'#f0eeff',marginBottom:4}}>{o.addr}</div>
                <div style={{fontSize:13,color:'#4e4a6a',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>€{(o.amount||0).toFixed(2)} {payBadge(o.payment)} <span>door {o.bezStatus?.by} om {o.bezStatus?.at}</span></div>
              </div>
            </div>
          )))}
        </>}

        {/* ADMIN */}
        {user?.role==='admin'&&<>
          <div style={S.statsGrid}>
            {[{l:'Totaal',v:orders.length,c:''},{l:'Afgeleverd',v:orders.filter(o=>o.bezStatus?.status==='afgeleverd').length,c:'green'},{l:'Onderweg',v:orders.filter(o=>o.bezStatus?.status==='onderweg').length,c:'bez'},{l:'Verdacht',v:orders.filter(o=>o.fraud&&o.binnenStatus?.status!=='done').length,c:'red'}]
              .map(s=><div key={s.l} style={S.statCard}><div style={S.statLabel}>{s.l}</div><div style={{...S.statVal,...(s.c?S['sv_'+s.c]:{})}}>{s.v}</div></div>)}
          </div>
          <div style={S.tabRow}>
            {[['vandaag','Vandaag'],['geschiedenis','Geschiedenis'],['medewerkers','Medewerkers'],['activiteit','Activiteit']].map(([k,v])=><button key={k} style={{...S.tab,...(tabA===k?S.tabActive:{})}} onClick={()=>setTabA(k)}>{v}</button>)}
          </div>

          {tabA==='vandaag'&&<div style={S.routeBlock}>
            {orders.length===0&&<div style={S.empty}>Geen bestellingen.</div>}
            {[...orders].sort((a,b)=>(a.bezStatus?.status==='afgeleverd'?1:0)-(b.bezStatus?.status==='afgeleverd'?1:0)).map(o=>{
              const bz=o.bezStatus?.status,bs=o.binnenStatus?.status;
              return <div key={o.id} style={{...S.orderRow,...(bz==='afgeleverd'?{opacity:0.55}:{})}}>
                <div style={S.orderTop}>
                  <div style={{...S.dot,background:bz==='afgeleverd'?'#3ecf72':bz==='mislukt'?'#ff4d4d':bz==='onderweg'?'#5ce1e6':bs==='done'?'#f5a623':'#4e4a6a'}}/>
                  <span style={S.orderId}>{o.id}</span>
                  <span style={S.orderName}>{o.name}</span>
                  <span style={S.orderAddr}>{o.addr}</span>
                  <span style={S.orderAmt}>€{(o.amount||0).toFixed(2)}</span>
                  {payBadge(o.payment)}
                  <span style={{...S.badge,...(bz==='afgeleverd'?S.bGreen:bz==='mislukt'?S.bRed:bz==='onderweg'?S.bBez:bs==='done'?S.bAmber:o.fraud?S.bRed:S.bGray)}}>
                    {bz==='afgeleverd'?'Afgeleverd':bz==='mislukt'?'Mislukt':bz==='onderweg'?'Onderweg':bs==='done'?'Klaar':o.fraud?'Verdacht':'In verwerking'}
                  </span>
                </div>
                {o.binnenStatus?.by&&<div style={S.whoLine}>Klaargezet door {o.binnenStatus.by} om {o.binnenStatus.at}</div>}
                {o.bezStatus?.by&&<div style={S.whoLine}>Bezorgd door {o.bezStatus.by} om {o.bezStatus.at}</div>}
              </div>;
            })}
          </div>}

          {tabA==='geschiedenis'&&<div>
            <div style={{display:'flex',gap:6,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontSize:13,color:'#8a85aa'}}>Toon laatste:</span>
              {[7,14,30].map(d=><button key={d} style={{...S.tab,...(historyDays===d?S.tabActive:{})}} onClick={()=>{setHistoryDays(d);loadHistory(d);}}>{d} dagen</button>)}
            </div>
            {history.length===0&&<div style={S.empty}>Geen bestellingen gevonden.</div>}
            {Object.entries(history.reduce((acc,o)=>{
              const d=o.dbCreatedAt?new Date(o.dbCreatedAt).toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'}):'Onbekend';
              if(!acc[d])acc[d]=[];acc[d].push(o);return acc;
            },{})).map(([date,ords])=>(
              <div key={date} style={{marginBottom:16}}>
                <div style={{fontSize:12,color:'#4e4a6a',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>
                  {date} · {ords.length} best. · €{ords.reduce((s,o)=>s+(o.amount||0),0).toFixed(2)}
                </div>
                <div style={S.routeBlock}>
                  {ords.map(o=>(
                    <div key={o.id} style={S.orderRow}>
                      <div style={S.orderTop}>
                        <div style={{...S.dot,background:o.bezStatus?.status==='afgeleverd'?'#3ecf72':o.bezStatus?.status==='mislukt'?'#ff4d4d':'#4e4a6a'}}/>
                        <span style={S.orderId}>{o.id}</span>
                        <span style={S.orderName}>{o.name}</span>
                        <span style={S.orderAddr}>{o.addr}</span>
                        <span style={S.orderAmt}>€{(o.amount||0).toFixed(2)}</span>
                        {payBadge(o.payment)}
                        <span style={{...S.badge,...(o.bezStatus?.status==='afgeleverd'?S.bGreen:o.bezStatus?.status==='mislukt'?S.bRed:S.bGray)}}>
                          {o.bezStatus?.status==='afgeleverd'?'Afgeleverd':o.bezStatus?.status==='mislukt'?'Mislukt':'Niet afgerond'}
                        </span>
                      </div>
                      {o.binnenStatus?.by&&<div style={S.whoLine}>Klaargezet door {o.binnenStatus.by} om {o.binnenStatus.at}</div>}
                      {o.bezStatus?.by&&<div style={S.whoLine}>Bezorgd door {o.bezStatus.by} om {o.bezStatus.at}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>}

          {tabA==='medewerkers'&&<>
            <div style={{marginBottom:'2rem'}}>
              <div style={S.sectionH}>Medewerkers</div>
              <div style={S.routeBlock}>
                {users.map(u=><div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:'0.5px solid rgba(140,82,255,0.12)'}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:u.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'white'}}>{initials(u.name)}</div>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500,color:'#f0eeff'}}>{u.name}</div><div style={{fontSize:12,color:'#4e4a6a',fontFamily:'monospace'}}>@{u.username}</div></div>
                  <span style={{...S.roleBadge,...S['role_'+u.role]}}>{u.role}</span>
                </div>)}
              </div>
            </div>
            <div>
              <div style={S.sectionH}>Nieuwe medewerker</div>
              <form style={{...S.routeBlock,padding:'1.25rem'}} onSubmit={createUser}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  {[['name','Naam','text'],['username','Gebruikersnaam','text'],['password','Wachtwoord','password']].map(([n,l,t])=>(
                    <div key={n}><label style={S.label}>{l}</label><input style={S.input} name={n} type={t} required /></div>
                  ))}
                  <div><label style={S.label}>Rol</label><select style={S.input} name="role"><option value="binnen">Binnenwerker</option><option value="bezorger">Bezorger</option><option value="admin">Admin</option></select></div>
                </div>
                <button style={{...S.btn,...S.btnSend}} type="submit">Aanmaken</button>
              </form>
            </div>
          </>}

          {tabA==='activiteit'&&<div style={{...S.routeBlock,padding:'12px 16px'}}>
            {log.length===0&&<div style={S.empty}>Nog geen activiteit.</div>}
            {log.map((l,i)=><div key={i} style={{display:'flex',gap:10,padding:'8px 0',borderBottom:'0.5px solid rgba(140,82,255,0.12)'}}>
              <span style={{fontSize:11,fontFamily:'monospace',color:'#4e4a6a',minWidth:130,flexShrink:0}}>
                {new Date(l.created_at).toLocaleDateString('nl-NL')} {new Date(l.created_at).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}
              </span>
              <span style={{fontSize:13,color:'#8a85aa'}}>{l.message}</span>
            </div>)}
          </div>}
        </>}
      </div>
    </div>
  );
}

const styles = {
  loginScreen:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0d14'},
  loginCard:{background:'#13131f',border:'0.5px solid rgba(140,82,255,0.22)',borderRadius:14,padding:'2rem'},
  loginTitle:{fontSize:11,color:'#4e4a6a',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'1.5rem'},
  loginErr:{background:'rgba(255,77,77,0.1)',border:'0.5px solid rgba(255,77,77,0.25)',borderRadius:10,padding:'8px 12px',fontSize:13,color:'#ff4d4d',marginBottom:'1rem'},
  label:{display:'block',fontSize:11,color:'#4e4a6a',marginBottom:6,fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.06em'},
  input:{width:'100%',background:'#1a1a2a',border:'0.5px solid rgba(140,82,255,0.22)',borderRadius:10,padding:'10px 14px',color:'#f0eeff',fontSize:14,outline:'none',boxSizing:'border-box'},
  btnPrimary:{width:'100%',background:'#8c52ff',color:'white',border:'none',borderRadius:10,padding:11,fontSize:14,fontWeight:500,cursor:'pointer',marginTop:'0.5rem'},
  topnav:{height:54,background:'#13131f',borderBottom:'0.5px solid rgba(140,82,255,0.12)',display:'flex',alignItems:'center',padding:'0 1.5rem',gap:16,position:'sticky',top:0,zIndex:100},
  userPill:{display:'flex',alignItems:'center',gap:8,background:'#1a1a2a',border:'0.5px solid rgba(140,82,255,0.22)',borderRadius:20,padding:'5px 12px 5px 8px'},
  avatar:{width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600,color:'white'},
  roleBadge:{fontSize:10,fontFamily:'monospace',padding:'2px 8px',borderRadius:20,textTransform:'uppercase',letterSpacing:'0.05em'},
  role_admin:{background:'rgba(245,166,35,0.1)',color:'#f5a623'},
  role_binnen:{background:'rgba(140,82,255,0.12)',color:'#a67dff'},
  role_bezorger:{background:'rgba(92,225,230,0.1)',color:'#5ce1e6'},
  btnLogout:{background:'transparent',border:'0.5px solid rgba(140,82,255,0.22)',borderRadius:10,padding:'5px 12px',fontSize:12,color:'#4e4a6a',cursor:'pointer'},
  main:{padding:'1.5rem',maxWidth:920,margin:'0 auto'},
  statsGrid:{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10,marginBottom:'1.5rem'},
  statCard:{background:'#13131f',border:'0.5px solid rgba(140,82,255,0.12)',borderRadius:10,padding:'14px 16px'},
  statLabel:{fontSize:11,color:'#4e4a6a',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6},
  statVal:{fontSize:26,fontWeight:500,color:'#f0eeff'},
  sv_green:{color:'#3ecf72'},sv_amber:{color:'#f5a623'},sv_red:{color:'#ff4d4d'},sv_bez:{color:'#5ce1e6'},
  tabRow:{display:'flex',gap:6,marginBottom:'1.25rem',flexWrap:'wrap'},
  tab:{fontSize:13,padding:'6px 16px',border:'0.5px solid rgba(140,82,255,0.22)',borderRadius:20,background:'transparent',color:'#4e4a6a',cursor:'pointer'},
  tabActive:{background:'#8c52ff',color:'white',borderColor:'#8c52ff'},
  routeBlock:{background:'#13131f',border:'0.5px solid rgba(140,82,255,0.12)',borderRadius:14,marginBottom:10,overflow:'hidden'},
  routeHeader:{display:'flex',alignItems:'center',gap:10,padding:'11px 16px',background:'#1a1a2a',borderBottom:'0.5px solid rgba(140,82,255,0.12)'},
  routeLabel:{fontSize:13,fontWeight:500,color:'#f0eeff',flex:1},
  orderRow:{padding:'11px 16px',borderBottom:'0.5px solid rgba(140,82,255,0.12)'},
  orderTop:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'},
  dot:{width:8,height:8,borderRadius:'50%',flexShrink:0},
  orderId:{fontSize:13,fontFamily:'monospace',fontWeight:500,color:'#a67dff',background:'rgba(140,82,255,0.12)',padding:'3px 9px',borderRadius:6,flexShrink:0,border:'0.5px solid rgba(140,82,255,0.25)'},
  orderName:{fontSize:13,color:'#f0eeff',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:80},
  orderAddr:{fontSize:12,color:'#8a85aa',flex:1.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  orderAmt:{fontSize:13,fontWeight:500,color:'#f0eeff',fontFamily:'monospace',flexShrink:0},
  payIdeal:{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:6,background:'rgba(62,207,114,0.1)',color:'#3ecf72',border:'0.5px solid rgba(62,207,114,0.2)',fontFamily:'monospace'},
  payCash:{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:6,background:'rgba(255,159,67,0.13)',color:'#ff9f43',border:'0.5px solid rgba(255,159,67,0.3)',fontFamily:'monospace'},
  fraudLine:{fontSize:12,color:'#ff4d4d',marginTop:3,paddingLeft:16},
  whoLine:{fontSize:11,color:'#4e4a6a',marginTop:3,paddingLeft:16,fontFamily:'monospace'},
  timerBar:{height:3,background:'#222235',borderRadius:2,overflow:'hidden'},
  timerFill:{height:'100%',borderRadius:2,transition:'width 1s linear'},
  timerText:{fontSize:11,color:'#4e4a6a',marginTop:3,fontFamily:'monospace'},
  btnRow:{display:'flex',gap:6,marginTop:8,paddingLeft:16,flexWrap:'wrap'},
  btn:{fontSize:12,padding:'5px 13px',borderRadius:10,cursor:'pointer',fontWeight:500},
  btnSend:{background:'#8c52ff',border:'0.5px solid #8c52ff',color:'white'},
  btnGreen:{background:'rgba(62,207,114,0.1)',border:'0.5px solid rgba(62,207,114,0.3)',color:'#3ecf72'},
  btnBez:{background:'rgba(92,225,230,0.1)',border:'0.5px solid rgba(92,225,230,0.3)',color:'#5ce1e6'},
  btnRed:{background:'rgba(255,77,77,0.1)',border:'0.5px solid rgba(255,77,77,0.3)',color:'#ff4d4d'},
  btnDisabled:{background:'transparent',border:'0.5px solid rgba(140,82,255,0.12)',color:'#4e4a6a',cursor:'not-allowed',opacity:0.4},
  badge:{fontSize:11,fontWeight:500,padding:'3px 9px',borderRadius:20,whiteSpace:'nowrap'},
  bGreen:{background:'rgba(62,207,114,0.1)',color:'#3ecf72'},
  bAmber:{background:'rgba(245,166,35,0.1)',color:'#f5a623'},
  bRed:{background:'rgba(255,77,77,0.1)',color:'#ff4d4d'},
  bBez:{background:'rgba(92,225,230,0.1)',color:'#5ce1e6'},
  bGray:{background:'#222235',color:'#4e4a6a'},
  alert:{background:'rgba(255,77,77,0.1)',border:'0.5px solid rgba(255,77,77,0.2)',borderRadius:10,padding:'12px 14px',marginBottom:10,display:'flex',gap:10},
  alertAmber:{background:'rgba(245,166,35,0.1)',borderColor:'rgba(245,166,35,0.2)'},
  alertIcon:{width:20,height:20,borderRadius:'50%',background:'#ff4d4d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'white',flexShrink:0},
  alertBody:{fontSize:13,color:'#ff4d4d',lineHeight:1.5},
  bezCard:{background:'#13131f',border:'0.5px solid rgba(140,82,255,0.12)',borderRadius:14,marginBottom:10,overflow:'hidden'},
  bezHead:{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#1a1a2a',borderBottom:'0.5px solid rgba(140,82,255,0.12)'},
  bezId:{fontSize:13,fontFamily:'monospace',fontWeight:500,color:'#a67dff',background:'rgba(140,82,255,0.12)',padding:'3px 9px',borderRadius:6,border:'0.5px solid rgba(140,82,255,0.25)'},
  empty:{fontSize:14,color:'#4e4a6a',padding:'1.5rem 0',textAlign:'center'},
  sectionH:{fontSize:11,fontWeight:500,color:'#4e4a6a',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12},
};
