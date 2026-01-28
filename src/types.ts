import {
  ImageContent,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';

// NES button types
export enum NESButton {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  A = 'A',
  B = 'B',
  START = 'START',
  SELECT = 'SELECT'
}

// Tool schemas
export interface PressButtonToolSchema {
  button: NESButton;
  duration_frames?: number;
}

export interface WaitFramesToolSchema {
  duration_frames: number;
}

export interface LoadRomToolSchema {
  romPath: string;
}

export interface GetScreenToolSchema {
  // No parameters needed
}

// Server configuration
export interface NESServerConfig {
  romPath?: string;
  port?: number;
}

// Session state
export interface NESSession {
  romLoaded: boolean;
  romPath?: string;
}
