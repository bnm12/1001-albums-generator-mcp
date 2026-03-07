import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AlbumsGeneratorClient } from "../api.js";
import { createMcpServer } from "../server.js";

export interface TestClient {
  client: Client;
  cleanup: () => Promise<void>;
}

export async function createTestClient(
  mockClient: AlbumsGeneratorClient,
): Promise<TestClient> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const server = createMcpServer(mockClient);
  await server.connect(serverTransport);

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
    },
  };
}
