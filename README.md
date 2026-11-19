# 펭귄 빙판 레이스

HTML, CSS, JavaScript 게임과 Vercel Function으로 구성됩니다. 별도 패키지 설치나 빌드는 필요하지 않습니다. OBS 동기화에는 Upstash Redis 연결이 필요합니다.

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
- 조작 화면의 **OBS 주소 복사**를 누르고 OBS 브라우저 소스 URL에 붙여 넣습니다. 화면 크기는 1920 × 1080입니다. 기존 `?obs=1` 주소는 전용 주소로 교체해야 합니다.
- OBS에서는 게임 프레임 바깥 여백만 투명하게 표시합니다. 프레임 안의 하늘·바다·빙판과 시상대 배경은 유지합니다.
- 사용자 브라우저마다 별도 방이 생성됩니다. OBS 주소에는 읽기 전용 방 ID만 포함되며 조작 키는 조작 브라우저에 저장됩니다. 브라우저 데이터를 삭제하면 새 OBS 주소가 필요합니다.
- OBS는 약 1초마다 서버 상태를 확인하고 같은 seed와 서버 기준 시각으로 경주를 계산합니다. 네트워크 지연에 따라 짧은 차이가 있을 수 있습니다. 방 데이터는 마지막 변경으로부터 7일 후 만료됩니다.
- 기존 로컬 런처의 공통 UI 및 서버 동기화는 localhost/127.0.0.1 실행 시 유지됩니다. Vercel에서는 런처 전용 경로를 요청하지 않습니다.

## Upstash Redis 연결 (최초 1회)

1. Vercel 프로젝트의 Storage/Marketplace에서 **Upstash Redis**를 생성하거나 기존 데이터베이스를 연결합니다.
2. 프로젝트 Settings → Environment Variables에서 `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN`을 등록합니다. Upstash 데이터베이스의 REST API 항목에서 확인할 수 있습니다. 연동이 `KV_REST_API_URL`, `KV_REST_API_TOKEN`을 자동 등록했다면 그것도 지원합니다.
3. Production 및 필요한 Preview 환경에 적용한 후 **Redeploy**합니다. 토큰은 서버 환경 변수에만 저장하고 HTML이나 GitHub에 넣지 마세요.
4. 조작 화면에 **서버 동기화 연결됨**이 표시되면 OBS 전용 주소를 복사합니다. 조작 화면에서 경주 시작·결과 바로 보기·초기화·숨기기를 실행해 OBS 반영을 확인합니다.

OBS 소스가 열려 있는 동안 읽기 요청이 발생하므로 사용량은 Vercel 및 Upstash 대시보드에서 확인할 수 있습니다.

공식 문서: https://upstash.com/docs/redis/features/restapi
