'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';

interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  available: boolean;
}

// DeepSeek cloud models — always shown in their own group, routed to the
// DeepSeek API (provider prefix "deepseek/" → DEEPSEEK_BASE_URL + key).
const DEEPSEEK_CLOUD: ModelInfo[] = [
  { id: 'deepseek/deepseek-v4-flash', provider: 'deepseek', name: 'DeepSeek V4 Flash', available: true },
  { id: 'deepseek/deepseek-v4-pro', provider: 'deepseek', name: 'DeepSeek V4 Pro', available: true },
];

export function ModelSelector({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (modelId: string) => void 
}) {
  const { fetchDocAI } = useAuth();
  const [lmStudioModels, setLmStudioModels] = useState<ModelInfo[]>([]);
  // Guards against the async /ai/models response overwriting a model the
  // user already picked (stale-closure bug)
  const userPicked = useRef(false);

  useEffect(() => {
    fetchDocAI('/ai/models')
      .then(r => r.json())
      .then(d => {
        const apiModels: ModelInfo[] = (d.models || []).map((m: any) => ({
          id: m.id,
          provider: m.provider,
          name: m.name,
          available: m.available !== false,
        }));
        // Everything the API lists goes in the LM Studio group — INCLUDING
        // deepseek models if the LM Studio server exposes them. Rewrite their
        // ids to the lmstudio/ prefix so they (a) route to the LM Studio
        // server instead of the cloud API and (b) don't collide with the
        // cloud group's identical values (which made browsers tick the first
        // duplicate). lmstudio/ models pass through untouched.
        setLmStudioModels(apiModels.map(m =>
          m.provider === 'deepseek' || m.id.startsWith('deepseek/')
            ? { ...m, id: `lmstudio/${m.id.slice('deepseek/'.length)}`, provider: 'lmstudio' }
            : m
        ));
        if (d.default_model_id && !value && !userPicked.current) {
          onChange(d.default_model_id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <select 
      value={value}
      onChange={e => {
        userPicked.current = true;
        onChange(e.target.value);
      }}
      className="border border-border rounded-md px-3 py-2 text-sm bg-background"
    >
      <option value="">Select a model...</option>
      {lmStudioModels.length > 0 && (
        <optgroup label="LM Studio (local)">
          {lmStudioModels.filter(m => m.available).map(m => (
            <option key={m.id} value={m.id}>
              {m.provider === 'deepseek' || m.id.startsWith('lmstudio/deepseek/')
                ? `${m.name} (via LM Studio)`
                : m.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="DeepSeek (cloud)">
        {DEEPSEEK_CLOUD.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </optgroup>
    </select>
  );
}
