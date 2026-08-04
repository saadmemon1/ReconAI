const DOCAI_BASE_URL = process.env.DOCAI_BASE_URL!;

export async function docaiFetch(
  path: string,
  options: {
    method?: string;
    body?: BodyInit | object;
    docaiSessionToken?: string;
    docaiOrgId?: string;
    contentType?: string;
    origin?: string;
  } = {}
): Promise<Response> {
  const { method = 'GET', body, docaiSessionToken, docaiOrgId, contentType } = options;
  
  const headers: Record<string, string> = {};
  
  if (docaiSessionToken) {
    headers['Cookie'] = `better-auth.session_token=${docaiSessionToken}`;
  }
  // F5 fix: DocAI file/KB endpoints require the org header alongside the
  // session cookie (per the control-plane OpenAPI security requirements).
  if (docaiOrgId) {
    headers['x-docai-org-id'] = docaiOrgId;
  }
  
  headers['Origin'] = options.origin || 'http://localhost:3000';
  
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = contentType || 'application/json';
  }
  // For FormData, don't set Content-Type (browser sets with boundary)
  
  const fetchBody = body instanceof FormData || typeof body === 'string'
    ? body
    : body ? JSON.stringify(body) : undefined;

  return fetch(`${DOCAI_BASE_URL}${path}`, {
    method,
    headers,
    body: fetchBody,
  });
}
