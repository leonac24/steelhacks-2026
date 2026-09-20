// Syncs June's agent config to ElevenLabs: creates/updates the 9 tools from
// docs/agent-tools.json and patches the agent prompt from docs/june-prompt.md.
// Run: pnpm --filter web sync:agent -- --base-url https://<BASE_URL>
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.elevenlabs.io";

function cliArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;
const toolSecret = process.env.ELEVENLABS_TOOL_SECRET;
const baseUrl = (cliArg("--base-url") || process.env.BETTER_AUTH_URL)?.replace(/\/+$/, "");

if (!apiKey) fail("ELEVENLABS_API_KEY is not set");
if (!agentId) fail("ELEVENLABS_AGENT_ID is not set");
if (!toolSecret) fail("ELEVENLABS_TOOL_SECRET is not set");
if (!baseUrl) fail("Missing base URL: pass --base-url <url> or set BETTER_AUTH_URL");

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs");

type ToolConfig = {
  name: string;
  type: string;
  response_timeout_secs?: number;
  description?: string;
  api_schema?: Record<string, unknown>;
};

async function elevenLabs(
  pathname: string,
  init: { method?: string; body?: string } = {},
): Promise<unknown> {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method: init.method ?? "GET",
    headers: {
      "xi-api-key": apiKey!,
      "content-type": "application/json",
    },
    body: init.body,
  });
  if (!response.ok) {
    throw new Error(
      `ElevenLabs ${init.method ?? "GET"} ${pathname} failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.json();
}

const FIRST_MESSAGE =
  "Hello! This is June. Before we talk about your money, could you tell me your PIN?";

async function main() {
  const toolsRaw = readFileSync(path.join(docsDir, "agent-tools.json"), "utf8")
    .replaceAll("{{BASE_URL}}", baseUrl!)
    .replaceAll("{{TOOL_SECRET}}", toolSecret!);
  const toolsDoc = JSON.parse(toolsRaw) as { tools: ToolConfig[] };
  const prompt = readFileSync(path.join(docsDir, "june-prompt.md"), "utf8");

  const listRes = (await elevenLabs("/v1/convai/tools")) as {
    tools?: Array<{ id: string; tool_config?: ToolConfig }>;
  };
  const existingTools = listRes.tools ?? [];

  const toolIds: string[] = [];
  for (const tool of toolsDoc.tools) {
    const existing = existingTools.find((t) => t.tool_config?.name === tool.name);
    const result = existing
      ? ((await elevenLabs(`/v1/convai/tools/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ tool_config: tool }),
        })) as { id: string })
      : ((await elevenLabs("/v1/convai/tools", {
          method: "POST",
          body: JSON.stringify({ tool_config: tool }),
        })) as { id: string });
    toolIds.push(result.id);
    console.log(`\u2219 ${tool.name.padEnd(24)} ${result.id}  ${existing ? "updated" : "created"}`);
  }

  const agent = (await elevenLabs(`/v1/convai/agents/${agentId}`)) as {
    conversation_config?: { agent?: { prompt?: Record<string, unknown>; language?: string } };
  };
  const agentInner = agent.conversation_config?.agent ?? {};
  const promptPatch = { ...agentInner.prompt, prompt, tool_ids: toolIds };

  await elevenLabs(`/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: promptPatch,
          first_message: FIRST_MESSAGE,
          language: agentInner.language ?? "en",
        },
      },
    }),
  });
  console.log(`\nAgent ${agentId} patched with ${toolIds.length} tools + June's prompt.`);

  console.log(
    "\nReminder (dashboard-only, not exposed via API): in the ElevenLabs dashboard,\n" +
      "  1. Agent \u2192 Security: enable \"Fetch conversation initiation data\" pointing at\n" +
      "     " + baseUrl + "/api/elevenlabs/init, and allow-list the first_message override.\n" +
      "  2. Workspace \u2192 Webhooks: add post-call webhook\n" +
      "     " + baseUrl + "/api/elevenlabs/post-call (post_call_transcription + call_initiation_failure),\n" +
      "     record the signing secret as ELEVENLABS_WEBHOOK_SECRET.",
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);