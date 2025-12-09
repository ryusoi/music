/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

@customElement('mixer-knob')
export class MixerKnob extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 30px;
      user-select: none;
    }
    .knob-container {
      position: relative;
      width: 26px;
      height: 26px;
      cursor: ns-resize;
    }
    svg {
      width: 100%;
      height: 100%;
      filter: drop-shadow(0 1px 1px rgba(0,0,0,0.8));
    }
    .label {
      margin-top: 1px;
      font-family: 'Roboto Mono', monospace;
      font-size: 0.5rem;
      color: #777;
      text-transform: uppercase;
      text-align: center;
      white-space: nowrap;
      letter-spacing: 0.5px;
    }
  `;

  @property({ type: String }) label = '';
  @property({ type: Number }) value = 0.5;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 1;
  @property({ type: String }) color = '#00bcd4';

  private dragStartY = 0;
  private dragStartValue = 0;

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    this.dragStartY = e.clientY;
    this.dragStartValue = this.value;
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove = (e: PointerEvent) => {
    const deltaY = this.dragStartY - e.clientY;
    const range = this.max - this.min;
    // High precision sensitivity
    const deltaVal = (deltaY / 120) * range;
    let newVal = this.dragStartValue + deltaVal;
    newVal = Math.max(this.min, Math.min(this.max, newVal));
    
    if (newVal !== this.value) {
        this.value = newVal;
        (this as unknown as HTMLElement).dispatchEvent(new CustomEvent('input', { detail: this.value }));
    }
  }

  private handlePointerUp = () => {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  render() {
    // Map value to angle (-135deg to +135deg)
    const pct = (this.value - this.min) / (this.max - this.min);
    const angle = -135 + pct * 270;
    
    const indicatorStyle = styleMap({
      transform: `rotate(${angle}deg)`
    });

    return html`
      <div class="knob-container" @pointerdown=${this.handlePointerDown}>
        <svg viewBox="0 0 40 40">
           <!-- Base -->
           <circle cx="20" cy="20" r="18" fill="#141414" stroke="#2a2a2a" stroke-width="1.5" />
           <!-- Track -->
           <path d="M 8 32 A 16 16 0 1 1 32 32" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round" />
           <!-- Active Arc -->
           ${this.renderActiveArc(pct)}
           <!-- Pointer -->
           <g style=${indicatorStyle} transform-origin="20 20">
             <line x1="20" y1="20" x2="20" y2="4" stroke="#ddd" stroke-width="1.5" stroke-linecap="round" />
           </g>
        </svg>
      </div>
      <span class="label">${this.label}</span>
    `;
  }

  private renderActiveArc(pct: number) {
    // SVG Path for the colored arc
    // Start at -135deg (bottom left)
    const r = 16;
    const cx = 20;
    const cy = 20;
    const startAngle = -135 * (Math.PI / 180);
    const endAngle = (-135 + pct * 270) * (Math.PI / 180);
    
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    
    const largeArc = pct > 0.66 ? 1 : 0;
    
    if (pct <= 0) return html``;

    return html`<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}" 
                 fill="none" stroke="${this.color}" stroke-width="2" stroke-linecap="round" />`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mixer-knob': MixerKnob;
  }
}