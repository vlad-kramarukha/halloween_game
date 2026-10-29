import { AudioManager } from './audio/AudioManager';
import { AudioControls } from './ui/AudioControls';
import './ui/game-fonts';
import { JoinPanel } from './ui/JoinPanel';
import { prepareEntry } from './entry/prepare';
import { readSavedSession } from './entry/session';
import type { JoinRequest } from '../shared/game';

const parent = document.getElementById('game')!;
const audio = new AudioManager(parent);
const audioControls = new AudioControls(parent, audio);
const params = new URLSearchParams(location.search);
const roomId = params.get('room') || 'demo';
const invitationToken = params.get('invite') || undefined;
let loading = false;
let disposed = false;
let disposeGame: (() => void) | undefined;
const panel = new JoinPanel(parent, roomId,
  (nickname, character) => void enter({ roomId, nickname, character }),
  () => panel.setConnection(true));


async function enter(request: JoinRequest): Promise<void> {
  if (loading || disposed || disposeGame) return;
  loading = true;
  panel.showLoading();
  try {
    const { startGame } = await import('./game/start-game');
    if (disposed) return;
    const game = await startGame({ panel, request, audio });
    if (disposed) { game.destroy(true); return; }
    disposeGame = () => game.destroy(true);
  } catch (error) {
    if (!disposed) {
      panel.setConnection(true);
      panel.showError(error instanceof Error ? error.message : 'Не удалось загрузить игру. Обновите страницу.');
    }
  } finally { loading = false; }
}

void prepareEntry(roomId, invitationToken).then(() => {
  if (disposed) return;
  audio.setActive(true);
  let saved: JoinRequest | null = null;
  try { saved = readSavedSession(sessionStorage.getItem('halloween-session:' + roomId), roomId); } catch { /* Storage is optional. */ }
  if (saved) {
    panel.setProfile(saved.nickname, saved.character);
    void enter(saved);
  } else {
    panel.showWelcome();
    panel.setConnection(true);
  }
}).catch(error => {
  if (!disposed) panel.showInvitationRequired(error instanceof Error ? error.message : 'Не удалось проверить приглашение. Обновите страницу.');
});

if (import.meta.hot) import.meta.hot.dispose(() => { disposed = true; disposeGame?.(); audioControls.destroy(); audio.destroy(); panel.destroy(); });