import { XMLParser } from 'fast-xml-parser';

/**
 * Escape XML special characters (&, <, >, ", ').
 */
export function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build the double-escaped <Parms> string expected by Synergy's ProcessWebServiceRequest.
 * Matches Python SynergyClient._make_service_request.
 */
export function buildParmsXml(params: Readonly<Record<string, string | number | undefined>>): string {
  let inner = '<Parms>';
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const safeKey = escapeXml(String(key));
    const safeVal = escapeXml(String(value));
    inner += `<${safeKey}>${safeVal}</${safeKey}>`;
  }
  inner += '</Parms>';
  return inner;
}

export interface SoapRequestParams {
  readonly username: string;
  readonly password: string;
  readonly isParent: boolean;
  readonly methodName: string;
  readonly params?: Readonly<Record<string, string | number | undefined>>;
  readonly webServiceHandleName?: string;
}

/**
 * Build a SOAP 1.1 envelope for Edupoint's ProcessWebServiceRequest endpoint.
 */
export function buildSoapEnvelope(req: SoapRequestParams): string {
  const paramStr = buildParmsXml(req.params ?? {});
  const handleName = req.webServiceHandleName ?? 'PXPWebServices';
  const parentFlag = req.isParent ? '1' : '0';

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>` +
    `<ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/">` +
    `<userID>${escapeXml(req.username)}</userID>` +
    `<password>${escapeXml(req.password)}</password>` +
    `<skipLoginLog>1</skipLoginLog>` +
    `<parent>${parentFlag}</parent>` +
    `<webServiceHandleName>${escapeXml(handleName)}</webServiceHandleName>` +
    `<methodName>${escapeXml(req.methodName)}</methodName>` +
    `<paramStr>${escapeXml(paramStr)}</paramStr>` +
    `</ProcessWebServiceRequest>` +
    `</soap:Body>` +
    `</soap:Envelope>`
  );
}

const soapEnvelopeParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
});

const synergyPayloadParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '$',
  alwaysCreateTextNode: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
});

/**
 * Normalize fast-xml-parser output to match xmljson.badgerfish conventions used by studentvue==2.0.5:
 * - Leaf string values become { "$": value } (e.g. <FormattedName>Lin, Maya</FormattedName> -> { FormattedName: { "$": "Lin, Maya" } })
 * - Empty elements become {}
 * - Attributes stay prefixed with "@"
 */
function toBadgerfish(node: unknown): unknown {
  if (node === null || node === undefined) {
    return {};
  }
  if (typeof node === 'string') {
    return node === '' ? {} : { $: node };
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    return { $: String(node) };
  }
  if (Array.isArray(node)) {
    return node.map((item) => toBadgerfish(item));
  }
  if (typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.startsWith('@') || key === '$') {
        out[key] = value;
      } else {
        out[key] = toBadgerfish(value);
      }
    }
    return out;
  }
  return node;
}

/**
 * Parse an inner Synergy XML payload string into a badgerfish-compatible plain JS object.
 */
export function parseSynergyXml(xmlText: string): Record<string, unknown> {
  const parsed = synergyPayloadParser.parse(xmlText) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const normalized = toBadgerfish(parsed);
  return (normalized && typeof normalized === 'object' && !Array.isArray(normalized)
    ? normalized
    : {}) as Record<string, unknown>;
}

/**
 * Extract the inner XML string from a SOAP ProcessWebServiceRequestResponse envelope
 * and parse it into badgerfish-compatible JSON.
 */
export function parseSoapResponse(soapXml: string): Record<string, unknown> {
  const outer = soapEnvelopeParser.parse(soapXml) as Record<string, unknown> | undefined;
  const envelope = outer?.['Envelope'] as Record<string, unknown> | undefined;
  const body = envelope?.['Body'] as Record<string, unknown> | undefined;

  if (!body) {
    throw new Error('Malformed SOAP response: missing Envelope/Body');
  }

  const fault = body['Fault'] as Record<string, unknown> | undefined;
  if (fault) {
    const faultString =
      typeof fault['faultstring'] === 'string'
        ? fault['faultstring']
        : typeof fault['Reason'] === 'string'
          ? fault['Reason']
          : 'SOAP Fault';
    throw new Error(`Synergy SOAP fault: ${faultString}`);
  }

  const responseNode = body['ProcessWebServiceRequestResponse'] as Record<string, unknown> | undefined;
  const innerXml = responseNode?.['ProcessWebServiceRequestResult'];
  if (typeof innerXml !== 'string') {
    throw new Error('Malformed SOAP response: missing ProcessWebServiceRequestResult');
  }

  return parseSynergyXml(innerXml);
}
