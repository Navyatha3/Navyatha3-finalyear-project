import React from "react";
import { BookMarked, FileText } from "lucide-react";

const CitationPanel = ({ citations = [], activeDocument, lastRoutedBrain }) => {
  return (
    <section className="fused-panel rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookMarked size={16} className="text-fused-accentStart" />
        <h3 className="text-sm font-semibold text-fused-text">Citations</h3>
      </div>

      {!activeDocument && (
        <p className="text-xs leading-5 text-fused-muted">
          Upload a PDF to enable document citations and page references.
        </p>
      )}

      {activeDocument && !citations.length && (
        <p className="text-xs leading-5 text-fused-muted">
          {lastRoutedBrain === "Document"
            ? "No citations were returned for the latest response."
            : "Citations appear when Document Brain answers your query."}
        </p>
      )}

      {!!citations.length && (
        <div className="fused-scroll max-h-64 space-y-2 overflow-y-auto pr-1">
          {citations.map((citation, index) => (
            <article
              key={`${citation.page || "p"}-${index}`}
              className="rounded-xl border border-fused-line/70 bg-fused-card/50 p-3"
            >
              <p className="mb-1 text-xs font-semibold text-fused-accentEnd">
                Page {citation.page || "N/A"}
              </p>
              <p className="line-clamp-2 text-xs leading-5 text-fused-muted">
                {citation.content || "No snippet available."}
              </p>
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-fused-text/75">
                <FileText size={12} />
                <span>Document Evidence</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default CitationPanel;
