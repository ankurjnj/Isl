import { useMemo, useRef, useState } from "react";
import { useAppStore } from "@/ui/store/appStore";
import { useStrings } from "@/ui/hooks/useStrings";
import { useRecorder } from "@/ui/hooks/useRecorder";
import { Button } from "@/ui/components/Button";
import { CameraView } from "@/ui/components/CameraView";
import { VOCABULARY } from "@/content/vocabulary";
import type { Handedness, Attempt } from "@/landmarks/types";
import type { Sign, Exemplar } from "@/content/schema";
import { putSign, putExemplar } from "@/store/signs";
import { exportPack, importPack, type ExemplarPack } from "@/store/pack";
import "./screens.css";

type KeptTake = { id: string; attempt: Attempt };

/**
 * Studio mode (Part 6 slice v0.3) — the tool that creates the data. Nothing
 * downstream exists without it. Until a Deaf ISL signer records here, the app's
 * vocabulary is empty, which is correct behaviour (Part 5.2, Part 7 §1).
 */
export function Studio() {
  const t = useStrings();
  const go = useAppStore((s) => s.go);
  const rec = useRecorder();

  const [vocabId, setVocabId] = useState(VOCABULARY[0]!.id);
  const vocab = useMemo(() => VOCABULARY.find((v) => v.id === vocabId)!, [vocabId]);
  const [region, setRegion] = useState("Delhi");
  const [handedness, setHandedness] = useState<Handedness>("one_handed");
  const [signerName, setSignerName] = useState("");
  const [consentScope, setConsentScope] = useState<"prototype" | "training">("prototype");
  const [consentGranted, setConsentGranted] = useState(false);
  const [takes, setTakes] = useState<KeptTake[]>([]);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const canKeep = rec.preview?.quality.usable === true;
  const canSave = takes.length > 0 && consentGranted && signerName.trim().length > 0;

  function keepTake() {
    if (!rec.preview || !canKeep) return;
    setTakes((prev) => [...prev, { id: crypto.randomUUID(), attempt: rec.preview! }]);
    rec.clearPreview();
    setSaved(false);
  }

  async function save() {
    if (!canSave) return;
    const signId = vocab.id;
    const empty = { en: "", hi: "" };
    // A real Sign — feedback copy stays empty here; it is authored per sign by a
    // Deaf reviewer (Part 5.3), never invented in the recording tool.
    const sign: Sign = {
      id: signId,
      language: "isl",
      english: vocab.english,
      hindi: vocab.hindi,
      region,
      handedness,
      videoUrl: "",
      exemplars: takes.map((k) => k.id),
      tolerances: { handshape: 0.7, location: 0.7, movement: 0.7, orientation: 0.7 },
      feedback: { handshape: empty, location: empty, movement: empty, orientation: empty },
      signer: { name: signerName.trim(), credit: signerName.trim() },
      unit: vocab.unit,
    };
    await putSign(sign);
    const date = new Date().toISOString();
    for (const k of takes) {
      const exemplar: Exemplar = {
        id: k.id,
        signId,
        frames: k.attempt.frames,
        quality: k.attempt.quality,
        signerId: signerName.trim(),
        consent: { granted: true, scope: consentScope, date },
      };
      await putExemplar(exemplar);
    }
    setTakes([]);
    setSaved(true);
  }

  async function doExport() {
    const pack = await exportPack();
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aangan-exemplars.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(file: File) {
    const text = await file.text();
    const pack = JSON.parse(text) as ExemplarPack;
    await importPack(pack);
    setSaved(true);
  }

  return (
    <div className="screen">
      <div className="app-header">
        <h1 style={{ fontFamily: "var(--font-body)", fontSize: "var(--t-title)" }}>
          {t.studio.title}
        </h1>
        <Button variant="quiet" onClick={() => go({ name: "home" })}>
          ←
        </Button>
      </div>

      <div className="screen__body">
        <div className="card studio-form">
          <label>
            <span>{t.studio.signLabel}</span>
            <select value={vocabId} onChange={(e) => setVocabId(e.target.value)}>
              {VOCABULARY.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.english} · {v.hindi} ({v.unit})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.studio.region}</span>
            <input value={region} onChange={(e) => setRegion(e.target.value)} />
          </label>
          <label>
            <span>{t.studio.handedness}</span>
            <select value={handedness} onChange={(e) => setHandedness(e.target.value as Handedness)}>
              <option value="one_handed">one-handed</option>
              <option value="symmetric">symmetric</option>
              <option value="asymmetric_two_handed">asymmetric two-handed</option>
            </select>
          </label>
          <label>
            <span>{t.studio.signerNameLabel}</span>
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>
          <label>
            <span>{t.studio.consentScope}</span>
            <select
              value={consentScope}
              onChange={(e) => setConsentScope(e.target.value as "prototype" | "training")}
            >
              <option value="prototype">prototype</option>
              <option value="training">training</option>
            </select>
          </label>
          <label className="studio-consent">
            <input
              type="checkbox"
              checked={consentGranted}
              onChange={(e) => setConsentGranted(e.target.checked)}
            />
            <span>{t.studio.consentLabel}</span>
          </label>
        </div>

        <CameraView enabled onFrame={rec.onFrame} dev />

        <div className="tracking-meter">
          <div className="tracking-meter__bar">
            <div className="tracking-meter__fill" style={{ width: `${Math.round(rec.liveLevel * 100)}%` }} />
          </div>
          <span>{rec.liveLevel > 0.5 ? t.learn.seeingYou : t.learn.cannotSeeYou}</span>
        </div>

        {rec.phase === "countdown" && (
          <div className="lamp__sign" style={{ textAlign: "center" }}>
            {rec.countdown > 0 ? rec.countdown : "•"}
          </div>
        )}

        {rec.phase === "preview" && rec.preview && (
          <div className={`feedback-card ${canKeep ? "feedback-card--got-it" : ""}`}>
            <p>
              {canKeep
                ? `${t.studio.keep}? (${(rec.preview.durationMs / 1000).toFixed(1)}s)`
                : t.studio.takeUnusable}
            </p>
            <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
              {canKeep && <Button onClick={keepTake}>{t.studio.keep}</Button>}
              <Button variant="quiet" onClick={rec.clearPreview}>
                {t.studio.discard}
              </Button>
            </div>
          </div>
        )}

        <div className="section-label">
          <span>{t.studio.takes}</span>
          <span className="section-count">{takes.length} / 5</span>
        </div>

        {saved && <p className="privacy-note">{t.studio.saved}</p>}

        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
          }}
        />
      </div>

      <div className="action-bar">
        {rec.phase === "recording" ? (
          <Button onClick={rec.stop}>{t.studio.stop}</Button>
        ) : (
          <Button onClick={rec.start} disabled={rec.phase === "countdown"}>
            {t.studio.record}
          </Button>
        )}
        <div style={{ display: "flex", gap: "var(--s-3)" }}>
          <Button variant="quiet" onClick={save} disabled={!canSave}>
            {t.studio.save}
          </Button>
          <Button variant="quiet" onClick={doExport}>
            {t.studio.exportPack}
          </Button>
          <Button variant="quiet" onClick={() => fileInput.current?.click()}>
            {t.studio.importPack}
          </Button>
        </div>
      </div>
    </div>
  );
}
