import type Database from 'better-sqlite3';
import { buildPinMap, mapPin, redactText, sanitizePayload, type PinMap } from './deidentify.js';
import { charCount, wordCount } from './text-metrics.js';
import { getSurveyItems, type SurveyType } from '../study/surveys.js';
import type { Condition } from '../study/config.js';

export interface Table {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}
export type Bundle = Record<string, Table>;
export type ExportTier = 'analysis' | 'coding' | 'raw';

function ms(later: string | null, earlier: string | null): number | null {
  if (!later || !earlier) return null;
  const a = Date.parse(later);
  const b = Date.parse(earlier);
  return Number.isNaN(a) || Number.isNaN(b) ? null : a - b;
}

// Behavioral disclosure metrics captured at share approval, keyed by entry.
function shareMetricsByEntry(db: Database.Database): Record<string, any> {
  const rows = db
    .prepare("SELECT entry_id, payload FROM events WHERE event_type = 'share_approved'")
    .all() as Array<{ entry_id: string; payload: string }>;
  const map: Record<string, any> = {};
  for (const r of rows) {
    try {
      map[r.entry_id] = JSON.parse(r.payload);
    } catch {
      /* ignore malformed payloads */
    }
  }
  return map;
}

// Lookup of reverse-coding flags for survey items, scoped by survey type + condition.
function reverseLookup(type: SurveyType, condition: Condition, key: string): number {
  const item = getSurveyItems(type, condition).find((i) => i.key === key);
  return item?.reverse ? 1 : 0;
}

// ---------------------------------------------------------------------------
// De-identified analysis bundle (pseudonymous IDs, no raw journal text)
// ---------------------------------------------------------------------------

export function buildAnalysisExport(db: Database.Database): Bundle {
  const pinMap = buildPinMap(db);

  const participants = buildParticipants(db, pinMap);
  const entries = buildEntries(db, pinMap);
  const events = buildEvents(db, pinMap);
  const peerExchanges = buildPeerExchanges(db, pinMap);
  const surveyResponses = buildSurveyResponses(db, pinMap);

  return {
    participants,
    entries,
    events,
    peer_exchanges: peerExchanges,
    survey_responses: surveyResponses,
  };
}

function buildParticipants(db: Database.Database, pinMap: PinMap): Table {
  const rows = (db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as any[]).map((u) => ({
    participant_id: mapPin(pinMap, u.pin),
    condition_order: u.condition_order,
    current_study_day: u.current_study_day,
    enrolled_at: u.created_at,
    is_active: u.is_active,
  }));
  return {
    columns: ['participant_id', 'condition_order', 'current_study_day', 'enrolled_at', 'is_active'],
    rows,
  };
}

function buildEntries(db: Database.Database, pinMap: PinMap): Table {
  const metrics = shareMetricsByEntry(db);
  const reflected = new Set(
    (db.prepare('SELECT DISTINCT journal_entry_id FROM reflection_addendums').all() as any[]).map(
      (r) => r.journal_entry_id
    )
  );
  const rows = (db.prepare('SELECT * FROM journal_entries ORDER BY created_at ASC').all() as any[]).map((e) => {
    const m = metrics[e.id] || {};
    const origChars = charCount(e.content || '');
    const sharedChars = e.final_shared_text ? charCount(e.final_shared_text) : null;
    return {
      participant_id: mapPin(pinMap, e.user_pin),
      entry_id: e.id,
      condition: e.condition,
      condition_order: e.condition_order,
      study_day: e.study_day,
      entry_index: e.entry_index,
      prompt_id: e.prompt_id,
      intention: e.intention,
      shared: e.shared,
      share_decision: e.share_decision,
      ai_action: e.ai_action,
      regeneration_count: m.regeneration_count ?? null,
      original_char_count: origChars,
      original_word_count: wordCount(e.content || ''),
      shared_char_count: sharedChars,
      percentage_shared:
        m.percentage_shared ?? (sharedChars != null && origChars > 0 ? sharedChars / origChars : null),
      edit_distance_excerpt_to_final: m.edit_distance_excerpt_to_final ?? null,
      edit_distance_ai_to_final: m.edit_distance_ai_to_final ?? null,
      time_to_share_ms: m.time_to_share_ms ?? null,
      reflection_present: reflected.has(e.id) ? 1 : 0,
      write_start_time: e.write_start_time,
      write_complete_time: e.write_complete_time,
      shared_at: e.shared_at,
      created_at: e.created_at,
    };
  });
  return {
    columns: [
      'participant_id', 'entry_id', 'condition', 'condition_order', 'study_day', 'entry_index',
      'prompt_id', 'intention', 'shared', 'share_decision', 'ai_action', 'regeneration_count',
      'original_char_count', 'original_word_count', 'shared_char_count', 'percentage_shared',
      'edit_distance_excerpt_to_final', 'edit_distance_ai_to_final', 'time_to_share_ms',
      'reflection_present', 'write_start_time', 'write_complete_time', 'shared_at', 'created_at',
    ],
    rows,
  };
}

