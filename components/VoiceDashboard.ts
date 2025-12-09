/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import type { VoiceEngine } from '../utils/AudioEngine';
import './MixerKnob';

@customElement('voice-dashboard')
export class VoiceDashboard extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background: #111;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 6px;
      gap: 6px;
      color: white;
      box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
      height: 100%;
      box-sizing: border-box;
    }
    
    .screen {
      flex: 1;
      background: #080808;
      border-radius: 4px;
      border: 1px solid #222;
      position: relative;
      overflow: hidden;
      min-height: 40px;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    
    .status-text {
        position: absolute;
        top: 4px;
        left: 5px;
        font-family: 'Courier New', monospace;
        font-size: 0.6rem;
        color: #00bcd4;
        text-shadow: 0 0 2px #00bcd4;
        background: rgba(0,0,0,0.5);
        padding: 1px 3px;
        border-radius: 2px;
    }

    .preset-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3px;
    }
    .preset-btn {
      background: #1a1a1a;
      border: 1px solid #333;
      color: #777;
      padding: 4px;
      font-size: 0.55rem;
      cursor: pointer;
      border-radius: 2px;
      text-transform: uppercase;
      transition: all 0.2s;
    }
    .preset-btn.active {
      background: #ff25f6;
      color: #fff;
      border-color: #ff25f6;
      box-shadow: 0 0 6px rgba(255, 37, 246, 0.4);
    }
    .preset-btn:hover {
        background: #2a2a2a;
        color: #aaa;
    }

    .controls-row {
      display: flex;
      justify-content: space-between;
      gap: 4px;
      align-items: center;
      margin-top: auto;
    }
    
    .main-controls {
        display: flex;
        gap: 3px;
        flex: 1;
    }

    .action-btn {
      flex: 1;
      height: 30px; /* Reduced height */
      border: none;
      border-radius: 3px;
      font-weight: bold;
      font-size: 0.6rem;
      cursor: pointer;
      text-transform: uppercase;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .rec-btn {
      background: #222;
      color: #f44336;
      border: 1px solid #f44336;
    }
    .rec-btn.recording {
      background: #f44336;
      color: #fff;
      animation: pulse 1s infinite;
    }
    
    .play-btn { background: #222; border-bottom: 2px solid #111; }
    .play-btn.playing { background: #4caf50; border-bottom: 2px solid #2e7d32; box-shadow: 0 0 8px #4caf50; }

    .stop-btn { background: #222; border-bottom: 2px solid #111; color: #888; }
    
    .loop-btn { 
        background: #1a1a1a; 
        color: #555; 
        font-size: 0.55rem;
        max-width: 35px;
    }
    .loop-btn.active { color: #00bcd4; border: 1px solid #00bcd4; }

    .file-io {
        display: flex;
        flex-direction: column;
        gap: 2px;
        justify-content: center;
    }
    .io-btn {
        background: transparent;
        border: 1px solid #333;
        color: #888;
        font-size: 0.5rem;
        padding: 2px 4px;
        cursor: pointer;
        border-radius: 2px;
        text-align: center;
    }
    .io-btn:hover { color: #fff; border-color: #666; }
    
    .knob-wrapper {
        margin: -2px;
    }
    
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
  `;

  @property({ type: Object }) engine!: VoiceEngine;
  @state() isRecording = false;
  @state() isPlaying = false;
  @state() isLooping = true;
  @state() currentPreset = 0;
  @state() gain = 1;

  @query('canvas') canvas!: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private animationFrame: number | null = null;
  
  private readonly presets = [
      'Bcast', 'Daft', 'Chip', 'Demon', 'Glitch', 'Ether', 'Phone'
  ];

  connectedCallback() {
    super.connectedCallback();
    if (this.engine) {
        this.engine.addEventListener('state-change', () => this.syncState());
        this.currentPreset = this.engine.currentPreset;
    }
  }

  firstUpdated() {
    this.canvas.width = this.canvas.offsetWidth * 2;
    this.canvas.height = this.canvas.offsetHeight * 2;
    this.canvasCtx = this.canvas.getContext('2d');
    this.loopVisualizer();
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  }

  private syncState() {
      this.isRecording = this.engine.isRecording;
      this.isPlaying = this.engine.isPlaying;
      this.currentPreset = this.engine.currentPreset;
      (this as any).requestUpdate();
  }

  private loopVisualizer() {
      if (this.engine && this.canvasCtx) {
          const values = this.engine.analyser.getValue() as Float32Array;
          const ctx = this.canvasCtx;
          const w = this.canvas.width;
          const h = this.canvas.height;
          
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#080808';
          ctx.fillRect(0, 0, w, h);
          
          const barWidth = w / values.length;
          
          const gradient = ctx.createLinearGradient(0, h, 0, 0);
          gradient.addColorStop(0, '#00bcd4');
          gradient.addColorStop(1, '#fff');
          ctx.fillStyle = gradient;

          for (let i = 0; i < values.length; i++) {
              const val = values[i];
              // -100 to 0 db
              const hPct = Math.max(0, (val + 90) / 90);
              const barHeight = hPct * h;
              
              ctx.fillRect(i * barWidth, h - barHeight, barWidth - 0.5, barHeight);
          }
      }
      this.animationFrame = requestAnimationFrame(() => this.loopVisualizer());
  }

  private async toggleRec() {
      if (this.isRecording) {
          await this.engine.stopRecording();
      } else {
          await this.engine.startRecording();
      }
  }

  private togglePlay() {
      if (this.isPlaying) this.engine.stop();
      else this.engine.play();
  }

  private setPreset(idx: number) {
      this.engine.setPreset(idx);
  }

  private toggleLoop() {
      this.isLooping = !this.isLooping;
      this.engine.toggleLoop(this.isLooping);
  }
  
  private handleGain(e: CustomEvent) {
      this.gain = e.detail;
      this.engine.setVolume(this.gain);
  }

  private async saveFile() {
      alert("To save: Right click 'Download' after recording completes if implemented.");
  }
  
  private handleFileLoad() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = (e: any) => {
          if (e.target.files[0]) {
              this.engine.loadFile(e.target.files[0]);
          }
      };
      input.click();
  }

  render() {
    return html`
      <div class="screen">
        <canvas></canvas>
        <div class="status-text">
            ${this.isRecording ? 'RECORDING...' : this.isPlaying ? 'PLAYING' : 'READY'}
        </div>
      </div>

      <div class="preset-row">
        ${this.presets.map((name, i) => html`
            <button class="preset-btn ${this.currentPreset === i ? 'active' : ''}" 
                    @click=${() => this.setPreset(i)}>${name}</button>
        `)}
      </div>

      <div class="controls-row">
         <div class="knob-wrapper">
            <mixer-knob label="VOL" .value=${this.gain} @input=${this.handleGain} color="#fff"></mixer-knob>
         </div>
         
         <div class="main-controls">
             <button class="action-btn rec-btn ${this.isRecording ? 'recording' : ''}" @click=${this.toggleRec}>REC</button>
             <button class="action-btn play-btn ${this.isPlaying ? 'playing' : ''}" @click=${this.togglePlay}>${this.isPlaying ? 'PAUSE' : 'PLAY'}</button>
             <button class="action-btn stop-btn" @click=${() => this.engine.stop()}>STOP</button>
             <button class="action-btn loop-btn ${this.isLooping ? 'active' : ''}" @click=${this.toggleLoop}>LOOP</button>
         </div>
         
         <div class="file-io">
            <button class="io-btn" @click=${this.saveFile}>SAVE</button>
            <button class="io-btn" @click=${this.handleFileLoad}>OPEN</button>
         </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'voice-dashboard': VoiceDashboard;
  }
}