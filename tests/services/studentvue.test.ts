import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  compareStudentProfiles,
  verifyStudentVueAccount,
  SYNERGY_ENDPOINT_OPTIONS,
  normalizeSynergyDomain,
  inferSuggestedSynergyDomain,
  formatApiErrorDetail,
} from '../../services/studentvue';

describe('StudentVUE comparison & verification service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes plausible Synergy endpoint presets including md-mcps-psv.edupoint.com and normalizes domains cleanly', () => {
    expect(SYNERGY_ENDPOINT_OPTIONS.some((opt) => opt.domain === 'md-mcps-psv.edupoint.com')).toBe(true);
    expect(normalizeSynergyDomain('https://md-mcps-psv.edupoint.com/PXP2_Login.aspx')).toBe('md-mcps-psv.edupoint.com');
    expect(inferSuggestedSynergyDomain('mcpsmd.instructure.com')).toBe('md-mcps-psv.edupoint.com');
    expect(inferSuggestedSynergyDomain('unknown.instructure.com')).toBe('');
  });

  it('matches "Last, First" Canvas names against "First Last" StudentVUE names and matching PermID with high confidence', () => {
    const result = compareStudentProfiles(
      {
        id: 42,
        name: 'Doe, Jane M',
        sortableName: 'Doe, Jane',
        sisUserId: '123456',
        email: 'jane.doe@school.edu',
      },
      {
        name: 'Jane Doe',
        permId: '123456',
        email: 'jane.doe@school.edu',
        school: 'Montgomery High',
        grade: '11',
      }
    );

    expect(result.matched).toBe(true);
    expect(result.confidence).toBe('high');
    expect(result.mismatchReasons).toHaveLength(0);
    expect(result.matchReasons.some((r) => r.includes('Name matches'))).toBe(true);
    expect(result.matchReasons.some((r) => r.includes('Student ID matches'))).toBe(true);
    expect(result.matchReasons.some((r) => r.includes('Email matches'))).toBe(true);
  });

  it('flags mismatched profiles when names or emails differ and tolerates malformed non-string values safely', () => {
    const result = compareStudentProfiles(
      {
        name: 'Alice Smith',
        email: 'alice@school.edu',
      },
      {
        name: 'Bob Jones',
        email: 'bob@school.edu',
        permId: '999999',
      }
    );

    expect(result.matched).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.mismatchReasons.length).toBeGreaterThanOrEqual(2);

    const weird = compareStudentProfiles(
      { name: ({ bad: true } as unknown) as string },
      { permId: (12345 as unknown) as string }
    );
    expect(weird.matched).toBe(false);
    expect(weird.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid server URL without throwing', async () => {
    const outcome = await verifyStudentVueAccount({
      apiServerUrl: 'ftp://invalid.local',
      apiUsername: 'api_user',
      apiPassword: 'secret',
      districtDomain: 'md-mcps-psv.edupoint.com',
      edupointUsername: '12345',
      edupointPassword: 'pw',
      isParent: false,
      canvasDomain: 'school.instructure.com',
      canvasToken: '1234~abc',
      useProxy: true,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) {
      expect(outcome.stage).toBe('config');
    }
  });

  it('never throws or renders [object Object] on FastAPI 422 arrays, HTML errors, or Synergy RT_ERROR payloads', async () => {
    expect(
      formatApiErrorDetail([{ loc: ['body', 'district_domain'], msg: 'field required' }], 422)
    ).toBe('district_domain: field required');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('users/self') || decodeURIComponent(url).includes('users/self')) {
        return new Response(JSON.stringify({ id: 77, name: 'Maya Lin' }), { status: 200 });
      }
      if (url === 'http://localhost:8080/auth/token') {
        return new Response(JSON.stringify({ access_token: 'jwt_tok_1' }), { status: 200 });
      }
      if (url === 'http://localhost:8080/api/v1/edupoint/session') {
        return new Response(JSON.stringify({ edupoint_session: 'enc_sess_1' }), { status: 200 });
      }
      if (url === 'http://localhost:8080/api/v1/edupoint/student-info') {
        return new Response(
          JSON.stringify({
            data: {
              RT_ERROR: {
                '@ERROR_MESSAGE': 'Invalid user id or password',
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response('<html>Bad Gateway</html>', { status: 502 });
    });

    const outcome = await verifyStudentVueAccount({
      apiServerUrl: 'http://localhost:8080',
      apiUsername: 'maya_api',
      apiPassword: 'api_pw',
      districtDomain: 'https://md-mcps-psv.edupoint.com/PXP2_Login.aspx',
      edupointUsername: '551122',
      edupointPassword: 'pw',
      isParent: false,
      canvasDomain: 'school.instructure.com',
      canvasToken: '1234~abc',
      useProxy: true,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) {
      expect(outcome.stage).toBe('student_info');
      expect(outcome.error).toContain('Invalid user id or password');
      expect(outcome.error).not.toContain('[object Object]');
    }
  });

  it('completes end-to-end verification across Canvas profile + schoolview-api auth/session/student-info', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(encodeURIComponent('https://school.instructure.com/api/v1/users/self/profile'))) {
        return new Response(
          JSON.stringify({ id: 77, name: 'Maya Lin', primary_email: 'maya@school.edu', sis_user_id: '551122' }),
          { status: 200 }
        );
      }
      if (url.includes(encodeURIComponent('https://school.instructure.com/api/v1/users/self'))) {
        return new Response(
          JSON.stringify({ id: 77, name: 'Maya Lin', login_id: '551122@school.edu' }),
          { status: 200 }
        );
      }
      if (url === 'http://localhost:8080/auth/token') {
        return new Response(JSON.stringify({ access_token: 'jwt_tok_1' }), { status: 200 });
      }
      if (url === 'http://localhost:8080/api/v1/edupoint/session') {
        return new Response(JSON.stringify({ edupoint_session: 'enc_sess_1' }), { status: 200 });
      }
      if (url === 'http://localhost:8080/api/v1/edupoint/student-info') {
        return new Response(
          JSON.stringify({
            data: {
              StudentInfo: {
                FormattedName: { $: 'Lin, Maya' },
                PermID: { $: '551122' },
                EMail: { $: 'maya@school.edu' },
                CurrentSchool: { $: 'Oak Ridge High' },
                Grade: { $: '10' },
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ detail: 'Unexpected endpoint' }), { status: 404 });
    });

    const outcome = await verifyStudentVueAccount({
      apiServerUrl: 'http://localhost:8080',
      apiUsername: 'maya_api',
      apiPassword: 'api_pw',
      districtDomain: 'md-mcps-psv.edupoint.com',
      edupointUsername: '551122',
      edupointPassword: 'transient_password',
      isParent: false,
      canvasDomain: 'school.instructure.com',
      canvasToken: '1234~abc',
      useProxy: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.comparison.matched).toBe(true);
      expect(outcome.comparison.confidence).toBe('high');
      expect(outcome.comparison.studentVueProfile.school).toBe('Oak Ridge High');
    }
  });
});