function buildEvents(db: Database.Database, pinMap: PinMap): Table {
  const rows = (db.prepare('SELECT * FROM events ORDER BY created_at ASC').all() as any[]).map((ev) => {
    let payload: unknown = null;
    if (ev.payload) {
      try {
        payload = sanitizePayload(JSON.parse(ev.payload), pinMap);
      } catch {
        payload = null;
      }
    }
    return {
      event_id: ev.id,
      participant_id: mapPin(pinMap, ev.user_pin),
      study_day: ev.study_day,
      condition: ev.condition,
      entry_id: ev.entry_id,
      event_type: ev.event_type,
      payload: payload === null ? '' : JSON.stringify(payload),
      created_at: ev.created_at,
    };
  });
  return {
    columns: ['event_id', 'participant_id', 'study_day', 'condition', 'entry_id', 'event_type', 'payload', 'created_at'],
    rows,
  };
}

function buildPeerExchanges(db: Database.Database, pinMap: PinMap): Table {
  const rows = (db.prepare('SELECT * FROM peer_exchanges ORDER BY created_at ASC').all() as any[]).map((x) => ({
    exchange_id: x.id,
    condition: x.condition,
    entry_index: x.entry_index,
    writer_id: mapPin(pinMap, x.writer_pin),
    responder_id: mapPin(pinMap, x.responder_pin),
    entry_id: x.entry_id,
    status: x.status,
    heard_char_count: x.what_i_heard ? charCount(x.what_i_heard) : null,
    wondering_char_count: x.what_im_wondering ? charCount(x.what_im_wondering) : null,
    suggest_char_count: x.what_i_suggest ? charCount(x.what_i_suggest) : null,
    response_latency_ms: ms(x.responded_at, x.assigned_at),
    read_latency_ms: ms(x.read_at, x.responded_at),
    assigned_at: x.assigned_at,
    responded_at: x.responded_at,
    read_at: x.read_at,
    created_at: x.created_at,
  }));
  return {
    columns: [
      'exchange_id', 'condition', 'entry_index', 'writer_id', 'responder_id', 'entry_id', 'status',
      'heard_char_count', 'wondering_char_count', 'suggest_char_count',
      'response_latency_ms', 'read_latency_ms', 'assigned_at', 'responded_at', 'read_at', 'created_at',
    ],
    rows,
  };
}

