import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  MapPinned,
  Route,
  Settings,
  UserCircle2,
  Plus,
  Search,
  Navigation,
  PencilLine,
  LocateFixed,
  X,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react';

type GoogleCredentialResponse = {
  credential?: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'small' | 'medium' | 'large';
              width?: number;
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
            },
          ) => void;
        };
      };
    };
  }
}

type MainTab = 'map' | 'accounts' | 'route' | 'calendar' | 'settings';
type AccountSubTab = 'all' | 'recent' | 'followups';
type RouteSubTab = 'current' | 'saved';
type AccountDetailsTab = 'detail' | 'location' | 'notes' | 'history';

type Account = {
  id: string;
  name: string;
  address: string;
  owner: string;
  miles: number;
  category: 'customer' | 'lead';
  lastCheckIn?: string;
};

const APP_RED = '#c93413';
const APP_DARK = '#1d2329';
const APP_BLUE = '#4a90e2';

const seedAccounts: Account[] = [
  { id: 'a1', name: 'Bad Mary Jane', address: '799 Lexington Ave, New York, NY 10065, USA', owner: 'Bryce Johnson', miles: 1.9, category: 'customer' },
  { id: 'a2', name: 'A & E WHOLESALE OF NORTH FLO...', address: 'Bronx, NY', owner: 'Bryce Johnson', miles: 3.2, category: 'lead' },
  { id: 'a3', name: 'A To Z', address: 'Queens, NY', owner: 'Bryce Johnson', miles: 5.1, category: 'lead' },
  { id: 'a4', name: 'A to Z smoke shop', address: 'Brooklyn, NY', owner: 'Bryce Johnson', miles: 2.8, category: 'lead' },
  { id: 'a5', name: 'A TO Z smoke shop', address: 'Brooklyn, NY', owner: 'Bryce Johnson', miles: 2.4, category: 'customer' },
  { id: 'a6', name: 'A-1 Wholesale', address: 'Manhattan, NY', owner: 'Bryce Johnson', miles: 1.1, category: 'customer' },
  { id: 'a7', name: 'A-1 Wholesale, Inc.', address: 'Manhattan, NY', owner: 'Bryce Johnson', miles: 2.1, category: 'lead' },
  { id: 'a8', name: 'A.J. Smoke & Vape', address: 'Bronx, NY', owner: 'Bryce Johnson', miles: 3.9, category: 'lead' },
  { id: 'a9', name: 'A1 Wholesale llc', address: 'Queens, NY', owner: 'Bryce Johnson', miles: 6.4, category: 'customer' },
  { id: 'a10', name: 'A2 Smoke shop', address: 'Brooklyn, NY', owner: 'Bryce Johnson', miles: 4.7, category: 'lead' },
];

const savedRoutes = [
  { id: 'r1', name: 'Ben Bryce route', date: '01/14/2026', owner: 'Bryce Johnson' },
  { id: 'r2', name: 'Albany 7/29/25', date: '07/29/2025', owner: 'Bryce Johnson' },
  { id: 'r3', name: 'Syracuse 7/29 Melissa', date: '07/29/2025', owner: 'Bryce Johnson' },
  { id: 'r4', name: 'Bryce/Matt/Luke/NIck', date: '07/24/2025', owner: 'Bryce Johnson' },
];

const currentRouteStops = [
  { id: 's1', name: 'Cannadreams', time: '9:00AM', duration: '00:30', travel: '5 minutes' },
  { id: 's2', name: 'Herbwell Cannabis...', time: '9:35AM', duration: '00:30', travel: '13 minutes' },
  { id: 's3', name: 'The Flowery - Soho', time: '10:19AM', duration: '00:30', travel: '9 minutes' },
];

const mapPins = Array.from({ length: 80 }).map((_, i) => ({
  id: `pin-${i}`,
  top: 10 + ((i * 13) % 68),
  left: 8 + ((i * 17) % 84),
}));

const TopHeader: React.FC<{ title: string; left?: React.ReactNode; right?: React.ReactNode }> = ({ title, left, right }) => (
  <div className="h-24 px-4 pt-9 flex items-center justify-between text-white" style={{ backgroundColor: APP_RED }}>
    <div className="w-16 text-left">{left}</div>
    <h1 className="text-4 font-semibold tracking-tight">{title}</h1>
    <div className="w-16 text-right">{right}</div>
  </div>
);

