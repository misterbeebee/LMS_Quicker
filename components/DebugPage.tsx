
import React, { useState } from 'react';
import { ArrowLeft, Play, Wifi, AlertCircle, Bolt, ChevronRight, FolderOpen, Calendar, HelpCircle, FlaskConical, CheckCircle2, XCircle, Check } from 'lucide-react';
import { genericCanvasFetch, listSaveStates, SAVES_FOLDER, diagnoseCalendarEventsFetch } from '../services/canvas';
import { logger } from '../services/logger';

interface DebugPageProps {
  initialDomain: string;
  initialToken: string;
  initialProxy: boolean;
  onBack: () => void;
}

const PRESETS = [
    { name: "My Profile", method: "GET", endpoint: "/users/self/profile" },
    { name: "List Courses", method: "GET", endpoint: "/courses?enrollment_state=active" },
    { name: "List Enrollments", method: "GET", endpoint: "/users/self/enrollments" },
    { name: "Todo Items", method: "GET", endpoint: "/users/self/todo" },
    { name: "Upcoming Events (/users/self/upcoming_events)", method: "GET", endpoint: "/users/self/upcoming_events?per_page=100" },
    { name: "Calendar Events (Personal / All)", method: "GET", endpoint: "/calendar_events?type=event&all_events=true&per_page=100" },
    { name: "Calendar Events (60d Past to 1yr Future)", method: "GET", endpoint: `/calendar_events?type=event&start_date=${new Date(Date.now() - 60*86400000).toISOString().split('T')[0]}&end_date=${new Date(Date.now() + 365*86400000).toISOString().split('T')[0]}&per_page=100` },
    { name: "Course Events (Replace ID)", method: "GET", endpoint: "/calendar_events?type=event&all_events=true&context_codes[]=course_12345" },
    { name: "Course Assignments (Replace ID)", method: "GET", endpoint: "/courses/12345/assignments" },
    { name: "Activity Stream", method: "GET", endpoint: "/users/self/activity_stream" },
];

