# 뽀롱 온라인 연결하기 (여러 휴대폰끼리 소통)

지금은 **체험 모드**라서 한 기기 안에서만 저장돼요.
아래 순서대로 하면 아티스트 폰과 팬 폰들이 서로 실시간으로 소통할 수 있어요. (약 10분, 무료)

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 에 가입 (GitHub이나 이메일로 가입)
2. **New project** → 이름: `pporong`, 데이터베이스 비밀번호는 아무거나(따로 적어두기), Region: **Northeast Asia (Seoul)**
3. 1~2분 기다리면 준비 완료

## 2. 데이터베이스 설정
1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 폴더의 `supabase.sql` 내용을 통째로 붙여넣기 → **Run**
3. "Success" 가 나오면 끝

## 3. 주소와 키를 config.js 에 넣기
1. 왼쪽 메뉴 **Project Settings → API** (또는 Data API)
2. **Project URL** 과 **anon public** 키를 복사
3. `config.js` 를 열어 붙여넣기:
   ```js
   SUPABASE_URL: 'https://xxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   ARTIST_SIGNUP_CODE: '우리집코드',   // 아티스트 등록 코드 (꼭 바꾸세요)
   ```

## 4. 인터넷에 올리기
1. https://app.netlify.com/drop 에 이 폴더를 통째로 끌어다 놓기 (`v1-backup` 폴더는 빼도 돼요)
2. 나온 주소(https://....netlify.app)를 아이와 친구들 폰에서 열기
3. 사파리: 공유 → **홈 화면에 추가** / 크롬: ⋮ → **홈 화면에 추가**

## 5. 시작하기
- 아티스트: 입장 화면 맨 아래 **새 아티스트 등록하기** → 이름·비밀번호·등록 코드
- 팬: **팬으로 입장** → 닉네임만 정하면 끝

## 알아두실 점
- 무료 요금제로 충분해요 (저장 공간 1GB, 영상 1개 50MB까지).
- 일주일 동안 아무도 쓰지 않으면 Supabase가 프로젝트를 잠시 멈춰요. 대시보드에서 **Restore** 를 누르면 다시 켜져요.
- 아티스트 비밀번호는 아이들 놀이용 잠금이에요. 은행처럼 강력한 보안은 아니니, 진짜 개인정보(실명·전화번호·주소)는 올리지 않도록 아이와 약속해 주세요.
- 주소(Netlify 링크)를 아는 사람은 누구나 팬으로 들어올 수 있어요. 주소는 아는 친구들에게만 알려주세요.
