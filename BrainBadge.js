import React from "react";
import { BookOpenCheck, Building2, FileText, Sparkles, AlertTriangle } from "lucide-react";

const BRAIN_STYLES = {
  Professional: {
    icon: BookOpenCheck,
    label: "Professional Brain",
    className: "bg-cyan-500/15 text-cyan-200 border-cyan-400/30",
  },
  Admin: {
    icon: Building2,
    label: "Admin Brain",
    className: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  },
  Document: {
    icon: FileText,
    label: "Document Brain",
    className: "bg-sky-500/15 text-sky-200 border-sky-400/30",
  },
  System: {
    icon: Sparkles,
    label: "System",
    className: "bg-indigo-500/15 text-indigo-200 border-indigo-400/30",
  },
  Error: {
    icon: AlertTriangle,
    label: "Error",
    className: "bg-rose-500/15 text-rose-200 border-rose-400/30",
  },
};

const BrainBadge = ({ brain = "Professional", compact = false }) => {
  const style = BRAIN_STYLES[brain] || BRAIN_STYLES.Professional;
  const Icon = style.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.className}`}
      title={style.label}
    >
      <Icon size={compact ? 13 : 14} />
      <span>{compact ? brain : style.label}</span>
    </span>
  );
};

export default BrainBadge;
