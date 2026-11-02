# Internal-browser DM entry inspection

The first extension is intentionally inspection-only. `LoginRuntime.openSavedForDMEntryInspection` starts the existing owned MCP/Rod process with the account's existing saved session. It neither copies cookies nor attaches to the user's ordinary Chrome. Its exclusive mode exposes only `workbench_dm_entry_inspect`; legacy HTTP actions and reply tools are not registered, even if the reply flag is present.

The operator requires a private, exact, expiring one-use scope, matching installed binary hash, current admin and sender identity, original device/session metadata, idle work queues and a device lease. Only one bounded home-page inspection is permitted. It reads visible entry labels, validates identity, stops on login/risk/route mismatch and never clicks an entry, opens a conversation, types or sends. Cleanup independently verifies owned process stop before releasing the lease.

Source is overlaid on the existing pinned source tree. Go 1.24.13 official archive SHA256: f282d882c3353485e2fc6c634606d85caf36e855167d59b996dbeae19fa7629a. Existing offline module cache; no dependency downloads. Two final builds reproduced component SHA256 34665bebe976f825794ba4cf23f968148726408cafe09d28abfb1a576291ae93. Existing COMMENT send logic is unchanged; its response mapping claims never apply to DM.

On 2026-11-02 the explicit owned-session inspection returned sender identity MATCH, route /explore, no login challenge/risk, visible 消息 link /chat, stopped=true, leaseReleased=true, submissions=0, conversationOpened=false. This establishes a reusable logged-in internal-browser entry, not a working DM sender or delivery receipt. No actual private conversation or message was opened/sent.

Production DM capability remains sendingAvailable=false. Recipient binding, exact content authorization, quota reservation, send adapter, receipt and independent reconciliation still require implementation and isolated/explicit real acceptance. Do not route DM through the COMMENT engine or enable automatic DM for existing rules.

## Recipient profile observation (2026-11-02)

The inspection scope can now name one exact saved review/version and its author. The operator rejects changed/missing source bindings, scores below95, excluded comments, do-not-contact/already-contacted recipients, any non-cancelled ledger attempt and existing pending/active/unknown/confirmed jobs. This does not create a send grant or reserve quota. The public profile route is inspected without clicking; a profile route match is not a verified chat-recipient binding.

The profile-only screenshot requires matching sender identity and exact profile route, no risk/login challenge, no visible dialog, QR, password or editable area; the same guard runs before and after capture. Images remain private local evidence, outside git. Bounded DOM icon metadata is diagnostic only and is never used to infer a send receipt.

Final component v2.5.5-local-dm-profile-inspection-v3 reproduced twice: e4ddc86f5d4b4edf87fbeb542ad12e422422116b95c337e13721be3f230714f2. Installed during a confirmed idle window with prior binary/source backups. Existing comment send implementation remains unchanged.

Actual saved-session observations at12:46,12:50,12:53 UTC matched sender identity and the exact requested public-profile route. The text-label detector returned NO_VISIBLE_ENTRY. Manual inspection of the actual12:50 screenshot showed a speech-bubble icon beside Follow, establishing that the missing text label does not mean no entry. The svg/use metadata detector returned no controls; stable DOM selection and chat recipient binding remain unfinished. No conversation was opened; submissions=0; owned browser stopped and lease released after every inspection. No actual DM is claimed or enabled.
