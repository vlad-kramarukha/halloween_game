import type { AudioManager } from '../audio/AudioManager';
import './AudioControls.css';

export class AudioControls {
  private readonly element = document.createElement('aside');
  private readonly toggle = document.createElement('button');
  private readonly music = document.createElement('input');
  private readonly effects = document.createElement('input');
  private readonly unsubscribe: () => void;
  constructor(parent: HTMLElement, private readonly audio: AudioManager) {
    this.element.className = 'audio-controls';
    this.element.setAttribute('aria-label', 'Управление звуком');
    this.toggle.type = 'button';
    this.toggle.onclick = () => audio.configure({ muted: !audio.getSettings().muted });
    const settings = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = '⚙';
    summary.setAttribute('aria-label', 'Настройки звука'); summary.title = 'Настройки звука';
    const popup = document.createElement('div'); popup.className = 'audio-controls__popup';
    for (const [name, input, key] of [['Музыка', this.music, 'music'], ['Эффекты', this.effects, 'effects']] as const) {
      const label = document.createElement('label'); label.textContent = name;
      input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.setAttribute('aria-label', name);
      input.oninput = () => audio.configure({ [key]: input.valueAsNumber / 100 });
      label.append(input); popup.append(label);
    }
    settings.append(summary, popup); this.element.append(this.toggle, settings); parent.append(this.element);
    this.unsubscribe = audio.subscribe(() => this.render()); this.render();
  }
  private render(): void {
    const settings = this.audio.getSettings();
    this.toggle.textContent = settings.muted ? '♪̸' : '♫';
    this.toggle.setAttribute('aria-label', settings.muted ? 'Включить звук' : 'Выключить звук');
    this.toggle.setAttribute('aria-pressed', String(!settings.muted));
    this.toggle.title = settings.muted ? 'Включить звук' : 'Выключить звук';
    this.music.value = String(Math.round(settings.music * 100)); this.effects.value = String(Math.round(settings.effects * 100));
  }
  destroy(): void { this.unsubscribe(); this.element.remove(); }
}