const Segmented: React.FC<{ items: { id: string; label: string }[]; active: string; onChange: (id: string) => void }> = ({ items, active, onChange }) => (
  <div className="bg-gray-200 rounded-xl p-1 flex gap-1">
    {items.map((item) => (
      <button
        key={item.id}
        onClick={() => onChange(item.id)}
        className={`flex-1 rounded-lg py-1.5 text-sm ${active === item.id ? 'text-white shadow' : 'text-gray-700'}`}
        style={active === item.id ? { backgroundColor: APP_RED } : undefined}
      >
        {item.label}
      </button>
    ))}
  </div>
);

const SearchBar: React.FC<{ placeholder: string; value: string; onChange: (v: string) => void }> = ({ placeholder, value, onChange }) => (
  <div className="mx-3 mt-3 h-12 rounded-xl bg-gray-200 flex items-center px-3 gap-2 text-gray-500">
    <Search size={20} />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-transparent outline-none w-full text-xl"
    />
  </div>
);

const BottomNav: React.FC<{ tab: MainTab; setTab: (tab: MainTab) => void; routeBadge?: number }> = ({ tab, setTab, routeBadge = 0 }) => {
  const Item = ({ id, label, icon }: { id: MainTab; label: string; icon: React.ReactNode }) => (
    <button onClick={() => setTab(id)} className={`flex flex-col items-center justify-center gap-1 text-xs ${tab === id ? 'text-white' : 'text-gray-400'}`}>
      <div className="relative">
        {icon}
        {id === 'route' && routeBadge > 0 && (
          <span className="absolute -top-2 -right-2 rounded-full text-[10px] text-white px-1.5" style={{ backgroundColor: '#ef4444' }}>
            {routeBadge}
          </span>
        )}
      </div>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="h-20 px-5 border-t border-gray-700" style={{ backgroundColor: APP_DARK }}>
      <div className="h-full grid grid-cols-5">
        <Item id="map" label="Map" icon={<MapPinned size={23} />} />
        <Item id="accounts" label="Accounts" icon={<UserCircle2 size={23} />} />
        <Item id="route" label="Route" icon={<Route size={23} />} />
        <Item id="calendar" label="Calendar" icon={<CalendarDays size={23} />} />
        <Item id="settings" label="Settings" icon={<Settings size={23} />} />
      </div>
    </div>
  );
};

