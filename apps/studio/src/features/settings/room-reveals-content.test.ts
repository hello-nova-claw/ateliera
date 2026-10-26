import { describe, expect, it } from 'vitest';
import roomReveals from '../../content/room-reveals.json';
import { selectRoomReveal } from './room-reveal';
import { NEW_STUDIO_PREFERENCES } from './room-visibility';

describe('room reveal content', () => {
  it('holds one invitation for each of the five revealable rooms', () => {
    expect(Object.keys(roomReveals)).toEqual([
      'identity',
      'season',
      'reflection',
      'wisdom',
      'uncharted',
    ]);
    expect(roomReveals.identity).toBe(
      'There is a room for who you are becoming — Identity Studio.',
    );
  });

  it('is the copy a reveal offers', () => {
    const offer = selectRoomReveal(
      {
        captureCount: 3,
        hasPlacedLifeAreaCard: false,
        hasSeason: false,
        hasWisdomSource: false,
      },
      NEW_STUDIO_PREFERENCES,
    );
    expect(offer).toEqual({ room: 'identity', copy: roomReveals.identity });
  });
});
