import { welcomeConfig as config } from '../config/welcome';
import './WelcomePanel.css';

export class WelcomePanel {
  private readonly element = document.createElement('section');
  private readonly title = document.createElement('h2');
  constructor(private readonly parent: HTMLElement, private readonly onClose: () => void) {
    this.element.className = 'welcome-panel';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'welcome-title');
    const card = document.createElement('div'); card.className = 'welcome-panel__card';
    this.title.id = 'welcome-title'; this.title.tabIndex = -1; this.title.textContent = config.title;
    const icon = document.createElement('img'); icon.src = '/favicon.svg'; icon.alt = ''; icon.width = 64; icon.height = 64;
    card.append(icon, this.title);
    for (const paragraph of config.paragraphs) {
      const text = document.createElement('p'); text.textContent = paragraph; card.append(text);
    }
    const button = document.createElement('button'); button.type = 'button'; button.textContent = config.button;
    button.onclick = () => { this.hide(); this.onClose(); parent.querySelector<HTMLButtonElement>('.dice-panel__button:not(:disabled)')?.focus(); };
    card.append(button); this.element.append(card); parent.append(this.element);
    this.element.addEventListener('keydown', this.onKey);
  }
  show(): void {
    const entry = this.parent.querySelector<HTMLElement>('.join-panel');
    if (entry) entry.inert = true;
    this.element.hidden = false; this.title.focus({ preventScroll: true });
  }
  private hide(): void {
    this.element.hidden = true;
    const entry = this.parent.querySelector<HTMLElement>('.join-panel');
    if (entry) entry.inert = false;
  }
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') { event.preventDefault(); this.element.querySelector('button')?.focus(); }
  };
  clear(): void { this.hide(); }
  destroy(): void { this.hide(); this.element.removeEventListener('keydown', this.onKey); this.element.remove(); }
}