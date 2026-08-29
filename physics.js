/* ============================================================
   physics.js — 서버와 클라이언트가 공유하는 플레이어 이동 물리
   ------------------------------------------------------------
   순수 함수/상수만 있고 three.js나 Node 전용 API를 쓰지 않음.
   → 서버(server.js)와 브라우저(h.html) 양쪽에서 동일하게 import해서
     "완전히 같은 계산"을 하도록 만드는 것이 핵심.
     (클라이언트 예측과 서버 판정 결과가 어긋나면 예측이 의미 없어짐)
   ============================================================ */

export const PHYSICS = {
    SPEED: 40,
    GRAVITY: -25,
    JUMP_FORCE: 8,
    BOUNDS: 19,     // 필드 경계 (40x40 맵 기준)
    GROUND_Y: 0.5,  // 캐릭터가 서있는 바닥 높이
    COYOTE_TIME: 0.12,      // 바닥에서 떨어진 직후에도 점프를 허용하는 유예시간(초)
    JUMP_BUFFER_TIME: 0.12, // 착지 전 미리 누른 점프를 기억해두는 시간(초)
};

// state: { x, y, z, vy, isGrounded, coyoteTimer, jumpBufferTimer }
// input: { moveX, moveZ, jump } — moveX/moveZ는 이미 정규화된 월드좌표 방향
export function stepPlayer(state, input, dt) {
    if (state.coyoteTimer === undefined) state.coyoteTimer = 0;
    if (state.jumpBufferTimer === undefined) state.jumpBufferTimer = 0;

    state.x += input.moveX * PHYSICS.SPEED * dt;
    state.z += input.moveZ * PHYSICS.SPEED * dt;

    state.x = Math.max(-PHYSICS.BOUNDS, Math.min(PHYSICS.BOUNDS, state.x));
    state.z = Math.max(-PHYSICS.BOUNDS, Math.min(PHYSICS.BOUNDS, state.z));

    // 코요테 타임: 바닥에 있으면 유예시간을 꽉 채워두고, 공중이면 서서히 소모
    if (state.isGrounded) {
        state.coyoteTimer = PHYSICS.COYOTE_TIME;
    } else {
        state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);
    }

    // 점프 버퍼: 점프를 누르면 일정 시간 동안 "예약"해두고, 안 누르면 서서히 소멸
    if (input.jump) {
        state.jumpBufferTimer = PHYSICS.JUMP_BUFFER_TIME;
    } else {
        state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
    }

    // 예약된 점프가 있고, 지금 바닥이거나 코요테 타임 안이면 점프 실행
    if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
        state.vy = PHYSICS.JUMP_FORCE;
        state.isGrounded = false;
        state.jumpBufferTimer = 0;
        state.coyoteTimer = 0;
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