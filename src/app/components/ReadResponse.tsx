import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowLeft, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as api from '../utils/api';

// The writer reads the rotating peer's response to their own previously shared
// entry. Reading marks the read timestamp (§7). The subsequent reflection is a
// separate task on the Today screen.
export function ReadResponse() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const entryId = params.get('entryId');
  const { journalEntries, loadToday } = useApp();
  const entry = journalEntries.find((e) => e.id === entryId) || null;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getResponseForEntry>> | null>(null);

  useEffect(() => {
    if (!entryId) return;
    let active = true;
    (async () => {
      try {
        const result = await api.getResponseForEntry(entryId);
        if (active) setData(result);
        // Reading may flip a Today task to "reflect"; refresh the plan.
        loadToday();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [entryId, loadToday]);

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
    return wrap(<Card><CardContent className="py-12 text-center text-gray-500">Loading…</CardContent></Card>);
  }

  if (!data || !data.responded) {
    return wrap(
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <Clock className="w-10 h-10 text-blue-600 mx-auto" />
          <h3 className="text-lg font-semibold">Your peer hasn't responded yet</h3>
          <p className="text-gray-600">Check back later — a response may still be on its way.</p>
        </CardContent>
      </Card>
    );
  }

  return wrap(
    <>
      {entry && (
        <Card>
          <CardHeader>
            <CardTitle>Your shared entry</CardTitle>
            <CardDescription>What your peer saw</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm whitespace-pre-wrap text-gray-800">
                {entry.final_shared_text || entry.modified_content || entry.content}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{data.peer_label}'s response</CardTitle>
            <Badge variant="outline">Anonymous peer</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Block label="What they heard" text={data.what_i_heard} tone="bg-green-50" />
          <Block label="What they're wondering" text={data.what_im_wondering} tone="bg-blue-50" />
          <Block label="What they suggest" text={data.what_i_suggest} tone="bg-purple-50" />
          <div className="flex justify-end">
            <Button onClick={() => navigate('/today')}>Back to Today to reflect</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Block({ label, text, tone }: { label: string; text?: string; tone: string }) {
  return (
    <div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <div className={`rounded-lg p-3 ${tone}`}>
        <p className="text-sm whitespace-pre-wrap text-gray-800">{text}</p>
      </div>
    </div>
  );
}
