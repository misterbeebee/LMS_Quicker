import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalBackend,
  createMemorySecretStore,
  type HttpHeaders,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
  type LlmProviderConfig,
} from '@velm/core';
import {
  getBackendMeta,
  installLocalBackendFetchBridge,
  isExtensionRuntime,
  isMultiStudentSupported,
  loadMockDatastoreJson,
  saveLlmConfig,
  setLocalBackend,
} from '../../services/backend';
import { checkSchoolviewAuthRequired, verifyStudentVueAccount } from '../../services/studentvue';
import { syncStudentVueGradebook } from '../../services/studentvueGrades';
import { analyzeWorkload } from '../../services/gemini';

function makeHeaders(map: Record<string, string>): HttpHeaders {
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(map)) {
    lower.set(k.toLowerCase(), v);
  }
  return {
    get: (name: string) => lower.get(name.toLowerCase()) ?? null,
    forEach: (cb) => {
      lower.forEach((v, k) => cb(v, k));
    },
  };
}

function makeMockTransport(
  handler: (req: HttpRequest) => HttpResponse | Promise<HttpResponse>
): HttpTransport {
  return {
    request: async (req) => handler(req),
  };
}

function jsonResponse(url: string, body: unknown, status = 200): HttpResponse {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: makeHeaders({ 'content-type': 'application/json' }),
    text: async () => text,
    bytes: async () => new TextEncoder().encode(text),
  };
}

function xmlResponse(url: string, xml: string, status = 200): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: makeHeaders({ 'content-type': 'text/xml; charset=utf-8' }),
    text: async () => xml,
    bytes: async () => new TextEncoder().encode(xml),
  };
}

const SOAP_STUDENT_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProcessWebServiceRequestResponse xmlns="http://edupoint.com/webservices/">
      <ProcessWebServiceRequestResult>&lt;StudentInfo&gt;&lt;FormattedName&gt;Jane Doe&lt;/FormattedName&gt;&lt;PermID&gt;123456&lt;/PermID&gt;&lt;EMail&gt;jane@school.edu&lt;/EMail&gt;&lt;CurrentSchool&gt;Lincoln High&lt;/CurrentSchool&gt;&lt;Grade&gt;10&lt;/Grade&gt;&lt;/StudentInfo&gt;</ProcessWebServiceRequestResult>
    </ProcessWebServiceRequestResponse>
  </soap:Body>
</soap:Envelope>`;

const SOAP_GRADEBOOK_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProcessWebServiceRequestResponse xmlns="http://edupoint.com/webservices/">
      <ProcessWebServiceRequestResult>&lt;Gradebook&gt;&lt;ReportingPeriod GradePeriod="Quarter 2" StartDate="11/01/2025" EndDate="01/15/2026" /&gt;&lt;Courses&gt;&lt;Course Period="1" Title="Algebra II" Staff="Mr. Smith"&gt;&lt;Marks&gt;&lt;Mark MarkName="Quarter 2" CalculatedScoreString="A" CalculatedScoreRaw="95.5" /&gt;&lt;/Marks&gt;&lt;/Course&gt;&lt;/Courses&gt;&lt;/Gradebook&gt;</ProcessWebServiceRequestResult>
    </ProcessWebServiceRequestResponse>
  </soap:Body>
</soap:Envelope>`;

afterEach(() => {
  setLocalBackend(null);
  saveLlmConfig(null);
  vi.restoreAllMocks();
});

