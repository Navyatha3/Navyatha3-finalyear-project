import React, { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  BookOpen,
  Building2,
  FileText,
  SendHorizontal,
  Zap,
  Search,
  PanelRightOpen,
  PanelRightClose,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import BrainBadge from "./BrainBadge";
import DocumentUpload from "./DocumentUpload";

const BRAIN_CHOICES = ["Auto", "Professional", "Admin", "Document"];

const EMPTY_STATE_CARDS = [
  {
    key: "Professional",
    title: "📚 Ask Academic Questions",
    icon: BookOpen,
    description: "Get syllabus-aligned explanations, exam tips, and concept breakdowns from your curriculum.",
    prompts: [
      "Explain linked list insertion",
      "Create a revision plan",
      "Explain binary search trees",
    ],
  },
  {
    key: "Admin",
    title: "🏢 Campus Support",
    icon: Building2,
    description: "Find information about fees, transport, faculty contacts, and campus logistics.",
    prompts: [
      "Fee payment options",
      "CSE department HOD",
      "Bus routes available",
    ],
  },
  {
    key: "Document",
    title: "📄 Analyze Your Documents",
    icon: FileText,
    description: "Upload a PDF and ask questions about it. Get summaries, quizzes, and key topics.",
    prompts: [
      "Summarize document",
      "Extract key topics",
      "Generate practice questions",
    ],
  },
];

const ModePill = ({ mode }) => {
  const isDeep = (mode || "fast").toLowerCase() === "deep";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        isDeep
          ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
          : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
      }`}
    >
      {isDeep ? <Search size={11} /> : <Zap size={11} />}
      {isDeep ? "Deep" : "Fast"}
    </span>
  );
};

const normalizeAssistantMarkdown = (content) => {
  if (typeof content !== "string" || !content.includes("|")) {
    return content;
  }

  // Recover malformed table rows that are returned on one line: "| ... | | ... |"
  return content.replace(/\|\s+\|/g, "|\n|");
};

const ChatInterface = ({
  messages,
  inputValue,
  onInputChange,
  onSend,
  isLoading,
  chatMode,
  onModeChange,
  brainSelection,
  onBrainSelectionChange,
  onPromptSelect,
  onUploadFile,
  isUploading,
  uploadProgress,
  activeDocument,
  activeBrain,
  chatTitle,
  healthOnline,
  isRightPanelOpen,
  onToggleRightPanel,
  lastRoutingText,
  onFeedback,
  regulation,
  onRegulationChange,
}) => {
  const endRef = useRef(null);
  const previousMessageCountRef = useRef(0);

  useEffect(() => {
    if (!endRef.current) {
      return;
    }

    const currentCount = messages.length;
    const hasNewMessage = currentCount > previousMessageCountRef.current;
    previousMessageCountRef.current = currentCount;

    // Avoid repeated smooth-scroll jitter while loading toggles.
    if (!hasNewMessage && isLoading) {
      return;
    }

    if (typeof endRef.current?.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ behavior: hasNewMessage ? "smooth" : "auto", block: "end" });
    }
  }, [messages.length, isLoading]);

  const isEmpty = !messages.length;

  const title = useMemo(() => {
    if (!chatTitle || chatTitle.trim() === "") {
      return "New Chat";
    }
    return chatTitle;
  }, [chatTitle]);

  const handleInputKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const runTask = (taskQuery, preferredBrain) => {
    onPromptSelect(taskQuery, preferredBrain);
    onSend(taskQuery, preferredBrain);
  };

  return (
    <section className="fused-panel relative flex min-h-[88vh] flex-1 flex-col overflow-hidden rounded-3xl">
      <div className="border-b border-fused-line/70 px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-fused-muted">Current Session</p>
            <h2 className="text-lg font-semibold text-fused-text">{title}</h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-fused-line/80 bg-fused-card/70 px-3 py-1.5 text-xs text-fused-muted sm:flex">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  healthOnline ? "bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.9)]" : "bg-rose-500"
                }`}
              />
              <span>{healthOnline ? "🟢 Online" : "🔴 Offline"}</span>
            </div>

            <BrainBadge brain={activeBrain} compact />

            <button
              type="button"
              onClick={onToggleRightPanel}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-fused-line/80 bg-fused-card/70 text-fused-text transition hover:border-fused-accentStart/50"
              title={isRightPanelOpen ? "Collapse right panel" : "Expand right panel"}
            >
              {isRightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="fused-scroll flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {isEmpty && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-fused-text">Welcome to FusedChat</h3>
              <p className="text-sm text-fused-muted">
                Start by asking a question below, uploading a document, or pick one of these options:
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {EMPTY_STATE_CARDS.map((card) => {
                const Icon = card.icon;
                const isDocCard = card.key === "Document";

                return (
                  <article
                    key={card.key}
                    className="group rounded-2xl border border-fused-line/80 bg-gradient-to-br from-fused-accentStart/5 to-fused-card/40 p-5 transition hover:border-fused-accentStart/60 hover:from-fused-accentStart/15 cursor-pointer"
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <div className="rounded-xl bg-fused-accentStart/20 p-2.5 text-fused-accentEnd transition group-hover:bg-fused-accentStart/30">
                        <Icon size={18} />
                      </div>
                      <h4 className="text-base font-semibold text-fused-text">{card.title}</h4>
                    </div>

                    <p className="mb-4 text-xs leading-6 text-fused-muted/80">{card.description}</p>

                    {isDocCard && !activeDocument && (
                      <div className="mb-3">
                        <DocumentUpload
                          variant="card"
                          onUpload={onUploadFile}
                          isUploading={isUploading}
                          progress={uploadProgress}
                        />
                      </div>
                    )}

                    {isDocCard && activeDocument && (
                      <div className="mb-3 rounded-xl border border-fused-line/70 bg-fused-bg/40 p-3 text-xs text-fused-muted">
                        <p className="font-medium text-fused-text">Active PDF: {activeDocument.filename}</p>
                        <p className="mt-1">Topics ready: {(activeDocument.topics || []).slice(0, 3).join(", ") || "Pending"}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {card.prompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => runTask(prompt, card.key)}
                          className="text-left rounded-lg border border-fused-line/80 bg-fused-bg/60 px-3 py-2 text-xs text-fused-muted transition hover:border-fused-accentStart/80 hover:bg-fused-accentStart/15 hover:text-fused-text font-medium"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {!isEmpty && (
          <div className="space-y-4 pb-2">
            {messages.map((message) => {
              const isUser = message.role === "user";
              const mode = message.mode || "fast";

              return (
                <article
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[86%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}>
                    {!isUser && (
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fused-accentStart/15 text-fused-accentEnd">
                          <Bot size={14} />
                        </div>
                        <BrainBadge brain={message.brain || activeBrain} compact />
                        <ModePill mode={mode} />
                      </div>
                    )}

                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                        isUser
                          ? "border-emerald-300/25 bg-accent-gradient text-[#042e24]"
                          : "border-fused-line/80 bg-fused-card text-fused-text"
                      }`}
                    >
                      <div className="chat-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {isUser ? message.content : normalizeAssistantMarkdown(message.content)}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {!isUser && (
                      <div className="flex items-center gap-2 text-xs text-fused-muted">
                        <button
                          type="button"
                          onClick={() => onFeedback(message.id, 1, message.messageId)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 transition ${
                            message.feedback === 1
                              ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                              : "border-fused-line/80 hover:border-emerald-300/50"
                          }`}
                          title="Helpful"
                        >
                          <ThumbsUp size={12} />
                          <span>Helpful</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onFeedback(message.id, -1, message.messageId)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 transition ${
                            message.feedback === -1
                              ? "border-rose-400/60 bg-rose-500/20 text-rose-200"
                              : "border-fused-line/80 hover:border-rose-300/50"
                          }`}
                          title="Not helpful"
                        >
                          <ThumbsDown size={12} />
                          <span>Needs Work</span>
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {isLoading && (
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fused-accentStart/15 text-fused-accentEnd">
              <Bot size={14} />
            </div>
            <div className="rounded-2xl border border-fused-line/80 bg-fused-card px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-fused-accentEnd animate-pulse-dot" />
                <span className="h-2 w-2 rounded-full bg-fused-accentEnd animate-pulse-dot" style={{ animationDelay: "0.15s" }} />
                <span className="h-2 w-2 rounded-full bg-fused-accentEnd animate-pulse-dot" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="border-t border-fused-line/70 bg-fused-bg/25 px-4 py-4 md:px-6 space-y-3">
        <div className="rounded-2xl border border-fused-line/80 bg-gradient-to-br from-fused-accentStart/10 to-fused-bg/40 p-3.5 space-y-2.5">
          <div className="flex items-end gap-2.5">
            <textarea
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask anything... about syllabus, campus, or your documents"
              rows={2}
              disabled={isLoading}
              className="fused-scroll max-h-40 min-h-[56px] flex-1 resize-none rounded-xl border border-fused-accentStart/30 bg-fused-bg/50 px-4 py-3 text-sm font-medium text-fused-text outline-none transition placeholder:text-fused-muted/70 focus:border-fused-accentStart/70 focus:bg-fused-bg/70"
            />
            <button
              type="button"
              onClick={() => onSend()}
              disabled={isLoading || !inputValue.trim()}
              className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent-gradient text-[#043d30] shadow-glass transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 flex-shrink-0"
            >
              <SendHorizontal size={20} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <DocumentUpload
              variant="button"
              onUpload={onUploadFile}
              isUploading={isUploading}
              progress={uploadProgress}
              disabled={isLoading}
            />

            <div className="inline-flex items-center rounded-lg border border-fused-line/80 bg-fused-bg/50 p-0.5">
              <button
                type="button"
                onClick={() => onModeChange("fast")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
                  chatMode === "fast"
                    ? "bg-fused-accentStart/25 text-fused-text"
                    : "text-fused-muted hover:text-fused-text"
                }`}
              >
                <Zap size={11} />
                Fast
              </button>
              <button
                type="button"
                onClick={() => onModeChange("deep")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
                  chatMode === "deep"
                    ? "bg-fused-accentStart/25 text-fused-text"
                    : "text-fused-muted hover:text-fused-text"
                }`}
              >
                <Search size={11} />
                Deep
              </button>
            </div>

            <select 
              value={regulation} 
              onChange={(event) => onRegulationChange(event.target.value)}
              className="rounded-lg border border-fused-line/80 bg-fused-bg/50 px-2 py-1 text-fused-muted outline-none transition hover:border-fused-accentStart/50 focus:border-fused-accentStart/60 cursor-pointer"
            >
              <option value="SITE 23">SITE 23</option>
              <option value="SITE 21">SITE 21</option>
              <option value="SITE 18">SITE 18</option>
            </select>

            <span className="text-fused-muted/60">•</span>
            <span className="text-fused-muted">Route:</span>
            <select 
              value={brainSelection}
              onChange={(e) => onBrainSelectionChange(e.target.value)}
              className="rounded-lg border border-fused-line/80 bg-fused-bg/50 px-2 py-1 text-fused-muted outline-none transition hover:border-fused-accentStart/50 focus:border-fused-accentStart/60 cursor-pointer font-medium"
            >
              {BRAIN_CHOICES.map((brain) => (
                <option key={brain} value={brain}>{brain}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-fused-muted/70 px-1">{lastRoutingText}</p>
      </div>
    </section>
  );
};

export default ChatInterface;
