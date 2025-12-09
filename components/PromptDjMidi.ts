/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import './DjDeck';
import './MixerKnob';
import './VoiceDashboard';

import type { PlaybackState, Prompt, ControlChange } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';
import { AudioEngine } from '../utils/AudioEngine';

/** The grid of prompt inputs + DJ Mixer Interface. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static styles = css`
    :host {
      height: 100vh;
      width: 100vw;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      position: relative;
      overflow: hidden; /* No scrolling */
      background: #000;
    }

    #device-case {
        flex: 1;
        display: grid;
        grid-template-rows: 50% 50%;
        padding: 6px;
        gap: 6px;
        background: radial-gradient(circle at center, #1a1a1a 0%, #000 100%);
    }

    /* TOP HALF: MIXER & VOICE */
    #mixer-section {
        display: flex;
        gap: 6px;
        width: 100%;
        height: 100%;
        min-height: 0;
    }

    .deck-slot {
        flex: 1;
        display: flex;
        min-width: 0;
    }

    .center-slot {
        flex: 0 0 140px; /* Much thinner */
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .voice-slot {
        flex: 1.2;
        display: flex;
        min-width: 0;
    }

    /* CENTER MIXER STRIP */
    .mixer-strip {
        background: #111;
        border: 1px solid #333;
        border-radius: 6px;
        padding: 5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        flex: 1;
        gap: 4px;
        min-height: 0;
    }

    .bpm-lcd {
        font-family: 'Roboto Mono', monospace;
        color: #4caf50;
        font-size: 1rem;
        background: #000;
        padding: 2px 8px;
        border: 1px solid #333;
        border-radius: 3px;
        text-shadow: 0 0 4px #4caf50;
        margin-bottom: 2px;
    }

    .xfader-container {
        width: 100%;
        background: #000;
        padding: 4px 6px;
        border-radius: 4px;
        border: 1px solid #222;
        margin-top: auto;
    }
    input[type=range].xfader {
      width: 100%;
      height: 16px;
      -webkit-appearance: none;
      background: transparent;
      margin: 0;
    }
    input[type=range].xfader::-webkit-slider-thumb {
        -webkit-appearance: none;
        height: 16px;
        width: 12px;
        background: linear-gradient(#999, #555);
        border: 1px solid #000;
        cursor: ew-resize;
        border-radius: 1px;
    }
    input[type=range].xfader::-webkit-slider-runnable-track {
        height: 2px;
        background: #333;
        border-radius: 2px;
        margin-top: -1px; /* Align hack */
    }

    /* BOTTOM HALF: PROMPT GRID & AI CONTROLS */
    #ai-section {
        display: flex;
        flex-direction: column;
        background: #111;
        border-radius: 6px;
        border: 1px solid #333;
        padding: 8px;
        position: relative;
        min-height: 0;
    }
    
    #bg-gradient {
        position: absolute;
        top:0; left:0; width:100%; height:100%;
        opacity: 0.3;
        z-index: 0;
        pointer-events: none;
    }

    #grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 4px;
      width: 100%;
      height: 100%;
      z-index: 1;
    }
    
    prompt-controller {
        font-size: 0.75em;
    }

    /* Overlay Controls */
    .utility-bar {
        position: absolute;
        bottom: 5px;
        right: 5px;
        z-index: 10;
        display: flex;
        gap: 5px;
    }
    button.sys-btn {
        background: #000;
        color: #666;
        border: 1px solid #333;
        font-size: 0.55rem;
        cursor: pointer;
        padding: 2px 5px;
    }

    play-pause-button {
        position: absolute;
        bottom: 5px;
        left: 50%;
        transform: translateX(-50%);
        width: 50px;
        z-index: 10;
    }
  `;

  @property({ attribute: false }) prompts: Map<string, Prompt> = new Map();
  private midiDispatcher: MidiDispatcher;
  private audioEngine: AudioEngine;

  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  
  // Mixer States
  @state() private xFaderValue = 0.5;
  @state() private masterBpm = 120;
  @state() private masterVol = 0.8;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor() {
    super();
    this.midiDispatcher = new MidiDispatcher();
    this.audioEngine = new AudioEngine();
    this.masterBpm = this.audioEngine.masterBpm;
  }

  connectedCallback() {
    super.connectedCallback();
    this.midiDispatcher.addEventListener('cc-message', this.handleMidiCC.bind(this));
  }

  private handleMidiCC(e: Event) {
    const customEvent = e as CustomEvent<ControlChange>;
    const { cc, value } = customEvent.detail;
    const normalized = value / 127;

    if (cc === 10) { // Crossfader
      this.handleXFader(normalized);
    } 
    else if (cc === 7) { // Master Volume
      this.handleMasterVol(normalized);
    }
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) { return; }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    (this as any).requestUpdate();

    (this as unknown as HTMLElement).dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
      const bg: string[] = [];
      [...this.prompts.values()].forEach((p, i) => {
        if (p.weight > 0.1) {
            const alpha = Math.round(clamp01(p.weight) * 0.4 * 255).toString(16).padStart(2,'0');
            const x = (i % 8) / 7 * 100;
            const y = Math.floor(i / 8) * 100;
            bg.push(`radial-gradient(circle at ${x}% ${y}%, ${p.color}${alpha} 0%, transparent 60%)`);
        }
      });
      return bg.length ? bg.join(', ') : 'none';
    },
    50
  );

  private async playPause() {
    await this.audioEngine.start();
    (this as unknown as HTMLElement).dispatchEvent(new CustomEvent('play-pause'));
  }

  private handleXFader(val: number) {
    this.xFaderValue = val;
    this.audioEngine.setCrossfader(val);
  }

  private handleXFaderInput(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    this.handleXFader(val);
  }

  private handleMasterVol(val: number) {
      this.masterVol = val;
      this.audioEngine.setMasterVolume(val === 0 ? -Infinity : 20 * Math.log10(val));
  }
  
  private handleMasterVolInput(e: CustomEvent) {
      this.handleMasterVol(e.detail);
  }

  private handleMasterBpm(e: CustomEvent) {
      const val = e.detail;
      this.masterBpm = Math.round(val);
      this.audioEngine.setMasterBpm(this.masterBpm);
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  render() {
    const bg = styleMap({ backgroundImage: this.makeBackground() });

    return html`
      <div id="device-case">
        
        <!-- TOP SECTION: AUDIO MIXING -->
        <div id="mixer-section">
            
            <div class="deck-slot">
                <dj-deck label="DECK A" .deck=${this.audioEngine.deckA}></dj-deck>
            </div>

            <div class="center-slot">
                <div class="mixer-strip">
                    <div class="bpm-lcd">${this.masterBpm}</div>
                    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:8px;">
                      <mixer-knob label="BPM" .value=${this.masterBpm} min="60" max="180" color="#4caf50" @input=${this.handleMasterBpm}></mixer-knob>
                      <mixer-knob label="MAIN" .value=${this.masterVol} color="#fff" @input=${this.handleMasterVolInput}></mixer-knob>
                    </div>
                    
                    <div class="xfader-container">
                        <input class="xfader" type="range" min="0" max="1" step="0.01" .value=${this.xFaderValue.toString()} @input=${this.handleXFaderInput}>
                    </div>
                </div>
            </div>

            <div class="voice-slot">
                <voice-dashboard .engine=${this.audioEngine.voiceEngine}></voice-dashboard>
            </div>

            <div class="deck-slot">
                <dj-deck label="DECK B" .deck=${this.audioEngine.deckB}></dj-deck>
            </div>

        </div>

        <!-- BOTTOM SECTION: AI GENERATION -->
        <div id="ai-section">
            <div id="bg-gradient" style=${bg}></div>
            <div id="grid">${this.renderPrompts()}</div>
            
            <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>

            <div class="utility-bar">
                <button class="sys-btn" @click=${() => this.showMidi = !this.showMidi}>MIDI</button>
            </div>
        </div>

      </div>
    `;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        cc=${prompt.cc}
        text=${prompt.text}
        weight=${prompt.weight}
        color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}
