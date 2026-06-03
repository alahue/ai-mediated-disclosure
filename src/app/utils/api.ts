let currentPin: string | null = null;

export function setApiPin(pin: string | null) {
  currentPin = pin;
}

export function getApiPin(): string | null {
  return currentPin;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (currentPin) {
    headers['X-User-PIN'] = currentPin;
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export async function login(pin: string) {
  const result = await request<{ success: boolean; user: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  setApiPin(pin);
  return result;
}

export async function logout() {
  await request('/auth/logout', { method: 'POST' });
  setApiPin(null);
}

// Study
export async function getToday() {
  return request<any>('/study/today');
}

// Journal Entries
export async function getEntries() {
  return request<any[]>('/entries');
}

export async function createEntry(payload: {
  content: string;
  write_start_time?: string | null;
  write_complete_time?: string | null;
}) {
  return request<any>('/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEntry(id: string, updates: Record<string, any>) {
  return request<any>(`/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteEntry(id: string) {
  return request<{ success: boolean }>(`/entries/${id}`, { method: 'DELETE' });
}

// Sharing
export interface MediateResult {
  polished_entry: string;
  explanation: string;
  warning: string | null;
  validation_passed: boolean;
  validation_issues: string[];
}

export async function mediateEntry(params: {
  entryId: string;
  intention: string;
  excerpt: string;
  regenerate?: boolean;
}) {
  return request<MediateResult>('/sharing/mediate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function approveSharing(payload: {
  entryId: string;
  intention: string;
  selected_excerpt: string;
  final_shared_text: string;
  ai_action?: string | null;
  regeneration_count?: number;
  ai_suggestion?: string | null;
  explanation?: string | null;
  warning?: string | null;
}) {
  return request<{ success: boolean }>('/sharing/approve', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cancelSharing(payload: {
  entryId: string;
  intention?: string | null;
  selected_excerpt?: string | null;
  ai_action?: string | null;
  regeneration_count?: number;
}) {
  return request<{ success: boolean }>('/sharing/cancel', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Peer exchanges (rotating dyad routing)
export interface RespondView {
  id: string;
  entry_index: number;
  shared_text: string;
  intention: string | null;
  peer_label: string;
  already_responded: boolean;
  what_i_heard: string | null;
  what_im_wondering: string | null;
  what_i_suggest: string | null;
}

export async function claimExchange(entryIndex: number) {
  return request<{ exchange: RespondView }>('/exchanges/claim', {
    method: 'POST',
    body: JSON.stringify({ entry_index: entryIndex }),
  });
}

export async function submitExchangeResponse(
  exchangeId: string,
  response: { what_i_heard: string; what_im_wondering: string; what_i_suggest: string }
) {
  return request<{ success: boolean }>(`/exchanges/${exchangeId}/respond`, {
    method: 'POST',
    body: JSON.stringify(response),
  });
}

export async function getResponseForEntry(entryId: string) {
  return request<{
    exists: boolean;
    responded: boolean;
    status?: string;
    peer_label?: string;
    intention?: string | null;
    what_i_heard?: string;
    what_im_wondering?: string;
    what_i_suggest?: string;
  }>(`/exchanges/for-entry/${entryId}`);
}

// Surveys
export interface SurveyDefinition {
  survey_type: 'entry_experience' | 'peer_response' | 'condition';
  condition: string;
  title: string;
  instructions: string;
  scale: { value: number; label: string }[];
  items: { key: string; text: string; reverse?: boolean }[];
  submitted: boolean;
}

export async function getSurveyDefinition(type: string, entryId?: string | null) {
  const q = new URLSearchParams({ type });
  if (entryId) q.set('entry_id', entryId);
  return request<SurveyDefinition>(`/surveys/definition?${q.toString()}`);
}

export async function submitSurvey(payload: {
  survey_type: string;
  entry_id?: string | null;
  responses: Record<string, number>;
}) {
  return request<{ success: boolean }>('/surveys/submit', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Reflections
export async function submitReflection(journalEntryId: string, content: string) {
  return request<{ success: boolean }>('/reflections', {
    method: 'POST',
    body: JSON.stringify({ journal_entry_id: journalEntryId, content }),
  });
}

// Admin
let adminToken: string | null = null;

export function setAdminToken(token: string | null) {
  adminToken = token;
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (adminToken) {
    headers['X-Admin-Token'] = adminToken;
  }

  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function adminLogin(password: string) {
  const result = await adminRequest<{ token: string }>('/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  adminToken = result.token;
  return result;
}

export async function adminGetUsers() {
  return adminRequest<any[]>('/users');
}

export async function adminCreateUser(pin: string) {
  return adminRequest<{ success: boolean; pin: string }>('/users', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export async function adminDeleteUser(pin: string) {
  return adminRequest<{ success: boolean }>(`/users/${pin}`, { method: 'DELETE' });
}

export async function adminSetStudyDay(pin: string, body: { day?: number; delta?: number }) {
  return adminRequest<{ success: boolean; current_study_day: number; day_plan: any }>(
    `/users/${pin}/study-day`,
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export async function adminGetUserHistory(pin: string) {
  return adminRequest<{ user: any; journalEntries: any[]; peerEntries: any[] }>(`/users/${pin}/history`);
}

export async function adminDeleteEntry(id: string) {
  return adminRequest<{ success: boolean }>(`/entries/${id}`, { method: 'DELETE' });
}

// Data export
export interface ExportBundle {
  tier: string;
  generated_at: string;
  tables: string[];
  data: Record<string, any[]>;
}

export async function adminExportJson(tier: 'analysis' | 'coding') {
  return adminRequest<ExportBundle>(`/export?tier=${tier}&format=json`);
}

export async function adminExportCsv(tier: 'analysis' | 'coding', table: string): Promise<string> {
  const res = await fetch(`/api/admin/export?tier=${tier}&format=csv&table=${encodeURIComponent(table)}`, {
    headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.text();
}
