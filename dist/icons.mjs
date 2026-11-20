const paths = {
  brand:'M3 20V4h17v5h-8v11h-9ZM3 14h5m4-5v5',
  link:'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  cursor:'m5 3 14 9-7 1-3 7-4-17Z',
  wall:'M3 5h18v14H3zM3 12h18M9 5v7m6 0v7',
  door:'M4 21h16M7 21V4h10v17m-3-9h.01',
  window:'M4 4h16v16H4zM12 4v16M4 12h16',
  hand:'M8 13V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5a7.5 7.5 0 0 1-14 4l-3-4c-1-2 1-3 2-2l3 2',
  undo:'M9 5 4 10l5 5m-5-5h10a5 5 0 0 1 0 10h-3',
  redo:'m15 5 5 5-5 5m5-5H10a5 5 0 0 0 0 10h3',
  plan:'M4 4h16v16H4zM4 11h8v9m0-9h3',
  cube:'m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5m8 4.5v9',
  north:'m12 2 7 18-7-4-7 4 7-18Z',
  fit:'M9 4H4v5m11-5h5v5m0 6v5h-5m-6 0H4v-5',
  plus:'M12 5v14M5 12h14',
  minus:'M5 12h14',
  file:'M13 3H5v18h14V9l-6-6Zm0 0v6h6m-7 3v6m-3-3h6',
  check:'M5 12l4 4L19 6',
  measure:'m3 15 12-12 6 6L9 21l-6-6Zm4-4 2 2m1-5 2 2m1-5 2 2',
  magnet:'M5 4h5v9a2 2 0 0 0 4 0V4h5v9a7 7 0 0 1-14 0V4Zm0 5h5m4 0h5',
  list:'M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01',
  close:'m6 6 12 12M18 6 6 18',
  trash:'M4 7h16m-14 0 1 14h10l1-14M9 7V4h6v3'
};
export function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + paths[name] + '"/></svg>';
}
export function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
}
