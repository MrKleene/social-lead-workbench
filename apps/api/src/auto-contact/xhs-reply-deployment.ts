/** Source-reviewed deployment record, never HTTP/env input. Installing a candidate
 * does not enable sending. Candidate hash and reviews are prepared offline;
 * enabled stays false until explicit runtime authorization; rule consent and account/session checks remain separate. */
// sendEligibilityReviewed reviews the application restriction policy, not an
// asserted platform can-send API. Unknown/empty UI never guarantees acceptance.
export type ExactReplyDeployment = Readonly<{ enabled: boolean; reviewedSha256: string | null; responseMappingReviewed?: boolean; sendEligibilityReviewed?: boolean }>;
export const exactReplyDeployment: ExactReplyDeployment = Object.freeze({ enabled: false, reviewedSha256: '4ec68ba6999dc9f16ca4ae1bf5013e6df48b8bbf47d41b9e5ec6d8d3446ee6c8', responseMappingReviewed: true, sendEligibilityReviewed: true });
