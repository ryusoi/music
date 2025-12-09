/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Tone from 'tone';

/**
 * Advanced Audio Engine for DJ Mixing and Robotic Voice Processing.
 * Built on Tone.js.
 */
export class AudioEngine extends EventTarget {
  // Global
  public masterOutput: Tone.Destination;
  public crossfader: Tone.CrossFade;
  public masterBpm: number = 120;
  
  // Decks
  public deckA: Deck;
  public deckB: Deck;

  // Voice Engine
  public voiceEngine: VoiceEngine;

  constructor() {
    super();
    
    // Master Chain
    this.masterOutput = Tone.Destination;
    this.crossfader = new Tone.CrossFade(0.5).toDestination();

    // Initialize Decks
    this.deckA = new Deck('A', this.crossfader.a, this);
    this.deckB = new Deck('B', this.crossfader.b, this);

    // Initialize Voice Engine (routes directly to destination for now, or could route to mixer)
    this.voiceEngine = new VoiceEngine();
  }

  public async start() {
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }
    console.log('Audio Engine Started');
  }

  public setMasterBpm(bpm: number) {
    this.masterBpm = bpm;
    // Update synced decks
    if (this.deckA.isSynced) this.deckA.syncToMaster();
    if (this.deckB.isSynced) this.deckB.syncToMaster();
  }

  // --- Mixer Controls ---

  public setCrossfader(value: number) {
    this.crossfader.fade.rampTo(value, 0.05);
  }

  public setMasterVolume(db: number) {
    this.masterOutput.volume.rampTo(db, 0.05);
  }
}

/**
 * Handles Microphone Recording and Robotic Playback.
 */
export class VoiceEngine extends EventTarget {
    private mic: Tone.UserMedia;
    private recorder: Tone.Recorder;
    private player: Tone.Player;
    public analyser: Tone.Analyser;
    
    // FX Chain
    private pitchShift: Tone.PitchShift;
    private distortion: Tone.Distortion;
    private bitCrusher: Tone.BitCrusher;
    private vibrato: Tone.Vibrato;
    private reverb: Tone.Reverb;
    private delay: Tone.FeedbackDelay;
    private eq: Tone.EQ3;
    private gain: Tone.Gain;

    public isRecording: boolean = false;
    public isPlaying: boolean = false;
    public currentPreset: number = 0;

    constructor() {
        super();
        this.mic = new Tone.UserMedia();
        this.recorder = new Tone.Recorder();
        
        // Connect Mic to Recorder (monitor off to prevent feedback)
        this.mic.connect(this.recorder);

        this.player = new Tone.Player();
        this.player.loop = true;

        // Initialize FX
        this.pitchShift = new Tone.PitchShift();
        this.distortion = new Tone.Distortion(0);
        this.bitCrusher = new Tone.BitCrusher(16); // Clean init
        this.vibrato = new Tone.Vibrato(0, 0);
        this.reverb = new Tone.Reverb({ decay: 1.5, wet: 0.2 });
        this.delay = new Tone.FeedbackDelay("8n", 0);
        this.eq = new Tone.EQ3(0, 0, 0);
        this.gain = new Tone.Gain(1);
        // High Def FFT
        this.analyser = new Tone.Analyser("fft", 256);
        this.analyser.smoothing = 0.8;

        // Chain: Player -> Pitch -> BitCrush -> Dist -> Vib -> Delay -> Reverb -> EQ -> Gain -> Out
        this.player.chain(
            this.pitchShift,
            this.bitCrusher,
            this.distortion,
            this.vibrato,
            this.delay,
            this.reverb,
            this.eq,
            this.gain,
            this.analyser,
            Tone.Destination
        );

        this.setPreset(0); // Default clean
    }

    public async startMic() {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
        if (this.mic.state !== 'started') {
            try {
                await this.mic.open();
            } catch (e) {
                console.error("Could not open microphone", e);
            }
        }
    }

    public async startRecording() {
        await this.startMic();
        if (this.mic.state === 'started') {
            this.recorder.start();
            this.isRecording = true;
            this.dispatchEvent(new Event('state-change'));
        }
    }

