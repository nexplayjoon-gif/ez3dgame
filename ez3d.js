/* ============================================================
   EZ3D — three.js를 게임 제작용으로 감싼 간단한 래퍼 라이브러리
   ------------------------------------------------------------
   사용 예:
     import { WORLD, GEO, LIGHT, INPUT, COLLIDE, TIME } from './ez3d.js';

     WORLD.init();
     INPUT.init();

     const cube = GEO.make("cube", 0, 0.5, 0, true, 0xff5555);
     const sun  = LIGHT.sun(1.2, 8, 12, 6, 0xfff4e0);

     WORLD.animate(() => {
       if (INPUT.isDown('KeyD')) cube.position.x += TIME.delta;
     });

   ※ three.js가 npm 패키지로 설치되어 있어야 함: npm install three
   ============================================================ */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';;

// ---------- TIME: 프레임 시간 관리 ----------
export const TIME = {
  delta: 0,
  now: 0,
  update(clock) {
    this.delta = clock.getDelta();
    this.now = clock.getElapsedTime();
  }
};

// ---------- WORLD: 씬 / 카메라 / 렌더러 관리 ----------
export const WORLD = {
  scene: null, camera: null, renderer: null,
  hitboxMeshes: [],      // hitbox=true로 만든 오브젝트 목록 (충돌 검사용)
  clock: new THREE.Clock(),

  // container: 캔버스를 붙일 DOM 엘리먼트 (기본값: document.body)
  init(container = document.body) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    this.camera.position.set(0, 4, 9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  },

  // updateFn(dt) 를 매 프레임 호출하는 게임 루프
  animate(updateFn) {
    const loop = () => {
      requestAnimationFrame(loop);
      TIME.update(this.clock);
      if (updateFn) updateFn(TIME.delta);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
};

// ---------- GEO: 도형 생성 ----------
export const GEO = {
  make(shape, x = 0, y = 0, z = 0, hitbox = false, color = 0xffffff) {
    let geometry;
    switch (shape) {
      case "cube": case "box":
        geometry = new THREE.BoxGeometry(1, 1, 1); break;
      case "sphere": case "ball":
        geometry = new THREE.SphereGeometry(0.6, 24, 24); break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); break;
      case "cone":
        geometry = new THREE.ConeGeometry(0.5, 1, 24); break;
      case "plane": case "ground":
        geometry = new THREE.PlaneGeometry(20, 20); break;
      default:
        console.warn(`GEO.make: 알 수 없는 모양 "${shape}" → 큐브로 대체`);
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (shape === "plane" || shape === "ground") mesh.rotation.x = -Math.PI / 2;

    mesh.userData.hasHitbox = hitbox;
    if (hitbox) WORLD.hitboxMeshes.push(mesh);

    WORLD.scene.add(mesh);
    return mesh;
  },

  remove(mesh) {
    if (!mesh) return;

    WORLD.scene.remove(mesh);
    WORLD.hitboxMeshes = WORLD.hitboxMeshes.filter(m => m !== mesh);

    if (mesh.geometry) mesh.geometry.dispose();

    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  }
};

// ---------- LIGHT: 조명 생성 ----------
export const LIGHT = {
  light(intensity = 1, x = 0, y = 5, z = 0, color = 0xffffff) {
    const l = new THREE.PointLight(color, intensity, 0, 2);
    l.position.set(x, y, z);
    l.castShadow = true;
    WORLD.scene.add(l);
    return l;
  },
  sun(intensity = 1, x = 5, y = 10, z = 5, color = 0xffffff) {
    const l = new THREE.DirectionalLight(color, intensity);
    l.position.set(x, y, z);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.camera.left = -20; l.shadow.camera.right = 20;
    l.shadow.camera.top = 20; l.shadow.camera.bottom = -20;
    WORLD.scene.add(l);
    return l;
  },
  ambient(intensity = 0.4, color = 0xffffff) {
    const l = new THREE.AmbientLight(color, intensity);
    WORLD.scene.add(l);
    return l;
  }
};

// ---------- INPUT: 키보드 입력 ----------
export const INPUT = {
  keys: {},
  init() {
    window.addEventListener('keydown', e => this.keys[e.code] = true);
    window.addEventListener('keyup', e => this.keys[e.code] = false);
  },
  isDown(code) { return !!this.keys[code]; }
};

// ---------- COLLIDE: 충돌 감지 (hitbox=true인 것들 기준) ----------
const _boxA = new THREE.Box3();
const _boxB = new THREE.Box3();

export const COLLIDE = {
  check(a, b) {
    _boxA.setFromObject(a);
    _boxB.setFromObject(b);
    return _boxA.intersectsBox(_boxB);
  },

  checkAny(mesh) {
    _boxA.setFromObject(mesh);
    for (const other of WORLD.hitboxMeshes) {
      if (other === mesh) continue;
      _boxB.setFromObject(other);
      if (_boxA.intersectsBox(_boxB)) return other;
    }
    return null;
  }
};