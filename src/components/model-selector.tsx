'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';

interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  available: boolean;
}

// DeepSeek models — hardcoded as a fallback in case the API list omits them.
// The API's /ai/models response ALSO includes these (provider: "deepseek"),
// so the selector dedupes by id to avoid duplicate option values (which
// made browsers tick the first duplicate — the one under LM Studio).
const DEEPSEEK_FALLBACKS: ModelInfo[] = [
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
  const [deepseekModels, setDeepseekModels] = useState<ModelInfo[]>(DEEPSEEK_FALLBACKS);
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
        // Split by provider: lmstudio/* → local group, deepseek/* → cloud group
        setLmStudioModels(apiModels.filter(m => m.provider !== 'deepseek'));
        // Merge API deepseek models with the hardcoded fallbacks, deduped by id,
        // preferring the fallback's pretty display name (e.g. "DeepSeek V4 Flash")
        const apiDeepseek = apiModels.filter(m => m.provider === 'deepseek');
        const merged: ModelInfo[] = [];
        for (const api of apiDeepseek) {
          const pretty = DEEPSEEK_FALLBACKS.find(fb => fb.id === api.id);
          merged.push({ ...api, name: pretty?.name || api.name });
        }
        for (const fb of DEEPSEEK_FALLBACKS) {
          if (!merged.some(m => m.id === fb.id)) merged.push(fb);
        }
        setDeepseekModels(merged);
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
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </optgroup>
      )}
      {deepseekModels.length > 0 && (
        <optgroup label="DeepSeek (cloud)">
          {deepseekModels.filter(m => m.available).map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
