import { pixelSprite } from './pixelSprite';

// Rock edges, embedded material and negative extraction shapes share a small opaque palette.
const P = { o: '#211e20', r: '#4d4440', s: '#776655', m: '#b6a080', h: '#e2cea0', c: '#7a9b9d', b: '#3f626c' };
export const DISCOVERY_ART = {
  METAL: {
    SEALED: pixelSprite([
      '......oooooo........', '...ooorrrrrrooo.....', '..orrrssrrrrrrro....',
      '.orrssrrrrrssrrro...', '.orrsrrmmrrsrrrro...', 'orrsrrrmhrrrsrrrro..',
      'orrrrrrrrrrrsrrrro..', 'orrsrrrmmrrrsrrrro..', '.orrsrrmhrrrsrrro...',
      '.orrrsrrrrrssrrro...', '..orrrssrrrrrrro....', '...ooorrrrrrooo.....',
      '......oooooo........', '....................', '....................', '....................',
    ], P),
    EXPOSED: pixelSprite([
      '......oooooo........', '...ooorrrrrrooo.....', '..orrsoooooosrro....',
      '.orrsohmmmhomrsro...', '.orsohmmmhhmmsrro...', 'orrsohmmhmmmmoorrro.',
      'orrsoommmmmmhorsrro.', 'orsromhhmmmmoorrsro.', '.orsrommmmhhomrsro..',
      '.orrsoohmmmoosrrro..', '..orrsooooosrrrro...', '...oorrrsrrrrooo....',
      '.....ooooooo........', '....rr........sr....', '..rs...........rr...', '....................',
    ], P),
    SPENT: pixelSprite([
      '....................', '....................', '.....rrrrrr.........',
      '...rrsoooosrr.......', '..rsoooooooosr......', '..rsoooooooosr......',
      '..rsoooooooosr......', '...rsooooosrr.......', '....rrssrrr.........',
      '......rr............', '....................', '....rr......rr......',
      '..rr...........rr...', '....................', '....................', '....................',
    ], P),
  },
  FOSSIL: {
    SEALED: pixelSprite([
      '......ooooooo.......', '...ooorrrrrrrooo....', '..orrrssssrrrrrro...',
      '.orrssrrmmmrsrrro...', '.orrsrrmrrrmrsrro...', 'orrsrrmrrrrrrrsrro..',
      'orrsrrmrrmmrrrsrro..', 'orrsrrrmrrmrrrsrro..', '.orrsrrrmmrrrsrro...',
      '.orrssrrrrrrssrro...', '..orrrssssrrrrro....', '...ooorrrrrrooo.....',
      '......oooooo........', '....................', '....................', '....................',
    ], P),
    EXPOSED: pixelSprite([
      '......ooooooo.......', '...ooorrrrrrrooo....', '..orroohhhhmoorrro..',
      '.orrohhmmmmhmoorrro.', '.orrohmoooommhoorro.',
      'orrohmooohhomhorrro.', 'orrohmoohmmhomhorrro', 'orrohmohmoohomhorrro',
      '.orrohmohhhommhorro.', '.orroohmmmmmhmoorro.', '..orroohhhhmooorrro.', '...orrroooooorooo...',
      '.....ooooooo........', '...rr..........rr...', '.....sr.............', '....................',
    ], P),
    SPENT: pixelSprite([
      '....................', '....................', '.....rrrrrrr........',
      '...rrsooooosrr......', '..rsoooooooosrr.....', '..rsoorrroooosr.....',
      '..rsorooorooosr.....', '..rsoorrroooosr.....', '...rsooooooosr......',
      '....rrsssssrr.......', '......rrrrr.........', '....................',
      '...rr.........rr....', '.....rr.............', '....................', '....................',
    ], P),
  },
  RESEARCH: {
    SEALED: pixelSprite([
      '.......oooooo.......', '....ooorrrrrrooo....', '...orrssrrrrrrrro...',
      '..orrsrrcbrrsrrro...', '..orrsrrcbrrsrrro...', '.orrsrrrcbrrsrrrro..',
      '.orrsrrbcrrrsrrrro..', '.orrsrrcbrrrsrrrro..', '..orrsrrcbrrsrrro...',
      '..orrrssrrrrssrro...', '...orrrrrrrrrrro....', '....ooorrrrrooo.....',
      '.......ooooo........', '....................', '....................', '....................',
    ], P),
    EXPOSED: pixelSprite([
      '.......oo...........', '......ohco..........', '...o..ohcco..o......',
      '..ohcoohccboohco....', '..ohccoohcbohccbo...', '.orhccbohcbohccbo...',
      '.orhccbohcbohccbor..', '.orrhccohccohcborr..', '..orhcbohcbohborr...',
      '..orrhccohcboorrro..', '...orroobboorrro....', '....ooorrrrrooo.....',
      '.......ooooo........', '...rr..........rr...', '.....rs.......rr....', '....................',
    ], P),
    SPENT: pixelSprite([
      '....................', '....................', '....................',
      '.....r...r..........', '....ror.ror..r......', '....ror.ror.ror.....',
      '...rsooroorsoosr....', '...rsoooooooosrr....', '....rrsssssrrr......',
      '......rrrrr.........', '....................', '...rr.........rr....',
      '.....rr.............', '....................', '....................', '....................',
    ], P),
  },
} as const;
