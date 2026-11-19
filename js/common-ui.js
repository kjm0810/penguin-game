// 공통 설정 UI(런처의 /_game_core/ui.js): 큰 항목만 접고 펼친다. 기존 조작부(id·이벤트)는 그대로 옮긴다.
// 런처 없이 열면 공통 UI 없이 기본 조작판 그대로 쓴다.
let createGameUI = null;
try {
  const launcher = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '';
  if (launcher) {
    ({ createGameUI } = await import('/_game_core/ui.js'));
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/_game_core/ui.css';
    document.head.append(stylesheet);
  }
} catch {
  createGameUI = null;
}

const panel = document.querySelector('.panel');
if (panel && createGameUI) {
  const groupFor = (selector) => panel.querySelector(selector)?.closest('.group');
  const sections = [
    {
      title: '경주',
      expanded: true,
      children: [
        { title: '', element: groupFor('#raceControls') },
        { title: '', element: groupFor('#results') },
        { title: '', element: groupFor('#names') },
      ],
    },
    {
      title: '경주 설정',
      children: [{ title: '', element: groupFor('#duration') }],
    },
    {
      title: 'OBS 설정',
      children: [{ title: '', element: groupFor('#visibility') }],
    },
  ];
  const nodes = sections.flatMap((s) => s.children.map((c) => c.element));
  if (nodes.some((n) => !n) || new Set(nodes).size !== nodes.length) {
    console.warn('[PENGUIN RACE UI] 설정 항목을 찾지 못해 기본 화면을 유지합니다');
  } else {
    createGameUI({ panel, title: '펭귄 빙판 레이스', sections });
  }
}
