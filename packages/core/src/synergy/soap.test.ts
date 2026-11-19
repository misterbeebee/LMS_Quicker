import { describe, expect, it } from 'vitest';
import type { HttpRequest, HttpResponse, HttpTransport } from '../ports.js';
import {
  SynergyAuthError,
  SynergyError,
  extractRtError,
  isDeprecatedSoapError,
  normalizeDistrictDomain,
} from './errors.js';
import { SynergySoapClient } from './soap.js';
import { buildParmsXml, buildSoapEnvelope, escapeXml, parseSoapResponse, parseSynergyXml } from './xml.js';

function wrapSoapResult(innerXml: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>` +
    `<ProcessWebServiceRequestResponse xmlns="http://edupoint.com/webservices/">` +
    `<ProcessWebServiceRequestResult>${escapeXml(innerXml)}</ProcessWebServiceRequestResult>` +
    `</ProcessWebServiceRequestResponse>` +
    `</soap:Body>` +
    `</soap:Envelope>`
  );
}

function makeMockTransport(responder: (req: HttpRequest) => { status?: number; body: string }): {
  transport: HttpTransport;
  requests: HttpRequest[];
} {
  const requests: HttpRequest[] = [];
  const transport: HttpTransport = {
    async request(req: HttpRequest): Promise<HttpResponse> {
      requests.push(req);
      const res = responder(req);
      const status = res.status ?? 200;
      return {
        status,
        ok: status >= 200 && status < 300,
        url: req.url,
        headers: { get: () => null },
        async text() {
          return res.body;
        },
        async bytes() {
          return Uint8Array.from(res.body, (c) => c.charCodeAt(0) & 0xff);
        },
      };
    },
  };
  return { transport, requests };
}

describe('Synergy XML & SOAP envelope', () => {
  it('escapes XML special chars in credentials and Parms', () => {
    expect(buildParmsXml({ ReportPeriod: 2, Tag: 'A&B<C>' })).toBe(
      '<Parms><ReportPeriod>2</ReportPeriod><Tag>A&amp;B&lt;C&gt;</Tag></Parms>'
    );

    const env = buildSoapEnvelope({
      username: 'user&1',
      password: 'p<w>"\'',
      isParent: true,
      methodName: 'Gradebook',
      params: { ReportPeriod: 1 },
    });
    expect(env).toContain('<userID>user&amp;1</userID>');
    expect(env).toContain('<password>p&lt;w&gt;&quot;&apos;</password>');
    expect(env).toContain('<parent>1</parent>');
    expect(env).toContain('<skipLoginLog>1</skipLoginLog>');
    expect(env).toContain('<methodName>Gradebook</methodName>');
    expect(env).toContain(
      '<paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;1&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr>'
    );
  });

  it('parses StudentInfo and Gradebook XML into badgerfish-compatible JSON', () => {
    const studentInfoXml = `<StudentInfo>
      <FormattedName>Lin, Maya</FormattedName>
      <PermID>551122</PermID>
      <Grade>10</Grade>
      <EMail>maya@school.edu</EMail>
      <CurrentSchool>MCPS High</CurrentSchool>
    </StudentInfo>`;

    const parsed = parseSynergyXml(studentInfoXml);
    expect(parsed).toEqual({
      StudentInfo: {
        FormattedName: { $: 'Lin, Maya' },
        PermID: { $: '551122' },
        Grade: { $: '10' },
        EMail: { $: 'maya@school.edu' },
        CurrentSchool: { $: 'MCPS High' },
      },
    });

    const gradebookXml = `<Gradebook Type="Traditional">
      <ReportingPeriod GradePeriod="MP2" StartDate="11/02/2026" EndDate="01/25/2027" />
      <Courses>
        <Course Period="1" Title="Honors Chemistry (SCI2001)" Staff="Curie, Marie">
          <Marks>
            <Mark MarkName="MP2" CalculatedScoreString="A" CalculatedScoreRaw="94.6">
              <Assignments>
                <Assignment Measure="Stoichiometry Quiz" Score="48 / 50" />
              </Assignments>
            </Mark>
          </Marks>
        </Course>
      </Courses>
    </Gradebook>`;

    const gbParsed = parseSoapResponse(wrapSoapResult(gradebookXml));
    const gb = gbParsed['Gradebook'] as Record<string, unknown>;
    expect(gb['@Type']).toBe('Traditional');
    expect((gb['ReportingPeriod'] as Record<string, unknown>)['@GradePeriod']).toBe('MP2');
    const course = ((gb['Courses'] as Record<string, unknown>)['Course'] as Record<string, unknown>);
    expect(course['@Title']).toBe('Honors Chemistry (SCI2001)');
    expect(course['@Period']).toBe('1');
  });

  it('throws cleanly on SOAP faults', () => {
    const faultXml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body><soap:Fault><faultstring>Server was unable to process request.</faultstring></soap:Fault></soap:Body>
    </soap:Envelope>`;
    expect(() => parseSoapResponse(faultXml)).toThrow(/SOAP fault/);
  });
});

