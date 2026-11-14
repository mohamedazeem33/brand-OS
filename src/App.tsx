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
  Crosshair,
  Edit2,
  ExternalLink,
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
  MapPin,
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
import { parseMetaInstantFormUrl } from '@/lib/metaFormParser';

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

type Page = 'dashboard' | 'leads' | 'clients' | 'attendance' | 'finance' | 'team' | 'settings' | 'deleted_leads' | 'unqualified_leads';
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
  { id: 'attendance', label: 'Attendance', icon: UserCheck, adminOnly: true },
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
      ? ['dashboard', 'leads', 'clients', 'attendance', 'unqualified_leads', 'deleted_leads', 'finance', 'team', 'settings']
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
      {isAdmin && page === 'attendance' && <AttendanceAdminPage profile={profile} profiles={profiles} />}
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

// ============================================================================
// OFFICE GPS ATTENDANCE TYPES & HELPERS
// ============================================================================

type AttendanceSettings = {
  id: string;
  office_address: string;
  office_lat: number;
  office_lng: number;
  geofence_radius_meters: number;
  timezone: string;
  late_threshold_time: string;
  max_gps_accuracy_meters: number;
  updated_at?: string;
  updated_by?: string | null;
};

type AttendanceRecord = {
  id: string;
  profile_id: string;
  attendance_date: string;
  check_in_time: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_accuracy: number | null;
  check_in_distance_meters: number | null;
  check_out_time: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_accuracy: number | null;
  check_out_distance_meters: number | null;
  status: 'present' | 'late' | 'incomplete' | 'absent' | 'half_day';
  verification_status: 'verified' | 'flagged' | 'rejected' | 'manual_override';
  verification_notes?: string | null;
  is_corrected: boolean;
  corrected_by?: string | null;
  corrected_at?: string | null;
  correction_reason?: string | null;
  original_data?: any[] | null;
  created_at: string;
  updated_at: string;
};

function getTodayDateString(timeZone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function formatAttendanceTime(isoString: string | null | undefined, timeZone = 'Asia/Kolkata'): string {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return '—';
  }
}

