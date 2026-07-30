const DOCAI_BASE_URL = process.env.DOCAI_BASE_URL || 'https://your-ngrok-subdomain.ngrok-free.dev';

export async function docaiFetch(
  path: string,
  options: {
    method?: string;
    body?: BodyInit | object;
    docaiSessionToken?: string;
    contentType?: string;
    origin?: string;
  } = {}
): Promise<Response> {
  const { method = 'GET', body, docaiSessionToken, contentType } = options;
  
  const headers: Record<string, string> = {};
  
  if (docaiSessionToken) {
    headers['Cookie'] = `better-auth.session_token=${docaiSessionToken}`;
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
