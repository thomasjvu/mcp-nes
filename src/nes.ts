import { NESButton } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, Canvas } from 'canvas';
import { log } from './utils/logger';

// Import NES core (built into project from jsnes source)
const NESCore = require('./nes-core/nes');
const Controller = require('./nes-core/controller');

export class NESEmulator {
  private nes: any;
  private canvas: Canvas;
  private romLoaded: boolean = false;
  private romPath?: string;
  private frameBuffer: number[] = [];

  constructor() {
    // Create a canvas for rendering (NES resolution: 256x240)
    this.canvas = createCanvas(256, 240);

    // Initialize NES core with onFrame callback to capture frame buffer
    this.nes = new NESCore({
      onFrame: (buffer: number[]) => {
        // Copy the buffer to avoid jsnes reusing the array reference
        this.frameBuffer = Array.from(buffer);
      },
      emulateSound: false,
      sampleRate: 48000
    });
  }

  /**
   * Load a ROM file
   * @param romPath Path to the .nes ROM file
   */
  public loadRom(romPath: string): void {
    try {
      const romData = fs.readFileSync(romPath, 'binary');
      this.nes.loadROM(romData);
      this.romLoaded = true;
      this.romPath = romPath;
      log.info(`ROM loaded: ${path.basename(romPath)}`);
    } catch (error) {
      log.error(`Error loading ROM: ${error}`);
      throw new Error(`Failed to load ROM: ${error}`);
    }
  }

  /**
   * Press a button on the NES controller
   * @param button Button to press
   * @param durationFrames Number of frames to hold the button
   */
  public pressButton(button: NESButton, durationFrames: number = 1): void {
    if (!this.romLoaded) {
      throw new Error('No ROM loaded');
    }

    // Map our button enum to jsnes Controller button constants
    const buttonMap: Record<NESButton, number> = {
      [NESButton.UP]: Controller.BUTTON_UP,
      [NESButton.DOWN]: Controller.BUTTON_DOWN,
      [NESButton.LEFT]: Controller.BUTTON_LEFT,
      [NESButton.RIGHT]: Controller.BUTTON_RIGHT,
      [NESButton.A]: Controller.BUTTON_A,
      [NESButton.B]: Controller.BUTTON_B,
      [NESButton.START]: Controller.BUTTON_START,
      [NESButton.SELECT]: Controller.BUTTON_SELECT
    };

    const jsnesButton = buttonMap[button];

    // Press the button
    this.nes.buttonDown(1, jsnesButton);

    // Hold for durationFrames
    for (let i = 0; i < durationFrames; i++) {
      this.nes.frame();
    }

    // Release the button
    this.nes.buttonUp(1, jsnesButton);

    // Advance one extra frame after release
    this.nes.frame();
  }

  /**
   * Advance the emulation by one frame
   */
  public doFrame(): void {
    if (!this.romLoaded) {
      throw new Error('No ROM loaded');
    }
    this.nes.frame();
  }

  /**
   * Get the current screen as a base64 encoded PNG
   * @returns Base64 encoded PNG image
   */
  public getScreenAsBase64(): string {
    if (!this.romLoaded) {
      throw new Error('No ROM loaded');
    }

    const ctx = this.canvas.getContext('2d');
    const imageData = ctx.createImageData(256, 240);

    // NES core palette stores colors as 0xBBGGRR — swap R and B for RGBA
    for (let i = 0; i < this.frameBuffer.length; i++) {
      const color = this.frameBuffer[i];
      const offset = i * 4;
      imageData.data[offset] = color & 0xff;              // R (low byte)
      imageData.data[offset + 1] = (color >> 8) & 0xff;   // G (middle byte)
      imageData.data[offset + 2] = (color >> 16) & 0xff;  // B (high byte)
      imageData.data[offset + 3] = 0xff;                   // A
    }

    ctx.putImageData(imageData, 0, 0);

    // Convert to base64 PNG
    return this.canvas.toDataURL('image/png').split(',')[1];
  }

  /**
   * Get the current ROM path
   */
  public getRomPath(): string | undefined {
    return this.romPath;
  }

  /**
   * Check if a ROM is loaded
   */
  public isRomLoaded(): boolean {
    return this.romLoaded;
  }
}
