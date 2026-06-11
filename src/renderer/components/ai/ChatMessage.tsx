import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMsg, RunPhase } from '../../stores/ai-store';

interface Props {
  message: ChatMsg;
}

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  read_chapter: { icon: 'R', label: '读取章节', color: '#5b8def' },
  search_content: { icon: 'S', label: '搜索正文', color: '#56b6c2' },
  get_chapter_stats: { icon: '#', label: '章节统计', color: '#9a7fd1' },
  get_book_outline: { icon: 'O', label: '读取目录', color: '#8aa1b4' },
  insert_text: { icon: '+', label: '插入文本', color: '#55a36f' },
  replace_in_chapter: { icon: 'E', label: '替换文本', color: '#55a36f' },
  create_chapter: { icon: '+', label: '创建章节', color: '#55a36f' },
  rename_chapter: { icon: 'N', label: '重命名章节', color: '#d19a66' },
  delete_chapter: { icon: 'D', label: '删除章节', color: '#d86b6b' },
  apply_style: { icon: 'A', label: '应用样式', color: '#9a7fd1' },
  create_group: { icon: '+', label: '创建分组', color: '#55a36f' },
  rename_group: { icon: 'N', label: '重命名分组', color: '#d19a66' },
  move_chapter_to_group: { icon: 'M', label: '移动章节', color: '#d19a66' },
  novel_search: { icon: 'Q', label: '搜索小说', color: '#4d8fb3' },
  novel_book_info: { icon: 'I', label: '读取书籍数据', color: '#4d8fb3' },
  novel_catalog: { icon: 'C', label: '读取小说目录', color: '#7b83c5' },
  novel_read_chapter: { icon: 'R', label: '阅读参考章节', color: '#7b83c5' },
  qidian_rankings: { icon: '#', label: '查询起点榜单', color: '#c28b3c' },
  novel_writing_reference: { icon: 'K', label: '读取写作知识', color: '#8c6bb1' },
  novel_knowledge_search: { icon: 'K', label: '检索小说知识库', color: '#8c6bb1' },
};

const PHASE_LABELS: Record<RunPhase, string> = {
  idle: '',
  starting: '连接模型',
  thinking: '整理工具结果',
  tool_running: '执行工具',
  streaming: '实时输出',
  finishing: '整理回复',
  error: '请求失败',
};

const LARGE_RESULT_THRESHOLD = 12000;

