import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, FileText, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';

function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(dateStr + 'Z').toLocaleDateString('en-US', options || {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function History() {
  const navigate = useNavigate();
  const { journalEntries, deleteJournalEntry } = useApp();
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const currentEntry = journalEntries.find(e => e.id === selectedEntry);

  const handleDelete = async (id: string) => {
    await deleteJournalEntry(id);
    setDeleteConfirmId(null);
    if (selectedEntry === id) {
      setSelectedEntry(null);
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
            <CardTitle>Journal History</CardTitle>
            <CardDescription>
              View all your past journal entries
            </CardDescription>
          </CardHeader>
          <CardContent>
            {journalEntries.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No journal entries yet. Start writing to see your history!
              </p>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="space-y-3 pr-4">
                  {journalEntries.map(entry => (
                    <div
                      key={entry.id}
                      className="p-4 border rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setSelectedEntry(entry.id)}
                        >
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <div className="text-sm text-gray-500">
                              {formatDate(entry.created_at)}
                            </div>
                            {entry.study_day != null && (
                              <Badge variant="outline" className="text-xs">Day {entry.study_day}</Badge>
                            )}
                            {entry.condition && (
                              <Badge variant="outline" className="text-xs capitalize">{entry.condition}</Badge>
                            )}
                            {entry.entry_index != null && (
                              <Badge variant="outline" className="text-xs">Entry {entry.entry_index}</Badge>
                            )}
                            {entry.shared && (
                              <Badge variant="secondary" className="text-xs">Shared</Badge>
                            )}
                            {entry.peer_what_i_heard && (
                              <Badge variant="secondary" className="text-xs">Has Response</Badge>
                            )}
                            {entry.reflection_content && (
                              <Badge variant="secondary" className="text-xs">Reflected</Badge>
                            )}
                          </div>
                          <p className="text-sm line-clamp-2">{entry.content}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <FileText className="w-5 h-5 text-gray-400" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(entry.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Entry Detail Dialog */}
        <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Journal Entry Details</DialogTitle>
            </DialogHeader>
            {currentEntry && (
              <ScrollArea className="max-h-[calc(80vh-120px)]">
                <div className="space-y-4 pr-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    {formatDate(currentEntry.created_at, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>

                  {/* Prompt */}
                  {currentEntry.prompt_text && (
                    <div>
                      <h3 className="font-semibold mb-2">Prompt</h3>
                      <div className="p-4 bg-indigo-50 rounded-lg">
                        <p className="text-sm">{currentEntry.prompt_text}</p>
                      </div>
                    </div>
                  )}

                  {/* Original Entry */}
                  <div>
                    <h3 className="font-semibold mb-2">Original Entry</h3>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{currentEntry.content}</p>
                    </div>
                  </div>

                  {/* Sent Entry (if modified) */}
                  {currentEntry.modified_content && (
                    <>
                      <Separator />
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">Sent Entry</h3>
                          {currentEntry.intention && (
                            <Badge variant="outline" className="capitalize">
                              {currentEntry.intention}
                            </Badge>
                          )}
                        </div>
                        <div className="p-4 bg-blue-50 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">{currentEntry.modified_content}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* AI Explanation of Changes */}
                  {currentEntry.mediator_explanation && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-2">AI Explanation of Changes</h3>
                        <div className="p-4 bg-amber-50 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">{currentEntry.mediator_explanation}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* AI Warning */}
                  {currentEntry.mediator_warning && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-2 text-orange-600">AI Warning</h3>
                        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">{currentEntry.mediator_warning}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Peer Response */}
                  {currentEntry.peer_what_i_heard && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-2">Peer Response</h3>
                        <div className="p-4 bg-green-50 rounded-lg space-y-3">
                          <div>
                            <h4 className="font-medium text-sm mb-1">What they heard:</h4>
                            <p className="text-sm">{currentEntry.peer_what_i_heard}</p>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-1">What they're wondering:</h4>
                            <p className="text-sm">{currentEntry.peer_what_im_wondering}</p>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-1">What they suggest:</h4>
                            <p className="text-sm">{currentEntry.peer_what_i_suggest}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Reflection Addendum */}
                  {currentEntry.reflection_content && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-2">Your Reflection</h3>
                        <div className="p-4 bg-purple-50 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">{currentEntry.reflection_content}</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Journal Entry</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this entry? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                className="bg-red-500 hover:bg-red-600"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
