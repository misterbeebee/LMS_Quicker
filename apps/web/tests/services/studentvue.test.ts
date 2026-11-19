import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  compareStudentProfiles,
  extractStudentVueProfiles,
  selectBestMatchingStudent,
  verifyStudentVueAccount,
  SYNERGY_ENDPOINT_OPTIONS,
  normalizeSynergyDomain,
  inferSuggestedSynergyDomain,
  formatApiErrorDetail,
  saveLinkedStudentVueProfile,
  getLinkedStudentVueProfile,
  clearLinkedStudentVueProfile,
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

  it('never throws or renders [object Object] on FastAPI 422 arrays, HTML errors, empty error bodies, or Synergy RT_ERROR payloads', async () => {
    expect(
      formatApiErrorDetail([{ loc: ['body', 'district_domain'], msg: 'field required' }], 422)
    ).toBe('district_domain: field required');
    expect(formatApiErrorDetail({}, 401)).toBe('HTTP 401 (empty response)');

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

  it('extracts multi-student ParentVUE payloads and auto-matches the matching sibling from Canvas context', async () => {
    const profiles = extractStudentVueProfiles({
      StudentInfo: {
        FormattedName: { $: 'Doe, Alex' },
        PermID: { $: '111001' },
        CurrentSchool: { $: 'North MS' },
        Grade: { $: '07' },
        Students: [
          {
            FormattedName: { $: 'Doe, Alex' },
            PermID: { $: '111001' },
            CurrentSchool: { $: 'North MS' },
            Grade: { $: '07' },
          },
          {
            FormattedName: { $: 'Doe, Sam' },
            PermID: { $: '222002' },
            EMail: { $: 'sam.doe@school.edu' },
            CurrentSchool: { $: 'MCPS High' },
            Grade: { $: '11' },
          },
        ],
      },
    });

    expect(profiles).toHaveLength(2);
    expect(profiles[0].name).toBe('Doe, Alex');
    expect(profiles[1].name).toBe('Doe, Sam');

    const best = selectBestMatchingStudent(
      { name: 'Sam Doe', sisUserId: '222002', email: 'sam.doe@school.edu' },
      profiles
    );
    expect(best.selectedIndex).toBe(1);
    expect(best.comparison.matched).toBe(true);
    expect(best.comparison.confidence).toBe('high');
    expect(best.comparison.studentVueProfile.name).toBe('Doe, Sam');

    const noneMatched = selectBestMatchingStudent(
      { name: 'Someone Else', email: 'other@school.edu' },
      profiles
    );
    expect(noneMatched.selectedIndex).toBe(0);
    expect(noneMatched.comparison.matched).toBe(false);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('users/self') || decodeURIComponent(url).includes('users/self')) {
        return new Response(
          JSON.stringify({ id: 88, name: 'Sam Doe', sis_user_id: '222002', primary_email: 'sam.doe@school.edu' }),
          { status: 200 }
        );
      }
      if (url === 'http://localhost:8080/auth/token') {
        return new Response(JSON.stringify({ access_token: 'jwt_parent' }), { status: 200 });
      }
      if (url === 'http://localhost:8080/api/v1/edupoint/session') {
        return new Response(JSON.stringify({ edupoint_session: 'sess_parent' }), { status: 200 });
      }
      if (url === 'http://localhost:8080/api/v1/edupoint/student-info') {
        return new Response(
          JSON.stringify({
            data: {
              StudentInfo: {
                FormattedName: { $: 'Doe, Alex' },
                PermID: { $: '111001' },
                Students: [
                  {
                    FormattedName: { $: 'Doe, Alex' },
                    PermID: { $: '111001' },
                    CurrentSchool: { $: 'North MS' },
                    Grade: { $: '07' },
                  },
                  {
                    FormattedName: { $: 'Doe, Sam' },
                    PermID: { $: '222002' },
                    EMail: { $: 'sam.doe@school.edu' },
                    CurrentSchool: { $: 'MCPS High' },
                    Grade: { $: '11' },
                  },
                ],
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    });

    const outcome = await verifyStudentVueAccount({
      apiServerUrl: 'http://localhost:8080',
      apiUsername: 'velm_dev',
      apiPassword: 'pw',
      districtDomain: 'md-mcps-psv.edupoint.com',
      edupointUsername: 'parent1',
      edupointPassword: 'pw',
      isParent: true,
      canvasDomain: 'mcpsmd.instructure.com',
      canvasToken: 'tok',
      useProxy: true,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.comparison.matched).toBe(true);
      expect(outcome.comparison.selectedStudentIndex).toBe(1);
      expect(outcome.comparison.availableStudents).toHaveLength(2);
      expect(outcome.comparison.studentVueProfile.name).toBe('Doe, Sam');
    }
  });

  it('treats matching Student ID / PermID as authoritative even when email or middle name differs, and persists non-credential link metadata', () => {
    const idAndMiddleMatch = compareStudentProfiles(
      {
        name: 'Jane Marie Doe',
        sisUserId: '551122',
        email: '551122@mcpsmd.net',
      },
      {
        name: 'Doe, Jane M',
        permId: '551122',
        email: 'parent@gmail.com',
      }
    );

    expect(idAndMiddleMatch.matched).toBe(true);
    expect(idAndMiddleMatch.confidence).toBe('high');
    expect(idAndMiddleMatch.mismatchReasons).toHaveLength(0);
    expect(idAndMiddleMatch.matchReasons).toContain('Student ID matches (551122)');
    expect(idAndMiddleMatch.matchReasons.some((r) => r.includes('Name matches'))).toBe(true);
    expect(idAndMiddleMatch.warnings.some((w) => w.includes('Email differs'))).toBe(true);

    const idOnlyMatch = compareStudentProfiles(
      {
        name: 'Alex',
        loginId: '998877@mcpsmd.net',
      },
      {
        name: 'Doe, Alexander',
        permId: '998877',
      }
    );
    expect(idOnlyMatch.matched).toBe(true);
    expect(idOnlyMatch.confidence).toBe('medium');
    expect(idOnlyMatch.mismatchReasons).toHaveLength(0);

    const withAgu = extractStudentVueProfiles({
      StudentInfo: {
        Students: [
          {
            FormattedName: { $: 'Doe, Jane M' },
            PermID: { $: '551122' },
            AGU: { $: 'AGU-999' },
          },
        ],
      },
    });
    expect(withAgu[0].agu).toBe('AGU-999');

    localStorage.clear();
    const saved = saveLinkedStudentVueProfile('stu_jane', {
      confirmedAt: '2026-11-14T22:00:00Z',
      districtDomain: 'https://md-mcps-psv.edupoint.com/',
      isParent: true,
      apiServerUrl: '/api/studentvue/',
      studentName: withAgu[0].name,
      permId: withAgu[0].permId,
      agu: withAgu[0].agu,
      confidence: 'high',
      matched: true,
    });
    expect(saved.districtDomain).toBe('md-mcps-psv.edupoint.com');
    expect(saved.apiServerUrl).toBe('/api/studentvue');
    expect(getLinkedStudentVueProfile('stu_jane')?.agu).toBe('AGU-999');

    clearLinkedStudentVueProfile('stu_jane');
    expect(getLinkedStudentVueProfile('stu_jane')).toBeNull();
  });

  it('allows blank API credentials when server reports auth_required: false and rejects when required', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'http://localhost:8080/') {
        return new Response(JSON.stringify({ status: 'ok', auth_required: false }), { status: 200 });
      }
      if (url.includes('users/self') || decodeURIComponent(url).includes('users/self')) {
        return new Response(
          JSON.stringify({ id: 77, name: 'Maya Lin', primary_email: 'maya@school.edu', sis_user_id: '551122' }),
          { status: 200 }
        );
      }
      if (url === 'http://localhost:8080/auth/token') {
        return new Response(JSON.stringify({ access_token: 'jwt_dev_bypass' }), { status: 200 });
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
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    });

    const bypassOk = await verifyStudentVueAccount({
      apiServerUrl: 'http://localhost:8080',
      apiUsername: '',
      apiPassword: '',
      districtDomain: 'md-mcps-psv.edupoint.com',
      edupointUsername: '551122',
      edupointPassword: 'pw',
      isParent: false,
      canvasDomain: 'school.instructure.com',
      canvasToken: '1234~abc',
      useProxy: true,
    });
    expect(bypassOk.ok).toBe(true);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok', auth_required: true }), { status: 200 })
    );
    const blocked = await verifyStudentVueAccount({
      apiServerUrl: 'http://localhost:8080',
      apiUsername: '',
      apiPassword: '',
      districtDomain: 'md-mcps-psv.edupoint.com',
      edupointUsername: '551122',
      edupointPassword: 'pw',
      isParent: false,
      canvasDomain: 'school.instructure.com',
      canvasToken: '1234~abc',
      useProxy: true,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok === false) {
      expect(blocked.stage).toBe('config');
    }
  });
});
