import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ArrowLeft, Clock } from 'lucide-react';
import * as api from '../utils/api';
import type { RespondView } from '../utils/api';

// Respond to a rotating anonymous peer's shared entry using the structured
// three-part template (§11). The peer who wrote the entry stays anonymous.
export function Respond() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const slot = Number(params.get('slot'));

  const [loading, setLoading] = useState(true);
  const [exchange, setExchange] = useState<RespondView | null>(null);
  const [noPeer, setNoPeer] = useState(false);
  const [heard, setHeard] = useState('');
  const [wondering, setWondering] = useState('');
  const [suggest, setSuggest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { exchange } = await api.claimExchange(slot);
        if (active) setExchange(exchange);
      } catch (err: any) {
        if (active) {
          if ((err.message || '').includes('no_peer_available')) setNoPeer(true);
          else setError(err.message || 'Failed to load a peer entry');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [slot]);

  // Lightweight minimum lengths, mirroring the server (§11).
  const MIN = { heard: 10, wondering: 10, suggest: 2 };
  const heardOk = heard.trim().length >= MIN.heard;
  const wonderingOk = wondering.trim().length >= MIN.wondering;
  const suggestOk = suggest.trim().length >= MIN.suggest;
  const allOk = heardOk && wonderingOk && suggestOk;

  const handleSubmit = async () => {
    if (!exchange || !allOk) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitExchangeResponse(exchange.id, {
        what_i_heard: heard,
        what_im_wondering: wondering,
        what_i_suggest: suggest,
      });
      navigate('/today');
    } catch (err: any) {
      setError(err.message || 'Failed to submit response');
      setSubmitting(false);
    }
  };

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => navigate('/today')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Today
        </Button>
        {children}
      </div>
    </div>
  );

  if (loading) {
    return wrap(<Card><CardContent className="py-12 text-center text-gray-500">Finding a peer entry…</CardContent></Card>);
  }

  if (noPeer) {
    return wrap(
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <Clock className="w-10 h-10 text-blue-600 mx-auto" />
          <h3 className="text-lg font-semibold">No peer entry is available yet</h3>
          <p className="text-gray-600">
            There isn't a peer entry ready for you to respond to right now. Please check back later.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!exchange) {
    return wrap(<Card><CardContent className="py-12 text-center text-red-500">{error || 'Something went wrong.'}</CardContent></Card>);
  }

  const peerEntry = (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>A peer shared this with you</CardTitle>
          {exchange.intention && (
            <Badge variant="outline" className="capitalize">Wants: {exchange.intention}</Badge>
          )}
        </div>
        <CardDescription>From {exchange.peer_label} · responses are anonymous</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm whitespace-pre-wrap text-gray-800">{exchange.shared_text}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (exchange.already_responded) {
    return wrap(
      <>
        {peerEntry}
        <Card>
          <CardHeader><CardTitle>Your response</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ResponseBlock label="What I heard" text={exchange.what_i_heard} />
            <ResponseBlock label="What I am wondering" text={exchange.what_im_wondering} />
            <ResponseBlock label="What I suggest" text={exchange.what_i_suggest} />
          </CardContent>
        </Card>
      </>
    );
  }

  return wrap(
    <>
      {peerEntry}
      <Card>
        <CardHeader>
          <CardTitle>Your response</CardTitle>
          <CardDescription>
            Respond supportively using all three parts. Avoid judgment, diagnosis, or advice that feels harsh.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="What I heard"
            hint="Briefly restate what the writer shared."
            value={heard}
            onChange={setHeard}
            ok={heardOk}
            needHint="Please write at least a short phrase."
          />
          <Field
            label="What I am wondering"
            hint="Offer one respectful question or point of curiosity."
            value={wondering}
            onChange={setWondering}
            ok={wonderingOk}
            needHint="Please write at least a short phrase."
          />
          <Field
            label="What I suggest, if anything"
            hint='Offer one supportive suggestion or next step. You may write "No suggestion".'
            value={suggest}
            onChange={setSuggest}
            ok={suggestOk}
            needHint='Add a suggestion, or use "No suggestion".'
            extra={
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSuggest('No suggestion')}>
                No suggestion
              </Button>
            }
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting || !allOk}>
              {submitting ? 'Submitting…' : 'Submit response'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Field({
  label, hint, value, onChange, extra, ok, needHint,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  extra?: React.ReactNode;
  ok: boolean;
  needHint: string;
}) {
  // Only nudge once the participant has started typing in this field.
  const showNeed = !ok && value.trim().length > 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">{label}</p>
        {extra}
      </div>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[80px]" />
      {showNeed && <p className="text-xs text-amber-600 mt-1">{needHint}</p>}
    </div>
  );
}

function ResponseBlock({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <p className="font-medium">{label}:</p>
      <p className="text-gray-700 whitespace-pre-wrap">{text}</p>
    </div>
  );
}
