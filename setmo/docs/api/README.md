# SetMo Partner API — integration guide

This guide is for a partner's engineers. It shows how to run SetMo practice calls inside your own app:
1. Your server creates a call.
2. Your page shows the call in an iframe.
3. SetMo sends the results to your server.

The machine-readable reference is [`openapi.yaml`](./openapi.yaml).

- **Base URL:** `https://setmo.growdental.ai/api/v1`
- **Format:** JSON in and out. Field names are `snake_case`. Times are ISO 8601 in UTC.

## 1. Keys and modes

SetMo gives you two kinds of key:

| Key | Prefix | What it touches |
|---|---|---|
| Test | `setmo_test_…` | Test locations, test trainees and a free test wallet. Nothing is billed, and test data never mixes with live data. |
| Live | `setmo_live_…` | Your real locations and trainees. Calls draw from your live token wallet. |

Send the key on every request:

```http
Authorization: Bearer setmo_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Keys are for your **server only**. Never put one in a browser, a mobile app or a repository. The SetMo team issues and revokes keys; ask them for a new one if a key leaks.

**Rate limits:**
- 300 requests a minute per key.
- 120 new sessions a minute.

Over the limit you get `429` with a `Retry-After` header (seconds).

## 2. Errors

Every error has the same shape:

```json
{ "error": { "code": "insufficient_tokens", "message": "The practice token balance is used up, so new calls can't start until more tokens are added." } }
```

Branch on `code`. `message` is safe to show to a person.

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `invalid_json` | The body isn't valid JSON. |
| 401 | `unauthorized` | No key, a wrong key, or a revoked key. |
| 402 | `insufficient_tokens` | The wallet for this key's mode is empty. Show your out-of-credits screen. |
| 403 | `partner_disabled` | API access is switched off for your account. |
| 403 | `test_mode_only` | `simulate` needs a test key. |
| 404 | `location_not_found` / `trainee_not_found` / `session_not_found` | No such id for your account in this mode. |
| 409 | `reference_conflict` | You reused a `reference` for a different trainee, location or call type. |
| 409 | `session_already_started` | You can only simulate a session that hasn't started. |
| 413 | `payload_too_large` | The body is over 64 KB. |
| 422 | `invalid_request` | A field is missing or wrong. The message names the field. |
| 422 | `invalid_lead` | That "pick your lead" choice doesn't exist for this call type. |
| 422 | `call_type_unavailable` | That call type is off at this location. |
| 429 | `rate_limited` | Slow down. See `Retry-After`. |
| 500 | `server_error` | SetMo's side failed. It's logged; retry. |

## 3. Call types

`GET /call-types` lists the six call types:

| `key` | Name |
|---|---|
| `IMPLANT` | Implants & full-arch |
| `DENTURE` | Dentures & snap-in |
| `COSMETIC` | Cosmetic & veneers |
| `ORTHO` | Ortho & Invisalign |
| `WISDOM` | Wisdom teeth |
| `GENERAL` | New patients & hygiene |

Each call type in the response has:
- `status`: `live`, `beta` or `coming_soon`.
- `skills`: the 8 skills it is scored on. Each skill has a fixed `key` you can store, and a `type` of `universal` (shared by every call type) or `call_type` (specific to this one).
- `lead_options`: what you can pick about the lead (see 5).

The response also has `challenges`: `adaptive`, `warm` and `tough`.

## 4. Locations and trainees

You use your **own** ids for practices (locations) and people (trainees). Ids are 1–100 characters: letters, digits, `.`, `_`, `:` and `-`. You don't need to store SetMo's ids.

**Location.** `PUT /locations/{id}` creates the location, or updates only the fields you send:

```json
{
  "name": "Smile Dental — Boise",
  "city": "Boise",
  "doctor_name": "Dr. Patel",
  "offer": "Free implant consultation with 3D scan",
  "appointment": "a 45-minute consultation with the doctor",
  "deposit": "No deposit required",
  "call_types": ["IMPLANT", "GENERAL"]
}
```

- `name` is required when you create a location.
- `call_types` sets exactly which call types the location runs. A new location runs all six unless you say otherwise.
- `doctor_name` lets the AI lead use the practice's real doctor when the doctor comes up.

**Trainee.** `PUT /trainees/{id}` with `{ "first_name": "Jess", "last_name": "Lee", "location_id": "loc_123" }`.
- `location_id` is required when you create a trainee.
- Trainees have no SetMo login and never get email from SetMo.

You can skip both calls: `POST /sessions` accepts the location and trainee inline and creates or updates them (see 5).

## 5. Start a call

`POST /sessions`:

```json
{
  "reference": "attempt_8812",
  "location": { "id": "loc_123", "name": "Smile Dental — Boise", "doctor_name": "Dr. Patel" },
  "trainee": { "id": "user_77", "first_name": "Jess", "last_name": "Lee" },
  "call_type": "IMPLANT",
  "challenge": "adaptive",
  "lead": { "gender": "female", "age": "60s", "concern": "cost" },
  "metadata": { "form_id": "F-1029" }
}
```

**`reference`** is your id for this attempt. Send it every time:
- Repeat the same request, for example after a timeout, and you get the same session back (`200`).
- Reuse a reference for something different and you get `409`.

**`location` and `trainee`:**
- With only `id`, the record must already exist.
- With more fields, it is created or updated first.

**`challenge`:**
- `adaptive` (the default) starts at the trainee's level and rises as they improve.
- `warm` is receptive.
- `tough` is guarded.

**`lead`** is optional ("surprise me" if left out). Pick values from that call type's `lead_options`:
- `gender`: `female` or `male`.
- `age`: implant calls only, for example `60s`.
- `caller`: the other call types, for example `PARENT`.
- `concern`: what's worrying them.

Some combinations don't go together. `concerns_by_age` and `concerns_by_caller` say which ones do.

**`metadata`** is up to 20 keys and 2 KB of your own data. It comes back on every response and webhook.

The response is `201` with the [session object](#9-the-session-object) plus a launch link:

```json
{
  "id": "a28d62a0-53da-42bd-8e43-6b9a46f7fc80",
  "object": "session",
  "status": "created",
  "launch": { "url": "https://setmo.growdental.ai/embed/…", "expires_at": "2026-11-03T18:55:24.974Z" }
}
```

**Errors to handle:**
- `402 insufficient_tokens`: show your out-of-credits screen.
- `422 call_type_unavailable`.
- `422 invalid_lead`.

## 6. Show the call (iframe)

Put the launch link in an iframe that allows the microphone:

```html
<iframe src="LAUNCH_URL" allow="microphone" style="width:100%;height:760px;border:0"></iframe>
```

**Rules:**
- **A launch link opens once and expires after 10 minutes.** If the frame reloads, or you want to show a finished call's results again, get a fresh link with `POST /sessions/{id}/launch`.
- **Only your registered sites can show the frame.** Give the SetMo team every origin that will host it, for example `https://app.yourcompany.com`. In test mode, `http://localhost:<port>` is allowed for development. Any other site sees a blank frame.
- No cookies or SetMo login are involved. The page authenticates itself from the launch link.