describe('Local VelmBackend UI bridge (M2.2)', () => {
  it('intercepts /api/health and /api/proxy via installLocalBackendFetchBridge', async () => {
    const requests: HttpRequest[] = [];
    const backend = createLocalBackend({
      platform: 'desktop',
      version: '1.8.0-test',
      transport: makeMockTransport((req) => {
        requests.push(req);
        return jsonResponse(req.url, { id: 42, name: 'Jane Doe' });
      }),
      secretStore: createMemorySecretStore(),
    });

    installLocalBackendFetchBridge(backend);

    const healthRes = await window.fetch('/api/health');
    expect(healthRes.status).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe('ok');
    expect(healthJson.platform).toBe('desktop');

    const proxyRes = await window.fetch(
      `/api/proxy?url=${encodeURIComponent('https://canvas.example.edu/api/v1/users/self/profile')}`,
      { headers: { Authorization: 'Bearer tok_123' } }
    );
    expect(proxyRes.status).toBe(200);
    const profile = await proxyRes.json();
    expect(profile.name).toBe('Jane Doe');
    expect(requests.length).toBe(1);
    expect(requests[0].url).toBe('https://canvas.example.edu/api/v1/users/self/profile');
    expect(requests[0].headers?.['Authorization'] ?? requests[0].headers?.['authorization']).toBe(
      'Bearer tok_123'
    );
  });

  it('skips schoolview middleware auth and verifies StudentVUE identity locally', async () => {
    const backend = createLocalBackend({
      platform: 'desktop',
      version: '1.8.0-test',
      transport: makeMockTransport((req) => {
        if (req.url.includes('/api/v1/users/self/profile')) {
          return jsonResponse(req.url, {
            id: 42,
            name: 'Jane Doe',
            primary_email: 'jane@school.edu',
            sis_user_id: '123456',
          });
        }
        if (req.url.includes('PXPCommunication.asmx')) {
          return xmlResponse(req.url, SOAP_STUDENT_INFO_XML);
        }
        return jsonResponse(req.url, { error: 'unexpected' }, 404);
      }),
      secretStore: createMemorySecretStore(),
    });

    installLocalBackendFetchBridge(backend);

    expect(await checkSchoolviewAuthRequired()).toBe(false);

    const outcome = await verifyStudentVueAccount({
      canvasDomain: 'canvas.example.edu',
      canvasToken: 'tok_123',
      useProxy: true,
      apiServerUrl: '',
      apiUsername: '',
      apiPassword: '',
      districtDomain: 'sis.example.edu',
      edupointUsername: 'jdoe',
      edupointPassword: 'secret',
      isParent: false,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.comparison.matched).toBe(true);
      expect(outcome.comparison.studentVueProfile.name).toBe('Jane Doe');
      expect(outcome.transientSession.baseUrl).toBe('local://synergy');
    }
  });

  it('syncs StudentVUE gradebook locally without middleware server', async () => {
    const backend = createLocalBackend({
      platform: 'desktop',
      version: '1.8.0-test',
      transport: makeMockTransport((req) => {
        if (req.url.includes('PXPCommunication.asmx')) {
          return xmlResponse(req.url, SOAP_GRADEBOOK_XML);
        }
        return jsonResponse(req.url, { error: 'unexpected' }, 404);
      }),
      secretStore: createMemorySecretStore(),
    });

    setLocalBackend(backend);

    const outcome = await syncStudentVueGradebook({
      apiServerUrl: '',
      apiUsername: '',
      apiPassword: '',
      districtDomain: 'sis.example.edu',
      edupointUsername: 'jdoe',
      edupointPassword: 'secret',
      isParent: false,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.snapshot.courses.length).toBe(1);
      expect(outcome.snapshot.courses[0].title).toBe('Algebra II');
      expect(outcome.snapshot.courses[0].scorePercent).toBe(95.5);
    }
  });

  it('routes analyzeWorkload through local LlmRouter when configured and prompts when unconfigured', async () => {
    const backend = createLocalBackend({
      platform: 'desktop',
      version: '1.8.0-test',
      transport: makeMockTransport((req) => {
        if (req.url.includes('/v1/chat/completions')) {
          return jsonResponse(req.url, {
            choices: [{ message: { content: '<div>Local AI Summary OK</div>' } }],
          });
        }
        return jsonResponse(req.url, { error: 'unexpected' }, 404);
      }),
      secretStore: createMemorySecretStore(),
    });

    setLocalBackend(backend);

    const unconfiguredHtml = await analyzeWorkload([], []);
    expect(unconfiguredHtml).toContain('No AI provider configured yet');

    const config: LlmProviderConfig = {
      id: 'ollama-local',
      kind: 'openai-compatible',
      label: 'Ollama (Local)',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'llama3.2',
      privacy: 'local',
      auth: { type: 'none' },
    };
    saveLlmConfig(config);

    const configuredHtml = await analyzeWorkload([], []);
    expect(configuredHtml).toContain('Local AI Summary OK');
  });

  it('mounts an offline mock datastore via loadMockDatastoreJson for Canvas and StudentVUE', async () => {
    const fixture = {
      version: 1,
      recordedAt: '2026-01-15T12:00:00.000Z',
      sanitized: true,
      canvas: {
        domain: 'mock.instructure.com',
        self: { id: 99, name: 'Alex Sample' },
        profile: {
          id: 99,
          name: 'Alex Sample',
          primary_email: 'alex@mock.edu',
          sis_user_id: '55501',
        },
        courses: [
          {
            id: 101,
            name: 'AP Biology',
            course_code: 'BIO-AP',
          },
        ],
        courseNicknames: [],
        todo: [],
        upcomingEvents: [],
        announcements: [],
        courseDetailsById: {},
        enrollmentsByCourseId: {},
        assignmentsByCourseId: {
          '101': [
            {
              id: 1001,
              name: 'Cell Respiration Lab',
              course_id: 101,
              points_possible: 50,
            },
          ],
        },
        assignmentGroupsByCourseId: {},
        modulesByCourseId: {},
      },
      synergy: {
        domain: 'sis.mock.edu',
        isParent: false,
        data: {
          student_info: {
            StudentInfo: {
              FormattedName: 'Alex Sample',
              PermID: '55501',
              EMail: 'alex@mock.edu',
              CurrentSchool: 'Mock High',
              Grade: '11',
            },
          },
          gradebook: {
            Gradebook: {
              ReportingPeriod: { '@GradePeriod': 'Semester 1' },
              Courses: {
                Course: [
                  {
                    '@Period': '2',
                    '@Title': 'AP Biology',
                    '@Staff': 'Dr. Lee',
                    Marks: {
                      Mark: {
                        '@MarkName': 'Semester 1',
                        '@CalculatedScoreString': 'A-',
                        '@CalculatedScoreRaw': '91.4',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        errors: {},
      },
      scrapeErrors: {},
    };

    const loaded = loadMockDatastoreJson(JSON.stringify(fixture));
    expect(loaded.canvasDomain).toBe('mock.instructure.com');
    expect(loaded.synergyDomain).toBe('sis.mock.edu');
    expect(loaded.courseCount).toBe(1);

    const coursesRes = await window.fetch(
      `/api/proxy?url=${encodeURIComponent('https://mock.instructure.com/api/v1/courses')}`
    );
    expect(coursesRes.status).toBe(200);
    const courses = (await coursesRes.json()) as Array<{ id: number; name: string }>;
    expect(courses).toHaveLength(1);
    expect(courses[0].name).toBe('AP Biology');

    const verifyOutcome = await verifyStudentVueAccount({
      canvasDomain: 'mock.instructure.com',
      canvasToken: 'mock-fixture-token',
      useProxy: true,
      apiServerUrl: '',
      apiUsername: '',
      apiPassword: '',
      districtDomain: 'sis.mock.edu',
      edupointUsername: 'alex',
      edupointPassword: 'pw',
      isParent: false,
    });
    expect(verifyOutcome.ok).toBe(true);
    if (verifyOutcome.ok) {
      expect(verifyOutcome.comparison.matched).toBe(true);
      expect(verifyOutcome.comparison.studentVueProfile.name).toBe('Alex Sample');
    }
  });

  it('detects extension runtime single-student mode (D4) and forwards reuseExistingSession without password', async () => {
    const extBackend = createLocalBackend({
      platform: 'extension',
      version: '1.8.0-ext',
      transport: makeMockTransport((req) => {
        if (req.url.includes('/api/v1/users/self/profile')) {
          return jsonResponse(req.url, {
            id: 42,
            name: 'Jane Doe',
            primary_email: 'jane@school.edu',
            sis_user_id: '123456',
          });
        }
        return jsonResponse(req.url, { error: 'unexpected' }, 404);
      }),
      secretStore: createMemorySecretStore(),
    });

    const getStudentInfoSpy = vi.spyOn(extBackend.synergy, 'getStudentInfo').mockResolvedValue({
      ok: true,
      data: {
        StudentInfo: {
          FormattedName: 'Jane Doe',
          PermID: '123456',
          EMail: 'jane@school.edu',
        },
      },
    });
    const getGradebookSpy = vi.spyOn(extBackend.synergy, 'getGradebook').mockResolvedValue({
      ok: true,
      data: {
        Gradebook: {
          ReportingPeriod: { '@GradePeriod': 'Quarter 2' },
          Courses: {
            Course: {
              '@Period': '1',
              '@Title': 'Algebra II',
              Marks: {
                Mark: {
                  '@MarkName': 'Quarter 2',
                  '@CalculatedScoreString': 'A',
                  '@CalculatedScoreRaw': '95.5',
                },
              },
            },
          },
        },
      },
    });

    installLocalBackendFetchBridge(extBackend);
    const meta = await getBackendMeta();
    expect(meta?.platform).toBe('extension');
    expect(isExtensionRuntime()).toBe(true);
    expect(isMultiStudentSupported()).toBe(false);

    const verifyOutcome = await verifyStudentVueAccount({
      canvasDomain: 'canvas.example.edu',
      canvasToken: 'tok_123',
      useProxy: true,
      apiServerUrl: '',
      apiUsername: '',
      apiPassword: '',
      districtDomain: 'sis.example.edu',
      edupointUsername: '',
      edupointPassword: '',
      isParent: false,
      accountId: 'student_maya_1',
      reuseExistingSession: true,
    });
    expect(verifyOutcome.ok).toBe(true);
    expect(getStudentInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        districtDomain: 'sis.example.edu',
        accountId: 'student_maya_1',
        reuseExistingSession: true,
      })
    );

    const gradeOutcome = await syncStudentVueGradebook({
      apiServerUrl: '',
      apiUsername: '',
      apiPassword: '',
      districtDomain: 'sis.example.edu',
      edupointUsername: '',
      edupointPassword: '',
      isParent: false,
      accountId: 'student_maya_1',
      reuseExistingSession: true,
    });
    expect(gradeOutcome.ok).toBe(true);
    expect(getGradebookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        districtDomain: 'sis.example.edu',
        accountId: 'student_maya_1',
        reuseExistingSession: true,
      })
    );
  });
});
