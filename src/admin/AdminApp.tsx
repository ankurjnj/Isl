import { useCallback, useEffect, useRef, useState } from "react";
import { VOCABULARY } from "@/content/vocabulary";
import type { Handedness, Attempt } from "@/landmarks/types";
import type { Sign, Exemplar, Provenance } from "@/content/schema";
import { putSign, putExemplar, allSigns, usableExemplarsFor } from "@/store/signs";
import { db } from "@/store/db";
import { extractAttempt, openExtractor, closeExtractor } from "./videoKeypoints";
import { publishPack, type PublishResult } from "./publish";
import type { Landmarkers } from "@/vision/landmarker";

/**
 * Content admin dashboard.
 *
 * Deliberately a SEPARATE entry point from the parent app: the learner bundle
 * must contain no upload path at all (SPEC Part 7 s11). Videos are processed
 * here in the browser and are never uploaded — only the keypoints are.
 *
 * There is no model to train. Signs are matched with DTW against exemplars
 * (Part 6.1), so extracting a video's keypoints IS the whole "training" step.
 */

type Take = { id: string; attempt: Attempt; fileName: string };
type LibraryRow = { sign: Sign; takes: number };

const TOKEN_KEY = "aangan.admin.token";

export function AdminApp() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [authed, setAuthed] = useState(false);

  if (!authed) {
    return (
      <TokenGate
        token={token}
        setToken={setToken}
        onEnter={() => {
          sessionStorage.setItem(TOKEN_KEY, token);
          setAuthed(true);
        }}
      />
    );
  }
  return <Dashboard token={token} />;
}

