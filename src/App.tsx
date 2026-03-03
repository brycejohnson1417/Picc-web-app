import React, { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { NotionDocList } from './components/NotionDocList';
import { AICopilot } from './components/AICopilot';
import { Settings } from './components/Settings';
import { ServiceWorkspace } from './components/ServiceWorkspace';
import { CustomerPortal } from './components/CustomerPortal';
import { PPPOnboarding } from './components/PPPOnboarding';
import { AdminDashboard } from './components/AdminDashboard';
import { ProposalBuilder } from './components/ProposalBuilder';
import { SalesCRM } from './components/SalesCRM';
import { FinanceReports } from './components/FinanceReports';
import { TeamDirectory } from './components/TeamDirectory';
import { BAOpsView } from './components/BAOpsView';
import { UserRole } from './types';

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

const roleNavIds: Record<UserRole, string[]> = {
  [UserRole.AMBASSADOR]: ['dashboard', 'ba-ops', 'sales', 'wiki'],
  [UserRole.SALES_REP]: ['dashboard', 'sales', 'ba-ops', 'proposals', 'wiki'],
  [UserRole.SALES_OPS]: ['dashboard', 'service-center', 'ppp', 'ba-ops', 'sales', 'team', 'wiki'],
  [UserRole.FINANCE]: ['dashboard', 'finance', 'team', 'wiki'],
  [UserRole.ADMIN]: ['dashboard', 'service-center', 'ppp', 'ba-ops', 'sales', 'proposals', 'finance', 'team', 'wiki', 'admin', 'settings'],
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userRole, setUserRole] = useState<UserRole>(UserRole.SALES_REP);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (!res.ok && res.status >= 500) {
          const data = await res.json().catch(() => ({ error: 'Auth service unavailable. Verify APP_AUTH_SECRET and deployment auth settings.' }));
          setAuthError(data.error || 'Auth service unavailable. Verify APP_AUTH_SECRET and deployment auth settings.');
        }
        setIsAuthed(res.ok);
      } catch {
        setIsAuthed(false);
        setAuthError('Unable to reach auth service. Check network or deployment status.');
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
        if (data?.enabled && typeof data.clientId === 'string') {
          setGoogleClientId(data.clientId);
        }
      } catch {
        // No-op: password auth still works if Google config request fails.
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

    let disposed = false;

    const renderGoogleButton = () => {
      if (disposed || !googleButtonRef.current) return;
      const googleId = window.google?.accounts?.id;
      if (!googleId) return;

      googleId.initialize({
        client_id: googleClientId,
        callback: (response: GoogleCredentialResponse) => {
          if (!response.credential) {
            setAuthError('Google response did not include a credential token.');
            return;
          }
          void handleGoogleCredential(response.credential);
        },
      });

      googleButtonRef.current.innerHTML = '';
      googleId.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'signin_with',
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if (window.google?.accounts?.id) {
      renderGoogleButton();
    } else if (existingScript) {
      existingScript.addEventListener('load', renderGoogleButton);
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      script.onload = renderGoogleButton;
      document.head.appendChild(script);
    }

    return () => {
      disposed = true;
      if (existingScript) {
        existingScript.removeEventListener('load', renderGoogleButton);
      }
    };
  }, [googleClientId, isAuthed, isSigningIn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const allowed = roleNavIds[userRole];
    if (!allowed.includes(activeTab) && activeTab !== 'customer-portal' && activeTab !== 'settings') {
      setActiveTab('dashboard');
    }
  }, [userRole, activeTab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSigningIn) return;
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
      setPassword('');
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        Checking access...
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">PICC Intranet Sign In</h1>
          <p className="text-sm text-slate-500">Sign in with Google or use the shared access password.</p>

          {googleClientId ? (
            <>
              <div className="flex justify-center">
                <div ref={googleButtonRef} />
              </div>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-400 tracking-wide">or</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
              Google OAuth is not enabled yet. Configure <code>GOOGLE_CLIENT_ID</code> to turn it on.
            </div>
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="Shared password"
            autoFocus
            required
          />
          {authError && <div className="text-sm text-red-600">{authError}</div>}
          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full bg-slate-900 text-white rounded-lg py-2 hover:bg-slate-800 disabled:bg-slate-500 disabled:cursor-not-allowed"
          >
            {isSigningIn ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  if (activeTab === 'customer-portal') {
    return (
      <>
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => setActiveTab('dashboard')}
            className="bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg text-sm hover:bg-slate-800"
          >
            Return to Internal Workspace
          </button>
        </div>
        <CustomerPortal />
      </>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard currentRole={userRole} />;
      case 'service-center':
        return <ServiceWorkspace currentUserRole={userRole} />;
      case 'ppp':
        return <PPPOnboarding />;
      case 'wiki':
        return <NotionDocList />;
      case 'settings':
        return <Settings />;
      case 'admin':
        return <AdminDashboard />;
      case 'proposals':
        return <ProposalBuilder />;
      case 'sales':
        return <SalesCRM />;
      case 'finance':
        return <FinanceReports />;
      case 'team':
        return <TeamDirectory />;
      case 'ba-ops':
        return <BAOpsView />;
      default:
        return <Dashboard currentRole={userRole} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        currentRole={userRole}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setRole={setUserRole}
      />

      <main className="flex-1 ml-64 p-8 overflow-x-hidden">
        <div className="flex justify-end mb-4">
          <button
            onClick={handleLogout}
            className="text-sm bg-white border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
        {renderContent()}
      </main>

      <AICopilot />
    </div>
  );
};

export default App;
