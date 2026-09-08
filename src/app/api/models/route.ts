import { NextResponse } from 'next/server';

export async function GET() {
  const lmStudioUrl = process.env.LM_STUDIO_URL;

  // LM_STUDIO_URL is server-side only, so this route exists to let the browser
  // fetch the list of locally-served models without exposing the URL to the client.
  if (!lmStudioUrl) {
    return NextResponse.json({ models: [] });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${lmStudioUrl}/v1/models`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({ models: [] });
    }

    const data = await res.json();

    // Tolerate response shape variation: accept `data` as the array, or a bare top-level array.
    const modelList = Array.isArray(data) ? data : data.data || [];

    if (!Array.isArray(modelList)) {
      return NextResponse.json({ models: [] });
    }

    interface LmStudioModel {
      id: string;
    }

    const models = modelList.map((entry: LmStudioModel) => ({
      id: `lmstudio/${entry.id}`,
      name: entry.id,
    }));

    return NextResponse.json({ models });
  } catch {
    // On ANY failure (network error, timeout, non-ok status, unparseable body),
    // return { models: [] } with status 200. Never throw, never return a 500.
    return NextResponse.json({ models: [] });
  }
}
