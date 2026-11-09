import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CirclePlus,
  Clock,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Filter,
  History,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserCheck,
  UserRound,
  UserPlus,
  UsersRound,
  WifiOff,
  X,
  XCircle,
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
  status: 'new' | 'contacted' | 'follow_up' | 'converted' | 'lost' | 'unqualified';
  follow_up_date: string | null;
  next_follow_up_at: string | null;
  qualification_status: 'qualified' | 'unqualified' | null;
  unqualified_reason: string | null;
  unqualified_notes: string | null;
  unqualified_at: string | null;
  unqualified_by: string | null;
  notes: string;
  received_at: string;
  created_at: string;
  updated_at: string;
  meta_lead_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

type LeadCallLog = {
  id: string;
  lead_id: string;
  salesperson_id: string;
  interaction_type: 'outgoing' | 'incoming';
  attempt_number: number | null;
  call_result: 'attended' | 'not_attended';
  call_outcome: 'attended' | 'signal_problem' | 'full_ring';
  qualification_result: 'qualified' | 'unqualified' | null;
  response: string | null;
  unqualified_reason: string | null;
  unqualified_notes: string | null;
  scheduled_follow_up_at: string | null;
  follow_up_status: 'pending' | 'completed' | 'cancelled' | 'superseded' | null;
  notes: string;
  created_at: string;
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

type Page = 'dashboard' | 'leads' | 'clients' | 'finance' | 'team' | 'settings' | 'deleted_leads' | 'unqualified_leads';
type LeadQuickFilter = 'all' | 'today' | 'active' | 'follow_ups' | 'converted';
type LeadForm = Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'received_at' | 'meta_lead_id' | 'deleted_at' | 'deleted_by' | 'next_follow_up_at' | 'qualification_status' | 'unqualified_reason' | 'unqualified_notes' | 'unqualified_at' | 'unqualified_by'>;
type ClientForm = Omit<Client, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'lead_id'>;

const emptyForm: LeadForm = { name: '', phone: '', email: '', source: 'Other', service: '', assigned_to: null, status: 'new', follow_up_date: null, notes: '' };
const emptyClientForm: ClientForm = { name: '', company_name: '', phone: '', email: '', source: 'Other', service: '', assigned_to: null, status: 'active', notes: '' };
const statuses: Lead['status'][] = ['new', 'contacted', 'follow_up', 'converted', 'lost', 'unqualified'];
const clientStatuses: Client['status'][] = ['active', 'onboarding', 'paused', 'churned'];
const clientStatusLabels: Record<Client['status'], string> = { active: 'Active', onboarding: 'Onboarding', paused: 'Paused', churned: 'Churned' };
const sources = ['All sources', 'Meta Ads', 'Referral', 'Phone Call', 'Other'] as const;
const clientStatusOptions = ['All status', 'active', 'onboarding', 'paused', 'churned'] as const;

const unqualifiedReasonOptions = [
  'Budget too low / Price issue',
  'Not interested',
  'Looking for different service / Not a fit',
  'Wrong number / Invalid contact',
  'Competitor / Spam',
  'Other',
];

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'clients', label: 'Clients', icon: UsersRound },
  { id: 'unqualified_leads', label: 'Unqualified', icon: Ban, adminOnly: true },
  { id: 'deleted_leads', label: 'Deleted leads', icon: Trash2, adminOnly: true },
  { id: 'finance', label: 'Finance', icon: Tag, adminOnly: true },
  { id: 'team', label: 'Team', icon: UserRound, adminOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
];

function friendlyError() { return 'Something went wrong. Please try again.'; }

function statusLabel(status: Lead['status']) {
  if (status === 'follow_up') return 'Follow-up';
  if (status === 'unqualified') return 'Unqualified';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function clientStatusLabel(status: Client['status']) { return clientStatusLabels[status]; }
function formatReceived(value: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(value)); }

function getLocalTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isReceivedToday(isoString: string): boolean {
  if (!isoString) return false;
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` === getLocalTodayDate();
}

function formatFollowUpTime(isoString: string | null, dateOnly?: string | null): string {
  if (!isoString && !dateOnly) return 'None';
  if (isoString) {
    const date = new Date(isoString);
    const localToday = getLocalTodayDate();
    const datePart = date.toLocaleDateString('en-CA');
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

    if (datePart === localToday) {
      return `Today at ${timeStr}`;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (datePart === tomorrow.toLocaleDateString('en-CA')) {
      return `Tomorrow at ${timeStr}`;
    }

    return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} at ${timeStr}`;
  }

  // Fallback to legacy date-only string
  const parts = dateOnly!.split('-');
  if (parts.length === 3) {
    if (dateOnly === getLocalTodayDate()) return 'Today';
    return `${parts[2]}/${parts[1]}`;
  }
  return dateOnly!;
}

function isFollowUpDue(lead: Lead): boolean {
  if (['converted', 'lost', 'unqualified'].includes(lead.status)) return false;
  if (lead.qualification_status === 'unqualified') return false;
  if (lead.deleted_at) return false;

  if (lead.next_follow_up_at) {
    return new Date(lead.next_follow_up_at).getTime() <= Date.now();
  }
  if (lead.follow_up_date) {
    return lead.follow_up_date <= getLocalTodayDate();
  }
  return false;
}

type AuthView = 'loading' | 'login' | 'set_password' | 'invite_error' | 'workspace';

function App() {
  const [view, setView] = useState<AuthView>('loading');
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authError, setAuthError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [agencyBranding, setAgencyBranding] = useState<{ agency_name: string; logo_url: string | null }>({
    agency_name: 'Taha Media',
    logo_url: null,
  });

  const loadAgencyBranding = async () => {
    try {
      const { data } = await supabase
        .from('agency_settings')
        .select('agency_name, logo_url')
        .eq('id', 'default')
        .maybeSingle();
      if (data) {
        setAgencyBranding({
          agency_name: data.agency_name || 'Taha Media',
          logo_url: data.logo_url || null,
        });
      }
    } catch {
      // Sensible default fallback
    }
  };

  useEffect(() => {
    loadAgencyBranding();
  }, []);

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
  if (view === 'set_password') return <SetPassword email={inviteEmail} onDone={() => setView('login')} agencyBranding={agencyBranding} />;
  if (view === 'invite_error') return <InviteError agencyBranding={agencyBranding} />;
  if (view === 'login' || !session || !profile) return <Login error={authError} onError={setAuthError} agencyBranding={agencyBranding} />;
  return <Workspace profile={profile} agencyBranding={agencyBranding} onAgencyBrandingChange={setAgencyBranding} />;
}

function Login({ error, onError, agencyBranding }: { error: string; onError: (message: string) => void; agencyBranding: { agency_name: string; logo_url: string | null } }) {
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
    <header className="login-header"><img src={agencyBranding.logo_url || '/taha_logo.png'} alt={agencyBranding.agency_name} /><span>Internal access</span></header>
    <div className="login-rule" />
    <section className="login-intro"><p className="eyebrow">{agencyBranding.agency_name} / 01</p><h1>Your workspace.<br /><em>Your access.</em></h1><span className="lime-line" /></section>
    <form className="login-form" onSubmit={submit}>
      <div className="form-heading"><span>Sign in</span><ShieldCheck size={18} /></div>
      <label>Email address<input type="email" placeholder="Enter your email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      <div className="login-meta"><span>Secure internal workspace</span><button type="button" onClick={() => onError('Please contact your administrator to reset your password.')}>Forgot password? Contact admin</button></div>
      {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}
      <button className="lime-button login-button" disabled={loading}>{loading ? 'Checking access…' : <>Log in <ArrowUpRight size={18} /></>}</button>
    </form>
    <footer className="login-footer"><span>{agencyBranding.agency_name}</span><span>01 / Access</span></footer>
  </main>;
}

function SetPassword({ email, onDone, agencyBranding }: { email: string; onDone: () => void; agencyBranding?: { agency_name: string; logo_url: string | null } }) {
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

  const agencyName = agencyBranding?.agency_name || 'Taha Media';
  const logoSrc = agencyBranding?.logo_url || '/taha_logo.png';

  if (done) {
    return <main className="login-page">
      <header className="login-header"><img src={logoSrc} alt={agencyName} /><span>Internal access</span></header>
      <div className="login-rule" />
      <section className="login-intro"><p className="eyebrow">{agencyName} / 01</p><h1>Password set.<br /><em>You're ready.</em></h1><span className="lime-line" /></section>
      <div className="login-form">
        <div className="form-heading"><span>All set</span><Check size={18} /></div>
        <p className="auth-message" style={{ color: 'var(--success, #16a34a)' }}><Check size={16} />Your password has been set. You can now sign in with your email and new password.</p>
        <button className="lime-button login-button" onClick={onDone}>Continue to sign in <ArrowUpRight size={18} /></button>
      </div>
      <footer className="login-footer"><span>{agencyName}</span><span>01 / Access</span></footer>
    </main>;
  }

  return <main className="login-page">
    <header className="login-header"><img src={logoSrc} alt={agencyName} /><span>Internal access</span></header>
    <div className="login-rule" />
    <section className="login-intro"><p className="eyebrow">{agencyName} / 01</p><h1>Set your<br /><em>password.</em></h1><span className="lime-line" /></section>
    <form className="login-form" onSubmit={submit}>
      <div className="form-heading"><span>Create password</span><ShieldCheck size={18} /></div>
      <p className="auth-message" style={{ color: 'var(--text-muted, #6b7280)' }}><Mail size={16} />{email ? `Welcome, ${email}.` : 'Welcome.'} Choose a password to finish setting up your account.</p>
      <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      <label>Confirm password<div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Re-enter your password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}
      <button className="lime-button login-button" disabled={loading}>{loading ? 'Saving…' : <>Set password <ArrowUpRight size={18} /></>}</button>
    </form>
    <footer className="login-footer"><span>{agencyName}</span><span>01 / Access</span></footer>
  </main>;
}

function InviteError({ agencyBranding }: { agencyBranding?: { agency_name: string; logo_url: string | null } }) {
  const agencyName = agencyBranding?.agency_name || 'Taha Media';
  const logoSrc = agencyBranding?.logo_url || '/taha_logo.png';
  return <main className="login-page">
    <header className="login-header"><img src={logoSrc} alt={agencyName} /><span>Internal access</span></header>
    <div className="login-rule" />
    <section className="login-intro"><p className="eyebrow">{agencyName} / 01</p><h1>Link<br /><em>expired.</em></h1><span className="lime-line" /></section>
    <div className="login-form">
      <div className="form-heading"><span>Invalid invitation</span><CircleAlert size={18} /></div>
      <p className="auth-message"><CircleAlert size={16} />This invitation link has expired or is no longer valid. Invitation links expire after 24 hours for security.</p>
      <p className="auth-message" style={{ color: 'var(--text-muted, #6b7280)' }}><Mail size={16} />Please ask your workspace administrator to send you a new invitation from the Team management page.</p>
      <a className="lime-button login-button" href={window.location.origin}>Go to sign in <ArrowUpRight size={18} /></a>
    </div>
    <footer className="login-footer"><span>{agencyName}</span><span>01 / Access</span></footer>
  </main>;
}

