import * as cheerio from 'cheerio';
import type { CookieScopeId, HttpTransport } from '../ports.js';
import { SynergyAuthError, SynergyError, normalizeDistrictDomain } from './errors.js';
import {
  encodeFormUrlEncoded,
  encodePxp2Password,
  extractDomStudents,
  extractJsAssignmentJson,
  extractLabelValuePairs,
  extractPxp2LoginError,
  firstNonEmpty,
  formatScoreRaw,
  parseNumericScore,
  parsePxp2CategoryRows,
  parsePxp2ClassDetailsHtml,
  parsePxp2LoginForm,
  randomGuid,
  resolveUrl,
  stripNodeText,
} from './pxp2-parsers.js';

export interface Pxp2WebClientOptions {
  readonly username: string;
  readonly password: string;
  readonly districtDomain: string;
  readonly isParent?: boolean;
  readonly timeoutMs?: number;
  readonly transport: HttpTransport;
  readonly cookieScope?: CookieScopeId;
  /**
   * Extension bonus mode (R1c): try using the browser profile's existing
   * StudentVUE/ParentVUE session before submitting the login form.
   */
  readonly reuseExistingSession?: boolean;
}

export interface Pxp2GradebookRequest {
  readonly reportPeriod?: number;
  readonly agu?: string;
  readonly permId?: string;
  readonly studentName?: string;
  readonly reportPeriodGu?: string;
}

