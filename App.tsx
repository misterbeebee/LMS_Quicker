
import React, { useState, useEffect, useRef } from 'react';
import { AppState, ViewMode, CourseData, StudentProfile } from './types';
import { fetchCanvasData, fetchMockData, fetchStudentName } from './services/canvas';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { DebugPage } from './components/DebugPage';
import { logger } from './services/logger';
import { APP_SECRET, encryptData, decryptData, getOrCreateDeviceSecret, StoredCredentials } from './services/crypto';
import { getActiveStudent, getActiveStudentId, ensureProfileForLogin, setActiveStudentId, updateStudentName, updateStudent, removeStudent } from './services/students';
import { sanitizeCanvasDomain, sanitizeCanvasToken } from './utils/canvasUrls';
import { Loader2, AlertTriangle, Key, School, LogOut, Trash2, RefreshCw, X } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';

const AUTO_LOGIN_KEY = 'canvas_session_auto_v1';
const AUTO_LOGIN_PREF_KEY = 'velm_auto_login_enabled';

interface SwitchFailureState {
  student: StudentProfile;
  message: string;
  editDomain: string;
  editToken: string;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    view: ViewMode.LOGIN,
    apiKey: '',
    canvasUrl: '',
    data: [],
    loading: false, // Initially false, will be set true if auto-login is found
    error: null,
    useProxy: true,
    currentStudentId: undefined,
  });

  const [prevView, setPrevView] = useState<ViewMode>(ViewMode.LOGIN);
  // Temporary storage for debug credentials if not logged in
  const [debugDefaults, setDebugDefaults] = useState({ domain: '', token: '', proxy: true });
  // Blocking modal state when switching students fails (instead of a misleading butter bar)
  const [switchFailure, setSwitchFailure] = useState<SwitchFailureState | null>(null);
  // Session epoch prevents in-flight async token persistence after explicit Log Out
  const sessionEpochRef = useRef<number>(0);

  // Auto-login effect
  useEffect(() => {
    const attemptAutoLogin = async () => {
      const savedSession = localStorage.getItem(AUTO_LOGIN_KEY);
      const autoLoginEnabled = localStorage.getItem(AUTO_LOGIN_PREF_KEY);
      if (savedSession && autoLoginEnabled !== 'false') {
        try {
          logger.info("Found saved session. Attempting auto-login...");
          setState(prev => ({ ...prev, loading: true }));
          
          const parsed = JSON.parse(savedSession) as StoredCredentials;
          let token: string;
          try {
            token = await decryptData(parsed.security, getOrCreateDeviceSecret());
          } catch {
            token = await decryptData(parsed.security, APP_SECRET);
          }
          
          await handleLogin(parsed.domain, token, false, parsed.useProxy ?? true, parsed.batchSize || 2, undefined, true);
        } catch (e: any) {
          logger.warn("Auto-login failed", e.message);
          localStorage.removeItem(AUTO_LOGIN_KEY);
          setState(prev => ({ ...prev, loading: false }));
        }
      }
    };
    
    attemptAutoLogin();
  }, []);

  const handleLogin = async (
    domain: string, 
    token: string, 
    isDemo: boolean, 
    useProxy: boolean = true, 
    batchSize: number = 2,
    studentId?: string,
    staySignedIn?: boolean
  ) => {
    sessionEpochRef.current += 1;
    const currentEpoch = sessionEpochRef.current;

    const cleanDomain = sanitizeCanvasDomain(domain);
    const cleanToken = sanitizeCanvasToken(token);
    const effectiveDemo = isDemo || cleanDomain.toUpperCase() === 'DEMO' || cleanToken.toUpperCase() === 'DEMO';

    if (staySignedIn !== undefined) {
      localStorage.setItem(AUTO_LOGIN_PREF_KEY, staySignedIn ? 'true' : 'false');
    }
    const shouldPersistAutoLogin = staySignedIn !== undefined
      ? staySignedIn
      : localStorage.getItem(AUTO_LOGIN_PREF_KEY) === 'true';

    setSwitchFailure(null);
    setState(prev => ({ ...prev, loading: true, error: null }));
    logger.info(`Initiating login for domain: ${cleanDomain || 'DEMO'}, Demo: ${effectiveDemo}, Proxy: ${useProxy}, BatchSize: ${batchSize}`);

    try {
      let data: CourseData[];
      if (effectiveDemo) {
        data = await fetchMockData();
      } else {
        data = await fetchCanvasData(cleanDomain, cleanToken, useProxy, batchSize);
      }

      if (sessionEpochRef.current !== currentEpoch) return;

      let profileId = studentId;
      if (!effectiveDemo && cleanDomain && cleanToken) {
        const profile = ensureProfileForLogin(cleanDomain, cleanToken, useProxy, batchSize);
        profileId = profile.id;
        const pendingName = localStorage.getItem('canvas_pending_student_name');
        if (pendingName) {
          localStorage.removeItem('canvas_pending_student_name');
          updateStudentName(profile.id, pendingName);
        } else {
          // Asynchronously fetch real student name from Canvas to update profile name
          fetchStudentName(cleanDomain, cleanToken, useProxy).then(fetchedName => {
            if (fetchedName && fetchedName.trim() && sessionEpochRef.current === currentEpoch) {
              updateStudentName(profile.id, fetchedName.trim());
              setState(prev => ({ ...prev }));
            }
          }).catch(e => logger.warn("Failed to fetch student name:", e));
        }
      }

      // Login Successful
      setState({
        view: ViewMode.DASHBOARD,
        apiKey: effectiveDemo ? '' : cleanToken,
        canvasUrl: effectiveDemo ? 'DEMO' : cleanDomain,
        data,
        loading: false,
        error: null,
        useProxy,
        currentStudentId: profileId,
      });
      logger.info("Login successful");

      // Save Session only if user opted into auto-login and did not log out
      if (!effectiveDemo && shouldPersistAutoLogin) {
        encryptData(cleanToken, getOrCreateDeviceSecret()).then(encrypted => {
           if (sessionEpochRef.current !== currentEpoch || localStorage.getItem(AUTO_LOGIN_PREF_KEY) === 'false') {
             return;
           }
           const session: StoredCredentials = {
             domain: cleanDomain,
             useProxy,
             batchSize,
             security: encrypted
           };
           localStorage.setItem(AUTO_LOGIN_KEY, JSON.stringify(session));
           logger.info("Session saved to local storage.");
        }).catch(err => logger.warn("Failed to save session", err));
      } else {
        localStorage.removeItem(AUTO_LOGIN_KEY);
      }

    } catch (err: any) {
      if (sessionEpochRef.current !== currentEpoch) return;
      const errorMessage = err.message || 'An unexpected error occurred';
      logger.warn("Login attempt failed:", errorMessage);
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
    }
  };

  const handleSwitchStudent = async (student: StudentProfile) => {
    sessionEpochRef.current += 1;
    const currentEpoch = sessionEpochRef.current;

    const cleanDomain = sanitizeCanvasDomain(student.domain);
    const cleanToken = sanitizeCanvasToken(student.apiKey);
    const isDemoProfile = cleanDomain.toUpperCase() === 'DEMO' || cleanToken.toUpperCase() === 'DEMO';
    const previousActiveId = state.currentStudentId || getActiveStudentId();

    logger.info(`Switching active student to: ${student.name} (${cleanDomain || student.domain})`);
    setSwitchFailure(null);
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = isDemoProfile
        ? await fetchMockData()
        : await fetchCanvasData(
            cleanDomain,
            cleanToken,
            student.useProxy ?? true,
            student.batchSize || 2
          );

      if (sessionEpochRef.current !== currentEpoch) return;

      setActiveStudentId(student.id);
      setState(prev => ({
        ...prev,
        view: ViewMode.DASHBOARD,
        apiKey: isDemoProfile ? '' : cleanToken,
        canvasUrl: isDemoProfile ? 'DEMO' : cleanDomain,
        useProxy: student.useProxy ?? true,
        data,
        loading: false,
        error: null,
        currentStudentId: student.id,
      }));

      // Update auto-login session only when auto-login is active
      if (!isDemoProfile && localStorage.getItem(AUTO_LOGIN_PREF_KEY) === 'true') {
        encryptData(cleanToken, getOrCreateDeviceSecret()).then(encrypted => {
          if (sessionEpochRef.current !== currentEpoch || localStorage.getItem(AUTO_LOGIN_PREF_KEY) === 'false') {
            return;
          }
          const session: StoredCredentials = {
            domain: cleanDomain,
            useProxy: student.useProxy ?? true,
            batchSize: student.batchSize || 2,
            security: encrypted
          };
          localStorage.setItem(AUTO_LOGIN_KEY, JSON.stringify(session));
        }).catch(err => logger.warn("Failed to update auto-login for switched student", err));
      }

      logger.info(`Switched successfully to student ${student.name}`);
    } catch (err: any) {
      if (sessionEpochRef.current !== currentEpoch) return;
      if (previousActiveId) {
        setActiveStudentId(previousActiveId);
      }
      const msg = err.message || 'Failed to load Canvas data for selected student';
      logger.warn(`Student switch failed for ${student.name}:`, msg);
      setState(prev => ({
        ...prev,
        loading: false,
        error: null,
      }));
      setSwitchFailure({
        student,
        message: msg,
        editDomain: cleanDomain || student.domain,
        editToken: cleanToken || student.apiKey,
      });
    }
  };

  const handleRetryFailedSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchFailure) return;
    const updatedStudent: StudentProfile = {
      ...switchFailure.student,
      domain: sanitizeCanvasDomain(switchFailure.editDomain) || switchFailure.editDomain.trim(),
      apiKey: sanitizeCanvasToken(switchFailure.editToken),
    };
    updateStudent(updatedStudent);
    handleSwitchStudent(updatedStudent);
  };

  const handleLogout = () => {
    logger.info("User logged out (auto-login disabled until next explicit opt-in)");
    sessionEpochRef.current += 1;
    localStorage.removeItem(AUTO_LOGIN_KEY);
    localStorage.setItem(AUTO_LOGIN_PREF_KEY, 'false');
    setSwitchFailure(null);
    setState({
      view: ViewMode.LOGIN,
      apiKey: '',
      canvasUrl: '',
      data: [],
      loading: false,
      error: null,
      useProxy: false,
      currentStudentId: undefined,
    });
  };

  const goToDebug = (currentDomain: string, currentToken: string, useProxy: boolean) => {
    setPrevView(state.view);
    setDebugDefaults({ domain: currentDomain, token: currentToken, proxy: useProxy });
    setState(prev => ({ ...prev, view: ViewMode.DEBUG }));
  };

  const exitDebug = () => {
    setState(prev => ({ ...prev, view: prevView }));
  };

  const activeStudent = getActiveStudent();
  const currentStudentName = activeStudent?.name || undefined;

  return (
    <>
      {state.view === ViewMode.LOGIN && (
        <Login 
            onLogin={handleLogin} 
            loading={state.loading} 
            error={state.error} 
            onDebug={goToDebug}
        />
      )}
      
      {state.view === ViewMode.DASHBOARD && (
        <div className="fixed inset-0 h-dvh w-full overflow-hidden flex flex-col">
          {state.loading && (
            <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center animate-fadeIn">
              <div className="bg-white rounded-2xl px-6 py-5 shadow-2xl border border-slate-200 flex items-center gap-3.5">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <div>
                  <p className="text-sm font-bold text-slate-800">Switching Student...</p>
                  <p className="text-xs text-slate-500">Loading Canvas courses and assignments</p>
                </div>
              </div>
            </div>
          )}

          {/* Blocking Login / Student Switch Failure Modal */}
          {switchFailure && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="switch-failure-title"
              className="fixed inset-0 z-[70] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
            >
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden text-left">
                <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-red-600 text-white shrink-0 shadow-2xs">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 id="switch-failure-title" className="text-sm font-bold text-slate-900">
                        Could Not Switch to {switchFailure.student.name}
                      </h3>
                      <p className="text-xs text-red-700 font-medium mt-0.5">
                        {switchFailure.message}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSwitchFailure(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-red-100/60 transition cursor-pointer"
                    title="Stay on previous student"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleRetryFailedSwitch} className="p-5 space-y-3.5">
                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
                    Your previous session (<span className="font-semibold text-slate-800">{currentStudentName || (state.canvasUrl === 'DEMO' ? 'Demo Workspace' : 'Current Student')}</span>) is still intact. Update credentials below to switch, or cancel to keep viewing it.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Canvas Domain</label>
                    <div className="relative">
                      <School className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={switchFailure.editDomain}
                        onChange={(e) => setSwitchFailure(prev => prev ? { ...prev, editDomain: e.target.value } : null)}
                        className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="mcpsmd.instructure.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Canvas API Access Token</label>
                    <div className="relative">
                      <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        value={switchFailure.editToken}
                        onChange={(e) => setSwitchFailure(prev => prev ? { ...prev, editToken: e.target.value } : null)}
                        className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                        placeholder="Paste updated Canvas API token..."
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Update Credentials &amp; Retry Switch
                  </button>
                </form>

                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        removeStudent(switchFailure.student.id);
                        setSwitchFailure(null);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer"
                      title="Delete this failing student profile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Profile
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition cursor-pointer"
                      title="Log out to sign-in screen"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Log Out
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSwitchFailure(null)}
                    className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 transition cursor-pointer"
                  >
                    Keep Previous Student
                  </button>
                </div>
              </div>
            </div>
          )}

          <ErrorBoundary
            fallbackTitle="Dashboard encounter issue"
            onReset={() => handleLogout()}
          >
            <Dashboard 
                key={state.currentStudentId || (state.canvasUrl === 'DEMO' ? 'DEMO' : state.canvasUrl) || 'default'}
                data={state.data}
                apiKey={state.apiKey}
                canvasUrl={state.canvasUrl}
                useProxy={state.useProxy}
                onLogout={handleLogout} 
                onDebug={() => goToDebug(state.canvasUrl, state.apiKey, true)}
                currentStudentId={state.currentStudentId || activeStudent?.id}
                currentStudentName={currentStudentName}
                onSwitchStudent={handleSwitchStudent}
                onRenameStudent={(newName: string) => {
                  const targetId = state.currentStudentId || getActiveStudent()?.id;
                  if (targetId) {
                    updateStudentName(targetId, newName);
                    setState(prev => ({ ...prev }));
                  }
                }}
            />
          </ErrorBoundary>
        </div>
      )}

      {state.view === ViewMode.DEBUG && (
        <DebugPage 
            initialDomain={debugDefaults.domain || state.canvasUrl}
            initialToken={debugDefaults.token || state.apiKey}
            initialProxy={debugDefaults.proxy}
            onBack={exitDebug}
        />
      )}
    </>
  );
};

export default App;
