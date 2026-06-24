"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";

type Training = {
  id: string;
  title: string;
  description: string;
  type: "VIDEO" | "WORKBOOK";
  category: "SETTER" | "OPERATIONS";
  targetSkillKey: string;
  length: number;
  status: "DRAFT" | "PUBLISHED";
  assetRef: string;
  thumbRef: string;
};
type Skill = { key: string; name: string };

const isLink = (ref: string) => /^https?:\/\//i.test(ref);
const assetLabel = (ref: string) => (!ref ? "No asset" : isLink(ref) ? "Linked" : "Uploaded");

// Render a PDF's first page to a JPEG thumbnail (best-effort, browser-side).
async function generatePdfThumb(file: File): Promise<File | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 800 / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob ? new File([blob], "thumb.jpg", { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
}

// Upload a file directly to storage via a signed URL; returns the stored path.
async function uploadTrainingFile(trainingId: string, f: File): Promise<string> {
  const up = await fetch(`/api/platform/trainings/upload-url`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trainingId, filename: f.name }) });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok || !uj.token) throw new Error(uj.error ?? "Couldn't start the upload.");
  const supabase = createClient();
  const { error } = await supabase.storage.from(uj.bucket).uploadToSignedUrl(uj.path, uj.token, f, { contentType: f.type || undefined });
  if (error) throw new Error(error.message);
  return uj.path as string;
}

