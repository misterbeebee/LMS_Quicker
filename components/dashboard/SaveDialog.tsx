
import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

interface SaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (filename: string) => void;
}

export const SaveDialog: React.FC<SaveDialogProps> = ({ isOpen, onClose, onConfirm }) => {
  const [filename, setFilename] = useState('');

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-').substring(0, 5);
      setFilename(`canvas_save_${dateStr}_${timeStr}.json`);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalName = filename.trim();
    if (!finalName.endsWith('.json')) {
        finalName += '.json';
    }
    onConfirm(finalName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200 animate-fadeIn">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            Save Current State
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded p-1 transition" title="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
           <label className="block text-sm font-medium text-slate-700 mb-2">Save Name</label>
           <input 
              type="text" 
              autoFocus
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
           />
           <p className="text-xs text-slate-500 mt-2">Files are saved in your Canvas 'saves' folder.</p>

           <div className="mt-6 flex justify-end gap-3">
               <button 
                 type="button" 
                 onClick={onClose}
                 className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition text-sm font-medium"
                 title="Cancel save"
               >
                 Cancel
               </button>
               <button 
                 type="submit"
                 className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow transition text-sm font-medium flex items-center gap-2"
                 title="Confirm save"
               >
                 <Save className="w-4 h-4" /> Save
               </button>
           </div>
        </form>
      </div>
    </div>
  );
};
