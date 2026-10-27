/** Source-reviewed deployment record, never HTTP/env input. Installing a candidate
 * does not enable sending. Update only after exact binary review and explicit
 * runtime authorization; rule consent and account/session checks remain separate. */
// sendEligibilityReviewed reviews the application restriction policy, not an
// asserted platform can-send API. Unknown/empty UI never guarantees acceptance.
export type ExactReplyDeployment = Readonly<{ enabled: boolean; reviewedSha256: string | null; responseMappingReviewed?: boolean; sendEligibilityReviewed?: boolean }>;
export const exactReplyDeployment: ExactReplyDeployment = Object.freeze({ enabled: false, reviewedSha256: null });
