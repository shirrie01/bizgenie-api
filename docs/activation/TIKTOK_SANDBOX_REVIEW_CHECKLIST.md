# TikTok sandbox and developer-review preparation (BG-LAUNCH-006)

1 Nov 2026. **Nothing has been submitted to TikTok and no TikTok authorisation has been made.** TikTok's developer documentation is not reachable from the preparing session, so every TikTok-side requirement below is either (a) recorded by the founder or Codex from the portal or the founder-supplied excerpts in `docs/studio/BG_SOCIAL_001_TIKTOK_IMPLEMENTATION.md`, or (b) marked **confirm in the portal**. Do not treat (b) as TikTok's requirement until checked.

## 1. Where the TikTok app stands (from Issue #191, founder 31 Oct)
Done: developer organisation `BizGenie` (founder is Owner); app `BizGenie` created, production DRAFT; client key and secret generated (kept out of GitHub and chat); sandbox available; `getbizgenie.com` verified via DNS; Login Kit and Content Posting API selected; `video.upload` configured.
Outstanding: app icon and details (the approved 1024x1024 PNG is not yet exported), products and scopes confirmed, OAuth redirect URL registered, **real legal pages**, review submission, the review demo video, public OAuth.

## 2. What BizGenie asks TikTok for (and nothing more)
- Login Kit (Web), scopes **`user.info.basic`** and **`video.upload`** only. No `video.publish`: Direct Post does not exist in the code (the connector rejects it and the database forbids a draft being a publication).
- Content Posting API, **inbox upload (draft)** via FILE_UPLOAD; the creator finishes and posts in the TikTok app.
- Redirect URI, exactly: `https://getbizgenie.com/customer/social/oauth/callback/tiktok` (static HTTPS, no query or fragment). It is implemented but **not deployed or routed**.
- Scope justification text to paste (edit freely): "BizGenie helps small businesses create marketing videos. After the business owner approves a video, BizGenie uploads it to the owner's TikTok inbox as a draft so the owner can review it and post it themselves. We read the owner's display name to show which account is connected. We never post on the owner's behalf."

## 3. Remaining gates before a review submission
| # | Gate | Owner | State |
|---|---|---|---|
| 1 | Published **Terms of Service** and **Privacy Policy** on `getbizgenie.com`, naming TikTok data use, token storage, deletion on disconnect and the data-retention rule (see the security decisions doc, section 1) | Founder + legal | not done |
| 2 | Exported brand assets (1024x1024 PNG icon, app name, short and long description, category) | Founder | not done |
| 3 | Redirect URI registered in the portal and **routable**: `getbizgenie.com/customer/social/oauth/callback/tiktok` reaches the API, which redirects to the Studio return page on `getbizgenie.com` | Founder (routing, needs authorisation) + engineering | not done; the sandbox rehearsal deliberately avoids it |
| 4 | Studio reachable on `getbizgenie.com` (the connector's browser-return host must be exactly `getbizgenie.com`) | Founder | not done |
| 5 | KMS-backed key provider (section 1 of the security doc) | Engineering | not built |
| 6 | Reviewed upload origin and chunk size recorded from a sandbox run | Founder, from the sandbox run | pending the run |
| 7 | Sandbox target user added and the sandbox run completed with evidence | Founder | pending approval |
| 8 | Demo video recorded (section 4) | Founder | pending 3, 4, 7 |
| 9 | Confirm in the portal: whether review is needed for sandbox use, for `video.upload` in production, and any audit requirement for Content Posting; the app description, URLs and demo requirements the portal asks for | Founder | confirm in the portal |
Do not set `TIKTOK_APP_REVIEW_APPROVED=true` for production until the portal shows the products and scopes granted.

## 4. Genuine demonstration-video checklist
The video must show the real product doing the real thing. **Do not manufacture it:** no stand-in server, no pre-seeded "connected" state, no edited or replayed success screen, no placeholder media presented as generated output, no second take spliced to hide a failure. If something fails on camera, say so and run it again from the start.
**Before recording:** sandbox acceptance run completed and its evidence kept; legal pages live; Studio and API reachable on `getbizgenie.com`; a clean TikTok test account (sandbox target user) on a real phone; screen recording of both the computer and the phone; the credit and provider cap approved (the acceptance runbook, section 3).
**Script, in order, one continuous take if possible:**
1. State who you are and what BizGenie is (10 s). Show the URL bar: `getbizgenie.com`.
2. Sign in as a customer; open **Accounts and publishing**; show TikTok as not connected.
3. Click **Connect TikTok**; show the TikTok consent screen on the real domain, with the requested permissions visible (`user.info.basic`, `video.upload`); approve with the test account.
4. Return to BizGenie; show "TikTok is connected" and the creator's display name.
5. Create a campaign item for TikTok, choosing the connected account; generate the video; show the price and the credits used; show the real result playing.
6. Show the suitability line ("Suits TikTok... the platform makes the final decision"); review, acknowledge, approve; schedule a time.
7. Tick the draft confirmation ("I understand this puts a draft in my TikTok inbox and that I still have to post it myself") and send.
8. Show **Draft sent to TikTok** with "BizGenie has not published it".
9. On the phone: open TikTok, show the draft in the inbox; show that nothing is posted to the profile until the creator posts it.
10. Back in BizGenie: disconnect TikTok; show it is revoked; show in TikTok's settings that the app no longer has access.
**After:** keep the raw recording; do not submit until the founder has watched it end to end.

## 5. What the repository already proves (deterministic, stand-in HTTP)
The same journey has been rehearsed in a real browser against the real backend code with the TikTok HTTP stand-in: connect (the authorize URL is checked against TikTok's own contract: exact host and path, `client_key`, no PKCE parameters), a TikTok video bound to the connected account, generation, review, approval, scheduling, send as a draft, the Draft state, disconnect and revoke. This is **a rehearsal of BizGenie's wiring, not TikTok acceptance**; it also found and fixed a real fault (the Studio refused TikTok's authorize URL because it required PKCE parameters TikTok does not use).
