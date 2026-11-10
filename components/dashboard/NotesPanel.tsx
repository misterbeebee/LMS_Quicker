
import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, AlertCircle, Check, Loader2 } from 'lucide-react';
import { saveNoteToCanvas, getNoteFromCanvas } from '../../services/canvas';

interface NotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  token: string;
  useProxy: boolean;
}

export const NotesPanel: React.FC<NotesPanelProps> = ({ isOpen, onClose, domain, token, useProxy }) => {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Load note when panel opens
  useEffect(() => {
    if (isOpen && token) {
      loadNote();
    }
  }, [isOpen]);

  const loadNote = async () => {
    setLoading(true);
    setError(null);
    try {
      const content = await getNoteFromCanvas(domain, token, useProxy);
      setNote(content || '');
    } catch (e: any) {
      setError('Failed to load notes. ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    try {
      await saveNoteToCanvas(domain, token, note, useProxy);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e: any) {
      setError('Failed to save note. ' + e.message);
      setStatus('idle');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh] animate-fadeIn">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <div>
             <h2 className="font-bold text-slate-800 flex items-center gap-2">
               Canvas Notepad
             </h2>
             <p className="text-xs text-slate-500">Saved as 'canvas_app_notes.txt' in your Canvas Files</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded p-1 transition" title="Close notes">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
               <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : null}
          
          {error && (
             <div className="mb-3 p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
             </div>
          )}

          <textarea
            className="w-full h-64 p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono text-sm text-slate-700 shadow-inner bg-yellow-50/30"
            placeholder="Type your notes here..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          ></textarea>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-between items-center">
          <button 
            onClick={loadNote}
            disabled={loading || status === 'saving'}
            className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 transition"
            title="Refresh notes from server"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Reload
          </button>

          <button
            onClick={handleSave}
            disabled={loading || status === 'saving'}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition shadow-sm ${
               status === 'saved' 
               ? 'bg-green-500 text-white'
               : 'bg-blue-600 hover:bg-blue-700 text-white'
            } disabled:opacity-70`}
            title="Save notes to Canvas file"
          >
            {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
            {status === 'saved' && <Check className="w-4 h-4" />}
            {status === 'idle' && <Save className="w-4 h-4" />}
            {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved!' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
};
