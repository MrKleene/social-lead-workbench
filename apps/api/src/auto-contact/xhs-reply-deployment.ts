/** Source-reviewed deployment record, never HTTP/env input. Capability is available only for this reviewed build. Installation never
 * enables a rule; explicit rule consent, new-run scope and account/session
 * checks remain separate. Deploy together with the exact pinned binary. */
// sendEligibilityReviewed reviews the application restriction policy, not an
// asserted platform can-send API. Unknown/empty UI never guarantees acceptance.
export type ExactReplyDeployment = Readonly<{ enabled: boolean; reviewedSha256: string | null; responseMappingReviewed?: boolean; sendEligibilityReviewed?: boolean }>;
export const exactReplyDeployment: ExactReplyDeployment = Object.freeze({ enabled: true, reviewedSha256: '1c08ab3001ec004aa0c10fc8c681c3be3c71e46c303f463171190186dd36b3f8', responseMappingReviewed: true, sendEligibilityReviewed: true });
