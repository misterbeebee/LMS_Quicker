
import React, { useState, useEffect } from 'react';
import { AppState, ViewMode, CourseData } from '../../types';
import { fetchCanvasData, fetchMockData } from '../../services/canvas';
import { Login } from '../Login';
import { Dashboard } from '../Dashboard';
import { DebugPage } from '../DebugPage';
import { LogConsole } from '../LogConsole';
import { logger } from '../../services/logger';
import { APP_SECRET, encryptData, decryptData, StoredCredentials } from '../../services/crypto';

// This file seems to be a duplicate/misplaced version of App.tsx. 
// It has been updated with correct relative paths to avoid build errors if it is inadvertently included.

const AUTO_LOGIN_KEY = 'canvas_session_auto_v1';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    view: ViewMode.LOGIN,
    apiKey: '',
    canvasUrl: '',
    data: [],
    loading: false,
    error: null,
    useProxy: false,
  });

  const [prevView, setPrevView] = useState<ViewMode>(ViewMode.LOGIN);
  const [debugDefaults, setDebugDefaults] = useState({ domain: '', token: '', proxy: true });

  useEffect(() => {
    const attemptAutoLogin = async () => {
      const savedSession = localStorage.getItem(AUTO_LOGIN_KEY);
      if (savedSession) {
        try {
          logger.info("Found saved session. Attempting auto-login...");
          setState(prev => ({ ...prev, loading: true }));
          
          const parsed = JSON.parse(savedSession) as StoredCredentials;
          const token = await decryptData(parsed.security, APP_SECRET);
          
          await handleLogin(parsed.domain, token, false, parsed.useProxy, parsed.batchSize || 2);
        } catch (e: any) {
          logger.warn("Auto-login failed", e.message);
          localStorage.removeItem(AUTO_LOGIN_KEY);
          setState(prev => ({ ...prev, loading: false }));
        }
      }
    };
    
    attemptAutoLogin();
  }, []);

  const handleLogin = async (domain: string, token: string, isDemo: boolean, useProxy: boolean = false, batchSize: number = 2) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    logger.info(`Initiating login for domain: ${domain}, Demo: ${isDemo}, Proxy: ${useProxy}, BatchSize: ${batchSize}`);

    try {
      let data: CourseData[];
      if (isDemo) {
        data = await fetchMockData();
      } else {
        data = await fetchCanvasData(domain, token, useProxy, batchSize);
      }

      setState({
        view: ViewMode.DASHBOARD,
        apiKey: token,
        canvasUrl: domain,
        data,
        loading: false,
        error: null,
        useProxy,
      });
      logger.info("Login successful");

      if (!isDemo) {
        encryptData(token, APP_SECRET).then(encrypted => {
           const session: StoredCredentials = {
             domain,
             useProxy,
             batchSize,
             security: encrypted
           };
           localStorage.setItem(AUTO_LOGIN_KEY, JSON.stringify(session));
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
        <Dashboard 
            data={state.data}
            apiKey={state.apiKey}
            canvasUrl={state.canvasUrl}
            useProxy={state.useProxy}
            onLogout={handleLogout} 
            onDebug={() => goToDebug(state.canvasUrl, state.apiKey, true)}
        />
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
