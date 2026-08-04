'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';

interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  available: boolean;
}

// DeepSeek models are always available (API key configured server-side)
const DEEPSEEK_MODELS: ModelInfo[] = [
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

  useEffect(() => {
    fetchDocAI('/ai/models')
      .then(r => r.json())
      .then(d => {
        const models = (d.models || []).map((m: any) => ({
          ...m,
          id: m.id, // API already returns full id with provider prefix
        }));
        setLmStudioModels(models);
        if (d.default_model_id && !value) {
          onChange(d.default_model_id);
        }
      })
      .catch(() => {});
  }, []);

  const allModels = [...lmStudioModels, ...DEEPSEEK_MODELS];

  return (
    <select 
      value={value}
      onChange={e => onChange(e.target.value)}
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
      <optgroup label="DeepSeek (cloud)">
        {DEEPSEEK_MODELS.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </optgroup>
    </select>
  );
}
