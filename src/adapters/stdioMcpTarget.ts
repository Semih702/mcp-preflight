import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  McpPromptInfo,
  McpResourceInfo,
  McpToolInfo,
  StdioTargetConfig,
  TargetAdapter,
  TargetSnapshot,
  ToolCallObservation,
  ToolProbe
} from "../core/types.js";
import { extractTextFromMcpContent } from "../utils/text.js";

export class StdioMcpTarget implements TargetAdapter {
  readonly kind = "stdio" as const;
  private client?: Client;
  private transport?: StdioClientTransport;

  constructor(private readonly config: StdioTargetConfig) {}

  async loadSnapshot(): Promise<TargetSnapshot> {
    await this.ensureConnected();
    const client = this.requireClient();

    const [tools, resources, resourceTemplates, prompts] = await Promise.all([
      safeList(() => client.listTools(undefined, { timeout: 10_000 }), "tools"),
      safeList(() => client.listResources(undefined, { timeout: 10_000 }), "resources"),
      safeList(() => client.listResourceTemplates(undefined, { timeout: 10_000 }), "resourceTemplates"),
      safeList(() => client.listPrompts(undefined, { timeout: 10_000 }), "prompts")
    ]);

    return {
      server: {
        name: client.getServerVersion()?.name,
        version: client.getServerVersion()?.version,
        instructions: client.getInstructions(),
        capabilities: client.getServerCapabilities() as Record<string, unknown> | undefined
      },
      tools: tools as McpToolInfo[],
      resources: resources as McpResourceInfo[],
      resourceTemplates: resourceTemplates as McpResourceInfo[],
      prompts: prompts as McpPromptInfo[]
    };
  }

  async callTool(probe: ToolProbe, timeoutMs: number): Promise<ToolCallObservation> {
    await this.ensureConnected();
    const client = this.requireClient();

    try {
      const result = await client.callTool(
        {
          name: probe.toolName,
          arguments: probe.arguments
        },
        undefined,
        { timeout: timeoutMs, maxTotalTimeout: timeoutMs }
      );

      return {
        toolName: probe.toolName,
        arguments: probe.arguments,
        ok: true,
        resultText: extractTextFromMcpContent(result),
        raw: result
      };
    } catch (error) {
      return {
        toolName: probe.toolName,
        arguments: probe.arguments,
        ok: false,
        resultText: "",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async close(): Promise<void> {
    await this.transport?.close();
    this.transport = undefined;
    this.client = undefined;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) {
      return;
    }

    this.client = new Client({
      name: "mcp-preflight",
      version: "0.1.0"
    });

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      cwd: this.config.cwd,
      env: Object.keys(this.config.env).length > 0 ? this.config.env : undefined,
      stderr: "pipe"
    });

    await this.client.connect(this.transport, { timeout: 10_000 });
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new Error("MCP client is not connected.");
    }
    return this.client;
  }
}

async function safeList<T extends Record<string, unknown>, K extends keyof T>(
  operation: () => Promise<T>,
  key: K
): Promise<unknown[]> {
  try {
    const result = await operation();
    const value = result[key];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
