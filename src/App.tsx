import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CirclePlus,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Filter,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Phone,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  UserRound,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Profile = { id: string; email: string; full_name: string; role: string; is_active: boolean };
type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: 'Meta Ads' | 'Referral' | 'Phone Call' | 'Other';
  service: string;
  assigned_to: string | null;
  status: 'new' | 'contacted' | 'follow_up' | 'converted' | 'lost';
  follow_up_date: string | null;
  notes: string;
  received_at: string;
  created_at: string;
  updated_at: string;
};
type Client = {
  id: string;
  name: string;
  company_name: string | null;
  phone: string;
  email: string | null;
  service: string;
  source: 'Meta Ads' | 'Referral' | 'Phone Call' | 'Other';
  assigned_to: string | null;
  status: 'active' | 'onboarding' | 'paused' | 'churned';
  lead_id: string | null;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Page = 'dashboard' | 'leads' | 'clients' | 'finance' | 'team' | 'settings';
type LeadForm = Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'received_at'>;
type ClientForm = Omit<Client, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'lead_id'>;

const emptyForm: LeadForm = { name: '', phone: '', email: '', source: 'Other', service: '', assigned_to: null, status: 'new', follow_up_date: null, notes: '' };
const statuses: Lead['status'][] = ['new', 'contacted', 'follow_up', 'converted', 'lost'];
const clientStatuses: Client['status'][] = ['active', 'onboarding', 'paused', 'churned'];
const clientStatusLabels: Record<Client['status'], string> = { active: 'Active', onboarding: 'Onboarding', paused: 'Paused', churned: 'Churned' };
const sources = ['All sources', 'Meta Ads', 'Referral', 'Phone Call', 'Other'] as const;
const clientStatusOptions = ['All status', 'active', 'onboarding', 'paused', 'churned'] as const;
const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'clients', label: 'Clients', icon: UsersRound },
  { id: 'finance', label: 'Finance', icon: Tag },
  { id: 'team', label: 'Team', icon: UserRound },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function friendlyError() { return 'Something went wrong. Please try again.'; }
function statusLabel(status: Lead['status']) { return status === 'follow_up' ? 'Follow-up' : status.charAt(0).toUpperCase() + status.slice(1); }
function clientStatusLabel(status: Client['status']) { return clientStatusLabels[status]; }
function formatReceived(value: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(value)); }

type AuthView = 'loading' | 'login' | 'set_password' | 'invite_error' | 'workspace';

function App() {
  const [view, setView] = useState<AuthView>('loading');
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authError, setAuthError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setView(data.session ? 'login' : 'login');
      const params = new URLSearchParams(window.location.hash.slice(1));
      const errCode = params.get('error_code') || new URLSearchParams(window.location.search).get('error_code');
      if (errCode === '403' || errCode === '422' || errCode === '410') {
        setView('invite_error');
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        setInviteEmail(nextSession?.user?.email ?? '');
        setView('set_password');
      } else if (event === 'SIGNED_OUT') {
        setView('login');
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (view === 'set_password' || view === 'invite_error') return;
    if (!session) { setProfile(null); setView('login'); return; }
    supabase.from('profiles').select('id, email, full_name, role, is_active').eq('id', session.user.id).maybeSingle().then(({ data, error }) => {
      if (error || !data || !data.is_active) { setAuthError('This account does not have workspace access. Contact your administrator.'); setView('login'); }
      else { setProfile(data as Profile); setView('workspace'); }
    });
  }, [session, view]);

  if (view === 'loading') return <div className="loading-screen"><div className="loading-mark">T</div><span>Loading workspace</span></div>;
  if (view === 'set_password') return <SetPassword email={inviteEmail} onDone={() => setView('login')} />;
  if (view === 'invite_error') return <InviteError />;
  if (view === 'login' || !session || !profile) return <Login error={authError} onError={setAuthError} />;
  return <Workspace profile={profile} />;
}

function Login({ error, onError }: { error: string; onError: (message: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); onError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) onError('The email or password is not correct. Please try again.');
    setLoading(false);
  };
  return <main className="login-page">
    <header className="login-header"><img src="/taha_logo.png" alt="Taha Media" /><span>Internal access</span></header>
    <div className="login-rule" />
    <section className="login-intro"><p className="eyebrow">Taha Media / 01</p><h1>Your workspace.<br /><em>Your access.</em></h1><span className="lime-line" /></section>
    <form className="login-form" onSubmit={submit}>
      <div className="form-heading"><span>Sign in</span><ShieldCheck size={18} /></div>
      <label>Email address<input type="email" placeholder="Enter your email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      <div className="login-meta"><span>Secure internal workspace</span><button type="button" onClick={() => onError('Please contact your administrator to reset your password.')}>Forgot password? Contact admin</button></div>
      {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}
      <button className="lime-button login-button" disabled={loading}>{loading ? 'Checking access…' : <>Log in <ArrowUpRight size={18} /></>}</button>
    </form>
    <footer className="login-footer"><span>Taha Media</span><span>01 / Access</span></footer>
  </main>;
}

function SetPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      const msg = updateError.message.toLowerCase();
      setError(msg.includes('expired') || msg.includes('invalid') || msg.includes('token')
        ? 'This invitation link has expired or is invalid. Please ask your administrator to send a new invitation.'
        : updateError.message);
      return;
    }
    setDone(true);
  };

  if (done) {
    return <main className="login-page">
      <header className="login-header"><img src="/taha_logo.png" alt="Taha Media" /><span>Internal access</span></header>
      <div className="login-rule" />
      <section className="login-intro"><p className="eyebrow">Taha Media / 01</p><h1>Password set.<br /><em>You're ready.</em></h1><span className="lime-line" /></section>
      <div className="login-form">
        <div className="form-heading"><span>All set</span><Check size={18} /></div>
        <p className="auth-message" style={{ color: 'var(--success, #16a34a)' }}><Check size={16} />Your password has been set. You can now sign in with your email and new password.</p>
        <button className="lime-button login-button" onClick={onDone}>Continue to sign in <ArrowUpRight size={18} /></button>
      </div>
      <footer className="login-footer"><span>Taha Media</span><span>01 / Access</span></footer>
    </main>;
  }

  return <main className="login-page">
    <header className="login-header"><img src="/taha_logo.png" alt="Taha Media" /><span>Internal access</span></header>
    <div className="login-rule" />
    <section className="login-intro"><p className="eyebrow">Taha Media / 01</p><h1>Set your<br /><em>password.</em></h1><span className="lime-line" /></section>
    <form className="login-form" onSubmit={submit}>
      <div className="form-heading"><span>Create password</span><ShieldCheck size={18} /></div>
      <p className="auth-message" style={{ color: 'var(--text-muted, #6b7280)' }}><Mail size={16} />{email ? `Welcome, ${email}.` : 'Welcome.'} Choose a password to finish setting up your account.</p>
      <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      <label>Confirm password<div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Re-enter your password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}
      <button className="lime-button login-button" disabled={loading}>{loading ? 'Saving…' : <>Set password <ArrowUpRight size={18} /></>}</button>
    </form>
    <footer className="login-footer"><span>Taha Media</span><span>01 / Access</span></footer>
  </main>;
}

function InviteError() {
  return <main className="login-page">
    <header className="login-header"><img src="/taha_logo.png" alt="Taha Media" /><span>Internal access</span></header>
    <div className="login-rule" />
    <section className="login-intro"><p className="eyebrow">Taha Media / 01</p><h1>Link<br /><em>expired.</em></h1><span className="lime-line" /></section>
    <div className="login-form">
      <div className="form-heading"><span>Invalid invitation</span><CircleAlert size={18} /></div>
      <p className="auth-message"><CircleAlert size={16} />This invitation link has expired or is no longer valid. Invitation links expire after 24 hours for security.</p>
      <p className="auth-message" style={{ color: 'var(--text-muted, #6b7280)' }}><Mail size={16} />Please ask your workspace administrator to send you a new invitation from the Team management page.</p>
      <a className="lime-button login-button" href={window.location.origin}>Go to sign in <ArrowUpRight size={18} /></a>
    </div>
    <footer className="login-footer"><span>Taha Media</span><span>01 / Access</span></footer>
  </main>;
}

