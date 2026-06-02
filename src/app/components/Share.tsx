import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ArrowLeft, Sparkles, AlertTriangle, RefreshCw, Eye, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as api from '../utils/api';

type Intention = 'support' | 'accountability' | 'perspective' | 'connection';

const INTENTIONS: { value: Intention; label: string; blurb: string }[] = [
  { value: 'support', label: 'Support', blurb: 'Emotional support and understanding' },
  { value: 'accountability', label: 'Accountability', blurb: 'Encouragement toward a goal' },
  { value: 'perspective', label: 'Perspective', blurb: 'Fresh insight or another viewpoint' },
  { value: 'connection', label: 'Connection', blurb: 'A sense of shared experience' },
];

// Procedurally parallel sharing workflow for the two social conditions. Manual
// and AI flows are identical (intention -> excerpt -> preview -> approve/cancel)
// except that the AI condition inserts a mediation review step.
type Step = 'intention' | 'excerpt' | 'ai_review' | 'preview';

export function Share() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const entryId = params.get('entryId');
  const { journalEntries, refreshData, loadToday } = useApp();

  const entry = useMemo(
    () => journalEntries.find((e) => e.id === entryId) || null,
    [journalEntries, entryId]
  );
  const isAi = entry?.condition === 'ai';

  const [step, setStep] = useState<Step>('intention');
  const [intention, setIntention] = useState<Intention | null>(null);
  const [excerpt, setExcerpt] = useState('');
  const [finalText, setFinalText] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [regenCount, setRegenCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure entries are available if the page is opened directly.
  useEffect(() => {
    if (!entry) refreshData();
  }, [entry, refreshData]);

  useEffect(() => {
    if (entry && !excerpt) setExcerpt(entry.content);
  }, [entry]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = (
    <Button variant="ghost" onClick={() => navigate('/today')}>
      <ArrowLeft className="w-4 h-4 mr-2" />
      Back to Today
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

  if (entryId && journalEntries.length > 0 && !entry) {
    return wrap(<Card><CardContent className="py-12 text-center text-gray-500">Entry not found.</CardContent></Card>);
  }
  if (!entry) {
    return wrap(<Card><CardContent className="py-12 text-center text-gray-500">Loading…</CardContent></Card>);
  }
  if (entry.condition !== 'manual' && entry.condition !== 'ai') {
    return wrap(<Card><CardContent className="py-12 text-center text-gray-500">This entry is not in a sharing condition.</CardContent></Card>);
  }
  if (entry.shared || entry.share_decision) {
    return wrap(
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <h3 className="text-lg font-semibold">This entry's sharing step is complete</h3>
          <p className="text-gray-600">
            You already {entry.share_decision === 'canceled' ? 'canceled sharing' : 'shared'} this entry.
          </p>
          <Button variant="outline" onClick={() => navigate('/today')} className="mt-2">Back to Today</Button>
        </CardContent>
      </Card>
    );
  }

  const cancelShare = async () => {
    setBusy(true);
    try {
      await api.cancelSharing({
        entryId: entry.id,
        intention,
        selected_excerpt: excerpt,
        ai_action: isAi ? 'canceled' : null,
        regeneration_count: regenCount,
      });
      await Promise.all([refreshData(), loadToday()]);
      navigate('/today');
    } catch (err: any) {
      setError(err.message || 'Failed to cancel');
      setBusy(false);
    }
  };

  const runMediation = async (regenerate: boolean) => {
    if (!intention) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.mediateEntry({ entryId: entry.id, intention, excerpt, regenerate });
      setAiSuggestion(result.polished_entry);
      setFinalText(result.polished_entry);
      setExplanation(result.explanation);
      setWarning(result.warning);
      setValidationIssues(result.validation_issues || []);
      if (regenerate) setRegenCount((c) => c + 1);
      setStep('ai_review');
    } catch (err: any) {
      setError(err.message || 'AI mediation failed');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!intention) return;
    setBusy(true);
    setError(null);
    try {
      const aiAction = isAi ? (finalText === aiSuggestion ? 'accepted' : 'edited') : null;
      await api.approveSharing({
        entryId: entry.id,
        intention,
        selected_excerpt: excerpt,
        final_shared_text: finalText,
        ai_action: aiAction,
        regeneration_count: regenCount,
        ai_suggestion: aiSuggestion,
        explanation,
        warning,
      });
      await Promise.all([refreshData(), loadToday()]);
      navigate('/today');
    } catch (err: any) {
      setError(err.message || 'Failed to share');
      setBusy(false);
    }
  };

  const stepLabel = isAi
    ? { intention: '1 of 4', excerpt: '2 of 4', ai_review: '3 of 4', preview: '4 of 4' }
    : { intention: '1 of 3', excerpt: '2 of 3', ai_review: '', preview: '3 of 3' };

  return wrap(
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle>
            {isAi ? 'Mediate & Share' : 'Share'} Entry {entry.entry_index}
          </CardTitle>
          <Badge variant="outline" className="capitalize">{entry.condition === 'ai' ? 'AI-mediated' : 'Manual'}</Badge>
          <Badge variant="secondary">Step {stepLabel[step]}</Badge>
        </div>
        <CardDescription>Nothing is shared until you approve it on the final step.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Step 1: intention */}
        {step === 'intention' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">What kind of response are you hoping for?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INTENTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setIntention(opt.value)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    intention === opt.value ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.blurb}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button disabled={!intention} onClick={() => setStep('excerpt')}>Next</Button>
            </div>
          </div>
        )}

        {/* Step 2: excerpt selection (edit-to-trim) */}
        {step === 'excerpt' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Your original entry</p>
              <div className="rounded-lg bg-gray-50 p-3 max-h-40 overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap text-gray-700">{entry.content}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">
                {isAi ? 'Select the text you want the AI to help you share' : 'Edit what your peer will see'}
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Trim or edit the text below. It starts as your full entry.
              </p>
              <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} className="min-h-[180px]" />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('intention')}>Back</Button>
              {isAi ? (
                <Button disabled={!excerpt.trim() || busy} onClick={() => runMediation(false)} className="gap-1">
                  <Sparkles className="w-4 h-4" />
                  {busy ? 'Getting suggestion…' : 'Get AI suggestion'}
                </Button>
              ) : (
                <Button
                  disabled={!excerpt.trim()}
                  onClick={() => { setFinalText(excerpt); setStep('preview'); }}
                  className="gap-1"
                >
                  <Eye className="w-4 h-4" /> Preview
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 3 (AI only): review the AI suggestion */}
        {step === 'ai_review' && isAi && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">AI-suggested version (you can edit it)</p>
              <Textarea value={finalText} onChange={(e) => setFinalText(e.target.value)} className="min-h-[160px]" />
            </div>
            {explanation && (
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-amber-600 mb-1">What the AI changed</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{explanation}</p>
              </div>
            )}
            {warning && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 flex gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-orange-600 mb-1">Oversharing warning</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{warning}</p>
                </div>
              </div>
            )}
            {validationIssues.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-red-600 mb-1">Safety check flagged</p>
                <ul className="list-disc list-inside text-sm text-gray-800">
                  {validationIssues.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('excerpt')}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => runMediation(true)} className="gap-1">
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </Button>
                <Button disabled={!finalText.trim()} onClick={() => setStep('preview')} className="gap-1">
                  <Eye className="w-4 h-4" /> Preview
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Final step: preview exactly what the peer will see, then approve/cancel */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
                Exactly what your peer will see
              </p>
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                <Badge variant="outline" className="capitalize mb-2">Intention: {intention}</Badge>
                <p className="text-sm whitespace-pre-wrap text-gray-900">{finalText}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(isAi ? 'ai_review' : 'excerpt')}>Edit</Button>
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={cancelShare}>Cancel sharing</Button>
                <Button disabled={busy || !finalText.trim()} onClick={approve} className="gap-1">
                  <Send className="w-4 h-4" /> {busy ? 'Sharing…' : 'Approve & share'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
