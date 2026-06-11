import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMsg } from '../../stores/ai-store';

interface Props {
  message: ChatMsg;
}

const ToolCard: React.FC<{ name: string; args: any; result?: string; done: boolean }> = ({ name, args, result, done }) => {
  const [open, setOpen] = useState(false);
  const argStr = typeof args === 'object' ? Object.entries(args).filter(([,v]) => v != null).map(([k,v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ') : String(args);

  return (
    <div className="tool-card">
      <div className="tool-card-header" onClick={() => setOpen(!open)}>
        <span className="tool-card-icon">{done ? '✓' : '⟳'}</span>
        <span className="tool-card-label">{name}</span>
        <span className="tool-card-args">{argStr}</span>
        <span className="tool-card-toggle">{open ? '▾' : '▸'}</span>
      </div>
      {open && result && (
        <div className="tool-card-result">{result}</div>
      )}
    </div>
  );
};

const STATUS_LABELS: Record<string, string> = {
  read_chapter: '读取章节',
  search_content: '搜索内容',
  get_chapter_stats: '获取统计',
  get_book_outline: '获取目录',
  insert_text: '插入文字',
  replace_in_chapter: '替换文字',
  create_chapter: '创建章节',
  rename_chapter: '重命名',
  delete_chapter: '删除章节',
  apply_style: '应用样式',
  create_group: '创建分组',
  rename_group: '重命名分组',
  move_chapter_to_group: '移动章节',
};

const ChatMessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';
  const toolCalls = message.toolCalls || [];
  const hasTools = toolCalls.length > 0;
  const isStreaming = message.streaming;
  const done = !isStreaming && !!message.content;

  return (
    <div className={`msg-outer ${isUser ? 'msg-outer-user' : 'msg-outer-assistant'}`}>
      {/* Tool calls */}
      {hasTools && (
        <div className="tool-card-group">
          {toolCalls.map((tc) => (
            <ToolCard key={tc.id} name={tc.name} args={tc.args} result={tc.result} done={tc.phase === 'done'} />
          ))}
        </div>
      )}

      {/* Message content */}
      <div className={`message ${isUser ? 'message-user' : 'message-assistant'} ${isStreaming ? 'streaming' : ''}`}>
        {isStreaming && toolCalls.length === 0 && message.content === '' ? (
          <div className="streaming-spark" />
        ) : (
          <div className="message-content">
            {done ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            ) : (
              <div className="streaming-text">{message.content || ''}</div>
            )}
            {isStreaming && message.content ? <span className="streaming-spark" /> : null}
          </div>
        )}
      </div>

      {/* Status line */}
      {!isUser && isStreaming && (
        <div className="streaming-status">
          {toolCalls.length > 0
            ? toolCalls.filter(t => t.phase === 'running').map(t => STATUS_LABELS[t.name] || t.name).join(', ') + '...'
            : '思考中...'}
        </div>
      )}
      {!isUser && done && toolCalls.length > 0 && (
        <div className="streaming-status done">
          ✓ {toolCalls.length} 个工具调用完成
        </div>
      )}
    </div>
  );
};

export default ChatMessageBubble;
