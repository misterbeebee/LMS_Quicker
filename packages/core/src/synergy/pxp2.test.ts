import { describe, expect, it } from 'vitest';
import type { HttpRequest, HttpResponse, HttpTransport } from '../ports.js';
import { escapeXml } from './xml.js';
import { SynergyService } from './service.js';

function wrapDeprecatedSoap(): string {
  const inner =
    '<RT_ERROR ERROR_MESSAGE="This app is deprecated. To continue, please download ParentVUE (New). Error code: D5517-00." />';
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><ProcessWebServiceRequestResponse xmlns="http://edupoint.com/webservices/">` +
    `<ProcessWebServiceRequestResult>${escapeXml(inner)}</ProcessWebServiceRequestResult>` +
    `</ProcessWebServiceRequestResponse></soap:Body></soap:Envelope>`
  );
}

function makeResp(body: string, url: string, status = 200): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: { get: () => null },
    async text() {
      return body;
    },
    async bytes() {
      return Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff);
    },
  };
}

function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
    const v = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : '');
    out[k] = v;
  }
  return out;
}

describe('PXP2 web fallback parity with schoolview-api/tests/test_api.py', () => {
  it('falls back to PXP2 web login on D5517 deprecation, encodes password with JS encodeURIComponent, and handles bad password + SSO-only', async () => {
    const loginHtml = `
      <html><head><script src="/js/PXP/PXP2_Login.js"></script></head><body>
      <form id="aspnetForm" method="post" action="./PXP2_Login_Parent.aspx?regenerateSessionId=true">
        <input type="hidden" name="__VIEWSTATE" value="vs123" />
        <input type="text" name="ctl00$MainContent$username" />
        <input type="password" name="ctl00$MainContent$password" />
        <input type="submit" name="ctl00$MainContent$Submit1" value="Login" />
      </form></body></html>
    `;
    const studentHtml = `
      <html><body><table>
        <tr><th>Student Name:</th><td>Lin, Maya</td></tr>
        <tr><th>Perm ID:</th><td>551122</td></tr>
        <tr><th>Grade:</th><td>10</td></tr>
        <tr><th>E-Mail:</th><td>maya@school.edu</td></tr>
      </table></body></html>
    `;

    const postedPayloads: Array<Record<string, string>> = [];
    const transport: HttpTransport = {
      async request(req: HttpRequest): Promise<HttpResponse> {
        if (req.url.includes('PXPCommunication.asmx')) {
          return makeResp(wrapDeprecatedSoap(), req.url);
        }
        if (req.url.includes('PXP2_Login_Parent.aspx') && req.method === 'GET') {
          return makeResp(loginHtml, req.url);
        }
        if (req.url.includes('PXP2_Login_Parent.aspx') && req.method === 'POST') {
          postedPayloads.push(parseFormBody(String(req.body ?? '')));
          return makeResp('<html><body>Home</body></html>', 'https://md-mcps-psv.edupoint.com/Home_PXP2.aspx');
        }
        if (req.url.includes('StudentPicker/GetStudents')) {
          return makeResp(
            JSON.stringify({
              data: [{ name: 'Lin, Maya', sisNumber: '551122', schoolName: 'MCPS High' }],
            }),
            req.url
          );
        }
        if (req.url.includes('PXP2_Student.aspx')) {
          return makeResp(studentHtml, req.url);
        }
        return makeResp('', req.url, 404);
      },
    };

    const service = new SynergyService({
      username: 'parent_user',
      password: 'p@ss!word#1',
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
      transport,
    });

    const res = await service.getStudentInfo();
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(postedPayloads[0]?.['ctl00$MainContent$username']).toBe('parent_user');
    // PXP2_Login.js encodeURIComponent leaves ! unencoded and encodes @ and #
    expect(postedPayloads[0]?.['ctl00$MainContent$password']).toBe('p%40ss!word%231');

    const si = res.data['StudentInfo'] as Record<string, unknown>;
    expect(si['FormattedName']).toEqual({ $: 'Lin, Maya' });
    expect(si['PermID']).toEqual({ $: '551122' });
    expect(si['CurrentSchool']).toEqual({ $: 'MCPS High' });
    expect(si['EMail']).toEqual({ $: 'maya@school.edu' });
    expect(si['Grade']).toEqual({ $: '10' });

    // Bad password surfaces AUTH_FAILED
    const badPassTransport: HttpTransport = {
      async request(req) {
        if (req.url.includes('PXPCommunication.asmx')) return makeResp(wrapDeprecatedSoap(), req.url);
        if (req.method === 'GET') return makeResp(loginHtml, req.url);
        return makeResp(
          '<html><body><div id="ctl00_MainContent_ERROR">Invalid user ID or Password</div></body></html>',
          'https://md-mcps-psv.edupoint.com/PXP2_Login_Parent.aspx'
        );
      },
    };
    const badSvc = new SynergyService({
      username: 'parent_user',
      password: 'wrong',
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
      transport: badPassTransport,
    });
    const badRes = await badSvc.getStudentInfo();
    expect(badRes.ok).toBe(false);
    if (!badRes.ok) {
      expect(badRes.error.code).toBe('AUTH_FAILED');
      expect(badRes.error.message).toContain('Invalid user ID or Password');
    }

    // SSO-only StudentVUE page surfaces SSO_ONLY
    const ssoTransport: HttpTransport = {
      async request(req) {
        if (req.url.includes('PXPCommunication.asmx')) return makeResp(wrapDeprecatedSoap(), req.url);
        return makeResp(
          '<html><body><form id="aspnetForm"><a href="https://accounts.google.com/o/saml2">Login with Google</a></form></body></html>',
          req.url
        );
      },
    };
    const ssoSvc = new SynergyService({
      username: 'student1',
      password: 'pw',
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: false,
      transport: ssoTransport,
    });
    const ssoRes = await ssoSvc.getStudentInfo();
    expect(ssoRes.ok).toBe(false);
    if (!ssoRes.ok) {
      expect(ssoRes.error.code).toBe('SSO_ONLY');
      expect(ssoRes.error.message).toContain('SSO-only');
    }
  });

  it('collects all multi-student ParentVUE children without mixing sibling pages', async () => {
    const loginHtml = `
      <html><body><form id="aspnetForm" method="post" action="./PXP2_Login_Parent.aspx">
        <input type="text" name="ctl00$MainContent$username" />
        <input type="password" name="ctl00$MainContent$password" />
      </form></body></html>
    `;
    const child1Html = `
      <html><body><table>
        <tr><th>Student Name:</th><td>Doe, Alex</td></tr>
        <tr><th>Perm ID:</th><td>111001</td></tr>
        <tr><th>Grade:</th><td>09</td></tr>
        <tr><th>E-Mail:</th><td>alex.doe@school.edu</td></tr>
      </table></body></html>
    `;
    const child2Html = `
      <html><body><table>
        <tr><th>Student Name:</th><td>Doe, Sam</td></tr>
        <tr><th>Perm ID:</th><td>222002</td></tr>
        <tr><th>Grade:</th><td>11</td></tr>
        <tr><th>E-Mail:</th><td>sam.doe@school.edu</td></tr>
      </table></body></html>
    `;

    const transport: HttpTransport = {
      async request(req) {
        if (req.url.includes('PXPCommunication.asmx')) return makeResp(wrapDeprecatedSoap(), req.url);
        if (req.url.includes('PXP2_Login_Parent.aspx') && req.method === 'GET') {
          return makeResp(loginHtml, req.url);
        }
        if (req.url.includes('PXP2_Login_Parent.aspx') && req.method === 'POST') {
          return makeResp('<html><body>Home</body></html>', 'https://md-mcps-psv.edupoint.com/Home_PXP2.aspx');
        }
        if (req.url.includes('StudentPicker/GetStudents')) {
          return makeResp(
            JSON.stringify({
              data: [
                { AGU: 'AGU-1', name: 'Doe, Alex', sisNumber: '111001', schoolName: 'North MS' },
                { AGU: 'AGU-2', name: 'Doe, Sam', sisNumber: '222002', schoolName: 'MCPS High' },
                { AGU: 'AGU-3', name: 'Doe, Taylor', sisNumber: '333003', schoolName: 'Oak ES' },
              ],
            }),
            req.url
          );
        }
        if (req.url.includes('PXP2_Student.aspx')) {
          const agu = req.headers?.['AGU'];
          if (agu === 'AGU-2') return makeResp(child2Html, req.url);
          // For AGU-3, simulate Synergy returning sibling 1's page -> must not mix!
          return makeResp(child1Html, req.url);
        }
        return makeResp('', req.url, 404);
      },
    };

    const service = new SynergyService({
      username: 'parent_multi',
      password: 'secret',
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
      transport,
    });

    const res = await service.getStudentInfo();
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const students = ((res.data['StudentInfo'] as Record<string, unknown>)['Students']) as Array<
      Record<string, unknown>
    >;
    expect(students).toHaveLength(3);
    expect(students[0]?.['FormattedName']).toEqual({ $: 'Doe, Alex' });
    expect(students[0]?.['EMail']).toEqual({ $: 'alex.doe@school.edu' });
    expect(students[0]?.['Grade']).toEqual({ $: '09' });

    expect(students[1]?.['FormattedName']).toEqual({ $: 'Doe, Sam' });
    expect(students[1]?.['PermID']).toEqual({ $: '222002' });
    expect(students[1]?.['EMail']).toEqual({ $: 'sam.doe@school.edu' });
    expect(students[1]?.['Grade']).toEqual({ $: '11' });

    expect(students[2]?.['FormattedName']).toEqual({ $: 'Doe, Taylor' });
    expect(students[2]?.['PermID']).toEqual({ $: '333003' });
    expect(students[2]).not.toHaveProperty('EMail');
    expect(students[2]).not.toHaveProperty('Grade');
  });

  it('parses PXP2 gradebook courses, categories, assignments, and reporting period switch', async () => {
    const loginHtml = `
      <html><body><form id="aspnetForm" method="post" action="./PXP2_Login_Parent.aspx">
        <input type="text" name="ctl00$MainContent$username" />
        <input type="password" name="ctl00$MainContent$password" />
      </form></body></html>
    `;
    const gbPageHtml = `
      <html><head><script>
        window.FOCUS_KEY = 'fk-init-1';
        PXP.GBCurrentFocus = {"FocusArgs": {"schoolID": 42, "OrgYearGU": "OY-1", "gradePeriodGU": "GP-1", "AGU": "AGU-SAM"}};
        PXP.GBFocusData = {
          "GradingPeriods": [
            {"GU": "GP-1", "Name": "MP1", "GroupName": "Quarter", "defaultFocus": true, "StartDate": "2026-09-01", "EndDate": "2026-11-01"},
            {"GU": "GP-2", "Name": "MP2", "GroupName": "Quarter", "defaultFocus": false, "StartDate": "2026-11-02", "EndDate": "2027-01-25"}
          ]
        };
      </script></head><body><div>Initial MP1</div></body></html>
    `;
    const mp2ClassesHtml = `
      <table>
        <tr class="gb-class-header gb-class-row" data-guid="CLS-1">
          <td>
            <span class="period">1</span>
            <button class="course-title" data-focus='{"FocusArgs":{"classGU":"CLS-1","markPeriodGU":"GP-2"},"LoadParams":{"ControlName":"Gradebook_ClassDetails"}}'>Honors Chemistry (SCI2001)</button>
            <div class="teacher"><a href="mailto:curie@mcps.org">Curie, Marie</a></div>
            <div class="room">Room: 214B</div>
          </td>
          <td><span class="mark">A</span><span class="score">94.6%</span></td>
        </tr>
        <tr class="gb-class-header gb-class-row" data-guid="CLS-2">
          <td>
            <span class="period">2</span>
            <button class="course-title" data-focus='{"FocusArgs":{"classGU":"CLS-2","markPeriodGU":"GP-2"},"LoadParams":{"ControlName":"Gradebook_ClassDetails"}}'>US History</button>
            <div class="teacher">Lincoln, Abe</div>
          </td>
          <td><span class="mark">N/A</span><span class="score">N/A</span></td>
        </tr>
      </table>
      <div class="gb-class-details">
        <div class="gb-class-row" data-guid="CLS-2">
          <table>
            <thead><tr><th>Category</th><th>Weight</th><th>Points</th><th>Score</th></tr></thead>
            <tbody><tr><td>All Tasks</td><td>90%</td><td>0 / 0</td><td>N/A</td></tr></tbody>
          </table>
        </div>
      </div>
    `;
    const class1DetailsHtml = `
      <div class="CategoryWeightsGrid">
        <table>
          <thead><tr><th>Category</th><th>Weight</th><th>Points</th><th>Calc Avg</th></tr></thead>
          <tbody>
            <tr><td>All Tasks / Assessments</td><td>90%</td><td>180 / 190</td><td>94.7%</td></tr>
            <tr><td>Practice / Preparation</td><td>10%</td><td>47 / 50</td><td>94.0%</td></tr>
            <tr><td>TOTAL</td><td>100%</td><td>227 / 240</td><td>94.6%</td></tr>
          </tbody>
        </table>
      </div>
      <script>
        $("#grid").dxDataGrid({
          dataSource: [
            {"Measure": "Stoichiometry Quiz", "Type": "All Tasks / Assessments", "Date": "11/10/2026", "DueDate": "11/10/2026", "DisplayScore": "48 / 50", "Points": "48 / 50", "Notes": "Great work"},
            {"Measure": "Mole Lab", "Type": "Practice / Preparation", "Date": "11/05/2026", "Score": "20 / 20", "Points": "20 / 20"}
          ]
        });
      </script>
    `;
    const class2DetailsHtml = `
      <div id="assignment-details">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Assignment</th><th>Category</th><th>Score</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>11/12/2026</td><td>Constitution Essay</td><td>All Tasks</td><td>Not Graded</td><td>Draft submitted</td></tr>
          </tbody>
        </table>
      </div>
    `;

    const observedAgus: Array<string | undefined> = [];
    const transport: HttpTransport = {
      async request(req) {
        if (req.url.includes('PXPCommunication.asmx')) return makeResp(wrapDeprecatedSoap(), req.url);
        if (req.url.includes('PXP2_Login_Parent.aspx') && req.method === 'GET') {
          return makeResp(loginHtml, req.url);
        }
        if (req.url.includes('PXP2_Login_Parent.aspx') && req.method === 'POST') {
          return makeResp('<html>Home</html>', 'https://md-mcps-psv.edupoint.com/Home_PXP2.aspx');
        }
        if (req.url.includes('StudentPicker/GetStudents')) {
          return makeResp(
            JSON.stringify({
              data: [
                { AGU: 'AGU-ALEX', name: 'Doe, Alex', sisNumber: '111001' },
                { AGU: 'AGU-SAM-LIVE', name: 'Doe, Sam', sisNumber: '222002' },
              ],
            }),
            req.url
          );
        }
        if (req.url.includes('PXP2_Gradebook.aspx')) {
          observedAgus.push(req.headers?.['AGU']);
          return makeResp(gbPageHtml, req.url);
        }
        if (req.url.includes('LoadControl')) {
          const parsed = JSON.parse(String(req.body ?? '{}')) as {
            request: { control: string; parameters: Record<string, unknown> };
          };
          const { control, parameters } = parsed.request;
          if (control === 'Gradebook_SchoolClasses') {
            expect(parameters['gradePeriodGU']).toBe('GP-2');
            expect(parameters['AGU']).toBe('AGU-SAM-LIVE');
            return makeResp(
              JSON.stringify({ d: { FOCUS_KEY: 'fk-2', Data: { html: mp2ClassesHtml } } }),
              req.url
            );
          }
          if (control === 'Gradebook_ClassDetails') {
            if (parameters['classGU'] === 'CLS-1') {
              return makeResp(
                JSON.stringify({ d: { FOCUS_KEY: 'fk-3', Data: { html: class1DetailsHtml } } }),
                req.url
              );
            }
            if (parameters['classGU'] === 'CLS-2') {
              return makeResp(
                JSON.stringify({ d: { FOCUS_KEY: 'fk-4', Data: { html: class2DetailsHtml } } }),
                req.url
              );
            }
          }
        }
        return makeResp('', req.url, 404);
      },
    };

    const service = new SynergyService({
      username: 'parent_multi',
      password: 'secret',
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
      transport,
    });

    const res = await service.getGradebook({
      reportPeriod: 1,
      agu: 'AGU-OLD',
      permId: '222002',
      studentName: 'Doe, Sam',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(observedAgus).toEqual(['AGU-SAM-LIVE']);

    const gb = res.data['Gradebook'] as Record<string, unknown>;
    expect((gb['ReportingPeriod'] as Record<string, unknown>)['@GradePeriod']).toBe('MP2');
    const rps = (gb['ReportingPeriods'] as Record<string, unknown>)['ReportPeriod'] as unknown[];
    expect(rps).toHaveLength(2);

    const courses = (gb['Courses'] as Record<string, unknown>)['Course'] as Array<
      Record<string, unknown>
    >;
    expect(courses).toHaveLength(2);

    const chem = courses[0]!;
    expect(chem['@Title']).toBe('Honors Chemistry (SCI2001)');
    expect(chem['@CourseID']).toBe('SCI2001');
    expect(chem['@Period']).toBe('1');
    expect(chem['@Staff']).toBe('Curie, Marie');
    expect(chem['@StaffEMail']).toBe('curie@mcps.org');
    expect(chem['@Room']).toBe('214B');

    const chemMark = ((chem['Marks'] as Record<string, unknown>)['Mark'] as Array<
      Record<string, unknown>
    >)[0]!;
    expect(chemMark['@CalculatedScoreString']).toBe('A');
    expect(chemMark['@CalculatedScoreRaw']).toBe('94.6');

    const calcs = (chemMark['GradeCalculationSummary'] as Record<string, unknown>)[
      'AssignmentGradeCalc'
    ] as Array<Record<string, unknown>>;
    expect(calcs).toHaveLength(2);
    expect(calcs[0]).toMatchObject({
      '@Type': 'All Tasks / Assessments',
      '@Weight': '90%',
      '@Points': '180',
      '@PointsPossible': '190',
      '@CalculatedMark': '94.7%',
    });

    const asgns = (chemMark['Assignments'] as Record<string, unknown>)['Assignment'] as Array<
      Record<string, unknown>
    >;
    expect(asgns).toHaveLength(2);
    expect(asgns[0]).toMatchObject({
      '@Measure': 'Stoichiometry Quiz',
      '@Score': '48 / 50',
      '@Notes': 'Great work',
    });

    const hist = courses[1]!;
    const histMark = ((hist['Marks'] as Record<string, unknown>)['Mark'] as Array<
      Record<string, unknown>
    >)[0]!;
    expect(histMark['@CalculatedScoreString']).toBe('N/A');
    expect(histMark['@CalculatedScoreRaw']).toBe('');
    const histCalcs = (histMark['GradeCalculationSummary'] as Record<string, unknown>)[
      'AssignmentGradeCalc'
    ] as Array<Record<string, unknown>>;
    expect(histCalcs[0]?.['@Type']).toBe('All Tasks');
    const histAsgns = (histMark['Assignments'] as Record<string, unknown>)['Assignment'] as Array<
      Record<string, unknown>
    >;
    expect(histAsgns[0]).toMatchObject({
      '@Measure': 'Constitution Essay',
      '@Notes': 'Draft submitted',
    });
  });

  it('supports reuseExistingSession mode (Chrome extension open-tab / SSO reuse)', async () => {
    let hitLoginForm = false;
    const transport: HttpTransport = {
      async request(req) {
        if (req.url.includes('PXPCommunication.asmx')) return makeResp(wrapDeprecatedSoap(), req.url);
        if (req.url.includes('Home_PXP2.aspx')) {
          return makeResp('<html><body>Welcome SSO Student</body></html>', req.url);
        }
        if (req.url.includes('PXP2_Login_')) {
          hitLoginForm = true;
          return makeResp('', req.url, 500);
        }
        if (req.url.includes('StudentPicker/GetStudents')) {
          return makeResp(
            JSON.stringify({
              data: [{ name: 'SSO, Jordan', sisNumber: '999888', schoolName: 'SSO High' }],
            }),
            req.url
          );
        }
        if (req.url.includes('PXP2_Student.aspx')) {
          return makeResp('<html><body><table><tr><th>Grade:</th><td>12</td></tr></table></body></html>', req.url);
        }
        return makeResp('', req.url, 404);
      },
    };

    const service = new SynergyService({
      username: '',
      password: '',
      districtDomain: 'sso-district.edupoint.com',
      isParent: false,
      reuseExistingSession: true,
      transport,
    });

    const res = await service.getStudentInfo();
    expect(hitLoginForm).toBe(false);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const si = res.data['StudentInfo'] as Record<string, unknown>;
    expect(si['FormattedName']).toEqual({ $: 'SSO, Jordan' });
    expect(si['Grade']).toEqual({ $: '12' });
  });
});
