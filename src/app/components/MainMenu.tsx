import { useNavigate } from 'react-router';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { PenLine, History, Share2, MessageSquare, HelpCircle, LogOut } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { useApp } from '../context/AppContext';

export function MainMenu() {
  const navigate = useNavigate();
  const { setCurrentUser, peerEntries, entriesAwaitingReflection, today } = useApp();

  const totalReviewTasks = peerEntries.length + entriesAwaitingReflection.length;

  const studyStatus = (() => {
    if (!today) return null;
    if (today.not_started) return 'Your study has not started yet';
    if (today.complete) return 'Study complete — thank you!';
    return `Day ${today.study_day} of 15 · ${today.condition_label}`;
  })();

  const handleLogout = () => {
    setCurrentUser(null);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Peer Journal</h1>
            {studyStatus ? (
              <p className="text-gray-600 mt-1">{studyStatus}</p>
            ) : (
              <p className="text-gray-600 mt-1">What would you like to do?</p>
            )}
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <HelpCircle className="w-5 h-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>How to Use Peer Journal</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-semibold text-base mb-2">📝 Write</h3>
                    <p className="text-gray-600">
                      Create new journal entries with automatic timestamps. Write freely about your thoughts, feelings, and experiences.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-base mb-2">📤 Share</h3>
                    <p className="text-gray-600">
                      Select an entry to share with a peer. Choose your intention (support, accountability & goals, perspective, or connection),
                      and our AI will help prepare it for sharing. You can review and edit before sending.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-base mb-2">💬 Review</h3>
                    <p className="text-gray-600">
                      <strong>Review Peer Entries:</strong> Read entries shared with you and provide thoughtful responses 
                      using the three-part template: "What I heard", "What I'm wondering", and "What I suggest".
                    </p>
                    <p className="text-gray-600 mt-2">
                      <strong>Reflection Addendums:</strong> After receiving peer responses to your shared entries, 
                      reflect on insights you gained from their perspective.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-base mb-2">📚 History</h3>
                    <p className="text-gray-600">
                      View all your past journal entries, sorted by date. Click any entry to see the full journey: 
                      original entry, shared version, peer response, and your reflection.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="icon" onClick={handleLogout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/write')}
          >
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <PenLine className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Write</h2>
                  <p className="text-sm text-gray-600">Create a new journal entry</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/history')}
          >
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <History className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">History</h2>
                  <p className="text-sm text-gray-600">View past journal entries</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/share')}
          >
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Share2 className="w-8 h-8 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Share</h2>
                  <p className="text-sm text-gray-600">Share an entry with a peer</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/review')}
          >
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-orange-100 rounded-lg relative">
                  <MessageSquare className="w-8 h-8 text-orange-600" />
                  {totalReviewTasks > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center p-0 text-xs"
                    >
                      {totalReviewTasks}
                    </Badge>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Review</h2>
                  <p className="text-sm text-gray-600">Review and respond to entries</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}