
import React, { useState, useEffect } from 'react';
import { Loader2, ExternalLink, AlertTriangle, Lock, Unlock, Trash2, KeyRound, RefreshCw, ArrowLeft, Archive, Clipboard, Check, DownloadCloud, Bug, ChevronDown, ChevronUp, Users, ChevronRight } from 'lucide-react';
import { encryptData, decryptData, StoredCredentials } from '../services/crypto';
import { logger } from '../services/logger';
import { getSavedStudents, StudentProfile, setActiveStudentId, getActiveStudent } from '../services/students';

interface LoginProps {
  onLogin: (domain: string, token: string, isDemo: boolean, useProxy: boolean, batchSize: number, studentId?: string) => void;
  onDebug: (domain: string, token: string, useProxy: boolean) => void;
  loading: boolean;
  error: string | null;
}

const STORAGE_KEY = 'canvas_credentials_v1';

// Regex for basic Canvas Token validation: Starts with 4+ digits, a tilde, then alphanumeric characters
const CANVAS_TOKEN_PATTERN = /^\d+~[A-Za-z0-9._-]+$/;

// Paste key here during development.
const DEV_DEFAULT_KEY = "";

export const Login: React.FC<LoginProps> = ({ onLogin, onDebug, loading, error }) => {
  // Mode: 'UNLOCK', 'SETUP', or 'BACKUP'
  const [mode, setMode] = useState<'SETUP' | 'UNLOCK' | 'BACKUP'>('SETUP');
  const [previousMode, setPreviousMode] = useState<'SETUP' | 'UNLOCK'>('SETUP');
  const [savedStudents, setSavedStudents] = useState<StudentProfile[]>(() => getSavedStudents());
  
  // Setup State
  const [domain, setDomain] = useState('mcpsmd.instructure.com');
  const [token, setToken] = useState(DEV_DEFAULT_KEY);
  const [studentName, setStudentName] = useState('');
  const [useProxy, setUseProxy] = useState(true);
  const [saveProfile, setSaveProfile] = useState(false);
  const [newPassphrase, setNewPassphrase] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Unlock State
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [storedData, setStoredData] = useState<StoredCredentials | null>(null);

  // Change Passphrase State
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [changeOldPass, setChangeOldPass] = useState('');
  const [changeNewPass, setChangeNewPass] = useState('');

  // Backup State
  const [importString, setImportString] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // General State
  const [localError, setLocalError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Validation State
  const [showTokenConfirmation, setShowTokenConfirmation] = useState(false);
  const [submittedToken, setSubmittedToken] = useState<string | null>(null);

  useEffect(() => {
    loadFromStorage();
  }, []);

  const loadFromStorage = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStoredData(parsed);
        setMode('UNLOCK');
        logger.info("Found valid credentials in storage, prompting unlock.");
      } catch (e: any) {
        logger.error("Failed to parse stored credentials", e.message);
        localStorage.removeItem(STORAGE_KEY);
        setMode('SETUP');
      }
    } else {
      setMode('SETUP');
    }
  };

  const executeLogin = async (cleanDomain: string, cleanToken: string) => {
    logger.info(`Attempting setup login for domain: ${cleanDomain}`);

    if (saveProfile) {
      if (newPassphrase.length < 4) {
        setLocalError("Passphrase is too short.");
        logger.warn("Passphrase creation failed: too short");
        return;
      }
      setProcessing(true);
      try {
        const encrypted = await encryptData(cleanToken, newPassphrase);
        const credentials: StoredCredentials = {
          domain: cleanDomain,
          useProxy,
          batchSize,
          security: encrypted
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
        logger.info("Credentials encrypted and saved successfully.");
      } catch (err: any) {
        logger.error("Encryption failed during setup", err.message);
        setLocalError("Encryption failed: " + err.message);
        setProcessing(false);
        return;
      }
      setProcessing(false);
    }

    onLogin(cleanDomain, cleanToken, false, useProxy, batchSize);
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    
    // Trim whitespace to prevent 401 errors
    const cleanToken = token.trim();
    const cleanDomain = domain.trim();
    
    // Store token temporarily to check against errors later
    setSubmittedToken(cleanToken);

    // Validate Pattern
    if (cleanToken && !CANVAS_TOKEN_PATTERN.test(cleanToken)) {
        setShowTokenConfirmation(true);
        return;
    }

    if (studentName.trim()) {
      localStorage.setItem('canvas_pending_student_name', studentName.trim());
    }

    await executeLogin(cleanDomain, cleanToken);
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storedData) return;

    setLocalError(null);
    setProcessing(true);
    logger.info("Attempting to unlock saved credentials.");

    try {
      const decryptedToken = await decryptData(storedData.security, unlockPassphrase);
      const cleanToken = decryptedToken.trim();
      setSubmittedToken(cleanToken); // Store for error checking
      
      logger.info("Unlock successful, proceeding to login.");
      onLogin(storedData.domain, cleanToken, false, storedData.useProxy ?? true, storedData.batchSize || 2);
    } catch (err) {
      logger.warn("Unlock failed: Incorrect passphrase.");
      setLocalError("Incorrect passphrase or corrupted data.");
      setProcessing(false);
    }
  };

  const handleChangePassphraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storedData) return;
    
    setLocalError(null);
    setSuccessMsg(null);
    setProcessing(true);

    if (changeNewPass.length < 4) {
      setLocalError("New passphrase must be at least 4 characters.");
      setProcessing(false);
      return;
    }

    try {
      // 1. Verify old passphrase by attempting to decrypt
      const decryptedToken = await decryptData(storedData.security, changeOldPass);

      // 2. Encrypt token with new passphrase (trimming for good measure)
      const newEncrypted = await encryptData(decryptedToken.trim(), changeNewPass);
      
      const newCredentials: StoredCredentials = {
        ...storedData,
        security: newEncrypted
      };

      // 3. Save
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCredentials));
      setStoredData(newCredentials);
      
      logger.info("Passphrase updated successfully.");
      setSuccessMsg("Passphrase updated successfully.");
      setChangeOldPass('');
      setChangeNewPass('');
      setIsChangingPass(false);
    } catch (err) {
      logger.warn("Passphrase update failed: old passphrase incorrect.");
      setLocalError("Current passphrase is incorrect.");
    } finally {
      setProcessing(false);
    }
  };

  const clearSavedData = () => {
    if (window.confirm("Are you sure you want to remove your account? This will delete the encrypted key from this browser.")) {
      localStorage.removeItem(STORAGE_KEY);
      setStoredData(null);
      setMode('SETUP');
      setLocalError(null);
      setIsChangingPass(false);
      logger.info("User removed saved credentials.");
    }
  };

  const openBackup = () => {
    setPreviousMode(mode === 'BACKUP' ? 'SETUP' : mode);
    setMode('BACKUP');
    setLocalError(null);
    setSuccessMsg(null);
    setImportString('');
  };

  const closeBackup = () => {
    setMode(previousMode);
    loadFromStorage();
  };

  const copyBackupToClipboard = () => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      navigator.clipboard.writeText(data);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      logger.info("Backup copied to clipboard.");
    }
  };

  const handleImportBackup = () => {
    try {
      if (!importString) return;
      // Validate JSON structure loosely
      const parsed = JSON.parse(importString);
      if (!parsed.security || !parsed.security.cipherText) {
        throw new Error("Invalid backup format");
      }
      localStorage.setItem(STORAGE_KEY, importString);
      setSuccessMsg("Backup imported successfully!");
      logger.info("Backup imported successfully.");
      setTimeout(() => {
        closeBackup();
      }, 1000);
    } catch (e) {
      logger.error("Backup import failed", e);
      setLocalError("Invalid backup string. Please check format.");
    }
  };

  const handleLoginWithSavedStudent = (student: StudentProfile) => {
    setActiveStudentId(student.id);
    onLogin(student.domain, student.apiKey, false, student.useProxy ?? true, student.batchSize || 2, student.id);
  };

  const getDetailedErrorMessage = () => {
    const baseError = error || localError;
    if (!baseError) return null;

    // Specific check for Token Format on authentication failure
    // Only check this if we actually tried a token and got a 401/Generic failure
    if (submittedToken && (baseError.includes('401') || baseError.includes('Unauthorized'))) {
       if (!CANVAS_TOKEN_PATTERN.test(submittedToken)) {
          const preview = submittedToken.substring(0, 6);
          return (
            <div className="space-y-2">
              <p>{baseError}</p>
              <div className="p-2 bg-red-100 border border-red-200 rounded text-xs text-red-800">
                <strong>Warning:</strong> The API Key you entered ("{preview}...") does not look like a standard Canvas token. 
                <br/>
                Real tokens usually start with digits followed by a <code className="font-bold">~</code> (tilde).
                <br/>
                Did you paste a URL by mistake?
              </div>
            </div>
          );
       }
    }

    return <p>{baseError}</p>;
  };

  // Helper to handle debug click safely (with or without credentials)
  const handleDebugClick = async () => {
     if (storedData && mode === 'UNLOCK' && unlockPassphrase) {
        try {
           // Try to decrypt if we have a passphrase in the input, though user hasn't clicked Unlock yet
           // This is a nice-to-have, but if they haven't unlocked, we just pass stored domain and empty token
           const decryptedToken = await decryptData(storedData.security, unlockPassphrase);
           onDebug(storedData.domain, decryptedToken, storedData.useProxy);
        } catch {
           onDebug(storedData.domain, '', storedData.useProxy);
        }
     } else {
        onDebug(domain, token, useProxy);
     }
  };

  // Render Backup View
  if (mode === 'BACKUP') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border border-slate-200">
          <div className="flex items-center mb-6">
             <button 
               onClick={closeBackup}
               className="text-slate-400 hover:text-slate-600 transition"
               title="Go back to login"
             >
               <ArrowLeft className="w-5 h-5" />
             </button>
             <h2 className="ml-3 text-xl font-bold text-slate-800">Backup & Restore</h2>
          </div>

          <p className="text-sm text-slate-500 mb-6">
            Save your encrypted credentials to a file or clipboard to restore them if the browser cache is cleared.
          </p>
          
          {(error || localError) && (
             <div className="bg-red-50 text-red-700 p-3 rounded text-sm mb-4">{error || localError}</div>
          )}
          {successMsg && (
             <div className="bg-green-50 text-green-700 p-3 rounded text-sm mb-4">{successMsg}</div>
          )}

          <div className="space-y-6">
             {/* Export Section */}
             <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <DownloadCloud className="w-4 h-4" /> Export Backup
                </h3>
                {storedData ? (
                  <div>
                    <div className="bg-white p-2 rounded border border-slate-200 text-xs text-slate-500 font-mono break-all h-24 overflow-y-auto mb-3">
                      {JSON.stringify(storedData)}
                    </div>
                    <button 
                      onClick={copyBackupToClipboard}
                      className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2 ${copySuccess ? 'bg-green-600 text-white' : 'bg-slate-800 text-white hover:bg-slate-900'}`}
                      title="Copy backup string to clipboard"
                    >
                      {copySuccess ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                      {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No saved data to export.</p>
                )}
             </div>

             {/* Import Section */}
             <div>
                <h3 className="font-semibold text-slate-700 mb-2">Import Backup</h3>
                <textarea
                  value={importString}
                  onChange={(e) => setImportString(e.target.value)}
                  placeholder="Paste backup string here..."
                  className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                />
                <button
                  onClick={handleImportBackup}
                  disabled={!importString}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition disabled:opacity-50"
                  title="Restore credentials from backup string"
                >
                  Import & Save
                </button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  const errorMessage = getDetailedErrorMessage();
  const activeStudent = getActiveStudent();
  const matchedStudent = savedStudents.find(s => s.domain === storedData?.domain);
  const studentDisplayName = activeStudent?.name || matchedStudent?.name;

  // Render Main Login / Unlock View
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border border-slate-200 relative">
        <div className="text-center mb-8">
          <div className="h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            {mode === 'UNLOCK' ? <Lock className="w-8 h-8 text-white" /> : <Unlock className="w-8 h-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Velm - LMS UIEvent</h1>
          <p className="text-slate-500 mt-2 text-sm">
            {mode === 'UNLOCK' 
              ? (studentDisplayName ? `Welcome back, ${studentDisplayName}! Unlock your session.` : 'Welcome back! Unlock your session.') 
              : 'Connect your account to analyze data.'}
          </p>
        </div>

        {/* Development Key Warning */}
        {mode === 'SETUP' && token === DEV_DEFAULT_KEY && token != "" && (
           <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3 items-start">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800">
                <span className="font-bold block mb-1">Development Mode Warning</span>
                A hardcoded API Key is currently pre-filled. Please remove this default value before deploying this application to a public environment.
              </div>
           </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3 text-sm text-red-700 w-full">
                {errorMessage}
              </div>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6 rounded-r animate-fadeIn">
            <p className="text-sm text-green-700">{successMsg}</p>
          </div>
        )}

        {mode === 'UNLOCK' && storedData ? (
          isChangingPass ? (
            <form onSubmit={handleChangePassphraseSubmit} className="space-y-6 animate-fadeIn">
               <div className="flex items-center mb-4">
                 <button 
                   type="button" 
                   onClick={() => { setIsChangingPass(false); setLocalError(null); }}
                   className="text-slate-400 hover:text-slate-600 transition"
                   title="Go back"
                 >
                   <ArrowLeft className="w-5 h-5" />
                 </button>
                 <span className="ml-2 font-semibold text-slate-700">Change Passphrase</span>
               </div>

               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Current Passphrase</label>
                  <input
                    type="password"
                    required
                    value={changeOldPass}
                    onChange={(e) => setChangeOldPass(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Old passphrase"
                  />
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Passphrase</label>
                  <input
                    type="password"
                    required
                    value={changeNewPass}
                    onChange={(e) => setChangeNewPass(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="New passphrase"
                  />
               </div>

               <button
                  type="submit"
                  disabled={processing}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-200 flex items-center justify-center disabled:opacity-70"
                  title="Update your security passphrase"
                >
                  {(processing) ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Update Passphrase
                </button>
            </form>
          ) : (
            <form onSubmit={handleUnlockSubmit} className="space-y-6">
               <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-100 text-center">
                 {studentDisplayName && (
                   <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center mx-auto mb-2 shadow-2xs">
                     {studentDisplayName.charAt(0).toUpperCase()}
                   </div>
                 )}
                 <p className="text-xs text-slate-500 mb-0.5">Logging in {studentDisplayName ? `as ${studentDisplayName} to` : 'to'}</p>
                 <p className="font-semibold text-blue-800 text-sm">{storedData.domain}</p>
               </div>

               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Enter Passphrase</label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={unlockPassphrase}
                      onChange={(e) => setUnlockPassphrase(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      placeholder="••••••••"
                    />
                    <KeyRound className="absolute right-3 top-2.5 w-5 h-5 text-slate-400" />
                  </div>
               </div>

               <button
                  type="submit"
                  disabled={loading || processing}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-200 flex items-center justify-center disabled:opacity-70"
                  title="Unlock saved credentials"
                >
                  {(loading || processing) ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
                  {(loading || processing) ? 'Decrypting...' : 'Unlock & Login'}
                </button>

                <div className="flex justify-between pt-2">
                   <button 
                     type="button" 
                     onClick={() => setIsChangingPass(true)}
                     className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 transition"
                     title="Change the passphrase used to encrypt your token"
                   >
                     <RefreshCw className="w-3 h-3" /> Change Passphrase
                   </button>
                   
                   <button 
                     type="button" 
                     onClick={clearSavedData}
                     className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 transition"
                     title="Delete saved credentials from this browser"
                   >
                     <Trash2 className="w-3 h-3" /> Remove Saved Account
                   </button>
                </div>
            </form>
          )
        ) : (
          <div>
            {savedStudents.length > 0 && (
              <div className="mb-6 bg-slate-50 border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    Saved Student Accounts
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                    {savedStudents.length} {savedStudents.length === 1 ? 'profile' : 'profiles'}
                  </span>
                </div>
                <div className="space-y-2">
                  {savedStudents.map(student => (
                    <button
                      key={student.id}
                      type="button"
                      disabled={loading}
                      onClick={() => handleLoginWithSavedStudent(student)}
                      className="w-full flex items-center justify-between p-2.5 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-xs rounded-xl transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600">
                            {student.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {student.domain}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-blue-600 flex items-center gap-0.5 shrink-0 ml-2">
                        Sign In <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 text-center font-medium">
                  Or enter credentials below to connect another student:
                </div>
              </div>
            )}

            <form onSubmit={handleSetupSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Student Name <span className="text-slate-400 font-normal text-xs">(optional - auto-detected if blank)</span>
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
                  title="Enter student name or nickname"
                />
              </div>

              <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Canvas Domain</label>
              <input
                type="text"
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="canvas.instructure.com"
                list="canvas-domains"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                title="Enter your school's Canvas URL"
              />
              <datalist id="canvas-domains">
                <option value="mcpsmd.instructure.com" />
                <option value="canvas.instructure.com" />
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                API Access Token
                <a 
                  href="https://community.canvaslms.com/t5/Student-Guide/How-do-I-manage-API-access-tokens-as-a-student/ta-p/273" 
                  target="_blank" 
                  rel="noreferrer"
                  className="float-right text-blue-600 text-xs flex items-center hover:underline"
                  title="Open Canvas guide on generating tokens"
                >
                  How to get this? <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </label>
              <input
                type="password"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your generated token here"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                title="Your personal Canvas API token"
              />
            </div>

            {/* Advanced Options Zippy */}
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition text-sm font-medium text-slate-700"
                    title="Toggle advanced connection settings"
                >
                    Advanced Options
                    {showAdvanced ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                
                {showAdvanced && (
                    <div className="p-4 space-y-4 border-t border-slate-200 bg-slate-50 animate-fadeIn">
                        <div className="flex items-start">
                            <div className="flex items-center h-5">
                            <input
                                id="proxy"
                                type="checkbox"
                                checked={useProxy}
                                onChange={(e) => setUseProxy(e.target.checked)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                title="Enable to bypass CORS restrictions in the browser"
                            />
                            </div>
                            <div className="ml-3 text-sm">
                            <label htmlFor="proxy" className="font-medium text-slate-700" title="Enable to bypass CORS restrictions in the browser">Use CORS Proxy (Recommended)</label>
                            <p className="text-slate-400 text-xs">Required for browsers.</p>
                            </div>
                        </div>
              
                        <div className="pt-3 border-t border-slate-200">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Concurrent Request Limit (Batch Size)
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="10"
                                value={batchSize}
                                onChange={(e) => setBatchSize(parseInt(e.target.value) || 2)}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                title="Limit simultaneous API requests to avoid rate limits"
                            />
                            <p className="text-xs text-slate-400 mt-1">Lower this if you encounter 403/429 errors.</p>
                        </div>

                        <div className="border-t border-slate-200 pt-3">
                            <div className="flex items-start">
                                <div className="flex items-center h-5">
                                <input
                                    id="save"
                                    type="checkbox"
                                    checked={saveProfile}
                                    onChange={(e) => setSaveProfile(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    title="Securely save token for next time"
                                />
                                </div>
                                <div className="ml-3 text-sm">
                                <label htmlFor="save" className="font-medium text-slate-700" title="Securely save token for next time">Save Encrypted Credential</label>
                                </div>
                            </div>
                            
                            {saveProfile && (
                            <div className="mt-3 animate-fadeIn">
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Create a Passphrase</label>
                                <input
                                    type="password"
                                    required={saveProfile}
                                    value={newPassphrase}
                                    onChange={(e) => setNewPassphrase(e.target.value)}
                                    placeholder="Secret passphrase to decrypt later"
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                    title="Passphrase used to encrypt your stored token"
                                />
                                <p className="text-xs text-slate-400 mt-1">Your token will be encrypted with this phrase.</p>
                            </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || processing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-200 flex items-center justify-center disabled:opacity-70"
                title="Authenticate with Canvas"
              >
                {(loading || processing) ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : null}
                {(loading || processing) ? 'Processing...' : 'Connect to Canvas'}
              </button>
            </div>
          </form>
        </div>
      )}

        <div className="mt-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">or</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <button
              onClick={() => onLogin('', '', true, false, 2)}
              disabled={loading}
              className="w-full bg-white border border-slate-300 text-slate-700 font-medium py-2 px-2 rounded-lg hover:bg-slate-50 transition duration-200 text-sm"
              title="Try with mock data"
            >
              Demo
            </button>
            <button
              onClick={openBackup}
              className="w-full bg-white border border-slate-300 text-slate-700 font-medium py-2 px-2 rounded-lg hover:bg-slate-50 transition duration-200 flex items-center justify-center gap-1 text-sm"
              title="Manage backups"
            >
              <Archive className="w-3.5 h-3.5" /> Backup
            </button>
            <button
              onClick={handleDebugClick}
              className="w-full bg-white border border-slate-300 text-slate-700 font-medium py-2 px-2 rounded-lg hover:bg-slate-50 transition duration-200 flex items-center justify-center gap-1 text-sm"
              title="Open API Debugger"
            >
              <Bug className="w-3.5 h-3.5" /> Debug
            </button>
          </div>
        </div>
      </div>
      
      {showTokenConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl border border-slate-200">
                <div className="flex items-center gap-3 text-amber-600 mb-4">
                    <AlertTriangle className="w-8 h-8" />
                    <h3 className="text-lg font-bold text-slate-800">Unusual API Key</h3>
                </div>
                <p className="text-slate-600 text-sm mb-6">
                    The API Key you entered doesn't look like a standard Canvas token (which usually starts with digits and a '<b>~</b>').
                    <br/><br/>
                    Are you sure this is correct?
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setShowTokenConfirmation(false)}
                        className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => {
                            setShowTokenConfirmation(false);
                            executeLogin(domain.trim(), token.trim());
                        }}
                        className="px-4 py-2 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 transition"
                    >
                        Proceed Anyway
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
