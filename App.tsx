
import React, { useState, useEffect } from 'react';
import { AppState, ViewMode, CourseData, StudentProfile } from './types';
import { fetchCanvasData, fetchMockData } from './services/canvas';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { DebugPage } from './components/DebugPage';
import { LogConsole } from './components/LogConsole';
import { logger } from './services/logger';
import { APP_SECRET, encryptData, decryptData, StoredCredentials } from './services/crypto';
import { getActiveStudent, ensureProfileForLogin, setActiveStudentId } from './services/students';
import { Loader2 } from 'lucide-react';

const AUTO_LOGIN_KEY = 'canvas_session_auto_v1';

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

  // Auto-login effect
  useEffect(() => {
    const attemptAutoLogin = async () => {
      const savedSession = localStorage.getItem(AUTO_LOGIN_KEY);
      if (savedSession) {
        try {
          logger.info("Found saved session. Attempting auto-login...");
          setState(prev => ({ ...prev, loading: true }));
          
          const parsed = JSON.parse(savedSession) as StoredCredentials;
          const token = await decryptData(parsed.security, APP_SECRET);
          
          await handleLogin(parsed.domain, token, false, parsed.useProxy ?? true, parsed.batchSize || 2);
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
    studentId?: string
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    logger.info(`Initiating login for domain: ${domain}, Demo: ${isDemo}, Proxy: ${useProxy}, BatchSize: ${batchSize}`);

    try {
      let data: CourseData[];
      if (isDemo) {
        data = await fetchMockData();
      } else {
        data = await fetchCanvasData(domain, token, useProxy, batchSize);
      }

      let profileId = studentId;
      if (!isDemo && domain && token) {
        const profile = ensureProfileForLogin(domain, token, useProxy, batchSize);
        profileId = profile.id;
      }

      // Login Successful
      setState({
        view: ViewMode.DASHBOARD,
        apiKey: token,
        canvasUrl: domain,
        data,
        loading: false,
        error: null,
        useProxy,
        currentStudentId: profileId,
      });
      logger.info("Login successful");

      // Save Session (if not demo)
      if (!isDemo) {
        encryptData(token, APP_SECRET).then(encrypted => {
           const session: StoredCredentials = {
             domain,
             useProxy,
             batchSize,
             security: encrypted
           };
           localStorage.setItem(AUTO_LOGIN_KEY, JSON.stringify(session));
           logger.info("Session saved to local storage.");
        }).catch(err => logger.warn("Failed to save session", err));
      }

    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred';
      logger.error("Login failed", errorMessage);
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
    }
  };

  const handleSwitchStudent = async (student: StudentProfile) => {
    logger.info(`Switching active student to: ${student.name} (${student.domain})`);
    setState(prev => ({ ...prev, loading: true, error: null }));
    setActiveStudentId(student.id);

    try {
      const data = await fetchCanvasData(
        student.domain, 
        student.apiKey, 
        student.useProxy ?? true, 
        student.batchSize || 2
      );

      setState(prev => ({
        ...prev,
        view: ViewMode.DASHBOARD,
        apiKey: student.apiKey,
        canvasUrl: student.domain,
        useProxy: student.useProxy ?? true,
        data,
        loading: false,
        error: null,
        currentStudentId: student.id,
      }));

      // Update auto-login session so browser refresh stays on this student
      encryptData(student.apiKey, APP_SECRET).then(encrypted => {
        const session: StoredCredentials = {
          domain: student.domain,
          useProxy: student.useProxy ?? true,
          batchSize: student.batchSize || 2,
          security: encrypted
        };
        localStorage.setItem(AUTO_LOGIN_KEY, JSON.stringify(session));
      }).catch(err => logger.warn("Failed to update auto-login for switched student", err));

      logger.info(`Switched successfully to student ${student.name}`);
    } catch (err: any) {
      const msg = err.message || 'Failed to load Canvas data for selected student';
      logger.error("Student switch failed:", msg);
      setState(prev => ({
        ...prev,
        loading: false,
        error: `Could not load ${student.name}: ${msg}`,
      }));
    }
  };

  const handleLogout = () => {
    logger.info("User logged out");
    localStorage.removeItem(AUTO_LOGIN_KEY);
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
        <div className="relative h-screen w-screen overflow-hidden flex flex-col">
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

          {state.error && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-800">
              <span className="font-medium">{state.error}</span>
              <button 
                onClick={() => setState(prev => ({ ...prev, error: null }))}
                className="underline hover:text-amber-900 ml-4 font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <Dashboard 
              data={state.data}
              apiKey={state.apiKey}
              canvasUrl={state.canvasUrl}
              useProxy={state.useProxy}
              onLogout={handleLogout} 
              onDebug={() => goToDebug(state.canvasUrl, state.apiKey, true)}
              currentStudentId={state.currentStudentId || activeStudent?.id}
              currentStudentName={currentStudentName}
              onSwitchStudent={handleSwitchStudent}
          />
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

      <LogConsole />
    </>
  );
};

export default App;