function TrainingForm({ initial, skills, onClose }: { initial: Training | null; skills: Skill[]; onClose: () => void }) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<"VIDEO" | "WORKBOOK">(initial?.type ?? "VIDEO");
  const [category, setCategory] = useState<"SETTER" | "OPERATIONS">(initial?.category ?? "SETTER");
  const [skillKey, setSkillKey] = useState(initial?.targetSkillKey ?? "");
  const [length, setLength] = useState(String(initial?.length ?? 0));
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">(initial?.status ?? "DRAFT");
  const [assetMode, setAssetMode] = useState<"upload" | "link">(initial && isLink(initial.assetRef) ? "link" : "upload");
  const [link, setLink] = useState(initial && isLink(initial.assetRef) ? initial.assetRef : "");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const linkAllowed = type === "VIDEO"; // workbooks are PDF uploads
  const effectiveMode = linkAllowed ? assetMode : "upload";

  async function save() {
    setErr(null);
    if (title.trim().length < 2) { setErr("Give it a title."); return; }
    setBusy(true);
    try {
      const meta = {
        title: title.trim(),
        description: description.trim() || null,
        type,
        category,
        targetSkillKey: skillKey || null,
        length: Number(length) || 0,
        status,
      };
      // assetRef: set from link now; uploads set it after the file lands.
      const assetRef = effectiveMode === "link" ? (link.trim() || null) : undefined;

      let id = initial?.id;
      if (id) {
        await fetch(`/api/platform/trainings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...meta, ...(assetRef !== undefined ? { assetRef } : {}) }) });
      } else {
        const res = await fetch(`/api/platform/trainings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...meta, ...(assetRef !== undefined ? { assetRef } : {}) }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.id) throw new Error(j.error ?? "Couldn't save the training.");
        id = j.id;
      }

      if (effectiveMode === "upload" && file && id) {
        setStage("Uploading file…");
        const path = await uploadTrainingFile(id, file);
        await fetch(`/api/platform/trainings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetRef: path }) });
      }
      // Thumbnail: manual upload, else auto-generate from a PDF's first page.
      let thumbToUpload: File | null = thumbFile;
      if (!thumbToUpload && type === "WORKBOOK" && effectiveMode === "upload" && file) {
        setStage("Generating thumbnail…");
        thumbToUpload = await generatePdfThumb(file);
      }
      if (thumbToUpload && id) {
        setStage("Uploading thumbnail…");
        const tpath = await uploadTrainingFile(id, thumbToUpload);
        await fetch(`/api/platform/trainings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ thumbRef: tpath }) });
      }

      router.refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
      setStage("");
    }
  }

  return (
    <ModalShell onClose={onClose} width={560}>
      <div className="card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <h2 style={{ fontSize: 22 }}>{editing ? "Edit training" : "New training"}</h2>
          <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>

        {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}

        <div className="field">
          <label>Collection</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={"btn " + (category === "SETTER" ? "btn-primary" : "btn-ghost")} style={{ flex: 1 }} onClick={() => setCategory("SETTER")}>Setter training</button>
            <button type="button" className={"btn " + (category === "OPERATIONS" ? "btn-primary" : "btn-ghost")} style={{ flex: 1 }} onClick={() => setCategory("OPERATIONS")}>Operations asset</button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{category === "SETTER" ? "Shown to setters on Trainings, tied to a skill." : "An operations tool/resource shown to office & group admins on Resources."}</p>
        </div>

        <div className="field">
          <label>Format</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={"btn " + (type === "VIDEO" ? "btn-primary" : "btn-ghost")} style={{ flex: 1 }} onClick={() => setType("VIDEO")}>Video</button>
            <button type="button" className={"btn " + (type === "WORKBOOK" ? "btn-primary" : "btn-ghost")} style={{ flex: 1 }} onClick={() => setType("WORKBOOK")}>{category === "OPERATIONS" ? "PDF / document" : "Workbook (PDF)"}</button>
          </div>
        </div>

        <div className="field"><label htmlFor="t-title">Title</label><input id="t-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category === "OPERATIONS" ? "Front-desk phone script" : "Objection handling: the spouse stall"} /></div>
        <div className="field"><label htmlFor="t-desc">Description</label><textarea id="t-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it covers." /></div>

        <div style={{ display: "flex", gap: 12 }}>
          {category === "SETTER" && (
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="t-skill">Targets skill</label>
              <select id="t-skill" className="input" value={skillKey} onChange={(e) => setSkillKey(e.target.value)}>
                <option value="">All skills</option>
                {skills.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="field" style={{ width: category === "SETTER" ? 130 : "100%" }}>
            <label htmlFor="t-len">{type === "VIDEO" ? "Minutes" : "Pages"}</label>
            <input id="t-len" className="input" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>
        </div>

        {/* asset */}
        <div className="field">
          <label>{type === "VIDEO" ? "Video" : "Workbook PDF"}</label>
          {linkAllowed && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button type="button" className={"btn " + (assetMode === "upload" ? "btn-primary" : "btn-ghost")} style={{ flex: 1, padding: "8px 12px", fontSize: 13.5 }} onClick={() => setAssetMode("upload")}>Upload a file</button>
              <button type="button" className={"btn " + (assetMode === "link" ? "btn-primary" : "btn-ghost")} style={{ flex: 1, padding: "8px 12px", fontSize: 13.5 }} onClick={() => setAssetMode("link")}>Use a link</button>
            </div>
          )}
          {effectiveMode === "link" ? (
            <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://vimeo.com/… or YouTube / Loom link" />
          ) : (
            <>
              <input ref={fileInputRef} type="file" accept={type === "VIDEO" ? "video/*" : "application/pdf"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: "none" }} onClick={() => fileInputRef.current?.click()}>
                  <Icon name="doc" size={15} /> Choose {type === "VIDEO" ? "video" : "PDF"}
                </button>
                <span className="muted" style={{ fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file ? file.name : initial?.assetRef && !isLink(initial.assetRef) ? "A file is already uploaded — choose to replace" : "No file chosen"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* optional thumbnail */}
        <div className="field">
          <label>Thumbnail <span className="muted" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
          <input ref={thumbInputRef} type="file" accept="image/*" onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: "none" }} onClick={() => thumbInputRef.current?.click()}>
              <Icon name="doc" size={15} /> Choose image
            </button>
            <span className="muted" style={{ fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {thumbFile ? thumbFile.name : initial?.thumbRef ? "A thumbnail is set — choose to replace" : type === "VIDEO" ? "Uploaded videos auto-use their first frame" : "Auto-generated from page 1 — or choose your own"}
            </span>
          </div>
        </div>

        <div className="field">
          <label>Status</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={"btn " + (status === "DRAFT" ? "btn-primary" : "btn-ghost")} style={{ flex: 1 }} onClick={() => setStatus("DRAFT")}>Draft</button>
            <button type="button" className={"btn " + (status === "PUBLISHED" ? "btn-primary" : "btn-ghost")} style={{ flex: 1 }} onClick={() => setStatus("PUBLISHED")}>Published</button>
          </div>
        </div>

        <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={save} style={{ marginTop: 8 }}>
          {busy ? (stage || "Saving…") : editing ? "Save changes" : "Create training"}
        </button>
      </div>
    </ModalShell>
  );
}

export function TrainingsAdmin({ trainings, skills }: { trainings: Training[]; skills: Skill[] }) {
  const router = useRouter();
  const [form, setForm] = useState<{ initial: Training | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const nameOf = (key: string) => skills.find((s) => s.key === key)?.name ?? "All skills";

  async function patch(id: string, body: object) {
    setBusyId(id);
    try {
      await fetch(`/api/platform/trainings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }
  async function remove(id: string) {
    if (!confirm("Delete this training? This can't be undone.")) return;
    setBusyId(id);
    try {
      await fetch(`/api/platform/trainings/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => setForm({ initial: null })}><Icon name="book" size={16} /> New training</button>
      </div>

      <div className="card rise" style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 720 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.4fr", gap: 14, padding: "12px 20px", borderBottom: "1px solid var(--line)", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)" }}>
            <div>Title</div><div>Format</div><div>Collection</div><div>Asset</div><div>Status / actions</div>
          </div>
          {trainings.length === 0 && <div className="card-pad muted" style={{ fontSize: 14 }}>No trainings yet — create your first one.</div>}
          {trainings.map((t, i) => (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.4fr", gap: 14, alignItems: "center", padding: "14px 20px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>{t.length} {t.type === "VIDEO" ? "min" : "pp"}</div>
              </div>
              <div><span className="chip" style={{ padding: "2px 9px", fontSize: 11 }}>{t.type === "VIDEO" ? "Video" : "PDF"}</span></div>
              <div className="muted" style={{ fontSize: 13 }}>{t.category === "OPERATIONS" ? "Operations" : nameOf(t.targetSkillKey)}</div>
              <div><span className={"chip " + (t.assetRef ? "mint" : "amber")} style={{ padding: "2px 9px", fontSize: 11 }}>{assetLabel(t.assetRef)}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={"chip " + (t.status === "PUBLISHED" ? "mint" : "")} style={{ padding: "2px 9px", fontSize: 11 }}>{t.status === "PUBLISHED" ? "Published" : "Draft"}</span>
                <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12.5 }} disabled={busyId === t.id} onClick={() => setForm({ initial: t })}>Edit</button>
                <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12.5 }} disabled={busyId === t.id} onClick={() => patch(t.id, { status: t.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" })}>
                  {t.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </button>
                <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12.5, color: "var(--amber)" }} disabled={busyId === t.id} onClick={() => remove(t.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {form && <TrainingForm initial={form.initial} skills={skills} onClose={() => setForm(null)} />}
    </>
  );
}