function formatDistanceMeters(meters: number | null | undefined): string {
  if (meters == null || isNaN(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function calculateWorkDuration(checkIn: string | null | undefined, checkOut: string | null | undefined): string {
  if (!checkIn) return '—';
  const start = new Date(checkIn).getTime();
  const end = checkOut ? new Date(checkOut).getTime() : Date.now();
  if (isNaN(start) || isNaN(end) || end <= start) return '—';
  const diffMs = end - start;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function DashboardAttendanceWidget({ profile }: { profile: Profile }) {
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const todayStr = useMemo(() => getTodayDateString(), []);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const [settingsRes, recordRes] = await Promise.all([
        supabase.from('attendance_settings').select('*').eq('id', 'default').maybeSingle(),
        supabase.from('attendance_records').select('*').eq('profile_id', profile.id).eq('attendance_date', todayStr).maybeSingle(),
      ]);

      if (settingsRes.data) {
        setSettings(settingsRes.data);
      }
      if (recordRes.data) {
        setRecord(recordRes.data);
      } else {
        setRecord(null);
      }
    } catch (err: any) {
      console.error('Error loading attendance status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [profile.id, todayStr]);

  const handleAction = (action: 'check_in' | 'check_out') => {
    setMessage(null);
    if (!navigator.geolocation) {
      setMessage({ type: 'error', text: 'Geolocation is not supported by your browser.' });
      return;
    }

    setActionLoading(true);
    setMessage({
      type: 'info',
      text: 'Acquiring GPS location... Please allow browser location access when prompted.',
    });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        try {
          const rpcName = action === 'check_in' ? 'record_attendance_check_in' : 'record_attendance_check_out';
          const { data, error } = await supabase.rpc(rpcName, {
            p_latitude: latitude,
            p_longitude: longitude,
            p_accuracy: accuracy,
          });

          if (error) {
            setMessage({ type: 'error', text: error.message || `Failed to record ${action.replace('_', ' ')}.` });
            return;
          }

          if (data?.record) {
            setRecord(data.record);
            setMessage({ type: 'success', text: data.message || `Successfully recorded ${action.replace('_', ' ')}!` });
          } else {
            await loadAttendance();
            setMessage({ type: 'success', text: `Attendance updated successfully.` });
          }
        } catch (rpcErr: any) {
          setMessage({ type: 'error', text: rpcErr.message || 'Server error recording attendance.' });
        } finally {
          setActionLoading(false);
        }
      },
      (geoError) => {
        setActionLoading(false);
        if (geoError.code === 1) {
          setMessage({
            type: 'error',
            text: 'Location permission was denied. Please allow location access in your browser settings to verify your attendance within the office geofence.',
          });
        } else if (geoError.code === 2) {
          setMessage({
            type: 'error',
            text: 'GPS position unavailable. Please ensure your device location is enabled and try again.',
          });
        } else if (geoError.code === 3) {
          setMessage({
            type: 'error',
            text: 'Location request timed out. Please try again with clear GPS signal.',
          });
        } else {
          setMessage({
            type: 'error',
            text: 'GPS error: ' + (geoError.message || 'Could not acquire location.'),
          });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const isCheckedIn = !!record?.check_in_time;
  const isCheckedOut = !!record?.check_out_time;

  return (
    <section className="attendance-widget-card">
      <div className="attendance-widget-header">
        <div className="attendance-widget-title-group">
          <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <MapPin size={13} style={{ color: '#4a5c2d' }} />
            Office GPS Attendance / 100m Geofence
          </p>
          <h2>Today&apos;s Attendance</h2>
          <p>
            Registered Office: {settings?.office_address || '2/116, Daya Sadan Main Road, Pallavan Nagar, Koyambedu, Chennai'} • Timezone: {settings?.timezone || 'Asia/Kolkata'}
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ font: "11px 'DM Mono', monospace", color: '#77796f', textTransform: 'uppercase' }}>
            Shift Threshold: {settings?.late_threshold_time ? formatAttendanceTime(`1970-01-01T${settings.late_threshold_time}Z`) : '10:00 AM IST'}
          </span>
        </div>
      </div>

      <div className="attendance-widget-body">
        <div className="attendance-status-box">
          <div
            className={`attendance-status-icon-wrap ${
              isCheckedOut ? 'done' : isCheckedIn ? (record?.status === 'late' ? 'late' : 'active') : ''
            }`}
          >
            {isCheckedOut ? (
              <CheckCircle2 size={24} />
            ) : isCheckedIn ? (
              record?.status === 'late' ? <Clock3 size={24} /> : <Check size={24} />
            ) : (
              <MapPin size={24} />
            )}
          </div>

          <div className="attendance-status-details">
            {loading ? (
              <span>Checking attendance status...</span>
            ) : isCheckedOut ? (
              <>
                <strong>Workday Completed</strong>
                <span>
                  Checked In: {formatAttendanceTime(record.check_in_time)} • Checked Out: {formatAttendanceTime(record.check_out_time)} ({calculateWorkDuration(record.check_in_time, record.check_out_time)})
                </span>
              </>
            ) : isCheckedIn ? (
              <>
                <strong>
                  Checked In — {record.status === 'late' ? 'Late Arrival' : 'On Time'}
                  {record.verification_status === 'flagged' && <span style={{ color: '#986a30', fontSize: 11, fontWeight: 500, marginLeft: 8 }}>(Marginal GPS Accuracy)</span>}
                </strong>
                <span>
                  Checked in at {formatAttendanceTime(record.check_in_time)} ({formatDistanceMeters(record.check_in_distance_meters)} from office, ±{Math.round(record.check_in_accuracy || 0)}m GPS accuracy)
                </span>
              </>
            ) : (
              <>
                <strong>Not Checked In Today</strong>
                <span>
                  Attendance must be marked within 100 metres of the registered office. Device location will only be captured when you click Check In.
                </span>
              </>
            )}
          </div>
        </div>

        <div className="attendance-actions-group">
          <button
            type="button"
            className="attendance-btn-checkin"
            disabled={loading || actionLoading || isCheckedIn}
            onClick={() => handleAction('check_in')}
            title={isCheckedIn ? 'You have already checked in today' : 'Record check-in within office radius'}
          >
            <Crosshair size={16} />
            {isCheckedIn ? 'Checked In' : 'Check In'}
          </button>

          <button
            type="button"
            className="attendance-btn-checkout"
            disabled={loading || actionLoading || !isCheckedIn || isCheckedOut}
            onClick={() => handleAction('check_out')}
            title={
              !isCheckedIn
                ? 'Check in is required before checking out'
                : isCheckedOut
                ? 'Already checked out for today'
                : 'Record check-out within office radius'
            }
          >
            <LogOut size={16} />
            {isCheckedOut ? 'Checked Out' : 'Check Out'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`attendance-alert ${message.type}`}>
          {message.type === 'error' && <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
          {message.type === 'success' && <CheckCircle2 size={16} style={{ flexShrink: 0 }} />}
          {message.type === 'info' && <Clock size={16} style={{ flexShrink: 0 }} />}
          <div style={{ flex: 1 }}>{message.text}</div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            style={{ border: 0, background: 'none', color: 'inherit', padding: 2, cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </section>
  );
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

    {/* Office GPS Attendance Widget */}
    <DashboardAttendanceWidget profile={profile} />

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

// ============================================================================
// ADMIN ATTENDANCE MANAGEMENT COMPONENTS
// ============================================================================

function AttendanceAdminPage({
  profile,
  profiles,
}: {
  profile: Profile;
  profiles: Profile[];
}) {
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateString());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal states
  const [selectedCorrection, setSelectedCorrection] = useState<{
    record?: AttendanceRecord;
    profile: Profile;
    date: string;
  } | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  const activeProfiles = useMemo(() => profiles.filter((p) => p.is_active), [profiles]);
  const todayStr = useMemo(() => getTodayDateString(), []);

  const loadData = async () => {
    setLoading(true);
    setDataError('');
    try {
      const [settingsRes, recordsRes] = await Promise.all([
        supabase.from('attendance_settings').select('*').eq('id', 'default').maybeSingle(),
        supabase.from('attendance_records').select('*').eq('attendance_date', selectedDate),
      ]);

      if (settingsRes.error) throw settingsRes.error;
      if (recordsRes.error) throw recordsRes.error;

      if (settingsRes.data) setSettings(settingsRes.data);
      if (recordsRes.data) setRecords(recordsRes.data);
    } catch (err: any) {
      console.error('Error loading attendance admin data:', err);
      setDataError('Unable to load attendance records: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  // Quick date switches
  const handleSetToday = () => setSelectedDate(todayStr);
  const handleSetYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(getTodayDateString());
    // Use manual date calc for yesterday
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    setSelectedDate(`${y}-${m}-${day}`);
  };

  // Metrics computation for selected date
  const metrics = useMemo(() => {
    const totalActive = activeProfiles.length;
    const checkedInCount = records.filter((r) => r.check_in_time).length;
    const onTimeCount = records.filter((r) => r.status === 'present').length;
    const lateCount = records.filter((r) => r.status === 'late').length;
    const incompleteCount = records.filter((r) => r.check_in_time && !r.check_out_time).length;
    const absentCount = Math.max(0, totalActive - checkedInCount);

    return { totalActive, checkedInCount, onTimeCount, lateCount, incompleteCount, absentCount };
  }, [activeProfiles, records]);

  // Filtered rows
  const filteredEmployees = useMemo(() => {
    return activeProfiles.filter((emp) => {
      // Search filter
      const matchesSearch =
        !searchQuery.trim() ||
        emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase());

      // Role filter
      const matchesRole = roleFilter === 'all' || emp.role === roleFilter;

      // Status filter
      const matchedRecord = records.find((r) => r.profile_id === emp.id);
      let derivedStatus = 'absent';
      if (matchedRecord) {
        if (!matchedRecord.check_out_time && selectedDate < todayStr) {
          derivedStatus = 'incomplete';
        } else {
          derivedStatus = matchedRecord.status;
        }
      }

      const matchesStatus = statusFilter === 'all' || derivedStatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [activeProfiles, records, searchQuery, roleFilter, statusFilter, selectedDate, todayStr]);

  return (
    <div className="page-content">
      <div className="page-title-row">
        <div>
          <span className="section-tag">Office Operations</span>
          <h1>Attendance</h1>
          <p className="subtitle">
            Monitor real-time team presence, office GPS geofence verification, and working hours.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="outline-button"
            onClick={() => setShowSettingsModal(true)}
            style={{ fontSize: 12, padding: '10px 16px' }}
          >
            <Settings size={15} />
            Office Settings
          </button>

          <button
            type="button"
            className="lime-button"
            onClick={() => setShowManualModal(true)}
            style={{ fontSize: 12, padding: '10px 16px' }}
          >
            <CirclePlus size={15} />
            Manual Entry
          </button>
        </div>
      </div>

      {/* Date Navigator & Filters Bar */}
      <div className="filter-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', border: '1px solid #dadad2', padding: '0 12px', height: 42 }}>
          <Calendar size={15} style={{ color: '#77796f' }} />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ border: 0, outline: 0, background: 'transparent', fontSize: 13, color: '#20221d', cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className={`outline-button ${selectedDate === todayStr ? 'active' : ''}`}
            onClick={handleSetToday}
            style={{
              height: 42,
              padding: '0 14px',
              fontSize: 12,
              background: selectedDate === todayStr ? '#20221d' : '#fff',
              color: selectedDate === todayStr ? '#c3f05a' : '#20221d',
              borderColor: '#dadad2',
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={handleSetYesterday}
            style={{
              height: 42,
              padding: '0 14px',
              fontSize: 12,
              background: '#fff',
              color: '#20221d',
              borderColor: '#dadad2',
            }}
          >
            Yesterday
          </button>
        </div>

        <div className="search-box" style={{ height: 42, flex: 1, minWidth: 200 }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Search employee by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-select" style={{ height: 42 }}>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            <option value="sales">Sales</option>
            <option value="editor">Editor</option>
            <option value="script_writer">Script Writer</option>
            <option value="social_media_manager">Social Media</option>
            <option value="finance">Finance</option>
            <option value="admin">Admin</option>
            <option value="employee">Employee</option>
          </select>
        </div>

        <div className="filter-select" style={{ height: 42 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="present">Present (On Time)</option>
            <option value="late">Late Arrival</option>
            <option value="incomplete">Incomplete / Missing Check-Out</option>
            <option value="absent">Absent / Not Checked In</option>
            <option value="half_day">Half Day</option>
          </select>
        </div>
      </div>

      {/* Summary Metrics */}
      <section className="admin-attendance-grid">
        <div className="admin-attendance-metric">
          <div className="metric-top">
            <span>Active Team</span>
            <UsersRound size={16} />
          </div>
          <strong>{metrics.totalActive}</strong>
          <small>Total active staff</small>
        </div>

        <div className="admin-attendance-metric">
          <div className="metric-top">
            <span>On Time</span>
            <CheckCircle2 size={16} style={{ color: '#43724e' }} />
          </div>
          <strong style={{ color: '#386342' }}>{metrics.onTimeCount}</strong>
          <small>Before threshold ({settings?.late_threshold_time?.slice(0, 5) || '10:00'})</small>
        </div>

        <div className="admin-attendance-metric">
          <div className="metric-top">
            <span>Late Arrivals</span>
            <Clock3 size={16} style={{ color: '#986a30' }} />
          </div>
          <strong style={{ color: '#986a30' }}>{metrics.lateCount}</strong>
          <small>After threshold</small>
        </div>

        <div className="admin-attendance-metric">
          <div className="metric-top">
            <span>Incomplete</span>
            <AlertTriangle size={16} style={{ color: '#99544a' }} />
          </div>
          <strong style={{ color: '#99544a' }}>{metrics.incompleteCount}</strong>
          <small>Missing check-out</small>
        </div>

        <div className="admin-attendance-metric">
          <div className="metric-top">
            <span>Not Checked In</span>
            <Clock size={16} style={{ color: '#77796f' }} />
          </div>
          <strong style={{ color: '#555850' }}>{metrics.absentCount}</strong>
          <small>No check-in record</small>
        </div>
      </section>

      {/* Attendance Table */}
      {dataError && (
        <div className="attendance-alert error" style={{ marginBottom: 20 }}>
          <AlertTriangle size={16} />
          <span>{dataError}</span>
          <button type="button" onClick={loadData} className="outline-button" style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: 11 }}>
            Retry
          </button>
        </div>
      )}

      <div className="lead-table-wrap">
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: 'auto' }} />
            <p style={{ marginTop: 12, color: '#77796f', fontSize: 13 }}>Loading attendance records for {selectedDate}...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <p style={{ color: '#77796f', fontSize: 14 }}>No employee records match the selected filters for {selectedDate}.</p>
          </div>
        ) : (
          <table className="lead-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Status</th>
                <th>Check-In</th>
                <th>Check-Out</th>
                <th>Work Hours</th>
                <th>Verification & Audit</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => {
                const rec = records.find((r) => r.profile_id === emp.id);

                let displayStatus = 'absent';
                if (rec) {
                  if (!rec.check_out_time && selectedDate < todayStr) {
                    displayStatus = 'incomplete';
                  } else {
                    displayStatus = rec.status;
                  }
                }

                return (
                  <tr key={emp.id}>
                    <td>
                      <div className="table-person">
                        <div className="small-avatar">{emp.full_name.slice(0, 1).toUpperCase()}</div>
                        <div>
                          <strong>{emp.full_name}</strong>
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span className={`team-role-pill ${emp.role}`} style={{ padding: '2px 6px', fontSize: 9 }}>
                              {emp.role.split('_').join(' ')}
                            </span>
                            <span style={{ color: '#8d9488', fontSize: 11 }}>{emp.email}</span>
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className={`att-pill ${displayStatus}`}>
                        {displayStatus === 'present'
                          ? 'Present'
                          : displayStatus === 'late'
                          ? 'Late Arrival'
                          : displayStatus === 'incomplete'
                          ? 'Incomplete'
                          : displayStatus === 'half_day'
                          ? 'Half Day'
                          : 'Not Checked In'}
                      </span>
                    </td>

                    <td>
                      {rec?.check_in_time ? (
                        <div>
                          <strong style={{ fontSize: 12, color: '#20221d', display: 'block' }}>
                            {formatAttendanceTime(rec.check_in_time)}
                          </strong>
                          <span style={{ fontSize: 11, color: '#77796f', display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span>{formatDistanceMeters(rec.check_in_distance_meters)}</span>
                            <span>•</span>
                            <span>±{Math.round(rec.check_in_accuracy || 0)}m</span>
                            {rec.check_in_lat && rec.check_in_lng && (
                              <a
                                href={`https://www.google.com/maps?q=${rec.check_in_lat},${rec.check_in_lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="map-pin-link"
                                title="View check-in GPS coordinates on Google Maps"
                              >
                                <MapPin size={11} />
                                Map
                                <ExternalLink size={9} />
                              </a>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#a3a99f' }}>—</span>
                      )}
                    </td>

                    <td>
                      {rec?.check_out_time ? (
                        <div>
                          <strong style={{ fontSize: 12, color: '#20221d', display: 'block' }}>
                            {formatAttendanceTime(rec.check_out_time)}
                          </strong>
                          <span style={{ fontSize: 11, color: '#77796f', display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span>{formatDistanceMeters(rec.check_out_distance_meters)}</span>
                            {rec.check_out_lat && rec.check_out_lng && (
                              <a
                                href={`https://www.google.com/maps?q=${rec.check_out_lat},${rec.check_out_lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="map-pin-link"
                                title="View check-out GPS coordinates on Google Maps"
                              >
                                <MapPin size={11} />
                                Map
                                <ExternalLink size={9} />
                              </a>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#a3a99f' }}>—</span>
                      )}
                    </td>

                    <td>
                      <span style={{ font: "12px 'DM Mono', monospace", color: '#30342d' }}>
                        {calculateWorkDuration(rec?.check_in_time, rec?.check_out_time)}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {rec ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span className={`att-pill ${rec.verification_status}`}>
                              {rec.verification_status === 'verified'
                                ? 'GPS Verified'
                                : rec.verification_status === 'flagged'
                                ? 'GPS Flagged'
                                : rec.verification_status === 'manual_override'
                                ? 'Manual Override'
                                : rec.verification_status}
                            </span>
                            {rec.is_corrected && (
                              <span
                                className="att-pill manual"
                                title={rec.correction_reason || 'Record corrected by Admin'}
                              >
                                Audited
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#8c9388' }}>Unrecorded</span>
                        )}

                        {rec?.is_corrected && rec.correction_reason && (
                          <span style={{ fontSize: 10, color: '#77796f', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.correction_reason}>
                            Reason: {rec.correction_reason}
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="outline-button"
                        style={{ padding: '5px 10px', fontSize: 11 }}
                        onClick={() => setSelectedCorrection({ record: rec, profile: emp, date: selectedDate })}
                      >
                        {rec ? 'Correct' : 'Mark'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Auditable Attendance Correction Modal */}
      {selectedCorrection && (
        <AttendanceCorrectionModal
          target={selectedCorrection}
          settings={settings}
          onClose={() => setSelectedCorrection(null)}
          onSuccess={() => {
            setSelectedCorrection(null);
            loadData();
          }}
        />
      )}

      {/* Office & Geofence Settings Modal */}
      {showSettingsModal && (
        <AttendanceSettingsModal
          settings={settings}
          onClose={() => setShowSettingsModal(false)}
          onSuccess={(newSettings) => {
            setSettings(newSettings);
            setShowSettingsModal(false);
          }}
        />
      )}

      {/* Manual Entry Modal */}
      {showManualModal && (
        <AttendanceManualEntryModal
          profiles={activeProfiles}
          defaultDate={selectedDate}
          onClose={() => setShowManualModal(false)}
          onSuccess={() => {
            setShowManualModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// AUDITABLE ATTENDANCE CORRECTION MODAL
// ----------------------------------------------------------------------------

function AttendanceCorrectionModal({
  target,
  settings,
  onClose,
  onSuccess,
}: {
  target: { record?: AttendanceRecord; profile: Profile; date: string };
  settings: AttendanceSettings | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { record, profile, date } = target;
  const isEditing = !!record;

  const [status, setStatus] = useState<AttendanceRecord['status']>(record?.status || 'present');
  const [checkInTime, setCheckInTime] = useState<string>(() => {
    if (!record?.check_in_time) return '09:30';
    const d = new Date(record.check_in_time);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  });
  const [checkOutTime, setCheckOutTime] = useState<string>(() => {
    if (!record?.check_out_time) return '';
    const d = new Date(record.check_out_time);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  });
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('A detailed correction reason (minimum 5 characters) is mandatory for audit trail compliance.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Build ISO timestamps in UTC corresponding to the date and time in Asia/Kolkata
      let checkInIso: string | null = null;
      let checkOutIso: string | null = null;

      if (checkInTime) {
        checkInIso = new Date(`${date}T${checkInTime}:00+05:30`).toISOString();
      }
      if (checkOutTime) {
        checkOutIso = new Date(`${date}T${checkOutTime}:00+05:30`).toISOString();
      }

      if (isEditing && record) {
        const { error: rpcError } = await supabase.rpc('admin_correct_attendance', {
          p_record_id: record.id,
          p_status: status,
          p_check_in_time: checkInIso,
          p_check_out_time: checkOutIso,
          p_reason: reason.trim(),
        });
        if (rpcError) throw rpcError;
      } else {
        const { error: rpcError } = await supabase.rpc('admin_create_attendance_record', {
          p_employee_id: profile.id,
          p_attendance_date: date,
          p_status: status,
          p_check_in_time: checkInIso,
          p_check_out_time: checkOutIso,
          p_reason: reason.trim(),
        });
        if (rpcError) throw rpcError;
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to apply attendance adjustment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="confirm-dialog" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Audited Correction</span>
            <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700 }}>
              {isEditing ? 'Adjust Attendance' : 'Mark Manual Attendance'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#77796f' }}>
              Employee: <strong>{profile.full_name}</strong> • Date: <strong>{date}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#77796f' }}>
            <X size={18} />
          </button>
        </div>

        {/* Audit Notice */}
        <div style={{ padding: '10px 14px', background: '#fcf8ee', border: '1px solid #ebd9b5', borderRadius: 6, fontSize: 11, color: '#7a5a22', marginBottom: 18 }}>
          <strong>Immutable Audit Trail:</strong> Original GPS coordinates, distances, and server timestamps are permanently retained in the audit history.
        </div>

        {/* Existing Evidence Display */}
        {record && (
          <div style={{ padding: '12px 14px', background: '#f5f7f2', border: '1px solid #dce0d5', borderRadius: 6, fontSize: 12, marginBottom: 18 }}>
            <div style={{ fontWeight: 600, color: '#33382d', marginBottom: 6 }}>Recorded Evidence:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, color: '#687064' }}>
              <div>Original Check-In: <strong>{formatAttendanceTime(record.check_in_time)}</strong></div>
              <div>Original Check-Out: <strong>{formatAttendanceTime(record.check_out_time)}</strong></div>
              <div>Office Distance: <strong>{formatDistanceMeters(record.check_in_distance_meters)}</strong></div>
              <div>GPS Accuracy: <strong>±{Math.round(record.check_in_accuracy || 0)}m</strong></div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Attendance Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              >
                <option value="present">Present (On Time)</option>
                <option value="late">Late Arrival</option>
                <option value="half_day">Half Day</option>
                <option value="incomplete">Incomplete</option>
                <option value="absent">Absent</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Shift Threshold</label>
              <input
                type="text"
                disabled
                value={settings?.late_threshold_time ? `${settings.late_threshold_time.slice(0, 5)} IST` : '10:00 IST'}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#f5f5f4', fontSize: 13, color: '#78716c' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Check-In Time</label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Check-Out Time</label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>
              Correction Reason <span style={{ color: '#99544a' }}>*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approved on-duty client visit; GPS device malfunction verified in person..."
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13, resize: 'vertical' }}
            />
            <small style={{ color: '#77796f', fontSize: 10 }}>Minimum 5 characters. Stored permanently in audit log.</small>
          </div>

          {error && (
            <div className="attendance-alert error" style={{ marginBottom: 16 }}>
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="drawer-footer" style={{ borderTop: '1px solid #dadad2', paddingTop: 16 }}>
            <button type="button" className="outline-button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="lime-button" disabled={loading}>
              {loading ? 'Saving Correction…' : 'Save Correction'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------------
// OFFICE & GEOFENCE SETTINGS MODAL
// ----------------------------------------------------------------------------

function AttendanceSettingsModal({
  settings,
  onClose,
  onSuccess,
}: {
  settings: AttendanceSettings | null;
  onClose: () => void;
  onSuccess: (updated: AttendanceSettings) => void;
}) {
  const [address, setAddress] = useState(
    settings?.office_address || '2/116, Daya Sadan Main Road, Pallavan Nagar, Koyambedu, Chennai, Tamil Nadu 600107, India'
  );
  const [lat, setLat] = useState(settings?.office_lat?.toString() || '13.0693169');
  const [lng, setLng] = useState(settings?.office_lng?.toString() || '80.1814571');
  const [radius, setRadius] = useState(settings?.geofence_radius_meters?.toString() || '100');
  const [timezone, setTimezone] = useState(settings?.timezone || 'Asia/Kolkata');
  const [lateTime, setLateTime] = useState(settings?.late_threshold_time || '10:00:00');
  const [maxAccuracy, setMaxAccuracy] = useState(settings?.max_gps_accuracy_meters?.toString() || '150');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      const parsedRadius = parseInt(radius, 10);
      const parsedMaxAccuracy = parseFloat(maxAccuracy);

      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) throw new Error('Invalid latitude.');
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) throw new Error('Invalid longitude.');
      if (isNaN(parsedRadius) || parsedRadius < 10) throw new Error('Geofence radius must be at least 10 metres.');
      if (isNaN(parsedMaxAccuracy) || parsedMaxAccuracy < 10) throw new Error('Max accuracy threshold must be at least 10 metres.');

      const payload = {
        office_address: address.trim(),
        office_lat: parsedLat,
        office_lng: parsedLng,
        geofence_radius_meters: parsedRadius,
        timezone: timezone.trim(),
        late_threshold_time: lateTime,
        max_gps_accuracy_meters: parsedMaxAccuracy,
        updated_at: new Date().toISOString(),
      };

      const { data, error: updateError } = await supabase
        .from('attendance_settings')
        .update(payload)
        .eq('id', 'default')
        .select()
        .single();

      if (updateError) throw updateError;
      onSuccess(data);
    } catch (err: any) {
      setError(err.message || 'Failed to save office settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="confirm-dialog" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Location & Policy</span>
            <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700 }}>Office Geofence Settings</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#77796f' }}>
              These parameters are stored securely in Supabase and enforced server-side on all check-ins.
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#77796f' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Registered Office Address</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Latitude</label>
              <input
                type="number"
                step="any"
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Longitude</label>
              <input
                type="number"
                step="any"
                required
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Geofence Radius (metres)</label>
              <input
                type="number"
                min="10"
                max="5000"
                required
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
              <small style={{ color: '#77796f', fontSize: 10 }}>Standard: 100 metres</small>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Late Arrival Threshold</label>
              <input
                type="time"
                step="1"
                required
                value={lateTime.slice(0, 5)}
                onChange={(e) => setLateTime(`${e.target.value}:00`)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
              <small style={{ color: '#77796f', fontSize: 10 }}>Default: 10:00 AM IST</small>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Timezone</label>
              <input
                type="text"
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
              <small style={{ color: '#77796f', fontSize: 10 }}>Default: Asia/Kolkata</small>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Max GPS Accuracy (metres)</label>
              <input
                type="number"
                min="20"
                max="1000"
                required
                value={maxAccuracy}
                onChange={(e) => setMaxAccuracy(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
              <small style={{ color: '#77796f', fontSize: 10 }}>Rejects readings worse than ±150m</small>
            </div>
          </div>

          {error && (
            <div className="attendance-alert error" style={{ marginBottom: 16 }}>
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="drawer-footer" style={{ borderTop: '1px solid #dadad2', paddingTop: 16 }}>
            <button type="button" className="outline-button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="lime-button" disabled={loading}>
              {loading ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------------
// MANUAL ATTENDANCE ENTRY MODAL
// ----------------------------------------------------------------------------

function AttendanceManualEntryModal({
  profiles,
  defaultDate,
  onClose,
  onSuccess,
}: {
  profiles: Profile[];
  defaultDate: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(profiles[0]?.id || '');
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState<AttendanceRecord['status']>('present');
  const [checkInTime, setCheckInTime] = useState('09:30');
  const [checkOutTime, setCheckOutTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      setError('Please select an employee.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('A detailed reason (minimum 5 characters) is required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let checkInIso: string | null = null;
      let checkOutIso: string | null = null;
      if (checkInTime) {
        checkInIso = new Date(`${date}T${checkInTime}:00+05:30`).toISOString();
      }
      if (checkOutTime) {
        checkOutIso = new Date(`${date}T${checkOutTime}:00+05:30`).toISOString();
      }

      const { error: rpcError } = await supabase.rpc('admin_create_attendance_record', {
        p_employee_id: employeeId,
        p_attendance_date: date,
        p_status: status,
        p_check_in_time: checkInIso,
        p_check_out_time: checkOutIso,
        p_reason: reason.trim(),
      });

      if (rpcError) throw rpcError;
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create manual attendance entry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="confirm-dialog" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Manual Override</span>
            <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700 }}>Record Manual Attendance</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#77796f' }}>
              Create an attendance record for staff on approved leave, client site visit, or missing device entry.
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#77796f' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Employee</label>
            <select
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.role.split('_').join(' ')}) — {p.email}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Attendance Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              >
                <option value="present">Present (On Time)</option>
                <option value="late">Late Arrival</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Check-In Time</label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>Check-Out Time</label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#515850', marginBottom: 6 }}>
              Reason for Manual Entry <span style={{ color: '#99544a' }}>*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Employee visited client on-site in Guindy with director approval..."
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #dadad2', background: '#fff', fontSize: 13, resize: 'vertical' }}
            />
          </div>

          {error && (
            <div className="attendance-alert error" style={{ marginBottom: 16 }}>
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="drawer-footer" style={{ borderTop: '1px solid #dadad2', paddingTop: 16 }}>
            <button type="button" className="outline-button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="lime-button" disabled={loading}>
              {loading ? 'Creating Entry…' : 'Record Entry'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type MetaLeadForm = {
  id: string;
  name: string;
  meta_form_name?: string;
  status?: string;
  connection_status?: 'saved' | 'connected' | 'receiving_leads';
  page_id?: string;
  verified_page_id?: string;
  verified_at?: string;
  verified_by?: string;
  verification_sig?: string;
  source_url?: string;
  created_at?: string;
  updated_at?: string;
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

  // Meta Instant Form manager state
  const [instantFormLink, setInstantFormLink] = useState('');
  const [instantFormName, setInstantFormName] = useState('');
  const [verifyingForm, setVerifyingForm] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [editingFormName, setEditingFormName] = useState('');
  const [formActionInProgress, setFormActionInProgress] = useState<string | null>(null);

  // Real-time link validation and ID extraction
  const parsedFormLink = useMemo(() => {
    if (!instantFormLink.trim()) return null;
    return parseMetaInstantFormUrl(instantFormLink);
  }, [instantFormLink]);

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

  // Meta Lead Form Manager actions via Admin backend service
  const handleAddForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instantFormLink.trim()) return;

    setVerifyingForm(true);
    setFormFeedback(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('team-admin', {
        body: {
          action: 'verify_and_register_meta_form',
          form_url: instantFormLink.trim(),
          custom_name: instantFormName.trim(),
        },
      });

      if (fnError || !data?.success) {
        const errorMsg = data?.error || fnError?.message || 'Verification failed.';
        setFormFeedback({
          type: 'error',
          message: errorMsg,
        });
        return;
      }

      setFormFeedback({
        type: 'success',
        message: data.message || `Form verified with Meta and registered successfully.`,
      });
      setInstantFormLink('');
      setInstantFormName('');
      if (data.forms && settings) {
        setSettings({ ...settings, meta_lead_forms: data.forms });
      } else {
        await loadSettings();
      }
    } catch (err: any) {
      console.error('Error verifying form:', err);
      setFormFeedback({
        type: 'error',
        message: err.message || 'An unexpected error occurred during form verification.',
      });
    } finally {
      setVerifyingForm(false);
    }
  };

  const handleToggleFormStatus = async (formItem: MetaLeadForm) => {
    setFormActionInProgress(formItem.id);
    setFormFeedback(null);
    try {
      // If form is unverified or missing cryptographic signature, route to verify_and_register_meta_form
      if (!formItem.verification_sig) {
        const { data, error: fnError } = await supabase.functions.invoke('team-admin', {
          body: {
            action: 'verify_and_register_meta_form',
            form_id: formItem.id,
            custom_name: formItem.name,
          },
        });

        if (fnError || !data?.success) {
          setFormFeedback({
            type: 'error',
            message: data?.error || fnError?.message || 'Failed to verify and sign form with Meta.',
          });
          return;
        }

        setFormFeedback({
          type: 'success',
          message: data.message || 'Form verified with Meta and sealed successfully.',
        });
        if (data.forms && settings) {
          setSettings({ ...settings, meta_lead_forms: data.forms });
        } else {
          await loadSettings();
        }
        return;
      }

      const nextStatus = formItem.status === 'active' ? 'inactive' : 'active';
      const { data, error: fnError } = await supabase.functions.invoke('team-admin', {
        body: {
          action: 'set_meta_form_status',
          form_id: formItem.id,
          status: nextStatus,
        },
      });

      if (fnError || !data?.success) {
        setFormFeedback({
          type: 'error',
          message: data?.error || fnError?.message || 'Failed to update form status.',
        });
        return;
      }

      setFormFeedback({
        type: 'success',
        message: data.message || `Form status updated to ${nextStatus}.`,
      });
      if (data.forms && settings) {
        setSettings({ ...settings, meta_lead_forms: data.forms });
      } else {
        await loadSettings();
      }
    } catch (err: any) {
      setFormFeedback({ type: 'error', message: err.message || 'Error updating form status.' });
    } finally {
      setFormActionInProgress(null);
    }
  };

  const handleSaveRename = async (formId: string) => {
    if (!editingFormName.trim()) return;
    setFormActionInProgress(formId);
    setFormFeedback(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('team-admin', {
        body: {
          action: 'rename_meta_form',
          form_id: formId,
          new_name: editingFormName.trim(),
        },
      });

      if (fnError || !data?.success) {
        setFormFeedback({
          type: 'error',
          message: data?.error || fnError?.message || 'Failed to rename form.',
        });
        return;
      }

      setFormFeedback({
        type: 'success',
        message: data.message || 'Form renamed successfully.',
      });
      setEditingFormId(null);
      setEditingFormName('');
      if (data.forms && settings) {
        setSettings({ ...settings, meta_lead_forms: data.forms });
      } else {
        await loadSettings();
      }
    } catch (err: any) {
      setFormFeedback({ type: 'error', message: err.message || 'Error renaming form.' });
    } finally {
      setFormActionInProgress(null);
    }
  };

  const handleRemoveForm = async (formItem: MetaLeadForm) => {
    if (!window.confirm(`Are you sure you want to deactivate and remove '${formItem.name}' (${formItem.id}) from the active forms list? Historical leads will remain intact.`)) {
      return;
    }
    setFormActionInProgress(formItem.id);
    setFormFeedback(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('team-admin', {
        body: {
          action: 'remove_meta_form',
          form_id: formItem.id,
        },
      });

      if (fnError || !data?.success) {
        setFormFeedback({
          type: 'error',
          message: data?.error || fnError?.message || 'Failed to deactivate form.',
        });
        return;
      }

      setFormFeedback({
        type: 'success',
        message: data.message || 'Form deactivated and removed from active list.',
      });
      if (data.forms && settings) {
        setSettings({ ...settings, meta_lead_forms: data.forms });
      } else {
        await loadSettings();
      }
    } catch (err: any) {
      setFormFeedback({ type: 'error', message: err.message || 'Error deactivating form.' });
    } finally {
      setFormActionInProgress(null);
    }
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
                <h2>Meta Instant Form Manager</h2>
                <p>Register, verify, and manage Facebook Instant Forms authorized to feed sales leads into Taha Media.</p>
              </div>

              {formFeedback && (
                <div className={`settings-alert ${formFeedback.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 18 }}>
                  {formFeedback.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                  <span>{formFeedback.message}</span>
                </div>
              )}

              {/* Add Form Link Card */}
              <div className="meta-link-input-card">
                <form onSubmit={handleAddForm} className="meta-link-input-row">
                  <div className="meta-link-input-fields">
                    <input
                      type="text"
                      placeholder="Paste Meta Instant Form link or numeric Form ID"
                      value={instantFormLink}
                      onChange={(e) => setInstantFormLink(e.target.value)}
                      disabled={verifyingForm}
                    />
                    <input
                      type="text"
                      placeholder="Custom display name (e.g. Client Enquiry Form)"
                      value={instantFormName}
                      onChange={(e) => setInstantFormName(e.target.value)}
                      disabled={verifyingForm}
                    />

                    {parsedFormLink && (
                      <div style={{ marginTop: 2 }}>
                        {parsedFormLink.isValid ? (
                          <span className="meta-detection-pill valid">
                            <Check size={12} />
                            Detected Form ID: <code>{parsedFormLink.formId}</code>
                            {parsedFormLink.pageId && ` (Page: ${parsedFormLink.pageId})`}
                          </span>
                        ) : (
                          <span className="meta-detection-pill invalid">
                            <AlertTriangle size={12} />
                            {parsedFormLink.error}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="lime-button"
                    style={{ minHeight: 40, whiteSpace: 'nowrap' }}
                    disabled={verifyingForm || !instantFormLink.trim() || (parsedFormLink !== null && !parsedFormLink.isValid)}
                  >
                    <Plus size={15} />
                    <span>{verifyingForm ? 'Verifying with Meta…' : 'Add Form'}</span>
                  </button>
                </form>
              </div>

              {/* Approved Instant Forms Listing */}
              <div className="lead-forms-section">
                <div className="lead-forms-header" style={{ marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: '#20221d' }}>Approved Instant Forms</h3>
                    <p style={{ fontSize: 12, color: '#687064', margin: 0 }}>
                      Only active forms verified to belong to Taha Media Page <code>104523992487431</code> create CRM leads.
                    </p>
                  </div>
                </div>

                {(!settings?.meta_lead_forms || settings.meta_lead_forms.length === 0) ? (
                  <div className="empty-state-box" style={{ padding: '30px 20px', textAlign: 'center', background: '#fafbf8', borderRadius: 8, border: '1px dashed #dcdfd5' }}>
                    <p style={{ margin: 0, color: '#687064', fontSize: 13 }}>No approved Instant Forms registered yet. Paste a Meta Form link above to register your first campaign form.</p>
                  </div>
                ) : (
                  <div className="meta-forms-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {settings.meta_lead_forms.map((formItem) => {
                      const isEditing = editingFormId === formItem.id;
                      const isSigned = !!(formItem.verification_sig && formItem.verification_sig.trim());
                      const isActive = formItem.status === 'active' && isSigned;
                      const isBusy = formActionInProgress === formItem.id;

                      return (
                        <div key={formItem.id} className="meta-form-row">
                          <div className="meta-form-info" style={{ flex: 1 }}>
                            <div className="meta-form-icon">
                              <FileText size={16} />
                            </div>
                            <div className="meta-form-text" style={{ flex: 1 }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                                  <input
                                    type="text"
                                    value={editingFormName}
                                    onChange={(e) => setEditingFormName(e.target.value)}
                                    style={{ fontSize: 13, padding: '4px 8px', maxWidth: 280 }}
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    className="lime-button"
                                    style={{ padding: '4px 10px', fontSize: 11, minHeight: 28 }}
                                    disabled={isBusy || !editingFormName.trim()}
                                    onClick={() => handleSaveRename(formItem.id)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="outline-button"
                                    style={{ padding: '4px 10px', fontSize: 11, minHeight: 28 }}
                                    disabled={isBusy}
                                    onClick={() => setEditingFormId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="meta-form-name-row">
                                    <strong style={{ fontSize: 13, color: '#20221d' }}>{formItem.name}</strong>
                                    {formItem.meta_form_name && formItem.meta_form_name !== formItem.name && (
                                      <small style={{ fontSize: 11, color: '#7b8375' }}>({formItem.meta_form_name})</small>
                                    )}
                                  </div>
                                  <div className="meta-form-id-meta">
                                    <span>Form ID: <code>{formItem.id}</code></span>
                                    <span>•</span>
                                    <span>Page: <code>{formItem.verified_page_id || formItem.page_id || '104523992487431'}</code></span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="meta-form-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {!isSigned ? (
                              <span className="system-status-pill unverified" title="Missing cryptographic verification signature. Must be verified with Meta to activate.">
                                Unverified
                              </span>
                            ) : (
                              <span className={`system-status-pill ${isActive ? 'verified' : 'unverified'}`}>
                                {isActive ? 'Active' : 'Inactive'}
                              </span>
                            )}

                            <button
                              type="button"
                              className="outline-button"
                              style={{ fontSize: 11, padding: '4px 10px', minHeight: 28 }}
                              disabled={isBusy}
                              onClick={() => handleToggleFormStatus(formItem)}
                              title={!isSigned ? 'Verify and sign form with Meta' : (isActive ? 'Deactivate form' : 'Activate form')}
                            >
                              {!isSigned ? 'Verify' : (isActive ? 'Deactivate' : 'Activate')}
                            </button>

                            {!isEditing && (
                              <button
                                type="button"
                                className="icon-button"
                                title="Rename form"
                                disabled={isBusy}
                                onClick={() => {
                                  setEditingFormId(formItem.id);
                                  setEditingFormName(formItem.name);
                                }}
                              >
                                <Edit2 size={14} style={{ color: '#4a5240' }} />
                              </button>
                            )}

                            <button
                              type="button"
                              className="icon-button"
                              title="Remove form from active list"
                              disabled={isBusy}
                              onClick={() => handleRemoveForm(formItem)}
                            >
                              <Trash2 size={14} style={{ color: '#99544a' }} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="meta-info-card">
                  <div className="meta-info-card-icon">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="meta-info-card-content">
                    <h4>Cryptographic Whitelist Protection</h4>
                    <p>
                      Every approved form is verified with Meta Graph API v26.0 and sealed with a backend cryptographic signature.
                      Submissions from unapproved, deactivated, or foreign-page forms are automatically discarded to prevent recruitment or irrelevant forms from entering your sales pipeline.
                    </p>
                  </div>
                </div>
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
