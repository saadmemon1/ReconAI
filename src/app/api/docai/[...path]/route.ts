import { NextRequest, NextResponse } from 'next/server';
import { decryptDocAISession, COOKIE_NAME } from '@/lib/session';
import { docaiFetch } from '@/lib/docai-proxy';
import { isSafeProxyPath } from '@/lib/proxy-path-validation';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleRequest(req, params, 'GET');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleRequest(req, params, 'POST');
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleRequest(req, params, 'DELETE');
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleRequest(req, params, 'PATCH');
}

async function handleRequest(
  req: NextRequest,
  params: Promise<{ path: string[] }>,
  method: string
) {
  const { path } = await params;
  const encrypted = req.cookies.get(COOKIE_NAME)?.value;
  
  if (!encrypted) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const session = await decryptDocAISession(encrypted);
  if (!session) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  // Security gate (F1 fix): only relay known-safe DocAI paths. Blocks path
  // traversal (encoded dots, backslashes, ..) and any endpoint outside the
  // UI's surface (/internal/*, /health, admin, billing webhooks, etc.).
  if (!isSafeProxyPath(path)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 400 });
  }

  const docaiPath = `/v1/${path.join('/')}`;
  const url = new URL(req.url);
  const queryString = url.search; // forward query params

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      body = await req.formData();
    } else if (contentType.includes('application/json')) {
      body = JSON.stringify(await req.json());
    } else {
      body = await req.text();
    }
  }

  const res = await docaiFetch(`${docaiPath}${queryString}`, {
    method,
    body,
    docaiSessionToken: session.token,
    docaiOrgId: session.orgId,
  });

  // Forward response — binary-safe: text responses pass through as text,
  // binary ones (PDF/image content) as ArrayBuffer. res.text() corrupts
  // binary bodies (UTF-8 decode/re-encode), which broke inline PDF rendering.
  const contentType = res.headers.get('content-type') || '';
  const responseHeaders = new Headers();
  if (contentType) responseHeaders.set('content-type', contentType);

  const isBinary =
    path[path.length - 1] === 'content' ||
    contentType.includes('application/pdf') ||
    contentType.startsWith('image/') ||
    contentType.includes('application/octet-stream');
  const responseData: BodyInit = isBinary ? await res.arrayBuffer() : await res.text();

  return new NextResponse(responseData, {
    status: res.status,
    headers: responseHeaders,
  });
}
