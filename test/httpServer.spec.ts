import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createServer, connect } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

let serverProcess: ChildProcessWithoutNullStreams | undefined;

async function getFreePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");

  const address = probe.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate a TCP port.");
  }

  await new Promise<void>((resolve, reject) => {
    probe.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  return address.port;
}

async function waitForPort(port: number, process: ChildProcessWithoutNullStreams): Promise<void> {
  const deadline = Date.now() + 2500;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Server exited before listening. Exit code: ${process.exitCode}`);
    }

    try {
      const socket = connect(port, "127.0.0.1");
      await once(socket, "connect");
      socket.end();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error(`HTTP server did not listen on port ${port}: ${String(lastError)}`);
}

async function stopServer(process: ChildProcessWithoutNullStreams): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) return;

  process.kill("SIGTERM");
  await Promise.race([
    once(process, "exit"),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);

  if (process.exitCode === null && process.signalCode === null) {
    process.kill("SIGKILL");
    await once(process, "exit");
  }
}

describe("HttpServer_exposesMcpEndpoint", () => {
  afterEach(async () => {
    if (!serverProcess) return;

    await stopServer(serverProcess);
    serverProcess = undefined;
  });

  it("starts an HTTP MCP server and exposes the registered tools.", async () => {
    const port = await getFreePort();
    serverProcess = spawn(process.execPath, ["server.js"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        MCP_HTTP_HOST: "127.0.0.1",
        MCP_HTTP_PORT: String(port),
      },
    });

    await waitForPort(port, serverProcess);

    const client = new Client({ name: "mcp-tracker-test", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
    );

    await client.connect(transport);
    const response = await client.listTools();
    await client.close();

    expect(response.tools.map((tool) => tool.name)).toContain("projects.list");
  });
});
