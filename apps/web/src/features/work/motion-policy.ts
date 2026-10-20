export type MotionPreference = 'system' | 'full' | 'reduced';
export function reduceWorkspaceMotion(preference: MotionPreference, systemReduced: boolean) {
 return preference === 'system' ? systemReduced : preference === 'reduced';
}
