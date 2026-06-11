import React, { useEffect, useRef, useState } from 'react';
import { useModelConfigStore } from '../../stores/model-config-store';
import { useAiStore } from '../../stores/ai-store';

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}K`;
  return String(value);
}

const ModelSwitcher: React.FC = () => {
  const configs = useModelConfigStore((s) => s.configs);
  const selectedId = useAiStore((s) => s.selectedConfigId);
  const setConfig = useAiStore((s) => s.setConfig);
  const clear = useAiStore((s) => s.clear);
  const streaming = useAiStore((s) => s.streaming);
  const tokenUsageByConfig = useAiStore((s) => s.tokenUsageByConfig);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (configs.length === 0) return null;

  const current = configs.find((config) => config.id === selectedId) || configs[0];
  const used = tokenUsageByConfig[current.id] || 0;
  const limit = current.context_window || 1_000_000;
  const percent = Math.min(100, (used / limit) * 100);

  return (
    <div className="chat-context-bar">
      <div className="model-switcher" ref={rootRef}>
        {open && (
          <div className="model-popover" role="listbox" aria-label="选择模型">
            {configs.map((config) => (
              <button
                key={config.id}
                className={`model-option${config.id === current.id ? ' active' : ''}`}
                type="button"
                onClick={() => { setConfig(config.id); setOpen(false); }}
              >
                <span>{config.name}</span>
                <small>{config.model}</small>
              </button>
            ))}
          </div>
        )}
        <button className="model-select" type="button" onClick={() => setOpen(value => !value)}>
          <span>{current.name} · {current.model}</span>
          <span className="model-select-arrow">⌃</span>
        </button>
      </div>

      <button className="chat-clear-btn" type="button" disabled={streaming} onClick={() => void clear()} title="清空对话并重置当前 Agent 上下文">
        清空
      </button>

      <div className="context-meter" title={`上下文 ${used.toLocaleString()} / ${limit.toLocaleString()} Token`}>
        <div className="context-meter-track"><span style={{ width: `${percent}%` }} /></div>
        <span className="context-meter-label">{formatTokens(used)} / {formatTokens(limit)}</span>
      </div>
    </div>
  );
};

export default ModelSwitcher;
