import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import {
  CheckCircle2, Circle, Lock, Clock, PenLine, Share2, MessageSquare,
  BookOpen, LogOut, Sparkles, ClipboardList,
} from 'lucide-react';
import { useApp, type DayTask } from '../context/AppContext';
import * as api from '../utils/api';

const TASK_ICON: Record<string, React.ReactNode> = {
  write: <PenLine className="w-5 h-5" />,
  share: <Share2 className="w-5 h-5" />,
  reflect_private: <BookOpen className="w-5 h-5" />,
  reflect_social: <BookOpen className="w-5 h-5" />,
  respond_peer: <MessageSquare className="w-5 h-5" />,
  read_response: <MessageSquare className="w-5 h-5" />,
  survey_entry_experience: <ClipboardList className="w-5 h-5" />,
  survey_peer_response: <ClipboardList className="w-5 h-5" />,
  survey_condition: <ClipboardList className="w-5 h-5" />,
};

export function Today() {
  const navigate = useNavigate();
  const { today, loadToday, refreshData, journalEntries, setCurrentUser } = useApp();
  const [reflectEntryId, setReflectEntryId] = useState<string | null>(null);

  useEffect(() => {
    loadToday();
    refreshData();
  }, [loadToday, refreshData]);

  const handleLogout = () => {
    setCurrentUser(null);
    navigate('/');
  };

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Today's Session</h1>
        {today && !today.not_started && !today.complete && (
          <p className="text-gray-600 mt-1">
            Day {today.study_day} of 15 · {today.condition_label}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="icon" onClick={() => navigate('/history')} title="History">
          <BookOpen className="w-5 h-5" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleLogout} title="Log out">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {header}
        {children}
      </div>
    </div>
  );

  if (!today) {
    return wrap(<Card><CardContent className="py-12 text-center text-gray-500">Loading…</CardContent></Card>);
  }

  if (today.not_started) {
    return wrap(
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <Clock className="w-10 h-10 text-blue-600 mx-auto" />
          <h3 className="text-lg font-semibold">Your study hasn't started yet</h3>
          <p className="text-gray-600">The study administrator will begin your first journaling day.</p>
        </CardContent>
      </Card>
    );
  }

  if (today.complete) {
    return wrap(
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
          <h3 className="text-lg font-semibold">You've completed all study days</h3>
          <p className="text-gray-600">Thank you. You can still review your past entries in History.</p>
        </CardContent>
      </Card>
    );
  }

  return wrap(
    <>
      <Card>
        <CardHeader>
          <CardTitle>Your tasks for today</CardTitle>
          <CardDescription>
            Complete the available tasks below. Some tasks may refer to earlier entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {today.tasks.length === 0 ? (
            <p className="text-gray-500 text-center py-6">Nothing scheduled today.</p>
          ) : (
            <ul className="space-y-2">
              {today.tasks.map((task) => (
                <TaskRow
                  key={task.key}
                  task={task}
                  onWrite={() => navigate('/write')}
                  onShare={() => task.entry_id && navigate(`/share?entryId=${task.entry_id}`)}
                  onReflect={() => task.entry_id && setReflectEntryId(task.entry_id)}
                  onRespond={() => navigate(`/respond?slot=${task.entry_index}`)}
                  onRead={() => task.entry_id && navigate(`/read?entryId=${task.entry_id}`)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ReflectDialog
        entryId={reflectEntryId}
        entry={journalEntries.find((e) => e.id === reflectEntryId) || null}
        onClose={() => setReflectEntryId(null)}
        onSaved={async () => {
          setReflectEntryId(null);
          await Promise.all([loadToday(), refreshData()]);
        }}
      />
    </>
  );
}

function TaskRow({
  task,
  onWrite,
  onShare,
  onReflect,
  onRespond,
  onRead,
}: {
  task: DayTask;
  onWrite: () => void;
  onShare: () => void;
  onReflect: () => void;
  onRespond: () => void;
  onRead: () => void;
}) {
  const done = task.status === 'done';
  const locked = task.status === 'locked';
  const upcoming = task.status === 'upcoming';
  const waiting = task.status === 'waiting';
  const missed = task.status === 'missed';
  const available = task.status === 'available';
  const muted = upcoming || locked || waiting || missed;

  const leftIcon = done ? (
    <CheckCircle2 className="w-5 h-5 text-green-600" />
  ) : muted ? (
    <Lock className="w-5 h-5 text-gray-300" />
  ) : (
    <Circle className="w-5 h-5 text-indigo-400" />
  );

  const note = (() => {
    if (upcoming) return 'Available in a later part of the study';
    if (waiting) return task.type === 'respond_peer'
      ? 'No peer entry is available to respond to yet'
      : "Waiting for your peer's response";
    if (missed) return 'No peer response was received in time';
    if (locked) return 'Complete the earlier step first';
    return null;
  })();

  const action = (() => {
    // Completed peer responses stay re-readable (re-reading doesn't change the
    // recorded read timestamp).
    if (task.type === 'read_response' && done) {
      return <Button size="sm" variant="ghost" onClick={onRead}>View</Button>;
    }
    if (!available) return null;
    switch (task.type) {
      case 'write':
        return <Button size="sm" onClick={onWrite}>Write</Button>;
      case 'share':
        return (
          <Button size="sm" onClick={onShare} className="gap-1">
            {task.label.startsWith('Mediate') && <Sparkles className="w-4 h-4" />}
            {task.label.startsWith('Mediate') ? 'Mediate & share' : 'Share'}
          </Button>
        );
      case 'reflect_private':
      case 'reflect_social':
        return <Button size="sm" variant="outline" onClick={onReflect}>Reflect</Button>;
      case 'respond_peer':
        return <Button size="sm" onClick={onRespond}>Respond</Button>;
      case 'read_response':
        return <Button size="sm" onClick={onRead}>Read response</Button>;
      default:
        return null;
    }
  })();

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
        muted ? 'bg-gray-50 opacity-70' : 'bg-white'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {leftIcon}
        <span className="text-gray-400">{TASK_ICON[task.type]}</span>
        <div className="min-w-0">
          <p className={`text-sm ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
            {task.label}
          </p>
          {note && <p className="text-xs text-gray-400">{note}</p>}
        </div>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </li>
  );
}

function ReflectDialog({
  entryId,
  entry,
  onClose,
  onSaved,
}: {
  entryId: string | null;
  entry: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent('');
    setError(null);
  }, [entryId]);

  const handleSubmit = async () => {
    if (!entryId || !content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitReflection(entryId, content);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save reflection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!entryId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reflect on your entry</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="rounded-lg bg-gray-50 p-3 max-h-40 overflow-y-auto">
            <p className="text-sm whitespace-pre-wrap text-gray-700">{entry.content}</p>
          </div>
        )}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Looking back on this entry, what stands out to you now?"
          className="min-h-[140px]"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !content.trim()}>
            {submitting ? 'Saving…' : 'Save reflection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
