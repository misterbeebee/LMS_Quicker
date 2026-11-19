

import React, { useState, useEffect, useRef } from 'react';
import { X, FileJson, Loader2, DownloadCloud, Clock, RefreshCw, Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { listSaveStates, SAVES_FOLDER } from '../../services/canvas';
import { UserSettings } from '../../types';

interface SaveLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadFile: (url: string, date: number) => void;
  domain: string;
  token: string;
  useProxy: boolean;
  onExportSettings?: () => void;
  onImportSettings?: (settings: UserSettings) => void;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({ 
    isOpen, onClose, onLoadFile, domain, token, useProxy, onExportSettings, onImportSettings
}) => {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
      setImportStatus(null);
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

        {/* Manual JSON Backup & Cross-Device Sync Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 rounded-b-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2 text-slate-500">
            <FileJson className="w-4 h-4 text-indigo-500" />
            <span className="font-medium text-slate-700">Manual Device Transfer:</span>
            <span>Export or import raw settings JSON directly.</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  try {
                    const text = event.target?.result as string;
                    const parsed = JSON.parse(text) as UserSettings;
                    if (!parsed || typeof parsed !== 'object') {
                      throw new Error('Invalid JSON format');
                    }
                    if (onImportSettings) {
                      onImportSettings(parsed);
                      setImportStatus('Settings imported successfully!');
                      setTimeout(() => {
                        onClose();
                      }, 1200);
                    }
                  } catch (err: any) {
                    setImportStatus('Failed to parse file: ' + (err?.message || 'Invalid format'));
                  }
                };
                reader.readAsText(file);
              }}
            />

            {onExportSettings && (
              <button
                type="button"
                onClick={onExportSettings}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium transition flex items-center gap-1.5 shadow-2xs"
                title="Download settings JSON to transfer to another device"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" /> Export JSON
              </button>
            )}

            {onImportSettings && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition flex items-center gap-1.5 shadow-2xs"
                title="Upload settings JSON from another device"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-600" /> Import JSON
              </button>
            )}
          </div>
        </div>

        {importStatus && (
          <div className={`px-4 py-2 text-xs font-medium flex items-center gap-2 border-t ${importStatus.includes('success') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
            {importStatus.includes('success') ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {importStatus}
          </div>
        )}
      </div>
    </div>
  );
};