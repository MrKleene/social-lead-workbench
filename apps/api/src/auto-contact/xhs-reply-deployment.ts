/** Source-reviewed deployment record, never HTTP/env input. Capability is available only for this reviewed build. Installation never
 * enables a rule; explicit rule consent, new-run scope and account/session
 * checks remain separate. Deploy together with the exact pinned binary. */
// sendEligibilityReviewed reviews the application restriction policy, not an
// asserted platform can-send API. Unknown/empty UI never guarantees acceptance.
export type ExactReplyDeployment = Readonly<{ enabled: boolean; reviewedSha256: string | null; responseMappingReviewed?: boolean; sendEligibilityReviewed?: boolean }>;
export const exactReplyDeployment: ExactReplyDeployment = Object.freeze({ enabled: true, reviewedSha256: '34665bebe976f825794ba4cf23f968148726408cafe09d28abfb1a576291ae93', responseMappingReviewed: true, sendEligibilityReviewed: true });