function buildSurveyResponses(db: Database.Database, pinMap: PinMap): Table {
  const rows = (db.prepare('SELECT * FROM survey_responses ORDER BY created_at ASC').all() as any[]).map((s) => ({
    participant_id: mapPin(pinMap, s.user_pin),
    survey_type: s.survey_type,
    condition: s.condition,
    entry_id: s.entry_id,
    study_day: s.study_day,
    item_key: s.item_key,
    reverse: reverseLookup(s.survey_type, s.condition as Condition, s.item_key),
    response_value: s.response_value,
    created_at: s.created_at,
  }));
  return {
    columns: [
      'participant_id', 'survey_type', 'condition', 'entry_id', 'study_day',
      'item_key', 'reverse', 'response_value', 'created_at',
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// Blinded coding export (original entries, peer responses, and reflections;
// condition/timestamps stripped, PII-redacted, shuffled)
// ---------------------------------------------------------------------------

export function buildCodingExport(db: Database.Database): Bundle {
  const pinMap = buildPinMap(db);

  const entries = (db.prepare('SELECT id, content FROM journal_entries').all() as any[]).map((e) => ({
    entry_id: e.id,
    word_count: wordCount(e.content || ''),
    entry_text: redactText(e.content),
  }));
  shuffle(entries);

  // Peer responses for peer-response quality coding (§11): condition-stripped,
  // keyed only by exchange so coders cannot infer condition or identities.
  const peerResponses = (
    db.prepare("SELECT id, what_i_heard, what_im_wondering, what_i_suggest FROM peer_exchanges WHERE status = 'responded'").all() as any[]
  ).map((x) => ({
    exchange_id: x.id,
    what_i_heard: redactText(x.what_i_heard),
    what_im_wondering: redactText(x.what_im_wondering),
    what_i_suggest: redactText(x.what_i_suggest),
  }));
  shuffle(peerResponses);

  // Reflection addendums (qualitative): de-identified participant ID + redacted
  // text, keyed by entry so they can be linked to the analysis bundle.
  const reflections = (
    db.prepare('SELECT journal_entry_id, user_pin, content FROM reflection_addendums').all() as any[]
  ).map((r) => ({
    participant_id: mapPin(pinMap, r.user_pin),
    entry_id: r.journal_entry_id,
    reflection_text: redactText(r.content),
  }));
  shuffle(reflections);

  return {
    entries_for_coding: { columns: ['entry_id', 'word_count', 'entry_text'], rows: entries },
    peer_responses_for_coding: {
      columns: ['exchange_id', 'what_i_heard', 'what_im_wondering', 'what_i_suggest'],
      rows: peerResponses,
    },
    reflections: { columns: ['participant_id', 'entry_id', 'reflection_text'], rows: reflections },
  };
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------------------------------------------------------------------------
// Raw / admin export (access-controlled): includes the PIN <-> participant-ID
// mapping and the full raw text, for re-linking data to participants (e.g.
// deletion requests). Never share this tier outside authorized personnel.
// ---------------------------------------------------------------------------

export function buildRawExport(db: Database.Database): Bundle {
  const pinMap = buildPinMap(db);

  const participantMap: Table = {
    columns: ['participant_id', 'pin', 'condition_order', 'current_study_day', 'enrolled_at'],
    rows: (db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as any[]).map((u) => ({
      participant_id: mapPin(pinMap, u.pin),
      pin: u.pin,
      condition_order: u.condition_order,
      current_study_day: u.current_study_day,
      enrolled_at: u.created_at,
    })),
  };

  const entries: Table = {
    columns: [
      'participant_id', 'pin', 'entry_id', 'condition', 'condition_order', 'study_day', 'entry_index',
      'prompt_id', 'intention', 'selected_excerpt', 'content', 'final_shared_text',
      'mediator_explanation', 'mediator_warning', 'ai_action', 'share_decision', 'shared', 'shared_at',
      'write_start_time', 'write_complete_time', 'created_at',
    ],
    rows: (db.prepare('SELECT * FROM journal_entries ORDER BY created_at ASC').all() as any[]).map((e) => ({
      participant_id: mapPin(pinMap, e.user_pin),
      pin: e.user_pin,
      entry_id: e.id,
      condition: e.condition,
      condition_order: e.condition_order,
      study_day: e.study_day,
      entry_index: e.entry_index,
      prompt_id: e.prompt_id,
      intention: e.intention,
      selected_excerpt: e.selected_excerpt,
      content: e.content,
      final_shared_text: e.final_shared_text,
      mediator_explanation: e.mediator_explanation,
      mediator_warning: e.mediator_warning,
      ai_action: e.ai_action,
      share_decision: e.share_decision,
      shared: e.shared,
      shared_at: e.shared_at,
      write_start_time: e.write_start_time,
      write_complete_time: e.write_complete_time,
      created_at: e.created_at,
    })),
  };

  const peerExchanges: Table = {
    columns: [
      'exchange_id', 'condition', 'entry_index', 'writer_id', 'writer_pin', 'responder_id', 'responder_pin',
      'entry_id', 'status', 'shared_text', 'what_i_heard', 'what_im_wondering', 'what_i_suggest',
      'assigned_at', 'responded_at', 'read_at', 'created_at',
    ],
    rows: (db.prepare('SELECT * FROM peer_exchanges ORDER BY created_at ASC').all() as any[]).map((x) => ({
      exchange_id: x.id,
      condition: x.condition,
      entry_index: x.entry_index,
      writer_id: mapPin(pinMap, x.writer_pin),
      writer_pin: x.writer_pin,
      responder_id: mapPin(pinMap, x.responder_pin),
      responder_pin: x.responder_pin,
      entry_id: x.entry_id,
      status: x.status,
      shared_text: x.shared_text,
      what_i_heard: x.what_i_heard,
      what_im_wondering: x.what_im_wondering,
      what_i_suggest: x.what_i_suggest,
      assigned_at: x.assigned_at,
      responded_at: x.responded_at,
      read_at: x.read_at,
      created_at: x.created_at,
    })),
  };

  const reflections: Table = {
    columns: ['participant_id', 'pin', 'entry_id', 'content', 'created_at'],
    rows: (db.prepare('SELECT * FROM reflection_addendums ORDER BY created_at ASC').all() as any[]).map((r) => ({
      participant_id: mapPin(pinMap, r.user_pin),
      pin: r.user_pin,
      entry_id: r.journal_entry_id,
      content: r.content,
      created_at: r.created_at,
    })),
  };

  const surveyResponses: Table = {
    columns: ['participant_id', 'pin', 'survey_type', 'condition', 'entry_id', 'study_day', 'item_key', 'response_value', 'created_at'],
    rows: (db.prepare('SELECT * FROM survey_responses ORDER BY created_at ASC').all() as any[]).map((s) => ({
      participant_id: mapPin(pinMap, s.user_pin),
      pin: s.user_pin,
      survey_type: s.survey_type,
      condition: s.condition,
      entry_id: s.entry_id,
      study_day: s.study_day,
      item_key: s.item_key,
      response_value: s.response_value,
      created_at: s.created_at,
    })),
  };

  return {
    participant_map: participantMap,
    entries,
    peer_exchanges: peerExchanges,
    reflections,
    survey_responses: surveyResponses,
  };
}

export function buildExport(db: Database.Database, tier: ExportTier): Bundle | null {
  if (tier === 'analysis') return buildAnalysisExport(db);
  if (tier === 'coding') return buildCodingExport(db);
  if (tier === 'raw') return buildRawExport(db);
  return null;
}