function formatArgs(args: any, maxLen = 120): string {
  if (!args) return '';
  try {
    const obj = typeof args === 'string' ? JSON.parse(args) : args;
    if (!obj || typeof obj !== 'object') return String(obj).slice(0, maxLen);
    return Object.entries(obj)
      .filter(([, value]) => value != null && value !== '')
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value.slice(0, 42) : JSON.stringify(value)}`)
      .join(', ')
      .slice(0, maxLen);
  } catch {
    return String(args).slice(0, maxLen);
  }
}

function resultPreview(result: string): string {
  if (result.length <= LARGE_RESULT_THRESHOLD) return result;
  const head = result.slice(0, 5000);
  const tail = result.slice(-1200);
  return `${head}\n\n... 已折叠 ${(result.length - head.length - tail.length).toLocaleString()} 个字符 ...\n\n${tail}`;
}

const ToolCard: React.FC<{ name: string; args: any; result?: string; done: boolean }> = ({ name, args, result, done }) => {
  const [open, setOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const meta = TOOL_META[name] || { icon: '-', label: name, color: '#6c7480' };
  const argStr = useMemo(() => formatArgs(args), [args]);
  const visibleResult = result && !showFull ? resultPreview(result) : result;
  const large = Boolean(result && result.length > LARGE_RESULT_THRESHOLD);

  return (
    <div className={`tool-card ${done ? 'done' : 'running'}`}>
      <button className="tool-card-header" onClick={() => setOpen(v => !v)} style={{ borderLeftColor: meta.color }} type="button">
        <span className="tool-card-icon">{done ? meta.icon : ''}</span>
        <span className="tool-card-label">{meta.label}</span>
        {argStr && <span className="tool-card-args">{argStr}</span>}
        <span className="tool-card-state">{done ? '完成' : '运行中'}</span>
        <span className="tool-card-toggle">{open ? '-' : '+'}</span>
      </button>
      {open && visibleResult && (
        <>
          <pre className={`tool-card-result ${large && !showFull ? 'tool-card-result-preview' : ''}`}>{visibleResult}</pre>
          {large && !showFull && (
            <button className="tool-card-expand-btn" onClick={() => setShowFull(true)} type="button">
              查看完整结果
            </button>
          )}
        </>
      )}
    </div>
  );
};

const ChatMessageBubble: React.FC<Props> = ({ message }) => {
  const [showThinking, setShowThinking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const isUser = message.role === 'user';
  const toolCalls = message.toolCalls || [];
  const isStreaming = Boolean(message.streaming);
  const hasContent = message.content.trim().length > 0;
  const done = !isStreaming && hasContent && !message.error;
  const runningTools = toolCalls.filter(t => t.phase === 'running');
  const phaseLabel = message.phase ? PHASE_LABELS[message.phase] : '';
  const thinking = message.thinking?.trim() || '';
  const elapsedMs = message.startedAt ? (message.completedAt || now) - message.startedAt : 0;
  const elapsed = elapsedMs >= 1000 ? `${(elapsedMs / 1000).toFixed(elapsedMs < 10000 ? 1 : 0)}s` : '';

  useEffect(() => {
    if (!isStreaming || !message.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isStreaming, message.startedAt]);

  return (
    <div className={`msg-outer ${isUser ? 'msg-outer-user' : 'msg-outer-assistant'}`}>
      {!isUser && toolCalls.length > 0 && (
        <div className="tool-card-group">
          {toolCalls.map((tc) => (
            <ToolCard key={tc.id} name={tc.name} args={tc.args} result={tc.result} done={tc.phase === 'done'} />
          ))}
        </div>
      )}

      {!isUser && thinking && (
        <div className={`thinking-panel ${showThinking ? 'open' : ''}`}>
          <button className="thinking-toggle" type="button" onClick={() => setShowThinking(v => !v)}>
            <span className="thinking-chevron">{showThinking ? '−' : '+'}</span>
            <span>{isStreaming && !hasContent ? '正在思考' : '思考过程'}</span>
            {elapsed && <span className="thinking-duration">{elapsed}</span>}
          </button>
          {showThinking && (
            <div className="thinking-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      <div className={`message ${isUser ? 'message-user' : 'message-assistant'} ${isStreaming ? 'streaming' : ''} ${message.error ? 'error' : ''}`}>
        {!isUser && isStreaming && !hasContent ? (
          <div className="streaming-head">
            <span className="streaming-spark" />
            <span className="streaming-status-text">
              {runningTools.length > 0 ? runningTools.map(t => TOOL_META[t.name]?.label || t.name).join('、') : phaseLabel || '思考中'}
            </span>
          </div>
        ) : (
          <div className="message-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || message.error || ''}</ReactMarkdown>
            {!isUser && isStreaming && hasContent ? <span className="streaming-caret" /> : null}
          </div>
        )}
      </div>

      {!isUser && (isStreaming || message.error || toolCalls.length > 0) && (
        <div className={`streaming-status ${message.error ? 'error' : done ? 'done' : ''}`}>
          {message.error
            ? message.error
            : isStreaming
              ? (runningTools.length > 0 ? `正在${runningTools.map(t => TOOL_META[t.name]?.label || t.name).join('、')}` : `${phaseLabel || '思考中'}${elapsed ? ` · ${elapsed}` : ''}`)
              : toolCalls.length > 0
                ? `${toolCalls.length} 个工具调用完成${elapsed ? ` · ${elapsed}` : ''}`
                : elapsed}
        </div>
      )}
    </div>
  );
};

export default ChatMessageBubble;
