// ===== 뽀롱 설정 =====
// Supabase 주소와 키를 넣으면 '온라인 모드'가 되어 여러 휴대폰끼리 소통할 수 있어요.
// 비워두면 '체험 모드'로, 이 기기(브라우저) 안에서만 저장돼요.
// (anon 키는 원래 공개용 키라서 여기 있어도 괜찮아요)
window.PPORONG_CONFIG = {
  SUPABASE_URL: 'https://ehdstqbgtlakajslpqed.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZHN0cWJndGxha2Fqc2xwcWVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0MjQwMzMsImV4cCI6MjExMTAwMDAzM30.lS1aGmpa8dXQxzPnbPK72hrLayu8GW9bFXVfOvXBaMA',

  // 새 아티스트를 등록할 때 필요한 코드 — 코드 자체가 아니라 암호화된 값만 저장해요.
  // 코드를 바꾸려면 SETUP.md 의 '등록 코드 바꾸기'를 보세요.
  ARTIST_SIGNUP_CODE_HASH: '0845833d683ef28ff8a43f3ce5b28622139f64a44968f3d94915c9defd36e6b8',
};