export const DebugPage: React.FC<DebugPageProps> = ({ initialDomain, initialToken, initialProxy, onBack }) => {
  const [domain, setDomain] = useState(initialDomain || 'mcpsmd.instructure.com');
  const [token, setToken] = useState(initialToken || '');
  const [useProxy, setUseProxy] = useState(initialProxy);
  const [endpoint, setEndpoint] = useState('/users/self/profile');
  const [method, setMethod] = useState('GET');
  const [body, setBody] = useState('');
  
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    
    logger.info(`[Debug] Sending ${method} request to ${endpoint} on ${domain}`);

    try {
      const parsedBody = body ? JSON.parse(body) : undefined;
      const result = await genericCanvasFetch(domain, token, endpoint, useProxy, method, parsedBody);
      setResponse(result);
      logger.info(`[Debug] Request successful: ${result.status}`);
    } catch (err: any) {
      setError(err.message);
      if (err instanceof SyntaxError) {
         setError("Invalid JSON in Request Body");
      }
      logger.error(`[Debug] Request failed`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleListSaves = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    
    logger.info(`[Debug] Listing app save files from '${SAVES_FOLDER}' folder...`);

    try {
      // Use the service function to list files from the specific app folder
      const files = await listSaveStates(domain, token, useProxy, SAVES_FOLDER);
      
      setResponse({
        status: 200,
        statusText: "OK (Internal App Logic)",
        headers: [['X-Source', 'listSaveStates Service']],
        data: files
      });
      
      logger.info(`[Debug] Found ${files.length} save files.`);
    } catch (err: any) {
      setError(err.message);
      logger.error(`[Debug] Failed to list save files`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchCalendarEvents = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    logger.info(`[Debug] Running comprehensive Calendar Events diagnostic on ${domain}...`);

    try {
      // Attempt to retrieve active course IDs to make sure course context codes are queried
      let courseIds: number[] = [];
      try {
        const coursesRes = await genericCanvasFetch(domain, token, '/courses?enrollment_state=active&per_page=50', useProxy);
        if (coursesRes.status === 200 && Array.isArray(coursesRes.data)) {
          courseIds = coursesRes.data.map((c: any) => c.id).filter((id: any) => typeof id === 'number' && id > 0);
          logger.info(`[Debug] Found ${courseIds.length} active courses to query for calendar events.`);
        }
      } catch (cErr: any) {
        logger.warn("[Debug] Could not auto-fetch course IDs, continuing with general endpoints", cErr);
      }

      const report = await diagnoseCalendarEventsFetch(domain, token, useProxy, courseIds);

      setResponse({
        status: 200,
        statusText: "OK (Calendar Events Diagnostics)",
        headers: [
          ['X-Total-Events', String(report.totalEventsFound)],
          ['X-Courses-Queried', String(courseIds.length)],
          ['X-Diagnostic-Tool', 'Canvas Calendar Multi-Source Scanner']
        ],
        data: {
          summary: report.summary,
          totalEventsFound: report.totalEventsFound,
          courseIdsQueried: report.courseIdsQueried,
          sourcesBreakdown: {
            upcomingEventsFeed: {
              endpoint: report.sources.upcomingEvents.endpoint,
              status: report.sources.upcomingEvents.status,
              eventsCount: report.sources.upcomingEvents.count,
              error: report.sources.upcomingEvents.error || null,
              sampleEvents: report.sources.upcomingEvents.sample || []
            },
            personalCalendar: {
              endpoint: report.sources.personalEvents.endpoint,
              status: report.sources.personalEvents.status,
              eventsCount: report.sources.personalEvents.count,
              error: report.sources.personalEvents.error || null,
              sampleEvents: report.sources.personalEvents.sample || []
            },
            courseCalendarBatches: report.sources.courseBatches.map(b => ({
              batchCourses: b.batch,
              futureEndpoint: b.futureEndpoint,
              futureCount: b.futureCount,
              pastEndpoint: b.pastEndpoint,
              pastCount: b.pastCount,
              status: b.status,
              error: b.error || null,
              sampleEvents: b.sample || []
            }))
          },
          eventsList: report.allEvents,
          troubleshootingTips: report.totalEventsFound === 0 ? [
            "1. Check if course instructors created actual Calendar Events vs Assignments. Canvas distinguishes between Calendar Events and Assignments (assignments appear in the Assignments tab).",
            "2. Ensure events exist on the web Canvas Calendar (instructure.com/calendar).",
            "3. Events that have passed or are far in the future may require adjusting date parameters.",
            "4. If in Demo Mode, events 9001-9004 will be simulated when using demo credentials."
          ] : undefined
        }
      });

      logger.info(`[Debug] Calendar events scan complete. Total: ${report.totalEventsFound}`);
    } catch (err: any) {
      setError(err.message);
      logger.error(`[Debug] Failed to fetch calendar events`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunTestSuite = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    logger.info(`[Debug] Running automated integration test suite on server...`);

    try {
      const res = await fetch('/api/tests/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, token })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const testResult = await res.json();
      setResponse({
        status: testResult.failed === 0 ? 200 : 500,
        statusText: testResult.failed === 0 ? `OK (${testResult.passed}/${testResult.total} Tests Passed)` : `FAILED (${testResult.failed} Failures)`,
        headers: [
          ['X-Source', 'Automated Test Runner (scripts/test-runner.ts)'],
          ['X-Duration', `${testResult.durationMs}ms`],
          ['X-Pass-Rate', `${testResult.passed} / ${testResult.total}`]
        ],
        data: testResult,
        isTestReport: true
      });
      logger.info(`[Debug] Test suite finished: ${testResult.passed} passed, ${testResult.failed} failed`);
    } catch (err: any) {
      setError(err.message || 'Failed to execute test suite');
      logger.error(`[Debug] Test suite run failed`, err);
    } finally {
      setLoading(false);
    }
  };

  const loadPreset = (preset: typeof PRESETS[0]) => {
      setEndpoint(preset.endpoint);
      setMethod(preset.method);
      if (preset.method === 'GET') setBody('');
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-4 shadow-md shrink-0">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition cursor-pointer" title="Return to previous screen">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wifi className="w-5 h-5 text-blue-400" />
            API Debugger & Diagnostics
          </h1>
          <p className="text-xs text-slate-400">Test Canvas LMS API endpoints and run automated verification suites</p>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden flex flex-col md:flex-row gap-6">
        {/* Left Panel: Controls */}
        <div className="w-full md:w-1/3 flex flex-col gap-4">
           {/* Presets */}
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                 <Bolt className="w-4 h-4" /> Quick Actions & Diagnostics
              </h3>
              <div className="grid grid-cols-2 gap-2">
                 <button 
                    type="button"
                    onClick={handleRunTestSuite}
                    disabled={loading}
                    className="text-left text-xs p-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition border border-emerald-300 font-bold flex items-center gap-2 col-span-2 cursor-pointer shadow-2xs"
                    title="Run the automated test suite (all 65 tests) directly in the app without AI chat"
                 >
                    <FlaskConical className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate">Run Automated Test Suite (65 Tests)</span>
                 </button>
                 {PRESETS.map((p, i) => (
                    <button 
                      key={i}
                      type="button"
                      onClick={() => loadPreset(p)}
                      className="text-left text-xs p-2 rounded bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition border border-slate-100 truncate cursor-pointer"
                      title={`Load preset: ${p.name}`}
                    >
                       {p.name}
                    </button>
                 ))}
                 <button 
                    type="button"
                    onClick={handleListSaves}
                    className="text-left text-xs p-2 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition border border-indigo-100 truncate font-medium flex items-center gap-2 cursor-pointer"
                    title="List application save files found in Canvas storage"
                 >
                    <FolderOpen className="w-3 h-3" /> List Save Files
                 </button>
                 <button 
                    type="button"
                    onClick={handleFetchCalendarEvents}
                    className="text-left text-xs p-2 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 transition border border-purple-200 truncate font-medium flex items-center gap-2 col-span-2 cursor-pointer"
                    title="Fetch and diagnose calendar events across Canvas upcoming_events and calendar_events endpoints"
                 >
                    <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    Fetch Calendar Events (Diagnostics)
                 </button>
              </div>
           </div>

           {/* Config Form */}
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1 overflow-y-auto">
             <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Canvas Domain</label>
                  <input 
                    type="text" 
                    value={domain} 
                    onChange={e => setDomain(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="canvas.instructure.com"
                    list="debug-domains"
                  />
                   <datalist id="debug-domains">
                    <option value="mcpsmd.instructure.com" />
                    <option value="canvas.instructure.com" />
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Access Token</label>
                  <input 
                    type="password" 
                    value={token} 
                    onChange={e => setToken(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Token..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="useProxy" 
                    checked={useProxy} 
                    onChange={e => setUseProxy(e.target.checked)}
                    className="rounded text-blue-600"
                    title="Enable CORS Proxy"
                  />
                  <label htmlFor="useProxy" className="text-sm text-slate-600" title="Enable CORS Proxy">Use CORS Proxy</label>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex gap-2 mb-1">
                      <div className="w-1/3">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
                          <select 
                             value={method}
                             onChange={e => setMethod(e.target.value)}
                             className="w-full p-2 border border-slate-300 rounded-md text-sm font-mono font-bold bg-slate-50"
                          >
                             <option value="GET">GET</option>
                             <option value="POST">POST</option>
                             <option value="PUT">PUT</option>
                             <option value="DELETE">DELETE</option>
                          </select>
                      </div>
                      <div className="flex-1">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Endpoint</label>
                          <input 
                            type="text" 
                            value={endpoint} 
                            onChange={e => setEndpoint(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-md text-sm font-mono bg-slate-50"
                            placeholder="/users/self"
                          />
                      </div>
                  </div>
                  <p className="text-xs text-slate-400">Relative to /api/v1 (e.g. /courses)</p>
                </div>
                
                {(method === 'POST' || method === 'PUT') && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Request Body (JSON)</label>
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            className="w-full h-32 p-2 border border-slate-300 rounded-md text-xs font-mono bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder='{"key": "value"}'
                        />
                    </div>
                )}
                
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
                  title="Execute API request"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Play className="w-4 h-4" />}
                  Send Request
                </button>
             </form>
           </div>
        </div>

        {/* Right Panel: Response */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center shrink-0">
             <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">Response Output</span>
             {response && (
               <span className={`text-xs px-2 py-1 rounded font-bold ${response.status >= 200 && response.status < 300 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                 Status: {response.status} {response.statusText}
               </span>
             )}
          </div>
          
          <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-700 custom-scrollbar">
             {loading && <div className="text-slate-500 animate-pulse">Waiting for response...</div>}
             
             {error && (
               <div className="text-red-700 bg-red-50 p-4 rounded border border-red-200">
                 <div className="flex items-center gap-2 mb-2 font-bold"><AlertCircle className="w-4 h-4"/> Request Failed</div>
                 {error}
               </div>
             )}

             {response && !loading && response.isTestReport && (
                <div className="space-y-4 font-sans">
                  <div className="p-4 bg-slate-900 text-white rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${response.data.failed === 0 ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                        {response.data.failed === 0 ? <CheckCircle2 className="w-5 h-5 text-white" /> : <XCircle className="w-5 h-5 text-white" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">
                          {response.data.failed === 0 ? 'All Integration Tests Passed' : `${response.data.failed} Tests Failed`}
                        </h4>
                        <p className="text-xs text-slate-300">
                          {response.data.passed} of {response.data.total} assertions passed across 7 test suites ({response.data.durationMs}ms)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunTestSuite}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                    >
                      Re-run Suite
                    </button>
                  </div>

                  <div className="space-y-3">
                    {Array.from(new Set(response.data.results.map((r: any) => r.suite))).map((suiteName: any) => {
                      const suiteResults = response.data.results.filter((r: any) => r.suite === suiteName);
                      const allPassed = suiteResults.every((r: any) => r.passed);
                      return (
                        <div key={suiteName} className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs">
                          <div className={`px-3.5 py-2 border-b flex items-center justify-between text-xs font-bold ${
                            allPassed ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-rose-50 border-rose-200 text-rose-900'
                          }`}>
                            <span>{suiteName}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              allPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {suiteResults.filter((r: any) => r.passed).length} / {suiteResults.length} passed
                            </span>
                          </div>
                          <div className="divide-y divide-slate-100 font-mono text-xs">
                            {suiteResults.map((r: any, idx: number) => (
                              <div key={idx} className="p-2.5 flex items-start gap-2.5 hover:bg-slate-50/50">
                                {r.passed ? (
                                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <span className={r.passed ? 'text-slate-700' : 'text-rose-700 font-semibold'}>
                                    {r.message}
                                  </span>
                                  {r.error && (
                                    <p className="text-[11px] text-rose-600 mt-0.5">{r.error}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

             {response && !loading && !response.isTestReport && (
               <>
                 <div className="text-slate-400 mb-2 select-none border-b border-slate-200 pb-1 font-bold">Headers</div>
                 <div className="grid grid-cols-1 gap-1 mb-4">
                 {response.headers.map(([k, v]: any, i: number) => (
                   <div key={i} className="text-slate-600 break-all"><span className="text-blue-600 font-semibold">{k}:</span> {v}</div>
                 ))}
                 </div>
                 <div className="text-slate-400 mb-2 select-none border-b border-slate-200 pb-1 font-bold">Body</div>
                 <pre className="whitespace-pre-wrap break-all text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100 overflow-x-auto">
                   {typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data}
                 </pre>
               </>
             )}

             {!response && !loading && !error && (
               <div className="text-slate-400 flex flex-col items-center justify-center h-full">
                  <Wifi className="w-16 h-16 mb-4 opacity-10" />
                  <p className="text-slate-500">Configure settings or select a quick action to test the API.</p>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
