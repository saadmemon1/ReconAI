// Defaulted, not required: the hosted instance (api.providus.ai) means a
// Vercel deploy needs no configuration out of the box, while on-premises
// customers override this via env to point at their own instance.
const DOCAI_BASE_URL = process.env.DOCAI_BASE_URL || 'https://api.providus.ai';

export async function docaiFetch(
  path: string,
  options: {
    method?: string;
    body?: BodyInit | object;
    docaiApiKey?: string;
    contentType?: string;
  } = {}
): Promise<Response> {
  const { method = 'GET', body, docaiApiKey, contentType } = options;

  const headers: Record<string, string> = {};

  if (docaiApiKey) {
    headers['x-api-key'] = docaiApiKey;
  }

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
