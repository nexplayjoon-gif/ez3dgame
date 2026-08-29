/* ============================================================
   bot.js — 테스트용 헤드리스 봇 클라이언트
   ------------------------------------------------------------
   실제 브라우저(h.html) 없이 WebSocket으로 서버에 그냥 접속해서
   서버가 기대하는 입력 메시지 포맷을 그대로 흉내 내는 스크립트.
   서버 입장에서는 진짜 플레이어와 구분되지 않음.

   실행:
     node bot.js [봇 개수] [서버 주소]

   예:
     node bot.js 5
     node bot.js 3 ws://localhost:3000
     node bot.js 5 ws://192.168.0.10:3000   (다른 PC에 있는 서버 테스트)

   ※ Render 등 외부 호스팅에 배포한 서버를 테스트할 때는 반드시
     wss://(암호화된 웹소켓)로 접속해야 합니다. http가 아니라 https로
     서비스되는 서버는 평문 ws://로 접속하면 핸드셰이크가 거부됩니다.
       node bot.js 5 wss://내앱이름.onrender.com
   ============================================================ */

import WebSocket from 'ws';

const BOT_COUNT = Number(process.argv[2]) || 3;
const SERVER_URL = process.argv[3] || 'wss://ez3dgame.onrender.com';

const TICK_RATE = 60; // 서버 tick과 맞춰서 자연스럽게 보이도록

function createBot(index) {
    let ws;
    let seq = 0;
    let myId = null;

    // 현재 행동 상태
    let yaw = Math.random() * Math.PI * 2;
    let moveX = 0;
    let moveZ = 0;
    let jump = false;
    let shoot = false;

    let sendTimer = null;
    const behaviorTimers = [];

    function randomizeDirection() {
        const angle = Math.random() * Math.PI * 2;
        // 항상 전속력으로 움직이지 않고 가끔은 멈춰서 서있기도 함
        const willMove = Math.random() < 0.85;
        moveX = willMove ? Math.cos(angle) : 0;
        moveZ = willMove ? Math.sin(angle) : 0;
    }

    function connect() {
        ws = new WebSocket(SERVER_URL);

        ws.on('open', () => {
            console.log(`[bot ${index}] 서버에 접속함`);
            randomizeDirection();
        });

        ws.on('message', (raw) => {
            try {
                const data = JSON.parse(raw);
                if (data.type === 'welcome') {
                    myId = data.id;
                    console.log(`[bot ${index}] ${myId} 로 배정됨`);
                }
            } catch (e) {
                // 무시 (봇은 상태를 렌더링하지 않으므로 파싱 실패해도 문제 없음)
            }
        });

        ws.on('close', () => {
            console.log(`[bot ${index}] 연결 끊김 — 3초 후 재접속 시도`);
            cleanupTimers();
            setTimeout(connect, 3000);
        });

        ws.on('error', (err) => {
            console.error(`[bot ${index}] 에러:`, err && (err.message || err.code) ? (err.message || err.code) : err);
        });

        ws.on('unexpected-response', (req, res) => {
            console.error(`[bot ${index}] 서버가 웹소켓이 아닌 응답을 줌 (status: ${res.statusCode}) — 주소가 맞는지, wss://인지 확인하세요`);
        });

        startBehaviorLoops();
    }

    function cleanupTimers() {
        if (sendTimer) clearInterval(sendTimer);
        behaviorTimers.forEach(clearInterval);
        behaviorTimers.length = 0;
    }

    function startBehaviorLoops() {

        // 이동 방향을 몇 초마다 랜덤하게 재선택
        behaviorTimers.push(setInterval(() => {
            randomizeDirection();
        }, 1000 + Math.random() * 2500));

        // 시점(yaw)을 계속 조금씩 랜덤하게 회전 → 사격 방향도 같이 바뀜
        behaviorTimers.push(setInterval(() => {
            yaw += (Math.random() - 0.5) * 1.2;
        }, 150));

        // 가끔 점프 (버퍼/코요테 타임이 서버에서 알아서 처리해주니 그냥 순간 신호만 보내면 됨)
        behaviorTimers.push(setInterval(() => {
            if (Math.random() < 0.35) {
                jump = true;
            }
        }, 700 + Math.random() * 1500));

        // 사격을 켰다 껐다 (연사처럼 잠깐 유지)
        behaviorTimers.push(setInterval(() => {
            shoot = Math.random() < 0.4;
        }, 250 + Math.random() * 600));

        // 실제 입력 전송 (서버 tick과 동일한 60Hz)
        sendTimer = setInterval(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;

            seq++;

            ws.send(JSON.stringify({
                type: 'input',
                seq,
                moveX,
                moveZ,
                jump,
                shoot,
                yaw
            }));

            // 점프는 눌렀다 뗀 것처럼 한 틱만 true로 보내고 바로 끔

            // 점프는 눌렀다 뗀 것처럼 한 틱만 true로 보내고 바로 끔
            if (jump) jump = false;

        }, 1000 / TICK_RATE);
    }

    connect();
}

console.log(`${BOT_COUNT}개의 봇을 ${SERVER_URL} 에 접속시킵니다...`);

for (let i = 0; i < BOT_COUNT; i++) {
    // 한꺼번에 몰려서 접속하지 않도록 살짝 시차를 둠
    setTimeout(() => createBot(i + 1), i * 200);
}