describe('SynergySoapClient', () => {
  it('validates and normalizes district domains', () => {
    expect(normalizeDistrictDomain('https://MD-MCPS-PSV.edupoint.com/')).toBe('md-mcps-psv.edupoint.com');
    expect(normalizeDistrictDomain('portal.sfusd.edu/PXP2')).toBe('portal.sfusd.edu');
    expect(normalizeDistrictDomain('not a domain')).toBeNull();
    expect(normalizeDistrictDomain('')).toBeNull();
  });

  it('sends SOAP requests for all 11 methods with proper parameters', async () => {
    const { transport, requests } = makeMockTransport(() => ({
      body: wrapSoapResult('<StudentInfo><FormattedName>Test</FormattedName></StudentInfo>'),
    }));

    const client = new SynergySoapClient({
      username: 'parent1',
      password: 'secret',
      districtDomain: 'https://md-mcps-psv.edupoint.com/',
      isParent: true,
      transport,
    });

    await client.getStudentInfo();
    await client.getSchoolInfo();
    await client.getGradebook(2);
    await client.getSchedule(1);
    await client.getAttendance();
    await client.getMessages();
    await client.getCalendar('2026-11-18');
    await client.listReportCards();
    await client.getReportCard('RC-GU-1');
    await client.listDocuments();
    await client.getDocument('DOC-GU-1');

    expect(requests).toHaveLength(11);
    expect(requests[0]?.url).toBe('https://md-mcps-psv.edupoint.com/Service/PXPCommunication.asmx');
    expect(String(requests[2]?.body)).toContain('<methodName>Gradebook</methodName>');
    expect(String(requests[2]?.body)).toContain('&lt;ReportPeriod&gt;2&lt;/ReportPeriod&gt;');
    expect(String(requests[3]?.body)).toContain('<methodName>StudentClassList</methodName>');
    expect(String(requests[3]?.body)).toContain('&lt;TermIndex&gt;1&lt;/TermIndex&gt;');
    expect(String(requests[6]?.body)).toContain('&lt;RequestDate&gt;2026-11-18&lt;/RequestDate&gt;');
    expect(String(requests[8]?.body)).toContain('&lt;DocumentGU&gt;RC-GU-1&lt;/DocumentGU&gt;');
    expect(String(requests[10]?.body)).toContain('&lt;DocumentGU&gt;DOC-GU-1&lt;/DocumentGU&gt;');
  });

  it('classifies RT_ERROR payloads (deprecated D5517, invalid password, generic)', async () => {
    const { transport: depTransport } = makeMockTransport(() => ({
      body: wrapSoapResult(
        '<RT_ERROR ERROR_MESSAGE="This app is deprecated. Error code: D5517-00." />'
      ),
    }));
    const depClient = new SynergySoapClient({
      username: 'u',
      password: 'p',
      districtDomain: 'md-mcps-psv.edupoint.com',
      transport: depTransport,
    });
    const rawDep = await depClient.getStudentInfo();
    const errMsg = extractRtError(rawDep);
    expect(errMsg).toContain('D5517-00');
    expect(isDeprecatedSoapError(errMsg ?? '')).toBe(true);
    await expect(depClient.checkedRequest('StudentInfo')).rejects.toMatchObject({
      code: 'SOAP_DEPRECATED',
    });

    const { transport: authTransport } = makeMockTransport(() => ({
      body: wrapSoapResult('<RT_ERROR ERROR_MESSAGE="Invalid user id or password" />'),
    }));
    const authClient = new SynergySoapClient({
      username: 'u',
      password: 'wrong',
      districtDomain: 'md-mcps-psv.edupoint.com',
      transport: authTransport,
    });
    await expect(authClient.checkedRequest('StudentInfo')).rejects.toBeInstanceOf(SynergyAuthError);

    const { transport: errTransport } = makeMockTransport(() => ({
      body: wrapSoapResult('<RT_ERROR ERROR_MESSAGE="District module disabled" />'),
    }));
    const errClient = new SynergySoapClient({
      username: 'u',
      password: 'p',
      districtDomain: 'md-mcps-psv.edupoint.com',
      transport: errTransport,
    });
    await expect(errClient.checkedRequest('Attendance')).rejects.toBeInstanceOf(SynergyError);
  });
});
