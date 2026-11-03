/** Source-reviewed deployment record, never HTTP/env input. Capability is available only for this reviewed build. Installation never
 * enables a rule; explicit rule consent, new-run scope and account/session
 * checks remain separate. Deploy together with the exact pinned binary. */
// sendEligibilityReviewed reviews the application restriction policy, not an
// asserted platform can-send API. Unknown/empty UI never guarantees acceptance.
export type ExactReplyDeployment = Readonly<{ enabled: boolean; reviewedSha256: string | null; responseMappingReviewed?: boolean; sendEligibilityReviewed?: boolean }>;
export const exactReplyDeployment: ExactReplyDeployment = Object.freeze({ enabled: true, reviewedSha256: '4da06fa2ecbeef644674a26474a4d6a2cec558d2d275a061d0f0e43a160f1b56', responseMappingReviewed: true, sendEligibilityReviewed: true });
