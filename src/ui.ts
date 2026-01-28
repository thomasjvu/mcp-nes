import express, { Request, Response, RequestHandler } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { EmulatorService } from './emulatorService';
import { NESButton } from './types';
import { log } from './utils/logger';

// Build a browser-compatible bundle of the NES core (cached)
let nesCoreBundleCache: string | null = null;

function getNesCoreBundle(): string {
  if (nesCoreBundleCache) return nesCoreBundleCache;

  const coreDir = path.join(__dirname, 'nes-core');
  const moduleOrder = ['utils', 'tile', 'controller', 'cpu', 'ppu', 'papu', 'mappers', 'rom', 'nes'];

  let bundle = `(function(){\n"use strict";\nvar _m={},_c={};\nfunction _req(n){n=n.replace("./","");if(_c[n])return _c[n].exports;var m=_c[n]={exports:{}};_m[n](m,m.exports,_req);return m.exports;}\n`;

  for (const mod of moduleOrder) {
    const content = fs.readFileSync(path.join(coreDir, mod + '.js'), 'utf-8');
    bundle += `_m['${mod}']=function(module,exports,require){\n${content}\n};\n`;
  }

  bundle += `window.NESCore=_req("nes");window.NESController=_req("controller");\n})();\n`;
  nesCoreBundleCache = bundle;
  return bundle;
}