**What the trainee sees in the frame:**
1. The lead card.
2. "Allow mic & start call".
3. The live call.
4. "Scoring your call…" (about a minute).
5. The results, in place: the score, likely-to-show %, who the lead really was, the 8 skills, what they nailed, where to grow, and "try instead" phrases.

The screen is dark, with your accent color on buttons and highlights; send the SetMo team your hex color. Headphones work best on phones.

### Messages from the frame

The frame posts messages to your page, only to your registered origins:

```js
window.addEventListener("message", (e) => {
  if (e.origin !== "https://setmo.growdental.ai" || e.data?.source !== "setmo") return;
  // e.data = { source: "setmo", type, sessionId, ...details }
});
```

| `type` | When |
|---|---|
| `ready` | The frame loaded. |
| `lead.ready` | The lead card is showing. |
| `call.started` | The call connected. |
| `call.dropped` | The connection was lost mid-call. The trainee is offered feedback on what they had. |
| `call.ended` | The call ended (hung up, time limit, or the trainee ended it). |
| `mic.denied` | The browser blocked the microphone. The frame shows how to fix it. |
| `results.ready` | The results are showing in the frame. |
| `call.failed` | The call couldn't be scored. `reason` is `no-transcript` or `scoring`. |
| `error` | Something went wrong. `message` says what. |