function tokenizeName(name: string): Set<string> {
  return new Set((name.toLowerCase().match(/[a-z0-9]+/g) ?? []));
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function asOptionalStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

export class Pxp2WebClient {
  readonly districtDomain: string;
  readonly isParent: boolean;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly transport: HttpTransport;
  private readonly cookieScope: CookieScopeId | undefined;
  private readonly reuseExistingSession: boolean;

  constructor(options: Pxp2WebClientOptions) {
    const normalized = normalizeDistrictDomain(options.districtDomain);
    if (!normalized) {
      throw new SynergyError(`Invalid district domain: ${options.districtDomain}`, 'INVALID_DOMAIN');
    }
    this.districtDomain = normalized;
    this.username = options.username;
    this.password = options.password;
    this.isParent = Boolean(options.isParent);
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.transport = options.transport;
    this.cookieScope = options.cookieScope;
    this.reuseExistingSession = Boolean(options.reuseExistingSession);
  }

  private reqBase(): { timeoutMs: number; scope?: CookieScopeId } {
    return this.cookieScope !== undefined
      ? { timeoutMs: this.timeoutMs, scope: this.cookieScope }
      : { timeoutMs: this.timeoutMs };
  }

  /**
   * Perform PXP2 web portal login (or reuse an already-authenticated session when enabled).
   * Returns the post-login landing page HTML.
   */
  async login(): Promise<string> {
    if (this.reuseExistingSession) {
      const homeUrl = `https://${this.districtDomain}/Home_PXP2.aspx`;
      const probe = await this.transport.request({
        url: homeUrl,
        method: 'GET',
        ...this.reqBase(),
      });
      if (probe.ok && !probe.url.toLowerCase().includes('pxp2_login_')) {
        const html = await probe.text();
        const { hasPasswordInput } = extractPxp2LoginError(html);
        if (!hasPasswordInput) {
          return html;
        }
      }
    }

    const loginPage = this.isParent ? 'PXP2_Login_Parent.aspx' : 'PXP2_Login_Student.aspx';
    const loginUrl = `https://${this.districtDomain}/${loginPage}`;

    const r1 = await this.transport.request({
      url: loginUrl,
      method: 'GET',
      ...this.reqBase(),
    });
    if (!r1.ok) {
      throw new SynergyError(`Failed to load ${loginPage} (HTTP ${r1.status})`, 'NETWORK_ERROR');
    }
    const html1 = await r1.text();
    const form = parsePxp2LoginForm(html1);
    if (!form) {
      throw new SynergyError(
        `Legacy mobile SOAP API is deprecated by ${this.districtDomain} and no web login form was found at ${loginPage}.`,
        'SYNERGY_ERROR'
      );
    }

    if (!form.passField || !form.userField) {
      const portalLabel = this.isParent ? 'ParentVUE' : 'StudentVUE';
      const altHint = !this.isParent
        ? ' Try switching to ParentVUE if using a parent account.'
        : '';
      throw new SynergyError(
        `Legacy mobile SOAP API is deprecated by this district (D5517/D5518), and the ${portalLabel} web portal uses SSO-only login without a username/password form.${altHint}`,
        'SSO_ONLY'
      );
    }

    const payload: Record<string, string> = { ...form.fields };
    payload[form.userField] = this.username;
    payload[form.passField] = form.usesJsEncode ? encodePxp2Password(this.password) : this.password;
    if (form.submitField) {
      payload[form.submitField] = form.submitValue;
    }

    const actionUrl = resolveUrl(r1.url || loginUrl, form.action);
    const r2 = await this.transport.request({
      url: actionUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: encodeFormUrlEncoded(payload),
      ...this.reqBase(),
    });
    if (!r2.ok) {
      throw new SynergyError(`Web portal login failed (HTTP ${r2.status})`, 'NETWORK_ERROR');
    }

    const html2 = await r2.text();
    const { errorMsg, hasPasswordInput } = extractPxp2LoginError(html2);
    if (errorMsg) {
      throw new SynergyAuthError(errorMsg);
    }
    if ((r2.url || '').toLowerCase().includes('pxp2_login_') && hasPasswordInput) {
      throw new SynergyAuthError('Invalid user ID or Password');
    }

    return html2;
  }

  async fetchStudents(landingHtml: string): Promise<Array<Record<string, unknown>>> {
    let studentsData: Array<Record<string, unknown>> = [];
    try {
      const compUrl = `https://${this.districtDomain}/api/v1/components/pxp/student-picker/StudentPicker/GetStudents`;
      const compRes = await this.transport.request({
        url: compUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          WINDOW_ID: randomGuid(),
          FOCUS_KEY: randomGuid(),
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: '{}',
        ...this.reqBase(),
      });
      if (compRes.ok) {
        const compJson = JSON.parse(await compRes.text()) as Record<string, unknown>;
        const rawData = compJson?.['data'];
        if (Array.isArray(rawData)) {
          studentsData = rawData.filter(
            (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))
          );
        } else if (rawData && typeof rawData === 'object') {
          const rec = rawData as Record<string, unknown>;
          for (const key of ['students', 'Students', 'items', 'Items']) {
            const arr = rec[key];
            if (Array.isArray(arr)) {
              studentsData = arr.filter(
                (item): item is Record<string, unknown> =>
                  Boolean(item && typeof item === 'object' && !Array.isArray(item))
              );
              break;
            }
          }
        }
      }
    } catch {
      // Fall through to DOM fallback
    }

    if (studentsData.length === 0 && landingHtml) {
      try {
        studentsData = extractDomStudents(landingHtml);
      } catch {
        // ignore
      }
    }

    return studentsData;
  }

  async resolveTargetAgu(
    landingHtml: string,
    target: { readonly agu?: string; readonly permId?: string; readonly studentName?: string } = {}
  ): Promise<string | null> {
    const studentsData = await this.fetchStudents(landingHtml);
    const normPerm = target.permId?.trim().toLowerCase() || null;
    const normNameTokens = target.studentName?.trim() ? tokenizeName(target.studentName) : new Set<string>();

    // Prefer resolving a fresh AGU for the active session by PermID or student name
    if (normPerm && studentsData.length > 0) {
      for (const st of studentsData) {
        const stPerm = firstNonEmpty(
          asOptionalStr(st['sisNumber']),
          asOptionalStr(st['SISNumber']),
          asOptionalStr(st['permId'])
        );
        if (stPerm && stPerm.toLowerCase() === normPerm) {
          const resolved = firstNonEmpty(asOptionalStr(st['AGU']), asOptionalStr(st['agu']));
          if (resolved) return resolved;
        }
      }
    }

    if (normNameTokens.size > 0 && studentsData.length > 0) {
      for (const st of studentsData) {
        const stName = firstNonEmpty(
          asOptionalStr(st['name']),
          asOptionalStr(st['Name']),
          asOptionalStr(st['studentName'])
        );
        if (stName) {
          const candTokens = tokenizeName(stName);
          if (candTokens.size > 0 && (isSubset(normNameTokens, candTokens) || isSubset(candTokens, normNameTokens))) {
            const resolved = firstNonEmpty(asOptionalStr(st['AGU']), asOptionalStr(st['agu']));
            if (resolved) return resolved;
          }
        }
      }
    }

    if (target.agu?.trim()) {
      return target.agu.trim();
    }

    if (studentsData[0]) {
      return firstNonEmpty(asOptionalStr(studentsData[0]['AGU']), asOptionalStr(studentsData[0]['agu']));
    }

    return null;
  }

  async loadControl(
    controlName: string,
    parameters: Record<string, unknown>,
    agu: string | null,
    focusKeyBox?: { focusKey?: string }
  ): Promise<Record<string, unknown> | null> {
    const url = `https://${this.districtDomain}/service/PXP2Communication.asmx/LoadControl`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (agu) headers['AGU'] = agu;
    if (focusKeyBox?.focusKey) headers['FOCUS_KEY'] = focusKeyBox.focusKey;

    const res = await this.transport.request({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify({ request: { control: controlName, parameters } }),
      ...this.reqBase(),
    });
    if (!res.ok) return null;

    let payload: unknown;
    try {
      payload = JSON.parse(await res.text());
    } catch {
      return null;
    }

    const dObj =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)['d']
        : null;
    if (!dObj || typeof dObj !== 'object' || Array.isArray(dObj)) return null;
    const dRec = dObj as Record<string, unknown>;
    if (dRec['Error']) return null;

    if (focusKeyBox && typeof dRec['FOCUS_KEY'] === 'string' && dRec['FOCUS_KEY']) {
      focusKeyBox.focusKey = dRec['FOCUS_KEY'];
    }
    const dataObj = dRec['Data'];
    return dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)
      ? (dataObj as Record<string, unknown>)
      : null;
  }

  private async scrapeStudentPage(agu: string | null): Promise<{ pairs: Record<string, string>; blob: string }> {
    const pairs: Record<string, string> = {};
    let blob = '';
    try {
      const url = agu
        ? `https://${this.districtDomain}/PXP2_Student.aspx?AGU=${encodeURIComponent(agu)}`
        : `https://${this.districtDomain}/PXP2_Student.aspx`;
      const headers = agu ? { AGU: agu } : undefined;
      const pageRes = await this.transport.request({
        url,
        method: 'GET',
        ...(headers ? { headers } : {}),
        ...this.reqBase(),
      });
      if (pageRes.ok && !(pageRes.url || '').toLowerCase().includes('pxp2_login_')) {
        blob = await pageRes.text();
        for (const [k, v] of Object.entries(extractLabelValuePairs(blob))) {
          if (!(k in pairs)) pairs[k] = v;
        }
      }
    } catch {
      // ignore
    }
    return { pairs, blob };
  }

  private matchesStudent(
    candidatePairs: Record<string, string>,
    stName: string | null,
    stId: string | null
  ): boolean {
    const pageId = firstNonEmpty(
      candidatePairs['perm id'],
      candidatePairs['student id'],
      candidatePairs['id']
    );
    if (stId && pageId && stId.trim().toLowerCase() === pageId.trim().toLowerCase()) {
      return true;
    }
    const pageName = firstNonEmpty(
      candidatePairs['student name'],
      candidatePairs['name'],
      candidatePairs['full name']
    );
    if (stName && pageName) {
      const t1 = tokenizeName(stName);
      const t2 = tokenizeName(pageName);
      if (t1.size > 0 && t2.size > 0 && (isSubset(t1, t2) || isSubset(t2, t1))) {
        return true;
      }
    }
    return false;
  }

  async getStudentInfo(): Promise<Record<string, unknown>> {
    const landingHtml = await this.login();
    const studentsData = await this.fetchStudents(landingHtml);

    const builtStudents: Array<Record<string, unknown>> = [];
    if (studentsData.length > 0) {
      const capped = studentsData.slice(0, 8);
      for (let idx = 0; idx < capped.length; idx++) {
        const st = capped[idx]!;
        const stAgu = firstNonEmpty(asOptionalStr(st['AGU']), asOptionalStr(st['agu']));
        let stName = firstNonEmpty(
          asOptionalStr(st['name']),
          asOptionalStr(st['Name']),
          asOptionalStr(st['studentName'])
        );
        let stPerm = firstNonEmpty(
          asOptionalStr(st['sisNumber']),
          asOptionalStr(st['SISNumber']),
          asOptionalStr(st['permId'])
        );
        let stSchool = firstNonEmpty(asOptionalStr(st['schoolName']), asOptionalStr(st['SchoolName']));
        let stEmail = firstNonEmpty(asOptionalStr(st['email']), asOptionalStr(st['Email']));
        let stGrade = firstNonEmpty(asOptionalStr(st['grade']), asOptionalStr(st['Grade']));

        if (stAgu || idx === 0) {
          const { pairs: pPairs } = await this.scrapeStudentPage(stAgu);
          if (
            Object.keys(pPairs).length > 0 &&
            (studentsData.length === 1 || this.matchesStudent(pPairs, stName, stPerm))
          ) {
            stName =
              stName ||
              firstNonEmpty(pPairs['student name'], pPairs['name'], pPairs['full name']);
            stPerm =
              stPerm ||
              firstNonEmpty(pPairs['perm id'], pPairs['student id'], pPairs['id']);
            stSchool =
              stSchool ||
              firstNonEmpty(pPairs['current school'], pPairs['school'], pPairs['school name']);
            stEmail =
              stEmail ||
              firstNonEmpty(
                pPairs['email'],
                pPairs['e-mail'],
                pPairs['primary email'],
                pPairs['student email']
              );
            stGrade = stGrade || firstNonEmpty(pPairs['grade'], pPairs['grade level']);
          }
        }

        const entry: Record<string, unknown> = {};
        if (stName) entry['FormattedName'] = { $: stName };
        if (stPerm) entry['PermID'] = { $: stPerm };
        if (stEmail) entry['EMail'] = { $: stEmail };
        if (stSchool) entry['CurrentSchool'] = { $: stSchool };
        if (stGrade) entry['Grade'] = { $: stGrade };
        if (stAgu) entry['AGU'] = { $: stAgu };
        if (Object.keys(entry).length > 0) {
          builtStudents.push(entry);
        }
      }
    }

    if (builtStudents.length === 0) {
      const { pairs: htmlPairs, blob: pageBlob } = await this.scrapeStudentPage(null);
      const htmlBlobs = [landingHtml, pageBlob];
      let name = firstNonEmpty(htmlPairs['student name'], htmlPairs['name'], htmlPairs['full name']);
      let permId = firstNonEmpty(htmlPairs['perm id'], htmlPairs['student id'], htmlPairs['id']);
      const school = firstNonEmpty(
        htmlPairs['current school'],
        htmlPairs['school'],
        htmlPairs['school name']
      );
      const email = firstNonEmpty(
        htmlPairs['email'],
        htmlPairs['e-mail'],
        htmlPairs['primary email'],
        htmlPairs['student email']
      );
      const grade = firstNonEmpty(htmlPairs['grade'], htmlPairs['grade level']);

      if (!name || !permId) {
        for (const blob of htmlBlobs) {
          if (!blob) continue;
          if (!name) {
            const mName = /class=["'][^"']*student-name[^"']*["'][^>]*>([^<]+)</i.exec(blob);
            if (mName?.[1]) name = firstNonEmpty(mName[1]);
          }
          if (!permId) {
            const mId = /(?:Perm\s*ID|Student\s*ID|ID)\s*[:#]\s*([A-Za-z0-9_-]{3,})/i.exec(blob);
            if (mId?.[1]) permId = firstNonEmpty(mId[1]);
          }
        }
      }

      const entry: Record<string, unknown> = {};
      if (name) entry['FormattedName'] = { $: name };
      if (permId) entry['PermID'] = { $: permId };
      if (email) entry['EMail'] = { $: email };
      if (school) entry['CurrentSchool'] = { $: school };
      if (grade) entry['Grade'] = { $: grade };
      if (Object.keys(entry).length > 0) {
        builtStudents.push(entry);
      }
    }

    const studentInfo: Record<string, unknown> = builtStudents[0] ? { ...builtStudents[0] } : {};
    if (builtStudents.length > 0) {
      studentInfo['Students'] = builtStudents;
    }

    return { StudentInfo: studentInfo };
  }

  async getGradebook(req: Pxp2GradebookRequest = {}): Promise<Record<string, unknown>> {
    const landingHtml = await this.login();
    const targetAgu = await this.resolveTargetAgu(landingHtml, {
      ...(req.agu !== undefined ? { agu: req.agu } : {}),
      ...(req.permId !== undefined ? { permId: req.permId } : {}),
      ...(req.studentName !== undefined ? { studentName: req.studentName } : {}),
    });

    const gbUrl = targetAgu
      ? `https://${this.districtDomain}/PXP2_Gradebook.aspx?AGU=${encodeURIComponent(targetAgu)}`
      : `https://${this.districtDomain}/PXP2_Gradebook.aspx`;
    const gbRes = await this.transport.request({
      url: gbUrl,
      method: 'GET',
      ...(targetAgu ? { headers: { AGU: targetAgu } } : {}),
      ...this.reqBase(),
    });
    if (!gbRes.ok) {
      throw new SynergyError(`Failed to load PXP2_Gradebook.aspx (HTTP ${gbRes.status})`, 'NETWORK_ERROR');
    }
    if ((gbRes.url || '').toLowerCase().includes('pxp2_login_')) {
      throw new SynergyAuthError('Web portal session expired while loading gradebook.');
    }

    const gbHtml = await gbRes.text();
    const focusKeyBox: { focusKey?: string } = {};
    const mFk = /FOCUS_KEY\s*=\s*['"]([^'"]+)['"]/.exec(gbHtml);
    if (mFk?.[1]) focusKeyBox.focusKey = mFk[1];

    const focusData = extractJsAssignmentJson(gbHtml, /PXP\.GBFocusData\s*=/);
    const currentFocus = extractJsAssignmentJson(gbHtml, /PXP\.GBCurrentFocus\s*=/);
    const focusArgs: Record<string, unknown> =
      currentFocus &&
      typeof currentFocus === 'object' &&
      !Array.isArray(currentFocus) &&
      typeof (currentFocus as Record<string, unknown>)['FocusArgs'] === 'object' &&
      (currentFocus as Record<string, unknown>)['FocusArgs'] !== null
        ? ((currentFocus as Record<string, unknown>)['FocusArgs'] as Record<string, unknown>)
        : {};

    let rawGps: Array<Record<string, unknown>> = [];
    if (focusData && typeof focusData === 'object' && !Array.isArray(focusData)) {
      const fd = focusData as Record<string, unknown>;
      if (Array.isArray(fd['GradingPeriods'])) {
        rawGps = fd['GradingPeriods'].filter(
          (g): g is Record<string, unknown> => Boolean(g && typeof g === 'object' && !Array.isArray(g))
        );
      } else if (Array.isArray(fd['Schools']) && fd['Schools'].length > 0) {
        const firstSch = fd['Schools'][0] as Record<string, unknown> | undefined;
        if (firstSch && Array.isArray(firstSch['GradingPeriods'])) {
          rawGps = firstSch['GradingPeriods'].filter(
            (g): g is Record<string, unknown> => Boolean(g && typeof g === 'object' && !Array.isArray(g))
          );
        }
      }
    }

    const $gb = cheerio.load(gbHtml || '<html></html>');

    if (rawGps.length === 0) {
      const seenGp = new Set<string>();
      $gb('.term-selector [data-period-id]').each((_i, node) => {
        const el = $gb(node);
        const gpId = (el.attr('data-period-id') ?? '').trim();
        const gpName = stripNodeText($gb, el);
        const gpGroup = (el.attr('data-period-group') ?? '').trim();
        if (gpId && !seenGp.has(gpId)) {
          seenGp.add(gpId);
          rawGps.push({ GU: gpId, Name: gpName || gpId, GroupName: gpGroup });
        }
      });
    }

    let domCurrentGp: string | null = null;
    $gb('.term-selector .current[data-period-id]').each((_i, node) => {
      if (domCurrentGp) return;
      const val = ($gb(node).attr('data-period-id') ?? '').trim();
      if (val) domCurrentGp = val;
    });
    const activeGpGu =
      asOptionalStr(focusArgs['gradePeriodGU'])?.trim() || domCurrentGp || '';

    const reportingPeriods: Array<Record<string, unknown>> = [];
    let activeGpIdx = 0;
    for (let idx = 0; idx < rawGps.length; idx++) {
      const gp = rawGps[idx]!;
      const gpGu = (asOptionalStr(gp['GU']) ?? asOptionalStr(gp['gradePeriodGU']) ?? '').trim();
      const gpName =
        firstNonEmpty(asOptionalStr(gp['Name']), asOptionalStr(gp['GradePeriod'])) ??
        `Period ${idx + 1}`;
      const isDefault = Boolean(gp['defaultFocus']) || (Boolean(activeGpGu) && gpGu === activeGpGu);
      if (isDefault) activeGpIdx = idx;

      const rpEntry: Record<string, unknown> = {
        '@Index': String(idx),
        '@GradePeriod': gpName,
      };
      if (gpGu) rpEntry['@GU'] = gpGu;
      if (gp['StartDate']) rpEntry['@StartDate'] = String(gp['StartDate']);
      if (gp['EndDate']) rpEntry['@EndDate'] = String(gp['EndDate']);
      reportingPeriods.push(rpEntry);
    }

    let desiredGpGu = req.reportPeriodGu?.trim() || null;
    if (
      desiredGpGu === null &&
      req.reportPeriod !== undefined &&
      req.reportPeriod >= 0 &&
      req.reportPeriod < reportingPeriods.length
    ) {
      activeGpIdx = req.reportPeriod;
      desiredGpGu = (reportingPeriods[req.reportPeriod]?.['@GU'] as string | undefined) ?? null;
    } else if (desiredGpGu !== null) {
      const matchedIdx = reportingPeriods.findIndex((rp) => rp['@GU'] === desiredGpGu);
      if (matchedIdx >= 0) activeGpIdx = matchedIdx;
    }

    let $classes = $gb;
    if (desiredGpGu && desiredGpGu !== activeGpGu) {
      let groupName = '';
      let schoolId: unknown = focusArgs['schoolID'] ?? -1;
      const orgYearGu: unknown = focusArgs['OrgYearGU'] ?? -1;
      for (const gp of rawGps) {
        if (String(gp['GU'] ?? '') === desiredGpGu) {
          groupName = String(gp['GroupName'] ?? '');
          if (gp['schoolID'] !== undefined && gp['schoolID'] !== null) {
            schoolId = gp['schoolID'];
          }
          break;
        }
      }
      const loaded = await this.loadControl(
        'Gradebook_SchoolClasses',
        {
          schoolID: schoolId,
          OrgYearGU: orgYearGu,
          gradePeriodGU: desiredGpGu,
          GradingPeriodGroup: groupName,
          AGU: targetAgu || focusArgs['AGU'] || '0',
        },
        targetAgu,
        focusKeyBox
      );
      if (loaded && typeof loaded['html'] === 'string' && loaded['html'].trim()) {
        $classes = cheerio.load(`<div>${loaded['html']}</div>`);
      }
    }

    const activeRpObj: Record<string, unknown> =
      reportingPeriods[activeGpIdx] ?? { '@Index': String(activeGpIdx), '@GradePeriod': 'Current' };
    const markNameDefault = String(activeRpObj['@GradePeriod'] ?? 'Current');

    const coursesOut: Array<Record<string, unknown>> = [];
    const seenCourseKeys = new Set<string>();

    let headerNodes = $classes('tr.gb-class-header.gb-class-row, div.gb-class-header.gb-class-row');
    if (headerNodes.length === 0) {
      headerNodes = $classes('tr[data-guid]').filter(
        (_i, el) => $classes(el).closest('.gb-class-details').length === 0
      );
    }

    const headersSlice = headerNodes.toArray().slice(0, 16);
    for (const hdrNode of headersSlice) {
      const hdr = $classes(hdrNode);
      const guid = (hdr.attr('data-guid') ?? '').trim();

      let titleEl = hdr.find('.course-title').first();
      if (titleEl.length === 0) titleEl = hdr.find('button[data-focus]').first();
      if (titleEl.length === 0) titleEl = hdr.find('a[data-focus]').first();
      let rawTitle = titleEl.length > 0 ? stripNodeText($classes, titleEl) : '';
      if (!rawTitle) {
        const firstTd = hdr.children('td').first();
        if (firstTd.length > 0) rawTitle = stripNodeText($classes, firstTd);
      }
      if (!rawTitle) continue;

      let period = firstNonEmpty(
        ...hdr
          .find('[class*="period"]')
          .map((_i, n) => stripNodeText($classes, $classes(n)))
          .get(),
        hdr.attr('data-period')
      );
      if (!period) {
        const mPer = /^(?:Per(?:iod)?\.?\s*)?(\d+|HR)\s*[:-]\s*(.+)$/i.exec(rawTitle);
        if (mPer?.[1] && mPer[2]) {
          period = mPer[1];
          rawTitle = mPer[2].trim();
        }
      }

      let courseId = firstNonEmpty(hdr.attr('data-course-id'));
      if (!courseId) {
        const mCid = /\(([A-Za-z0-9._-]{3,20})\)\s*$/.exec(rawTitle);
        if (mCid?.[1]) courseId = mCid[1];
      }

      const dedupeKey = `${guid || rawTitle.toLowerCase()}::${period ?? ''}`;
      if (seenCourseKeys.has(dedupeKey)) continue;
      seenCourseKeys.add(dedupeKey);

      let teacher = firstNonEmpty(
        ...hdr
          .find('[class*="teacher"]')
          .map((_i, n) => stripNodeText($classes, $classes(n)))
          .get()
      );
      let staffEmail: string | null = null;
      const mailtoNode = hdr.find('a[href^="mailto:"]').first();
      if (mailtoNode.length > 0) {
        staffEmail = (mailtoNode.attr('href') ?? '').replace(/^mailto:/i, '').trim() || null;
        if (!teacher) teacher = stripNodeText($classes, mailtoNode);
      }

      let room = firstNonEmpty(
        ...hdr
          .find('[class*="room"]')
          .map((_i, n) => stripNodeText($classes, $classes(n)))
          .get()
      );
      if (room) {
        room = room.replace(/^Room\s*:\s*/i, '').trim();
      }

      const markStr = firstNonEmpty(
        ...hdr
          .find('[class*="mark"]')
          .map((_i, n) => stripNodeText($classes, $classes(n)))
          .get()
      );
      const scoreStr = firstNonEmpty(
        ...hdr
          .find('[class*="score"]')
          .map((_i, n) => stripNodeText($classes, $classes(n)))
          .get()
      );
      const scoreNum = parseNumericScore(scoreStr);

      let inlineCategories: Array<Record<string, unknown>> = [];
      if (guid) {
        const detailRow = $classes('.gb-class-details .gb-class-row')
          .filter((_i, el) => ($classes(el).attr('data-guid') ?? '') === guid)
          .first();
        if (detailRow.length > 0) {
          const catTable = detailRow.find('table').first();
          if (catTable.length > 0) {
            inlineCategories = parsePxp2CategoryRows($classes, catTable);
          }
        }
      }

      let detailCategories: Array<Record<string, unknown>> = [];
      let detailAssignments: Array<Record<string, unknown>> = [];
      const focusBtn = hdr.find('[data-focus]').first();
      let detailParams: Record<string, unknown> | null = null;
      let detailControl = 'Gradebook_ClassDetails';

      if (focusBtn.length > 0) {
        const rawFocusAttr = focusBtn.attr('data-focus') ?? '';
        try {
          const focusPayload = JSON.parse(rawFocusAttr) as Record<string, unknown>;
          if (focusPayload && typeof focusPayload === 'object') {
            const lParams = focusPayload['LoadParams'] as Record<string, unknown> | undefined;
            if (lParams && typeof lParams['ControlName'] === 'string' && lParams['ControlName']) {
              detailControl = lParams['ControlName'];
            }
            const fArgs = focusPayload['FocusArgs'];
            if (fArgs && typeof fArgs === 'object' && !Array.isArray(fArgs)) {
              detailParams = { ...(fArgs as Record<string, unknown>) };
            }
          }
        } catch {
          detailParams = null;
        }
      }

      if (
        detailParams !== null &&
        (detailControl === 'Gradebook_ClassDetails' ||
          detailControl === 'Gradebook_RichContentClassDetails')
      ) {
        if (targetAgu && !('AGU' in detailParams)) {
          detailParams['AGU'] = targetAgu;
        }
        const detailData = await this.loadControl(detailControl, detailParams, targetAgu, focusKeyBox);
        if (detailData && typeof detailData['html'] === 'string') {
          const parsedDetails = parsePxp2ClassDetailsHtml(detailData['html']);
          detailCategories = parsedDetails.categories;
          detailAssignments = parsedDetails.assignments;
        }
      }

      const finalCategories = detailCategories.length > 0 ? detailCategories : inlineCategories;
      const markObj: Record<string, unknown> = {
        '@MarkName': markNameDefault,
        '@CalculatedScoreString': markStr || (scoreNum === null ? 'N/A' : ''),
        '@CalculatedScoreRaw': formatScoreRaw(scoreNum),
      };
      if (finalCategories.length > 0) {
        markObj['GradeCalculationSummary'] = { AssignmentGradeCalc: finalCategories };
      }
      if (detailAssignments.length > 0) {
        markObj['Assignments'] = { Assignment: detailAssignments };
      }

      const courseEntry: Record<string, unknown> = {
        '@Title': rawTitle,
        Marks: { Mark: [markObj] },
      };
      if (courseId) courseEntry['@CourseID'] = courseId;
      if (period) courseEntry['@Period'] = period;
      if (room) courseEntry['@Room'] = room;
      if (teacher) courseEntry['@Staff'] = teacher;
      if (staffEmail) courseEntry['@StaffEMail'] = staffEmail;

      coursesOut.push(courseEntry);
    }

    // Fallback: extract courses from embedded PXP.GBFocusData["Classes"] when DOM class rows are empty
    if (
      coursesOut.length === 0 &&
      focusData &&
      typeof focusData === 'object' &&
      !Array.isArray(focusData) &&
      Array.isArray((focusData as Record<string, unknown>)['Classes'])
    ) {
      const classes = ((focusData as Record<string, unknown>)['Classes'] as unknown[]).slice(0, 16);
      for (const rawCls of classes) {
        if (!rawCls || typeof rawCls !== 'object' || Array.isArray(rawCls)) continue;
        const cls = rawCls as Record<string, unknown>;
        const clsTitle = firstNonEmpty(
          asOptionalStr(cls['Name']),
          asOptionalStr(cls['Title']),
          asOptionalStr(cls['CourseTitle'])
        );
        if (!clsTitle) continue;

        const clsPeriod = firstNonEmpty(asOptionalStr(cls['Period']));
        const clsTeacher = firstNonEmpty(
          asOptionalStr(cls['TeacherName']),
          asOptionalStr(cls['Teacher']),
          asOptionalStr(cls['Staff'])
        );
        const clsRoom = firstNonEmpty(asOptionalStr(cls['RoomName']), asOptionalStr(cls['Room']));
        let clsId = firstNonEmpty(asOptionalStr(cls['CourseID']), asOptionalStr(cls['CourseId']));
        if (!clsId) {
          const mCid = /\(([A-Za-z0-9._-]{3,20})\)\s*$/.exec(clsTitle);
          if (mCid?.[1]) clsId = mCid[1];
        }
        const rawMark = firstNonEmpty(asOptionalStr(cls['Mark']), asOptionalStr(cls['Grade']));
        const rawScore = cls['Score'] !== undefined && cls['Score'] !== null ? cls['Score'] : cls['Pct'];
        const scoreNum = rawScore !== undefined && rawScore !== null ? parseNumericScore(String(rawScore)) : null;

        let detailCategories: Array<Record<string, unknown>> = [];
        let detailAssignments: Array<Record<string, unknown>> = [];
        const clsGu = firstNonEmpty(asOptionalStr(cls['ClassGU']), asOptionalStr(cls['GU']));
        if (clsGu) {
          const detailParams: Record<string, unknown> = { ...focusArgs, classGU: clsGu };
          if (targetAgu && !('AGU' in detailParams)) detailParams['AGU'] = targetAgu;
          const detailData = await this.loadControl(
            'Gradebook_ClassDetails',
            detailParams,
            targetAgu,
            focusKeyBox
          );
          if (detailData && typeof detailData['html'] === 'string') {
            const parsedDetails = parsePxp2ClassDetailsHtml(detailData['html']);
            detailCategories = parsedDetails.categories;
            detailAssignments = parsedDetails.assignments;
          }
        }

        const markObj: Record<string, unknown> = {
          '@MarkName': markNameDefault,
          '@CalculatedScoreString': rawMark || (scoreNum === null ? 'N/A' : ''),
          '@CalculatedScoreRaw': formatScoreRaw(scoreNum),
        };
        if (detailCategories.length > 0) {
          markObj['GradeCalculationSummary'] = { AssignmentGradeCalc: detailCategories };
        }
        if (detailAssignments.length > 0) {
          markObj['Assignments'] = { Assignment: detailAssignments };
        }

        const courseEntry: Record<string, unknown> = {
          '@Title': clsTitle,
          Marks: { Mark: [markObj] },
        };
        if (clsId) courseEntry['@CourseID'] = clsId;
        if (clsPeriod) courseEntry['@Period'] = clsPeriod;
        if (clsRoom) courseEntry['@Room'] = clsRoom;
        if (clsTeacher) courseEntry['@Staff'] = clsTeacher;
        coursesOut.push(courseEntry);
      }
    }

    return {
      Gradebook: {
        '@Type': 'Traditional',
        ReportingPeriod: activeRpObj,
        ReportingPeriods: { ReportPeriod: reportingPeriods },
        Courses: { Course: coursesOut },
      },
    };
  }
}
