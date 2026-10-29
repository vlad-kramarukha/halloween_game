import { selectableCharacters } from '../config/characters';
import type { CharacterId } from '../../shared/game';
import './JoinPanel.css';

/** Full-screen entry and removal states, outside the game camera. */
export class JoinPanel {
  private readonly element = document.createElement('section');
  private readonly form = document.createElement('form');
  private readonly nickname = document.createElement('input');
  private readonly submit = document.createElement('button');
  private readonly message = document.createElement('p');
  private readonly statusCard = document.createElement('section');
  private readonly statusTitle = document.createElement('h2');
  private readonly statusMessage = document.createElement('p');
  private readonly returnButton = document.createElement('button');
  private readonly portrait = document.createElement('img');
  private readonly portraitName = document.createElement('p');
  private connected = false;
  private busy = false;
  private mode: 'entry' | 'removed' | 'restoring' | 'blocked' | 'checking' = 'entry';

  constructor(private readonly parent: HTMLElement, roomId: string,
    private join: (nickname: string, character: CharacterId) => void,
    private returnToEntry: () => void) {
    this.element.className = 'join-panel';
    this.element.setAttribute('aria-label', 'Вход в игру');
    const layout = document.createElement('div'); layout.className = 'join-panel__layout';

    const brand = document.createElement('p'); brand.className = 'join-panel__brand'; brand.textContent = 'HALLOWEEN HR';
    const title = document.createElement('h1'); title.textContent = 'Ночь страшного найма';
    const description = document.createElement('p'); description.className = 'join-panel__description';
    description.textContent = 'Собери коллег, выбери персонажа и отправляйся к финишу. Один кубик. По очереди. До 10 игроков.';
    const showcase = document.createElement('div'); showcase.className = 'join-panel__showcase';
    this.portrait.draggable = false; this.portrait.alt = '';
    this.portraitName.className = 'join-panel__portrait-name';
    showcase.append(this.portrait, this.portraitName);
    const masthead = document.createElement('header'); masthead.className = 'join-panel__masthead';
    masthead.append(brand, title, description);


    this.form.className = 'join-panel__form';
    this.form.hidden = true;

    const room = document.createElement('p'); room.className = 'join-panel__room'; room.textContent = `Комната: ${roomId}`;
    const nameLabel = document.createElement('label'); nameLabel.className = 'join-panel__name'; this.nickname.setAttribute('aria-label', 'Никнейм');
    this.nickname.name = 'nickname'; this.nickname.maxLength = 20;
    this.nickname.placeholder = 'Как тебя зовут?'; this.nickname.autocomplete = 'off';
    nameLabel.append(this.nickname);
    const choices = document.createElement('fieldset');
    const legend = document.createElement('legend'); legend.textContent = 'Выбери персонажа'; choices.append(legend);
    const row = document.createElement('div'); row.className = 'join-panel__characters';
    selectableCharacters.forEach((character, index) => {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'character'; radio.value = character.id; radio.checked = index === 0;
      const image = document.createElement('img'); image.src = character.url; image.alt = ''; image.draggable = false;
      const name = document.createElement('span'); name.textContent = character.name;
      radio.addEventListener('change', () => this.selectPortrait(character.url, character.name));
      label.append(radio, image, name); row.append(label);
    });
    this.selectPortrait(selectableCharacters[0].url, selectableCharacters[0].name);
    choices.append(row);
    this.message.className = 'join-panel__message'; this.message.setAttribute('role', 'status');
    this.submit.type = 'submit'; this.submit.textContent = 'Присоединиться'; this.submit.disabled = true;
    const hint = document.createElement('p'); hint.className = 'join-panel__hint'; hint.textContent = 'Пригласи коллег по этой же ссылке — вы окажетесь в одной комнате.';
    const connection = document.createElement('div'); connection.className = 'join-panel__connection';
    connection.append(room, this.message);
    this.form.append(choices, showcase, nameLabel, connection, hint, this.submit);
    this.form.addEventListener('submit', this.onSubmit);

    this.statusCard.className = 'join-panel__card join-panel__status-card'; this.statusCard.hidden = true;
    const badge = document.createElement('p'); badge.className = 'join-panel__brand'; badge.textContent = 'HALLOWEEN HR';
    this.statusTitle.tabIndex = -1;
    this.statusMessage.className = 'join-panel__status-message'; this.statusMessage.setAttribute('role', 'status');
    this.returnButton.type = 'button'; this.returnButton.textContent = 'Вернуться ко входу';
    this.returnButton.onclick = () => {
      this.showEntry(); this.setConnection(false); this.returnToEntry(); this.nickname.focus();
    };
    this.statusCard.append(badge, this.statusTitle, this.statusMessage, this.returnButton);
    layout.append(masthead, this.form, this.statusCard); this.element.append(layout); parent.append(this.element);
    this.showChecking(); this.setConnection(false);
  }

