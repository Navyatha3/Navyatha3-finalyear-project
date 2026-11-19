import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Toaster, toast } from "react-hot-toast";
import { FileText, GitBranch, X } from "lucide-react";
import Sidebar from "./components/Sidebar";
import ChatInterface from "./components/ChatInterface";
import CitationPanel from "./components/CitationPanel";
import StatsBar from "./components/StatsBar";
import BrainBadge from "./components/BrainBadge";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";
const SESSION_STORAGE_KEY = "fusedchat.sessions.v2";
const ACTIVE_SESSION_STORAGE_KEY = "fusedchat.activeSession.v2";

const makeId = () => {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createSession = (title = "New Chat") => ({
  id: makeId(),
  title,
  updatedAt: new Date().toISOString(),
});

const normalizeBrain = (backendBrain, sourcesUsed, manualSelection) => {
  const normalized = (backendBrain || "").toLowerCase();

  if (normalized.includes("document")) {
    return "Document";
  }
  if (normalized.includes("admin") || sourcesUsed?.admin) {
    return "Admin";
  }
  if (normalized.includes("error")) {
    return "Error";
  }
  if (normalized.includes("system")) {
    return "System";
  }
  if (manualSelection === "Professional" || manualSelection === "Admin") {
    return manualSelection;
  }

  return "Professional";
};

const modeFromBackend = (mode) => {
  if ((mode || "").toLowerCase() === "deep") {
    return "deep";
  }
  return "fast";
};

const asText = (value, fallback = "") => {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  try {
    return String(value);
  } catch {
    return fallback;
  }
};

function App() {
  const historyRequestRef = useRef(0);
  const activeSessionIdRef = useRef("");
  const [sessions, setSessions] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn("Session restore failed:", error);
    }

    return [createSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || "";
    } catch (error) {
      return "";
    }
  });

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatMode, setChatMode] = useState("fast");
  const [regulation, setRegulation] = useState("SITE 21");
  const [brainSelection, setBrainSelection] = useState("Auto");
  const [activeBrain, setActiveBrain] = useState("Professional");
  const [lastRoutingText, setLastRoutingText] = useState("auto-routed to: waiting for your first question");
  const [sessionDocuments, setSessionDocuments] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [citations, setCitations] = useState([]);
  const [healthOnline, setHealthOnline] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => window.innerWidth >= 1024);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState({
    total_queries: 0,
    avg_response_time_ms: null,
    user_satisfaction: null,
  });

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [activeSessionId, sessions]
  );

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const activeDocument = useMemo(
    () => sessionDocuments[activeSessionId] || null,
    [activeSessionId, sessionDocuments]
  );

  const upsertSession = useCallback((sessionId, seedTitle = "New Chat") => {
    setSessions((prev) => {
      const now = new Date().toISOString();
      const hasSession = prev.some((session) => session.id === sessionId);

      const next = hasSession
        ? prev.map((session) => {
            if (session.id !== sessionId) {
              return session;
            }

            const shouldRetitle = session.title === "New Chat" && seedTitle !== "New Chat";
            return {
              ...session,
              title: shouldRetitle ? seedTitle.slice(0, 46) : session.title,
              updatedAt: now,
            };
          })
        : [{ id: sessionId, title: seedTitle.slice(0, 46), updatedAt: now }, ...prev];

      return [...next].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  }, []);

  const fetchSessionHistory = useCallback(async (sessionId) => {
    if (!sessionId) {
      return;
    }

    const requestId = ++historyRequestRef.current;

    const endpoints = [`${API_URL}/sessions/${sessionId}`, `${API_URL}/history/${sessionId}`];
    let payload = null;
    let historyError = null;

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, { params: { limit: 40 } });
        payload = response.data;
        break;
      } catch (error) {
        if (error?.response?.status === 404) {
          continue;
        }

        historyError = error;
      }
    }

    // Ignore stale responses when users switch sessions quickly.
    if (requestId !== historyRequestRef.current) {
      return;
    }

    if (!payload) {
      if (historyError) {
        const detail =
          historyError?.response?.data?.detail ||
          historyError?.response?.data?.error ||
          historyError?.message ||
          "Failed to load chat history.";
        toast.error(detail);
      }
      setMessages([]);
      setActiveBrain("Professional");
      setLastRoutingText("auto-routed to: waiting for your first question");
      return;
    }

    const rows = Array.isArray(payload.messages) ? payload.messages : [];
    const normalizedMessages = [];

    rows.forEach((row, index) => {
      const baseId = row._id?.$oid || row._id || `${sessionId}-${index}`;

      if (row.user_query) {
        normalizedMessages.push({
          id: `${baseId}-u`,
          role: "user",
          content: asText(row.user_query),
          mode: modeFromBackend(row.mode),
        });
      }

      const botResponse = row.bot_response ?? row.response ?? row.answer;
      if (botResponse) {
        normalizedMessages.push({
          id: `${baseId}-a`,
          role: "assistant",
          content: asText(botResponse),
          mode: modeFromBackend(row.mode),
          brain: normalizeBrain(row.mode, row.sources_used, "Auto"),
          feedback: row.feedback_rating || 0,
          messageId: typeof row._id === "string" ? row._id : row._id?.$oid || null,
        });
      }
    });

    setMessages(normalizedMessages);
    setCitations([]);
  }, []);

  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/stats`, { timeout: 7000 });
      const data = response.data || {};
      const byMode = data.satisfaction_by_mode || {};

      let thumbsUp = 0;
      let thumbsDown = 0;
      Object.values(byMode).forEach((value) => {
        thumbsUp += Number(value?.thumbs_up || 0);
        thumbsDown += Number(value?.thumbs_down || 0);
      });

      const totalVotes = thumbsUp + thumbsDown;
      const fallbackSatisfaction = totalVotes ? (thumbsUp / totalVotes) * 100 : null;

      setStats({
        total_queries: data.total_queries ?? 0,
        avg_response_time_ms: data.avg_response_time_ms ?? null,
        user_satisfaction:
          data.user_satisfaction ?? (fallbackSatisfaction === null ? null : Math.round(fallbackSatisfaction)),
      });
    } catch (error) {
      console.warn("Stats fetch failed:", error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const pingHealth = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/health`, { timeout: 5000 });
      const data = response.data || {};
      setHealthOnline(Boolean(data.ollama_reachable));
    } catch (error) {
      setHealthOnline(false);
    }
  }, []);

  useEffect(() => {
    if (!sessions.length) {
      const next = createSession();
      setSessions([next]);
      setActiveSessionId(next.id);
      return;
    }

    if (!activeSessionId || !sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.warn("Session persistence failed:", error);
    }
  }, [sessions]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    try {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
    } catch (error) {
      console.warn("Active session persistence failed:", error);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    setMessages([]);
    setCitations([]);
    fetchSessionHistory(activeSessionId);
  }, [activeSessionId, fetchSessionHistory]);

  useEffect(() => {
    pingHealth();
    const healthTimer = setInterval(pingHealth, 30000);
    return () => clearInterval(healthTimer);
  }, [pingHealth]);

  useEffect(() => {
    refreshStats();
    const statsTimer = setInterval(refreshStats, 60000);
    return () => clearInterval(statsTimer);
  }, [refreshStats]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024) {
        setIsRightPanelOpen(false);
      }
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleNewChat = () => {
    const next = createSession();
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
    setMessages([]);
    setCitations([]);
    setInputValue("");
    setActiveBrain("Professional");
    setLastRoutingText("auto-routed to: waiting for your first question");
    toast.success("Started a new chat session");
  };

  const handleRenameSession = (sessionId, title) => {
    setSessions((prev) =>
      prev.map((session) => (session.id === sessionId ? { ...session, title: title.slice(0, 46) } : session))
    );
  };

  const handleDeleteSession = (sessionId) => {
    const sessionToDelete = sessions.find((session) => session.id === sessionId);
    const isDeletingActive = activeSessionId === sessionId;

    setSessionDocuments((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });

    setSessions((prev) => {
      const remaining = prev.filter((session) => session.id !== sessionId);

      if (remaining.length === 0) {
        const fallback = createSession();
        setActiveSessionId(fallback.id);
        return [fallback];
      }

      if (isDeletingActive) {
        setActiveSessionId(remaining[0].id);
      }

      return remaining;
    });

    if (isDeletingActive) {
      setMessages([]);
      setCitations([]);
      setInputValue("");
      setActiveBrain("Professional");
      setLastRoutingText("auto-routed to: waiting for your first question");
    }

    toast.success(`Deleted: ${sessionToDelete?.title || "Chat session"}`);
  };

  const handleModeChange = (mode) => {
    setChatMode(mode);
    toast.success(mode === "deep" ? "Switched to Deep mode" : "Switched to Fast mode");
  };

  const handleBrainSelection = (brain) => {
    setBrainSelection(brain);
    toast.success(`Brain preference set to ${brain}`);
  };

  const handleUpload = async (file) => {
    if (!file || !activeSessionId) {
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        params: { session_id: activeSessionId },
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!event.total) {
            return;
          }
          setUploadProgress((event.loaded / event.total) * 100);
        },
      });

      const documentInfo = {
        document_id: response.data.document_id,
        filename: response.data.filename,
        chunks_created: response.data.chunks_created || 0,
        summary: response.data.summary || "Summary will appear after processing.",
        topics: response.data.topics || [],
      };

      setSessionDocuments((prev) => ({
        ...prev,
        [activeSessionId]: documentInfo,
      }));

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content: `Document "${documentInfo.filename}" is ready. Ask a question to use Document Brain.`,
          mode: chatMode,
          brain: "System",
          feedback: 0,
        },
      ]);

      toast.success(`PDF uploaded: ${documentInfo.filename}`);
    } catch (error) {
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        "Upload failed. Check backend connectivity.";
      toast.error(detail);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSend = async (overrideQuery = null, overrideBrain = null) => {
    const query = (overrideQuery || inputValue).trim();
    if (!query || isLoading || !activeSessionId) {
      return;
    }

    const selectedBrain = overrideBrain || brainSelection;

    const sessionIdAtSend = activeSessionId;

    const userMessage = {
      id: makeId(),
      role: "user",
      content: query,
      mode: chatMode,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    upsertSession(sessionIdAtSend, query);

    try {
      let response;

      if (selectedBrain === "Document") {
        if (!activeDocument?.document_id) {
          throw new Error("Upload a PDF first, then switch to Document Brain.");
        }
        response = await axios.post(`${API_URL}/chat/document`, {
          session_id: sessionIdAtSend,
          document_id: activeDocument.document_id,
          query,
          regulation,
        });
      } else {
        const payload = {
          session_id: sessionIdAtSend,
          query,
          mode: chatMode,
          regulation,
          document_id: activeDocument?.document_id || null,
        };

        try {
          response = await axios.post(`${API_URL}/chat/v2`, payload);
        } catch {
          response = await axios.post(`${API_URL}/chat`, payload);
        }
      }

      const data = response.data || {};
      if ((data.status || "").toLowerCase() === "error") {
        throw new Error(asText(data.response || data.error || "Backend returned an error."));
      }

      const answer = asText(data.response || data.answer || "").trim() || "I could not generate a response.";
      const routedBrain =
        selectedBrain === "Document"
          ? "Document"
          : normalizeBrain(data.brain, data.sources_used, selectedBrain);
      const messageCitations = Array.isArray(data.citations) ? data.citations : [];

      if (sessionIdAtSend !== activeSessionIdRef.current) {
        return;
      }

      const aiMessage = {
        id: makeId(),
        role: "assistant",
        content: answer,
        mode: chatMode,
        brain: routedBrain,
        citations: messageCitations,
        feedback: 0,
        messageId: data.message_id || null,
      };

      setMessages((prev) => [...prev, aiMessage]);
      setCitations(messageCitations);
      setActiveBrain(routedBrain);

      if (selectedBrain === "Auto") {
        setLastRoutingText(`auto-routed to: ${routedBrain} Brain`);
      } else {
        setLastRoutingText(`manual: ${selectedBrain} | response: ${routedBrain} Brain`);
      }
    } catch (error) {
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        error.message ||
        "Something went wrong while querying the backend.";

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content: detail,
          mode: chatMode,
          brain: "Error",
          feedback: 0,
        },
      ]);

      setActiveBrain("Error");
      toast.error(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptSelect = (prompt, preferredBrain) => {
    if (preferredBrain) {
      setBrainSelection(preferredBrain);
    }
    setInputValue(prompt);
  };

  const handleFeedback = async (localMessageId, rating, backendMessageId) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === localMessageId
          ? {
              ...message,
              feedback: rating,
            }
          : message
      )
    );

    if (!backendMessageId) {
      toast.success("Feedback captured locally");
      return;
    }

    try {
      await axios.post(`${API_URL}/feedback`, {
        session_id: activeSessionId,
        message_id: backendMessageId,
        rating,
        comment: "",
      });
      toast.success("Thanks for your feedback");
    } catch (error) {
      toast.error("Feedback endpoint unavailable right now");
    }
  };

  return (
    <div className="app-shell">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#111827",
            color: "#e8f0ff",
            border: "1px solid rgba(155, 168, 199, 0.35)",
          },
        }}
      />

      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-3 p-3 md:p-4">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewChat={handleNewChat}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          onLogout={() => toast("Logout action placeholder")}
        />

        <div className="min-w-0 flex-1">
          <ChatInterface
            messages={messages}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={handleSend}
            isLoading={isLoading}
            chatMode={chatMode}
            onModeChange={handleModeChange}
            brainSelection={brainSelection}
            onBrainSelectionChange={handleBrainSelection}
            onPromptSelect={handlePromptSelect}
            onUploadFile={handleUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            activeDocument={activeDocument}
            activeBrain={activeBrain}
            chatTitle={activeSession?.title || "New Chat"}
            healthOnline={healthOnline}
            isRightPanelOpen={isRightPanelOpen}
            onToggleRightPanel={() => setIsRightPanelOpen((prev) => !prev)}
            lastRoutingText={lastRoutingText}
            onFeedback={handleFeedback}
            regulation={regulation}
            onRegulationChange={setRegulation}
          />
        </div>

        {isRightPanelOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/45 md:hidden"
              onClick={() => setIsRightPanelOpen(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsRightPanelOpen(false);
                }
              }}
            />

            <aside className="fused-panel fixed inset-y-3 right-3 z-40 flex w-[84vw] max-w-[320px] flex-col gap-3 rounded-3xl p-3 md:static md:w-[260px]">
              <button
                type="button"
                onClick={() => setIsRightPanelOpen(false)}
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-fused-line/80 bg-fused-card/70 text-fused-muted md:hidden"
              >
                <X size={14} />
              </button>

              <section className="fused-panel rounded-2xl p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileText size={16} className="text-fused-accentStart" />
                  <h3 className="text-sm font-semibold text-fused-text">Active Document</h3>
                </div>

                {!activeDocument && (
                  <p className="text-xs leading-5 text-fused-muted">
                    No PDF is active for this session. Use Attach PDF in the input bar to enable Document Brain.
                  </p>
                )}

                {activeDocument && (
                  <div className="space-y-2 text-xs">
                    <p className="font-medium text-fused-text">{activeDocument.filename}</p>
                    <p className="text-fused-muted">{activeDocument.summary}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(activeDocument.topics || []).slice(0, 6).map((topic) => (
                        <span
                          key={topic}
                          className="rounded-full border border-fused-line/70 bg-fused-bg/50 px-2 py-1 text-[11px] text-fused-muted"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="fused-panel rounded-2xl p-4">
                <div className="mb-2 flex items-center gap-2">
                  <GitBranch size={16} className="text-fused-accentStart" />
                  <h3 className="text-sm font-semibold text-fused-text">Query Routing</h3>
                </div>
                <BrainBadge brain={activeBrain} compact />
                <p className="mt-2 text-xs text-fused-muted">{lastRoutingText}</p>
              </section>

              <CitationPanel
                citations={citations}
                activeDocument={activeDocument}
                lastRoutedBrain={activeBrain}
              />

              <StatsBar
                stats={stats}
                isOpen={statsOpen}
                onToggle={() => setStatsOpen((prev) => !prev)}
                isLoading={statsLoading}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
