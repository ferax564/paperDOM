"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { isPreviewCurrent, previewTransaction, type TransactionPreview } from "./agent-api.ts";
import type { CanvasPage, PaperDOMDocument } from "./document-model.ts";

export function AgentReview({ document, pageId, initialPreview, onApply, onClose, renderPage }: {
  document: PaperDOMDocument;
  pageId: string;
  initialPreview?: TransactionPreview;
  onApply: (preview: TransactionPreview) => { ok: boolean; message?: string };
  onClose: () => void;
  renderPage: (page: CanvasPage) => ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState(() => JSON.stringify(initialPreview?.payload ?? {
    description: "Describe the proposed improvement",
    expectedRevision: document.revision,
    operations: [{ op: "patchPage", pageId, patch: { notes: "Add speaker notes here." } }],
  }, null, 2));
  const [preview, setPreview] = useState<TransactionPreview | undefined>(initialPreview);
  const [error, setError] = useState<string>();
  const [selectedPageId, setSelectedPageId] = useState(initialPreview?.changes[0]?.pageId ?? pageId);
  const stale = preview ? !isPreviewCurrent(document, preview) : false;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const close = () => { dialogRef.current?.close(); onClose(); };

  const runPreview = () => {
    try {
      const result = previewTransaction(document, JSON.parse(source), pageId);
      if (!result.ok) throw new Error(result.message);
      setPreview(result);
      setSelectedPageId(result.changes[0]?.pageId ?? pageId);
      setError(undefined);
    } catch (error) {
      setPreview(undefined);
      setError(error instanceof Error ? error.message : "Unable to preview this proposal.");
    }
  };
  const changedPages = preview ? [...new Set(preview.changes.map((change) => change.pageId))] : [];
  const currentPageId = changedPages.includes(selectedPageId) ? selectedPageId : changedPages[0];
  return <dialog ref={dialogRef} className="agent-review" aria-labelledby="agent-review-title" onCancel={close} onKeyDown={(event) => event.stopPropagation()}>
    <header className="review-heading"><div><span className="eyebrow">Human + agent authoring</span><h2 id="agent-review-title">Review proposed changes</h2><p>Preview the result, then accept the complete change set or reject it.</p></div><button onClick={close} aria-label="Close review">✕</button></header>
    <div className="review-body">
      <section className="review-source"><label htmlFor="agent-transaction">Transaction JSON</label><textarea id="agent-transaction" spellCheck={false} value={source} onChange={(event) => { setSource(event.target.value); setPreview(undefined); setError(undefined); }} />
        <button className="apply-json-button" onClick={runPreview}>Preview changes</button>
        {error && <p className="review-error" role="alert">{error}</p>}
      </section>
      <section className="review-result" aria-live="polite">
        {!preview ? <div className="review-empty"><h3>Inspect before you apply</h3><p>Paste a transaction to see changed pages, object differences, and layout warnings.</p><p>Your document stays as it is until you accept.</p></div> : <>
          <h3>{preview.payload.description || "Proposed document update"}</h3>
          <p>{preview.payload.actor ? `Proposed by ${preview.payload.actor.name} (${preview.payload.actor.type}) · ` : ""}Revision {preview.previousRevision} → {preview.revision}</p>
          {stale && <p className="review-error" role="alert">The document changed after this preview. Read the latest revision and preview a revised proposal before accepting.</p>}
          {changedPages.length > 0 && <><label className="review-page-select">Changed page<select aria-label="Preview page" value={currentPageId} onChange={(event) => setSelectedPageId(event.target.value)}>{changedPages.map((id) => <option key={id} value={id}>{(preview.document.pages.find((page) => page.id === id) ?? preview.before.pages.find((page) => page.id === id))?.name || id}</option>)}</select></label>
            <div className="review-comparison">{[{ label: "Before", document: preview.before }, { label: "After", document: preview.document }].map(({ label, document }) => {
              const page = document.pages.find((page) => page.id === currentPageId);
              const scale = page ? Math.min(300 / page.size.width, 190 / page.size.height) : 1;
              return <figure key={label}><figcaption>{label}</figcaption>{page ? <><div className="review-thumbnail" style={{ width: page.size.width * scale, height: page.size.height * scale }}><div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>{renderPage(page)}</div></div><p className="review-notes">Notes: {page.notes || "None"}</p></> : <div className="review-missing">Page {label === "Before" ? "will be created" : "will be deleted"}</div>}</figure>;
            })}</div></>}
          <h4>{preview.changes.length} changes</h4>
          <ul className="review-changes">{preview.changes.map((change, index) => <li key={index}><strong>{change.action}</strong> <code>{change.elementId ?? change.pageId}</code>{change.fields.length > 0 && ` · ${change.fields.join(", ")}`}</li>)}</ul>
          {preview.warnings.length > 0 && <><h4>Checks to review ({preview.warnings.length})</h4><ul className="review-warnings">{preview.warnings.map((warning, index) => <li key={index}>{warning.message} <code>{warning.pageId}</code></li>)}</ul></>}
        </>}
      </section>
    </div>
    <footer className="review-footer"><span>Accepted changes can be undone in the editor.</span><button onClick={close}>Reject / close</button><button className="apply-json-button" disabled={!preview || stale || !preview.changes.length} onClick={() => {
      if (!preview) return;
      const result = onApply(preview);
      if (result.ok) close(); else setError(result.message ?? "Unable to apply the proposal.");
    }}>Accept changes</button></footer>
  </dialog>;
}
