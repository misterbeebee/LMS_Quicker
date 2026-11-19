import { err, ok, type Result } from '@velm/shared';
import type { CookieScopeId, HttpTransport } from '../ports.js';
import {
  SynergyAuthError,
  SynergyError,
  type SynergyFailure,
  extractRtError,
  isAuthErrorMessage,
  isDeprecatedSoapError,
} from './errors.js';
import { Pxp2WebClient, type Pxp2GradebookRequest } from './pxp2.js';
import { SynergySoapClient } from './soap.js';

export interface SynergyServiceOptions {
  readonly username: string;
  readonly password: string;
  readonly districtDomain: string;
  readonly isParent?: boolean;
  readonly timeoutMs?: number;
  readonly transport: HttpTransport;
  readonly cookieScope?: CookieScopeId;
  readonly reuseExistingSession?: boolean;
}

export interface SynergyExportResult {
  readonly data: Record<string, Record<string, unknown>>;
  readonly errors: Record<string, string>;
}

function toFailure(error: unknown): SynergyFailure {
  if (error instanceof SynergyError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'SYNERGY_ERROR',
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * High-level Synergy service combining SOAP and PXP2 web-portal fallback.
 * Replaces Python's SynergyClient + FastAPI endpoint orchestration.
 */
export class SynergyService {
  readonly soap: SynergySoapClient;
  readonly pxp2: Pxp2WebClient;

  constructor(options: SynergyServiceOptions) {
    this.soap = new SynergySoapClient({
      username: options.username,
      password: options.password,
      districtDomain: options.districtDomain,
      ...(options.isParent !== undefined ? { isParent: options.isParent } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      transport: options.transport,
    });
    this.pxp2 = new Pxp2WebClient({
      username: options.username,
      password: options.password,
      districtDomain: options.districtDomain,
      ...(options.isParent !== undefined ? { isParent: options.isParent } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      transport: options.transport,
      ...(options.cookieScope !== undefined ? { cookieScope: options.cookieScope } : {}),
      ...(options.reuseExistingSession !== undefined
        ? { reuseExistingSession: options.reuseExistingSession }
        : {}),
    });
  }

  private async callChecked(
    soapCall: () => Promise<Record<string, unknown>>,
    pxp2Fallback?: () => Promise<Record<string, unknown>>
  ): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    try {
      const raw = await soapCall();
      const errMsg = extractRtError(raw);
      if (errMsg) {
        if (isDeprecatedSoapError(errMsg) && pxp2Fallback) {
          const fallbackData = await pxp2Fallback();
          return ok(fallbackData);
        }
        if (isDeprecatedSoapError(errMsg)) {
          return err({ code: 'SOAP_DEPRECATED', message: errMsg });
        }
        if (isAuthErrorMessage(errMsg)) {
          return err({ code: 'AUTH_FAILED', message: errMsg });
        }
        return err({ code: 'SYNERGY_ERROR', message: errMsg });
      }
      return ok(raw);
    } catch (caught) {
      return err(toFailure(caught));
    }
  }

  verifyCredentials(): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.getStudentInfo();
  }

  getStudentInfo(): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(
      () => this.soap.getStudentInfo(),
      () => this.pxp2.getStudentInfo()
    );
  }

  getGradebook(req: Pxp2GradebookRequest = {}): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(
      () => this.soap.getGradebook(req.reportPeriod),
      () => this.pxp2.getGradebook(req)
    );
  }

  getSchoolInfo(): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.getSchoolInfo());
  }

  getSchedule(termIndex?: number): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.getSchedule(termIndex));
  }

  getAttendance(): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.getAttendance());
  }

  getMessages(): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.getMessages());
  }

  getCalendar(requestDate?: string): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.getCalendar(requestDate));
  }

  listReportCards(): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.listReportCards());
  }

  getReportCard(documentGu: string): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.getReportCard(documentGu));
  }

  listDocuments(): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.listDocuments());
  }

  getDocument(documentGu: string): Promise<Result<Record<string, unknown>, SynergyFailure>> {
    return this.callChecked(() => this.soap.getDocument(documentGu));
  }

  async exportAll(options: { reportPeriod?: number; termIndex?: number } = {}): Promise<
    Result<SynergyExportResult, SynergyFailure>
  > {
    const data: Record<string, Record<string, unknown>> = {};
    const errors: Record<string, string> = {};

    // Fail fast on student_info so invalid credentials abort immediately
    const infoRes = await this.getStudentInfo();
    if (!infoRes.ok) {
      return infoRes;
    }
    data['student_info'] = infoRes.data;

    const tasks: Array<[string, () => Promise<Result<Record<string, unknown>, SynergyFailure>>]> = [
      ['school_info', () => this.getSchoolInfo()],
      [
        'gradebook',
        () =>
          this.getGradebook(
            options.reportPeriod !== undefined ? { reportPeriod: options.reportPeriod } : {}
          ),
      ],
      ['schedule', () => this.getSchedule(options.termIndex)],
      ['attendance', () => this.getAttendance()],
      ['messages', () => this.getMessages()],
      ['calendar', () => this.getCalendar()],
      ['report_cards', () => this.listReportCards()],
      ['documents', () => this.listDocuments()],
    ];

    for (const [name, fn] of tasks) {
      const res = await fn();
      if (res.ok) {
        data[name] = res.data;
      } else if (res.error.code === 'AUTH_FAILED') {
        return err(res.error);
      } else {
        errors[name] = res.error.message;
      }
    }

    return ok({ data, errors });
  }
}

export { SynergyAuthError, SynergyError };
