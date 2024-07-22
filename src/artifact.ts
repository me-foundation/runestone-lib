import { Cenotaph } from './cenotaph';
import { Runestone } from './runestone';

export type Artifact = Cenotaph | Runestone;

export function isRunestone(artifact: Artifact): artifact is Runestone {
  return !('flaws' in artifact);
}