function Workspace({
  profile,
  agencyBranding,
  onAgencyBrandingChange,
}: {
  profile: Profile;
  agencyBranding: { agency_name: string; logo_url: string | null };
  onAgencyBrandingChange: (b: { agency_name: string; logo_url: string | null }) => void;
}) {
  const isAdmin = profile.role === 'admin';
  const allowedPages = useMemo<Page[]>(() => (
    isAdmin
      ? ['dashboard', 'leads', 'clients', 'unqualified_leads', 'deleted_leads', 'finance', 'team', 'settings']
      : ['dashboard', 'leads', 'clients']
  ), [isAdmin]);

  const [page, setPage] = useState<Page>('dashboard');
  const [leadQuickFilter, setLeadQuickFilter] = useState<LeadQuickFilter>('all');

  // Direct navigation / state protection guard
  useEffect(() => {
    if (!allowedPages.includes(page)) {
      setPage('dashboard');
    }
  }, [page, allowedPages]);

  const [mobileNav, setMobileNav] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showConverted, setShowConverted] = useState(false);

  // Call Logs for the selected lead
  const [callLogs, setCallLogs] = useState<LeadCallLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Active leads exclude deleted AND unqualified leads
  const activeLeads = useMemo(() => leads.filter((l) => !l.deleted_at && l.status !== 'unqualified' && l.qualification_status !== 'unqualified'), [leads]);
  const deletedLeads = useMemo(() => leads.filter((l) => Boolean(l.deleted_at)), [leads]);
  const unqualifiedLeads = useMemo(() => leads.filter((l) => !l.deleted_at && (l.status === 'unqualified' || l.qualification_status === 'unqualified')), [leads]);

  const loadData = async () => {
    setLoading(true); setDataError('');
    const leadsQuery = isAdmin
      ? supabase.from('leads').select('*').order('received_at', { ascending: false })
      : supabase.from('leads').select('*').eq('assigned_to', profile.id).order('received_at', { ascending: false });

    const clientsQuery = isAdmin
      ? supabase.from('clients').select('*').order('created_at', { ascending: false })
      : supabase.from('clients').select('*').eq('assigned_to', profile.id).order('created_at', { ascending: false });

    const profilesQuery = supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('is_active', true)
      .order('full_name');

    const [leadResult, profileResult, clientResult] = await Promise.all([
      leadsQuery,
      profilesQuery,
      clientsQuery,
    ]);
    if (leadResult.error || profileResult.error || clientResult.error) setDataError(friendlyError());
    else {
      setLeads((leadResult.data ?? []) as Lead[]);
      setProfiles((profileResult.data ?? []) as Profile[]);
      setClients((clientResult.data ?? []) as Client[]);
    }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, [profile.id, isAdmin]);

  const loadCallLogs = async (leadId: string) => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from('lead_call_logs')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setCallLogs(data as LeadCallLog[]);
    }
    setLoadingLogs(false);
  };

  useEffect(() => {
    if (selectedLead) {
      loadCallLogs(selectedLead.id);
    } else {
      setCallLogs([]);
    }
  }, [selectedLead?.id]);

  const saveLead = async (form: LeadForm, id?: string) => {
    const assignedTo = isAdmin ? form.assigned_to : profile.id;
    const payload = { ...form, email: form.email || null, service: form.service || 'Not specified', assigned_to: assignedTo };
    const result = id ? await supabase.from('leads').update(payload).eq('id', id).select().maybeSingle() : await supabase.from('leads').insert(payload).select().maybeSingle();
    if (result.error || !result.data) throw new Error(friendlyError());
    await loadData(); setSelectedLead(result.data as Lead); setShowAdd(false);
  };

  const deleteLead = async (id: string) => {
    if (!isAdmin) throw new Error('Only administrators can delete leads.');
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('leads')
      .update({ deleted_at: now, deleted_by: profile.id })
      .eq('id', id);
    if (error) throw new Error(friendlyError());
    await loadData();
    setSelectedLead(null);
  };

  const restoreLead = async (id: string) => {
    if (!isAdmin) throw new Error('Only administrators can restore leads.');
    const { error } = await supabase
      .from('leads')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id);
    if (error) throw new Error(friendlyError());
    await loadData();
  };

  const saveCallLog = async (
    leadId: string,
    logPayload: Omit<LeadCallLog, 'id' | 'created_at' | 'salesperson_id' | 'lead_id'>,
    leadUpdates: Partial<Lead>
  ) => {
    // 1. Mark previous pending follow-ups as superseded (or cancelled if unqualified)
    const newFollowUpStatus = logPayload.qualification_result === 'unqualified' ? 'cancelled' : 'superseded';
    await supabase
      .from('lead_call_logs')
      .update({ follow_up_status: newFollowUpStatus })
      .eq('lead_id', leadId)
      .eq('follow_up_status', 'pending');

    // 2. Insert new call log
    const { error: logErr } = await supabase
      .from('lead_call_logs')
      .insert({
        lead_id: leadId,
        salesperson_id: profile.id,
        ...logPayload,
      });

    if (logErr) throw new Error(logErr.message || friendlyError());

    // 3. Update lead record
    const { data: updatedLead, error: leadErr } = await supabase
      .from('leads')
      .update(leadUpdates)
      .eq('id', leadId)
      .select()
      .maybeSingle();

    if (leadErr || !updatedLead) throw new Error(leadErr?.message || friendlyError());

    // 4. Reload data
    await loadData();
    setSelectedLead(updatedLead as Lead);
    await loadCallLogs(leadId);
  };

  const convertLead = async (leadId: string, leadForm: LeadForm, clientData: { company_name: string }) => {
    const { data: existing } = await supabase.from('clients').select('id').eq('lead_id', leadId).maybeSingle();
    if (existing) throw new Error('This lead has already been converted to a client.');
    const assignedTo = isAdmin ? leadForm.assigned_to : profile.id;
    const clientPayload = {
      name: leadForm.name,
      company_name: clientData.company_name || null,
      phone: leadForm.phone,
      email: leadForm.email || null,
      service: leadForm.service || 'Not specified',
      source: leadForm.source,
      assigned_to: assignedTo,
      status: 'active' as const,
      lead_id: leadId,
      notes: leadForm.notes,
    };
    const { data: client, error: clientErr } = await supabase.from('clients').insert(clientPayload).select().maybeSingle();
    if (clientErr || !client) throw new Error(friendlyError());
    const leadPayload = { ...leadForm, email: leadForm.email || null, service: leadForm.service || 'Not specified', assigned_to: assignedTo };
    const { error: leadErr } = await supabase.from('leads').update(leadPayload).eq('id', leadId);
    if (leadErr) throw new Error(friendlyError());
    await loadData();
    setSelectedLead(null);
    setShowAdd(false);
  };

  const saveClient = async (form: ClientForm, id?: string) => {
    const assignedTo = isAdmin ? form.assigned_to : profile.id;
    const payload = {
      name: form.name.trim(),
      company_name: form.company_name?.trim() || null,
      phone: form.phone.trim(),
      email: form.email?.trim() || null,
      service: form.service?.trim() || 'Not specified',
      source: form.source,
      assigned_to: assignedTo,
      status: form.status,
      notes: form.notes || '',
    };
    const result = id
      ? await supabase.from('clients').update(payload).eq('id', id).select().maybeSingle()
      : await supabase.from('clients').insert({ ...payload, lead_id: null }).select().maybeSingle();
    if (result.error || !result.data) throw new Error(friendlyError());
    await loadData();
    setSelectedClient(result.data as Client);
    setShowAddClient(false);
  };

  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);

  const handleNavigate = (targetPage: Page) => {
    if (page === 'settings' && hasUnsavedSettings && targetPage !== 'settings') {
      const confirmLeave = window.confirm('You have unsaved changes in Agency Settings. Are you sure you want to leave without saving?');
      if (!confirmLeave) return;
    }
    setPage(targetPage);
    setMobileNav(false);
  };

  const handleNavigateToLeads = (filter: LeadQuickFilter = 'all') => {
    if (page === 'settings' && hasUnsavedSettings) {
      const confirmLeave = window.confirm('You have unsaved changes in Agency Settings. Are you sure you want to leave without saving?');
      if (!confirmLeave) return;
    }
    setLeadQuickFilter(filter);
    setPage('leads');
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand-lockup"><img src={agencyBranding.logo_url || '/taha_logo.png'} alt={agencyBranding.agency_name} /><span>Internal workspace</span></div>
      <nav>
        <p className="nav-label">Workspace</p>
        {navItems.filter((item) => allowedPages.includes(item.id)).map(({ id, label, icon: Icon }) => (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => handleNavigate(id)}>
            <Icon size={18} />
            <span>{label}</span>
            {id === 'leads' && activeLeads.length > 0 && <b>{activeLeads.length}</b>}
            {id === 'unqualified_leads' && unqualifiedLeads.length > 0 && <b>{unqualifiedLeads.length}</b>}
            {id === 'deleted_leads' && deletedLeads.length > 0 && <b>{deletedLeads.length}</b>}
            {id === 'clients' && clients.length > 0 && <b>{clients.length}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</div><div><strong>{profile.full_name}</strong><span>{profile.role.split('_').join(' ')}</span></div><ChevronDown size={16} /></div><button className="signout" onClick={signOut}><LogOut size={17} /> Sign out</button></div>
    </aside>
    {mobileNav && <button className="mobile-overlay" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
        <div className="breadcrumb"><span>{agencyBranding.agency_name}</span><i>/</i><strong>{navItems.find((item) => item.id === page)?.label}</strong></div>
        <div className="topbar-actions"><span className="date-label"><CalendarDays size={16} /> {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><button className="icon-button"><Bell size={18} /><i /></button><div className="top-avatar">{profile.full_name.slice(0, 1).toUpperCase()}</div></div>
      </header>
      {page === 'dashboard' && <Dashboard leads={activeLeads} profiles={profiles} clients={clients} profile={profile} onOpenLeads={() => handleNavigateToLeads('all')} onOpenClients={() => handleNavigate('clients')} onAdd={() => setShowAdd(true)} onOpenConverted={() => setShowConverted(true)} onOpenClient={(c) => setSelectedClient(c)} onNavigateFilteredLeads={handleNavigateToLeads} />}
      {page === 'leads' && <LeadsPage leads={activeLeads} profiles={profiles} profile={profile} loading={loading} error={dataError} onRetry={loadData} onAdd={() => setShowAdd(true)} onSelect={setSelectedLead} quickFilter={leadQuickFilter} onQuickFilterChange={setLeadQuickFilter} deletedCount={deletedLeads.length} unqualifiedCount={unqualifiedLeads.length} onOpenDeleted={() => handleNavigate('deleted_leads')} onOpenUnqualified={() => handleNavigate('unqualified_leads')} onOpenConverted={() => setShowConverted(true)} />}
      {page === 'clients' && <ClientsPage clients={clients} profiles={profiles} profile={profile} loading={loading} error={dataError} onRetry={loadData} onAdd={() => setShowAddClient(true)} onSelect={setSelectedClient} />}
      {isAdmin && page === 'unqualified_leads' && <UnqualifiedLeadsPage leads={unqualifiedLeads} profiles={profiles} profile={profile} loading={loading} error={dataError} onRetry={loadData} onSelect={setSelectedLead} />}
      {isAdmin && page === 'deleted_leads' && <DeletedLeadsPage leads={deletedLeads} profiles={profiles} profile={profile} loading={loading} error={dataError} onRetry={loadData} onRestore={restoreLead} />}
      {isAdmin && page === 'team' && <TeamPage profile={profile} />}
      {isAdmin && page === 'finance' && <PlaceholderPage page="finance" />}
      {isAdmin && page === 'settings' && (
        <SettingsPage
          profile={profile}
          onDirtyChange={setHasUnsavedSettings}
          onAgencyBrandingChange={onAgencyBrandingChange}
        />
      )}
    </main>
    {showAdd && <LeadModal profiles={profiles} profile={profile} onClose={() => setShowAdd(false)} onSave={(form) => saveLead(form)} />}
    {showAddClient && <ClientModal profiles={profiles} profile={profile} onClose={() => setShowAddClient(false)} onSave={(form) => saveClient(form)} />}
    {selectedLead && (
      <LeadDetail
        lead={selectedLead}
        profiles={profiles}
        profile={profile}
        callLogs={callLogs}
        loadingLogs={loadingLogs}
        onClose={() => setSelectedLead(null)}
        onSave={(form) => saveLead(form, selectedLead.id)}
        onSaveCallLog={(logPayload, leadUpdates) => saveCallLog(selectedLead.id, logPayload, leadUpdates)}
        onConvert={(form, clientData) => convertLead(selectedLead.id, form, clientData)}
        onDelete={isAdmin ? deleteLead : undefined}
      />
    )}
    {selectedClient && <ClientDetail client={selectedClient} profiles={profiles} profile={profile} onClose={() => setSelectedClient(null)} onSave={(form) => saveClient(form, selectedClient.id)} />}
    {showConverted && <ConvertedLeadsView leads={activeLeads.filter((l) => l.status === 'converted')} clients={clients} profiles={profiles} onClose={() => setShowConverted(false)} onOpenClient={(c) => { setShowConverted(false); setSelectedClient(c); }} />}
  </div>;
}

function Dashboard({
  leads,
  profiles,
  clients,
  profile,
  onOpenLeads,
  onOpenClients,
  onAdd,
  onOpenConverted,
  onOpenClient,
  onNavigateFilteredLeads,
}: {
  leads: Lead[];
  profiles: Profile[];
  clients: Client[];
  profile: Profile;
  onOpenLeads: () => void;
  onOpenClients: () => void;
  onAdd: () => void;
  onOpenConverted: () => void;
  onOpenClient: (client: Client) => void;
  onNavigateFilteredLeads: (filter: LeadQuickFilter) => void;
}) {
  const isAdmin = profile.role === 'admin';
  const convertedLeads = leads.filter((lead) => lead.status === 'converted');
  const todayCount = leads.filter((lead) => isReceivedToday(lead.received_at)).length;
  const activeCount = leads.filter((lead) => ['new', 'contacted', 'follow_up'].includes(lead.status)).length;
  const followUpCount = leads.filter(isFollowUpDue).length;

  const metrics = [
    {
      label: "Today's new leads",
      value: todayCount,
      note: 'Received since midnight',
      icon: Sparkles,
      onClick: () => onNavigateFilteredLeads('today'),
    },
    {
      label: 'Total active leads',
      value: activeCount,
      note: 'New, contacted & follow-up',
      icon: Target,
      onClick: () => onNavigateFilteredLeads('active'),
    },
    {
      label: 'Follow-ups due',
      value: followUpCount,
      note: 'Scheduled & awaiting call',
      icon: Clock3,
      onClick: () => onNavigateFilteredLeads('follow_ups'),
    },
    {
      label: 'Converted leads',
      value: convertedLeads.length,
      note: `${leads.length ? Math.round((convertedLeads.length / leads.length) * 100) : 0}% conversion rate`,
      icon: Check,
      onClick: () => onNavigateFilteredLeads('converted'),
    },
  ];

  const sourcesList = ['Meta Ads', 'Referral', 'Phone Call', 'Other'].map((source) => ({ source, count: leads.filter((lead) => lead.source === source).length }));
  const weekdayName = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date());

  return <div className="page-content">
    <div className="page-title-row">
      <div>
        <p className="eyebrow">{weekdayName} / {isAdmin ? 'Command centre' : 'Sales command centre'}</p>
        <h1>Good morning, {profile.full_name.split(' ')[0] || 'team'}.</h1>
        <p className="subtitle">{isAdmin ? 'A clear view of what needs to move today.' : 'A clear view of your active opportunities and follow-ups.'}</p>
      </div>
      <button className="lime-button" onClick={onAdd}><CirclePlus size={18} /> Add new lead</button>
    </div>

    <section className="metric-grid">
      {metrics.map(({ label, value, note, icon: Icon, onClick }, index) => (
        <div
          className={`metric metric-${index} metric-clickable`}
          key={label}
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        >
          <div className="metric-top"><span>{label}</span><Icon size={17} /></div>
          <strong>{value}</strong>
          <small>{note}</small>
          <span className="metric-hint">Click to view leads <ArrowUpRight size={12} /></span>
        </div>
      ))}
    </section>

    <div className="dashboard-grid">
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Live pulse</p><h2>Recent lead activity</h2></div>
          <button className="text-button" onClick={onOpenLeads}>View all <ArrowUpRight size={15} /></button>
        </div>
        {leads.length === 0 ? <EmptyState compact /> : (
          <div className="activity-list">
            {leads.slice(0, 5).map((lead) => (
              <div className="activity-row" key={lead.id}>
                <div className={`status-dot ${lead.status}`} />
                <div className="activity-copy">
                  <strong>{lead.name}</strong>
                  <span>{lead.service} <i>·</i> {lead.source}</span>
                </div>
                <div className="activity-time">
                  <span className={`status-pill ${lead.status}`}>{statusLabel(lead.status)}</span>
                  <small>{formatReceived(lead.received_at)}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel sources-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Acquisition</p><h2>Lead sources</h2></div>
          <SlidersHorizontal size={18} />
        </div>
        <div className="source-list">
          {sourcesList.map(({ source, count }) => (
            <div className="source-row" key={source}>
              <div><span className="source-mark" /> <strong>{source}</strong></div>
              <span>{count.toString().padStart(2, '0')}</span>
            </div>
          ))}
        </div>
        <div className="source-footer">
          <span>Meta Ads is locked for automatic leads</span>
          <span className="prepared">Prepared <Check size={13} /></span>
        </div>
      </section>
    </div>

    <section className="lower-strip">
      <div>
        <p className="eyebrow">Next move</p>
        <h2>Keep every conversation moving forward.</h2>
      </div>
      <button className="outline-button" onClick={onOpenLeads}>Open lead management <ArrowUpRight size={16} /></button>
    </section>
  </div>;
}

function LeadsPage({
  leads,
  profiles,
  profile,
  loading,
  error,
  onRetry,
  onAdd,
  onSelect,
  quickFilter,
  onQuickFilterChange,
  deletedCount = 0,
  unqualifiedCount = 0,
  onOpenDeleted,
  onOpenUnqualified,
  onOpenConverted,
}: {
  leads: Lead[];
  profiles: Profile[];
  profile: Profile;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onAdd: () => void;
  onSelect: (lead: Lead) => void;
  quickFilter: LeadQuickFilter;
  onQuickFilterChange: (filter: LeadQuickFilter) => void;
  deletedCount?: number;
  unqualifiedCount?: number;
  onOpenDeleted?: () => void;
  onOpenUnqualified?: () => void;
  onOpenConverted?: () => void;
}) {
  const isAdmin = profile.role === 'admin';
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('All sources');
  const [status, setStatus] = useState('All statuses');
  const [assignee, setAssignee] = useState('All owners');

  const filterCounts = useMemo(() => ({
    all: leads.length,
    today: leads.filter((l) => isReceivedToday(l.received_at)).length,
    active: leads.filter((l) => ['new', 'contacted', 'follow_up'].includes(l.status)).length,
    follow_ups: leads.filter(isFollowUpDue).length,
    converted: leads.filter((l) => l.status === 'converted').length,
  }), [leads]);

  const filtered = useMemo(() => leads.filter((lead) => {
    const matchesQuery = [lead.name, lead.phone, lead.email ?? '', lead.service].join(' ').toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (source !== 'All sources' && lead.source !== source) return false;
    if (status !== 'All statuses' && lead.status !== status) return false;
    if (assignee !== 'All owners' && lead.assigned_to !== assignee) return false;

    if (quickFilter === 'today') {
      if (!isReceivedToday(lead.received_at)) return false;
    } else if (quickFilter === 'active') {
      if (!['new', 'contacted', 'follow_up'].includes(lead.status)) return false;
    } else if (quickFilter === 'follow_ups') {
      if (!isFollowUpDue(lead)) return false;
    } else if (quickFilter === 'converted') {
      if (lead.status !== 'converted') return false;
    }

    return true;
  }), [leads, query, source, status, assignee, quickFilter]);

  return <div className="page-content">
    <div className="page-title-row leads-title">
      <div>
        <p className="eyebrow">Pipeline / {leads.length.toString().padStart(2, '0')} active records</p>
        <h1>Lead management</h1>
        <p className="subtitle">{isAdmin ? 'Every opportunity, clearly accounted for.' : 'Your assigned opportunities, clearly accounted for.'}</p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {isAdmin && onOpenUnqualified && unqualifiedCount > 0 && (
          <button className="outline-button" onClick={onOpenUnqualified}>
            <Ban size={15} /> Unqualified ({unqualifiedCount})
          </button>
        )}
        {isAdmin && onOpenDeleted && deletedCount > 0 && (
          <button className="outline-button" onClick={onOpenDeleted}>
            <Trash2 size={15} /> Deleted leads ({deletedCount})
          </button>
        )}
        {quickFilter === 'converted' && onOpenConverted && (
          <button className="outline-button" onClick={onOpenConverted}>
            <TrendingUp size={16} /> Converted client links
          </button>
        )}
        <button className="lime-button" onClick={onAdd}><CirclePlus size={18} /> Add new lead</button>
      </div>
    </div>

    <div className="quick-filters">
      <button
        type="button"
        className={`quick-filter-pill ${quickFilter === 'all' ? 'active' : ''}`}
        onClick={() => onQuickFilterChange('all')}
      >
        All records <b>{filterCounts.all}</b>
      </button>
      <button
        type="button"
        className={`quick-filter-pill ${quickFilter === 'today' ? 'active' : ''}`}
        onClick={() => onQuickFilterChange('today')}
      >
        Today's new <b>{filterCounts.today}</b>
      </button>
      <button
        type="button"
        className={`quick-filter-pill ${quickFilter === 'active' ? 'active' : ''}`}
        onClick={() => onQuickFilterChange('active')}
      >
        Active leads <b>{filterCounts.active}</b>
      </button>
      <button
        type="button"
        className={`quick-filter-pill ${quickFilter === 'follow_ups' ? 'active' : ''}`}
        onClick={() => onQuickFilterChange('follow_ups')}
      >
        Follow-ups due <b>{filterCounts.follow_ups}</b>
      </button>
      <button
        type="button"
        className={`quick-filter-pill ${quickFilter === 'converted' ? 'active' : ''}`}
        onClick={() => onQuickFilterChange('converted')}
      >
        Converted <b>{filterCounts.converted}</b>
      </button>

      {quickFilter !== 'all' && (
        <button
          type="button"
          className="filter-reset-link"
          onClick={() => onQuickFilterChange('all')}
        >
          <X size={13} /> Clear filter
        </button>
      )}
    </div>

    <div className="filter-bar">
      <div className="search-box">
        <Search size={18} />
        <input placeholder="Search leads" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="filter-select">
        <Filter size={16} />
        <select value={source} onChange={(event) => setSource(event.target.value)}>
          {sources.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="filter-select">
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option>All statuses</option>
          {statuses.filter(s => s !== 'unqualified').map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
        </select>
      </div>
      {isAdmin && (
        <div className="filter-select owner-filter">
          <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option>All owners</option>
            {profiles.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
          </select>
        </div>
      )}
    </div>

    {error ? (
      <div className="data-state">
        <CircleAlert size={22} />
        <h3>We couldn't load your leads</h3>
        <p>Check your connection and try again.</p>
        <button className="outline-button" onClick={onRetry}>Try again</button>
      </div>
    ) : loading ? (
      <div className="data-state"><div className="spinner" /><p>Loading your leads…</p></div>
    ) : filtered.length === 0 ? (
      <EmptyState onAdd={onAdd} />
    ) : (
      <div className="lead-table-wrap">
        <table className="lead-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Source</th>
              <th>Interest</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Next Follow-up</th>
              <th>Received</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => {
              const due = isFollowUpDue(lead);
              const followUpText = formatFollowUpTime(lead.next_follow_up_at, lead.follow_up_date);
              return (
                <tr key={lead.id} onClick={() => onSelect(lead)}>
                  <td>
                    <div className="table-person">
                      <div className="small-avatar">{lead.name.slice(0, 1).toUpperCase()}</div>
                      <div>
                        <strong>{lead.name}</strong>
                        <span>{lead.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="source-tag">
                      {lead.meta_lead_id ? <Lock size={11} style={{ marginRight: 2 }} /> : <i />}
                      {lead.source}
                    </span>
                  </td>
                  <td>{lead.service}</td>
                  <td>{profiles.find((person) => person.id === lead.assigned_to)?.full_name || <span className="muted">Unassigned</span>}</td>
                  <td><span className={`status-pill ${lead.status}`}>{statusLabel(lead.status)}</span></td>
                  <td>
                    {followUpText !== 'None' ? (
                      <span className={`status-pill ${due ? 'follow_up' : ''}`} style={due ? { fontWeight: 700 } : undefined}>
                        <Clock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                        {followUpText}
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td>{formatReceived(lead.received_at)}</td>
                  <td><button className="row-action" aria-label={`Open ${lead.name}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>;
}

function UnqualifiedLeadsPage({
  leads,
  profiles,
  profile,
  loading,
  error,
  onRetry,
  onSelect,
}: {
  leads: Lead[];
  profiles: Profile[];
  profile: Profile;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSelect: (lead: Lead) => void;
}) {
  const [query, setQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState('All reasons');

  const filtered = useMemo(() => leads.filter((lead) => {
    const matchesQuery = [lead.name, lead.phone, lead.email ?? '', lead.service, lead.unqualified_reason ?? ''].join(' ').toLowerCase().includes(query.toLowerCase());
    const matchesReason = reasonFilter === 'All reasons' || lead.unqualified_reason === reasonFilter;
    return matchesQuery && matchesReason;
  }), [leads, query, reasonFilter]);

  return <div className="page-content">
    <div className="page-title-row leads-title">
      <div>
        <p className="eyebrow">Archive / {leads.length.toString().padStart(2, '0')} unqualified leads</p>
        <h1>Unqualified leads</h1>
        <p className="subtitle">
          Leads marked as unqualified during phone calls. Complete call records, reasons, and notes are preserved.
        </p>
      </div>
    </div>

    <div className="filter-bar">
      <div className="search-box">
        <Search size={18} />
        <input placeholder="Search unqualified leads" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="filter-select">
        <Filter size={16} />
        <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
          <option>All reasons</option>
          {unqualifiedReasonOptions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
    </div>

    {error ? (
      <div className="data-state">
        <CircleAlert size={22} />
        <h3>We couldn't load unqualified leads</h3>
        <p>Check your connection and try again.</p>
        <button className="outline-button" onClick={onRetry}>Try again</button>
      </div>
    ) : loading ? (
      <div className="data-state"><div className="spinner" /><p>Loading unqualified leads…</p></div>
    ) : filtered.length === 0 ? (
      <div className="data-state">
        <div className="empty-icon"><Ban size={22} /></div>
        <h3>{leads.length === 0 ? 'No unqualified leads' : 'No matching records found'}</h3>
        <p>{leads.length === 0 ? 'Leads classified as unqualified by salespeople will appear here for audit.' : 'Try adjusting your search terms.'}</p>
      </div>
    ) : (
      <div className="lead-table-wrap">
        <table className="lead-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Source</th>
              <th>Service</th>
              <th>Salesperson</th>
              <th>Unqualified Reason</th>
              <th>Date Unqualified</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => {
              const assigneeName = profiles.find((p) => p.id === lead.assigned_to)?.full_name || 'Unassigned';
              return (
                <tr key={lead.id} onClick={() => onSelect(lead)}>
                  <td>
                    <div className="table-person">
                      <div className="small-avatar" style={{ background: '#f5f5f4', color: '#78716c' }}>
                        {lead.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <strong>{lead.name}</strong>
                        <span>{lead.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="source-tag">
                      {lead.meta_lead_id ? <Lock size={11} style={{ marginRight: 2 }} /> : <i />}
                      {lead.source}
                    </span>
                  </td>
                  <td>{lead.service}</td>
                  <td>{assigneeName}</td>
                  <td>
                    <span className="status-pill unqualified">
                      {lead.unqualified_reason || 'Unqualified'}
                    </span>
                  </td>
                  <td><span className="muted">{formatReceived(lead.unqualified_at || lead.updated_at)}</span></td>
                  <td><button className="row-action" aria-label={`Open ${lead.name}`}><MoreHorizontal size={18} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>;
}

function DeletedLeadsPage({
  leads,
  profiles,
  profile,
  loading,
  error,
  onRetry,
  onRestore,
}: {
  leads: Lead[];
  profiles: Profile[];
  profile: Profile;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onRestore: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('All sources');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const filtered = useMemo(() => leads.filter((lead) => {
    const matchesQuery = [lead.name, lead.phone, lead.email ?? '', lead.service].join(' ').toLowerCase().includes(query.toLowerCase());
    const matchesSource = source === 'All sources' || lead.source === source;
    return matchesQuery && matchesSource;
  }), [leads, query, source]);

  const handleQuickRestore = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRestoringId(id);
    try {
      await onRestore(id);
    } catch {
      // handled in caller / state
    } finally {
      setRestoringId(null);
    }
  };

  return <div className="page-content">
    <div className="page-title-row leads-title">
      <div>
        <p className="eyebrow">Archive / {leads.length.toString().padStart(2, '0')} deleted records</p>
        <h1>Deleted leads</h1>
        <p className="subtitle">
          Admin archive of soft-deleted leads. Original contact info, Meta lead IDs, sources, and assignments are preserved.
        </p>
      </div>
    </div>

    <div className="filter-bar">
      <div className="search-box">
        <Search size={18} />
        <input placeholder="Search deleted leads" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="filter-select">
        <Filter size={16} />
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          {sources.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
    </div>

    {error ? (
      <div className="data-state">
        <CircleAlert size={22} />
        <h3>We couldn't load deleted leads</h3>
        <p>Check your connection and try again.</p>
        <button className="outline-button" onClick={onRetry}>Try again</button>
      </div>
    ) : loading ? (
      <div className="data-state"><div className="spinner" /><p>Loading deleted leads…</p></div>
    ) : filtered.length === 0 ? (
      <div className="data-state">
        <div className="empty-icon"><Trash2 size={22} /></div>
        <h3>{leads.length === 0 ? 'No deleted leads' : 'No matching records found'}</h3>
        <p>{leads.length === 0 ? 'Deleted leads will appear here for review and restoration.' : 'Try adjusting your search terms.'}</p>
      </div>
    ) : (
      <div className="lead-table-wrap">
        <table className="lead-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Source</th>
              <th>Interest</th>
              <th>Assigned to</th>
              <th>Deleted date</th>
              <th>Deleted by</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => {
              const deletedByName = profiles.find((p) => p.id === lead.deleted_by)?.full_name || 'Admin';
              const assigneeName = profiles.find((p) => p.id === lead.assigned_to)?.full_name || 'Unassigned';
              const isRestoring = restoringId === lead.id;
              return (
                <tr key={lead.id} onClick={() => setSelectedLead(lead)}>
                  <td>
                    <div className="table-person">
                      <div className="small-avatar" style={{ background: '#fae7e3', color: '#99544a' }}>
                        {lead.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <strong>{lead.name}</strong>
                        <span>{lead.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="source-tag">
                      {lead.meta_lead_id ? <Lock size={11} style={{ marginRight: 2 }} /> : <i />}
                      {lead.source}
                    </span>
                  </td>
                  <td>{lead.service}</td>
                  <td>{assigneeName}</td>
                  <td><span className="muted">{formatReceived(lead.deleted_at || lead.updated_at)}</span></td>
                  <td><span className="muted">{deletedByName}</span></td>
                  <td>
                    <button
                      className="restore-pill-button"
                      onClick={(e) => handleQuickRestore(e, lead.id)}
                      disabled={isRestoring}
                    >
                      <RotateCcw size={13} /> {isRestoring ? 'Restoring…' : 'Restore'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    {selectedLead && (
      <DeletedLeadDetail
        lead={selectedLead}
        profiles={profiles}
        onClose={() => setSelectedLead(null)}
        onRestore={async (id) => {
          await onRestore(id);
          setSelectedLead(null);
        }}
      />
    )}
  </div>;
}

function DeletedLeadDetail({
  lead,
  profiles,
  onClose,
  onRestore,
}: {
  lead: Lead;
  profiles: Profile[];
  onClose: () => void;
  onRestore: (id: string) => Promise<void>;
}) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const deletedByName = profiles.find((p) => p.id === lead.deleted_by)?.full_name || 'Admin';
  const assigneeName = profiles.find((p) => p.id === lead.assigned_to)?.full_name || 'Unassigned';

  const handleRestore = async () => {
    setRestoring(true);
    setError('');
    try {
      await onRestore(lead.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : friendlyError());
      setRestoring(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !restoring) onClose(); }}>
      <section className="lead-drawer">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Archived lead record</p>
            <h2>{lead.name}</h2>
          </div>
          <button className="close-button" onClick={onClose} disabled={restoring}><X size={20} /></button>
        </div>
        <div className="client-detail-view">
          <div className="deleted-banner">
            <Trash2 size={18} />
            <div>
              <strong>This lead is soft-deleted</strong>
              <p style={{ margin: '4px 0 0' }}>
                Deleted on {lead.deleted_at ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(lead.deleted_at)) : 'N/A'} by {deletedByName}.
                It is excluded from regular pipelines and dashboard metrics.
              </p>
            </div>
          </div>

          <div className="client-detail-grid">
            <div className="client-detail-row">
              <span><Phone size={14} /> Phone</span>
              <strong>{lead.phone}</strong>
            </div>
            <div className="client-detail-row">
              <span><Mail size={14} /> Email</span>
              <strong>{lead.email || <span className="muted">Not provided</span>}</strong>
            </div>
            <div className="client-detail-row">
              <span><Target size={14} /> Service</span>
              <strong>{lead.service}</strong>
            </div>
            <div className="client-detail-row">
              <span><Tag size={14} /> Lead source</span>
              <strong>
                {lead.source} {lead.meta_lead_id && <span className="locked-badge" style={{ marginLeft: 6 }}>Meta Locked</span>}
              </strong>
            </div>
            <div className="client-detail-row">
              <span><UserRound size={14} /> Salesperson</span>
              <strong>{assigneeName}</strong>
            </div>
            <div className="client-detail-row">
              <span><CalendarDays size={14} /> Received</span>
              <strong>{formatReceived(lead.received_at)}</strong>
            </div>
            <div className="client-detail-row">
              <span><Sparkles size={14} /> Status before deletion</span>
              <strong><span className={`status-pill ${lead.status}`}>{statusLabel(lead.status)}</span></strong>
            </div>
            {lead.next_follow_up_at && (
              <div className="client-detail-row">
                <span><Clock3 size={14} /> Follow-up time</span>
                <strong>{formatFollowUpTime(lead.next_follow_up_at)}</strong>
              </div>
            )}
            {lead.meta_lead_id && (
              <div className="client-detail-row" style={{ gridColumn: '1 / -1' }}>
                <span><Lock size={14} /> Meta Lead ID</span>
                <code style={{ fontSize: 12, color: '#4a5147' }}>{lead.meta_lead_id}</code>
              </div>
            )}
          </div>

          {lead.notes && (
            <div className="client-detail-notes">
              <p className="eyebrow">Internal notes</p>
              <p>{lead.notes}</p>
            </div>
          )}

          {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}

          <div className="drawer-footer">
            <button className="outline-button" onClick={onClose} disabled={restoring}>Close</button>
            <button className="lime-button" onClick={handleRestore} disabled={restoring}>
              <RotateCcw size={16} /> {restoring ? 'Restoring…' : 'Restore lead'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ compact = false, onAdd }: { compact?: boolean; onAdd?: () => void }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}>
    <div className="empty-icon"><Target size={22} /></div>
    <h3>{compact ? 'No activity yet' : 'Your pipeline is clear'}</h3>
    <p>{compact ? 'New lead activity will appear here.' : 'Add your first lead to start building momentum.'}</p>
    {!compact && onAdd && <button className="lime-button" onClick={onAdd}><CirclePlus size={17} /> Add a lead</button>}
  </div>;
}

function LeadModal({ profiles, profile, onClose, onSave }: { profiles: Profile[]; profile: Profile; onClose: () => void; onSave: (form: LeadForm) => Promise<void> }) {
  const initial: LeadForm = { ...emptyForm, assigned_to: profile.role === 'admin' ? null : profile.id };
  return <LeadEditor title="Add a new lead" profiles={profiles} profile={profile} initial={initial} onClose={onClose} onSave={onSave} />;
}

function LeadDetail({
  lead,
  profiles,
  profile,
  callLogs = [],
  loadingLogs = false,
  onClose,
  onSave,
  onSaveCallLog,
  onConvert,
  onDelete,
}: {
  lead: Lead;
  profiles: Profile[];
  profile: Profile;
  callLogs?: LeadCallLog[];
  loadingLogs?: boolean;
  onClose: () => void;
  onSave: (form: LeadForm) => Promise<void>;
  onSaveCallLog: (logPayload: Omit<LeadCallLog, 'id' | 'created_at' | 'salesperson_id' | 'lead_id'>, leadUpdates: Partial<Lead>) => Promise<void>;
  onConvert: (form: LeadForm, clientData: { company_name: string }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const initial: LeadForm = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    service: lead.service,
    assigned_to: lead.assigned_to,
    status: lead.status,
    follow_up_date: lead.follow_up_date,
    notes: lead.notes,
  };

  return <LeadEditor
    title="Lead details"
    profiles={profiles}
    profile={profile}
    initial={initial}
    lead={lead}
    callLogs={callLogs}
    loadingLogs={loadingLogs}
    onClose={onClose}
    onSave={onSave}
    onSaveCallLog={onSaveCallLog}
    onConvert={onConvert}
    onDelete={onDelete}
    detail
  />;
}

function LeadEditor({
  title,
  profiles,
  profile,
  initial,
  lead,
  callLogs = [],
  loadingLogs = false,
  onClose,
  onSave,
  onSaveCallLog,
  onConvert,
  onDelete,
  detail = false,
}: {
  title: string;
  profiles: Profile[];
  profile: Profile;
  initial: LeadForm;
  lead?: Lead;
  callLogs?: LeadCallLog[];
  loadingLogs?: boolean;
  onClose: () => void;
  onSave: (form: LeadForm) => Promise<void>;
  onSaveCallLog?: (logPayload: Omit<LeadCallLog, 'id' | 'created_at' | 'salesperson_id' | 'lead_id'>, leadUpdates: Partial<Lead>) => Promise<void>;
  onConvert?: (form: LeadForm, clientData: { company_name: string }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  detail?: boolean;
}) {
  const isMetaLead = Boolean(lead?.meta_lead_id);
  const isAdmin = profile.role === 'admin';

  const [form, setForm] = useState<LeadForm>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [showCompleteClient, setShowCompleteClient] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [converting, setConverting] = useState(false);

  // Call workflow wizard modal state
  const [callWorkflowMode, setCallWorkflowMode] = useState<'outgoing' | 'incoming' | null>(null);

  const update = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    // Lock source to 'Meta Ads' if received from Meta
    const formToSubmit = isMetaLead ? { ...form, source: 'Meta Ads' as const } : form;
    if (detail && initial.status !== 'converted' && formToSubmit.status === 'converted' && onConvert) {
      setShowConvertConfirm(true);
      setSaving(false);
      return;
    }
    try {
      await onSave(formToSubmit);
    } catch {
      setError(friendlyError());
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    setError('');
    try {
      const formToSubmit = isMetaLead ? { ...form, source: 'Meta Ads' as const } : form;
      await onConvert!(formToSubmit, { company_name: companyName });
      setShowCompleteClient(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : friendlyError());
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!lead?.id || !onDelete) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete(lead.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : friendlyError());
      setDeleting(false);
    }
  };

  const followUpScheduled = Boolean(lead?.next_follow_up_at || lead?.follow_up_date);
  const followUpDue = lead ? isFollowUpDue(lead) : false;

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !deleting) onClose(); }}>
    <section className="lead-drawer">
      <div className="drawer-header">
        <div>
          <p className="eyebrow">{detail ? 'Lead record' : 'New opportunity'}</p>
          <h2>{title}</h2>
        </div>
        <button className="close-button" onClick={onClose} disabled={saving || deleting}><X size={20} /></button>
      </div>

      {detail && lead && onSaveCallLog && (
        <div style={{ paddingTop: 20 }}>
          {/* Quick Call Action Buttons */}
          <div className="call-actions-row">
            <button
              type="button"
              className="call-btn-outgoing"
              onClick={() => setCallWorkflowMode('outgoing')}
            >
              <PhoneCall size={16} /> Log Call (Contacted)
            </button>
            <button
              type="button"
              className="call-btn-incoming"
              onClick={() => setCallWorkflowMode('incoming')}
            >
              <PhoneIncoming size={16} /> Lead Called Back
            </button>
          </div>

          {/* Active Follow-up Banner */}
          {followUpScheduled && lead.status !== 'unqualified' && (
            <div className={`followup-active-card ${followUpDue ? 'due' : ''}`}>
              <div className="followup-card-left">
                <Clock size={20} />
                <div>
                  <strong>{formatFollowUpTime(lead.next_follow_up_at, lead.follow_up_date)}</strong>
                  <span>{followUpDue ? 'Follow-up is currently due — call customer' : 'Next scheduled follow-up'}</span>
                </div>
              </div>
              <span className={`followup-pill-badge ${followUpDue ? 'due' : 'scheduled'}`}>
                {followUpDue ? 'Due Now' : 'Scheduled'}
              </span>
            </div>
          )}

          {/* Unqualified Banner if lead is unqualified */}
          {lead.status === 'unqualified' && (
            <div className="unqualified-warning">
              <Ban size={18} />
              <div>
                <strong>Unqualified Lead</strong>
                <span>Reason: {lead.unqualified_reason || 'Not specified'}. Removed from active sales pipeline.</span>
              </div>
            </div>
          )}
        </div>
      )}

      <form className="lead-form" onSubmit={submit} style={{ paddingTop: detail ? 8 : 28 }}>
        <div className="form-grid">
          <label>Full name<input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Ahmed Khan" required /></label>
          <label>Phone number<input value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+92 300 0000000" required /></label>
          <label>Email address<input type="email" value={form.email ?? ''} onChange={(event) => update('email', event.target.value)} placeholder="Optional" /></label>
          <label>Interested service<input value={form.service} onChange={(event) => update('service', event.target.value)} placeholder="e.g. Social media management" /></label>

          {isMetaLead ? (
            <div className="locked-field">
              <label>Lead source</label>
              <div className="locked-input">
                <Lock size={14} className="locked-icon" />
                <span>Meta Ads</span>
                <span className="locked-badge">Locked</span>
              </div>
              <small className="locked-helper">Automatically set by Meta Instant Form</small>
            </div>
          ) : (
            <label>
              Lead source
              <select value={form.source} onChange={(event) => update('source', event.target.value as Lead['source'])}>
                {sources.slice(1).map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          )}

          <label>
            Assigned salesperson
            {profile.role === 'admin' ? (
              <select value={form.assigned_to ?? ''} onChange={(event) => update('assigned_to', event.target.value || null)}>
                <option value="">Unassigned</option>
                {profiles.map((person) => <option value={person.id} key={person.id}>{person.full_name}</option>)}
              </select>
            ) : (
              <select value={profile.id} disabled>
                <option value={profile.id}>{profile.full_name} (You)</option>
              </select>
            )}
          </label>

          <label>
            Lead status
            <select value={form.status} onChange={(event) => update('status', event.target.value as Lead['status'])}>
              {statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </select>
          </label>

          <label>
            Follow-up date
            <input type="date" value={form.follow_up_date ?? ''} onChange={(event) => update('follow_up_date', event.target.value || null)} />
          </label>
        </div>

        <label className="notes-field">
          Internal notes
          <textarea rows={4} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Add useful context for the team…" />
        </label>

        {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}

        <div className="drawer-footer-spread">
          {isAdmin && detail && onDelete && lead?.id ? (
            <button
              type="button"
              className="danger-button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleting}
            >
              <Trash2 size={15} /> Delete lead
            </button>
          ) : <div />}

          <div className="drawer-footer-actions">
            <button type="button" className="outline-button" onClick={onClose} disabled={saving || deleting}>Cancel</button>
            <button className="lime-button" disabled={saving || deleting}>
              {saving ? 'Saving…' : <>{detail ? 'Save changes' : 'Create lead'} <ArrowUpRight size={17} /></>}
            </button>
          </div>
        </div>
      </form>

      {/* Call History Timeline */}
      {detail && lead && (
        <section className="call-history-section">
          <div className="call-history-heading">
            <h3><History size={16} style={{ marginRight: 6, verticalAlign: -2 }} /> Call History & Interactions</h3>
            <span>{callLogs.length} logged</span>
          </div>

          {loadingLogs ? (
            <div style={{ textAlign: 'center', padding: '16px', color: '#8c9388', fontSize: 12 }}>Loading call history…</div>
          ) : callLogs.length === 0 ? (
            <div style={{ padding: '16px', background: '#ffffff', border: '1px dashed #dadad2', borderRadius: 6, textAlign: 'center', color: '#77796f', fontSize: 12 }}>
              No call attempts or callbacks logged yet. Use the action buttons above after calling the lead.
            </div>
          ) : (
            <div className="call-timeline">
              {callLogs.map((log) => {
                const salespersonName = profiles.find((p) => p.id === log.salesperson_id)?.full_name || 'Salesperson';
                const isOutgoing = log.interaction_type === 'outgoing';
                const isAttended = log.call_result === 'attended';
                const isQualified = log.qualification_result === 'qualified';
                const isUnqualified = log.qualification_result === 'unqualified';

                return (
                  <div className="call-card" key={log.id}>
                    <div className="call-card-top">
                      <div className="call-card-meta">
                        <span className={`call-type-badge ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                          {isOutgoing ? `Outgoing #${log.attempt_number || 1}` : 'Incoming Callback'}
                        </span>

                        {isAttended ? (
                          <span className={`call-result-badge ${isQualified ? 'attended-ok' : isUnqualified ? 'attended-unfit' : ''}`}>
                            {isQualified ? 'Attended · Qualified' : isUnqualified ? 'Attended · Unqualified' : 'Attended'}
                          </span>
                        ) : (
                          <span className={`call-result-badge ${log.call_outcome === 'signal_problem' ? 'signal' : 'ring'}`}>
                            {log.call_outcome === 'signal_problem' ? 'Signal Problem' : 'Full Ring'}
                          </span>
                        )}
                      </div>

                      <span className="call-card-date">
                        {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(log.created_at))}
                      </span>
                    </div>

                    <div className="call-card-details">
                      <div>Logged by <strong>{salespersonName}</strong></div>
                      {log.response && <div style={{ marginTop: 4 }}><strong>Response:</strong> {log.response}</div>}
                      {log.unqualified_reason && <div style={{ marginTop: 4 }}><strong>Reason:</strong> {log.unqualified_reason} {log.unqualified_notes ? `— ${log.unqualified_notes}` : ''}</div>}
                      {log.notes && !log.response && !log.unqualified_reason && <div style={{ marginTop: 4 }}>{log.notes}</div>}
                    </div>

                    {log.scheduled_follow_up_at && (
                      <div className="call-card-followup">
                        <Clock size={12} />
                        <span>Follow-up: {formatFollowUpTime(log.scheduled_follow_up_at)}</span>
                        {log.follow_up_status && (
                          <span className={`followup-status-tag ${log.follow_up_status}`}>
                            {log.follow_up_status}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="convert-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !deleting) setShowDeleteConfirm(false); }}>
          <section className="confirm-dialog">
            <div className="confirm-icon" style={{ background: '#fae7e3', color: '#99544a' }}>
              <Trash2 size={24} />
            </div>
            <h3>Delete this lead?</h3>
            <p className="confirm-subtitle">
              This lead will be moved to <strong>Deleted Leads</strong> and hidden from active pipeline views and metrics.
              You can inspect or restore it anytime from the Deleted Leads page.
            </p>
            {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}
            <div className="drawer-footer">
              <button className="outline-button" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button className="danger-button-filled" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Moving…' : <>Move to Deleted Leads <Trash2 size={16} /></>}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Convert Confirmations */}
      {showConvertConfirm && (
        <div className="convert-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowConvertConfirm(false); }}>
          <section className="confirm-dialog">
            <div className="confirm-icon"><TrendingUp size={26} /></div>
            <h3>Convert this lead to a client?</h3>
            <p className="confirm-subtitle">Confirming will create a client record using the information already in this lead. The lead will be marked as Converted and preserved as a historical record.</p>
            <div className="drawer-footer">
              <button className="outline-button" onClick={() => setShowConvertConfirm(false)}>Cancel</button>
              <button className="lime-button" onClick={() => { setShowConvertConfirm(false); setShowCompleteClient(true); }}>Yes, Convert <ArrowUpRight size={17} /></button>
            </div>
          </section>
        </div>
      )}

      {showCompleteClient && (
        <div className="convert-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCompleteClient(false); }}>
          <section className="confirm-dialog confirm-dialog-wide">
            <div className="confirm-icon"><Building2 size={26} /></div>
            <h3>Complete client details</h3>
            <p className="confirm-subtitle">The lead's name, phone, email, and service will be carried over automatically. Add any additional information below.</p>
            <label className="complete-field">
              Company / business name (optional)
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Corporation" />
            </label>
            {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}
            <div className="drawer-footer">
              <button className="outline-button" onClick={() => setShowCompleteClient(false)} disabled={converting}>Back</button>
              <button className="lime-button" onClick={handleConvert} disabled={converting}>{converting ? 'Converting…' : <>Create client <ArrowUpRight size={17} /></>}</button>
            </div>
          </section>
        </div>
      )}

      {/* Step-by-Step Call Workflow Modal */}
      {callWorkflowMode && lead && onSaveCallLog && (
        <CallWorkflowModal
          lead={lead}
          profile={profile}
          mode={callWorkflowMode}
          existingLogs={callLogs}
          onClose={() => setCallWorkflowMode(null)}
          onSave={async (logPayload, leadUpdates) => {
            await onSaveCallLog(logPayload, leadUpdates);
            setCallWorkflowMode(null);
          }}
        />
      )}
    </section>
  </div>;
}

function CallWorkflowModal({
  lead,
  profile,
  mode,
  existingLogs,
  onClose,
  onSave,
}: {
  lead: Lead;
  profile: Profile;
  mode: 'outgoing' | 'incoming';
  existingLogs: LeadCallLog[];
  onClose: () => void;
  onSave: (
    logPayload: Omit<LeadCallLog, 'id' | 'created_at' | 'salesperson_id' | 'lead_id'>,
    leadUpdates: Partial<Lead>
  ) => Promise<void>;
}) {
  // Outgoing attempt calculation (incoming callbacks DO NOT increment outgoing attempt number)
  const outgoingAttemptsCount = useMemo(() => {
    return existingLogs.filter((l) => l.interaction_type === 'outgoing').length;
  }, [existingLogs]);

  const attemptNumber = mode === 'outgoing' ? outgoingAttemptsCount + 1 : null;

  // Step state
  // For outgoing: Step 1 (Did lead answer?), Step 2 (Unattended reason OR Qualification)
  // For incoming: advances directly to Qualification (since incoming was attended!)
  const [attended, setAttended] = useState<boolean | null>(mode === 'incoming' ? true : null);
  const [notAttendedOutcome, setNotAttendedOutcome] = useState<'signal_problem' | 'full_ring' | null>(null);
  const [qualification, setQualification] = useState<'qualified' | 'unqualified' | null>(null);

  // Form inputs
  const [responseNotes, setResponseNotes] = useState('');
  const [unqualifiedReason, setUnqualifiedReason] = useState(unqualifiedReasonOptions[0]);
  const [unqualifiedExplanation, setUnqualifiedExplanation] = useState('');
  const [callNotes, setCallNotes] = useState('');

  // Follow-up scheduling
  const [followUpDate, setFollowUpDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // default tomorrow
    return d.toLocaleDateString('en-CA');
  });
  const [followUpTime, setFollowUpTime] = useState('11:00');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Automatic follow-up calculation for unattended calls
  const autoSchedule = useMemo(() => {
    if (attended !== false || !notAttendedOutcome) return null;
    const now = new Date();
    let scheduledDate: Date;
    let label: string;

    if (attemptNumber === 1) {
      // First attempt: 3 hours later on same day
      scheduledDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const timeStr = scheduledDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
      label = `First Outgoing Attempt — Automatic retry in 3 hours (Today at ${timeStr})`;
    } else {
      // Second attempt and beyond: Tomorrow at same time
      scheduledDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const dateStr = scheduledDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const timeStr = scheduledDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
      label = `Outgoing Attempt #${attemptNumber} — Automatic retry tomorrow (${dateStr} at ${timeStr})`;
    }

    return {
      scheduledDate,
      label,
    };
  }, [attended, notAttendedOutcome, attemptNumber]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (attended === false && notAttendedOutcome && autoSchedule) {
        // CASE: Not Attended (Signal Problem or Full Ring)
        const scheduledIso = autoSchedule.scheduledDate.toISOString();
        const scheduledDatePart = autoSchedule.scheduledDate.toLocaleDateString('en-CA');

        const logPayload: Omit<LeadCallLog, 'id' | 'created_at' | 'salesperson_id' | 'lead_id'> = {
          interaction_type: 'outgoing',
          attempt_number: attemptNumber,
          call_result: 'not_attended',
          call_outcome: notAttendedOutcome,
          qualification_result: null,
          response: null,
          unqualified_reason: null,
          unqualified_notes: null,
          scheduled_follow_up_at: scheduledIso,
          follow_up_status: 'pending',
          notes: callNotes.trim() || (notAttendedOutcome === 'signal_problem' ? 'Signal Problem' : 'Full Ring'),
        };

        const outcomeText = notAttendedOutcome === 'signal_problem' ? 'Signal Problem' : 'Full Ring';
        const noteEntry = `\n[${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}] Outgoing Attempt #${attemptNumber}: ${outcomeText}. Auto-retry scheduled for ${formatFollowUpTime(scheduledIso)}. ${callNotes.trim()}`;

        const leadUpdates: Partial<Lead> = {
          status: 'follow_up',
          next_follow_up_at: scheduledIso,
          follow_up_date: scheduledDatePart,
          notes: (lead.notes ? `${lead.notes}\n` : '') + noteEntry.trim(),
        };

        await onSave(logPayload, leadUpdates);
      } else if (attended === true && qualification === 'qualified') {
        // CASE: Attended & Qualified
        if (!responseNotes.trim()) {
          setError('Please record the lead’s response or interest.');
          setSaving(false);
          return;
        }

        const scheduledAt = new Date(`${followUpDate}T${followUpTime}:00`);
        const scheduledIso = scheduledAt.toISOString();

        const logPayload: Omit<LeadCallLog, 'id' | 'created_at' | 'salesperson_id' | 'lead_id'> = {
          interaction_type: mode,
          attempt_number: attemptNumber,
          call_result: 'attended',
          call_outcome: 'attended',
          qualification_result: 'qualified',
          response: responseNotes.trim(),
          unqualified_reason: null,
          unqualified_notes: null,
          scheduled_follow_up_at: scheduledIso,
          follow_up_status: 'pending',
          notes: responseNotes.trim(),
        };

        const typeLabel = mode === 'outgoing' ? `Outgoing Attempt #${attemptNumber}` : 'Incoming Callback';
        const noteEntry = `\n[${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}] ${typeLabel}: Attended · Qualified. Follow-up scheduled for ${formatFollowUpTime(scheduledIso)}. Response: ${responseNotes.trim()}`;

        const leadUpdates: Partial<Lead> = {
          status: 'follow_up',
          qualification_status: 'qualified',
          next_follow_up_at: scheduledIso,
          follow_up_date: followUpDate,
          notes: (lead.notes ? `${lead.notes}\n` : '') + noteEntry.trim(),
        };

        await onSave(logPayload, leadUpdates);
      } else if (attended === true && qualification === 'unqualified') {
        // CASE: Attended & Unqualified
        const logPayload: Omit<LeadCallLog, 'id' | 'created_at' | 'salesperson_id' | 'lead_id'> = {
          interaction_type: mode,
          attempt_number: attemptNumber,
          call_result: 'attended',
          call_outcome: 'attended',
          qualification_result: 'unqualified',
          response: null,
          unqualified_reason: unqualifiedReason,
          unqualified_notes: unqualifiedExplanation.trim() || null,
          scheduled_follow_up_at: null,
          follow_up_status: null,
          notes: `Unqualified: ${unqualifiedReason}${unqualifiedExplanation ? ` — ${unqualifiedExplanation.trim()}` : ''}`,
        };

        const typeLabel = mode === 'outgoing' ? `Outgoing Attempt #${attemptNumber}` : 'Incoming Callback';
        const noteEntry = `\n[${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}] ${typeLabel}: Marked Unqualified. Reason: ${unqualifiedReason}. ${unqualifiedExplanation.trim()}`;

        const leadUpdates: Partial<Lead> = {
          status: 'unqualified',
          qualification_status: 'unqualified',
          unqualified_reason: unqualifiedReason,
          unqualified_notes: unqualifiedExplanation.trim() || null,
          unqualified_at: new Date().toISOString(),
          unqualified_by: profile.id,
          next_follow_up_at: null,
          follow_up_date: null,
          notes: (lead.notes ? `${lead.notes}\n` : '') + noteEntry.trim(),
        };

        await onSave(logPayload, leadUpdates);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : friendlyError());
      setSaving(false);
    }
  };

  return (
    <div className="workflow-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <section className="workflow-dialog">
        <header className="workflow-header">
          <div>
            <span className="workflow-step-indicator">
              {mode === 'outgoing' ? `Outgoing Call Attempt #${attemptNumber}` : 'Incoming Callback from Lead'}
            </span>
            <h2>{mode === 'outgoing' ? 'Record Outgoing Call' : 'Record Incoming Callback'}</h2>
          </div>
          <button className="close-button" onClick={onClose} disabled={saving}><X size={20} /></button>
        </header>

        {mode === 'incoming' && (
          <div className="auto-schedule-banner" style={{ background: '#e2eff4', borderColor: '#b8d6e3', color: '#1d485a' }}>
            <PhoneIncoming size={18} />
            <div>
              <strong>Customer Called You Back</strong>
              <span>This callback does not increment the outgoing attempt counter. Any previous pending automatic retries will be marked as superseded.</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* STEP 1: Did the lead answer? (Outgoing only) */}
          {mode === 'outgoing' && (
            <div>
              <p className="eyebrow">Step 1 / Call Answered?</p>
              <div className="choice-grid">
                <button
                  type="button"
                  className={`choice-card ${attended === true ? 'selected' : ''}`}
                  onClick={() => { setAttended(true); setNotAttendedOutcome(null); }}
                >
                  <UserCheck size={24} className="choice-icon" />
                  <span className="choice-title">Call Attended</span>
                  <span className="choice-desc">Lead picked up and spoke with you</span>
                </button>

                <button
                  type="button"
                  className={`choice-card ${attended === false ? 'selected' : ''}`}
                  onClick={() => { setAttended(false); setQualification(null); }}
                >
                  <PhoneMissed size={24} className="choice-icon" />
                  <span className="choice-title">Call Not Attended</span>
                  <span className="choice-desc">Lead did not answer, rang out, or signal issue</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2A: If Not Attended */}
          {attended === false && (
            <div style={{ marginTop: 20 }}>
              <p className="eyebrow">Step 2 / Select Unattended Outcome</p>
              <div className="choice-grid">
                <button
                  type="button"
                  className={`choice-card ${notAttendedOutcome === 'signal_problem' ? 'selected' : ''}`}
                  onClick={() => setNotAttendedOutcome('signal_problem')}
                >
                  <WifiOff size={22} className="choice-icon" />
                  <span className="choice-title">Signal Problem</span>
                  <span className="choice-desc">Line busy, switched off, or network unreachable</span>
                </button>

                <button
                  type="button"
                  className={`choice-card ${notAttendedOutcome === 'full_ring' ? 'selected' : ''}`}
                  onClick={() => setNotAttendedOutcome('full_ring')}
                >
                  <PhoneCall size={22} className="choice-icon" />
                  <span className="choice-title">Full Ring</span>
                  <span className="choice-desc">Phone rang completely with no answer</span>
                </button>
              </div>

              {autoSchedule && (
                <div className="auto-schedule-banner">
                  <Clock size={18} />
                  <div>
                    <strong>Automatic Follow-up Rule Applied</strong>
                    <span>{autoSchedule.label}</span>
                  </div>
                </div>
              )}

              <label style={{ display: 'block', marginTop: 14 }}>
                Call notes (optional)
                <input
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="e.g. Tried twice, line was busy"
                />
              </label>
            </div>
          )}

          {/* STEP 2B: If Attended (or Incoming Callback) */}
          {attended === true && (
            <div style={{ marginTop: mode === 'outgoing' ? 20 : 0 }}>
              <p className="eyebrow">{mode === 'outgoing' ? 'Step 2 / Lead Qualification' : 'Qualification'}</p>
              <div className="choice-grid">
                <button
                  type="button"
                  className={`choice-card ${qualification === 'qualified' ? 'selected' : ''}`}
                  onClick={() => setQualification('qualified')}
                >
                  <CheckCircle2 size={24} className="choice-icon" />
                  <span className="choice-title">Qualified</span>
                  <span className="choice-desc">Interested and meets criteria. Schedule follow-up.</span>
                </button>

                <button
                  type="button"
                  className={`choice-card ${qualification === 'unqualified' ? 'selected' : ''}`}
                  onClick={() => setQualification('unqualified')}
                >
                  <Ban size={24} className="choice-icon" />
                  <span className="choice-title">Unqualified</span>
                  <span className="choice-desc">Not interested, unfit, or wrong number.</span>
                </button>
              </div>

              {/* If Qualified: Response + Date & Time */}
              {qualification === 'qualified' && (
                <div style={{ marginTop: 18 }}>
                  <label style={{ display: 'block', marginBottom: 14 }}>
                    Lead response & discussion notes *
                    <textarea
                      rows={3}
                      value={responseNotes}
                      onChange={(e) => setResponseNotes(e.target.value)}
                      placeholder="e.g. Discussed 3-month Instagram Reels package. Client requested callback to review proposal."
                      required
                    />
                  </label>

                  <p className="eyebrow" style={{ marginTop: 14 }}>Schedule Next Follow-up</p>
                  <div className="datetime-grid">
                    <div>
                      <label>Follow-up Date</label>
                      <input
                        type="date"
                        min={getLocalTodayDate()}
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label>Follow-up Time</label>
                      <input
                        type="time"
                        value={followUpTime}
                        onChange={(e) => setFollowUpTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* If Unqualified: Reason selection + explanation */}
              {qualification === 'unqualified' && (
                <div style={{ marginTop: 18 }}>
                  <div className="unqualified-warning">
                    <AlertTriangle size={18} />
                    <div>
                      <strong>Lead will be removed from active pipeline</strong>
                      <span>The lead will be archived permanently under Unqualified Leads for Admin review.</span>
                    </div>
                  </div>

                  <label style={{ display: 'block', marginBottom: 14 }}>
                    Unqualified reason *
                    <select
                      value={unqualifiedReason}
                      onChange={(e) => setUnqualifiedReason(e.target.value)}
                      style={{ marginTop: 5 }}
                    >
                      {unqualifiedReasonOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'block' }}>
                    Additional notes / explanation
                    <textarea
                      rows={3}
                      value={unqualifiedExplanation}
                      onChange={(e) => setUnqualifiedExplanation(e.target.value)}
                      placeholder="Add details on why this lead is unqualified…"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {error && <div className="auth-message" style={{ marginTop: 14 }}><CircleAlert size={16} />{error}</div>}

          <div className="drawer-footer" style={{ marginTop: 24, paddingTop: 18 }}>
            <button type="button" className="outline-button" onClick={onClose} disabled={saving}>Cancel</button>

            {attended === false && notAttendedOutcome && (
              <button className="lime-button" disabled={saving}>
                {saving ? 'Saving…' : <>Save Call & Schedule Retry <ArrowRight size={16} /></>}
              </button>
            )}

            {attended === true && qualification === 'qualified' && (
              <button className="lime-button" disabled={saving}>
                {saving ? 'Scheduling…' : <>Save & Schedule Follow-up <ArrowRight size={16} /></>}
              </button>
            )}

            {attended === true && qualification === 'unqualified' && (
              <button className="danger-button-filled" disabled={saving}>
                {saving ? 'Marking…' : <>Mark Unqualified <Ban size={16} /></>}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function ClientsPage({ clients, profiles, profile, loading, error, onRetry, onAdd, onSelect }: { clients: Client[]; profiles: Profile[]; profile: Profile; loading: boolean; error: string; onRetry: () => void; onAdd: () => void; onSelect: (client: Client) => void }) {
  const isAdmin = profile.role === 'admin';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All status');
  const [sourceFilter, setSourceFilter] = useState('All sources');
  const filtered = useMemo(() => clients.filter((c) =>
    [c.name, c.company_name ?? '', c.phone, c.email ?? '', c.service].join(' ').toLowerCase().includes(query.toLowerCase()) &&
    (statusFilter === 'All status' || c.status === statusFilter) &&
    (sourceFilter === 'All sources' || c.source === sourceFilter)),
    [clients, query, statusFilter, sourceFilter]);
  return <div className="page-content"><div className="page-title-row leads-title"><div><p className="eyebrow">Roster / {clients.length.toString().padStart(2, '0')} clients</p><h1>Client management</h1><p className="subtitle">{isAdmin ? 'Every relationship, nurtured and accounted for.' : 'Your assigned client relationships.'}</p></div><button className="lime-button" onClick={onAdd}><CirclePlus size={18} /> Add Client</button></div>
    <div className="filter-bar"><div className="search-box"><Search size={18} /><input placeholder="Search clients" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="filter-select"><Filter size={16} /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{clientStatusOptions.map((s) => <option key={s} value={s}>{s === 'All status' ? 'All status' : clientStatusLabels[s as Client['status']]}</option>)}</select></div><div className="filter-select"><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>{sources.map((s) => <option key={s}>{s}</option>)}</select></div></div>
    {error ? <div className="data-state"><CircleAlert size={22} /><h3>We couldn't load your clients</h3><p>Check your connection and try again.</p><button className="outline-button" onClick={onRetry}>Try again</button></div>
     : loading ? <div className="data-state"><div className="spinner" /><p>Loading your clients…</p></div>
     : filtered.length === 0 ? <div className="data-state"><div className="empty-icon"><UsersRound size={22} /></div><h3>{clients.length === 0 ? 'No clients yet' : 'No clients found'}</h3><p>{clients.length === 0 ? 'Convert a lead or add your first client.' : 'Adjust your search or filters.'}</p>{clients.length === 0 && <button className="lime-button" onClick={onAdd}><CirclePlus size={17} /> Add Client</button>}</div>
     : <div className="client-grid">{filtered.map((c) => <div className="client-card" key={c.id} onClick={() => onSelect(c)}><div className="client-card-top"><div className="client-avatar">{c.name.slice(0, 1).toUpperCase()}</div><span className={`client-status-pill ${c.status}`}>{clientStatusLabel(c.status)}</span></div><h3>{c.name}</h3>{c.company_name && <p className="client-company"><Building2 size={14} /> {c.company_name}</p>}<div className="client-card-meta"><span className="source-tag"><i />{c.service}</span></div><div className="client-card-meta-secondary"><span>{profiles.find((p) => p.id === c.assigned_to)?.full_name || <span className="muted">Unassigned</span>}</span><span className="muted">{formatReceived(c.created_at)}</span></div><div className="client-card-footer"><span className="source-tag"><i />{c.source}</span><button className="text-button">View client <ArrowUpRight size={14} /></button></div></div>)}</div>}
  </div>;
}

function ClientModal({ profiles, profile, onClose, onSave }: { profiles: Profile[]; profile: Profile; onClose: () => void; onSave: (form: ClientForm) => Promise<void> }) {
  const [form, setForm] = useState<ClientForm>({ ...emptyClientForm, assigned_to: profile.role === 'admin' ? null : profile.id });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = <K extends keyof ClientForm>(key: K, value: ClientForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch {
      setError(friendlyError());
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="lead-drawer"><div className="drawer-header"><div><p className="eyebrow">New relationship</p><h2>Add a client</h2></div><button className="close-button" onClick={onClose}><X size={20} /></button></div>
    <form className="lead-form" onSubmit={submit}><div className="form-grid">
      <label>Full name<input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Ahmed Khan" required /></label>
      <label>Company / business<input value={form.company_name ?? ''} onChange={(e) => update('company_name', e.target.value)} placeholder="Optional" /></label>
      <label>Phone number<input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+92 300 0000000" required /></label>
      <label>Email address<input type="email" value={form.email ?? ''} onChange={(e) => update('email', e.target.value)} placeholder="Optional" /></label>
      <label>Service<input value={form.service} onChange={(e) => update('service', e.target.value)} placeholder="e.g. Social media management" /></label>
      <label>Lead source<select value={form.source} onChange={(e) => update('source', e.target.value as Client['source'])}>{sources.slice(1).map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Assigned salesperson{profile.role === 'admin' ? <select value={form.assigned_to ?? ''} onChange={(e) => update('assigned_to', e.target.value || null)}><option value="">Unassigned</option>{profiles.map((p) => <option value={p.id} key={p.id}>{p.full_name}</option>)}</select> : <select value={profile.id} disabled><option value={profile.id}>{profile.full_name} (You)</option></select>}</label>
      <label>Client status<select value={form.status} onChange={(e) => update('status', e.target.value as Client['status'])}>{clientStatuses.map((s) => <option key={s} value={s}>{clientStatusLabel(s)}</option>)}</select></label>
    </div>
    <label className="notes-field">Internal notes<textarea rows={5} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Add useful context…" /></label>
    {error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}
    <div className="drawer-footer"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="lime-button" disabled={saving}>{saving ? 'Saving…' : <>Create client <ArrowUpRight size={17} /></>}</button></div>
    </form>
  </section></div>;
}

function ClientDetail({ client, profiles, profile, onClose, onSave }: { client: Client; profiles: Profile[]; profile: Profile; onClose: () => void; onSave: (form: ClientForm) => Promise<void> }) {
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
    : <form className="lead-form" onSubmit={submit}><div className="form-grid"><label>Full name<input value={form.name} onChange={(e) => update('name', e.target.value)} required /></label><label>Company / business<input value={form.company_name ?? ''} onChange={(e) => update('company_name', e.target.value)} placeholder="Optional" /></label><label>Phone number<input value={form.phone} onChange={(e) => update('phone', e.target.value)} required /></label><label>Email address<input type="email" value={form.email ?? ''} onChange={(e) => update('email', e.target.value)} placeholder="Optional" /></label><label>Service<input value={form.service} onChange={(e) => update('service', e.target.value)} /></label><label>Lead source<select value={form.source} onChange={(e) => update('source', e.target.value as Client['source'])}>{sources.slice(1).map((s) => <option key={s}>{s}</option>)}</select></label><label>Assigned salesperson{profile.role === 'admin' ? <select value={form.assigned_to ?? ''} onChange={(e) => update('assigned_to', e.target.value || null)}><option value="">Unassigned</option>{profiles.map((p) => <option value={p.id} key={p.id}>{p.full_name}</option>)}</select> : <select value={profile.id} disabled><option value={profile.id}>{profile.full_name} (You)</option></select>}</label><label>Client status<select value={form.status} onChange={(e) => update('status', e.target.value as Client['status'])}>{clientStatuses.map((s) => <option key={s} value={s}>{clientStatusLabel(s)}</option>)}</select></label></div><label className="notes-field">Internal notes<textarea rows={5} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Add useful context…" /></label>{error && <div className="auth-message"><CircleAlert size={16} />{error}</div>}<div className="drawer-footer"><button type="button" className="outline-button" onClick={() => setEditing(false)}>Cancel</button><button className="lime-button" disabled={saving}>{saving ? 'Saving…' : <>Save changes <ArrowUpRight size={17} /></>}</button></div></form>}
  </section></div>;
}

function ConvertedLeadsView({ leads, clients, profiles, onClose, onOpenClient }: { leads: Lead[]; clients: Client[]; profiles: Profile[]; onClose: () => void; onOpenClient: (client: Client) => void }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="lead-drawer"><div className="drawer-header"><div><p className="eyebrow">Conversion history</p><h2>Converted leads</h2></div><button className="close-button" onClick={onClose}><X size={20} /></button></div>
    <div className="converted-list">{leads.length === 0 ? <div className="data-state" style={{ minHeight: 200 }}><div className="empty-icon"><TrendingUp size={22} /></div><h3>No converted leads yet</h3><p>Converted leads will appear here with their client links.</p></div>
     : leads.map((lead) => { const client = clients.find((c) => c.lead_id === lead.id); return <div className="converted-row" key={lead.id}><div className="converted-info"><div className="small-avatar">{lead.name.slice(0, 1).toUpperCase()}</div><div><strong>{lead.name}</strong><span>{lead.service} <i>·</i> {lead.source} <i>·</i> {profiles.find((p) => p.id === lead.assigned_to)?.full_name || 'Unassigned'}</span></div></div><div className="converted-action">{client ? <button className="text-button" onClick={() => onOpenClient(client)}>View client <ArrowUpRight size={14} /></button> : <span className="muted">No client linked</span>}<small>{formatReceived(lead.received_at)}</small></div></div>; })}</div>
  </section></div>;
}

function PlaceholderPage({ page }: { page: Page }) { const labels: Record<string, string> = { finance: 'Finance', settings: 'Settings', deleted_leads: 'Deleted Leads', unqualified_leads: 'Unqualified Leads' }; return <div className="page-content placeholder-page"><div className="placeholder-mark"><Sparkles size={24} /></div><p className="eyebrow">Phase 1 / Coming next</p><h1>{labels[page]}</h1><p className="subtitle">This space is reserved for the next layer of the Taha Media workspace.</p><span className="lime-line" /></div>; }

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
    {actionRow && isAdmin && <EmployeeActionDrawer profile={actionRow} onClose={() => setActionRow(null)} onConfirm={(action, value) => { setActionRow(null); setConfirmState({ profile: actionRow, action, newRole: action === 'set_role' ? (value as string) : undefined, newActive: action === 'toggle_active' ? Boolean(value) : undefined }); }} />}
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

type MetaLeadForm = {
  id: string;
  name: string;
  status?: string;
  connection_status?: 'saved' | 'connected' | 'receiving_leads';
  page_id?: string;
  source_url?: string;
  created_at?: string;
};

type AgencySettings = {
  id: string;
  agency_name: string;
  tagline: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  logo_url: string | null;
  meta_lead_forms: MetaLeadForm[];
  gstin?: string;
  currency?: string;
  currency_symbol?: string;
  timezone?: string;
  invoice_prefix?: string;
  updated_at?: string;
  updated_by?: string | null;
};

type SettingsSection = 'profile' | 'integrations';

function SettingsPage({
  profile,
  onDirtyChange,
  onAgencyBrandingChange,
}: {
  profile: Profile;
  onDirtyChange?: (dirty: boolean) => void;
  onAgencyBrandingChange?: (branding: { agency_name: string; logo_url: string | null }) => void;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [settings, setSettings] = useState<AgencySettings | null>(null);
  const [form, setForm] = useState<{
    agency_name: string;
    tagline: string;
    contact_email: string;
    contact_phone: string;
    address: string;
  }>({
    agency_name: 'Taha Media',
    tagline: 'Performance & Growth Marketing',
    contact_email: 'contact@taha.in',
    contact_phone: '+91 98765 43210',
    address: 'Mumbai, Maharashtra, India',
  });

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [stagedLogoFile, setStagedLogoFile] = useState<File | null>(null);
  const [stagedLogoPreview, setStagedLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Meta Instant Form placeholder state
  const [instantFormLink, setInstantFormLink] = useState('');

  // General state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Load agency settings
  const loadSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('agency_settings')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setSettings(data);
        setForm({
          agency_name: data.agency_name || '',
          tagline: data.tagline || '',
          contact_email: data.contact_email || '',
          contact_phone: data.contact_phone || '',
          address: data.address || '',
        });
        setLogoUrl(data.logo_url || null);
      }
    } catch (err: any) {
      console.error('Error loading agency settings:', err);
      setError('Unable to load agency settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Dirty detection for Agency Profile
  const isProfileDirty = useMemo(() => {
    if (!settings) return false;
    return (
      form.agency_name !== settings.agency_name ||
      form.tagline !== settings.tagline ||
      form.contact_email !== settings.contact_email ||
      form.contact_phone !== settings.contact_phone ||
      form.address !== settings.address ||
      stagedLogoFile !== null ||
      removeLogo !== false
    );
  }, [form, settings, stagedLogoFile, removeLogo]);

  useEffect(() => {
    onDirtyChange?.(isProfileDirty);
  }, [isProfileDirty, onDirtyChange]);

  // Clean up staged preview URL on unmount
  useEffect(() => {
    return () => {
      if (stagedLogoPreview) {
        URL.revokeObjectURL(stagedLogoPreview);
      }
    };
  }, [stagedLogoPreview]);

  // File selection & validation
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
    const fileName = file.name.toLowerCase();
    const hasValidExt = allowedExts.some((ext) => fileName.endsWith(ext));

    if (!allowedTypes.includes(file.type) && !hasValidExt) {
      setError('Invalid file type. Supported formats are PNG, JPG, JPEG, SVG, and WebP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit. Please choose an image smaller than 5MB.');
      return;
    }

    if (stagedLogoPreview) {
      URL.revokeObjectURL(stagedLogoPreview);
    }

    const previewUrl = URL.createObjectURL(file);
    setStagedLogoFile(file);
    setStagedLogoPreview(previewUrl);
    setRemoveLogo(false);
    setError('');
  };

  const handleRevertLogo = () => {
    if (stagedLogoPreview) {
      URL.revokeObjectURL(stagedLogoPreview);
    }
    setStagedLogoFile(null);
    setStagedLogoPreview(null);
    setRemoveLogo(false);
  };

  const handleRemoveLogo = () => {
    if (stagedLogoPreview) {
      URL.revokeObjectURL(stagedLogoPreview);
    }
    setStagedLogoFile(null);
    setStagedLogoPreview(null);
    setRemoveLogo(true);
  };

  // Save Agency Profile
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setError('');
    setSaveSuccess(false);

    try {
      let finalLogoUrl = settings.logo_url;

      if (removeLogo) {
        finalLogoUrl = null;
      } else if (stagedLogoFile) {
        const fileExt = stagedLogoFile.name.split('.').pop()?.toLowerCase() || 'png';
        const cleanExt = fileExt === 'jpeg' ? 'jpg' : fileExt;
        const fileName = `agency-logo-${Date.now()}.${cleanExt}`;
        const filePath = `branding/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('agency-assets')
          .upload(filePath, stagedLogoFile, {
            cacheControl: '3600',
            upsert: true,
            contentType: stagedLogoFile.type,
          });

        if (uploadError) {
          throw new Error(`Logo upload failed: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('agency-assets')
          .getPublicUrl(filePath);

        finalLogoUrl = publicUrlData.publicUrl;
      }

      // Update agency_settings in DB preserving existing fields
      const { data: updatedData, error: updateError } = await supabase
        .from('agency_settings')
        .update({
          agency_name: form.agency_name.trim(),
          tagline: form.tagline.trim(),
          contact_email: form.contact_email.trim(),
          contact_phone: form.contact_phone.trim(),
          address: form.address.trim(),
          logo_url: finalLogoUrl,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        })
        .eq('id', settings.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setSettings(updatedData);
      setLogoUrl(finalLogoUrl);
      setStagedLogoFile(null);
      setStagedLogoPreview(null);
      setRemoveLogo(false);
      setSaveSuccess(true);

      // Notify App to update sidebar & header branding
      onAgencyBrandingChange?.({
        agency_name: form.agency_name.trim(),
        logo_url: finalLogoUrl,
      });

      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error saving agency profile:', err);
      setError(err?.message || 'Failed to save agency profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = () => {
    if (settings) {
      setForm({
        agency_name: settings.agency_name || '',
        tagline: settings.tagline || '',
        contact_email: settings.contact_email || '',
        contact_phone: settings.contact_phone || '',
        address: settings.address || '',
      });
      setLogoUrl(settings.logo_url);
      if (stagedLogoPreview) {
        URL.revokeObjectURL(stagedLogoPreview);
      }
      setStagedLogoFile(null);
      setStagedLogoPreview(null);
      setRemoveLogo(false);
    }
    setShowCancelModal(false);
  };



  // Fallback to default /taha_logo.png if no custom logo is uploaded
  const displayLogoSrc = stagedLogoPreview || (!removeLogo && logoUrl ? logoUrl : '/taha_logo.png');
  const isCustomLogo = !!stagedLogoPreview || (!removeLogo && !!logoUrl);

  return (
    <div className="page-content">
      <div className="page-title-row">
        <div>
          <span className="section-tag">System Administration</span>
          <h1>Admin Settings</h1>
          <p className="subtitle">Configure agency profile branding and external advertising integrations.</p>
        </div>
      </div>

      {/* Two-section Navigation Tab Strip */}
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${activeSection === 'profile' ? 'active' : ''}`}
          onClick={() => {
            if (activeSection !== 'profile') {
              if (isProfileDirty) {
                setShowCancelModal(true);
              } else {
                setActiveSection('profile');
              }
            }
          }}
        >
          <Building2 size={16} />
          <span>Agency Profile</span>
        </button>

        <button
          type="button"
          className={`settings-tab ${activeSection === 'integrations' ? 'active' : ''}`}
          onClick={() => {
            if (activeSection !== 'integrations') {
              if (isProfileDirty) {
                setShowCancelModal(true);
              } else {
                setActiveSection('integrations');
              }
            }
          }}
        >
          <SlidersHorizontal size={16} />
          <span>Integrations</span>
        </button>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: '60px 0', textAlign: 'center' }}>
          <div className="status-pill neutral">Loading agency settings…</div>
        </div>
      ) : (
        <div className="panel settings-panel">
          {error && (
            <div className="settings-alert error">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="settings-alert success">
              <CheckCircle2 size={18} />
              <span>Agency profile and branding updated successfully.</span>
            </div>
          )}

          {/* Section 1: Agency Profile */}
          {activeSection === 'profile' && (
            <form onSubmit={handleSave}>
              <div className="settings-section-header">
                <h2>Agency Profile & Branding</h2>
                <p>Manage your agency business details and visual branding assets.</p>
              </div>

              {/* Logo Upload Section */}
              <div className="agency-logo-section">
                <div className="agency-logo-upload-card">
                  <div className="agency-logo-preview-box">
                    <img
                      src={displayLogoSrc}
                      alt="Agency Logo Preview"
                      className="agency-logo-preview-img"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/taha_logo.png';
                      }}
                    />
                  </div>

                  <div className="agency-logo-details">
                    <strong>Agency Logo</strong>
                    <p>
                      Upload a logo file from your computer (PNG, JPG, JPEG, SVG, or WebP, up to 5MB).
                      Once saved, it will be stored securely in Supabase Storage and displayed across the navigation bar, login screen, and workspace.
                    </p>

                    <div className="agency-logo-actions">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleLogoFileChange}
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        className="outline-button"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={14} />
                        <span>Upload Logo</span>
                      </button>

                      {stagedLogoFile && (
                        <>
                          <span className="logo-file-badge">
                            <Check size={12} />
                            {stagedLogoFile.name} ({(stagedLogoFile.size / 1024).toFixed(0)} KB staged)
                          </span>
                          <button
                            type="button"
                            className="text-button"
                            onClick={handleRevertLogo}
                          >
                            Revert
                          </button>
                        </>
                      )}

                      {!stagedLogoFile && isCustomLogo && (
                        <button
                          type="button"
                          className="text-button"
                          style={{ color: '#99544a' }}
                          onClick={handleRemoveLogo}
                        >
                          <Trash2 size={13} />
                          <span>Remove Custom Logo</span>
                        </button>
                      )}

                      {removeLogo && (
                        <>
                          <span className="status-pill lost">
                            Custom logo will be removed on save (default restored)
                          </span>
                          <button
                            type="button"
                            className="text-button"
                            onClick={handleRevertLogo}
                          >
                            Undo
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Profile Details Form Grid */}
              <div className="settings-form-grid">
                <div className="form-group">
                  <label htmlFor="agency_name">Agency Name</label>
                  <input
                    id="agency_name"
                    type="text"
                    required
                    value={form.agency_name}
                    onChange={(e) => setForm({ ...form, agency_name: e.target.value })}
                    placeholder="Taha Media"
                  />
                  <small>The primary agency brand name shown across navigation and documents.</small>
                </div>

                <div className="form-group">
                  <label htmlFor="tagline">Tagline</label>
                  <input
                    id="tagline"
                    type="text"
                    value={form.tagline}
                    onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                    placeholder="Performance & Growth Marketing"
                  />
                  <small>A brief statement describing your agency focus.</small>
                </div>

                <div className="form-group">
                  <label htmlFor="contact_email">Official Email</label>
                  <input
                    id="contact_email"
                    type="email"
                    required
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    placeholder="contact@taha.in"
                  />
                  <small>Primary email address for system correspondence.</small>
                </div>

                <div className="form-group">
                  <label htmlFor="contact_phone">Contact Number</label>
                  <input
                    id="contact_phone"
                    type="tel"
                    required
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                  <small>Official contact phone number.</small>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="address">Business Address</label>
                  <textarea
                    id="address"
                    rows={2}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Mumbai, Maharashtra, India"
                  />
                  <small>Physical or registered business address.</small>
                </div>
              </div>

              {/* Form Actions Footer */}
              <div className="settings-footer">
                <div>
                  {isProfileDirty && (
                    <div className="unsaved-indicator">
                      <span className="unsaved-dot" />
                      <span>Unsaved Changes</span>
                    </div>
                  )}
                </div>

                <div className="settings-actions">
                  <button
                    type="button"
                    className="outline-button"
                    disabled={!isProfileDirty || saving}
                    onClick={() => {
                      if (isProfileDirty) setShowCancelModal(true);
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="lime-button"
                    disabled={!isProfileDirty || saving}
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Section 2: Integrations */}
          {activeSection === 'integrations' && (
            <div>
              <div className="settings-section-header">
                <h2>Meta Instant Form</h2>
                <p>Add an Instant Form link for future lead integration.</p>
              </div>

              <div className="meta-link-input-card">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!instantFormLink.trim()) return;
                    setInstantFormLink('');
                  }}
                  className="meta-link-input-row"
                >
                  <div className="meta-link-input-fields">
                    <input
                      type="text"
                      placeholder="Paste Meta Instant Form link"
                      value={instantFormLink}
                      onChange={(e) => setInstantFormLink(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="lime-button"
                    style={{ minHeight: 40, whiteSpace: 'nowrap' }}
                  >
                    <Plus size={15} />
                    <span>Add Form</span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Discard Changes Confirmation Dialog */}
      {showCancelModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCancelModal(false);
          }}
        >
          <section className="confirm-dialog">
            <div className="confirm-icon" style={{ background: '#fae7e3', color: '#99544a' }}>
              <AlertTriangle size={24} />
            </div>
            <h3>Discard unsaved changes?</h3>
            <p className="confirm-subtitle">
              All modifications made to Agency Details will be reverted to the last saved configuration.
            </p>
            <div className="drawer-footer" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="outline-button"
                onClick={() => setShowCancelModal(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="danger-button-filled"
                onClick={confirmCancel}
              >
                Discard changes
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