  setHandlers(join: (nickname: string, character: CharacterId) => void, returnToEntry: () => void): void {
    this.join = join; this.returnToEntry = returnToEntry;
  }
  showLoading(): void {
    this.showRestoring();
    this.statusTitle.textContent = 'Входим в игру';
    this.setLoadingProgress(0);
  }
  setLoadingProgress(progress: number): void {
    this.statusMessage.textContent = 'Загружаем игровое поле… ' + Math.round(progress * 100) + '%';
  }

  private selectPortrait(url: string, name: string): void { this.portrait.src = url; this.portraitName.textContent = name; }
  private show(): void { this.element.hidden = false; this.parent.classList.add('game--entry'); }
  private showEntry(): void {
    this.element.classList.remove('join-panel--invitation');
    this.mode = 'entry'; this.busy = false; this.form.hidden = false; this.statusCard.hidden = true;
    this.element.setAttribute('aria-label', 'Вход в игру'); this.show();
  }
  private readonly onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!this.connected || this.busy || this.mode !== 'entry') return;
    const character = new FormData(this.form).get('character') as CharacterId;
    this.busy = true; this.submit.disabled = true; this.submit.textContent = 'Входим…';
    this.message.textContent = 'Занимаем место в комнате…';
    this.join(this.nickname.value, character);
  };
  setConnection(connected: boolean): void {
    this.connected = connected;
    if (!connected) this.busy = false;
    this.submit.disabled = !connected || this.busy;
    this.submit.textContent = this.busy ? 'Входим…' : 'Присоединиться';
    if (this.mode === 'entry') {
      this.message.classList.remove('is-error');
      this.message.textContent = connected ? 'Всё готово. Можно присоединяться.' : 'Подключаемся к серверу…';
    }
  }
  showError(message: string): void {
    this.showEntry(); this.submit.disabled = !this.connected; this.submit.textContent = 'Присоединиться';
    this.message.textContent = message; this.message.classList.add('is-error');
  }
  setProfile(nickname?: string, characterId?: CharacterId): void {
    this.nickname.value = nickname ?? '';
    const character = selectableCharacters.find(item => item.id === characterId) ?? selectableCharacters[0];
    if (!character) return;
    for (const input of this.form.querySelectorAll<HTMLInputElement>('input[name=character]')) input.checked = input.value === character.id;
    this.selectPortrait(character.url, character.name);
  }
  showWelcome(): void { this.setProfile(); this.showEntry(); this.setConnection(false); }
  private showChecking(): void {
    this.mode = 'checking';
    this.element.classList.add('join-panel--invitation');
    this.form.hidden = true; this.statusCard.hidden = false; this.returnButton.hidden = true;
    this.statusTitle.textContent = 'Проверяем приглашение…';
    this.statusMessage.textContent = '';
    this.element.setAttribute('aria-label', 'Проверка приглашения'); this.show();
  }
  showInvitationRequired(message: string): void {
    this.element.classList.add('join-panel--invitation');
    this.mode = 'blocked'; this.busy = false;
    this.form.hidden = true; this.statusCard.hidden = false; this.returnButton.hidden = true;
    this.statusTitle.textContent = 'Нужна ссылка приглашения';
    this.statusMessage.textContent = message;
    this.element.setAttribute('aria-label', 'Вход по приглашению'); this.show();
  }
  showRestoring(): void {
    this.mode = 'restoring'; this.form.hidden = true; this.statusCard.hidden = false; this.returnButton.hidden = true;
    this.statusTitle.textContent = 'Возвращаемся в игру';
    this.statusMessage.textContent = 'Восстанавливаем твоё место в комнате…'; this.show();
  }
  showRemoved(message: string): void {
    this.setProfile();
    this.mode = 'removed'; this.busy = false; this.connected = false;
    this.form.hidden = true; this.statusCard.hidden = false; this.returnButton.hidden = false;
    this.statusTitle.textContent = 'Тебя исключили из комнаты';
    this.statusMessage.textContent = message + ' Можно вернуться на начальный экран и присоединиться заново.';
    this.element.setAttribute('aria-label', 'Выход из комнаты'); this.show(); this.statusTitle.focus();
  }
  hide(): void { this.element.hidden = true; this.parent.classList.remove('game--entry'); }
  destroy(): void { this.form.removeEventListener('submit', this.onSubmit); this.element.remove(); this.parent.classList.remove('game--entry'); }
}
