export type Condition = 'private' | 'manual' | 'ai';

export interface User {
  pin: string;
  condition_order: string | null;
  current_study_day: number;
  created_at: string;
  is_active: number;
}

export interface Prompt {
  id: string;
  entry_index: number;
  prompt_type: string;
  text: string;
}

export interface JournalEntry {
  id: string;
  user_pin: string;
  content: string;
  // Experimental context (entry-linked logging, §7)
  condition: Condition | null;
  condition_order: string | null;
  study_day: number | null;
  entry_index: number | null;
  prompt_id: string | null;
  write_start_time: string | null;
  write_complete_time: string | null;
  // Sharing / disclosure
  selected_excerpt: string | null;
  modified_content: string | null;
  final_shared_text: string | null;
  mediator_explanation: string | null;
  mediator_warning: string | null;
  ai_action: string | null;
  share_decision: string | null;
  intention: 'support' | 'accountability' | 'perspective' | 'connection' | null;
  shared: number;
  approved: number;
  shared_at: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_pin: string;
  study_day: number;
  condition: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface PeerEntry {
  id: string;
  target_user_pin: string;
  content: string;
  intention: 'support' | 'accountability' | 'perspective' | 'connection';
  responded: number;
  created_at: string;
}

export interface PeerResponse {
  id: string;
  peer_entry_id: string;
  responder_pin: string;
  what_i_heard: string;
  what_im_wondering: string;
  what_i_suggest: string;
  created_at: string;
}

export interface SimulatedPeerResponse {
  id: string;
  journal_entry_id: string;
  what_i_heard: string;
  what_im_wondering: string;
  what_i_suggest: string;
  created_at: string;
}

export interface ReflectionAddendum {
  id: string;
  journal_entry_id: string;
  user_pin: string;
  content: string;
  created_at: string;
}

export interface AdminSession {
  token: string;
  created_at: string;
  expires_at: string;
}

export interface MediatorResult {
  polished_entry: string;
  explanation: string;
  warning: string | null;
}

export interface ValidatorResult {
  passed: boolean;
  issues: string[];
}

export interface SimulatedResponseResult {
  what_i_heard: string;
  what_im_wondering: string;
  what_i_suggest: string;
}
