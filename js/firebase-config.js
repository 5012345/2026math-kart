// ─────────────────────────────────────────────────────────────
// Firebase 설정
//  1) https://console.firebase.google.com 에서 프로젝트 생성 (무료 Spark 요금제)
//  2) 빌드 > Realtime Database > 데이터베이스 만들기 (위치: asia-southeast1 권장)
//  3) 프로젝트 설정 > 내 앱 > 웹 앱 추가 → 나오는 firebaseConfig 값을 아래에 붙여넣기
//
//  apiKey 가 "여기에" 로 시작하는 동안에는 '로컬 테스트 모드'로 동작합니다.
//  (같은 브라우저의 여러 탭끼리만 연결 — 혼자 테스트할 때 사용)
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: '여기에_API_KEY',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
