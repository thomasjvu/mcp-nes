import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmulatorService } from '../emulatorService';
import { registerNESTools } from '../tools';

export function createNESServer(emulatorService: EmulatorService): McpServer {
  const server = new McpServer(
    {
      name: 'mcp-nes',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerNESTools(server, emulatorService);

  return server;
}
