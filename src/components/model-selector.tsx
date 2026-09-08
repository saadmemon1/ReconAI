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
          // Filter out any duplicates that appear in DEEPSEEK_CLOUD
          const deepseekIds = new Set(DEEPSEEK_CLOUD.map(m => m.id));
          const filtered = data.models.filter(
            (model: FetchedModel) => !deepseekIds.has(model.id)
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
