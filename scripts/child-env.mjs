// Build/test/deploy commands must not inherit a writer's behavior or model credentials.
// Preserve the existing Google workload identity for the actual Hosting deploy.
export function childEnvironment(parent=process.env){return Object.fromEntries(Object.entries(parent).filter(([key])=>!/^(?:MATRIX_|DASHSCOPE_|OPENROUTER_|BCJ_)/.test(key)));}
