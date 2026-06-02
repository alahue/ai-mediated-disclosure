import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { ArrowLeft, Info, CheckCircle2, Calendar } from 'lucide-react';
import { useApp, type Today } from '../context/AppContext';

export function Write() {
  const navigate = useNavigate();
  const { today, loadToday, addJournalEntry } = useApp();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Today | null>(today);
  // Timestamp captured the first time the participant begins composing.
  const writeStartRef = useRef<string | null>(null);

  useEffect(() => {
    loadToday().then((t) => setLoaded(t));
  }, [loadToday]);

  useEffect(() => {
    if (today) setLoaded(today);
  }, [today]);

  const handleChange = (value: string) => {
    if (writeStartRef.current === null && value.length > 0) {
      writeStartRef.current = new Date().toISOString();
    }
    setContent(value);
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addJournalEntry({
        content,
        write_start_time: writeStartRef.current,
        write_complete_time: new Date().toISOString(),
      });
      navigate('/history');
    } catch (err: any) {
      setError(err.message || 'Failed to save entry');
    } finally {
      setSubmitting(false);
    }
  };

  const back = (
    <Button variant="ghost" onClick={() => navigate('/menu')}>
      <ArrowLeft className="w-4 h-4 mr-2" />
      Back to Menu
    </Button>
  );

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {back}
        {children}
      </div>
    </div>
  );

  if (!loaded) {
    return wrap(
      <Card>
        <CardContent className="py-12 text-center text-gray-500">Loading today's session…</CardContent>
      </Card>
    );
  }

  // Study not started yet (day 0).
  if (loaded.not_started) {
    return wrap(
      <InfoCard
        icon={<Calendar className="w-10 h-10 text-blue-600" />}
        title="Your study hasn't started yet"
        body="The study administrator will start your first journaling day. Please check back once your study begins."
      />
    );
  }

  // Study complete (past the final day).
  if (loaded.complete) {
    return wrap(
      <InfoCard
        icon={<CheckCircle2 className="w-10 h-10 text-green-600" />}
        title="You've completed all study days"
        body="Thank you. There are no more journaling entries to write. You can still review your past entries in History."
      />
    );
  }

  // A study day with no scheduled writing (reflection or end-of-condition survey day).
  if (!loaded.writing_entry_index || !loaded.prompt) {
    return wrap(
      <InfoCard
        icon={<Info className="w-10 h-10 text-blue-600" />}
        title="No new entry to write today"
        body="Today's session does not include writing a new journal entry."
        plan={loaded}
      />
    );
  }

  // The focal entry for today has already been written.
  if (loaded.todays_entry) {
    return wrap(
      <InfoCard
        icon={<CheckCircle2 className="w-10 h-10 text-green-600" />}
        title={`Entry ${loaded.writing_entry_index} is complete`}
        body="You've already written today's journal entry. You can review it in your History."
        plan={loaded}
        action={
          <Button variant="outline" onClick={() => navigate('/history')} className="mt-4">
            Go to History
          </Button>
        }
      />
    );
  }

  // Active writing day.
  return wrap(
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle>Write Journal Entry {loaded.writing_entry_index}</CardTitle>
          <DayBadges plan={loaded} />
        </div>
        <CardDescription>
          Write freely and in your own words. Nothing you write here is shared automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-500 mb-1">Today's prompt</p>
          <p className="text-sm text-gray-800">{loaded.prompt.text}</p>
        </div>

        <Textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Start writing your entry here…"
          className="min-h-[260px] resize-y"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {content.trim() ? `${content.trim().split(/\s+/).length} words` : 'Not started'}
          </span>
          <Button onClick={handleSubmit} disabled={submitting || !content.trim()}>
            {submitting ? 'Saving…' : 'Save Entry'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DayBadges({ plan }: { plan: Today }) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary">Day {plan.study_day}</Badge>
      {plan.condition_label && (
        <Badge variant="outline" className="capitalize">
          {plan.condition_label}
        </Badge>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
  plan,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  plan?: Today;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle>Today's Session</CardTitle>
          {plan && <DayBadges plan={plan} />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center text-center py-10 space-y-4">
          <div className="p-4 bg-blue-100 rounded-full">{icon}</div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-gray-600">{body}</p>
          </div>
          {plan && plan.activities.length > 0 && (
            <div className="w-full max-w-md text-left rounded-lg border bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
                Today's activities
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                {plan.activities.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {action}
        </div>
      </CardContent>
    </Card>
  );
}