function Workspace({ profile }: { profile: Profile }) {
  const [page, setPage] = useState<Page>('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showConverted, setShowConverted] = useState(false);

  const loadData = async () => {
    setLoading(true); setDataError('');
    const [leadResult, profileResult, clientResult] = await Promise.all([
      supabase.from('leads').select('*').order('received_at', { ascending: false }),
      supabase.from('profiles').select('id, email, full_name, role, is_active').eq('is_active', true).order('full_name'),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
    ]);
    if (leadResult.error || profileResult.error || clientResult.error) setDataError(friendlyError());
    else { setLeads((leadResult.data ?? []) as Lead[]); setProfiles((profileResult.data ?? []) as Profile[]); setClients((clientResult.data ?? []) as Client[]); }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, []);

  const saveLead = async (form: LeadForm, id?: string) => {
    const payload = { ...form, email: form.email || null, service: form.service || 'Not specified' };
    const result = id ? await supabase.from('leads').update(payload).eq('id', id).select().maybeSingle() : await supabase.from('leads').insert(payload).select().maybeSingle();
    if (result.error || !result.data) throw new Error(friendlyError());
    await loadData(); setSelectedLead(result.data as Lead); setShowAdd(false);
  };

  const convertLead = async (leadId: string, leadForm: LeadForm, clientData: { company_name: string }) => {
    const { data: existing } = await supabase.from('clients').select('id').eq('lead_id', leadId).maybeSingle();
    if (existing) throw new Error('This lead has already been converted to a client.');
    const clientPayload = {
      name: leadForm.name,
      company_name: clientData.company_name || null,
      phone: leadForm.phone,
      email: leadForm.email || null,
      service: leadForm.service || 'Not specified',
      source: leadForm.source,
      assigned_to: leadForm.assigned_to,
      status: 'active' as const,
      lead_id: leadId,
      notes: leadForm.notes,
    };
    const { data: client, error: clientErr } = await supabase.from('clients').insert(clientPayload).select().maybeSingle();
    if (clientErr || !client) throw new Error(friendlyError());
    const leadPayload = { ...leadForm, email: leadForm.email || null, service: leadForm.service || 'Not specified' };
    const { error: leadErr } = await supabase.from('leads').update(leadPayload).eq('id', leadId);
    if (leadErr) throw new Error(friendlyError());
    await loadData();
    setSelectedLead(null);
    setShowAdd(false);
  };

  const saveClient = async (form: ClientForm, id: string) => {
    const payload = { ...form, email: form.email || null, company_name: form.company_name || null };
    const result = await supabase.from('clients').update(payload).eq('id', id).select().maybeSingle();
    if (result.error || !result.data) throw new Error(friendlyError());
    await loadData(); setSelectedClient(result.data as Client);
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand-lockup"><img src="/taha_logo.png" alt="Taha Media" /><span>Internal workspace</span></div>
      <nav><p className="nav-label">Workspace</p>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => { setPage(id); setMobileNav(false); }}><Icon size={18} /><span>{label}</span>{id === 'leads' && leads.length > 0 && <b>{leads.length}</b>}{id === 'clients' && clients.length > 0 && <b>{clients.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</div><div><strong>{profile.full_name}</strong><span>{profile.role.split('_').join(' ')}</span></div><ChevronDown size={16} /></div><button className="signout" onClick={signOut}><LogOut size={17} /> Sign out</button></div>
    </aside>
    {mobileNav && <button className="mobile-overlay" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Taha Media</span><i>/</i><strong>{navItems.find((item) => item.id === page)?.label}</strong></div><div className="topbar-actions"><span className="date-label"><CalendarDays size={16} /> {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><button className="icon-button"><Bell size={18} /><i /></button><div className="top-avatar">{profile.full_name.slice(0, 1).toUpperCase()}</div></div></header>
      {page === 'dashboard' && <Dashboard leads={leads} profiles={profiles} clients={clients} onOpenLeads={() => setPage('leads')} onOpenClients={() => setPage('clients')} onAdd={() => setShowAdd(true)} onOpenConverted={() => setShowConverted(true)} onOpenClient={(c) => setSelectedClient(c)} />}
      {page === 'leads' && <LeadsPage leads={leads} profiles={profiles} loading={loading} error={dataError} onRetry={loadData} onAdd={() => setShowAdd(true)} onSelect={setSelectedLead} />}
      {page === 'clients' && <ClientsPage clients={clients} profiles={profiles} loading={loading} error={dataError} onRetry={loadData} onSelect={setSelectedClient} />}
      {page === 'team' && <TeamPage profile={profile} />}
      {['finance', 'settings'].includes(page) && <PlaceholderPage page={page} />}
    </main>
    {showAdd && <LeadModal profiles={profiles} onClose={() => setShowAdd(false)} onSave={(form) => saveLead(form)} />}
    {selectedLead && <LeadDetail lead={selectedLead} profiles={profiles} onClose={() => setSelectedLead(null)} onSave={(form) => saveLead(form, selectedLead.id)} onConvert={(form, clientData) => convertLead(selectedLead.id, form, clientData)} />}
    {selectedClient && <ClientDetail client={selectedClient} profiles={profiles} onClose={() => setSelectedClient(null)} onSave={(form) => saveClient(form, selectedClient.id)} />}
    {showConverted && <ConvertedLeadsView leads={leads.filter((l) => l.status === 'converted')} clients={clients} profiles={profiles} onClose={() => setShowConverted(false)} onOpenClient={(c) => { setShowConverted(false); setSelectedClient(c); }} />}
  </div>;
}

function Dashboard({ leads, profiles, clients, onOpenLeads, onOpenClients, onAdd, onOpenConverted, onOpenClient }: { leads: Lead[]; profiles: Profile[]; clients: Client[]; onOpenLeads: () => void; onOpenClients: () => void; onAdd: () => void; onOpenConverted: () => void; onOpenClient: (client: Client) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const convertedLeads = leads.filter((lead) => lead.status === 'converted');
  const metrics = [
    { label: "Today's new leads", value: leads.filter((lead) => lead.received_at.slice(0, 10) === today).length, note: 'Received since midnight', icon: Sparkles, onClick: undefined as (() => void) | undefined },
    { label: 'Total active leads', value: leads.filter((lead) => !['converted', 'lost'].includes(lead.status)).length, note: 'Across every source', icon: Target, onClick: undefined as (() => void) | undefined },
    { label: 'Follow-ups due', value: leads.filter((lead) => lead.status === 'follow_up' || lead.follow_up_date === today).length, note: 'Needs your attention', icon: Clock3, onClick: undefined as (() => void) | undefined },
    { label: 'Converted leads', value: convertedLeads.length, note: `${leads.length ? Math.round((convertedLeads.length / leads.length) * 100) : 0}% conversion rate`, icon: Check, onClick: onOpenConverted },
  ];
  const sourcesList = ['Meta Ads', 'Referral', 'Phone Call', 'Other'].map((source) => ({ source, count: leads.filter((lead) => lead.source === source).length }));
  return <div className="page-content"><div className="page-title-row"><div><p className="eyebrow">Wednesday / Command centre</p><h1>Good morning, {profiles[0]?.full_name.split(' ')[0] || 'team'}.</h1><p className="subtitle">A clear view of what needs to move today.</p></div><button className="lime-button" onClick={onAdd}><CirclePlus size={18} /> Add new lead</button></div>
    <section className="metric-grid">{metrics.map(({ label, value, note, icon: Icon, onClick }, index) => <div className={`metric metric-${index} ${onClick ? 'metric-clickable' : ''}`} key={label} onClick={onClick}><div className="metric-top"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{note}</small>{onClick && <span className="metric-hint">Click to view <ArrowUpRight size={12} /></span>}</div>)}</section>
    <div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">Live pulse</p><h2>Recent lead activity</h2></div><button className="text-button" onClick={onOpenLeads}>View all <ArrowUpRight size={15} /></button></div>{leads.length === 0 ? <EmptyState compact /> : <div className="activity-list">{leads.slice(0, 5).map((lead) => <div className="activity-row" key={lead.id}><div className={`status-dot ${lead.status}`} /><div className="activity-copy"><strong>{lead.name}</strong><span>{lead.service} <i>·</i> {lead.source}</span></div><div className="activity-time"><span className={`status-pill ${lead.status}`}>{statusLabel(lead.status)}</span><small>{formatReceived(lead.received_at)}</small></div></div>)}</div>}</section>
      <section className="panel sources-panel"><div className="panel-heading"><div><p className="eyebrow">Acquisition</p><h2>Lead sources</h2></div><SlidersHorizontal size={18} /></div><div className="source-list">{sourcesList.map(({ source, count }) => <div className="source-row" key={source}><div><span className="source-mark" /> <strong>{source}</strong></div><span>{count.toString().padStart(2, '0')}</span></div>)}</div><div className="source-footer"><span>Meta Ads is ready as a source</span><span className="prepared">Prepared <Check size={13} /></span></div></section></div>
    <section className="lower-strip"><div><p className="eyebrow">Next move</p><h2>Keep every conversation moving forward.</h2></div><button className="outline-button" onClick={onOpenLeads}>Open lead management <ArrowUpRight size={16} /></button></section>
  </div>;
}

function LeadsPage({ leads, profiles, loading, error, onRetry, onAdd, onSelect }: { leads: Lead[]; profiles: Profile[]; loading: boolean; error: string; onRetry: () => void; onAdd: () => void; onSelect: (lead: Lead) => void }) {
  const [query, setQuery] = useState(''); const [source, setSource] = useState('All sources'); const [status, setStatus] = useState('All statuses'); const [assignee, setAssignee] = useState('All owners');
  const filtered = useMemo(() => leads.filter((lead) => [lead.name, lead.phone, lead.email ?? '', lead.service].join(' ').toLowerCase().includes(query.toLowerCase()) && (source === 'All sources' || lead.source === source) && (status === 'All statuses' || lead.status === status) && (assignee === 'All owners' || lead.assigned_to === assignee)), [leads, query, source, status, assignee]);
  return <div className="page-content"><div className="page-title-row leads-title"><div><p className="eyebrow">Pipeline / {leads.length.toString().padStart(2, '0')} records</p><h1>Lead management</h1><p className="subtitle">Every opportunity, clearly accounted for.</p></div><button className="lime-button" onClick={onAdd}><CirclePlus size={18} /> Add new lead</button></div>
    <div className="filter-bar"><div className="search-box"><Search size={18} /><input placeholder="Search leads" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="filter-select"><Filter size={16} /><select value={source} onChange={(event) => setSource(event.target.value)}>{sources.map((item) => <option key={item}>{item}</option>)}</select></div><div className="filter-select"><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option>{statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></div><div className="filter-select owner-filter"><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option>All owners</option>{profiles.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></div></div>
    {error ? <div className="data-state"><CircleAlert size={22} /><h3>We couldn't load your leads</h3><p>Check your connection and try again.</p><button className="outline-button" onClick={onRetry}>Try again</button></div> : loading ? <div className="data-state"><div className="spinner" /><p>Loading your leads…</p></div> : filtered.length === 0 ? <EmptyState onAdd={onAdd} /> : <div className="lead-table-wrap"><table className="lead-table"><thead><tr><th>Lead</th><th>Source</th><th>Interest</th><th>Owner</th><th>Status</th><th>Received</th><th /></tr></thead><tbody>{filtered.map((lead) => <tr key={lead.id} onClick={() => onSelect(lead)}><td><div className="table-person"><div className="small-avatar">{lead.name.slice(0, 1).toUpperCase()}</div><div><strong>{lead.name}</strong><span>{lead.phone}</span></div></div></td><td><span className="source-tag"><i />{lead.source}</span></td><td>{lead.service}</td><td>{profiles.find((person) => person.id === lead.assigned_to)?.full_name || <span className="muted">Unassigned</span>}</td><td><span className={`status-pill ${lead.status}`}>{statusLabel(lead.status)}</span></td><td>{formatReceived(lead.received_at)}</td><td><button className="row-action" aria-label={`Open ${lead.name}`}><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table></div>}
  </div>;
}

function EmptyState({ compact = false, onAdd }: { compact?: boolean; onAdd?: () => void }) { return <div className={`empty-state ${compact ? 'compact' : ''}`}><div className="empty-icon"><Target size={22} /></div><h3>{compact ? 'No activity yet' : 'Your pipeline is clear'}</h3><p>{compact ? 'New lead activity will appear here.' : 'Add your first lead to start building momentum.'}</p>{!compact && onAdd && <button className="lime-button" onClick={onAdd}><CirclePlus size={17} /> Add a lead</button>}</div>; }

function LeadModal({ profiles, onClose, onSave }: { profiles: Profile[]; onClose: () => void; onSave: (form: LeadForm) => Promise<void> }) { return <LeadEditor title="Add a new lead" profiles={profiles} initial={emptyForm} onClose={onClose} onSave={onSave} />; }
function LeadDetail({ lead, profiles, onClose, onSave, onConvert }: { lead: Lead; profiles: Profile[]; onClose: () => void; onSave: (form: LeadForm) => Promise<void>; onConvert: (form: LeadForm, clientData: { company_name: string }) => Promise<void> }) { const initial: LeadForm = { name: lead.name, phone: lead.phone, email: lead.email, source: lead.source, service: lead.service, assigned_to: lead.assigned_to, status: lead.status, follow_up_date: lead.follow_up_date, notes: lead.notes }; return <LeadEditor title="Lead details" profiles={profiles} initial={initial} onClose={onClose} onSave={onSave} onConvert={onConvert} detail />; }
function LeadEditor({ title, profiles, initial, onClose, onSave, onConvert, detail = false }: { title: string; profiles: Profile[]; initial: LeadForm; onClose: () => void; onSave: (form: LeadForm) => Promise<void>; onConvert?: (form: LeadForm, clientData: { company_name: string }) => Promise<void>; detail?: boolean }) {
  const [form, setForm] = useState<LeadForm>(initial); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [showCompleteClient, setShowCompleteClient] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [converting, setConverting] = useState(false);
  const update = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    if (detail && initial.status !== 'converted' && form.status === 'converted' && onConvert) {
      setShowConvertConfirm(true); setSaving(false); return;
    }
    try { await onSave(form); } catch { setError(friendlyError()); } finally { setSaving(false); }
  };
  const handleConvert = async () => {
    setConverting(true); setError('');
    try {
      await onConvert!(form, { company_name: companyName });
      setShowCompleteClient(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : friendlyError());
    } finally { setConverting(false); }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="lead-drawer"><div className="drawer-header"><div><p className="eyebrow">{detail ? 'Lead record' : 'New opportunity'}</p><h2>{title}</h2></div><button className="close-button" onClick={onClose}><X size={20} /></button></div><form className="lead-form" onSubmit={submit}><div className="form-grid"><label>Full name<input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Ahmed Khan" required /></label><label>Phone number<input value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+92 300 0000000" required /></label><label>Email address<input type="email" value={form.email ?? ''} onChange={(event) => update('email', event.target.value)} placeholder="Optional" /></label><label>Interested service<input value={form.service} onChange={(event) => update('service', event.target.value)} placeholder="e.g. Social media management" /></label><label>Lead source<select value={form.source} onChange={(event) => update('source', event.target.value as Lead['source'])}>{sources.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label>Assigned salesperson<select value={form.assigned_to ?? ''} onChange={(event) => update('assigned_to', event.target.value || null)}><option value="">Unassigned</option>{profiles.map((person) => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select></label><label>Lead status<select value={form.status} onChange={(event) => update('status', event.target.value as Lead['status'])}>{statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label><label>Follow-up date<input type="date" value={form.follow_up_date ?? ''} onChange={(event) => update('follow_up_date', event.target.value || null)} /></label></div><label className="notes-field">Internal notes<textarea rows={5} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Add useful context for the team…" /></label>{error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}<div className="drawer-footer"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="lime-button" disabled={saving}>{saving ? 'Saving…' : <>{detail ? 'Save changes' : 'Create lead'} <ArrowUpRight size={17} /></>}</button></div></form>
    {showConvertConfirm && <div className="convert-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowConvertConfirm(false); }}><section className="confirm-dialog"><div className="confirm-icon"><TrendingUp size={26} /></div><h3>Convert this lead to a client?</h3><p className="confirm-subtitle">Confirming will create a client record using the information already in this lead. The lead will be marked as Converted and preserved as a historical record.</p><div className="drawer-footer"><button className="outline-button" onClick={() => setShowConvertConfirm(false)}>Cancel</button><button className="lime-button" onClick={() => { setShowConvertConfirm(false); setShowCompleteClient(true); }}>Yes, Convert <ArrowUpRight size={17} /></button></div></section></div>}
    {showCompleteClient && <div className="convert-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCompleteClient(false); }}><section className="confirm-dialog confirm-dialog-wide"><div className="confirm-icon"><Building2 size={26} /></div><h3>Complete client details</h3><p className="confirm-subtitle">The lead's name, phone, email, and service will be carried over automatically. Add any additional information below.</p><label className="complete-field">Company / business name (optional)<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Corporation" /></label>{error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}<div className="drawer-footer"><button className="outline-button" onClick={() => setShowCompleteClient(false)} disabled={converting}>Back</button><button className="lime-button" onClick={handleConvert} disabled={converting}>{converting ? 'Converting…' : <>Create client <ArrowUpRight size={17} /></>}</button></div></section></div>}
  </section></div>;
}

function ClientsPage({ clients, profiles, loading, error, onRetry, onSelect }: { clients: Client[]; profiles: Profile[]; loading: boolean; error: string; onRetry: () => void; onSelect: (client: Client) => void }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All status');
  const [sourceFilter, setSourceFilter] = useState('All sources');
  const filtered = useMemo(() => clients.filter((c) =>
    [c.name, c.company_name ?? '', c.phone, c.email ?? '', c.service].join(' ').toLowerCase().includes(query.toLowerCase()) &&
    (statusFilter === 'All status' || c.status === statusFilter) &&
    (sourceFilter === 'All sources' || c.source === sourceFilter)),
    [clients, query, statusFilter, sourceFilter]);
  return <div className="page-content"><div className="page-title-row leads-title"><div><p className="eyebrow">Roster / {clients.length.toString().padStart(2, '0')} clients</p><h1>Client management</h1><p className="subtitle">Every relationship, nurtured and accounted for.</p></div></div>
    <div className="filter-bar"><div className="search-box"><Search size={18} /><input placeholder="Search clients" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="filter-select"><Filter size={16} /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{clientStatusOptions.map((s) => <option key={s} value={s}>{s === 'All status' ? 'All status' : clientStatusLabels[s as Client['status']]}</option>)}</select></div><div className="filter-select"><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>{sources.map((s) => <option key={s}>{s}</option>)}</select></div></div>
    {error ? <div className="data-state"><CircleAlert size={22} /><h3>We couldn't load your clients</h3><p>Check your connection and try again.</p><button className="outline-button" onClick={onRetry}>Try again</button></div>
     : loading ? <div className="data-state"><div className="spinner" /><p>Loading your clients…</p></div>
     : filtered.length === 0 ? <div className="data-state"><div className="empty-icon"><UsersRound size={22} /></div><h3>{clients.length === 0 ? 'No clients yet' : 'No clients found'}</h3><p>{clients.length === 0 ? 'Convert a lead to create your first client.' : 'Adjust your search or filters.'}</p></div>
     : <div className="client-grid">{filtered.map((c) => <div className="client-card" key={c.id} onClick={() => onSelect(c)}><div className="client-card-top"><div className="client-avatar">{c.name.slice(0, 1).toUpperCase()}</div><span className={`client-status-pill ${c.status}`}>{clientStatusLabel(c.status)}</span></div><h3>{c.name}</h3>{c.company_name && <p className="client-company"><Building2 size={14} /> {c.company_name}</p>}<div className="client-card-meta"><span className="source-tag"><i />{c.service}</span></div><div className="client-card-meta-secondary"><span>{profiles.find((p) => p.id === c.assigned_to)?.full_name || <span className="muted">Unassigned</span>}</span><span className="muted">{formatReceived(c.created_at)}</span></div><div className="client-card-footer"><span className="source-tag"><i />{c.source}</span><button className="text-button">View client <ArrowUpRight size={14} /></button></div></div>)}</div>}
  </div>;
}

function ClientDetail({ client, profiles, onClose, onSave }: { client: Client; profiles: Profile[]; onClose: () => void; onSave: (form: ClientForm) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ClientForm>({ name: client.name, company_name: client.company_name, phone: client.phone, email: client.email, service: client.service, source: client.source, assigned_to: client.assigned_to, status: client.status, notes: client.notes });
  const update = <K extends keyof ClientForm>(key: K, value: ClientForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await onSave(form); setEditing(false); } catch { setError(friendlyError()); } finally { setSaving(false); }
  };
  const assigneeName = profiles.find((p) => p.id === client.assigned_to)?.full_name || 'Unassigned';
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="lead-drawer"><div className="drawer-header"><div><p className="eyebrow">Client record</p><h2>{client.name}</h2></div><button className="close-button" onClick={onClose}><X size={20} /></button></div>
    {!editing ? <div className="client-detail-view">
      <div className="client-detail-hero"><div className="client-avatar lg">{client.name.slice(0, 1).toUpperCase()}</div><div><h3>{client.name}</h3>{client.company_name && <p className="client-company"><Building2 size={15} /> {client.company_name}</p>}<span className={`client-status-pill ${client.status}`}>{clientStatusLabel(client.status)}</span></div></div>
      <div className="client-detail-grid"><div className="client-detail-row"><span><Phone size={14} /> Phone</span><strong>{client.phone}</strong></div><div className="client-detail-row"><span><Mail size={14} /> Email</span><strong>{client.email || <span className="muted">Not provided</span>}</strong></div><div className="client-detail-row"><span><Target size={14} /> Service</span><strong>{client.service}</strong></div><div className="client-detail-row"><span><Tag size={14} /> Lead source</span><strong>{client.source}</strong></div><div className="client-detail-row"><span><UserRound size={14} /> Salesperson</span><strong>{assigneeName}</strong></div><div className="client-detail-row"><span><CalendarDays size={14} /> Converted</span><strong>{formatReceived(client.created_at)}</strong></div>{client.lead_id && <div className="client-detail-row"><span><TrendingUp size={14} /> From lead</span><strong className="client-lead-link">Linked lead record</strong></div>}</div>
      {client.notes && <div className="client-detail-notes"><p className="eyebrow">Internal notes</p><p>{client.notes}</p></div>}
      <div className="drawer-footer"><button className="outline-button" onClick={onClose}>Close</button><button className="lime-button" onClick={() => setEditing(true)}>Edit client <ArrowUpRight size={17} /></button></div>
    </div>
    : <form className="lead-form" onSubmit={submit}><div className="form-grid"><label>Full name<input value={form.name} onChange={(e) => update('name', e.target.value)} required /></label><label>Company / business<input value={form.company_name ?? ''} onChange={(e) => update('company_name', e.target.value)} placeholder="Optional" /></label><label>Phone number<input value={form.phone} onChange={(e) => update('phone', e.target.value)} required /></label><label>Email address<input type="email" value={form.email ?? ''} onChange={(e) => update('email', e.target.value)} placeholder="Optional" /></label><label>Service<input value={form.service} onChange={(e) => update('service', e.target.value)} /></label><label>Lead source<select value={form.source} onChange={(e) => update('source', e.target.value as Client['source'])}>{sources.slice(1).map((s) => <option key={s}>{s}</option>)}</select></label><label>Assigned salesperson<select value={form.assigned_to ?? ''} onChange={(e) => update('assigned_to', e.target.value || null)}><option value="">Unassigned</option>{profiles.map((p) => <option value={p.id} key={p.id}>{p.full_name}</option>)}</select></label><label>Client status<select value={form.status} onChange={(e) => update('status', e.target.value as Client['status'])}>{clientStatuses.map((s) => <option key={s} value={s}>{clientStatusLabel(s)}</option>)}</select></label></div><label className="notes-field">Internal notes<textarea rows={5} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Add useful context…" /></label>{error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}<div className="drawer-footer"><button type="button" className="outline-button" onClick={() => setEditing(false)}>Cancel</button><button className="lime-button" disabled={saving}>{saving ? 'Saving…' : <>Save changes <ArrowUpRight size={17} /></>}</button></div></form>}
  </section></div>;
}

function ConvertedLeadsView({ leads, clients, profiles, onClose, onOpenClient }: { leads: Lead[]; clients: Client[]; profiles: Profile[]; onClose: () => void; onOpenClient: (client: Client) => void }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="lead-drawer"><div className="drawer-header"><div><p className="eyebrow">Conversion history</p><h2>Converted leads</h2></div><button className="close-button" onClick={onClose}><X size={20} /></button></div>
    <div className="converted-list">{leads.length === 0 ? <div className="data-state" style={{ minHeight: 200 }}><div className="empty-icon"><TrendingUp size={22} /></div><h3>No converted leads yet</h3><p>Converted leads will appear here with their client links.</p></div>
     : leads.map((lead) => { const client = clients.find((c) => c.lead_id === lead.id); return <div className="converted-row" key={lead.id}><div className="converted-info"><div className="small-avatar">{lead.name.slice(0, 1).toUpperCase()}</div><div><strong>{lead.name}</strong><span>{lead.service} <i>·</i> {lead.source} <i>·</i> {profiles.find((p) => p.id === lead.assigned_to)?.full_name || 'Unassigned'}</span></div></div><div className="converted-action">{client ? <button className="text-button" onClick={() => onOpenClient(client)}>View client <ArrowUpRight size={14} /></button> : <span className="muted">No client linked</span>}<small>{formatReceived(lead.received_at)}</small></div></div>; })}</div>
  </section></div>;
}

function PlaceholderPage({ page }: { page: Page }) { const labels: Record<string, string> = { finance: 'Finance', settings: 'Settings' }; return <div className="page-content placeholder-page"><div className="placeholder-mark"><Sparkles size={24} /></div><p className="eyebrow">Phase 1 / Coming next</p><h1>{labels[page]}</h1><p className="subtitle">This space is reserved for the next layer of the Taha Media workspace.</p><span className="lime-line" /></div>; }

const teamRoles: { id: string; label: string }[] = [
  { id: 'sales', label: 'Sales' },
  { id: 'editor', label: 'Editor' },
  { id: 'script_writer', label: 'Script Writer' },
  { id: 'social_media_manager', label: 'Social Media Manager' },
  { id: 'finance', label: 'Finance' },
  { id: 'employee', label: 'Employee' },
];
const roleLabels: Record<string, string> = Object.fromEntries(teamRoles.map((r) => [r.id, r.label]));

async function callTeamAdmin(action: 'create' | 'set_role' | 'toggle_active', payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('You are not signed in.');
  const method = action === 'create' ? 'POST' : 'PATCH';
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/team-admin`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(action === 'create' ? payload : { action, ...payload }),
  });
  if (!response.ok) {
    let message = 'Something went wrong.';
    try { const body = await response.json(); if (body?.error) message = body.error; } catch { /* ignore */ }
    throw new Error(message);
  }
  return (await response.json()) as { method?: 'invite' | 'temp_password'; temp_password?: string };
}

function TeamPage({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === 'admin';
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [statusFilter, setStatusFilter] = useState('All status');
  const [showAdd, setShowAdd] = useState(false);
  const [actionRow, setActionRow] = useState<Profile | null>(null);
  const [confirmState, setConfirmState] = useState<{ profile: Profile; action: 'set_role' | 'toggle_active'; newRole?: string; newActive?: boolean } | null>(null);
  const [working, setWorking] = useState(false);

  const loadEmployees = async () => {
    setLoading(true); setError('');
    const { data, error: err } = await supabase.from('profiles').select('id, email, full_name, role, is_active').order('full_name');
    if (err) setError(friendlyError());
    else setEmployees((data ?? []) as Profile[]);
    setLoading(false);
  };
  useEffect(() => { loadEmployees(); }, []);

  const filtered = useMemo(() => employees.filter((e) =>
    [e.full_name, e.email, roleLabels[e.role] ?? e.role].join(' ').toLowerCase().includes(query.toLowerCase()) &&
    (roleFilter === 'All roles' || e.role === roleFilter) &&
    (statusFilter === 'All status' || (statusFilter === 'Active' ? e.is_active : !e.is_active))),
    [employees, query, roleFilter, statusFilter]);

  const runAction = async () => {
    if (!confirmState) return;
    setWorking(true);
    try {
      if (confirmState.action === 'set_role' && confirmState.newRole) {
        await callTeamAdmin('set_role', { user_id: confirmState.profile.id, role: confirmState.newRole });
      } else if (confirmState.action === 'toggle_active') {
        await callTeamAdmin('toggle_active', { user_id: confirmState.profile.id, is_active: confirmState.newActive ?? false });
      }
      setConfirmState(null);
      await loadEmployees();
    } catch (e) {
      setError(e instanceof Error ? e.message : friendlyError());
    } finally {
      setWorking(false);
    }
  };

  return <div className="page-content">
    <div className="page-title-row leads-title"><div><p className="eyebrow">Team / {employees.length.toString().padStart(2, '0')} members</p><h1>Team management</h1><p className="subtitle">Every workspace member, clearly accounted for.</p></div>{isAdmin && <button className="lime-button" onClick={() => setShowAdd(true)}><UserPlus size={18} /> Add employee</button>}</div>
    <div className="filter-bar"><div className="search-box"><Search size={18} /><input placeholder="Search team members" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="filter-select"><Filter size={16} /><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option>All roles</option>{teamRoles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div><div className="filter-select"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>All status</option><option>Active</option><option>Inactive</option></select></div></div>
    {error && <div className="data-state"><CircleAlert size={22} /><h3>Something went wrong</h3><p>{error}</p><button className="outline-button" onClick={() => { setError(''); loadEmployees(); }}>Try again</button></div>}
    {!error && loading ? <div className="data-state"><div className="spinner" /><p>Loading team members…</p></div>
     : !error && filtered.length === 0 ? <div className="data-state"><div className="empty-icon"><UsersRound size={22} /></div><h3>No team members found</h3><p>Adjust your search or add a new employee.</p></div>
     : !error && <div className="lead-table-wrap"><table className="lead-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>
      {filtered.map((e) => <tr key={e.id}><td><div className="table-person"><div className="small-avatar" style={{ opacity: e.is_active ? 1 : 0.45 }}>{e.full_name.slice(0, 1).toUpperCase()}</div><div><strong>{e.full_name}</strong><span>{e.email}</span></div></div></td>
        <td><span className={`team-role-pill ${e.role}`}>{e.role === 'admin' ? 'Admin' : roleLabels[e.role] ?? e.role}</span></td>
        <td><span className={`active-pill ${e.is_active ? 'on' : 'off'}`}><span className="active-dot" />{e.is_active ? 'Active' : 'Inactive'}</span></td>
        <td><span className="muted">Team member</span></td>
        <td>{isAdmin && e.role !== 'admin' ? <button className="row-action" aria-label={`Manage ${e.full_name}`} onClick={() => setActionRow(e)}><MoreHorizontal size={18} /></button> : <span className="muted">—</span>}</td>
      </tr>)}
    </tbody></table></div>}
    {showAdd && isAdmin && <AddEmployeeModal onClose={() => setShowAdd(false)} onCreated={async () => { setShowAdd(false); await loadEmployees(); }} />}
    {actionRow && isAdmin && <EmployeeActionDrawer profile={actionRow} onClose={() => setActionRow(null)} onConfirm={(action, value) => { setActionRow(null); setConfirmState({ profile: actionRow, action, newRole: action === 'set_role' ? value : undefined, newActive: action === 'toggle_active' ? Boolean(value) : undefined }); }} />}
    {confirmState && <ConfirmDialog state={confirmState} working={working} onCancel={() => setConfirmState(null)} onConfirm={runAction} />}
  </div>;
}

function AddEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(teamRoles[0].id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ method: string; temp_password?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setResult(null);
    try {
      const res = await callTeamAdmin('create', { full_name: fullName, email, role, app_url: window.location.origin });
      setResult({ method: res.method ?? 'invite', temp_password: res.temp_password });
    } catch (e) {
      setError(e instanceof Error ? e.message : friendlyError());
    } finally { setSaving(false); }
  };

  const finish = () => onCreated();

  const copyPassword = () => {
    if (!result?.temp_password) return;
    navigator.clipboard.writeText(result.temp_password).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) result ? finish() : onClose(); }}>
    <section className="lead-drawer"><div className="drawer-header"><div><p className="eyebrow">{result ? 'Employee invited' : 'New team member'}</p><h2>{result ? 'Account created' : 'Add an employee'}</h2></div><button className="close-button" onClick={result ? finish : onClose}><X size={20} /></button></div>
      {!result ? <form className="lead-form" onSubmit={submit}><p className="team-helper">The employee will receive an email invitation to set their own password and sign in.</p><div className="form-grid">
        <label>Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Sara Ahmed" required /></label>
        <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@taha.in" required /></label>
        <label className="form-grid-full">Role<select value={role} onChange={(e) => setRole(e.target.value)}>{teamRoles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      </div>
      {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}
      <div className="drawer-footer"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="lime-button" disabled={saving}>{saving ? 'Sending invite…' : <>Send invite <ArrowUpRight size={17} /></>}</button></div></form>
      : <div className="team-result">
        <div className={`team-result-card ${result.method === 'invite' ? 'ok' : 'warn'}`}>
          {result.method === 'invite'
            ? <><Mail size={20} /><div><strong>Invitation sent.</strong><span>{email} will receive an email to set their password and sign in.</span></div></>
            : <><CircleAlert size={20} /><div><strong>Account created with a temporary password.</strong><span>Email delivery was unavailable. Share this password once — it is not stored.</span></div></>}
        </div>
        {result.temp_password && <div className="temp-pass-row"><label>Temporary password</label><div className="temp-pass-box"><code>{result.temp_password}</code><button type="button" onClick={copyPassword} className={copied ? 'copied' : ''}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button></div></div>}
        <button className="lime-button" onClick={finish}>Done <ArrowUpRight size={17} /></button>
      </div>}
    </section>
  </div>;
}

function EmployeeActionDrawer({ profile, onClose, onConfirm }: { profile: Profile; onClose: () => void; onConfirm: (action: 'set_role' | 'toggle_active', value: string | boolean) => void }) {
  const [selectedRole, setSelectedRole] = useState(profile.role);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="lead-drawer"><div className="drawer-header"><div><p className="eyebrow">Manage member</p><h2>{profile.full_name}</h2></div><button className="close-button" onClick={onClose}><X size={20} /></button></div>
      <div className="lead-form">
        <label className="team-email-label">Email<input value={profile.email} readOnly disabled /></label>
        <label className="form-grid-full team-role-label">Role<select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>{teamRoles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        <div className="drawer-footer"><button className="outline-button" onClick={onClose}>Cancel</button><button className="lime-button" disabled={selectedRole === profile.role} onClick={() => onConfirm('set_role', selectedRole)}>Save role <ArrowUpRight size={17} /></button></div>
        <div className="team-divider" />
        <p className="eyebrow">Access</p>
        <div className="team-toggle-row"><div><strong>{profile.is_active ? 'Deactivate account' : 'Activate account'}</strong><span>{profile.is_active ? 'Prevent sign-in without deleting the account.' : 'Allow this member to sign in again.'}</span></div><button className="outline-button" onClick={() => onConfirm('toggle_active', !profile.is_active)}>{profile.is_active ? 'Deactivate' : 'Activate'}</button></div>
      </div>
    </section>
  </div>;
}

function ConfirmDialog({ state, working, onCancel, onConfirm }: { state: { profile: Profile; action: 'set_role' | 'toggle_active'; newRole?: string; newActive?: boolean }; working: boolean; onCancel: () => void; onConfirm: () => void }) {
  const text = state.action === 'set_role'
    ? `Change ${state.profile.full_name}'s role to ${roleLabels[state.newRole ?? ''] ?? state.newRole}?`
    : state.newActive
      ? `Activate ${state.profile.full_name}'s account?`
      : `Deactivate ${state.profile.full_name}'s account? They will not be able to sign in.`;
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}><section className="confirm-dialog"><p>{text}</p><div className="drawer-footer"><button className="outline-button" onClick={onCancel} disabled={working}>Cancel</button><button className="lime-button" onClick={onConfirm} disabled={working}>{working ? 'Saving…' : 'Confirm'}</button></div></section></div>;
}

export default App;
