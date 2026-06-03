import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import * as api from '../utils/api';
import type { SurveyDefinition } from '../utils/api';

// Renders any of the three in-app instruments (entry experience check, peer
// response check, end-of-condition survey) as a 5-point Likert form. The items
// and their condition gating come from the server.
export function Survey() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const type = params.get('type') || '';
  const entryId = params.get('entryId');

  const [def, setDef] = useState<SurveyDefinition | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const d = await api.getSurveyDefinition(type, entryId);
        if (active) setDef(d);
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load survey');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [type, entryId]);

  const allAnswered = !!def && def.items.every((i) => answers[i.key] >= 1);

  const handleSubmit = async () => {
    if (!def || !allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitSurvey({ survey_type: def.survey_type, entry_id: entryId, responses: answers });
      navigate('/today');
    } catch (err: any) {
      setError(err.message || 'Failed to submit survey');
      setSubmitting(false);
    }
  };

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => navigate('/today')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Today
        </Button>
        {children}
      </div>
    </div>
  );

  if (loading) {
    return wrap(<Card><CardContent className="py-12 text-center text-gray-500">Loading…</CardContent></Card>);
  }
  if (!def) {
    return wrap(<Card><CardContent className="py-12 text-center text-red-500">{error || 'Survey unavailable.'}</CardContent></Card>);
  }
  if (def.submitted) {
    return wrap(
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
          <h3 className="text-lg font-semibold">You've already completed this survey</h3>
          <Button variant="outline" onClick={() => navigate('/today')} className="mt-2">Back to Today</Button>
        </CardContent>
      </Card>
    );
  }

  return wrap(
    <Card>
      <CardHeader>
        <CardTitle>{def.title}</CardTitle>
        <CardDescription>{def.instructions}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {def.items.map((item, idx) => (
          <div key={item.key} className="space-y-2">
            <p className="text-sm font-medium text-gray-900">
              {idx + 1}. {item.text}
            </p>
            <div className="grid grid-cols-5 gap-2">
              {def.scale.map((opt) => {
                const selected = answers[item.key] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [item.key]: opt.value }))}
                    className={`rounded-lg border p-2 text-center transition-colors ${
                      selected ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`block text-base font-semibold ${selected ? 'text-indigo-600' : 'text-gray-700'}`}>
                      {opt.value}
                    </span>
                    <span className="block text-[10px] leading-tight text-gray-500 mt-1">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-xs text-gray-500">
            {def.items.filter((i) => answers[i.key] >= 1).length} of {def.items.length} answered
          </span>
          <Button onClick={handleSubmit} disabled={submitting || !allAnswered}>
            {submitting ? 'Submitting…' : 'Submit survey'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
