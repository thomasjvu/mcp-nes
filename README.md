# MCP: NES

An NES emulator for LLMs via the Model Context Protocol (MCP).

Play NES games through an MCP-compatible interface — load ROMs, press buttons, advance frames, and see the screen. Includes a browser UI with a nostalgic CRT TV + NES console design and a full MCP tool API for LLM-driven gameplay.

## Features

- NES emulation with built-in core (no external emulator dependency)
- MCP server with stdio and SSE transports
- Browser UI with CRT TV, NES console, and controller layout
- Client-side 60fps rendering with Web Audio sound
- Speed control (1x / 2x / 4x / 8x)
- ROM upload and management
- Full controller support (D-pad, A, B, Start, Select)
- Keyboard input (Arrow keys, Z, X, Enter, Shift)

## Setup

```bash
npm install
npm run build
```

## Usage

### Stdio mode (default)

```bash
ROM_PATH=./roms/game.nes npm start
```

### SSE mode

```bash
ROM_PATH=./roms/game.nes npm run start-sse
```

### Development

```bash
npm run dev
```

### MCP Inspector

```bash
npm run debug
```

The web UI is available at `http://localhost:3001`.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `SERVER_PORT` | Web server port | `3001` |
| `ROM_PATH` | Path to auto-load a ROM on startup | — |

## MCP Tools

| Tool | Description |
|---|---|
| `load_rom` | Load a ROM file |
| `get_screen` | Get the current screen as a PNG image |
| `press_up/down/left/right` | Press a D-pad direction |
| `press_a/b` | Press A or B button |
| `press_start/select` | Press Start or Select |
| `wait_frames` | Advance emulation by N frames |
| `is_rom_loaded` | Check if a ROM is loaded |
| `list_roms` | List available ROMs in the roms/ directory |

## Project Structure

```
src/
  index.ts            # Entry point
  types.ts            # NESButton enum, interfaces
  nes.ts              # NES emulator wrapper
  emulatorService.ts  # Service layer
  tools.ts            # MCP tool registration
  ui.ts               # Web UI and API routes
  nes-core/           # NES emulation core (JS)
  server/
    server.ts         # MCP server factory
    stdio.ts          # Stdio transport
    sse.ts            # SSE transport
  utils/
    logger.ts         # File logger
```

## Acknowledgements

- NES emulation core from [JSNES](https://github.com/bfirsh/jsnes) by Ben Firshman (Apache-2.0 license)
- MCP architecture inspired by [mcp-gameboy](https://github.com/mario-andreschak/mcp-gameboy) by Mario Andreschak

## License

MIT
