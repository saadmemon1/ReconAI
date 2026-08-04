'use client';

interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  available: boolean;
}

// DeepSeek cloud models — the only models offered right now.
// LM Studio support is intentionally dormant (see reconcile route's
// lmstudio branch); re-enable by restoring the /ai/models fetch and
// merging provider groups here.
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
  return (
    <select 
      value={value}
      onChange={e => onChange(e.target.value)}
      className="border border-border rounded-md px-3 py-2 text-sm bg-background"
    >
      <option value="">Select a model...</option>
      {DEEPSEEK_CLOUD.map(m => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}
