import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import * as api from '../utils/api';

export type Condition = 'private' | 'manual' | 'ai';

export type TaskType =
  | 'write'
  | 'share'
  | 'reflect_private'
  | 'respond_peer'
  | 'read_response'
  | 'reflect_social'
  | 'survey_entry_experience'
  | 'survey_peer_response'
  | 'survey_condition';

export type TaskStatus = 'available' | 'done' | 'locked' | 'upcoming' | 'waiting' | 'missed';

export interface DayTask {
  key: string;
  type: TaskType;
  label: string;
  entry_index: number | null;
  phase: 1 | 2 | 3 | 4;
  entry_id: string | null;
  status: TaskStatus;
}

export interface DayPlan {
  study_day: number;
  in_study: boolean;
  not_started: boolean;
  complete: boolean;
  week: number | null;
  condition: Condition | null;
  condition_label: string | null;
  condition_day: number | null;
  is_social: boolean;
  is_survey_day: boolean;
  writing_entry_index: number | null;
  prompt: { id: string; entry_index: number; prompt_type: string; text: string } | null;
  tasks: DayTask[];
  activities: string[];
}

export interface Today extends DayPlan {
  condition_order: Condition[] | null;
  todays_entry: JournalEntry | null;
}

export interface JournalEntry {
  id: string;
  content: string;
  created_at: string;
  // Experimental context
  condition?: Condition | null;
  study_day?: number | null;
  entry_index?: number | null;
  prompt_id?: string | null;
  prompt_text?: string | null;
  prompt_type?: string | null;
  write_start_time?: string | null;
  write_complete_time?: string | null;
  // Sharing / disclosure
  modified_content?: string | null;
  final_shared_text?: string | null;
  mediator_explanation?: string | null;
  mediator_warning?: string | null;
  intention?: 'support' | 'accountability' | 'perspective' | 'connection' | null;
  shared: boolean;
  approved?: boolean;
  // Peer response to this entry (joined from peer_exchanges)
  peer_what_i_heard?: string | null;
  peer_what_im_wondering?: string | null;
  peer_what_i_suggest?: string | null;
  peer_responded_at?: string | null;
  // Reflection addendum (joined from DB)
  reflection_content?: string | null;
}

interface AppContextType {
  currentUser: string | null;
  setCurrentUser: (user: string | null) => void;
  journalEntries: JournalEntry[];
  today: Today | null;
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  loadToday: () => Promise<Today | null>;
  addJournalEntry: (payload: {
    content: string;
    write_start_time?: string | null;
    write_complete_time?: string | null;
  }) => Promise<void>;
  deleteJournalEntry: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function mapEntry(raw: any): JournalEntry {
  return {
    ...raw,
    shared: !!raw.shared,
    approved: !!raw.approved,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadToday = useCallback(async (): Promise<Today | null> => {
    try {
      const data = await api.getToday();
      setToday(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const entries = await api.getEntries();
      setJournalEntries(entries.map(mapEntry));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const setCurrentUser = useCallback((user: string | null) => {
    setCurrentUserState(user);
    if (user) {
      api.setApiPin(user);
    } else {
      api.setApiPin(null);
      setJournalEntries([]);
      setToday(null);
    }
  }, []);

  const addJournalEntry = useCallback(async (payload: {
    content: string;
    write_start_time?: string | null;
    write_complete_time?: string | null;
  }) => {
    await api.createEntry(payload);
    await Promise.all([refreshData(), loadToday()]);
  }, [refreshData, loadToday]);

  const deleteJournalEntry = useCallback(async (id: string) => {
    await api.deleteEntry(id);
    await refreshData();
  }, [refreshData]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        journalEntries,
        today,
        loading,
        error,
        refreshData,
        loadToday,
        addJournalEntry,
        deleteJournalEntry,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
