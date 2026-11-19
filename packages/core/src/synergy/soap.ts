import type { HttpTransport } from '../ports.js';
import {
  SynergyAuthError,
  SynergyError,
  extractRtError,
  isAuthErrorMessage,
  isDeprecatedSoapError,
  normalizeDistrictDomain,
} from './errors.js';
import { buildSoapEnvelope, parseSoapResponse } from './xml.js';

export interface SynergySoapClientOptions {
  readonly username: string;
  readonly password: string;
  readonly districtDomain: string;
  readonly isParent?: boolean;
  readonly timeoutMs?: number;
  readonly transport: HttpTransport;
}

const SOAP_ACTION = 'http://edupoint.com/webservices/ProcessWebServiceRequest';

/**
 * Pure TypeScript replacement for the Python `studentvue` library (zeep + xmljson).
 * Communicates directly with Synergy's PXPCommunication.asmx SOAP 1.1 endpoint
 * through the injected HttpTransport.
 */
export class SynergySoapClient {
  readonly districtDomain: string;
  readonly isParent: boolean;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly transport: HttpTransport;

  constructor(options: SynergySoapClientOptions) {
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
  }

  get endpointUrl(): string {
    return `https://${this.districtDomain}/Service/PXPCommunication.asmx`;
  }

  /**
   * Low-level SOAP call returning the raw badgerfish-normalized dictionary
   * (including any RT_ERROR payload, without throwing on RT_ERROR).
   */
  async rawRequest(
    methodName: string,
    params?: Readonly<Record<string, string | number | undefined>>
  ): Promise<Record<string, unknown>> {
    const envelope = buildSoapEnvelope({
      username: this.username,
      password: this.password,
      isParent: this.isParent,
      methodName,
      ...(params ? { params } : {}),
    });

    const response = await this.transport.request({
      url: this.endpointUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"${SOAP_ACTION}"`,
      },
      body: envelope,
      timeoutMs: this.timeoutMs,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new SynergyError(
        `Synergy SOAP request ${methodName} failed with HTTP ${response.status}`,
        'NETWORK_ERROR'
      );
    }

    try {
      return parseSoapResponse(responseText);
    } catch (err) {
      throw new SynergyError(
        err instanceof Error ? err.message : `Failed to parse SOAP response for ${methodName}`,
        'PARSE_ERROR'
      );
    }
  }

  /**
   * Execute a SOAP call and inspect for RT_ERROR, throwing typed SynergyAuthError or SynergyError.
   */
  async checkedRequest(
    methodName: string,
    params?: Readonly<Record<string, string | number | undefined>>
  ): Promise<Record<string, unknown>> {
    const data = await this.rawRequest(methodName, params);
    const errMsg = extractRtError(data);
    if (errMsg) {
      if (isDeprecatedSoapError(errMsg)) {
        throw new SynergyError(errMsg, 'SOAP_DEPRECATED');
      }
      if (isAuthErrorMessage(errMsg)) {
        throw new SynergyAuthError(errMsg);
      }
      throw new SynergyError(errMsg, 'SYNERGY_ERROR');
    }
    return data;
  }

  getStudentInfo(): Promise<Record<string, unknown>> {
    return this.rawRequest('StudentInfo');
  }

  getSchoolInfo(): Promise<Record<string, unknown>> {
    return this.rawRequest('StudentSchoolInfo');
  }

  getGradebook(reportPeriod?: number): Promise<Record<string, unknown>> {
    return this.rawRequest(
      'Gradebook',
      reportPeriod !== undefined ? { ReportPeriod: reportPeriod } : undefined
    );
  }

  getSchedule(termIndex?: number): Promise<Record<string, unknown>> {
    return this.rawRequest(
      'StudentClassList',
      termIndex !== undefined ? { TermIndex: termIndex } : undefined
    );
  }

  getAttendance(): Promise<Record<string, unknown>> {
    return this.rawRequest('Attendance');
  }

  getMessages(): Promise<Record<string, unknown>> {
    return this.rawRequest('GetPXPMessages');
  }

  getCalendar(requestDate?: string): Promise<Record<string, unknown>> {
    return this.rawRequest(
      'StudentCalendar',
      requestDate !== undefined ? { RequestDate: requestDate } : undefined
    );
  }

  listReportCards(): Promise<Record<string, unknown>> {
    return this.rawRequest('GetReportCardInitialData');
  }

  getReportCard(documentGu: string): Promise<Record<string, unknown>> {
    return this.rawRequest('GetReportCardDocumentData', { DocumentGU: documentGu });
  }

  listDocuments(): Promise<Record<string, unknown>> {
    return this.rawRequest('GetStudentDocumentInitialData');
  }

  getDocument(documentGu: string): Promise<Record<string, unknown>> {
    return this.rawRequest('GetContentOfAttachedDoc', { DocumentGU: documentGu });
  }
}
