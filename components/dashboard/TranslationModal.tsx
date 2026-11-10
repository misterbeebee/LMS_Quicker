import React, { useState, useEffect } from 'react';
import { X, Languages, ExternalLink, Copy, Check, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { 
  WorldLanguageMatch, 
  generateGoogleTranslateUrl, 
  translateTextWithFreeApi, 
  stripHtml 
} from '../../services/translation';

interface TranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentTitle: string;
  assignmentDescription?: string;
  courseName: string;
  languageMatch: WorldLanguageMatch;
}

export const TranslationModal: React.FC<TranslationModalProps> = ({
  isOpen,
  onClose,
  assignmentTitle,
  assignmentDescription = '',
  courseName,
  languageMatch
}) => {
  const [translatedTitle, setTranslatedTitle] = useState<string>('');
  const [translatedDescription, setTranslatedDescription] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const cleanDescription = stripHtml(assignmentDescription);
  const fullTextToTranslate = `${assignmentTitle}\n\n${cleanDescription}`;
  const webTranslateUrl = generateGoogleTranslateUrl(
    fullTextToTranslate, 
    languageMatch.sourceCode, 
    languageMatch.targetCode
  );

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setTranslatedTitle('');
    setTranslatedDescription('');
    setCopied(false);

    const performTranslation = async () => {
      try {
        // Translate Title
        const titleRes = await translateTextWithFreeApi(
          assignmentTitle, 
          languageMatch.sourceCode, 
          languageMatch.targetCode
        );

        if (!isMounted) return;

        if (titleRes.success) {
          setTranslatedTitle(titleRes.translation);
        }

        // Translate Description if present
        if (cleanDescription) {
          const descRes = await translateTextWithFreeApi(
            cleanDescription, 
            languageMatch.sourceCode, 
            languageMatch.targetCode
          );
          if (isMounted) {
            if (descRes.success) {
              setTranslatedDescription(descRes.translation);
            } else if (!titleRes.success) {
              setError(descRes.error || 'Translation service temporarily unavailable.');
            }
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to translate assignment text.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    performTranslation();

    return () => {
      isMounted = false;
    };
  }, [isOpen, assignmentTitle, assignmentDescription, languageMatch]);

  const handleCopy = () => {
    const text = `${translatedTitle || assignmentTitle}\n\n${translatedDescription || cleanDescription}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base">Language Translation</h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200/60">
                  {languageMatch.badgeText}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Class: <span className="font-medium text-slate-700">{courseName}</span> · {languageMatch.languageName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
            title="Close translation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-5">
          {/* Status / Notice */}
          {loading && (
            <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-indigo-700 text-xs flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Translating assignment instructions from {languageMatch.languageName} to English...</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>{error}</span>
              </div>
              <a
                href={webTranslateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 underline shrink-0 inline-flex items-center gap-1"
              >
                Open in Web Translate <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Side-by-side or stacked translations */}
          <div className="space-y-4">
            {/* Title Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Original Title ({languageMatch.languageName})
                </div>
                <div className="font-semibold text-slate-800 text-sm">{assignmentTitle}</div>
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> English Translation
                </div>
                <div className="font-semibold text-slate-900 text-sm">
                  {loading ? (
                    <span className="text-slate-400 italic font-normal text-xs">Translating...</span>
                  ) : (
                    translatedTitle || <span className="text-slate-400 italic text-xs font-normal">Same as original</span>
                  )}
                </div>
              </div>
            </div>

            {/* Description / Instructions Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Original Instructions
                </div>
                <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">
                  {cleanDescription || <span className="italic text-slate-400">No instructions text provided.</span>}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> English Instructions
                </div>
                <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">
                  {loading ? (
                    <span className="text-slate-400 italic font-normal text-xs">Translating content...</span>
                  ) : translatedDescription ? (
                    translatedDescription
                  ) : (
                    <span className="italic text-slate-400">
                      {cleanDescription ? 'Translation displayed above or open in Google Translate.' : 'No description to translate.'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium text-xs transition inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied' : 'Copy English Text'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={webTranslateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Open full text in Google Translate in a new tab"
            >
              <span>Open in Google Translate</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium text-xs transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