function TokenGate(props: {
  token: string;
  setToken: (t: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="admin admin--gate">
      <div className="card admin-card">
        <h1 className="admin-h1">Aangan — content admin</h1>
        <p className="admin-muted">
          Reference videos are processed in this browser. They are never uploaded — only
          the keypoints they produce.
        </p>
        <label className="admin-field">
          <span>Admin token</span>
          <input
            type="password"
            value={props.token}
            onChange={(e) => props.setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && props.token && props.onEnter()}
            autoFocus
          />
        </label>
        <button className="btn btn--primary" disabled={!props.token} onClick={props.onEnter}>
          Open dashboard
        </button>
      </div>
    </div>
  );
}

function Dashboard({ token }: { token: string }) {
  // Sign being built.
  const [vocabId, setVocabId] = useState(VOCABULARY[0]!.id);
  const [region, setRegion] = useState("Delhi");
  const [handedness, setHandedness] = useState<Handedness>("one_handed");
  const [signerName, setSignerName] = useState("");
  const [origin, setOrigin] = useState("ISLRTC");
  const [sourceUrl, setSourceUrl] = useState("https://islrtc.nic.in/");
  const [license, setLicense] = useState("");
  const [consentGranted, setConsentGranted] = useState(false);

  const [takes, setTakes] = useState<Take[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryRow[]>([]);
  const [published, setPublished] = useState<PublishResult | null>(null);
  const [reviewer, setReviewer] = useState("");

  const landmarkers = useRef<Landmarkers | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const vocab = VOCABULARY.find((v) => v.id === vocabId)!;

  const refreshLibrary = useCallback(async () => {
    const signs = await allSigns();
    const rows: LibraryRow[] = [];
    for (const sign of signs) {
      rows.push({ sign, takes: (await usableExemplarsFor(sign.id)).length });
    }
    rows.sort((a, b) => a.sign.english.localeCompare(b.sign.english));
    setLibrary(rows);
  }, []);

  useEffect(() => {
    void refreshLibrary();
    return () => {
      if (landmarkers.current) closeLandmarkersSafely(landmarkers.current);
    };
  }, [refreshLibrary]);

  async function onFiles(files: FileList) {
    setError(null);
    setNotice(null);
    try {
      if (!landmarkers.current) {
        setBusy("Loading the hand-tracking engine…");
        landmarkers.current = await openExtractor();
      }
      const added: Take[] = [];
      const rejected: string[] = [];
      for (const file of Array.from(files)) {
        const attempt = await extractAttempt(file, landmarkers.current, 25, (p) =>
          setBusy(`${file.name} — ${Math.round(p.ratio * 100)}%`),
        );
        // A take the tracker couldn't follow would poison every later
        // comparison, so it is refused rather than stored.
        if (attempt.quality.usable) {
          added.push({ id: crypto.randomUUID(), attempt, fileName: file.name });
        } else {
          rejected.push(file.name);
        }
      }
      setTakes((prev) => [...prev, ...added]);
      if (rejected.length) {
        setNotice(
          `Couldn't track the hands well enough in: ${rejected.join(", ")}. ` +
            `Use a clip where the signer's hands and shoulders are fully in frame.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const canSave = takes.length > 0 && signerName.trim() !== "" && consentGranted;

  async function saveSign() {
    if (!canSave) return;
    const empty = { en: "", hi: "" };
    const provenance: Provenance = {
      origin: origin.trim() || "unknown",
      url: sourceUrl.trim() || undefined,
      license: license.trim() || undefined,
      // An admin uploading is not the same as a Deaf signer confirming.
      review: "unreviewed",
    };
    const sign: Sign = {
      id: vocab.id,
      language: "isl",
      english: vocab.english,
      hindi: vocab.hindi,
      region: region.trim(),
      handedness,
      videoUrl: "",
      exemplars: takes.map((t) => t.id),
      tolerances: { handshape: 0.7, location: 0.7, movement: 0.7, orientation: 0.7 },
      // Authored per sign by a Deaf reviewer (Part 5.3) — never templated here.
      feedback: { handshape: empty, location: empty, movement: empty, orientation: empty },
      signer: { name: signerName.trim(), credit: `${signerName.trim()} · ${provenance.origin}` },
      unit: vocab.unit,
      provenance,
    };
    await putSign(sign);
    const date = new Date().toISOString();
    for (const t of takes) {
      const ex: Exemplar = {
        id: t.id,
        signId: sign.id,
        frames: t.attempt.frames,
        quality: t.attempt.quality,
        signerId: signerName.trim(),
        provenance,
        consent: { granted: true, scope: "prototype", date },
      };
      await putExemplar(ex);
    }
    setTakes([]);
    setNotice(`Saved ${vocab.english} with ${sign.exemplars.length} takes.`);
    await refreshLibrary();
  }

  async function toggleReview(row: LibraryRow) {
    const current = row.sign.provenance?.review;
    if (current !== "deaf_reviewed" && reviewer.trim() === "") {
      setError("Enter the reviewing Deaf signer's name before marking a sign reviewed.");
      return;
    }
    setError(null);
    const provenance: Provenance = {
      origin: row.sign.provenance?.origin ?? "studio",
      url: row.sign.provenance?.url,
      license: row.sign.provenance?.license,
      review: current === "deaf_reviewed" ? "unreviewed" : "deaf_reviewed",
    };
    await putSign({ ...row.sign, provenance });
    const exs = await db.exemplars.where("signId").equals(row.sign.id).toArray();
    for (const ex of exs) await putExemplar({ ...ex, provenance });
    await refreshLibrary();
  }

  async function doPublish() {
    setError(null);
    setBusy("Publishing…");
    try {
      setPublished(await publishPack(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const reviewedCount = library.filter((r) => r.sign.provenance?.review === "deaf_reviewed").length;

  return (
    <div className="admin">
      <header className="admin-top">
        <h1 className="admin-h1">Aangan — content admin</h1>
        <span className="admin-muted">
          {library.length} signs · {reviewedCount} Deaf-reviewed
        </span>
      </header>

      {busy && <div className="admin-banner admin-banner--busy">{busy}</div>}
      {error && <div className="admin-banner admin-banner--error">{error}</div>}
      {notice && <div className="admin-banner">{notice}</div>}

      <div className="admin-grid">
        <section className="card admin-card">
          <h2 className="admin-h2">1 · Add a sign</h2>

          <label className="admin-field">
            <span>Word</span>
            <select value={vocabId} onChange={(e) => setVocabId(e.target.value)}>
              {VOCABULARY.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.english} · {v.hindi} ({v.unit})
                </option>
              ))}
            </select>
          </label>

          <div className="admin-row">
            <label className="admin-field">
              <span>Region</span>
              <input value={region} onChange={(e) => setRegion(e.target.value)} />
            </label>
            <label className="admin-field">
              <span>Handedness</span>
              <select
                value={handedness}
                onChange={(e) => setHandedness(e.target.value as Handedness)}
              >
                <option value="one_handed">one-handed</option>
                <option value="symmetric">symmetric</option>
                <option value="asymmetric_two_handed">asymmetric two-handed</option>
              </select>
            </label>
          </div>

          <label className="admin-field">
            <span>Signer name (credited in the app)</span>
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>

          <div className="admin-row">
            <label className="admin-field">
              <span>Source</span>
              <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </label>
            <label className="admin-field">
              <span>Source URL</span>
              <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </label>
          </div>

          <label className="admin-field">
            <span>Licence / terms</span>
            <input
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="e.g. CC BY-NC 4.0, or the source's stated terms"
            />
          </label>

          <label className="admin-check">
            <input
              type="checkbox"
              checked={consentGranted}
              onChange={(e) => setConsentGranted(e.target.checked)}
            />
            <span>The signer consented to this use, or the source licence permits it.</span>
          </label>

          <h2 className="admin-h2">2 · Videos → keypoints</h2>
          <p className="admin-muted">
            Pick 3–5 clips of this one sign. Each becomes a take. The recognizer uses the
            median across takes, so one odd clip can’t skew it. Videos stay on this machine.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            multiple
            onChange={(e) => e.target.files && void onFiles(e.target.files)}
            disabled={busy !== null}
          />

          {takes.length > 0 && (
            <ul className="admin-takes">
              {takes.map((t) => (
                <li key={t.id}>
                  <span>{t.fileName}</span>
                  <span className="admin-ok">
                    tracked {Math.round(t.attempt.quality.meanHandConfidence * 100)}%
                  </span>
                  <button
                    className="admin-x"
                    onClick={() => setTakes((p) => p.filter((x) => x.id !== t.id))}
                    aria-label={`Remove ${t.fileName}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button className="btn btn--primary" disabled={!canSave} onClick={saveSign}>
            Save “{vocab.english}” ({takes.length} takes)
          </button>
        </section>

        <section className="card admin-card">
          <h2 className="admin-h2">3 · Library &amp; Deaf review</h2>
          <label className="admin-field">
            <span>Reviewing Deaf signer</span>
            <input
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Name of the person confirming these forms"
            />
          </label>

          {library.length === 0 && <p className="admin-muted">Nothing added yet.</p>}
          <ul className="admin-library">
            {library.map((row) => {
              const reviewed = row.sign.provenance?.review === "deaf_reviewed";
              return (
                <li key={row.sign.id}>
                  <span className="admin-lib-word">
                    {row.sign.english} <em>{row.sign.hindi}</em>
                  </span>
                  <span className="admin-muted">
                    {row.takes} takes · {row.sign.region}
                  </span>
                  <button
                    className={`admin-pill ${reviewed ? "admin-pill--ok" : ""}`}
                    onClick={() => void toggleReview(row)}
                  >
                    {reviewed ? "Deaf-reviewed" : "Unreviewed"}
                  </button>
                </li>
              );
            })}
          </ul>

          <h2 className="admin-h2">4 · Publish</h2>
          <p className="admin-muted">
            Sends the keypoint pack to storage. Every app fetches it on next open.
            Unreviewed signs are published too, and the app labels them as unreviewed.
          </p>
          <button className="btn btn--primary" disabled={busy !== null} onClick={doPublish}>
            Publish {library.length} signs
          </button>
          {published && (
            <p className="admin-ok">
              Published {published.signs} signs ({(published.bytes / 1e6).toFixed(2)} MB) at{" "}
              {new Date(published.publishedAt).toLocaleString()}.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function closeLandmarkersSafely(l: Landmarkers) {
  try {
    closeExtractor(l);
  } catch {
    /* already torn down */
  }
}
