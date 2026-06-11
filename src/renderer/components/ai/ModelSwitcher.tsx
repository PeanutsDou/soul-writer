import React from 'react';
import { useModelConfigStore } from '../../stores/model-config-store';
import { useAiStore } from '../../stores/ai-store';

const ModelSwitcher: React.FC = () => {
  const configs = useModelConfigStore((s) => s.configs);
  const selectedId = useAiStore((s) => s.selectedConfigId);
  const setConfig = useAiStore((s) => s.setConfig);

  if (configs.length === 0) return null;

  const current = configs.find((c) => c.id === selectedId) || configs[0];

  return (
    <div className="model-switcher">
      <select
        className="model-select"
        value={current?.id || ''}
        onChange={(e) => setConfig(e.target.value)}
      >
        {configs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.model}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ModelSwitcher;