const CalendarView: React.FC = () => {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <div className="flex-1 bg-white overflow-y-auto">
      <TopHeader title="March - 2026" left={<button>‹ Calendar</button>} />
      <div className="px-3 py-1 border-b text-gray-600 text-sm grid grid-cols-7">
        {days.map((d) => <div key={d} className="text-center">{d}</div>)}
      </div>
      <div className="text-red-700 px-4 py-5 text-2">MAR</div>
      {[1, 8, 15, 22, 29].map((start) => (
        <div key={start} className="grid grid-cols-7 border-t border-gray-200 px-2 py-4 text-center text-3">
          {Array.from({ length: 7 }).map((_, idx) => {
            const day = start + idx;
            if (day > 31) return <div key={idx} className="text-gray-300">{day}</div>;
            const selected = day === 2;
            const today = day === 3;
            return (
              <div key={idx} className="flex justify-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selected ? 'bg-black text-white' : today ? 'text-white' : ''}`} style={today ? { backgroundColor: APP_BLUE } : undefined}>
                  {day}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState<MainTab>('map');
  const [accountFilter, setAccountFilter] = useState<AccountSubTab>('all');
  const [routeTab, setRouteTab] = useState<RouteSubTab>('current');
  const [query, setQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(seedAccounts[0].id);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [detailTab, setDetailTab] = useState<AccountDetailsTab>('detail');
  const [showAddLocation, setShowAddLocation] = useState(false);

  const selectedAccount = useMemo(
    () => seedAccounts.find((a) => a.id === selectedAccountId) || seedAccounts[0],
    [selectedAccountId],
  );

  const filteredAccounts = useMemo(() => {
    let list = seedAccounts;
    if (accountFilter === 'recent') list = list.slice(0, 5);
    if (accountFilter === 'followups') list = list.filter((a) => a.category === 'lead');
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    return list;
  }, [accountFilter, query]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        setIsAuthed(res.ok);
      } catch {
        setIsAuthed(false);
      } finally {
        setAuthLoading(false);
      }
    };
    void checkSession();
  }, []);

  useEffect(() => {
    const loadGoogleConfig = async () => {
      try {
        const res = await fetch('/api/auth/google-config');
        if (!res.ok) return;
        const data = await res.json();
        if (data?.enabled && typeof data.clientId === 'string') setGoogleClientId(data.clientId);
      } catch {
        // noop
      }
    };
    void loadGoogleConfig();
  }, []);

  const handleGoogleCredential = async (credential: string): Promise<void> => {
    if (!credential || isSigningIn) return;
    setAuthError('');
    setIsSigningIn(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Google sign-in failed' }));
        setAuthError(data.error || 'Google sign-in failed');
        return;
      }
      setIsAuthed(true);
    } catch {
      setAuthError('Network error during Google sign-in');
    } finally {
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    if (isAuthed || !googleClientId || !googleButtonRef.current) return;
    const googleId = window.google?.accounts?.id;
    if (!googleId) {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = 'true';
        script.onload = () => handleGoogleCredential('');
        document.head.appendChild(script);
      }
      return;
    }

    googleId.initialize({
      client_id: googleClientId,
      callback: (response: GoogleCredentialResponse) => {
        if (response.credential) void handleGoogleCredential(response.credential);
      },
    });

    googleButtonRef.current.innerHTML = '';
    googleId.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      width: 320,
      text: 'signin_with',
    });
  }, [googleClientId, isAuthed]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSigningIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Login failed' }));
        setAuthError(data.error || 'Login failed');
        return;
      }
      setIsAuthed(true);
    } catch {
      setAuthError('Network error while logging in');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setIsAuthed(false);
    }
  };

  if (authLoading) return <div className="min-h-screen bg-gray-100 flex items-center justify-center">Checking access...</div>;

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <form onSubmit={handlePasswordLogin} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
          <h1 className="text-xl font-semibold">PICC Map CRM Sign In</h1>
          {googleClientId ? <div className="flex justify-center"><div ref={googleButtonRef} /></div> : null}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            placeholder="Shared password"
            required
          />
          {authError ? <div className="text-red-600 text-sm">{authError}</div> : null}
          <button disabled={isSigningIn} className="w-full text-white rounded-lg py-2" style={{ backgroundColor: APP_RED }}>
            {isSigningIn ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 flex justify-center">
      <div className="w-full max-w-md bg-white h-full shadow-xl flex flex-col relative overflow-hidden">
        {tab === 'map' && (
          <>
            <TopHeader title="Map" left={<span className="font-medium">Visualize</span>} right={<span className="font-medium">Places</span>} />
            <div className="px-3 -mt-2 mb-2">
              <Segmented items={[{ id: 'map', label: 'Map' }, { id: 'list', label: 'List' }]} active="map" onChange={() => null} />
            </div>

            <div className="relative flex-1 overflow-hidden">
              <iframe
                title="nyc-map"
                className="absolute inset-0 w-full h-full"
                src="https://www.openstreetmap.org/export/embed.html?bbox=-74.05%2C40.67%2C-73.89%2C40.82&layer=mapnik"
              />
              {mapPins.map((pin) => (
                <span
                  key={pin.id}
                  className="absolute w-3.5 h-3.5 rounded-full border border-red-200"
                  style={{ top: `${pin.top}%`, left: `${pin.left}%`, backgroundColor: '#ff5a36' }}
                />
              ))}

              <button className="absolute right-3 top-3 bg-white rounded-lg shadow p-2"><Search size={18} /></button>
              <button className="absolute right-3 top-14 bg-white rounded-lg shadow p-2"><LocateFixed size={18} /></button>

              <div className="absolute left-0 right-0 bottom-0 text-white" style={{ backgroundColor: APP_DARK }}>
                <button className="w-full p-3 text-left border-b border-gray-700" onClick={() => setShowAccountDetails(true)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-lg">{selectedAccount.name}</div>
                      <div className="text-sm text-gray-300">{selectedAccount.address}</div>
                    </div>
                    <ChevronDown size={18} className="text-gray-300" />
                  </div>
                  <div className="text-sm text-gray-300 mt-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> {selectedAccount.owner}</div>
                </button>
                <div className="grid grid-cols-4 text-xs border-b border-gray-700">
                  <button className="py-2 border-r border-gray-700">add to...</button>
                  <button className="py-2 border-r border-gray-700">check-in</button>
                  <button className="py-2 border-r border-gray-700">center on map</button>
                  <button className="py-2">navigate</button>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'accounts' && (
          <div className="flex-1 overflow-hidden bg-gray-100 flex flex-col">
            <TopHeader title="Accounts" right={<button onClick={() => setShowAddLocation(true)}><Plus size={24} /></button>} />
            <div className="p-3 pt-2 border-b bg-white"><Segmented items={[{ id: 'all', label: 'All' }, { id: 'recent', label: 'Recent' }, { id: 'followups', label: 'Follow-Ups' }]} active={accountFilter} onChange={(id) => setAccountFilter(id as AccountSubTab)} /></div>
            <SearchBar placeholder="Search Accounts" value={query} onChange={setQuery} />

            <div className="flex-1 overflow-y-auto mt-2 bg-white border-t">
              <div className="text-gray-400 px-4 py-2">A</div>
              {filteredAccounts.map((account) => (
                <button key={account.id} onClick={() => { setSelectedAccountId(account.id); setShowAccountDetails(true); }} className="w-full text-left px-4 py-4 border-t text-3">
                  {account.name}
                </button>
              ))}
            </div>
            <div className="absolute right-2 top-[220px] text-blue-500 text-xs leading-4 font-semibold">A<br/>B<br/>C<br/>D<br/>E<br/>F<br/>G<br/>H<br/>I<br/>J<br/>K<br/>L<br/>M<br/>N<br/>O<br/>P<br/>Q<br/>R<br/>S<br/>T<br/>U<br/>V<br/>W<br/>X<br/>Y<br/>Z<br/>#</div>
          </div>
        )}

        {tab === 'route' && (
          <div className="flex-1 overflow-y-auto bg-gray-100">
            <TopHeader title="Route" right={routeTab === 'saved' ? <button className="font-medium">Edit</button> : <button><Plus size={24} /></button>} />
            <div className="p-3 border-b bg-white">
              <Segmented items={[{ id: 'current', label: 'Current Route' }, { id: 'saved', label: 'Saved Routes' }]} active={routeTab} onChange={(id) => setRouteTab(id as RouteSubTab)} />
            </div>

            {routeTab === 'saved' ? (
              <>
                <SearchBar placeholder="Search Routes" value={query} onChange={setQuery} />
                <div className="mt-2 bg-white border-t border-b">
                  {savedRoutes.map((r) => (
                    <div key={r.id} className="px-4 py-4 border-t flex items-start justify-between">
                      <div>
                        <div className="text-xl">{r.name}</div>
                        <div className="text-gray-400">{r.date}</div>
                        <div className="text-gray-600">{r.owner}</div>
                      </div>
                      <ChevronRight className="text-gray-400 mt-2" />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="p-4 text-center">
                  <button className="rounded-full px-8 py-3 text-white text-2 font-semibold" style={{ backgroundColor: APP_BLUE }} onClick={() => setShowAddLocation(true)}>
                    <Plus size={18} className="inline mr-1" /> Add Location
                  </button>
                  <div className="text-gray-500 mt-2 flex items-center justify-center gap-2"><Check size={18} /> Route Updated</div>
                </div>
                <div className="bg-white border-y">
                  <div className="px-4 py-2 text-gray-500">03/02/2026</div>
                  <div className="px-4 pb-2 font-semibold text-gray-700 flex justify-between"><span>CURRENT ROUTE</span><span className="text-blue-400 text-sm">STATS</span></div>
                  {currentRouteStops.map((s, idx) => (
                    <div key={s.id} className="border-t">
                      <div className="px-4 py-3 flex items-center gap-3">
                        <span className="text-gray-300">☰</span>
                        <span className="w-6 h-6 rounded-full border border-green-400 text-green-600 text-xs flex items-center justify-center">{idx + 1}</span>
                        <div className="text-center w-16"><div className="text-xl">{s.time}</div><div className="text-xs text-gray-400">Time</div></div>
                        <div className="text-center w-14"><div className="text-xl">{s.duration}</div><div className="text-xs text-gray-400">Length</div></div>
                        <div className="font-semibold text-xl flex-1">{s.name}</div>
                        <ChevronRight className="text-gray-400" />
                      </div>
                      <div className="text-gray-400 text-sm px-16 pb-2">Travel Time &nbsp; {s.travel}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-white border-t h-14 flex items-center px-4 text-gray-400">Enter End Location</div>
                <div className="fixed bottom-20 left-0 right-0 mx-auto max-w-md bg-white border-t grid grid-cols-5 text-center text-sm text-blue-500 py-2">
                  <button className="text-white rounded-xl mx-2 py-1" style={{ backgroundColor: '#30b84f' }}>GO</button>
                  <button>optimize</button>
                  <button>save</button>
                  <button>clear</button>
                  <button>+ calendar</button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'calendar' && <CalendarView />}

        {tab === 'settings' && (
          <div className="flex-1 overflow-y-auto bg-gray-100">
            <TopHeader title="Settings" right={<button onClick={handleLogout}>Sign out</button>} />
            <div className="p-4 space-y-3">
              {['Data Sources', 'Notion CRM Mapping', 'Dispensary Contacts Mapping', 'Routing Preferences', 'Notifications', 'Territory Settings'].map((item) => (
                <div key={item} className="bg-white rounded-xl p-4 flex justify-between items-center">
                  <span>{item}</span>
                  <ChevronRight className="text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        <BottomNav tab={tab} setTab={setTab} routeBadge={3} />

        {showAccountDetails && (
          <div className="absolute inset-0 bg-black/40 flex items-end z-50">
            <div className="w-full bg-white rounded-t-2xl overflow-hidden max-h-[92%]">
              <div className="h-16 px-4 flex items-center justify-between text-white" style={{ backgroundColor: APP_RED }}>
                <button onClick={() => setShowAccountDetails(false)}><X /></button>
                <h2 className="font-semibold text-lg">Account Details</h2>
                <button>Edit</button>
              </div>
              <div className="p-3 border-b">
                <Segmented
                  items={[{ id: 'detail', label: 'Detail' }, { id: 'location', label: 'Location' }, { id: 'notes', label: 'Notes' }, { id: 'history', label: 'History' }]}
                  active={detailTab}
                  onChange={(id) => setDetailTab(id as AccountDetailsTab)}
                />
              </div>
              <div className="overflow-y-auto max-h-[58vh]">
                <div className="p-4 border-b">
                  <h3 className="text-3xl">{selectedAccount.name}</h3>
                  <div className="text-gray-400">{selectedAccount.miles} miles</div>
                </div>
                {detailTab === 'detail' && (
                  <>
                    {[
                      ['Phone', ''],
                      ['Email', ''],
                      ['Last check-in', selectedAccount.lastCheckIn || 'No check-ins'],
                      ['Follow-up Date', ''],
                      ['Account Owner', selectedAccount.owner],
                      ['What Point of Sales are Needed', ''],
                      ['PICC Rep', ''],
                      ['What did we drop off', ''],
                      ['Current Customer or Lead?', selectedAccount.category],
                    ].map(([label, value]) => (
                      <div key={label} className="px-4 py-3 border-b">
                        <div className="text-gray-400 text-sm">{label}</div>
                        <div className="text-2xl">{value}</div>
                      </div>
                    ))}
                  </>
                )}
                {detailTab !== 'detail' && <div className="p-6 text-gray-500">{detailTab} view coming next (wired for Notion/contacts data).</div>}
              </div>
              <div className="grid grid-cols-4 border-t text-sm text-blue-500 bg-white">
                <button className="py-3 border-r">add to...</button>
                <button className="py-3 border-r"><PencilLine size={14} className="inline mr-1" />check-in</button>
                <button className="py-3 border-r">center on map</button>
                <button className="py-3"><Navigation size={14} className="inline mr-1" />navigate</button>
              </div>
            </div>
          </div>
        )}

        {showAddLocation && (
          <div className="absolute inset-0 bg-black/40 z-50 flex items-end">
            <div className="w-full bg-white rounded-t-2xl overflow-hidden h-[86%]">
              <div className="h-16 px-4 flex items-center justify-between text-white" style={{ backgroundColor: APP_RED }}>
                <button onClick={() => setShowAddLocation(false)}><X /></button>
                <h2 className="font-semibold text-lg">Add Locations</h2>
                <button className="text-white/70">Add to route</button>
              </div>
              <div className="p-3 border-b bg-white">
                <Segmented items={[{ id: 'accounts', label: 'Accounts' }, { id: 'quick', label: 'Quick Stop' }]} active="accounts" onChange={() => null} />
              </div>
              <SearchBar placeholder="Search Locations" value={query} onChange={setQuery} />
              <div className="mt-2 overflow-y-auto h-[58vh] border-t">
                <div className="text-gray-400 px-4 py-2">A</div>
                {filteredAccounts.map((account) => (
                  <div key={account.id} className="px-4 py-3 border-t flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full border border-gray-300 inline-block" />
                    <span className="text-xl">{account.name}</span>
                  </div>
                ))}
              </div>
              <div className="absolute right-2 top-[220px] text-blue-500 text-xs leading-4 font-semibold">A<br/>B<br/>C<br/>D<br/>E<br/>F<br/>G<br/>H<br/>I<br/>J<br/>K<br/>L<br/>M<br/>N<br/>O<br/>P<br/>Q<br/>R<br/>S<br/>T<br/>U<br/>V<br/>W<br/>X<br/>Y<br/>Z<br/>#</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
