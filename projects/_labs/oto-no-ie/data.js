(function (root) {
  'use strict';
  root.OTO_LEVELS = [
    {
      id: 'first-hall',
      title: 'はじまりの廊下',
      hint: '音は3マスまで届く。曲がり角の先へ鈴をつなごう。',
      range: 3,
      maxBells: 3,
      maxMirrors: 2,
      grid: [
        '#######',
        '#S....#',
        '#D###.#',
        '#.#...#',
        '#.#.###',
        '#...#E#',
        '###.#.#',
        '#.....#',
        '#######'
      ],
      solution: [[4, 1], [5, 3], [7, 4]],
      mirrorSolution: []
    },
    {
      id: 'glass-window',
      title: 'ガラスの窓',
      hint: 'ガラスは音を通すが、人は通れない。',
      range: 3,
      maxBells: 3,
      maxMirrors: 2,
      grid: [
        '#######',
        '#S.!..#',
        '#..!..#',
        '#..!..#',
        '#..!..#',
        '#..!.E#',
        '#..!..#',
        '#.....#',
        '#######'
      ],
      solution: [[1, 4], [2, 5]],
      mirrorSolution: []
    },
    {
      id: 'closed-door',
      title: '閉じた扉',
      hint: '閉じた扉は音も人も通さない。別の道を探そう。',
      range: 3,
      maxBells: 3,
      maxMirrors: 2,
      grid: [
        '#######',
        '#S..#.#',
        '#.#.#.#',
        '#.#X#.#',
        '#.#...#',
        '#.D.#E#',
        '#.###.#',
        '#.....#',
        '#######'
      ],
      solution: [[2, 1], [5, 1], [4, 3]],
      mirrorSolution: []
    },
    {
      id: 'corner-house',
      title: '曲がり角',
      hint: '最後の鈴から出口の鐘が聞こえればゴール。',
      range: 3,
      maxBells: 3,
      maxMirrors: 2,
      grid: [
        '#######',
        '#S....#',
        '#.###.#',
        '#X#..D#',
        '#.#.#.#',
        '#...#E#',
        '#.###.#',
        '#.....#',
        '#######'
      ],
      solution: [[1, 3], [2, 5]],
      mirrorSolution: []
    },
    {
      id: 'last-room',
      title: '最後の部屋',
      hint: '鈴は3つ。音の届く範囲をよく見て。',
      range: 3,
      maxBells: 3,
      maxMirrors: 2,
      grid: [
        '#######',
        '#S..#.#',
        '#.#.#.#',
        '#.#X..#',
        '#.#.#.#',
        '#...#E#',
        '#.#D#.#',
        '#.....#',
        '#######'
      ],
      solution: [[4, 1], [5, 3], [7, 4]],
      mirrorSolution: []
    },
    {
      id: 'resonance-hall',
      title: '響きの橋',
      hint: '鏡は音を受けてもう一度響かせる。1つの鈴で遠くまで届けよう。',
      range: 3,
      maxBells: 1,
      maxMirrors: 2,
      grid: [
        '#######',
        '#S....#',
        '#.A.A.#',
        '#.....#',
        '#.....#',
        '#....E#',
        '#.....#',
        '#.....#',
        '#######'
      ],
      solution: [[1, 5]],
      mirrorSolution: [[1, 3], [4, 5]]
    },
    {
      id: 'silent-room',
      title: '吸音の間',
      hint: 'Aは音を止めるカーテン。人は通れる。鏡で音だけを回り込ませよう。',
      range: 3,
      maxBells: 1,
      maxMirrors: 2,
      grid: [
        '#######',
        '#S....#',
        '#.A.A.#',
        '#.....#',
        '#.A.A.#',
        '#.....#',
        '#.A.A.#',
        '#....E#',
        '#######'
      ],
      solution: [[1, 5]],
      mirrorSolution: [[1, 3], [4, 5]]
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
