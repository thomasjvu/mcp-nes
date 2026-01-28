import {
  CallToolResult,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { NESButton } from './types';
import { EmulatorService } from './emulatorService';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/logger';

export function registerNESTools(server: McpServer, emulatorService: EmulatorService): void {
  // Register button press tools
  Object.values(NESButton).forEach(button => {
    server.tool(
      `press_${button.toLowerCase()}`,
      `Press the ${button} button on the NES controller`,
      {
        duration_frames: z.number().int().positive().optional().default(25).describe('Number of frames to hold the button')
      },
      async ({ duration_frames }): Promise<CallToolResult> => {
        emulatorService.pressButton(button, duration_frames);
        const screen = emulatorService.getScreen();
        return { content: [screen] };
      }
    );
  });

  // Register wait_frames tool
  server.tool(
    'wait_frames',
    'Wait for a specified number of frames',
    {
      duration_frames: z.number().int().positive().describe('Number of frames to wait').default(100)
    },
    async ({ duration_frames }): Promise<CallToolResult> => {
      const screen = emulatorService.waitFrames(duration_frames);
      return { content: [screen] };
    }
  );

  // Register load ROM tool
  server.tool(
    'load_rom',
    'Load a NES ROM file',
    {
      romPath: z.string().describe('Path to the .nes ROM file')
    },
    async ({ romPath }): Promise<CallToolResult> => {
      const screen = emulatorService.loadRom(romPath);
      return { content: [screen] };
    }
  );

  // Register get screen tool
  server.tool(
    'get_screen',
    'Get the current NES screen (advances one frame)',
    {},
    async (): Promise<CallToolResult> => {
      const screen = emulatorService.advanceFrameAndGetScreen();
      return { content: [screen] };
    }
  );

  // Register is_rom_loaded tool
  server.tool(
    'is_rom_loaded',
    'Check if a ROM is currently loaded in the emulator',
    {},
    async (): Promise<CallToolResult> => {
      const isLoaded = emulatorService.isRomLoaded();
      const romPath = emulatorService.getRomPath();

      const responseText: TextContent = {
        type: 'text',
        text: JSON.stringify({
          romLoaded: isLoaded,
          romPath: romPath || null
        })
      };

      log.verbose('Checked ROM loaded status', JSON.stringify({
        romLoaded: isLoaded,
        romPath: romPath || null
      }));

      return { content: [responseText] };
    }
  );

  // Register list_roms tool
  server.tool(
    'list_roms',
    'List all available NES ROM files',
    {},
    async (): Promise<CallToolResult> => {
      try {
        const romsDir = path.join(process.cwd(), 'roms');

        if (!fs.existsSync(romsDir)) {
          fs.mkdirSync(romsDir);
          log.info('Created roms directory');
        }

        const romFiles = fs.readdirSync(romsDir)
          .filter(file => file.endsWith('.nes'))
          .map(file => ({
            name: file,
            path: path.join(romsDir, file)
          }));

        const responseText: TextContent = {
          type: 'text',
          text: JSON.stringify(romFiles)
        };

        log.verbose('Listed available ROMs', JSON.stringify({
          count: romFiles.length,
          roms: romFiles
        }));

        return { content: [responseText] };
      } catch (error) {
        log.error('Error listing ROMs:', error instanceof Error ? error.message : String(error));

        const errorText: TextContent = {
          type: 'text',
          text: JSON.stringify({
            error: 'Failed to list ROMs',
            message: error instanceof Error ? error.message : String(error)
          })
        };

        return { content: [errorText] };
      }
    }
  );
}