export function setupWebUI(app: express.Application, emulatorService: EmulatorService): void {

  // Serve NES core as a browser JS bundle
  app.get('/nes-core.js', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(getNesCoreBundle());
  });

  // Serve the currently-loaded ROM as raw binary (for browser-side emulation)
  app.get('/api/rom-binary', (req: Request, res: Response) => {
    const romPath = emulatorService.getRomPath();
    if (!romPath) { res.status(404).send('No ROM loaded'); return; }
    const fullPath = path.resolve(romPath);
    if (!fs.existsSync(fullPath)) { res.status(404).send('ROM file not found'); return; }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(fullPath);
  });

  // Main emulator page — runs NES client-side at 60fps with sound
  app.get('/emulator', (req: Request, res: Response) => {
    const currentRomPath = emulatorService.getRomPath();
    const romName = currentRomPath ? path.basename(currentRomPath, '.nes') : 'No ROM';

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP-NES</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --nes-dark: #2c2c2c;
      --nes-body: #d1d0cf;
      --nes-body-shadow: #b8b7b5;
      --nes-stripe: #8b1a2b;
      --nes-stripe-dark: #6e1522;
      --nes-label: #1a1a1a;
      --nes-red-btn: #cc1b2c;
      --nes-red-btn-active: #a01522;
      --crt-bezel: #3a3632;
      --crt-inner: #1a1816;
      --crt-body: #4a4540;
      --crt-body-dark: #2e2a28;
      --tv-leg: #2e2a28;
    }

    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px 0 24px;
      background: linear-gradient(180deg, #1a1520 0%, #0d0a12 50%, #1a1520 100%);
      font-family: 'Press Start 2P', monospace;
      color: #eee;
      overflow-x: hidden;
    }

    /* ============ CRT TV ============ */
    .crt-tv { position: relative; }

    .tv-body {
      background: linear-gradient(180deg, var(--crt-body) 0%, var(--crt-body-dark) 100%);
      border-radius: 22px;
      padding: 28px 32px 20px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1);
      position: relative;
    }

    .tv-brand {
      position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
      font-size: 6px; color: rgba(255,255,255,0.2); letter-spacing: 4px; text-transform: uppercase;
    }

    .tv-screen-bezel {
      background: var(--crt-bezel); border-radius: 16px; padding: 16px;
      box-shadow: inset 0 4px 12px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05);
    }

    .tv-screen-inner {
      background: var(--crt-inner); border-radius: 12px; padding: 8px;
      position: relative; overflow: hidden;
    }

    .tv-screen-inner::after {
      content: ''; position: absolute; inset: 0; border-radius: 12px;
      background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px);
      pointer-events: none; z-index: 2;
    }

    .tv-screen-inner::before {
      content: ''; position: absolute; top: -20%; left: -20%; width: 60%; height: 60%;
      background: radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 70%);
      pointer-events: none; z-index: 3;
    }

    #screen {
      display: block; width: 512px; height: 480px;
      image-rendering: pixelated; image-rendering: crisp-edges;
      background-color: #000; border-radius: 8px; position: relative; z-index: 1;
    }

    .tv-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding: 0 8px; }

    .tv-power-led {
      width: 6px; height: 6px; border-radius: 50%;
      background: #333; transition: all 0.3s;
    }
    .tv-power-led.on { background: #4a0; box-shadow: 0 0 6px #4a0; animation: led-glow 2s ease-in-out infinite; }

    @keyframes led-glow { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

    .tv-knobs { display: flex; gap: 12px; }
    .tv-knob { width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #666, #333); border: 1px solid #222; }

    .tv-legs { display: flex; justify-content: space-between; padding: 0 40px; }
    .tv-leg { width: 8px; height: 24px; background: var(--tv-leg); border-radius: 0 0 3px 3px; }

    /* ============ NES CONSOLE ============ */
    .nes-console { margin-top: -6px; position: relative; z-index: 1; }

    .nes-body {
      background: linear-gradient(180deg, var(--nes-body) 0%, var(--nes-body-shadow) 100%);
      border-radius: 6px 6px 10px 10px; padding: 10px 30px 14px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6);
      width: 580px;
    }

    .nes-top-stripe {
      height: 6px; border-radius: 3px; margin-bottom: 6px;
      background: linear-gradient(90deg, var(--nes-stripe) 0%, var(--nes-stripe-dark) 50%, var(--nes-stripe) 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.15);
    }

    .nes-label-area { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .nes-logo { font-size: 10px; color: var(--nes-label); letter-spacing: 2px; font-weight: bold; }
    .nes-rom-name { font-size: 6px; color: #666; letter-spacing: 1px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nes-cart-slot { height: 4px; background: linear-gradient(180deg, #555 0%, #888 50%, #555 100%); border-radius: 2px; width: 200px; margin: 0 auto; box-shadow: inset 0 1px 2px rgba(0,0,0,0.4); }
    .nes-bottom-stripe { height: 3px; background: var(--nes-stripe); border-radius: 2px; margin-top: 6px; }

    /* ============ SETTINGS BAR ============ */
    .settings-bar {
      display: flex; align-items: center; justify-content: center; gap: 20px;
      margin-top: 16px; padding: 8px 24px;
      background: rgba(255,255,255,0.04); border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.06);
    }

    .setting-group { display: flex; align-items: center; gap: 6px; }

    .setting-btn {
      font-family: 'Press Start 2P', monospace; font-size: 6px;
      background: #333; color: #aaa; border: 1px solid #555; border-radius: 4px;
      padding: 5px 10px; cursor: pointer; letter-spacing: 1px; transition: all 0.12s;
      white-space: nowrap;
    }
    .setting-btn:hover { background: #444; color: #ddd; }
    .setting-btn.active { background: var(--nes-red-btn); color: #fff; border-color: var(--nes-red-btn); }
    .setting-btn.active:hover { background: #e0222e; }

    .setting-label { font-size: 5px; color: #666; letter-spacing: 1px; }

    .setting-divider { width: 1px; height: 18px; background: rgba(255,255,255,0.08); }

    /* ============ NES CONTROLLER ============ */
    .nes-controller { margin-top: 16px; }

    .controller-body {
      background: linear-gradient(180deg, #e8e6e3 0%, #d5d3d0 100%);
      border-radius: 10px 10px 60px 60px; padding: 24px 32px 36px; width: 520px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.1);
    }

    .controller-face {
      background: var(--nes-dark); border-radius: 8px 8px 50px 50px;
      padding: 20px 28px 28px; display: flex; align-items: center; justify-content: space-between;
      box-shadow: inset 0 2px 6px rgba(0,0,0,0.5); min-height: 140px;
    }

    /* D-PAD */
    .dpad-area { position: relative; width: 110px; height: 110px; flex-shrink: 0; }

    .dpad-center {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 34px; height: 34px; background: #444; border-radius: 2px; z-index: 1;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }

    .dpad-btn {
      position: absolute; background: #444; border: none; cursor: pointer; z-index: 2;
      transition: background 0.08s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
    }
    .dpad-btn:hover { background: #555; }
    .dpad-btn:active, .dpad-btn.pressed { background: #666; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5); }

    .dpad-up {
      width: 34px; height: 38px; top: 0; left: 50%; transform: translateX(-50%);
      border-radius: 4px 4px 0 0;
    }
    .dpad-down {
      width: 34px; height: 38px; bottom: 0; left: 50%; transform: translateX(-50%);
      border-radius: 0 0 4px 4px;
    }
    .dpad-left {
      width: 38px; height: 34px; left: 0; top: 50%; transform: translateY(-50%);
      border-radius: 4px 0 0 4px;
    }
    .dpad-right {
      width: 38px; height: 34px; right: 0; top: 50%; transform: translateY(-50%);
      border-radius: 0 4px 4px 0;
    }

    /* Arrow indicators on d-pad */
    .dpad-btn::after {
      content: ''; position: absolute; display: block;
      border-style: solid; border-color: transparent;
      opacity: 0.25;
    }
    .dpad-up::after { border-width: 0 6px 7px 6px; border-bottom-color: #fff; top: 10px; left: 50%; transform: translateX(-50%); }
    .dpad-down::after { border-width: 7px 6px 0 6px; border-top-color: #fff; bottom: 10px; left: 50%; transform: translateX(-50%); }
    .dpad-left::after { border-width: 6px 7px 6px 0; border-right-color: #fff; left: 10px; top: 50%; transform: translateY(-50%); }
    .dpad-right::after { border-width: 6px 0 6px 7px; border-left-color: #fff; right: 10px; top: 50%; transform: translateY(-50%); }

    /* CENTER BUTTONS (Select/Start) */
    .center-buttons { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; }

    .select-start-row { display: flex; gap: 16px; transform: rotate(-25deg); }

    .pill-btn-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .pill-btn-label { font-size: 5px; color: #999; letter-spacing: 1px; text-transform: uppercase; }

    .pill-btn {
      width: 40px; height: 14px; background: #666; border: none; border-radius: 7px;
      cursor: pointer; box-shadow: inset 0 -1px 2px rgba(0,0,0,0.4); transition: background 0.08s;
    }
    .pill-btn:hover { background: #888; }
    .pill-btn:active, .pill-btn.pressed { background: #555; box-shadow: inset 0 1px 2px rgba(0,0,0,0.5); }

    /* ACTION BUTTONS (A/B) */
    .ab-area { display: flex; gap: 16px; align-items: center; flex-shrink: 0; transform: rotate(-10deg); }

    .ab-btn-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; }

    .ab-btn {
      width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
      font-family: 'Press Start 2P', monospace; font-size: 12px; color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      background: radial-gradient(circle at 40% 35%, #e03040, var(--nes-red-btn));
      box-shadow: 0 4px 8px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.2);
      transition: all 0.08s;
    }
    .ab-btn:hover { background: radial-gradient(circle at 40% 35%, #f04050, #dd2030); }
    .ab-btn:active, .ab-btn.pressed {
      background: radial-gradient(circle at 40% 35%, #b01828, var(--nes-red-btn-active));
      box-shadow: 0 2px 4px rgba(0,0,0,0.4), inset 0 2px 6px rgba(0,0,0,0.3);
      transform: translateY(1px);
    }
    .ab-btn-label { font-size: 7px; color: #999; }

    /* BACK LINK */
    .back-link {
      margin-top: 20px; margin-bottom: 10px; font-size: 7px; color: #666;
      text-decoration: none; letter-spacing: 2px; transition: color 0.2s;
    }
    .back-link:hover { color: #aaa; }

    /* WIRES */
    .wire { width: 3px; height: 20px; background: #333; margin: 0 auto; border-radius: 2px; flex-shrink: 0; }

    .wire-grow {
      flex: 1; min-height: 30px; display: flex; justify-content: center;
    }
    .wire-grow .wire-line {
      width: 3px; background: repeating-linear-gradient(180deg, #333 0px, #333 6px, #2a2a2a 6px, #2a2a2a 8px);
      border-radius: 2px;
    }

    /* STATUS OVERLAY */
    #status-overlay {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      z-index: 10; font-size: 8px; color: #888; letter-spacing: 2px; pointer-events: none;
    }
    #status-overlay.hidden { display: none; }
  </style>
</head>
<body>
  <script src="/nes-core.js"></script>

  <!-- CRT TV -->
  <div class="crt-tv">
    <div class="tv-body">
      <div class="tv-brand">MCP-NES</div>
      <div class="tv-screen-bezel">
        <div class="tv-screen-inner">
          <canvas id="screen" width="256" height="240"></canvas>
          <div id="status-overlay">LOADING...</div>
        </div>
      </div>
      <div class="tv-bottom">
        <div class="tv-power-led" id="power-led"></div>
        <div class="tv-knobs"><div class="tv-knob"></div><div class="tv-knob"></div></div>
      </div>
    </div>
    <div class="tv-legs"><div class="tv-leg"></div><div class="tv-leg"></div></div>
  </div>

  <div class="wire"></div>

  <!-- NES Console -->
  <div class="nes-console">
    <div class="nes-body">
      <div class="nes-top-stripe"></div>
      <div class="nes-label-area">
        <span class="nes-logo">Nintendo</span>
        <span class="nes-rom-name">${romName}</span>
      </div>
      <div class="nes-cart-slot"></div>
      <div class="nes-bottom-stripe"></div>
    </div>
  </div>

  <!-- Settings Bar -->
  <div class="settings-bar">
    <div class="setting-group">
      <button class="setting-btn active" id="btn-pause">PAUSE</button>
    </div>
    <div class="setting-divider"></div>
    <div class="setting-group">
      <button class="setting-btn" id="btn-mute">SOUND</button>
    </div>
    <div class="setting-divider"></div>
    <div class="setting-group">
      <button class="setting-btn" id="btn-speed">1x</button>
    </div>
  </div>

  <div class="wire-grow"><div class="wire-line"></div></div>

  <!-- NES Controller -->
  <div class="nes-controller">
    <div class="controller-body">
      <div class="controller-face">
        <div class="dpad-area">
          <div class="dpad-center"></div>
          <button class="dpad-btn dpad-up" id="btn-up" title="Up"></button>
          <button class="dpad-btn dpad-down" id="btn-down" title="Down"></button>
          <button class="dpad-btn dpad-left" id="btn-left" title="Left"></button>
          <button class="dpad-btn dpad-right" id="btn-right" title="Right"></button>
        </div>
        <div class="center-buttons">
          <div class="select-start-row">
            <div class="pill-btn-wrap">
              <span class="pill-btn-label">Select</span>
              <button class="pill-btn" id="btn-select"></button>
            </div>
            <div class="pill-btn-wrap">
              <span class="pill-btn-label">Start</span>
              <button class="pill-btn" id="btn-start"></button>
            </div>
          </div>
        </div>
        <div class="ab-area">
          <div class="ab-btn-wrap">
            <button class="ab-btn" id="btn-b">B</button>
            <span class="ab-btn-label">B</span>
          </div>
          <div class="ab-btn-wrap">
            <button class="ab-btn" id="btn-a">A</button>
            <span class="ab-btn-label">A</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <a class="back-link" href="/">&laquo; ROM SELECT</a>

  <script>
    // ─── Audio ───────────────────────────────────────────────
    const AUDIO_BUF_SIZE = 16384;
    let audioBuf = new Float32Array(AUDIO_BUF_SIZE);
    let audioW = 0, audioR = 0;
    let audioCtx = null, scriptNode = null, gainNode = null;
    let soundEnabled = false;

    function initAudio() {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        scriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.0; // start silent until user opts in
        scriptNode.onaudioprocess = function(e) {
          var left = e.outputBuffer.getChannelData(0);
          var right = e.outputBuffer.getChannelData(1);
          for (var i = 0; i < left.length; i++) {
            if (audioR !== audioW) {
              left[i] = audioBuf[audioR];
              right[i] = audioBuf[(audioR + 1) % AUDIO_BUF_SIZE];
              audioR = (audioR + 2) % AUDIO_BUF_SIZE;
            } else {
              left[i] = 0; right[i] = 0;
            }
          }
        };
        scriptNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);
      } catch(e) { console.warn('Audio init failed:', e); }
    }

    function onAudioSample(l, r) {
      var next = (audioW + 2) % AUDIO_BUF_SIZE;
      if (next === audioR) return; // buffer full, drop
      audioBuf[audioW] = l;
      audioBuf[(audioW + 1) % AUDIO_BUF_SIZE] = r;
      audioW = next;
    }

    function resumeAudio() {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }

    // ─── NES Emulator ────────────────────────────────────────
    var canvas = document.getElementById('screen');
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(256, 240);
    var statusOverlay = document.getElementById('status-overlay');
    var powerLed = document.getElementById('power-led');

    var nes = new NESCore({
      onFrame: function(buffer) {
        var data = imageData.data;
        for (var i = 0; i < 61440; i++) {
          var c = buffer[i];
          var j = i << 2;
          data[j]   = c & 0xff;
          data[j+1] = (c >> 8) & 0xff;
          data[j+2] = (c >> 16) & 0xff;
          data[j+3] = 0xff;
        }
        ctx.putImageData(imageData, 0, 0);
      },
      onAudioSample: onAudioSample,
      emulateSound: true,
      sampleRate: 48000
    });

    // ─── ROM Loading ─────────────────────────────────────────
    var running = false;
    var paused = false;

    async function loadROM() {
      statusOverlay.textContent = 'LOADING ROM...';
      statusOverlay.classList.remove('hidden');
      try {
        var resp = await fetch('/api/rom-binary');
        if (!resp.ok) throw new Error('No ROM');
        var buf = await resp.arrayBuffer();
        var bytes = new Uint8Array(buf);
        var romStr = '';
        for (var i = 0; i < bytes.length; i++) romStr += String.fromCharCode(bytes[i]);
        nes.loadROM(romStr);
        running = true;
        paused = false;
        powerLed.classList.add('on');
        statusOverlay.classList.add('hidden');
        updatePauseBtn();
        initAudio();
        requestAnimationFrame(gameLoop);
      } catch(e) {
        statusOverlay.textContent = 'NO SIGNAL';
        console.error('ROM load error:', e);
      }
    }

    // ─── Game Loop (60fps) ───────────────────────────────────
    var lastTime = 0;
    var FRAME_MS = 1000 / 60;

    function gameLoop(ts) {
      requestAnimationFrame(gameLoop);
      if (!running || paused) return;
      if (ts - lastTime < FRAME_MS * 0.9) return;
      lastTime = ts - ((ts - lastTime) % FRAME_MS);
      for (var s = 0; s < speedMultiplier; s++) nes.frame();
    }

    // ─── Controller Input (keyboard) ─────────────────────────
    var keyMap = {
      'ArrowUp': NESController.BUTTON_UP,
      'ArrowDown': NESController.BUTTON_DOWN,
      'ArrowLeft': NESController.BUTTON_LEFT,
      'ArrowRight': NESController.BUTTON_RIGHT,
      'z': NESController.BUTTON_B, 'Z': NESController.BUTTON_B,
      'x': NESController.BUTTON_A, 'X': NESController.BUTTON_A,
      'Enter': NESController.BUTTON_START,
      'Shift': NESController.BUTTON_SELECT
    };

    var keyBtnMap = {
      'ArrowUp': 'btn-up', 'ArrowDown': 'btn-down',
      'ArrowLeft': 'btn-left', 'ArrowRight': 'btn-right',
      'z': 'btn-b', 'Z': 'btn-b', 'x': 'btn-a', 'X': 'btn-a',
      'Enter': 'btn-start', 'Shift': 'btn-select'
    };

    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT') return;
      var btn = keyMap[e.key];
      if (btn !== undefined) {
        e.preventDefault();
        resumeAudio();
        nes.buttonDown(1, btn);
        var el = document.getElementById(keyBtnMap[e.key]);
        if (el) el.classList.add('pressed');
      }
      if (e.key === 'p' || e.key === 'P') togglePause();
      if (e.key === 'm' || e.key === 'M') toggleSound();
    });

    document.addEventListener('keyup', function(e) {
      var btn = keyMap[e.key];
      if (btn !== undefined) {
        nes.buttonUp(1, btn);
        var el = document.getElementById(keyBtnMap[e.key]);
        if (el) el.classList.remove('pressed');
      }
    });

    // ─── Controller Input (on-screen buttons) ────────────────
    var btnMapping = [
      ['btn-up',     NESController.BUTTON_UP],
      ['btn-down',   NESController.BUTTON_DOWN],
      ['btn-left',   NESController.BUTTON_LEFT],
      ['btn-right',  NESController.BUTTON_RIGHT],
      ['btn-a',      NESController.BUTTON_A],
      ['btn-b',      NESController.BUTTON_B],
      ['btn-start',  NESController.BUTTON_START],
      ['btn-select', NESController.BUTTON_SELECT]
    ];

    btnMapping.forEach(function(pair) {
      var el = document.getElementById(pair[0]);
      var nesBtn = pair[1];
      el.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        resumeAudio();
        nes.buttonDown(1, nesBtn);
        el.classList.add('pressed');
      });
      el.addEventListener('pointerup', function() {
        nes.buttonUp(1, nesBtn);
        el.classList.remove('pressed');
      });
      el.addEventListener('pointerleave', function() {
        nes.buttonUp(1, nesBtn);
        el.classList.remove('pressed');
      });
    });

    // ─── Settings Controls ───────────────────────────────────
    var pauseBtn = document.getElementById('btn-pause');
    var muteBtn = document.getElementById('btn-mute');
    var speedBtn = document.getElementById('btn-speed');

    function updatePauseBtn() {
      pauseBtn.textContent = paused ? 'PLAY' : 'PAUSE';
      pauseBtn.classList.toggle('active', !paused);
    }

    function togglePause() {
      paused = !paused;
      updatePauseBtn();
      if (!paused && audioCtx) audioCtx.resume();
    }

    function toggleSound() {
      soundEnabled = !soundEnabled;
      if (gainNode) gainNode.gain.value = soundEnabled ? 1.0 : 0.0;
      muteBtn.textContent = soundEnabled ? 'SOUND' : 'MUTED';
      muteBtn.classList.toggle('active', soundEnabled);
      if (soundEnabled) resumeAudio();
    }

    // Speed: 1x, 2x, 4x, 8x
    var speeds = [1, 2, 4, 8];
    var speedIndex = 0;
    var speedMultiplier = 1;

    function cycleSpeed() {
      speedIndex = (speedIndex + 1) % speeds.length;
      speedMultiplier = speeds[speedIndex];
      speedBtn.textContent = speedMultiplier + 'x';
      speedBtn.classList.toggle('active', speedMultiplier > 1);
    }

    pauseBtn.addEventListener('click', function() { resumeAudio(); togglePause(); });
    muteBtn.addEventListener('click', function() { resumeAudio(); toggleSound(); });
    speedBtn.addEventListener('click', function() { cycleSpeed(); });

    // ─── Start ───────────────────────────────────────────────
    loadROM();
  </script>
</body>
</html>`);
  });

  // ─── Server-side API routes (for MCP tools and fallback) ───

  const screenHandler: RequestHandler = (req, res) => {
    if (!emulatorService.isRomLoaded()) {
      res.status(400).send('No ROM loaded');
    } else {
      try {
        const screen = emulatorService.getScreen();
        const screenBuffer = Buffer.from(screen.data, 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.send(screenBuffer);
      } catch (error) {
        log.error('Error getting screen:', error);
        res.status(500).send('Error getting screen');
      }
    }
  };
  app.get('/screen', screenHandler);

  const advanceAndGetScreenHandler: RequestHandler = (req, res) => {
    if (!emulatorService.isRomLoaded()) {
      res.status(400).send('No ROM loaded');
    } else {
      try {
        const screen = emulatorService.advanceFrameAndGetScreen();
        const screenBuffer = Buffer.from(screen.data, 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.send(screenBuffer);
      } catch (error) {
        log.error('Error advancing frame and getting screen:', error);
        res.status(500).send('Error advancing frame and getting screen');
      }
    }
  };
  app.get('/api/advance_and_get_screen', advanceAndGetScreenHandler);

  const apiToolHandler: RequestHandler = async (req, res) => {
    const { tool, params } = req.body;
    log.info(`API /api/tool called: ${tool}`, params);

    if (!tool) {
      res.status(400).json({ error: 'Tool name is required' });
      return;
    }

    if (!emulatorService.isRomLoaded() && tool !== 'load_rom') {
      res.status(400).json({ error: 'No ROM loaded' });
      return;
    }

    try {
      let result: any;

      switch (tool) {
        case 'get_screen':
          result = emulatorService.getScreen();
          break;
        case 'load_rom':
          if (!params || !params.romPath) {
            res.status(400).json({ error: 'ROM path is required' });
            return;
          }
          result = emulatorService.loadRom(params.romPath);
          break;
        case 'wait_frames':
          const duration_frames_wait = params?.duration_frames ?? 100;
          if (typeof duration_frames_wait !== 'number' || duration_frames_wait <= 0) {
            res.status(400).json({ error: 'Invalid duration_frames' });
            return;
          }
          result = emulatorService.waitFrames(duration_frames_wait);
          break;
        default:
          if (tool.startsWith('press_')) {
            const buttonName = tool.replace('press_', '').toUpperCase();
            if (!(Object.values(NESButton) as string[]).includes(buttonName)) {
              res.status(400).json({ error: `Invalid button: ${buttonName}` });
              return;
            }
            const duration_frames_press = params?.duration_frames ?? 25;
            if (typeof duration_frames_press !== 'number' || duration_frames_press <= 0) {
              res.status(400).json({ error: 'Invalid duration_frames for press' });
              return;
            }
            emulatorService.pressButton(buttonName as NESButton, duration_frames_press);
            result = emulatorService.getScreen();
          } else {
            res.status(400).json({ error: `Unknown tool: ${tool}` });
            return;
          }
      }

      res.json({ content: [result] });

    } catch (error) {
      log.error(`Error calling tool ${tool} via API:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: `Failed to call tool: ${errorMessage}` });
    }
  };
  app.post('/api/tool', apiToolHandler);

  app.get('/api/roms', (req: Request, res: Response) => {
    try {
      const romsDir = path.join(process.cwd(), 'roms');
      if (!fs.existsSync(romsDir)) {
        fs.mkdirSync(romsDir);
      }
      const romFiles = fs.readdirSync(romsDir)
        .filter(file => file.endsWith('.nes'))
        .map(file => ({
          name: file,
          path: path.join(romsDir, file)
        }));
      res.json(romFiles);
    } catch (error) {
      log.error('Error getting ROM list:', error);
      res.status(500).json({ error: 'Failed to get ROM list' });
    }
  });

  app.get('/api/status', (req: Request, res: Response) => {
    try {
      const romLoaded = emulatorService.isRomLoaded();
      res.json({
        connected: true,
        romLoaded,
        romPath: emulatorService.getRomPath()
      });
    } catch (error) {
      log.error('Error checking status:', error);
      res.status(500).json({ error: 'Failed to check status' });
    }
  });
}

export function setupRomSelectionUI(app: express.Application, emulatorService: EmulatorService): void {
  app.get('/', (req: Request, res: Response) => {
    const romsDir = path.join(process.cwd(), 'roms');
    let romFiles: { name: string; path: string }[] = [];
    try {
      if (!fs.existsSync(romsDir)) {
        fs.mkdirSync(romsDir);
      }
      romFiles = fs.readdirSync(romsDir)
        .filter(file => file.endsWith('.nes'))
        .map(file => ({
          name: file,
          path: path.join('roms', file)
        }));
    } catch (error) {
      log.error("Error reading ROM directory:", error);
    }

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP-NES - ROM Select</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: linear-gradient(180deg, #1a1520 0%, #0d0a12 50%, #1a1520 100%);
      font-family: 'Press Start 2P', monospace; color: #eee; padding: 20px;
    }
    .cartridge {
      background: linear-gradient(180deg, #555 0%, #444 100%);
      border-radius: 12px 12px 6px 6px; padding: 30px 30px 20px; width: 420px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.6); position: relative;
    }
    .cartridge::before {
      content: ''; position: absolute; bottom: -12px; left: 50%; transform: translateX(-50%);
      width: 120px; height: 12px; background: #444; border-radius: 0 0 4px 4px;
    }
    .cart-label {
      background: linear-gradient(180deg, #f5f0e0 0%, #e8e0c8 100%);
      border-radius: 6px; padding: 20px; margin-bottom: 16px;
    }
    .cart-title { font-size: 12px; color: #222; text-align: center; margin-bottom: 6px; letter-spacing: 2px; }
    .cart-subtitle { font-size: 6px; color: #888; text-align: center; letter-spacing: 3px; }
    .cart-stripe { height: 4px; background: #8b1a2b; border-radius: 2px; margin-bottom: 16px; }
    .rom-list { max-height: 300px; overflow-y: auto; margin-bottom: 16px; }
    .rom-list::-webkit-scrollbar { width: 6px; }
    .rom-list::-webkit-scrollbar-track { background: #333; border-radius: 3px; }
    .rom-list::-webkit-scrollbar-thumb { background: #666; border-radius: 3px; }
    .rom-item {
      padding: 10px 14px; font-size: 7px; color: #ddd; cursor: pointer;
      border-bottom: 1px solid #555; letter-spacing: 1px; transition: all 0.15s; word-break: break-all;
    }
    .rom-item:hover { background: rgba(204,27,44,0.2); color: #fff; padding-left: 20px; }
    .rom-item:last-child { border-bottom: none; }
    .no-roms { text-align: center; font-size: 7px; color: #888; padding: 20px; line-height: 1.8; }
    .upload-area { border: 2px dashed #555; border-radius: 6px; padding: 16px; text-align: center; }
    .upload-area form { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .upload-label { font-size: 6px; color: #999; letter-spacing: 2px; }
    .upload-area input[type="file"] { font-family: 'Press Start 2P', monospace; font-size: 6px; color: #ccc; }
    .upload-btn {
      font-family: 'Press Start 2P', monospace; font-size: 7px; background: #8b1a2b; color: #fff;
      border: none; border-radius: 4px; padding: 8px 20px; cursor: pointer; letter-spacing: 2px; transition: background 0.15s;
    }
    .upload-btn:hover { background: #a82035; }
    .upload-btn:active { background: #6e1522; }
  </style>
</head>
<body>
  <div class="cartridge">
    <div class="cart-label">
      <div class="cart-title">MCP-NES</div>
      <div class="cart-subtitle">SELECT ROM CARTRIDGE</div>
    </div>
    <div class="cart-stripe"></div>
    <div class="rom-list">
      ${romFiles.length > 0
        ? romFiles.map(rom => `
          <div class="rom-item" onclick="selectRom('${rom.path.replace(/\\/g, '\\\\')}')">
            ${rom.name}
          </div>`).join('')
        : '<p class="no-roms">No ROM files found.<br>Drop a .nes file below.</p>'
      }
    </div>
    <div class="upload-area">
      <form action="/upload" method="post" enctype="multipart/form-data">
        <span class="upload-label">UPLOAD ROM</span>
        <input type="file" name="rom" accept=".nes" required />
        <button type="submit" class="upload-btn">INSERT</button>
      </form>
    </div>
  </div>
  <script>
    function selectRom(romPath) {
      window.location.href = '/nes?rom=' + encodeURIComponent(romPath);
    }
  </script>
</body>
</html>`);
  });
}
