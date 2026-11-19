# 펭귄 빙판 레이스

HTML, CSS, JavaScript로 실행되는 정적 게임입니다. 패키지 설치, 빌드, 환경 변수 없이 Vercel에 배포할 수 있습니다.

## Vercel에 배포

1. 이 폴더의 파일 전체를 GitHub 저장소에 올립니다. `assets`, `css`, `js` 폴더도 포함해야 합니다.
2. Vercel에서 **Add New → Project**를 선택하고 저장소를 가져옵니다.
3. **Root Directory**는 `index.html`과 `vercel.json`이 있는 폴더로 지정합니다.
4. **Deploy**를 누릅니다. `vercel.json`에 Framework Preset은 Other, 빌드·설치 명령은 비움, Output Directory는 `.`으로 설정되어 있습니다.

Node.js가 설치되어 있다면 이 폴더에서 `npx vercel --prod`로 배포할 수도 있습니다. 처음 실행할 때 Vercel 로그인 및 프로젝트 연결을 진행합니다.

공식 문서: https://vercel.com/docs/project-configuration/vercel-json

## 실행 및 OBS

- 배포 URL에서 참가자와 경주 설정을 입력하고 경주를 시작합니다.
- 설정은 해당 브라우저의 localStorage에 저장됩니다.
- URL 뒤에 `?obs=1`을 붙이면 OBS용 화면이 표시됩니다. 화면 크기는 1920 × 1080입니다.
- 정적 배포에서 설정 동기화는 같은 출처·브라우저 저장소를 공유하는 화면 사이에서만 가능합니다. 일반 브라우저와 OBS 브라우저 소스는 저장소가 분리되므로 서로 경주 상태가 동기화되지 않습니다. 방송에서는 일반 게임 화면을 창 캡처하거나, 기존 로컬 런처를 사용하세요.
- 기존 로컬 런처의 공통 UI 및 서버 동기화는 localhost/127.0.0.1 실행 시 유지됩니다. Vercel에서는 런처 전용 경로를 요청하지 않습니다.
