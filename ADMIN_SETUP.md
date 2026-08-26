# Admin dashboard — setup

The content pipeline. An admin adds signs from reference videos and publishes
them; every parent's app picks them up on next open.

**There is no model training and no training bill.** Aangan matches signs with
DTW against recorded exemplars (SPEC Part 6.1), so extracting a video's
keypoints *is* the whole "training" step — and that runs in the admin's own
browser. Expect to pay **$0/month**.

```
  admin browser                    edge fn            R2 bucket        parent app
  ─────────────                    ───────            ─────────        ──────────
  pick video ─┐
              ├─► MediaPipe ─► keypoints ─POST──► /api/publish ─PUT─► pack.json ──fetch──► IndexedDB
  video stays ┘   (free, local)   (~5 MB)         (holds R2 keys)    (free egress)   (offline after)
  on this machine
```

The videos never leave the admin's machine. Only keypoints are published.

---

## 1. Cloudflare R2 (storage) — free

1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `aangan-content`).
2. **Manage R2 API Tokens** → create a token with **Object Read & Write** scoped
   to that bucket. Save the Access Key ID and Secret Access Key.
3. Bucket → **Settings** → enable a public URL (r2.dev) or attach a custom
   domain. Note the public base URL.

Free tier: 10 GB storage, 1M/10M ops, **no egress charges**. A 20-sign pack is
about 5 MB, so this stays free indefinitely.

## 2. Vercel environment variables

Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `ADMIN_TOKEN` | a long random string you invent — the dashboard password |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | from step 1.2 |
| `R2_SECRET_ACCESS_KEY` | from step 1.2 |
| `R2_BUCKET` | e.g. `aangan-content` |
| `VITE_PACK_URL` | public pack URL, e.g. `https://pub-xxxx.r2.dev/pack.json` |

Generate a token with `openssl rand -hex 32`. Only `VITE_PACK_URL` reaches the
browser — the `R2_*` secrets stay server-side in the edge function.

## 3. Let the parent app read the pack

`VITE_PACK_URL` is fetched cross-origin, so **add a CORS rule** on the bucket
(R2 → Settings → CORS Policy):

```json
[{ "AllowedOrigins": ["https://your-app.vercel.app"],
   "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
```

Prefer to avoid CORS entirely? Leave `VITE_PACK_URL` unset (it defaults to
`/pack.json`) and add a same-origin proxy rewrite in `vercel.json`:

```json
{ "source": "/pack.json", "destination": "https://pub-xxxx.r2.dev/pack.json" }
```

That serves the pack through Vercel instead — simpler, but it uses Vercel
bandwidth rather than R2's free egress.

---

## Using it

Go to **`/admin`** and enter your `ADMIN_TOKEN`.

1. **Add a sign** — pick the word, set region (ISL varies by region and the app
   shows the tag), handedness, the signer's name, and where the footage came
   from with its licence.
2. **Videos → keypoints** — select 3–5 clips of that one sign. Each becomes a
   take; the recognizer uses the **median** across takes, so one odd clip can't
   skew it. Clips where the hands can't be tracked are refused rather than
   stored, because a bad exemplar poisons every later comparison.
3. **Save**, repeat for each word.
4. **Deaf review** — enter the reviewing signer's name, then flip each sign from
   *Unreviewed* to *Deaf-reviewed*. Everything starts unreviewed: an admin
   uploading is not the same as a Deaf signer confirming, and the parent app
   shows an "unreviewed" note on screen until this is done.
5. **Publish** — pushes the pack to R2. Parents get it on next open, then work
   offline from IndexedDB.

Where to get footage: see [CONTENT_SOURCES.md](CONTENT_SOURCES.md). ISLRTC's
official dictionary is the right source — every video in it is signed by Deaf
signers.

## Two boundaries the code enforces

- **The parent app has no upload path.** The dashboard is a separate Vite entry
  (`admin.html`), and an ESLint rule blocks `src/ui/**` and `src/vision/**` from
  importing `src/admin/**`, so upload code can't drift into the learner bundle.
  Verified in the build: `api/publish`, the auth header and the token key appear
  only in `admin-*.js`.
- **Feedback copy is never generated.** The one-sentence correction shown per
  component is authored per sign by a Deaf reviewer (Part 5.3). The dashboard
  saves it empty rather than templating it.

## Costs

| | Free tier | 20 signs uses |
|---|---|---|
| R2 storage | 10 GB | ~5 MB |
| R2 egress | unlimited, free | — |
| Vercel edge fn | generous free tier | a few calls per publish |
| Supabase | not used | — |

Budget better spent on the Deaf signer, who the spec says should be **paid and
credited by name in the app**, than on infrastructure.
