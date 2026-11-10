

import React, { useState, useEffect } from 'react';
import { X, FileJson, Loader2, DownloadCloud, Clock, RefreshCw } from 'lucide-react';
import { listSaveStates, SAVES_FOLDER } from '../../services/canvas';

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadFile: (url: string, date: number) => void;
  domain: string;
  token: string;
  useProxy: boolean;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({ 
    isOpen, onClose, onLoadFile, domain, token, useProxy 
}) => {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      // Fetch from both the specific saves folder and the root folder (legacy files)
      const [folderFiles, rootFiles] = await Promise.all([
          listSaveStates(domain, token, useProxy, SAVES_FOLDER).catch(e => {
              console.warn("Failed to list saves folder", e);
              return [];
          }),
          listSaveStates(domain, token, useProxy, '').catch(e => {
              console.warn("Failed to list root folder", e);
              return [];
          })
      ]);

      // Merge and Deduplicate by ID
      const allFilesMap = new Map();
      
      // Add root files first
      if (Array.isArray(rootFiles)) {
          rootFiles.forEach((f: any) => allFilesMap.set(f.id, f));
      }
      // Overwrite with folder files (if any collisions, though IDs are unique per file object)
      if (Array.isArray(folderFiles)) {
          folderFiles.forEach((f: any) => allFilesMap.set(f.id, f));
      }

      const list = Array.from(allFilesMap.values());

      // Sort by date descending
      list.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
      setFiles(list);
    } catch (e) {
      console.error("Failed to list files", e);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
      if (bytes < 1024) return bytes + ' B';
      return (bytes / 1024).toFixed(1) + ' KB';
  };

  const formatDate = (iso: string) => {
      return new Date(iso).toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh] animate-fadeIn">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <div>
             <h2 className="font-bold text-slate-800 flex items-center gap-2">
               Load Saved State
             </h2>
             <p className="text-xs text-slate-500">Select a previously saved configuration to restore.</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={loadFiles} 
                className="text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded p-1.5 transition" 
                title="Refresh list"
                disabled={loading}
            >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded p-1 transition" title="Close modal">
                <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-slate-50/50">
           {loading ? (
               <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                   <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                   <span>Fetching save files...</span>
               </div>
           ) : files.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                   <FileJson className="w-8 h-8 opacity-50" />
                   <span>No saved states found.</span>
               </div>
           ) : (
               <div className="space-y-2">
                   {files.map(file => (
                       <div key={file.id} className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between hover:border-blue-300 hover:shadow-sm transition group">
                           <div className="flex items-center gap-3">
                               <div className="bg-blue-50 p-2 rounded text-blue-600">
                                   <FileJson className="w-5 h-5" />
                               </div>
                               <div>
                                   <h3 className="font-medium text-slate-800 text-sm">{file.display_name || file.filename}</h3>
                                   <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(file.updated_at || file.created_at)}</span>
                                      <span className="bg-slate-100 px-1.5 rounded">{formatSize(file.size)}</span>
                                   </div>
                               </div>
                           </div>
                           <button 
                             onClick={() => { 
                                 onLoadFile(file.url, new Date(file.updated_at || file.created_at).getTime()); 
                                 onClose(); 
                             }}
                             className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition flex items-center gap-2"
                             title="Load this save state"
                           >
                               <DownloadCloud className="w-3.5 h-3.5" /> Load
                           </button>
                       </div>
                   ))}
               </div>
           )}
        </div>
      </div>
    </div>
  );
};