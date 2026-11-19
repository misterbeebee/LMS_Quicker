export {
  SynergyAuthError,
  SynergyError,
  extractRtError,
  isAuthErrorMessage,
  isDeprecatedSoapError,
  normalizeDistrictDomain,
  type SynergyErrorCode,
  type SynergyFailure,
} from './errors.js';
export {
  buildParmsXml,
  buildSoapEnvelope,
  escapeXml,
  parseSoapResponse,
  parseSynergyXml,
  type SoapRequestParams,
} from './xml.js';
export { SynergySoapClient, type SynergySoapClientOptions } from './soap.js';
export {
  encodeFormUrlEncoded,
  encodePxp2Password,
  extractBalancedJson,
  extractDomStudents,
  extractJsAssignmentJson,
  extractLabelValuePairs,
  extractPxp2LoginError,
  firstNonEmpty,
  formatScoreRaw,
  normalizePxp2AssignmentItem,
  parseNumericScore,
  parsePxp2CategoryRows,
  parsePxp2ClassDetailsHtml,
  parsePxp2LoginForm,
  resolveUrl,
  type ParsedLoginForm,
} from './pxp2-parsers.js';
export {
  Pxp2WebClient,
  type Pxp2GradebookRequest,
  type Pxp2WebClientOptions,
} from './pxp2.js';
export {
  SynergyService,
  type SynergyExportResult,
  type SynergyServiceOptions,
} from './service.js';
