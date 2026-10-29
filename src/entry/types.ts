import type { AudioManager } from '../audio/AudioManager';
import type { JoinRequest } from '../../shared/game';
import type { JoinPanel } from '../ui/JoinPanel';
export interface GameEntry { panel: JoinPanel; request: JoinRequest; audio: AudioManager }