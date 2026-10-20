import { startXhsFixture, FixtureScenario } from '../apps/api/test/fixtures/xhs-mcp-server';
// Private child process for the disposable preview. No HTTP scenario-control endpoint.
async function main() {
    if (process.env.CRM_DISPOSABLE_MCP_FIXTURE !== '1' || !process.send) throw new Error('Use npm run dev:mcp:isolated');
    const fixture = await startXhsFixture({ sse: true });
    process.send({ url: fixture.url.href });
    process.on('message', (input: unknown) => {
        const scenario = (input as { scenario?: FixtureScenario })?.scenario;
        if (scenario && ['BASELINE','NEW','LOGIN_EXPIRED','RESTRICTED','RATE_LIMITED','TIMEOUT','MALFORMED','SESSION_EXPIRED'].includes(scenario)) fixture.state.scenario = scenario;
    });
    for (const event of ['SIGTERM','SIGINT','disconnect'] as const) process.on(event, () => { void fixture.stop().then(() => process.exit(0)); });
}
void main();
