import React, { useState, useEffect } from 'react';
import { useModelConfigStore, type ModelConfig } from '../../stores/model-config-store';

interface Props {
  onClose: () => void;
}

const SettingsPanel: React.FC<Props> = ({ onClose }) => {
  const { configs, loading, load, add, remove, update } = useModelConfigStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', url: '', model: '', api_key: '', context_window: 1_000_000 });
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: '', url: '', model: '', api_key: '', context_window: 1_000_000 });
    setEditingId(null);
    setShowAdd(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim() || !form.model.trim()) return;
    if (editingId) {
      await update(editingId, form);
    } else {
      await add(form);
    }
    resetForm();
  };

  const handleEdit = (cfg: ModelConfig) => {
    setForm({ name: cfg.name, url: cfg.url, model: cfg.model, api_key: cfg.api_key, context_window: cfg.context_window || 1_000_000 });
    setEditingId(cfg.id);
    setShowAdd(true);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="dialog-btn" onClick={onClose}>关闭</button>
        </div>

        <div className="settings-body">
          <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            AI 模型配置
          </h3>

          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>加载中...</p>
          ) : (
            <>
              {configs.map((cfg) => (
                <div key={cfg.id} className="model-config-card">
                  <div className="model-config-info">
                    <div className="model-config-name">{cfg.name}</div>
                    <div className="model-config-detail">{cfg.model} @ {cfg.url}</div>
                  </div>
                  <div className="model-config-actions">
                    <button className="dialog-btn" onClick={() => handleEdit(cfg)} style={{ fontSize: 11, padding: '3px 10px' }}>编辑</button>
                    <button className="dialog-btn danger" onClick={() => remove(cfg.id)} style={{ fontSize: 11, padding: '3px 10px' }}>删除</button>
                  </div>
                </div>
              ))}

              {configs.length === 0 && !showAdd && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
                  还没有配置模型。支持 OpenAI、DeepSeek 等兼容 API。
                </p>
              )}

              {showAdd ? (
                <div className="model-config-form">
                  <input className="dialog-input" placeholder="配置名称（如：DeepSeek）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input className="dialog-input" placeholder="API URL（如：https://api.deepseek.com/v1）" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
                  <input className="dialog-input" placeholder="模型名（如：deepseek-chat）" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                  <input className="dialog-input" placeholder="API Key" type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
                  <label className="settings-field-label">
                    上下文窗口上限（Token，默认 1000K）
                    <input
                      className="dialog-input"
                      type="number"
                      min={1000}
                      step={1000}
                      value={form.context_window}
                      onChange={(e) => setForm({ ...form, context_window: Math.max(1000, Number(e.target.value) || 1_000_000) })}
                    />
                  </label>
                  <div className="dialog-actions">
                    <button className="dialog-btn" onClick={resetForm}>取消</button>
                    <button className="dialog-btn primary" onClick={handleSave}>{editingId ? '保存' : '添加'}</button>
                  </div>
                </div>
              ) : (
                <button className="dialog-btn primary" onClick={() => setShowAdd(true)} style={{ width: '100%' }}>
                  ＋ 添加模型
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
