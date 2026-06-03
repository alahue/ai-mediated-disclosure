import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, MessageSquare, FileText, Heart, Target, Lightbulb, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useApp } from '../context/AppContext';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import * as api from '../utils/api';

export function Review() {
  const navigate = useNavigate();
  const { peerEntries, removePeerEntry, entriesAwaitingReflection, removeReflectionEntry, refreshData } = useApp();

  const [selectedPeerEntry, setSelectedPeerEntry] = useState<string | null>(null);
  const [whatIHeard, setWhatIHeard] = useState('');
  const [whatImWondering, setWhatImWondering] = useState('');
  const [whatISuggest, setWhatISuggest] = useState('');
  const [submittingPeer, setSubmittingPeer] = useState(false);

  const [selectedReflectionEntry, setSelectedReflectionEntry] = useState<string | null>(null);
  const [reflectionResponse, setReflectionResponse] = useState('');
  const [submittingReflection, setSubmittingReflection] = useState(false);

  const handleSubmitPeerResponse = async () => {
    if (!selectedPeerEntry || !whatIHeard || !whatImWondering || !whatISuggest) return;

    setSubmittingPeer(true);
    try {
      await api.submitPeerResponse(selectedPeerEntry, {
        what_i_heard: whatIHeard,
        what_im_wondering: whatImWondering,
        what_i_suggest: whatISuggest,
      });
      removePeerEntry(selectedPeerEntry);
      setSelectedPeerEntry(null);
      setWhatIHeard('');
      setWhatImWondering('');
      setWhatISuggest('');
    } catch (err) {
      console.error('Failed to submit peer response:', err);
    } finally {
      setSubmittingPeer(false);
    }
  };

  const handleSubmitReflection = async () => {
    if (!selectedReflectionEntry || !reflectionResponse) return;

    setSubmittingReflection(true);
    try {
      await api.submitReflection(selectedReflectionEntry, reflectionResponse);
      removeReflectionEntry(selectedReflectionEntry);
      setSelectedReflectionEntry(null);
      setReflectionResponse('');
      await refreshData();
    } catch (err) {
      console.error('Failed to submit reflection:', err);
    } finally {
      setSubmittingReflection(false);
    }
  };

  const currentPeerEntry = peerEntries.find(e => e.id === selectedPeerEntry);
  const currentReflectionEntry = entriesAwaitingReflection.find(e => e.id === selectedReflectionEntry);

  const getIntentionIcon = (intention: 'support' | 'accountability' | 'perspective' | 'connection') => {
    switch (intention) {
      case 'support':
        return <Heart className="w-4 h-4 text-pink-500" />;
      case 'accountability':
        return <Target className="w-4 h-4 text-blue-500" />;
      case 'perspective':
        return <Lightbulb className="w-4 h-4 text-yellow-500" />;
      case 'connection':
        return <Users className="w-4 h-4 text-green-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => navigate('/today')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Today
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              Respond to peer entries and reflect on feedback
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="peer" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="peer" className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Review Peer Entries
                  {peerEntries.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{peerEntries.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="reflection" className="gap-2">
                  <FileText className="w-4 h-4" />
                  Reflection Addendums
                  {entriesAwaitingReflection.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{entriesAwaitingReflection.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Peer Entries Tab */}
              <TabsContent value="peer" className="space-y-4 mt-4">
                {peerEntries.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No peer entries to review at this time.
                  </p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Entry List */}
                    <div className="space-y-3">
                      <Label className="font-semibold">Entries Queue</Label>
                      <div className="space-y-2">
                        {peerEntries.map(entry => (
                          <div
                            key={entry.id}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedPeerEntry === entry.id ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-gray-50'
                            }`}
                            onClick={() => setSelectedPeerEntry(entry.id)}
                          >
                            <div className="text-xs text-gray-500 mb-1">
                              {new Date(entry.created_at + 'Z').toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            <p className="text-sm line-clamp-2">{entry.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Response Form */}
                    <div className="space-y-4">
                      {currentPeerEntry ? (
                        <>
                          <div className="p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Label className="text-sm font-medium">Entry Content</Label>
                              <Badge variant="outline" className="capitalize flex items-center gap-1">
                                {getIntentionIcon(currentPeerEntry.intention)}
                                {currentPeerEntry.intention}
                              </Badge>
                            </div>
                            <p className="text-sm mt-2">{currentPeerEntry.content}</p>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <Label htmlFor="heard">What I heard</Label>
                              <Textarea
                                id="heard"
                                value={whatIHeard}
                                onChange={(e) => setWhatIHeard(e.target.value)}
                                placeholder="Summarize what you understood from their entry..."
                                className="mt-1"
                              />
                            </div>

                            <div>
                              <Label htmlFor="wondering">What I'm wondering</Label>
                              <Textarea
                                id="wondering"
                                value={whatImWondering}
                                onChange={(e) => setWhatImWondering(e.target.value)}
                                placeholder="Questions or curiosities that came up..."
                                className="mt-1"
                              />
                            </div>

                            <div>
                              <Label htmlFor="suggest">What I suggest</Label>
                              <Textarea
                                id="suggest"
                                value={whatISuggest}
                                onChange={(e) => setWhatISuggest(e.target.value)}
                                placeholder="Suggestions or insights you'd like to share..."
                                className="mt-1"
                              />
                            </div>

                            <Button
                              onClick={handleSubmitPeerResponse}
                              disabled={!whatIHeard || !whatImWondering || !whatISuggest || submittingPeer}
                              className="w-full"
                            >
                              {submittingPeer ? 'Submitting...' : 'Submit Response'}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="text-gray-500 text-center py-8">
                          Select an entry to respond
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Reflection Addendums Tab */}
              <TabsContent value="reflection" className="space-y-4 mt-4">
                {entriesAwaitingReflection.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No entries awaiting reflection at this time.
                  </p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Entry List */}
                    <div className="space-y-3">
                      <Label className="font-semibold">Entries with Peer Feedback</Label>
                      <div className="space-y-2">
                        {entriesAwaitingReflection.map(entry => (
                          <div
                            key={entry.id}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedReflectionEntry === entry.id ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-gray-50'
                            }`}
                            onClick={() => setSelectedReflectionEntry(entry.id)}
                          >
                            <div className="text-xs text-gray-500 mb-1">
                              {new Date(entry.created_at + 'Z').toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            <p className="text-sm line-clamp-2">{entry.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reflection Form */}
                    <div className="space-y-4">
                      {currentReflectionEntry ? (
                        <>
                          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Label className="text-sm font-medium">Your Entry</Label>
                                {currentReflectionEntry.intention && (
                                  <Badge variant="outline" className="capitalize flex items-center gap-1">
                                    {getIntentionIcon(currentReflectionEntry.intention)}
                                    {currentReflectionEntry.intention}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm mt-1">
                                {currentReflectionEntry.modified_content || currentReflectionEntry.content}
                              </p>
                            </div>

                            {currentReflectionEntry.sim_what_i_heard && (
                              <div className="pt-3 border-t space-y-2">
                                <Label className="text-sm font-medium">Peer Response</Label>
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <span className="font-medium">What I heard: </span>
                                    {currentReflectionEntry.sim_what_i_heard}
                                  </div>
                                  <div>
                                    <span className="font-medium">What I'm wondering: </span>
                                    {currentReflectionEntry.sim_what_im_wondering}
                                  </div>
                                  <div>
                                    <span className="font-medium">What I suggest: </span>
                                    {currentReflectionEntry.sim_what_i_suggest}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="reflection">
                              What did you notice in their response that you hadn't noticed?
                            </Label>
                            <Textarea
                              id="reflection"
                              value={reflectionResponse}
                              onChange={(e) => setReflectionResponse(e.target.value)}
                              placeholder="Reflect on new insights from the peer feedback..."
                              className="min-h-[150px]"
                            />
                          </div>

                          <Button
                            onClick={handleSubmitReflection}
                            disabled={!reflectionResponse || submittingReflection}
                            className="w-full"
                          >
                            {submittingReflection ? 'Submitting...' : 'Submit Reflection'}
                          </Button>
                        </>
                      ) : (
                        <p className="text-gray-500 text-center py-8">
                          Select an entry to reflect on
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
