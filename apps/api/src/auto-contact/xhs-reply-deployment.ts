/** Source-reviewed deployment record, never HTTP/env input. Installing a candidate
 * does not enable sending. Update only after exact binary review and explicit
 * runtime authorization; rule consent and account/session checks remain separate. */
export type ExactReplyDeployment = Readonly<{ enabled: boolean; reviewedSha256: string | null }>;
export const exactReplyDeployment: ExactReplyDeployment = Object.freeze({ enabled: false, reviewedSha256: null });
