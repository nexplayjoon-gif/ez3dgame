import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { PHYSICS, stepPlayer } from './physics.js';

const PORT = process.env.PORT || 3000;
let nextBulletId = 1;
// ============================================================
// HTTP 정적 파일 서버 (h.html 및 ez3d.js 제공용)
// ============================================================
const server = createServer((req, res) => {
    let filePath = req.url === '/' ? '/h.html' : req.url;
    filePath = join(process.cwd(), filePath);

    const ext = extname(filePath);
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
    };

    if (existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
        res.end(readFileSync(filePath));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const wss = new WebSocketServer({ server });

// ============================================================
// 게임 상태 관리 데이터
// ============================================================
const players = new Map();
let nextPlayerId = 1;

// 맵 및 사격 관련 상수 (이동/중력/점프는 physics.js의 PHYSICS 사용)
const SHOOT_COOLDOWN = 0.08;
const BULLET_SPEED = 45;
const BULLET_HIT_RADIUS = 0.8;

// ============================================================
// 플레이어 및 총알 객체 생성
// ============================================================
function spawnPlayer(id) {
    return {
        id: `Player_${id}`,
        x: (Math.random() - 0.5) * 20,
        y: 0.5,
        z: (Math.random() - 0.5) * 20,
        vy: 0,
        yaw: 0,
        hp: 100,
        kills: 0,
        deaths: 0,
        isGrounded: true,
        coyoteTimer: 0,
        jumpBufferTimer: 0,
        lastShootTime: 0,
        lastProcessedSeq: 0,
        deadTimer: 0,

        input: { moveX: 0, moveZ: 0, jump: false, shoot: false, yaw: 0 }
    };
}

const activeBullets = [];

function createServerBullet(ownerId, x, y, z, yaw) {
    activeBullets.push({
        id: nextBulletId++, // ✨ 고유 ID 부여
        ownerId,
        x, y, z, yaw,
        life: 1.0
    });
}

// ============================================================
// WebSocket 연결 관리
// ============================================================
wss.on('connection', (ws) => {
    const playerId = nextPlayerId++;
    const player = spawnPlayer(playerId);
    players.set(ws, player);

    // 1. 환영 메시지 전송 (내 ID 부여)
    ws.send(JSON.stringify({
        type: 'welcome',
        id: player.id
    }));

    // 2. 입력 받기
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'input') {
                player.input = {
                    moveX: Number(data.moveX) || 0,
                    moveZ: Number(data.moveZ) || 0,
                    jump: !!data.jump,
                    shoot: !!data.shoot,
                    yaw: Number(data.yaw) || 0
                };
                if (typeof data.seq === 'number') {
                    player.lastProcessedSeq = data.seq;
                }
            }
        } catch (e) {
            console.error('입력 파싱 에러:', e);
        }
    });

    // 3. 연결 종료 처리
    ws.on('close', () => {
        players.delete(ws);
        broadcastLeaderboard();
    });

    broadcastLeaderboard();
});

// ============================================================
// 게임 물리 및 로직 업데이트 루프 (60 FPS)
// ============================================================
const TICK_RATE = 60;
const DT = 1 / TICK_RATE;

setInterval(() => {
    const now = Date.now() / 1000;

    // ============================================================
    // 1. 플레이어 이동 및 발사
    // ============================================================

    for (const [ws, p] of players) {

        // 죽어있는 동안
        if (p.deadTimer > 0) {
            p.deadTimer -= DT;

            if (p.deadTimer <= 0) {
                // 부활
                p.hp = 100;
                p.x = (Math.random() - 0.5) * 20;
                p.y = 0.5;
                p.z = (Math.random() - 0.5) * 20;
                p.vy = 0;
                p.isGrounded = true;
                p.coyoteTimer = 0;
                p.jumpBufferTimer = 0;
            }

            continue;
        }

        // 시점
        p.yaw = p.input.yaw;

        // 이동
        stepPlayer(p, p.input, DT);

        // 사격
        if (
            p.input.shoot &&
            now - p.lastShootTime >= SHOOT_COOLDOWN
        ) {
            p.lastShootTime = now;

            createServerBullet(
                p.id,
                p.x,
                p.y + 0.3,
                p.z,
                p.yaw
            );
        }
    }


    // ============================================================
    // 2. 총알 이동 및 충돌 검사
    // ============================================================

    for (let i = activeBullets.length - 1; i >= 0; i--) {

        const b = activeBullets[i];

        b.x += Math.sin(b.yaw) * BULLET_SPEED * DT;
        b.z += Math.cos(b.yaw) * BULLET_SPEED * DT;

        b.life -= DT;

        let bulletRemoved = false;

        // 플레이어 피격 판정
        for (const [ws, p] of players) {

            // 자기 총알은 자기 자신에게 맞지 않음
            if (p.id === b.ownerId) continue;

            // 죽어있는 플레이어는 맞지 않음
            if (p.deadTimer > 0) continue;

            const dist = Math.hypot(
                p.x - b.x,
                p.z - b.z
            );

            const verticalDist =
                Math.abs(p.y - b.y);

            if (
                dist < BULLET_HIT_RADIUS &&
                verticalDist < 1.0
            ) {

                p.hp -= 15;
                bulletRemoved = true;

                // 죽음
                if (p.hp <= 0) {

                    p.hp = 0;
                    p.deaths += 1;
                    p.deadTimer = 0.5;

                    // 킬 추가
                    for (const [kWs, shooter] of players) {

                        if (shooter.id === b.ownerId) {
                            shooter.kills += 1;
                            break;
                        }

                    }

                    broadcastLeaderboard();
                }

                break;
            }
        }

        // 총알 제거
        if (
            bulletRemoved ||
            b.life <= 0
        ) {
            activeBullets.splice(i, 1);
        }
    }


    // ============================================================
    // 3. 모든 플레이어에게 상태 전송
    // ============================================================

    broadcastState();

}, 1000 / TICK_RATE);
// ============================================================
// 데이터 전송 헬퍼 함수
// ============================================================
function broadcastState() {
    const playerList = Array.from(players.values()).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        z: p.z,
        vy: p.vy,
        isGrounded: p.isGrounded,
        coyoteTimer: p.coyoteTimer,
        jumpBufferTimer: p.jumpBufferTimer,
        lastProcessedSeq: p.lastProcessedSeq,
        yaw: p.yaw,
        hp: p.hp,
        kills: p.kills,
        deaths: p.deaths
    }));

    const payload = JSON.stringify({
        type: 'state',
        players: playerList,
        bullets: activeBullets.map(b => ({
            id: b.id,       // ✨ ID 포함해서 전송
            ownerId: b.ownerId,
            x: b.x,
            y: b.y,
            z: b.z,
            yaw: b.yaw
        }))
    });

    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

function broadcastLeaderboard() {
    const sorted = Array.from(players.values())
        .map(p => ({ id: p.id, kills: p.kills }))
        .sort((a, b) => b.kills - a.kills);

    const payload = JSON.stringify({
        type: 'leaderboard',
        leaderboard: sorted
    });

    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

server.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});