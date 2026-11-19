import { describe, expect, it } from 'vitest';
import type { HttpHeaders, HttpRequest, HttpResponse, HttpTransport } from '../ports.js';
import {
  createMockDatastoreBackend,
  downloadAccountDatastore,
  VelmMockDatastoreV1Schema,
} from './index.js';

function makeHeaders(map: Record<string, string>): HttpHeaders {
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(map)) lower.set(k.toLowerCase(), v);
  return {
    get: (name) => lower.get(name.toLowerCase()) ?? null,
    forEach: (cb) => {
      lower.forEach((v, k) => cb(v, k));
    },
  };
}

function makeResponse(url: string, body: string, contentType = 'application/json', status = 200): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: makeHeaders({ 'content-type': contentType }),
    text: async () => body,
    bytes: async () => Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff),
  };
}

const SOAP_STUDENT_INFO = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProcessWebServiceRequestResponse xmlns="http://edupoint.com/webservices/">
      <ProcessWebServiceRequestResult>&lt;StudentInfo&gt;&lt;FormattedName&gt;Maya Lin&lt;/FormattedName&gt;&lt;PermID&gt;551122&lt;/PermID&gt;&lt;EMail&gt;maya.lin@mcpsmd.net&lt;/EMail&gt;&lt;/StudentInfo&gt;</ProcessWebServiceRequestResult>
    </ProcessWebServiceRequestResponse>
  </soap:Body>
</soap:Envelope>`;

const SOAP_GRADEBOOK = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProcessWebServiceRequestResponse xmlns="http://edupoint.com/webservices/">
      <ProcessWebServiceRequestResult>&lt;Gradebook&gt;&lt;Courses&gt;&lt;Course Title="AP Chemistry" Period="2" /&gt;&lt;/Courses&gt;&lt;/Gradebook&gt;</ProcessWebServiceRequestResult>
    </ProcessWebServiceRequestResponse>
  </soap:Body>
</soap:Envelope>`;

describe('Account data downloader, PII sanitizer, and mock datastore backend', () => {
  it('downloads Canvas + Synergy endpoints, sanitizes PII, and replays offline via VelmBackend', async () => {
    const transport: HttpTransport = {
      async request(req: HttpRequest): Promise<HttpResponse> {
        if (req.url.includes('PXPCommunication.asmx')) {
          const body = typeof req.body === 'string' ? req.body : '';
          if (body.includes('StudentInfo')) {
            return makeResponse(req.url, SOAP_STUDENT_INFO, 'text/xml');
          }
          if (body.includes('Gradebook')) {
            return makeResponse(req.url, SOAP_GRADEBOOK, 'text/xml');
          }
          return makeResponse(req.url, SOAP_STUDENT_INFO, 'text/xml');
        }

        const parsed = new URL(req.url);
        const p = parsed.pathname;
        if (p === '/api/v1/users/self') {
          return makeResponse(
            req.url,
            JSON.stringify({ id: 7, name: 'Maya Lin', login_id: '551122', email: 'maya.lin@mcpsmd.net' })
          );
        }
        if (p === '/api/v1/users/self/profile') {
          return makeResponse(
            req.url,
            JSON.stringify({
              id: 7,
              name: 'Maya Lin',
              primary_email: 'maya.lin@mcpsmd.net',
              sis_user_id: '551122',
              avatar_url: 'https://real.instructure.com/avatar.png',
            })
          );
        }
        if (p === '/api/v1/courses') {
          return makeResponse(req.url, JSON.stringify([{ id: 101, name: 'AP Chemistry' }]));
        }
        if (p === '/api/v1/courses/101') {
          return makeResponse(req.url, JSON.stringify({ id: 101, name: 'AP Chemistry' }));
        }
        if (p === '/api/v1/courses/101/assignments') {
          return makeResponse(
            req.url,
            JSON.stringify([{ id: 501, name: 'Lab 1 for Maya Lin', points_possible: 50 }])
          );
        }
        if (p === '/api/v1/announcements') {
          return makeResponse(
            req.url,
            JSON.stringify([
              { id: 901, title: 'Welcome', context_code: 'course_101', read_state: 'unread' },
            ])
          );
        }
        return makeResponse(req.url, JSON.stringify([]));
      },
    };

    const store = await downloadAccountDatastore({
      transport,
      canvas: { domain: 'mcpsmd.instructure.com', token: 'real-secret-token' },
      synergy: {
        domain: 'md-mcps-psv.edupoint.com',
        username: '551122',
        password: 'real-password',
      },
      sanitize: true,
    });

    // Validates cleanly against Zod schema
    const parsedStore = VelmMockDatastoreV1Schema.parse(store);
    expect(parsedStore.sanitized).toBe(true);

    // PII, domains, and avatar URLs are scrubbed
    const serialized = JSON.stringify(parsedStore);
    expect(serialized).not.toContain('Maya Lin');
    expect(serialized).not.toContain('maya.lin@mcpsmd.net');
    expect(serialized).not.toContain('551122');
    expect(serialized).not.toContain('mcpsmd.instructure.com');
    expect(serialized).not.toContain('md-mcps-psv.edupoint.com');
    expect(serialized).toContain('Alex Rivera');

    // Replay offline via createMockDatastoreBackend
    const backend = createMockDatastoreBackend(parsedStore);
    const meta = await backend.getMeta();
    expect(meta.platform).toBe('desktop');

    const coursesRes = await backend.httpRequest({
      url: 'https://mock.instructure.com/api/v1/courses',
      method: 'GET',
    });
    expect(coursesRes.status).toBe(200);
    expect(JSON.parse(coursesRes.text)).toHaveLength(1);

    const assignRes = await backend.httpRequest({
      url: 'https://mock.instructure.com/api/v1/courses/101/assignments/501',
      method: 'GET',
    });
    expect(assignRes.status).toBe(200);
    expect(JSON.parse(assignRes.text).name).toContain('Alex Rivera');

    // Mark announcement read in-memory and verify state updates
    const putRes = await backend.httpRequest({
      url: 'https://mock.instructure.com/api/v1/courses/101/discussion_topics/901/read',
      method: 'PUT',
    });
    expect(putRes.status).toBe(204);

    const annRes = await backend.httpRequest({
      url: 'https://mock.instructure.com/api/v1/announcements?context_codes[]=course_101',
      method: 'GET',
    });
    expect(JSON.parse(annRes.text)[0].read_state).toBe('read');

    // Synergy replay
    const gbRes = await backend.synergy.getGradebook({
      username: 'any',
      password: 'any',
      districtDomain: 'mock-sis.edupoint.com',
    });
    expect(gbRes.ok).toBe(true);
  });
});