    public async stopRecording() {
        if (!this.isRecording) return;
        
        try {
            const blob = await this.recorder.stop();
            this.isRecording = false;
            
            if (blob.size > 0) {
                const url = URL.createObjectURL(blob);
                try {
                    await this.player.load(url);
                    // Auto play logic removed to let user decide
                } catch (loadError) {
                    console.error("Error loading recording into player:", loadError);
                }
            }
            this.dispatchEvent(new Event('state-change'));
            return blob;
        } catch (e) {
             console.error("Error stopping recording:", e);
             this.isRecording = false;
             this.dispatchEvent(new Event('state-change'));
        }
    }

    public play() {
        if (this.player.loaded) {
            this.player.start();
            this.isPlaying = true;
            this.dispatchEvent(new Event('state-change'));
        }
    }

    public stop() {
        this.player.stop();
        this.isPlaying = false;
        this.dispatchEvent(new Event('state-change'));
    }

    public toggleLoop(loop: boolean) {
        this.player.loop = loop;
    }

    public setVolume(val: number) {
        // 0-1 to db
        const db = val === 0 ? -Infinity : 20 * Math.log10(val);
        this.gain.gain.rampTo(val, 0.1);
    }

    public setPlaybackRate(rate: number) {
        this.player.playbackRate = rate;
    }

    public async loadFile(file: File) {
        const url = URL.createObjectURL(file);
        try {
            await this.player.load(url);
            this.dispatchEvent(new Event('state-change'));
        } catch(e) {
            console.error("Error loading file in VoiceEngine:", e);
        }
    }

    public setPreset(index: number) {
        this.currentPreset = index;
        // Reset all first
        this.resetFX();

        switch (index) {
            case 0: // Broadcast (Radio/Crisp)
                this.eq.high.value = 6;
                this.eq.low.value = -5;
                this.distortion.distortion = 0.05;
                break;
            case 1: // Daft (Hard Tune style)
                this.pitchShift.pitch = -12;
                this.distortion.distortion = 0.2;
                break;
            case 2: // Chipmunk
                this.pitchShift.pitch = 12;
                this.player.playbackRate = 1;
                break;
            case 3: // Demon
                this.pitchShift.pitch = -7;
                this.distortion.distortion = 0.8;
                this.reverb.wet.value = 0.5;
                break;
            case 4: // Glitch Bot
                this.bitCrusher.bits.value = 4;
                this.vibrato.frequency.value = 50;
                this.vibrato.depth.value = 0.5;
                break;
            case 5: // Ethereal
                this.pitchShift.pitch = 7;
                this.reverb.decay = 6;
                this.reverb.wet.value = 0.8;
                this.delay.wet.value = 0.5;
                this.delay.feedback.value = 0.6;
                break;
            case 6: // Telephone
                 this.eq.high.value = -20;
                 this.eq.low.value = -20;
                 this.eq.mid.value = 10;
                 this.distortion.distortion = 0.4;
                 break;
        }
        this.dispatchEvent(new Event('state-change'));
    }

    private resetFX() {
        this.pitchShift.pitch = 0;
        this.distortion.distortion = 0;
        this.bitCrusher.bits.value = 16;
        this.vibrato.depth.value = 0;
        this.reverb.wet.value = 0.2;
        this.reverb.decay = 1.5;
        this.delay.wet.value = 0;
        this.eq.high.value = 0;
        this.eq.mid.value = 0;
        this.eq.low.value = 0;
        this.player.playbackRate = 1;
    }
}

/**
 * Represents a single DJ Deck.
 */
export class Deck extends EventTarget {
  public player: Tone.Player;
  public panner: Tone.Panner;
  public filter: Tone.Filter;
  public eq: Tone.EQ3;
  public meter: Tone.Meter;
  public analyser: Tone.Analyser;
  public id: string;
  private engine: AudioEngine;
  
  public isPlaying: boolean = false;
  public bpm: number = 0; // Detected BPM
  public playbackRate: number = 1;
  public isSynced: boolean = false;

  constructor(id: string, outputNode: Tone.InputNode, engine: AudioEngine) {
    super();
    this.id = id;
    this.engine = engine;
    this.player = new Tone.Player();
    this.panner = new Tone.Panner(0);
    this.filter = new Tone.Filter(20000, "lowpass");
    this.eq = new Tone.EQ3(0, 0, 0); // High, Mid, Low
    this.meter = new Tone.Meter();
    // High Def FFT
    this.analyser = new Tone.Analyser("fft", 256);
    this.analyser.smoothing = 0.8;

    // Chain: Player -> EQ -> Filter -> Panner -> Analyser -> Meter -> MixerChannel
    this.player.chain(this.eq, this.filter, this.panner, this.analyser, this.meter, outputNode);
  }

