'use client';

import { useEffect, useState } from 'react';

interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  available: boolean;
}

interface FetchedModel {
  id: string;
  name: string;
}

// DeepSeek cloud models
const DEEPSEEK_CLOUD: ModelInfo[] = [
  { id: 'deepseek/deepseek-v4-flash', provider: 'deepseek', name: 'DeepSeek V4 Flash', available: true },
  { id: 'deepseek/deepseek-v4-pro', provider: 'deepseek', name: 'DeepSeek V4 Pro', available: true },
];

// Gemini cloud models
const GEMINI_CLOUD: ModelInfo[] = [
  { id: 'gemini/gemini-3.1-flash-lite', provider: 'gemini', name: 'Gemini 3.1 Flash Lite', available: true },
  { id: 'gemini/gemini-pro-latest', provider: 'gemini', name: 'Gemini Pro (latest)', available: true },
];

export function ModelSelector({
  value,
  onChange
}: {
  value: string;
  onChange: (modelId: string) => void
}) {
  const [lmStudioModels, setLmStudioModels] = useState<FetchedModel[]>([]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models');
        const data = await res.json();
        if (Array.isArray(data.models)) {
          // Filter out any duplicates that appear in the hardcoded cloud lists
          const cloudIds = new Set([...DEEPSEEK_CLOUD, ...GEMINI_CLOUD].map(m => m.id));
          const filtered = data.models.filter(
            (model: FetchedModel) => !cloudIds.has(model.id)
          );
          setLmStudioModels(filtered);
        }
      } catch {
        // Silently ignore fetch errors; keep the array empty
      }
    };

    fetchModels();
  }, []);

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="border border-border rounded-md px-3 py-2 text-sm bg-background"
    >
      <option value="">Select a model...</option>
      <optgroup label="DeepSeek (cloud)">
        {DEEPSEEK_CLOUD.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </optgroup>
      <optgroup label="Gemini (cloud)">
        {GEMINI_CLOUD.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </optgroup>
      {lmStudioModels.length > 0 && (
        <optgroup label="LM Studio (local)">
          {lmStudioModels.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