To end a live call from your page, for example from your own End button:

```js
iframe.contentWindow.postMessage({ type: "setmo:end-call" }, "https://setmo.growdental.ai");
```

Your server learns the outcome from webhooks (next section). The messages are for your page's UI only.

## 7. Webhooks

SetMo POSTs JSON events to the webhook URL you give the SetMo team. The URL must be public https; for local testing, a tunnel such as ngrok works.

| Event | When |
|---|---|
| `session.started` | The trainee's call connected. |
| `session.ended` | The call ended. `duration_seconds` and `tokens_used` are known. |
| `session.completed` | The call was scored. `result` is filled in. |
| `session.failed` | The call can't be scored. See `failure_reason` below. |

Values of `failure_reason` in `session.failed`:
- `too_short`: under a minute, or only a line or two from the trainee.
- `no_transcript`: the call never reached SetMo.
- `scoring_failed`: scoring failed after retries.
- `abandoned`: created but never started within 24 hours.

A call normally sends `started`, then `ended`, then `completed` or `failed`. Scoring takes about a minute after hang-up.

**Body:**

```json
{
  "id": "evt_6f2c…",
  "object": "event",
  "type": "session.completed",
  "created": "2026-11-03T18:44:31.000Z",
  "mode": "live",
  "data": { "session": { …the session object… } }
}
```

**Headers:**

| Header | |
|---|---|
| `X-Setmo-Event-Id` | Same as `id`. It stays the same across retries, so dedupe on it. |
| `X-Setmo-Event-Type` | Same as `type`. |
| `X-Setmo-Timestamp` | Unix seconds when this attempt was signed. |
| `X-Setmo-Signature` | `sha256=` + hex HMAC-SHA256 of `"<timestamp>.<raw body>"`, keyed with your webhook secret (`whsec_…`, from the SetMo team). |

**Verify every webhook.** Use the raw body, compare in constant time, and reject old timestamps:

