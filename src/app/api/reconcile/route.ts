import { NextRequest, NextResponse } from 'next/server';
import { decryptDocAISession, COOKIE_NAME } from '@/lib/session';
import { docaiFetch } from '@/lib/docai-proxy';
import { reconcile, ReconciliationDocument } from '@/engine/reconcile';

const LM_STUDIO_URL = process.env.LM_STUDIO_URL!;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY!;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export async function POST(req: NextRequest) {
  const encrypted = req.cookies.get(COOKIE_NAME)?.value;
  if (!encrypted) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const session = await decryptDocAISession(encrypted);
  if (!session) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const body = await req.json();
  const { fileIds, modelId } = body;
  // modelId format: "lmstudio/qwen3-vl-32b" or "deepseek/deepseek-chat"

  if (!fileIds || fileIds.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 documents' }, { status: 400 });
  }

  try {
    // Fetch segments for all selected files
    const documents: ReconciliationDocument[] = [];
    
    for (const fileId of fileIds) {
      const fileRes = await docaiFetch(`/v1/files/${fileId}`, {
        docaiSessionToken: session.token,
      });
      const fileData = await fileRes.json();
      let fileName = fileData.filename || fileData.name || 'Unknown';
      
      const segRes = await docaiFetch(`/v1/files/${fileId}/segments`, {
        docaiSessionToken: session.token,
      });
      const segData = await segRes.json();
      let segments = segData.segments || segData.items || [];
      // Ensure segments is an array — API returns flat array directly
      if (!Array.isArray(segments)) {
        segments = Array.isArray(segData) ? segData : [];
      }
      // If the first fallback gave empty array but segData IS the array, use it
      if (segments.length === 0 && Array.isArray(segData)) {
        segments = segData;
      }
      // Get fileName from segments if file metadata doesn't have it
      if (fileName === 'Unknown' && segments.length > 0) {
        fileName = segments[0]?.docName || fileName;
      }
      // Normalize API response: map markdown→content, title→type, assign numeric index
      segments = segments.map((s: any, i: number) => ({
        index: i,
        content: s.markdown || s.content || '',
        type: s.title || s.type,
      }));
      
      documents.push({ segments, fileName });
    }

    // Determine LLM provider and endpoint
    // modelId format: "lmstudio/qwen/qwen3-vl-30b" or "deepseek/deepseek-v4-flash"
    const slashIdx = modelId.indexOf('/');
    const provider = slashIdx > 0 ? modelId.slice(0, slashIdx) : 'lmstudio';
    const modelName = slashIdx > 0 ? modelId.slice(slashIdx + 1) : modelId;
    // LM Studio expects full path after provider prefix (e.g. qwen/qwen3-vl-30b)
    // DeepSeek expects the model name as-is (e.g. deepseek-v4-flash)
    
    const llmUrl = provider === 'deepseek'
      ? `${DEEPSEEK_BASE_URL}/chat/completions`
      : `${LM_STUDIO_URL}/v1/chat/completions`;
    
    const llmHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (provider === 'deepseek') {
      llmHeaders['Authorization'] = `Bearer ${DEEPSEEK_API_KEY}`;
    }

    const llmCall = async (prompt: string): Promise<string> => {
      const llmRes = await fetch(llmUrl, {
        method: 'POST',
        headers: llmHeaders,
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'system',
              content: 'You are a financial document reconciliation auditor. Always respond with valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 16000,
        }),
      });

      if (!llmRes.ok) {
        const err = await llmRes.text();
        throw new Error(`LLM API error (${provider}): ${llmRes.status} ${err.slice(0, 200)}`);
      }

      const llmData = await llmRes.json();
      return llmData.choices?.[0]?.message?.content || '';
    };

    const result = await reconcile(
      { documents, modelId: modelName },
      llmCall
    );

    console.log('[RECONCILE] Prompt preview:', 
      documents.map(d => `\n${d.fileName}: ${d.segments.length} segs, ${d.segments.reduce((s: number, seg: any) => s + seg.content.length, 0)} chars`)
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Reconciliation error:', error);
    return NextResponse.json(
      { error: error.message || 'Reconciliation failed' },
      { status: 500 }
    );
  }
}
