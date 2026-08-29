/* ============================================================
   physics.js — 서버와 클라이언트가 공유하는 플레이어 이동 물리
   ------------------------------------------------------------
   순수 함수/상수만 있고 three.js나 Node 전용 API를 쓰지 않음.
   → 서버(server.js)와 브라우저(h.html) 양쪽에서 동일하게 import해서
     "완전히 같은 계산"을 하도록 만드는 것이 핵심.
     (클라이언트 예측과 서버 판정 결과가 어긋나면 예측이 의미 없어짐)
   ============================================================ */

export const PHYSICS = {
    SPEED: 10,
    GRAVITY: -25,
    JUMP_FORCE: 8,
    BOUNDS: 19,     // 필드 경계 (40x40 맵 기준)
    GROUND_Y: 0.5,  // 캐릭터가 서있는 바닥 높이
};

// state: { x, y, z, vy, isGrounded } — 이 함수가 직접 수정(mutate)함
// input: { moveX, moveZ, jump } — moveX/moveZ는 이미 정규화된 월드좌표 방향
export function stepPlayer(state, input, dt) {
    state.x += input.moveX * PHYSICS.SPEED * dt;
    state.z += input.moveZ * PHYSICS.SPEED * dt;

    state.x = Math.max(-PHYSICS.BOUNDS, Math.min(PHYSICS.BOUNDS, state.x));
    state.z = Math.max(-PHYSICS.BOUNDS, Math.min(PHYSICS.BOUNDS, state.z));

    if (input.jump && state.isGrounded) {
        state.vy = PHYSICS.JUMP_FORCE;
        state.isGrounded = false;
    }

    state.vy += PHYSICS.GRAVITY * dt;
    state.y += state.vy * dt;

    if (state.y <= PHYSICS.GROUND_Y) {
        state.y = PHYSICS.GROUND_Y;
        state.vy = 0;
        state.isGrounded = true;
    }

    return state;
}