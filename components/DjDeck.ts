/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import type { Deck } from '../utils/AudioEngine';
import './MixerKnob';

@customElement('dj-deck')
export class DjDeck extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, #181818 0%, #0e0e0e 100%);
      border: 1px solid #333;
      border-radius: 6px;
      padding: 6px;
      gap: 4px;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      color: white;
      position: relative;
      overflow: hidden;
      box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 16px;
      padding: 0 2px;
    }
    .title {
      font-weight: 900;
      color: #666;
      font-size: 0.65rem;
      letter-spacing: 1px;
    }
    .track-name {
      font-family: 'Courier New', monospace;
      font-size: 0.6rem;
      color: #ccc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 90px;
    }
    .bpm-display {
        font-family: 'Roboto Mono', monospace;
        color: #00bcd4;
        font-size: 0.65rem;
    }
    
    /* Visualizer */
    .visualizer-container {
      flex: 1;
      background: #000;
      width: 100%;
      border-radius: 3px;
      border: 1px solid #222;
      position: relative;
      min-height: 25px; /* Reduced height */
      max-height: 50px;
    }
    canvas { width: 100%; height: 100%; display: block; }

    /* Controls */
    .transport {
      display: flex;
      gap: 3px;
      margin-bottom: 2px;
    }
    button {
      flex: 1;
      background: #222;
      border: 1px solid #2a2a2a;
      color: #888;
      padding: 4px 0;
      border-radius: 3px;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.6rem;
      transition: all 0.1s;
    }
    button:hover { background: #2a2a2a; color: #aaa; }
    button:active { transform: translateY(1px); }
    button.play.active { background: #388e3c; color: #fff; border-color: #2e7d32; text-shadow: 0 0 4px rgba(255,255,255,0.5); }
    button.sync.active { background: #0097a7; color: #fff; border-color: #00838f; }
    
    .load-btn { font-size: 0.55rem; padding: 2px; background: #222; }
    input[type="file"] { display: none; }

    .knobs-row {
      display: flex;
      justify-content: space-between;
      background: rgba(0,0,0,0.2);
      padding: 4px;
      border-radius: 4px;
      border: 1px solid #1a1a1a;
    }
    .eq-section { display: flex; gap: 4px; }
    .main-knobs { display: flex; gap: 4px; border-left: 1px solid #333; padding-left: 6px; }
  `;

  @property({ type: String }) label = 'DECK';
  @property({ type: Object }) deck!: Deck;
  
  @state() private trackName = 'No Track';
  @state() private isPlaying = false;
  @state() private isSynced = false;
  @state() private bpm = 0;
  
  @state() private rate = 1;
  @state() private gain = 1;
  @state() private filter = 1;

  @query('canvas') private canvas!: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private animationFrame: number | null = null;

  connectedCallback() {
      super.connectedCallback();
      if (this.deck) {
          this.deck.addEventListener('loaded', (e: Event) => {
              const detail = (e as CustomEvent).detail;
              this.bpm = detail.bpm;
              (this as any).requestUpdate();
          });
      }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  }

  firstUpdated() {
      if (this.canvas) {
          this.canvas.width = this.canvas.offsetWidth * 2; // Retina/High Def
          this.canvas.height = this.canvas.offsetHeight * 2;
          this.canvasCtx = this.canvas.getContext('2d');
          this.loop();
      }
  }

  private handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.trackName = file.name;
      this.deck.loadTrack(file);
    }
  }

  private togglePlay() {
    this.deck.playPause();
    this.isPlaying = this.deck.isPlaying;
  }

  private toggleSync() {
      this.deck.toggleSync();
      this.isSynced = this.deck.isSynced;
      if (this.isSynced) this.rate = this.deck.playbackRate;
  }

  private loop() {
    if (this.deck && this.canvasCtx && this.canvas) {
        const values = this.deck.getSpectrum();
        const width = this.canvas.width;
        const height = this.canvas.height;
        const ctx = this.canvasCtx;

        ctx.clearRect(0,0,width,height);
        
        // Background grid
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);

        const barWidth = width / values.length;
        
        // Create Gradient
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, this.label === 'DECK A' ? '#333' : '#333');
        gradient.addColorStop(0.5, this.label === 'DECK A' ? '#ff25f6' : '#2af6de');
        gradient.addColorStop(1, '#fff');

        ctx.fillStyle = gradient;

        for(let i = 0; i < values.length; i++) {
             const db = values[i];
             // More sensitive range -80 to 0
             const percent = Math.max(0, (db + 80) / 80);
             const barHeight = percent * height;
             
             ctx.fillRect(i * barWidth, height - barHeight, barWidth - 0.5, barHeight);
        }
        if (this.isSynced && this.deck.playbackRate !== this.rate) {
            this.rate = this.deck.playbackRate;
        }
    }
    this.animationFrame = requestAnimationFrame(() => this.loop());
  }

  private handleRate(e: CustomEvent) {
    if (this.isSynced) this.toggleSync();
    this.rate = e.detail;
    this.deck.setRate(this.rate);
  }

  private handleGain(e: CustomEvent) {
    this.gain = e.detail;
    const db = this.gain === 0 ? -Infinity : 20 * Math.log10(this.gain * 2); 
    this.deck.setVolume(db);
  }

  private handleFilter(e: CustomEvent) {
      this.filter = e.detail;
      const freq = Math.pow(10, this.filter * 3 + 1.3);
      this.deck.setFilter(freq);
  }

  private handleEQ(band: 'high'|'mid'|'low', e: CustomEvent) {
      const val = e.detail;
      const db = (val - 0.5) * 40; 
      this.deck.setEQ(band, db);
  }

  render() {
    return html`
      <div class="header">
        <span class="title">${this.label}</span>
        <div class="track-info">
            <span class="track-name" title="${this.trackName}">${this.trackName}</span>
            <span class="bpm-display">${this.bpm > 0 ? Math.round(this.bpm) : '--'} BPM</span>
        </div>
      </div>

      <div class="visualizer-container">
        <canvas></canvas>
      </div>
      
      <div class="transport">
         <div style="flex:1">
            <button class="load-btn" @click=${() => (this as unknown as HTMLElement).shadowRoot?.querySelector('input')?.click()}>LOAD</button>
            <input type="file" accept="audio/*" @change=${this.handleFileChange}>
         </div>
         <button class="sync ${this.isSynced ? 'active' : ''}" @click=${this.toggleSync}>SYNC</button>
         <button class="play ${this.isPlaying ? 'active' : ''}" @click=${this.togglePlay}>${this.isPlaying ? 'STOP' : 'PLAY'}</button>
      </div>

      <div class="knobs-row">
        <div class="eq-section">
            <mixer-knob label="HI" .value=${0.5} @input=${(e: CustomEvent) => this.handleEQ('high', e)} color="#ff25f6"></mixer-knob>
            <mixer-knob label="MID" .value=${0.5} @input=${(e: CustomEvent) => this.handleEQ('mid', e)} color="#ffdd28"></mixer-knob>
            <mixer-knob label="LO" .value=${0.5} @input=${(e: CustomEvent) => this.handleEQ('low', e)} color="#00bcd4"></mixer-knob>
        </div>
        <div class="main-knobs">
            <mixer-knob label="FILT" .value=${1} @input=${this.handleFilter} color="#fff"></mixer-knob>
            <mixer-knob label="RATE" .value=${this.rate} min="0.5" max="1.5" @input=${this.handleRate} color="#4caf50"></mixer-knob>
            <mixer-knob label="GAIN" .value=${this.gain} @input=${this.handleGain} color="#f44336"></mixer-knob>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dj-deck': DjDeck;
  }
}