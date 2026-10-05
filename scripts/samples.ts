// Hand-written skits that show what the theater can act out (scripts/gallery.ts
// draws them; the tests play them). In use, skits come from the model.
export const SAMPLE_SKITS = {
  skits: [
    {
      title: 'Merge Conflict Live',
      place: { backdrop: 'stage', sky: 'none', weather: 'confetti', colors: { far: '#1a1b26', near: '#8c2f39', ground: '#3b2f2f', accent: '#ffd166' } },
      cast: [
        { name: 'Clawd', color: '#d77757', look: { eyes: 'shades', colors: {}, hat: [], held: [] } },
        { name: 'Bit', color: '#7aa2f7', look: null },
        { name: 'Byte', color: '#9ece6a', look: { eyes: 'normal', colors: { A: '#bb9af7', B: '#565f89' }, hat: ['....BBBBBBBBBBBBBBBBBBBB....', '...B....................B...', 'AAA......................AAA', 'AAA......................AAA'], held: [] } },
      ],
      props: [
        { id: 'guitar', x: 0.15, motion: 'still', colors: { R: '#f7768e', W: '#e9e4da', K: '#3b2f2f' }, frames: [['..........KK', '.........KK.', '........KK..', '.......KK...', '..RRR.KK....', '.RRRRKK.....', 'RRWRRRR.....', 'RRRRRR......', '.RRRR.......']] },
        { id: 'drums', x: 0.5, motion: 'still', effect: 'none', colors: { D: '#c0caf5', R: '#bb9af7', Y: '#ffd166' }, frames: [['Y..........Y', 'YY........YY', '.DDDDDDDDDD.', 'DRRRRRRRRRRD', 'DRDDDDDDDDRD', 'DRRRRRRRRRRD', '.DDDDDDDDDD.']] },
        { id: 'keys', x: 0.85, motion: 'still', colors: { K: '#24283b', W: '#e9e4da' }, frames: [['KKKKKKKKKKKKKKKK', 'KWKWKWWKWKWKWWKK', 'KWWWWWWWWWWWWWWK', 'K..............K', 'K..............K']] },
      ],
      beats: [
        { secs: 3, acts: [{ who: 'Clawd', do: 'strum', prop: 'guitar', say: 'one, two!' }, { who: 'Bit', do: 'drum', prop: 'drums' }, { who: 'Byte', do: 'keys', prop: 'keys' }] },
        { secs: 3, acts: [{ who: 'Clawd', do: 'strum', prop: 'guitar' }, { who: 'Bit', do: 'drum', prop: 'drums', say: 'rebase!' }, { who: 'Byte', do: 'dance' }] },
        { secs: 2, acts: [{ who: 'Clawd', do: 'jump', effect: 'stars' }, { who: 'Byte', do: 'cheer' }] },
        { secs: 3, acts: [{ who: 'Clawd', do: 'bow', say: 'thank you!' }, { who: 'Bit', do: 'bow' }, { who: 'Byte', do: 'bow' }] },
      ],
    },
    {
      title: 'Road trip to prod',
      place: { backdrop: 'road', sky: 'sun', weather: 'clear', colors: { far: '#3d59a1', near: '#565f89', ground: '#3b3b44', accent: '#ffd166' } },
      cast: [
        { name: 'Clawd', color: '#d77757', look: null },
        { name: 'Pixel', color: '#bb9af7', look: { eyes: 'happy', colors: { A: '#ff8fab' }, hat: [], held: [] } },
      ],
      props: [
        { id: 'car', x: 0.3, motion: 'still', colors: { R: '#f7768e', W: '#b4f9f8', K: '#1a1b26', G: '#c0caf5' }, frames: [['......RRRRRRRRRR......', '.....RWWWWRWWWWWR.....', 'RRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRG', '..KKK..........KKK....', '..KGK..........KGK....'], ['......RRRRRRRRRR......', '.....RWWWWRWWWWWR.....', 'RRRRRRRRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRRRRRRRG', '..KKK..........KKK....', '..GKG..........GKG....']] },
        { id: 'burger', x: 0.85, motion: 'bob', effect: 'steam', colors: { B: '#e0af68', G: '#9ece6a', M: '#8b5a2b' }, frames: [['.BBBBBB.', 'BBBBBBBB', 'GGGGGGGG', 'MMMMMMMM', 'BBBBBBBB']] },
      ],
      beats: [
        { secs: 4, acts: [{ who: 'Clawd', do: 'ride', prop: 'car', say: 'road trip!' }, { who: 'Pixel', do: 'wave' }] },
        { secs: 3, acts: [{ who: 'Clawd', do: 'walk', to: 0.6 }, { who: 'Pixel', do: 'eat', prop: 'burger', say: 'snack stop' }] },
        { secs: 3, acts: [{ who: 'Clawd', do: 'hug', with: 'Pixel' }] },
      ],
    },
    {
      title: 'Kung fu code review',
      place: { backdrop: 'castle', sky: 'moon', weather: 'sakura', colors: { far: '#2a2e45', near: '#414868', ground: '#4a3b35', accent: '#e0af68' } },
      cast: [
        { name: 'Clawd', color: '#d77757', look: { eyes: 'normal', colors: { R: '#f7768e' }, hat: ['RRRRRRRRRRRRRRRRRRRRRRRRRRRR', '..........................RR'], held: [] } },
        { name: 'Lint', color: '#565f89', look: { eyes: 'normal', colors: { K: '#1a1b26' }, hat: ['KKKKKKKKKKKKKKKKKKKKKKKKKKKK'], held: [] } },
      ],
      props: [],
      beats: [
        { secs: 2, acts: [{ who: 'Clawd', do: 'bow' }, { who: 'Lint', do: 'bow', say: 'review me' }] },
        { secs: 3, acts: [{ who: 'Clawd', do: 'punch', with: 'Lint', say: 'hiyaa!' }] },
        { secs: 3, acts: [{ who: 'Lint', do: 'kick', with: 'Clawd' }] },
        { secs: 3, acts: [{ who: 'Clawd', do: 'chase', with: 'Lint', say: 'nitpick!' }] },
        { secs: 2, acts: [{ who: 'Clawd', do: 'highfive', with: 'Lint', say: 'LGTM' }] },
      ],
    },
    {
      title: 'Release party',
      place: { backdrop: 'room', sky: 'none', weather: 'confetti', colors: { far: '#1f2335', near: '#3d2f5b', ground: '#2f2a3d', accent: '#ff8fab' } },
      cast: [
        { name: 'Clawd', color: '#d77757', look: { eyes: 'shades', colors: {}, hat: [], held: [] } },
        { name: 'Mo', color: '#ff8fab', look: { eyes: 'happy', colors: { Y: '#ffd166' }, hat: ['..........YY....YY..........', '..........YYYYYYYY..........'], held: [] } },
        { name: 'Dot', color: '#9ece6a', look: null },
      ],
      props: [
        { id: 'camera', x: 0.9, motion: 'still', colors: { K: '#24283b', G: '#c0caf5', W: '#e9e4da' }, frames: [['..KK....', 'KKKKKKKK', 'KGGWWGGK', 'KGWKKWGK', 'KGGWWGGK', 'KKKKKKKK']] },
        { id: 'ball', x: 0.8, motion: 'bob', colors: { R: '#f7768e', W: '#e9e4da' }, frames: [['.RRRR.', 'RRWRRR', 'RRRRRR', '.RRRR.']] },
      ],
      moves: [
        { name: 'moonwalk', tempo: 3, frames: [{ left: 'out', right: 'down', legs: 'step', flip: true }, { left: 'down', right: 'out', legs: 'stand', flip: true, lift: 1 }] },
        { name: 'robot', tempo: 3, effect: 'sparks', frames: [{ left: 'up', right: 'down' }, { left: 'mid', right: 'mid' }, { left: 'down', right: 'up' }, { left: 'mid', right: 'mid', low: true }] },
      ],
      beats: [
        { secs: 3, acts: [{ who: 'Clawd', do: 'moonwalk', to: 0.2, say: 'shipped!' }, { who: 'Mo', do: 'clap' }, { who: 'Dot', do: 'juggle', prop: 'ball' }] },
        { secs: 3, acts: [{ who: 'Clawd', do: 'lift', with: 'Mo', say: 'v2.0!' }, { who: 'Dot', do: 'photo', prop: 'camera', with: 'Mo' }] },
        { secs: 3, acts: [{ who: 'Mo', do: 'waltz', with: 'Dot' }, { who: 'Clawd', do: 'robot', say: 'beep boop' }] },
        { secs: 2, acts: [{ who: 'Clawd', do: 'teleport', to: 0, say: 'ta-da' }, { who: 'Mo', do: 'laugh' }, { who: 'Dot', do: 'salute' }] },
        { secs: 2, acts: [{ who: 'Clawd', do: 'flip' }, { who: 'Mo', do: 'cheer' }, { who: 'Dot', do: 'kneel', with: 'Mo' }] },
      ],
    },
  ],
}