  public async loadTrack(file: File) {
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }
    const url = URL.createObjectURL(file);
    try {
        await this.player.load(url);
        console.log(`Deck ${this.id} loaded.`);
        
        // Auto-Analyze BPM
        this.bpm = await this.detectBPM(this.player.buffer);
        console.log(`Deck ${this.id} BPM Detected: ${this.bpm}`);
        
        // If Master is default, take this BPM
        if (this.engine.masterBpm === 120 && this.bpm > 0) {
            this.engine.setMasterBpm(this.bpm);
        }

        this.dispatchEvent(new CustomEvent('loaded', { detail: { bpm: this.bpm } }));
    } catch (e) {
        console.error(`Deck ${this.id} failed to load track:`, e);
    }
  }

  public playPause() {
    if (this.player.state === 'started') {
      this.player.stop();
      this.isPlaying = false;
    } else {
      if (this.isSynced) this.syncToMaster();
      this.player.start();
      this.isPlaying = true;
    }
  }

  public toggleSync() {
    this.isSynced = !this.isSynced;
    if (this.isSynced) {
        this.syncToMaster();
    } else {
        this.setRate(1);
    }
  }

  public syncToMaster() {
      if (this.bpm > 0 && this.engine.masterBpm > 0) {
          const rate = this.engine.masterBpm / this.bpm;
          this.setRate(rate);
      }
  }

  public setVolume(db: number) {
    this.player.volume.rampTo(db, 0.1);
  }

  public setRate(rate: number) {
    this.playbackRate = rate;
    this.player.playbackRate = rate;
  }

  public setFilter(freq: number) {
    // Map 0-1 knob to 100Hz - 20000Hz
    const f = Math.max(100, Math.min(20000, freq));
    this.filter.frequency.rampTo(f, 0.1);
  }

  public setEQ(band: 'high' | 'mid' | 'low', val: number) {
    // Val -10 to +10 dB
    this.eq[band].value = val;
  }

  public getLevel(): number {
    const val = this.meter.getValue();
    if (Array.isArray(val)) return 0;
    // val is usually -Infinity to 0 dB. Convert to 0-1 for UI
    return Math.max(0, (val + 60) / 60);
  }

  public getSpectrum(): Float32Array {
      return this.analyser.getValue() as Float32Array;
  }

  /**
   * Simple Offline BPM Detection Algorithm
   * Detects energy peaks and finds the most common interval.
   */
  private async detectBPM(buffer: Tone.ToneAudioBuffer): Promise<number> {
    const channelData = buffer.getChannelData(0); // Analyze left channel
    const sampleRate = buffer.sampleRate;
    
    // Downsample for performance (take 1 sample every 4)
    const step = 4;
    const peaks: number[] = [];
    const threshold = 0.6; // Amplitude threshold

    for (let i = 0; i < channelData.length; i += step) {
        if (channelData[i] > threshold) {
            // Found a peak, skip forward a bit to avoid re-triggering on same transient
            peaks.push(i);
            i += Math.floor(sampleRate / 4); // Skip ~250ms (max 240bpm)
        }
    }

    if (peaks.length < 10) return 0; // Not enough data

    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i - 1]);
    }

    // Group intervals (histogram)
    const groups: { [key: string]: number } = {};
    intervals.forEach(interval => {
        // Round to nearest ~100 samples to group similar beats
        const rounded = Math.round(interval / 100) * 100;
        groups[rounded] = (groups[rounded] || 0) + 1;
    });

    // Find most common interval
    let maxCount = 0;
    let bestInterval = 0;
    for (const interval in groups) {
        if (groups[interval] > maxCount) {
            maxCount = groups[interval];
            bestInterval = parseInt(interval);
        }
    }

    if (bestInterval === 0) return 0;

    const bpm = (60 * sampleRate) / (bestInterval * step);
    
    // Clamp to reasonable DJ range (70-180)
    if (bpm < 70) return bpm * 2;
    if (bpm > 180) return bpm / 2;
    
    return Math.round(bpm);
  }
}