```js
import crypto from "node:crypto";

function verifySetmo(rawBody, headers, secret) {
  const ts = headers["x-setmo-timestamp"];
  const sig = headers["x-setmo-signature"] ?? "";
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // older than 5 minutes
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

**Responding and retries:**
- Answer with any `2xx` within 10 seconds. Do slow work after you respond.
- Anything else is retried after about 1 minute, 5 minutes, 15 minutes, 1 hour, 3 hours, 6 hours and 12 hours, then marked failed. The SetMo team can re-send any event.
- Events can arrive more than once, and rarely out of order. Use the session's `status` as the source of truth, and call `GET /sessions/{id}` if you're unsure.

## 8. Get a call

`GET /sessions/{id}` returns the session object at any time, with `result` once it's scored.

Completed calls include `recording.url`, a signed link to the audio (MP3) that **works for one hour**. Copy the file if you want to keep it, or call this endpoint again for a fresh link. Webhooks carry a fresh link at the time they are sent.

## 9. The session object

```json
{
  "id": "a28d62a0-…",
  "object": "session",
  "mode": "live",
  "reference": "attempt_8812",
  "metadata": { "form_id": "F-1029" },
  "status": "completed",
  "failure_reason": null,
  "call_type": "IMPLANT",
  "call_type_name": "Implants & full-arch",
  "challenge": "adaptive",
  "lead_choice": { "gender": "female", "age": "60s", "caller": null, "concern": "cost" },
  "location": { "id": "loc_123", "name": "Smile Dental — Boise" },
  "trainee": { "id": "user_77", "first_name": "Jess", "last_name": "Lee" },
  "created_at": "…", "started_at": "…", "ended_at": "…", "completed_at": "…",
  "duration_seconds": 312,
  "tokens_used": 52,
  "recording": { "url": "https://…", "expires_at": "…" },
  "result": {
    "score": 3.6,
    "score_pct": 72,
    "appointment_set": true,
    "likely_to_show_pct": 58,
    "summary": "Booked Linda for Thursday at 2 by tying the visit to her daughter's wedding…",
    "skills": [
      { "key": "rapport", "name": "Rapport & warmth", "type": "universal", "score": 4.2, "score_pct": 84, "note": "…" }
    ],
    "wins": ["…"],
    "growth": ["…"],
    "phrases": [{ "you_said": "…", "try_instead": "…" }],
    "coaching": "…",
    "next_step": "…",
    "lead": { "name": "Linda Hayes", "age": 62, "for_whom": null, "situation": "…", "real_reason": "…", "hesitation": "…", "tone": "…", "difficulty": "Warm lead" },
    "reveal": { "found_real_reason": "yes", "found_note": "…", "handled_hesitation": "partly", "handled_note": "…" },
    "transcript": [{ "speaker": "trainee", "text": "…", "at_seconds": 3 }]
  }
}
```

**`status`:**

| Value | Meaning |
|---|---|
| `created` | Not started. |
| `in_progress` | On the call. |
| `ended` | Hung up, waiting for the score. |
| `completed` | Scored; `result` is set. |
| `failed` | See `failure_reason`. |

**Scores:**
- `score` is SetMo's 1–5 overall score, rated as a whole, not an average of the skills.
- `score_pct` is the same score on 0–100 (`score / 5 × 100`). Skills have both forms too.
- `appointment_set` says whether the lead agreed to an appointment on the call.
- `likely_to_show_pct` is SetMo's estimate that the booked appointment shows.

**`reveal`:**
- `found_real_reason`: `yes`, `partly` or `no`.
- `handled_hesitation`: `yes`, `partly`, `no` or `not_raised`.

**`skills[].key`** is fixed per call type. See `GET /call-types`.

## 10. Tokens and the wallet

Calls draw from your token wallet:
- **1 token = 6 seconds** of practice call. A typical call is about 6–7 minutes, or roughly 65 tokens.
- Calls marked failed for `no_transcript`, `scoring_failed` or `abandoned` cost nothing. A `too_short` call uses the few tokens it ran.

`GET /wallet` returns `balance_tokens` and `can_start_calls`. A call needs at least a minute left to start; a call already under way always finishes. SetMo emails your admins when the live wallet runs low and when it's empty. Test and live wallets are separate, and test tokens are free.

## 11. Testing without a microphone

With a test key, `POST /sessions/{id}/simulate` plays a session that hasn't started through its whole life in about ten seconds. It sends the same webhooks a real call would, with a made-up lead, transcript and score. No voice call or microphone is needed.

```json
{ "outcome": "completed" }
```

`outcome` is one of:
- `completed`: started → ended → completed, with a full `result`.
- `too_short`: started → ended → failed (`too_short`).
- `no_transcript`: failed (`no_transcript`).

Simulated calls use test tokens like real ones. Ask the SetMo team for more test tokens any time.

## 12. Checklist for going live

1. Ask the SetMo team for:
   - a live key;
   - live tokens in your wallet;
   - your live webhook URL and its secret;
   - your live site origins;
   - your accent color.
2. Verify every webhook signature, and dedupe on `X-Setmo-Event-Id`.
3. Always send `reference` when you create a session.
4. Handle `402 insufficient_tokens` (out of credits) and `mic.denied` in your UI.
5. Get a fresh launch link whenever the frame reloads.
