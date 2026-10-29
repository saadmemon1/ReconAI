import { NextRequest, NextResponse } from 'next/server';
import { resolveApiKey, COOKIE_NAME } from '@/lib/session';
import { docaiFetch } from '@/lib/docai-proxy';
import { fetchSegmentsWithRetry } from '@/lib/fetch-segments';
import { reconcile, ReconciliationDocument } from '@/engine/reconcile';
import { isDocAIUuid } from '@/lib/proxy-path-validation';
import { unwrapFile } from '@/lib/docai-shapes';
import { buildLlmRequest, parseModelId, parseStreamEvent, LlmConfigError } from '@/lib/llm-providers';

export async function POST(req: NextRequest) {
  const apiKey = await resolveApiKey(req.cookies.get(COOKIE_NAME)?.value);
  if (!apiKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const { fileIds, modelId } = body;

  if (!Array.isArray(fileIds) || fileIds.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 documents' }, { status: 400 });
  }
  // Security gate (F2 fix): fileIds must be plain DocAI UUIDs. Blocks path
  // injection like "../api-keys" that previously reached arbitrary /v1 endpoints.
  if (!fileIds.every((id: unknown) => typeof id === 'string' && isDocAIUuid(id))) {
    return NextResponse.json({ error: 'Invalid file id' }, { status: 400 });
  }

  try {
    // Determine LLM provider and endpoint. modelId format: "lmstudio/qwen/qwen3-vl-30b",
    // "deepseek/deepseek-v4-flash", "gemini/gemini-flash-latest", or "openai/gpt-5.6-luna".
    // Throws LlmConfigError (→ 500 with a clear message, before any DocAI
    // work) when the provider isn't configured.
    const { provider, modelName } = parseModelId(String(modelId ?? ''));
    const llm = buildLlmRequest(provider, modelName);

    // Live SSE stream: forward LLM reasoning deltas as they arrive, then the report
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        // Fetch metadata + segments for all selected files, INSIDE the stream
        // so parse waits are visible in the plan ("Fetch document segments"
        // lights up) and empty-parse failures arrive as an SSE error naming
        // the file — instead of silently building an empty prompt that the
        // LLM answers with an all-zeros report.
        const documents: ReconciliationDocument[] = [];
        try {
          for (const fileId of fileIds) {
            const fileRes = await docaiFetch(`/v1/files/${fileId}`, {
              docaiApiKey: apiKey,
            });
            // F5: fail loudly if DocAI rejects the file (cross-org or missing) —
            // no more silently reconciling an empty/foreign document
            if (!fileRes.ok) {
              throw new Error(`File ${fileId} not accessible (HTTP ${fileRes.status})`);
            }
            // Production nests file metadata under `.file`; unwrap so this
            // stays correct whether the response is nested or flat.
            const fileData = unwrapFile<{ filename?: string; name?: string }>(await fileRes.json());
            let fileName = fileData?.filename || fileData?.name || 'Unknown';

            send({ type: 'stage', stage: 'retrieval-2' });
            const rawSegments = await fetchSegmentsWithRetry(fileId, fileName, {
              fetchFn: docaiFetch,
              docaiApiKey: apiKey,
            });

            // Get fileName from segments if file metadata doesn't have it
            if (fileName === 'Unknown' && rawSegments.length > 0) {
              fileName = (rawSegments[0] as { docName?: string })?.docName || fileName;
            }
            // Normalize API response: map markdown→content, title→type, assign numeric index
            const segments = rawSegments.map((s, i) => ({
              index: i,
              content: s.markdown || s.content || '',
              type: s.title || s.type,
            }));

            documents.push({ fileId, segments, fileName });
          }
        } catch (error: unknown) {
          console.error('Segment fetch error:', error);
          send({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to fetch document segments',
          });
          controller.close();
          return;
        }

        // Captured from the final SSE chunk's finish_reason — 'length' is the
        // definitive truncation signal (model hit its output-token cap).
        // Declared outside llmCall so it survives into the catch block below.
        let lastFinishReason: string | undefined;

        const llmCall = async (prompt: string) => {
          const llmRes = await fetch(llm.url, {
            method: 'POST',
            headers: llm.headers,
            body: JSON.stringify(llm.buildBody(prompt)),
          });

          if (!llmRes.ok) {
            const err = await llmRes.text();
            throw new Error(`LLM API error (${provider}): ${llmRes.status} ${err.slice(0, 200)}`);
          }
          if (!llmRes.body) {
            throw new Error('LLM API returned no body');
          }

          const reader = llmRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let reasoning = '';
          let content = '';

          // Progressive stage detection: as the model's reasoning text
          // reaches each phase (compare → totals → discrepancies →
          // findings), emit a stage event so the plan's subtasks light up
          // in sequence. Monotonic — each stage fires once, in order.
          const STAGES = [
            { id: 'reasoning-2', keywords: ['compare', 'comparison', 'line item', 'line-item', ' against ', ' vs ', 'versus', 'difference', 'differ by'] },
            { id: 'reasoning-3', keywords: ['total', 'billed', 'payable', 'subtotal', 'sum ', 'amount', 'calculate', 'computed', 'totals'] },
            { id: 'reasoning-4', keywords: ['discrepanc', 'mismatch', 'shortage', 'overbill', 'over-bill', 'shortfall', 'excess', 'missing', 'extra'] },
            { id: 'reasoning-5', keywords: ['finding', 'summary', 'therefore', 'overall', 'conclusion'] },
          ];
          let stageIdx = 0; // 0 = "Analyzing documents" (lit from the start)
          // reasoning-6 ("Preparing report") fires only when the model STOPS
          // reasoning and starts emitting content — the honest transition.
          let reportStageSent = false;
          let lastProgressSend = 0;

          const maybeAdvanceStage = (text: string) => {
            const lower = text.toLowerCase();
            for (let i = stageIdx; i < STAGES.length; i++) {
              if (STAGES[i].keywords.some(k => lower.includes(k))) {
                // Light every stage up to and including the match (no gaps)
                for (let j = stageIdx; j <= i; j++) {
                  send({ type: 'stage', stage: STAGES[j].id });
                }
                stageIdx = i + 1;
                return;
              }
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              let chunk: unknown;
              try {
                chunk = JSON.parse(payload);
              } catch {
                continue;
              }
              const { reasoning: rDelta, content: cDelta, finishReason, error } =
                parseStreamEvent(provider, chunk);
              if (error) {
                throw new Error(`LLM API error (${provider}, mid-stream): ${error}`);
              }
              if (finishReason) lastFinishReason = finishReason;
              if (rDelta) {
                reasoning += rDelta;
                send({ type: 'thinking', text: rDelta });
                maybeAdvanceStage(reasoning);
              }
              if (cDelta) {
                content += cDelta;
                // Transition to "Preparing report" the moment content starts
                if (!reportStageSent) {
                  reportStageSent = true;
                  send({ type: 'stage', stage: 'reasoning-6' });
                }
                // Throttled live progress so the last stage never looks stuck
                if (content.length - lastProgressSend > 200) {
                  lastProgressSend = content.length;
                  send({ type: 'progress', chars: content.length });
                }
              }
            }
          }

          // A normal completion always ends with a chunk carrying a
          // finish_reason ('stop', 'length', etc.) before the stream closes.
          // Its absence means the connection was cut mid-generation (seen
          // with Gemini under high load) — surface that plainly instead of
          // letting a truncated response reach the JSON parser as a cryptic
          // "unexpected token" error.
          if (!lastFinishReason) {
            throw new Error(
              `LLM API (${provider}) closed the connection before finishing its response — likely provider overload. Please retry.`
            );
          }

          // Last resort: some reasoning models emit the final JSON inside the reasoning text
          // when the token budget is consumed by thinking (content comes back empty)
          // (Not OpenAI: its reasoning text is a prose summary, never the answer.)
          if (!content && reasoning && provider !== 'openai') {
            content = reasoning;
            reasoning = '';
          }
          return {
            content,
            reasoning: reasoning || undefined,
          };
        };

        try {
          const result = await reconcile(
            { documents, modelId: modelName },
            llmCall
          );
          send({ type: 'report', report: result.report });
        } catch (error: any) {
          console.error('Reconciliation error:', error);
          let message = error.message || 'Reconciliation failed';
          if (lastFinishReason) {
            message = `${message} (finish_reason: ${lastFinishReason})`;
          }
          if (lastFinishReason === 'length') {
            message =
              `The model hit its output-token limit and returned incomplete JSON. ` +
              `Try a model with a larger output budget, or fewer documents. ${message}`;
          }
          send({ type: 'error', message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    if (!(error instanceof LlmConfigError)) console.error('Reconciliation error:', error);
    return NextResponse.json(
      { error: error.message || 'Reconciliation failed' },
      { status: 500 }
    );
  }
}
