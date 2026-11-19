// src/components/ChatWindow.js
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, FileSearch, HelpCircle, Code, Zap, Brain, GitBranch } from 'lucide-react';

const ChatWindow = ({
  messages,
  input,
  setInput,
  handleSend,
  hasDocument,
  isLoading,
  profMode,
  setProfMode,
  regulation,
  setRegulation,
}) => {
  const runTask = (taskQuery, preferredBrain) => {
    setInput(taskQuery);
    handleSend(taskQuery, preferredBrain);
  };

  return (
    <main className="main-content">
      <div className="messages-container">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role === 'user' ? 'user-msg' : 'ai-msg'}`}>
            {msg.role === 'assistant' && (
              <div className="ai-icon">
                <Sparkles size={20} color="#10a37f" />
              </div>
            )}
            <div className={msg.role === 'assistant' ? 'ai-bubble' : 'message-text'}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>

      {hasDocument && (
        <div className="quick-tasks">
          <button className="task-btn" onClick={() => runTask("Summarize this document accurately", "Document")}> 
            <FileSearch size={14} /> Summarize
          </button>
          <button className="task-btn" onClick={() => runTask("Generate 5 difficult quiz questions from this file", "Document") }>
            <HelpCircle size={14} /> Generate Quiz
          </button>
          <button className="task-btn" onClick={() => runTask("Explain the core technical logic in this document", "Document") }>
            <Code size={14} /> Explain Logic
          </button>
        </div>
      )}

      <div className="demo-controls">
        <div className="reg-selector">
          <GitBranch size={14} />
          <select value={regulation} onChange={(e) => setRegulation(e.target.value)}>
            <option value="SITE 23">SITE 23</option>
            <option value="SITE 21">SITE 21</option>
            <option value="SITE 18">SITE 18</option>
          </select>
        </div>

        <div className="mode-toggle-container">
          <button 
            className={`mode-toggle ${profMode === 'fast' ? 'active' : ''}`}
            onClick={() => setProfMode('fast')}
          >
            <Zap size={14} /> Fast
          </button>
          <button 
            className={`mode-toggle ${profMode === 'deep' ? 'active' : ''}`}
            onClick={() => setProfMode('deep')}
          >
            <Brain size={14} /> Deep Research
          </button>
        </div>
      </div>

      <div className="input-area">
        <div className="input-pill">
          <input
            placeholder="Ask anything about the syllabus or your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <button className="send-btn" onClick={() => handleSend()} disabled={isLoading || !input.trim()}>
            <Send size={18} />
          </button>
        </div>
      </div>
    </main>
  );
};

export default ChatWindow;
