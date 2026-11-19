import React, { useEffect, useState } from "react";
import {
  Plus,
  History,
  Upload,
  Settings,
  MessageSquareMore,
  LogOut,
  Trash2,
} from "lucide-react";

const NAV_ITEMS = [
  { key: "History", icon: History },
  { key: "Uploads", icon: Upload },
  { key: "Settings", icon: Settings },
];

const Sidebar = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
  onLogout,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");

  useEffect(() => {
    if (!editingId) {
      return;
    }

    const active = sessions.find((session) => session.id === editingId);
    if (active) {
      setDraftTitle(active.title);
    }
  }, [editingId, sessions]);

  const commitRename = () => {
    if (!editingId) {
      return;
    }

    const cleaned = draftTitle.trim();
    if (cleaned) {
      onRenameSession(editingId, cleaned);
    }
    setEditingId(null);
    setDraftTitle("");
  };

  return (
    <aside className="fused-panel hidden w-[220px] min-h-[88vh] flex-col rounded-3xl p-4 lg:flex">
      <div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-accent-gradient p-2 text-[#043d30] shadow-glass">
            <MessageSquareMore size={16} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-fused-text">FusedChat</h1>
            <p className="text-[11px] text-fused-muted">SASI AI Assistant</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-gradient px-3 py-2.5 text-sm font-semibold text-[#033a2c] shadow-glass transition hover:brightness-105"
        >
          <Plus size={15} />
          New Chat
        </button>
      </div>

      <div className="mt-5 flex-1 overflow-hidden">
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-fused-muted">Recent Chats</p>
        <div className="fused-scroll max-h-[42vh] space-y-1 overflow-y-auto pr-1">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                onDoubleClick={() => setEditingId(session.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  activeSessionId === session.id
                    ? "border-fused-accentStart/40 bg-fused-card/90"
                    : "border-transparent bg-fused-card/35 hover:border-fused-line/80"
                }`}
                title="Double-click to rename"
              >
                {editingId === session.id ? (
                  <input
                    value={draftTitle}
                    autoFocus
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitRename();
                      }
                      if (event.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    className="w-full rounded-md border border-fused-line/80 bg-fused-bg/50 px-2 py-1 text-xs text-fused-text outline-none"
                  />
                ) : (
                  <div>
                    <p className="line-clamp-2 text-xs font-medium text-fused-text">{session.title}</p>
                    <p className="mt-1 text-[11px] text-fused-muted">
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => onDeleteSession(session.id)}
                className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-fused-card/35 text-fused-muted transition hover:border-rose-400/45 hover:text-rose-200"
                title="Delete chat"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-fused-muted transition hover:bg-fused-card/60 hover:text-fused-text"
              >
                <Icon size={13} />
                <span>{item.key}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 border-t border-fused-line/70 pt-3">
        <div className="mb-2">
          <p className="text-xs font-medium text-fused-text">SASI Student</p>
          <p className="text-[11px] text-fused-muted">Connected Session</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-fused-line/80 bg-fused-card/45 px-3 py-2 text-xs text-fused-muted transition hover:border-rose-400/40 hover:text-rose-200"
        >
          <LogOut size={13} />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
