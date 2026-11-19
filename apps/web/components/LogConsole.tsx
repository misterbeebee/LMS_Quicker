
import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronUp, ChevronDown, Trash2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { logger, LogEntry } from '../services/logger';

export const LogConsole: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasNewErrors, setHasNewErrors] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load initial logs
    setLogs(logger.getLogs());

    // Subscribe to new logs
    const unsubscribe = logger.subscribe((entry) => {
      setLogs(prev => [...prev, entry]);
      if (entry.level === 'error' && !isOpen) {
        setHasNewErrors(true);
      }
    });

    return unsubscribe;
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setHasNewErrors(false);
  };

  const getIcon = (level: string) => {
    switch (level) {
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col ${isOpen ? 'w-[600px] max-w-[calc(100vw-2rem)] h-80' : 'w-56 h-10 hover:shadow-2xl'}`}>
      {/* Header / Toggle Bar */}
      <div 
        className={`bg-white text-slate-700 flex items-center justify-between px-3 h-10 cursor-pointer hover:bg-slate-50 transition select-none`}
        onClick={toggleOpen}
        title={isOpen ? "Minimize logs" : "Expand logs"}
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-mono font-medium">System Logs ({logs.length})</span>
          {hasNewErrors && (
             <span className="flex items-center gap-1 text-[10px] text-red-600 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full animate-pulse">
                <AlertCircle className="w-3 h-3" /> Errors
             </span>
          )}
        </div>
        <div className="flex items-center gap-2">
           {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {/* Log Content */}
      {isOpen && (
        <div className="flex-1 bg-slate-50 text-slate-700 overflow-hidden flex flex-col border-t border-slate-100">
           <div className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1" ref={scrollRef}>
              {logs.length === 0 && (
                <div className="text-slate-400 italic p-4 text-center">No logs recorded yet.</div>
              )}
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2 items-start hover:bg-white p-1 rounded border border-transparent hover:border-slate-200 transition-colors">
                   <span className="text-slate-400 shrink-0 select-none">[{formatTime(log.timestamp)}]</span>
                   <span className="shrink-0 mt-0.5">{getIcon(log.level)}</span>
                   <div className="flex-1 break-all">
                      <span className={`${log.level === 'error' ? 'text-red-600' : log.level === 'warn' ? 'text-amber-600' : 'text-blue-600'}`}>
                        {log.message}
                      </span>
                      {log.details && (
                        <div className="text-slate-500 mt-1 pl-2 border-l-2 border-slate-300 whitespace-pre-wrap">
                          {log.details}
                        </div>
                      )}
                   </div>
                </div>
              ))}
           </div>
           <div className="h-8 bg-white border-t border-slate-200 flex items-center justify-end px-2 shrink-0">
              <button 
                onClick={(e) => { e.stopPropagation(); logger.clear(); setLogs([]); }}
                className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 hover:bg-slate-100 rounded transition-colors"
                title="Clear all logs"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
           </div>
        </div>
      )}
    </div>
  );
};
