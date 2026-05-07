import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { STATIONS, PORTFOLIO } from "../data/portfolio";
import type { StationId } from "../data/portfolio";
import type { MapTarget } from "../store/gameStore";
import { useGameStore } from "../store/gameStore";
import { SoundSystem } from "./SoundSystem";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  mesh: THREE.Mesh | null;
}

interface Projectile {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  life: number;
  debris?: boolean;
}

interface Enemy {
  group: THREE.Group;
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  ring2: THREE.Mesh;
  hp: number;
  speed: number;
  fireCooldown: number;
  bobOffset: number;
}

interface StationObject {
  crystal: THREE.Mesh;
  ring: THREE.Mesh;
  shell: THREE.Mesh;
}

interface TrafficCar {
  group: THREE.Object3D;
  speed: number;
  baseSpeed: number;
  axis: "x" | "z";
  dir: 1 | -1;
  wrapMin: number;
  wrapMax: number;
  hitCooldown: number;
}

interface HealthZone {
  group: THREE.Group;
  base: THREE.Mesh;
  plus: THREE.Group;
  cooldown: number;
  ready: boolean;   // tracks last known state to avoid per-frame material writes
}

export interface GameCallbacks {
  onHealthChange(h: number): void;
  onAmmoChange(ammo: number, max: number): void;
  onDiscoverStation(id: string): void;
  onOpenStation(id: StationId): void;
  onOpenMap(t: MapTarget): void;
  onEnemyCountChange(n: number): void;
  onToast(big: string, small: string): void;
  onDead(): void;
  onRespawn(): void;
  onLock(): void;
  onUnlock(): void;
  onFpsUpdate(fps: number): void;
  onKill(): void;
  closeStation?(): void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROAD_WIDTH = 10;
const SIDEWALK_WIDTH = 3.5;
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.4;
const SPEED = 8;
const SPRINT = 14;
const JUMP_V = 6;
const GRAVITY = 18;
const MOUSE_SENS = 0.0022;
const MOUSE_SENS_FB = 0.003;
const PI_2 = Math.PI / 2;
const ENEMY_MAX = 3;
const ENEMY_SHOOT_RANGE = 20;

const BLOCKS = [
  { cx: 14, cz: -14, w: 11, d: 11 },
  { cx: -14, cz: -14, w: 11, d: 11 },
  { cx: 14, cz: 14, w: 11, d: 11 },
  { cx: -14, cz: 14, w: 11, d: 11 },
  { cx: 42, cz: -14, w: 11, d: 11 },
  { cx: 42, cz: 14, w: 11, d: 11 },
  { cx: -42, cz: -14, w: 11, d: 11 },
  { cx: -42, cz: 14, w: 11, d: 11 },
  { cx: 14, cz: -42, w: 11, d: 11 },
  { cx: -14, cz: -42, w: 11, d: 11 },
  { cx: 14, cz: 42, w: 11, d: 11 },
  { cx: -14, cz: 42, w: 11, d: 11 },
  { cx: 42, cz: -42, w: 11, d: 11 },
  { cx: -42, cz: -42, w: 11, d: 11 },
  { cx: 42, cz: 42, w: 11, d: 11 },
  { cx: -42, cz: 42, w: 11, d: 11 }
];

// ─── GameEngine ───────────────────────────────────────────────────────────────

export class GameEngine {
  // Three.js core
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private skyMat!: THREE.ShaderMaterial;
  private sun!: THREE.Mesh;

  // World
  private colliders: Collider[] = [];
  private wallMeshes: THREE.Mesh[] = [];
  private blinkers: THREE.Mesh[] = [];
  private stationMeshes: THREE.Mesh[] = [];
  private stationObjects: StationObject[] = [];

  // Player
  private yawObject: THREE.Object3D;
  private pitchObject: THREE.Object3D;
  private isLocked = false;
  private fallbackMode = false;
  private moveState = {
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false
  };
  private playerYVel = 0;
  private onGround = true;
  private fb = {
    lastX: null as number | null,
    lastY: null as number | null,
    centerX: 0,
    centerY: 0
  };
  private pointerCaptured = false;

  // Gun
  private gunGroup!: THREE.Group;
  private gunTip!: THREE.Mesh;
  private recoil = 0;
  private _muzzleFlash:    THREE.Mesh | null = null;
  private _muzzleFlash2:   THREE.Mesh | null = null;
  private _muzzleFlashRing:THREE.Mesh | null = null;
  private _muzzleTimer  = 0;
  private _recoilY      = 0;
  private _recoilRot    = 0;

  // Combat
  private projectiles: Projectile[] = [];
  private enemyShots: Projectile[] = [];
  private enemies: Enemy[] = [];
  private enemySpawnTimer = 0;
  private shootDirCached = new THREE.Vector3(0, 0, -1);
  private camWorldPos = new THREE.Vector3();
  private ammo = 30;
  private readonly ammoMax = 30;
  private ammoRegen = 0;
  private healthZones: HealthZone[] = [];

  // Shared projectile geometry/material — created once, reused for every shot
  private readonly _enemyShotGeo = new THREE.SphereGeometry(0.15, 6, 6);
  private readonly _enemyShotMat = new THREE.MeshBasicMaterial({ color: 0xff3860 });
  private readonly _playerShotGeo = new THREE.SphereGeometry(0.08, 6, 6);
  private readonly _playerShotMat = new THREE.MeshBasicMaterial({ color: 0x00ffd5 });
  private readonly _sparkGeo = new THREE.SphereGeometry(0.05, 5, 5);
  private readonly _sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff200 });
  // Explosion particles — shared instances, reused for every kill
  private readonly _explGeo  = new THREE.SphereGeometry(0.12, 4, 4);
  private readonly _explMats = [0xff3860, 0xff8c00, 0xffffff, 0xffcc00].map(
    c => new THREE.MeshBasicMaterial({ color: c })
  );
  // Footstep dust
  private readonly _dustGeo  = new THREE.SphereGeometry(0.08, 4, 4);
  private readonly _dustMat  = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.4 });
  private _dustCooldown = 0;
  private readonly _v3a = new THREE.Vector3();
  private readonly _v3b = new THREE.Vector3();
  private readonly _v3c = new THREE.Vector3();
  private _fireTargets: THREE.Object3D[] = [];
  private readonly _losRay = new THREE.Raycaster();
  private readonly _fireRay = new THREE.Raycaster();
  private _vignetteTimer: ReturnType<typeof setTimeout> | null = null;
  private _fpsFrames = 0;
  private _fpsAccum  = 0;
  private _tacAccum  = 0;
  private _wpAccum   = 0;
  private _lowHealthWarned = false;
  // Screen shake
  private _shakeTime = 0;
  private _shakeAmt  = 0;
  // Billboard scroll
  private _billboardCtx:    CanvasRenderingContext2D | null = null;
  private _billboardTex:    THREE.CanvasTexture | null = null;
  private _billboardOffset  = 0;
  private _billboardAccum   = 0;
  private _billboardLines:  string[] = [];
  // Sound
  private readonly sounds = new SoundSystem();
  // Spatial audio
  private readonly listener = new THREE.AudioListener();

  // Minimap
  private mmCanvas: HTMLCanvasElement;
  private mmCtx: CanvasRenderingContext2D;
  private mmTick = 0;

  // Game state (local, synced to Zustand via callbacks)
  private health = 100;
  private discovered = new Set<string>();
  private dead = false;
  private modalOpen = false;
  private gameActive = false;
  private carTemplate: THREE.Group | null = null;
  private pendingCars: Array<{
    x: number;
    z: number;
    rotY: number;
    color: number;
  }> = [];
  private trafficCars: TrafficCar[] = [];

  // Post-processing
  private composer!: EffectComposer;

  // Engine
  private cb: GameCallbacks;
  private clock = new THREE.Clock();
  private animId: number | null = null;

  // Bound handlers (kept for removeEventListener)
  private _onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
  private _onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  private _onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
  private _onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
  private _onPLChange = () => this.handlePointerLockChange();
  private _onPLError = () => this.enableFallback();
  private _onResize = () => this.handleResize();
  private _onBlur = () => {
    this.fb.lastX = null;
    this.fb.lastY = null;
  };
  private _onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private _onPointerMove = (e: PointerEvent) => this.handleFbPointerMove(e);
  private _onEsc = (e: KeyboardEvent) => {
    if (!this.gameActive) return;
    if (e.key === "Escape" && this.modalOpen) {
      this.modalOpen = false; // reset BEFORE callback so handleMouseDown unblocks
      this.cb.closeStation?.();
    }
  };

  constructor(
    canvas: HTMLCanvasElement,
    mmCanvas: HTMLCanvasElement,
    cb: GameCallbacks
  ) {
    this.cb = cb;
    this.mmCanvas = mmCanvas;
    this.mmCtx = mmCanvas.getContext("2d")!;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060f);
    this.scene.fog = new THREE.Fog(0x05060f, 25, 90);

    // Camera + yaw/pitch rig
    this.camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      500
    );
    this.yawObject = new THREE.Object3D();
    this.pitchObject = new THREE.Object3D();
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(this.camera);
    this.yawObject.position.set(0, PLAYER_HEIGHT, 0);
    this.scene.add(this.yawObject);

    // Renderer (uses existing canvas element)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    // Spatial audio listener attached to camera
    this.camera.add(this.listener);

    // Post-processing — bloom on emissive objects
    const renderPass = new RenderPass(this.scene, this.camera);
    const bloomPass  = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5),
      0.35,   // strength
      0.4,    // radius
      0.82    // threshold — only very bright emissives bloom
    );
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(bloomPass);

    this.buildWorld();
    this.setupEventListeners();

    useGameStore.subscribe((s) => this.sounds.setMuted(s.muted));
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  lockPointer(): void {
    if (this.fallbackMode) {
      this.isLocked = true;
      document.body.classList.add("playing");
      this.cb.onLock();
      return;
    }
    const canvas = this.renderer.domElement;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (canvas as any).requestPointerLock({
        unadjustedMovement: true
      });
      if (p && p.catch) {
        p.catch(() => {
          try {
            const p2 = canvas.requestPointerLock();
            if (p2 && (p2 as unknown as Promise<void>).catch)
              (p2 as unknown as Promise<void>).catch(() => {
                this.enableFallback();
                this.lockPointer();
              });
          } catch {
            this.enableFallback();
            this.lockPointer();
          }
        });
      }
    } catch {
      try {
        canvas.requestPointerLock();
      } catch {
        this.enableFallback();
        this.lockPointer();
      }
    }
  }

  onModalClose(): void {
    this.modalOpen = false;
  }

  onMapClose(): void {
    this.modalOpen = false;
  }

  startGame(): void {
    this.gameActive = true;
    this.lockPointer();
  }

  stopGame(): void {
    this.gameActive = false;
    this.modalOpen = false;
    this.dead = false;
    this.health = 100;
    this.discovered.clear();
    this.enemies.forEach((e) => this.scene.remove(e.group));
    this.enemies = [];
    this.projectiles.forEach((p) => this.scene.remove(p.mesh));
    this.projectiles = [];
    this.enemyShots.forEach((p) => this.scene.remove(p.mesh));
    this.enemyShots = [];
    this.yawObject.position.set(0, PLAYER_HEIGHT, 0);
    this.pitchObject.rotation.x = 0;
    this.yawObject.rotation.y = 0;
    this.playerYVel = 0;
    if (!this.fallbackMode) {
      document.exitPointerLock();
    } else {
      this.isLocked = false;
      document.body.classList.remove("playing");
    }
  }

  restart(): void {
    this.respawn();
    this.enemies.forEach((e) => this.scene.remove(e.group));
    this.enemies = [];
    this.cb.onEnemyCountChange(0);
    this.discovered.clear();
    this.spawnEnemy();
  }

  destroy(): void {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    document.removeEventListener("mousedown", this._onMouseDown);
    document.removeEventListener("pointerlockchange", this._onPLChange);
    document.removeEventListener("pointerlockerror", this._onPLError);
    document.removeEventListener("keydown", this._onEsc);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("blur", this._onBlur);
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this._onPointerDown
    );
    this.renderer.dispose();
  }

  // ─── World building ───────────────────────────────────────────────────────

  private buildWorld(): void {
    this.setupLighting();
    this.buildGround();
    this.buildSky();
    this.buildStations();
    this.buildCity();
    this.buildGun();
  }

  private setupLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xff2bd6, 0x00ffd5, 0.35));
    const moon = new THREE.DirectionalLight(0x99aaff, 0.6);
    moon.position.set(20, 30, 10);
    this.scene.add(moon);
    const a1 = new THREE.PointLight(0xff2bd6, 1.2, 50);
    a1.position.set(20, 8, -10);
    this.scene.add(a1);
    const a2 = new THREE.PointLight(0x00ffd5, 1.2, 50);
    a2.position.set(-20, 8, 10);
    this.scene.add(a2);
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({
        color: 0x0a0d1f,
        roughness: 0.6,
        metalness: 0.3
      })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(100, 50, 0x00ffd5, 0x1a1f3a);
    grid.position.y = 0.01;
    const gm = grid.material as THREE.Material;
    gm.opacity = 0.55;
    gm.transparent = true;
    this.scene.add(grid);
  }

  private buildSky(): void {
    // Synthwave sky shader
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vWorld; void main(){ vWorld=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vWorld; uniform float time;
        void main(){
          float h=normalize(vWorld).y;
          vec3 bot=vec3(0.45,0.04,0.35),mid=vec3(0.05,0.02,0.18),top=vec3(0.01,0.0,0.05),col;
          if(h<0.0){col=mix(bot,mid,smoothstep(-0.3,0.0,h));}else{col=mix(mid,top,smoothstep(0.0,0.7,h));}
          float n=fract(sin(dot(floor(vWorld.xy*0.3),vec2(12.9898,78.233)))*43758.5453);
          if(h>0.0&&n>0.992) col+=vec3(0.7,0.8,1.0)*(0.5+0.5*sin(time+n*40.0));
          gl_FragColor=vec4(col,1.0);
        }`
    });
    this.scene.add(
      new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), this.skyMat)
    );

    // Synthwave sun
    const sunMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv;
        void main(){
          vec2 c=vUv-0.5; float d=length(c);
          float a=smoothstep(0.5,0.0,d);
          float band=step(fract((vUv.y+0.5)*7.0),0.5);
          float mask=mix(1.0,band,smoothstep(0.0,0.5,0.5-vUv.y));
          vec3 col=mix(vec3(1.0,0.2,0.6),vec3(1.0,0.9,0.2),1.0-vUv.y);
          gl_FragColor=vec4(col*mask,a);
        }`
    });
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(8, 32), sunMat);
    this.sun.position.set(0, 6, -80);
    this.scene.add(this.sun);

    // Low-poly mountains
    const verts: number[] = [];
    for (let i = 0; i < 30; i++) {
      const a1 = (i / 30) * Math.PI * 2,
        a2 = ((i + 1) / 30) * Math.PI * 2;
      const h = 4 + Math.random() * 10,
        r = 90;
      verts.push(
        Math.cos(a1) * r,
        0,
        Math.sin(a1) * r,
        Math.cos(a2) * r,
        0,
        Math.sin(a2) * r,
        Math.cos((a1 + a2) / 2) * r,
        h,
        Math.sin((a1 + a2) / 2) * r
      );
    }
    const mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    mGeo.computeVertexNormals();
    this.scene.add(
      new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ color: 0x1a0830 }))
    );
    this.scene.add(
      new THREE.Mesh(
        mGeo,
        new THREE.MeshBasicMaterial({
          color: 0xff2bd6,
          wireframe: true,
          transparent: true,
          opacity: 0.5
        })
      )
    );
  }

  // ─── Stations ─────────────────────────────────────────────────────────────

  private buildStations(): void {
    STATIONS.forEach((s) => {
      this.stationObjects.push(this.makeStation(s));
    });
  }

  private makeStation(s: (typeof STATIONS)[number]): StationObject {
    const grp = new THREE.Group();
    grp.position.set(s.position[0], 0, s.position[2]);

    // Pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.6, 0.6, 12),
      new THREE.MeshStandardMaterial({
        color: 0x12152e,
        roughness: 0.5,
        metalness: 0.6
      })
    );
    ped.position.y = 0.3;
    grp.add(ped);

    // Crystal
    const crystalMat = new THREE.MeshStandardMaterial({
      color: s.color,
      emissive: s.color,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.4,
      transparent: true,
      opacity: 0.85
    });
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.5, 0),
      crystalMat
    );
    crystal.position.y = 2.6;
    crystal.userData = {
      stationId: s.id,
      isStation: true,
      baseY: 2.6,
      color: s.color,
      shake: 0
    };
    grp.add(crystal);
    this.stationMeshes.push(crystal);

    // Wireframe shell
    const shell = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.7, 0),
      new THREE.MeshBasicMaterial({
        color: s.color,
        wireframe: true,
        transparent: true,
        opacity: 0.5
      })
    );
    shell.position.y = 2.6;
    grp.add(shell);

    // Point light
    const pl = new THREE.PointLight(s.color, 1.5, 12);
    pl.position.y = 2.6;
    grp.add(pl);

    // Floor ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 3.2, 32),
      new THREE.MeshBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    grp.add(ring);

    // Label sprite
    const label = this.makeLabelSprite(s.title, s.color);
    label.position.set(0, 4.6, 0);
    grp.add(label);

    this.scene.add(grp);
    return { crystal, ring, shell };
  }

  private makeLabelSprite(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 512, 128);
    const c = "#" + color.toString(16).padStart(6, "0");
    ctx.strokeStyle = c;
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.font = "bold 56px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = 20;
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true })
    );
    sprite.scale.set(4, 1, 1);
    return sprite;
  }

  // ─── City ─────────────────────────────────────────────────────────────────

  private addCollider(
    cx: number,
    cz: number,
    w: number,
    d: number,
    height: number,
    mesh: THREE.Mesh | null = null
  ): void {
    this.colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      height,
      mesh
    });
  }

  private isNearStation(x: number, z: number, r: number): boolean {
    return STATIONS.some((s) => {
      const dx = x - s.position[0],
        dz = z - s.position[2];
      return dx * dx + dz * dz < r * r;
    });
  }

  private flatPlane(
    mat: THREE.Material,
    w: number,
    d: number,
    x: number,
    z: number,
    y = 0.01
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  }

  private buildCity(): void {
    this.loadCarModel();
    this.buildStreetGrid();
    this.buildAllBlocks();
    this.buildBillboards();
    this.buildPlaza();
    this.parkCarsOnStreets();
    this.placeStreetLamps();
    this.spawnHealthZones();

    // Crates near stations
    const colorById: Record<string, number> = {
      about: 0x00ffd5,
      experience: 0xff2bd6,
      education: 0xfff200,
      contact: 0x7b2cff,
      location: 0x7cffcb,
      projects: 0xff6600
    };
    STATIONS.forEach((s) => {
      const offset = ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 0.5;
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ].forEach(([sx, sz]) => {
        if (Math.random() > 0.5)
          this.addCrate(
            s.position[0] + sx * offset,
            s.position[2] + sz * offset,
            0.9 + Math.random() * 0.3,
            colorById[s.id]
          );
      });
    });

    // Traffic lights at perimeter corners
    [
      [-28, -28],
      [28, -28],
      [28, 28],
      [-28, 28]
    ].forEach(([x, z]) => {
      const off = ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 0.5;
      this.addTrafficLight(x - off, z - off);
    });

    // Construction cones
    [
      [6, -5],
      [6.5, -5.3],
      [-7, 7],
      [-7.5, 7.4]
    ].forEach(([x, z]) => this.addCone(x, z));
  }

  private buildStreetGrid(): void {
    const MAT_ASPHALT = new THREE.MeshStandardMaterial({
      color: 0x0a0c14,
      roughness: 0.95,
      metalness: 0.1
    });
    const MAT_SIDEWALK = new THREE.MeshStandardMaterial({
      color: 0x161825,
      roughness: 0.8,
      metalness: 0.15,
      emissive: 0x0a0a18,
      emissiveIntensity: 0.15
    });
    const MAT_CURB = new THREE.MeshStandardMaterial({
      color: 0x1e2130,
      roughness: 0.65,
      metalness: 0.2
    });
    const MAT_YELLOW = new THREE.MeshBasicMaterial({
      color: 0xfff200,
      transparent: true,
      opacity: 0.85
    });
    const MAT_WHITE = new THREE.MeshBasicMaterial({
      color: 0xeeeeff,
      transparent: true,
      opacity: 0.7
    });

    const SX = [-28, 0, 28],
      SZ = [-28, 0, 28],
      EXT = 54;
    const curbH = 0.09,
      curbW = 0.12;

    // Curb segments between intersections (skips intersection zones)
    const curbSegs = (
      crossings: number[],
      half: number
    ): Array<[number, number]> => {
      const breaks = crossings
        .flatMap((c) => [c - half, c + half])
        .sort((a, b) => a - b);
      const edges = [-EXT, ...breaks, EXT];
      const segs: Array<[number, number]> = [];
      for (let j = 0; j < edges.length - 1; j += 2)
        segs.push([edges[j], edges[j + 1]]);
      return segs;
    };

    SZ.forEach((z) => {
      this.scene.add(
        this.flatPlane(MAT_ASPHALT, EXT * 2, ROAD_WIDTH, 0, z, 0.02)
      );
      this.scene.add(
        this.flatPlane(
          MAT_SIDEWALK,
          EXT * 2,
          SIDEWALK_WIDTH,
          0,
          z - ROAD_WIDTH / 2 - SIDEWALK_WIDTH / 2,
          0.04
        )
      );
      this.scene.add(
        this.flatPlane(
          MAT_SIDEWALK,
          EXT * 2,
          SIDEWALK_WIDTH,
          0,
          z + ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2,
          0.04
        )
      );
      for (let x = -EXT + 2; x <= EXT - 2; x += 4) {
        if (SX.some((sx) => Math.abs(x - sx) < ROAD_WIDTH / 2 + 1)) continue;
        this.scene.add(this.flatPlane(MAT_YELLOW, 1.6, 0.12, x, z, 0.05));
      }
      curbSegs(SX, ROAD_WIDTH / 2).forEach(([a, b]) => {
        const len = b - a,
          cx = (a + b) / 2;
        [-1, 1].forEach((side) => {
          const curb = new THREE.Mesh(
            new THREE.BoxGeometry(len, curbH, curbW),
            MAT_CURB
          );
          curb.position.set(
            cx,
            curbH / 2,
            z + side * (ROAD_WIDTH / 2 + curbW / 2)
          );
          this.scene.add(curb);
        });
      });
    });

    SX.forEach((x) => {
      this.scene.add(
        this.flatPlane(MAT_ASPHALT, ROAD_WIDTH, EXT * 2, x, 0, 0.02)
      );
      this.scene.add(
        this.flatPlane(
          MAT_SIDEWALK,
          SIDEWALK_WIDTH,
          EXT * 2,
          x - ROAD_WIDTH / 2 - SIDEWALK_WIDTH / 2,
          0,
          0.04
        )
      );
      this.scene.add(
        this.flatPlane(
          MAT_SIDEWALK,
          SIDEWALK_WIDTH,
          EXT * 2,
          x + ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2,
          0,
          0.04
        )
      );
      for (let z = -EXT + 2; z <= EXT - 2; z += 4) {
        if (SZ.some((sz) => Math.abs(z - sz) < ROAD_WIDTH / 2 + 1)) continue;
        this.scene.add(this.flatPlane(MAT_YELLOW, 0.12, 1.6, x, z, 0.05));
      }
      curbSegs(SZ, ROAD_WIDTH / 2).forEach(([a, b]) => {
        const len = b - a,
          cz = (a + b) / 2;
        [-1, 1].forEach((side) => {
          const curb = new THREE.Mesh(
            new THREE.BoxGeometry(curbW, curbH, len),
            MAT_CURB
          );
          curb.position.set(
            x + side * (ROAD_WIDTH / 2 + curbW / 2),
            curbH / 2,
            cz
          );
          this.scene.add(curb);
        });
      });
    });

    // Crosswalks — stripes sit exactly on the sidewalk, flush with road edge, no intersection overlap
    SX.forEach((x) =>
      SZ.forEach((z) => {
        this.scene.add(
          this.flatPlane(
            MAT_ASPHALT,
            ROAD_WIDTH + 0.1,
            ROAD_WIDTH + 0.1,
            x,
            z,
            0.025
          )
        );
        const sL = SIDEWALK_WIDTH,
          sW = 0.3,
          gap = 0.42;
        const halfN = Math.round(ROAD_WIDTH / (2 * gap)); // 7 → covers full road width
        for (let i = -halfN; i <= halfN; i++) {
          this.scene.add(
            this.flatPlane(
              MAT_WHITE,
              sW,
              sL,
              x + i * gap,
              z - ROAD_WIDTH / 2 - sL / 2,
              0.06
            )
          );
          this.scene.add(
            this.flatPlane(
              MAT_WHITE,
              sW,
              sL,
              x + i * gap,
              z + ROAD_WIDTH / 2 + sL / 2,
              0.06
            )
          );
          this.scene.add(
            this.flatPlane(
              MAT_WHITE,
              sL,
              sW,
              x + ROAD_WIDTH / 2 + sL / 2,
              z + i * gap,
              0.06
            )
          );
          this.scene.add(
            this.flatPlane(
              MAT_WHITE,
              sL,
              sW,
              x - ROAD_WIDTH / 2 - sL / 2,
              z + i * gap,
              0.06
            )
          );
        }
      })
    );
  }

  private pickAccent(): number {
    return [0xff2bd6, 0x00ffd5, 0xfff200, 0x7b2cff, 0xff6600][
      Math.floor(Math.random() * 5)
    ];
  }

  private buildAllBlocks(): void {
    const FLOOR_H = 2.2;
    const NEON_COLS = [0x00ffd5, 0xff2bd6, 0xfff200, 0x7b2cff];

    // Place individual glowing window panels on all four faces of a section
    const addWindowPanels = (
      bx: number,
      bz: number,
      bw: number,
      bd: number,
      sectionFloors: number,
      floorBase: number
    ) => {
      // [px-offset, pz-offset, face-width, windows-span-X-axis]
      const faces: Array<[number, number, number, boolean]> = [
        [0, bd / 2 + 0.038, bw, true],
        [0, -bd / 2 - 0.038, bw, true],
        [bw / 2 + 0.038, 0, bd, false],
        [-bw / 2 - 0.038, 0, bd, false]
      ];
      faces.forEach(([fpx, fpz, fw, isXFace]) => {
        const cols = Math.max(1, Math.floor((fw - 0.25) / 0.85));
        const colStep = fw / (cols + 1);
        const winH = FLOOR_H * 0.55;
        const winW = colStep * 0.62;
        for (let f = 0; f < sectionFloors; f++) {
          const fy = floorBase + f * FLOOR_H + FLOOR_H / 2;
          for (let c = 1; c <= cols; c++) {
            if (Math.random() < 0.2) continue;
            const col = NEON_COLS[Math.floor(Math.random() * NEON_COLS.length)];
            const mat = new THREE.MeshStandardMaterial({
              color: 0x001122,
              emissive: col,
              emissiveIntensity: 0.55 + Math.random() * 0.4,
              roughness: 0.1,
              metalness: 0.1,
              transparent: true,
              opacity: 0.88
            });
            const geo = isXFace
              ? new THREE.BoxGeometry(winW, winH, 0.06)
              : new THREE.BoxGeometry(0.06, winH, winW);
            const colOffset = (c - (cols + 1) / 2) * colStep;
            const win = new THREE.Mesh(geo, mat);
            win.position.set(
              bx + fpx + (isXFace ? colOffset : 0),
              fy,
              bz + fpz + (isXFace ? 0 : colOffset)
            );
            this.scene.add(win);
          }
        }
      });
    };

    const makeBuilding = (
      x: number,
      z: number,
      w: number,
      d: number,
      h: number
    ) => {
      const accent = this.pickAccent();
      const floors = Math.max(1, Math.round(h / FLOOR_H));
      const hasSetback = floors >= 5 && Math.random() < 0.45;
      const setbackAt = hasSetback ? Math.floor(floors * 0.58) : floors;
      const SB = 0.74;

      // Lower body
      const lH = setbackAt * FLOOR_H;
      const lBody = new THREE.Mesh(
        new THREE.BoxGeometry(w, lH, d),
        new THREE.MeshStandardMaterial({
          color: 0x0a0d20,
          roughness: 0.65,
          metalness: 0.35,
          emissive: accent,
          emissiveIntensity: 0.06
        })
      );
      lBody.position.set(x, lH / 2, z);
      this.scene.add(lBody);
      this.addCollider(x, z, w, d, lH, lBody);
      this.wallMeshes.push(lBody);

      // Upper tower (setback)
      const uW = w * SB,
        uD = d * SB;
      const uH = hasSetback ? (floors - setbackAt) * FLOOR_H : 0;
      if (hasSetback && uH > 0) {
        const uBody = new THREE.Mesh(
          new THREE.BoxGeometry(uW, uH, uD),
          new THREE.MeshStandardMaterial({
            color: 0x0d1228,
            roughness: 0.58,
            metalness: 0.42,
            emissive: accent,
            emissiveIntensity: 0.09
          })
        );
        uBody.position.set(x, lH + uH / 2, z);
        this.scene.add(uBody);
        this.wallMeshes.push(uBody);
      }

      // Horizontal floor ledge bands
      for (let f = 1; f < floors; f++) {
        const fy = f * FLOOR_H;
        const inUpper = hasSetback && f >= setbackAt;
        const lw = (inUpper ? w * SB : w) + 0.15;
        const ld = (inUpper ? d * SB : d) + 0.15;
        const ledge = new THREE.Mesh(
          new THREE.BoxGeometry(lw, 0.12, ld),
          new THREE.MeshStandardMaterial({
            color: 0x141830,
            roughness: 0.5,
            metalness: 0.55,
            emissive: accent,
            emissiveIntensity: 0.05
          })
        );
        ledge.position.set(x, fy + 0.06, z);
        this.scene.add(ledge);
      }

      // Window panels
      addWindowPanels(x, z, w, d, setbackAt, 0);
      if (hasSetback && uH > 0) {
        addWindowPanels(x, z, uW, uD, floors - setbackAt, lH);
      }

      // Wireframe outline on lower body
      const wire = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.005, lH * 1.005, d * 1.005),
        new THREE.MeshBasicMaterial({
          color: accent,
          wireframe: true,
          transparent: true,
          opacity: 0.15
        })
      );
      wire.position.set(x, lH / 2, z);
      this.scene.add(wire);

      // Rooftop feature
      const topY = lH + uH;
      const topW = hasSetback ? uW : w;
      const topD = hasSetback ? uD : d;
      const rnd = Math.random();

      if (rnd < 0.4) {
        // Antenna + blinker
        const antH = 1.5 + Math.random() * 2;
        const ant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.12, antH, 5),
          new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.85 })
        );
        ant.position.set(
          x + (Math.random() - 0.5) * topW * 0.5,
          topY + antH / 2,
          z + (Math.random() - 0.5) * topD * 0.5
        );
        this.scene.add(ant);
        const blinker = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0xff0040 })
        );
        blinker.position.set(
          ant.position.x,
          ant.position.y + antH / 2 + 0.1,
          ant.position.z
        );
        this.scene.add(blinker);
        this.blinkers.push(blinker);
      } else if (rnd < 0.7) {
        // Water tower
        const tankR = 0.48,
          tankH = 1.8;
        const tkX = x + (Math.random() - 0.5) * topW * 0.4;
        const tkZ = z + (Math.random() - 0.5) * topD * 0.4;
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(tankR, tankR * 0.85, tankH, 8),
          new THREE.MeshStandardMaterial({
            color: 0x1a1a2e,
            roughness: 0.6,
            metalness: 0.6,
            emissive: accent,
            emissiveIntensity: 0.08
          })
        );
        tank.position.set(tkX, topY + 0.9 + tankH / 2, tkZ);
        this.scene.add(tank);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.9, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 })
          );
          leg.position.set(
            tkX + Math.cos(a) * tankR * 0.8,
            topY + 0.45,
            tkZ + Math.sin(a) * tankR * 0.8
          );
          this.scene.add(leg);
        }
      } else {
        // Rooftop terrace + neon ring
        const terrace = new THREE.Mesh(
          new THREE.BoxGeometry(topW * 0.65, 0.18, topD * 0.65),
          new THREE.MeshStandardMaterial({
            color: 0x141830,
            roughness: 0.55,
            metalness: 0.4,
            emissive: accent,
            emissiveIntensity: 0.12
          })
        );
        terrace.position.set(x, topY + 0.09, z);
        this.scene.add(terrace);
        const rMin = Math.min(topW, topD) * 0.22;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(rMin, rMin * 1.12, 24),
          new THREE.MeshBasicMaterial({
            color: accent,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, topY + 0.2, z);
        this.scene.add(ring);
      }
    };

    BLOCKS.forEach((b) => {
      if (
        STATIONS.some(
          (s) =>
            Math.abs(s.position[0] - b.cx) < 6 &&
            Math.abs(s.position[2] - b.cz) < 6
        )
      )
        return;
      const pad = 0.5,
        layout = Math.floor(Math.random() * 3);
      if (layout === 0) {
        makeBuilding(
          b.cx,
          b.cz,
          b.w - pad * 2,
          b.d - pad * 2,
          6 + Math.random() * 14
        );
      } else if (layout === 1) {
        const bw = (b.w - pad * 3) / 2;
        if (Math.random() > 0.5) {
          makeBuilding(
            b.cx - bw / 2 - pad / 2,
            b.cz,
            bw,
            b.d - pad * 2,
            6 + Math.random() * 12
          );
          makeBuilding(
            b.cx + bw / 2 + pad / 2,
            b.cz,
            bw,
            b.d - pad * 2,
            6 + Math.random() * 12
          );
        } else {
          makeBuilding(
            b.cx,
            b.cz - bw / 2 - pad / 2,
            b.d - pad * 2,
            bw,
            6 + Math.random() * 12
          );
          makeBuilding(
            b.cx,
            b.cz + bw / 2 + pad / 2,
            b.d - pad * 2,
            bw,
            6 + Math.random() * 12
          );
        }
      } else {
        const bw = (b.w - pad * 3) / 2,
          bd = (b.d - pad * 3) / 2;
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1]
        ].forEach(([sx, sz]) => {
          makeBuilding(
            b.cx + sx * (bw / 2 + pad / 2),
            b.cz + sz * (bd / 2 + pad / 2),
            bw,
            bd,
            5 + Math.random() * 13
          );
        });
      }
    });
  }

  private buildBillboards(): void {
    const LINES = ['THREE.JS', 'REACT', 'TYPESCRIPT', 'VITE', 'ZUSTAND', 'WEBGL', 'CLOUDFLARE'];
    const cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = 128;
    const ctx = cvs.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cvs);
    this._billboardCtx   = ctx;
    this._billboardTex   = tex;
    this._billboardLines = LINES;

    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true });
    const geo = new THREE.PlaneGeometry(10, 2.5);
    const positions: [number, number, number, number][] = [
      [22, 9, 0,   0],
      [-22, 9, 0,  0],
      [0,  9, 22,  Math.PI / 2],
      [0,  9, -22, Math.PI / 2],
    ];
    positions.forEach(([x, y, z, ry]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      this.scene.add(m);
    });
  }

  private buildPlaza(): void {
    const plazaSize = ROAD_WIDTH + 4;
    const pl = new THREE.Mesh(
      new THREE.PlaneGeometry(plazaSize, plazaSize),
      new THREE.MeshStandardMaterial({
        color: 0x1a1f3a,
        roughness: 0.7,
        metalness: 0.2,
        emissive: 0x0a1530,
        emissiveIntensity: 0.3
      })
    );
    pl.rotation.x = -Math.PI / 2;
    pl.position.set(0, 0.045, 0);
    this.scene.add(pl);

    const circle = new THREE.Mesh(
      new THREE.RingGeometry(2, 2.2, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff2bd6,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      })
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.07;
    this.scene.add(circle);
  }

  private loadCarModel(): void {
    const draco = new DRACOLoader();
    draco.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
    );
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load("/models/ferrari.glb", (gltf) => {
      this.carTemplate = gltf.scene;
      this.pendingCars.forEach((c) =>
        this.spawnFerrari(c.x, c.z, c.rotY, c.color)
      );
      this.pendingCars = [];
      this.spawnTrafficCars();
    });
  }

  private spawnFerrari(
    x: number,
    z: number,
    rotY: number,
    color: number
  ): void {
    const car = this.carTemplate!.clone();

    car.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => (m as THREE.Material).clone());
      } else {
        mesh.material = (mesh.material as THREE.Material).clone();
      }
    });

    const body = car.getObjectByName("body") as THREE.Mesh | undefined;
    if (body) {
      const mat = body.material as THREE.MeshStandardMaterial;
      mat.color.setHex(color);
      mat.emissive.setHex(color);
      mat.emissiveIntensity = 0.15;
      mat.roughness = 0.3;
      mat.metalness = 0.9;
      this.wallMeshes.push(body);
    }

    const glass = car.getObjectByName("glass") as THREE.Mesh | undefined;
    if (glass) {
      const mat = glass.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0x001133);
      mat.transparent = true;
      mat.opacity = 0.45;
    }

    car.position.set(x, 0, z);
    car.rotation.y = rotY;
    this.scene.add(car);

    const carW = 1.9,
      carL = 4.5,
      carH = 1.3;
    const cosA = Math.abs(Math.cos(rotY)),
      sinA = Math.abs(Math.sin(rotY));
    this.addCollider(
      x,
      z,
      carW * cosA + carL * sinA,
      carW * sinA + carL * cosA,
      carH,
      null
    );
  }

  private addCar(x: number, z: number, rotY: number, color: number): void {
    if (!this.carTemplate) {
      this.pendingCars.push({ x, z, rotY, color });
      return;
    }
    this.spawnFerrari(x, z, rotY, color);
  }

  private spawnTrafficCars(): void {
    const SX = [-28, 0, 28],
      SZ = [-28, 0, 28];
    const LANE = 1.5; // inner lane — clear of parked cars at ±4.3
    const W = 56;
    const colors = [0x00ffd5, 0xff2bd6, 0xfff200, 0x7b2cff, 0xff6600, 0xffffff];
    const pick = () => colors[Math.floor(Math.random() * colors.length)];

    SZ.forEach((z) => {
      this.addTrafficCar(
        -W,
        z - LANE,
        -Math.PI / 2,
        "x",
        1,
        -W,
        W,
        5 + Math.random() * 4,
        pick()
      );
      this.addTrafficCar(
        -W / 2,
        z - LANE,
        -Math.PI / 2,
        "x",
        1,
        -W,
        W,
        5 + Math.random() * 4,
        pick()
      );
      this.addTrafficCar(
        W,
        z + LANE,
        Math.PI / 2,
        "x",
        -1,
        -W,
        W,
        5 + Math.random() * 4,
        pick()
      );
      this.addTrafficCar(
        W / 2,
        z + LANE,
        Math.PI / 2,
        "x",
        -1,
        -W,
        W,
        5 + Math.random() * 4,
        pick()
      );
    });

    SX.forEach((x) => {
      this.addTrafficCar(
        x - LANE,
        -W,
        Math.PI,
        "z",
        1,
        -W,
        W,
        5 + Math.random() * 4,
        pick()
      );
      this.addTrafficCar(
        x - LANE,
        -W / 2,
        Math.PI,
        "z",
        1,
        -W,
        W,
        5 + Math.random() * 4,
        pick()
      );
      this.addTrafficCar(
        x + LANE,
        W,
        0,
        "z",
        -1,
        -W,
        W,
        5 + Math.random() * 4,
        pick()
      );
      this.addTrafficCar(
        x + LANE,
        W / 2,
        0,
        "z",
        -1,
        -W,
        W,
        5 + Math.random() * 4,
        pick()
      );
    });
  }

  private addTrafficCar(
    x: number,
    z: number,
    rotY: number,
    axis: "x" | "z",
    dir: 1 | -1,
    wrapMin: number,
    wrapMax: number,
    speed: number,
    color: number
  ): void {
    const car = this.carTemplate!.clone();
    car.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => (m as THREE.Material).clone())
        : (mesh.material as THREE.Material).clone();
    });
    const body = car.getObjectByName("body") as THREE.Mesh | undefined;
    if (body) {
      const mat = body.material as THREE.MeshStandardMaterial;
      mat.color.setHex(color);
      mat.emissive.setHex(color);
      mat.emissiveIntensity = 0.25;
      mat.roughness = 0.3;
      mat.metalness = 0.9;
    }
    const glass = car.getObjectByName("glass") as THREE.Mesh | undefined;
    if (glass) {
      const mat = glass.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0x001133);
      mat.transparent = true;
      mat.opacity = 0.45;
    }
    car.rotation.y = rotY;
    car.position.set(x, 0, z);
    this.scene.add(car);
    this.trafficCars.push({
      group: car,
      speed,
      baseSpeed: speed,
      axis,
      dir,
      wrapMin,
      wrapMax,
      hitCooldown: 0
    });
  }

  private parkCarsOnStreets(): void {
    const colors = [0x00ffd5, 0xff2bd6, 0xfff200, 0x7b2cff, 0xff6600, 0xeeeeee];
    const SX = [-28, 0, 28],
      SZ = [-28, 0, 28];
    const parkOff = ROAD_WIDTH / 2 - 0.7; // parallel park near curb, clear of traffic at ±1.5

    SZ.forEach((z) => {
      for (let x = -52; x <= 52; x += 7) {
        if (SX.some((sx) => Math.abs(x - sx) < ROAD_WIDTH / 2 + 3)) continue;
        if (this.isNearStation(x, z, 8)) continue;
        const c = () => colors[Math.floor(Math.random() * colors.length)];
        if (Math.random() > 0.55) this.addCar(x, z - parkOff, Math.PI / 2, c());
        if (Math.random() > 0.55)
          this.addCar(x, z + parkOff, -Math.PI / 2, c());
      }
    });

    SX.forEach((x) => {
      for (let z = -52; z <= 52; z += 7) {
        if (SZ.some((sz) => Math.abs(z - sz) < ROAD_WIDTH / 2 + 3)) continue;
        if (this.isNearStation(x, z, 8)) continue;
        const c = () => colors[Math.floor(Math.random() * colors.length)];
        if (Math.random() > 0.55) this.addCar(x - parkOff, z, 0, c());
        if (Math.random() > 0.55) this.addCar(x + parkOff, z, Math.PI, c());
      }
    });
  }

  private addLamp(x: number, z: number, color: number, rotY = 0): void {
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 5, 6),
      new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.7,
        roughness: 0.4
      })
    );
    pole.position.y = 2.5;
    grp.add(pole);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7 })
    );
    arm.position.set(0, 5, 0.4);
    grp.add(arm);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    head.position.set(0, 4.95, 0.8);
    grp.add(head);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 })
    );
    halo.position.copy(head.position);
    grp.add(halo);

    grp.rotation.y = rotY;
    grp.position.set(x, 0, z);
    this.scene.add(grp);
    this.addCollider(x, z, 0.25, 0.25, 5, pole);
  }

  private placeStreetLamps(): void {
    const SX = [-28, 0, 28],
      SZ = [-28, 0, 28];
    const LAMP_RANGE = 50;
    const off = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;
    const lampColors = [0x00ffd5, 0xff2bd6, 0xfff200];

    // Road segments between intersection zones, clamped to ±LAMP_RANGE
    const roadSegs = (
      crossings: number[],
      half: number
    ): Array<[number, number]> => {
      const bks = crossings
        .flatMap((c) => [c - half, c + half])
        .sort((a, b) => a - b);
      const edges = [-LAMP_RANGE, ...bks, LAMP_RANGE];
      const result: Array<[number, number]> = [];
      for (let j = 0; j < edges.length - 1; j += 2)
        result.push([edges[j], edges[j + 1]]);
      return result;
    };

    // Evenly distribute n lamps inside a segment, n = round(len / spacing)
    const eachSeg = (
      a: number,
      b: number,
      spacing: number,
      fn: (p: number) => void
    ) => {
      const n = Math.max(1, Math.round((b - a) / spacing));
      const step = (b - a) / (n + 1);
      for (let k = 1; k <= n; k++) fn(a + step * k);
    };

    // E-W roads — lamps on south and north pavements, arms face the road
    SZ.forEach((z, zi) => {
      const color = lampColors[zi % lampColors.length];
      roadSegs(SX, ROAD_WIDTH / 2).forEach(([a, b]) => {
        eachSeg(a, b, 8, (pos) => {
          if (this.isNearStation(pos, z, 5)) return;
          this.addLamp(pos, z - off, color, 0); // south: arm → +Z (road)
          this.addLamp(pos, z + off, color, Math.PI); // north: arm → -Z (road)
        });
      });
    });

    // N-S roads — lamps on west and east pavements, arms face the road
    SX.forEach((x, xi) => {
      const color = lampColors[xi % lampColors.length];
      roadSegs(SZ, ROAD_WIDTH / 2).forEach(([a, b]) => {
        eachSeg(a, b, 8, (pos) => {
          if (this.isNearStation(x, pos, 5)) return;
          this.addLamp(x - off, pos, color, Math.PI / 2); // west: arm → +X (road)
          this.addLamp(x + off, pos, color, -Math.PI / 2); // east: arm → -X (road)
        });
      });
    });
  }

  private addCrate(x: number, z: number, size: number, color: number): void {
    const s = size || 1;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({
        color: 0x202838,
        roughness: 0.7,
        metalness: 0.3
      })
    );
    m.position.set(x, s / 2, z);
    this.scene.add(m);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(s * 1.01, s * 1.01, s * 1.01)
      ),
      new THREE.LineBasicMaterial({ color })
    );
    edge.position.copy(m.position);
    this.scene.add(edge);
    this.addCollider(x, z, s, s, s, m);
    this.wallMeshes.push(m);
  }

  private addTrafficLight(x: number, z: number): void {
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7 })
    );
    pole.position.y = 2.25;
    grp.add(pole);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.2, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5 })
    );
    box.position.y = 4.2;
    grp.add(box);

    [0xff0040, 0xff9500, 0x00ff66].forEach((c, i) => {
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 5),
        new THREE.MeshBasicMaterial({ color: i === 2 ? c : 0x331111 })
      );
      light.position.set(0, 4.6 - i * 0.35, 0.21);
      grp.add(light);
    });

    grp.position.set(x, 0, z);
    this.scene.add(grp);
    this.addCollider(x, z, 0.3, 0.3, 5, pole);
  }

  private addCone(x: number, z: number): void {
    const grp = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff3300,
        emissiveIntensity: 0.3
      })
    );
    cone.position.y = 0.4;
    grp.add(cone);
    grp.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.08, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      )
    );
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 0.12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    stripe.position.y = 0.35;
    grp.add(stripe);
    grp.position.set(x, 0, z);
    this.scene.add(grp);
  }

  // ─── Gun ──────────────────────────────────────────────────────────────────

  private buildGun(): void {
    this.gunGroup = new THREE.Group();
    this.camera.add(this.gunGroup);
    this.gunGroup.position.set(0.30, -0.28, -0.55);

    const g   = this.gunGroup;
    const PI2 = Math.PI / 2;

    // ── Helper lambdas ──────────────────────────────────────────────────────
    const box = (
      w: number, h: number, d: number, mat: THREE.Material,
      px = 0, py = 0, pz = 0
    ): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      return m;
    };
    const cyl = (
      rt: number, rb: number, ht: number, seg: number, mat: THREE.Material,
      px = 0, py = 0, pz = 0
    ): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, ht, seg), mat);
      m.position.set(px, py, pz);
      m.rotation.x = PI2;
      return m;
    };

    // ── PBR materials ───────────────────────────────────────────────────────
    const matMetal  = new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.70, metalness: 0.88 });
    const matBarrel = new THREE.MeshStandardMaterial({ color: 0x1c1e25, roughness: 0.18, metalness: 0.98 });
    const matRail   = new THREE.MeshStandardMaterial({ color: 0x2d3040, roughness: 0.85, metalness: 0.68 });
    const matGrip   = new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.97, metalness: 0.03 });
    const matMag    = new THREE.MeshStandardMaterial({ color: 0x1e2130, roughness: 0.80, metalness: 0.74 });
    const matEdge   = new THREE.MeshStandardMaterial({ color: 0x464c58, roughness: 0.40, metalness: 0.96 });
    const matSight  = new THREE.MeshStandardMaterial({ color: 0x1c2028, roughness: 0.55, metalness: 0.92 });
    const matGlass  = new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const matDot    = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    const matFL     = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const matFL2    = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const matFLRing = new THREE.MeshBasicMaterial({ color: 0xff8822, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });

    // ── Lower receiver ──────────────────────────────────────────────────────
    g.add(box(0.054, 0.078, 0.32,  matMetal,  0,      -0.012, -0.240));
    // Edge highlights
    g.add(box(0.055, 0.003, 0.32,  matEdge,   0,      -0.051, -0.240));
    g.add(box(0.003, 0.078, 0.32,  matEdge,   0.028,  -0.012, -0.240));
    g.add(box(0.003, 0.078, 0.32,  matEdge,  -0.028,  -0.012, -0.240));
    // Trigger guard — bottom bar + 4 pillars
    g.add(box(0.046, 0.005, 0.092, matMetal,  0,      -0.068, -0.155));
    g.add(box(0.005, 0.032, 0.005, matMetal,  0.022,  -0.051, -0.108));
    g.add(box(0.005, 0.032, 0.005, matMetal, -0.022,  -0.051, -0.108));
    g.add(box(0.005, 0.032, 0.005, matMetal,  0.022,  -0.051, -0.202));
    g.add(box(0.005, 0.032, 0.005, matMetal, -0.022,  -0.051, -0.202));
    // Trigger
    g.add(box(0.007, 0.026, 0.005, matEdge,   0,      -0.057, -0.164));
    g.add(box(0.007, 0.005, 0.018, matEdge,   0,      -0.071, -0.157));
    // Fire-selector lever (right side)
    g.add(box(0.003, 0.008, 0.024, matEdge,   0.029,  -0.008, -0.068));
    // Mag release button
    g.add(box(0.005, 0.009, 0.009, matEdge,   0.029,  -0.018, -0.185));

    // ── Upper receiver / flat-top ────────────────────────────────────────────
    g.add(box(0.054, 0.052, 0.34,  matMetal,  0,       0.064, -0.230));
    // Edge highlights
    g.add(box(0.055, 0.004, 0.34,  matEdge,   0,       0.089, -0.230));
    g.add(box(0.003, 0.052, 0.34,  matEdge,   0.028,   0.064, -0.230));
    g.add(box(0.003, 0.052, 0.34,  matEdge,  -0.028,   0.064, -0.230));
    g.add(box(0.054, 0.052, 0.004, matEdge,   0,       0.064, -0.402));
    // Picatinny rail teeth on top (16 teeth, 0.022 pitch)
    for (let i = 0; i < 16; i++) {
      g.add(box(0.052, 0.010, 0.017, i % 2 === 0 ? matEdge : matMetal,
                0, 0.094, -0.058 - i * 0.022));
    }
    // Charging handle (rear of upper)
    g.add(box(0.018, 0.013, 0.030, matEdge,   0,       0.076,  0.038));
    g.add(box(0.036, 0.018, 0.014, matEdge,   0,       0.078,  0.057));
    g.add(box(0.007, 0.009, 0.007, matEdge,   0.019,   0.080,  0.057));
    g.add(box(0.007, 0.009, 0.007, matEdge,  -0.019,   0.080,  0.057));
    // Ejection port / dust cover (right side, indented)
    g.add(box(0.004, 0.026, 0.062, matMetal,  0.029,   0.060, -0.262));
    // Rear BUIS sight (flip-up, folded down)
    g.add(box(0.034, 0.015, 0.010, matEdge,   0,       0.097, -0.052));
    g.add(box(0.007, 0.018, 0.010, matEdge,   0,       0.108, -0.045));
    g.add(box(0.007, 0.018, 0.010, matEdge,   0,       0.108, -0.059));

    // ── Handguard (M-LOK rail) ───────────────────────────────────────────────
    g.add(box(0.068, 0.064, 0.30,  matRail,   0,       0.034, -0.520));
    // End caps
    g.add(box(0.072, 0.068, 0.009, matEdge,   0,       0.034, -0.368));
    g.add(box(0.072, 0.068, 0.009, matEdge,   0,       0.034, -0.672));
    // Rail continuation on top (12 teeth)
    for (let i = 0; i < 12; i++) {
      g.add(box(0.054, 0.010, 0.017, i % 2 === 0 ? matEdge : matRail,
                0, 0.068, -0.393 - i * 0.022));
    }
    // Bottom & side rail strips
    g.add(box(0.068, 0.009, 0.30,  matEdge,   0,       0.001, -0.520));
    g.add(box(0.009, 0.064, 0.30,  matEdge,   0.032,   0.034, -0.520));
    g.add(box(0.009, 0.064, 0.30,  matEdge,  -0.032,   0.034, -0.520));
    // M-LOK slots (6 rows, bottom + both sides)
    for (let i = 0; i < 6; i++) {
      const pz = -0.398 - i * 0.048;
      g.add(box(0.068, 0.003, 0.036, matGrip, 0,       0.000,  pz));
      g.add(box(0.003, 0.022, 0.036, matGrip, 0.034,   0.034,  pz));
      g.add(box(0.003, 0.022, 0.036, matGrip, -0.034,  0.034,  pz));
    }

    // ── Barrel ──────────────────────────────────────────────────────────────
    g.add(cyl(0.022, 0.022, 0.26, 12, matBarrel, 0, 0.034, -0.495)); // thick (inside handguard)
    g.add(cyl(0.016, 0.016, 0.33, 12, matBarrel, 0, 0.034, -0.755)); // exposed section
    // Gas block
    g.add(box(0.038, 0.040, 0.040, matMetal, 0, 0.034, -0.570));
    g.add(box(0.009, 0.040, 0.040, matEdge,  0.020, 0.034, -0.570));
    g.add(box(0.009, 0.040, 0.040, matEdge, -0.020, 0.034, -0.570));
    // Gas tube
    g.add(cyl(0.005, 0.005, 0.195, 6, matEdge, 0, 0.050, -0.455));

    // ── Flash hider (A2 birdcage) ────────────────────────────────────────────
    g.add(cyl(0.025, 0.020, 0.056, 8, matEdge,   0, 0.034, -0.938));
    g.add(cyl(0.022, 0.022, 0.014, 8, matBarrel, 0, 0.034, -0.902));
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const pr = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.030, 0.007), matEdge);
      pr.position.set(Math.sin(ang) * 0.023, 0.034 + Math.cos(ang) * 0.023, -0.942);
      pr.rotation.z = ang;
      g.add(pr);
    }

    // ── Muzzle reference point ────────────────────────────────────────────────
    this.gunTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.001, 0.001, 0.001, 4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    this.gunTip.rotation.x = PI2;
    this.gunTip.position.set(0, 0.034, -0.970);
    g.add(this.gunTip);

    // ── Pistol grip ──────────────────────────────────────────────────────────
    const gpGrp = new THREE.Group();
    gpGrp.position.set(0, -0.078, -0.086);
    gpGrp.rotation.x = -0.28;
    gpGrp.add(box(0.046, 0.105, 0.055, matGrip));
    for (let i = 0; i < 5; i++) {
      gpGrp.add(box(0.048, 0.003, 0.057, i % 2 === 0 ? matGrip : matEdge, 0, -0.018 - i * 0.017, 0.001));
    }
    gpGrp.add(box(0.009, 0.105, 0.055, matEdge,  0.027, 0, 0));
    gpGrp.add(box(0.009, 0.105, 0.055, matEdge, -0.027, 0, 0));
    gpGrp.add(box(0.046, 0.010, 0.055, matMetal, 0,  0.057, 0));
    g.add(gpGrp);

    // ── Magazine ─────────────────────────────────────────────────────────────
    const magGrp = new THREE.Group();
    magGrp.position.set(0, -0.175, -0.210);
    magGrp.add(box(0.040, 0.125, 0.060, matMag));
    magGrp.add(box(0.038, 0.012, 0.058, matEdge,  0,  0.068,  0));
    magGrp.add(box(0.040, 0.125, 0.007, matEdge,  0,  0,      0.034));
    magGrp.add(box(0.040, 0.010, 0.062, matEdge,  0, -0.067,  0));
    magGrp.add(box(0.003, 0.125, 0.060, matEdge,  0.021, 0,   0));
    magGrp.add(box(0.003, 0.125, 0.060, matEdge, -0.021, 0,   0));
    for (let i = 0; i < 4; i++) {
      magGrp.add(box(0.002, 0.011, 0.044, matGrip, 0.021, 0.020 - i * 0.030, 0));
    }
    g.add(magGrp);

    // ── Stock (M4 collapsible) ────────────────────────────────────────────────
    g.add(cyl(0.016, 0.016, 0.155, 10, matBarrel, 0, 0.028, 0.137));
    g.add(cyl(0.022, 0.022, 0.012, 10, matEdge,   0, 0.028, 0.059));
    g.add(box(0.044, 0.060, 0.118, matMetal,  0,  0.016,  0.103));
    g.add(box(0.042, 0.018, 0.110, matEdge,   0,  0.052,  0.103));
    g.add(box(0.042, 0.064, 0.010, matGrip,   0,  0.012,  0.163));
    g.add(box(0.013, 0.010, 0.013, matEdge,  0.025,  0.038, 0.120));
    g.add(box(0.042, 0.010, 0.010, matEdge,   0, -0.018,  0.162));

    // ── EOTech holographic sight ─────────────────────────────────────────────
    const sGrp = new THREE.Group();
    sGrp.position.set(0, 0.116, -0.215);
    sGrp.add(box(0.056, 0.044, 0.082, matSight));
    sGrp.add(box(0.057, 0.045, 0.003, matEdge,   0, 0,  -0.041));
    sGrp.add(box(0.057, 0.045, 0.003, matEdge,   0, 0,   0.041));
    sGrp.add(box(0.003, 0.044, 0.082, matEdge,   0.029, 0, 0));
    sGrp.add(box(0.003, 0.044, 0.082, matEdge,  -0.029, 0, 0));
    sGrp.add(box(0.044, 0.032, 0.080, matGlass));
    sGrp.add(box(0.058, 0.012, 0.082, matSight,  0,  0.028, 0));
    sGrp.add(box(0.056, 0.010, 0.082, matEdge,   0, -0.027, 0));
    sGrp.add(box(0.008, 0.017, 0.017, matEdge,   0.032,  0.006, -0.020));
    sGrp.add(box(0.008, 0.017, 0.017, matEdge,   0.032,  0.006,  0.020));
    sGrp.add(box(0.010, 0.009, 0.009, matEdge,   0.032,  0.016, -0.032));
    sGrp.add(box(0.010, 0.009, 0.009, matEdge,   0.032,  0.016,  0.032));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.004, 8), matDot);
    dot.position.set(0, 0, -0.038);
    dot.rotation.y = Math.PI;
    sGrp.add(dot);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.010, 0.012, 20), matDot);
    ring.position.set(0, 0, -0.038);
    ring.rotation.y = Math.PI;
    sGrp.add(ring);
    g.add(sGrp);

    // ── Tactical flashlight ───────────────────────────────────────────────────
    const tlGrp = new THREE.Group();
    tlGrp.position.set(0, -0.002, -0.468);
    tlGrp.add(cyl(0.013, 0.015, 0.068, 10, matSight));
    tlGrp.add(cyl(0.016, 0.013, 0.014, 10, matSight, 0, 0, -0.040));
    tlGrp.add(cyl(0.013, 0.013, 0.004, 10,
      new THREE.MeshStandardMaterial({ color: 0xccddff, roughness: 0.08, metalness: 0.1, emissive: 0x112244, emissiveIntensity: 0.7 }),
      0, 0, -0.048));
    tlGrp.add(box(0.009, 0.013, 0.019, matEdge, 0.016, 0, 0.018));
    g.add(tlGrp);

    // ── Muzzle flash planes ───────────────────────────────────────────────────
    this._muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), matFL);
    this._muzzleFlash.position.set(0, 0.034, -0.99);
    this._muzzleFlash.rotation.y = Math.PI / 4;
    g.add(this._muzzleFlash);

    this._muzzleFlash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), matFL2);
    this._muzzleFlash2.position.set(0, 0.034, -0.99);
    this._muzzleFlash2.rotation.z = Math.PI / 4;
    g.add(this._muzzleFlash2);

    this._muzzleFlashRing = new THREE.Mesh(
      new THREE.RingGeometry(0.012, 0.036, 8), matFLRing
    );
    this._muzzleFlashRing.position.set(0, 0.034, -0.99);
    g.add(this._muzzleFlashRing);
  }

  // ─── Player controls ──────────────────────────────────────────────────────

  private setupEventListeners(): void {
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("mousedown", this._onMouseDown);
    document.addEventListener("pointerlockchange", this._onPLChange);
    document.addEventListener("pointerlockerror", this._onPLError);
    document.addEventListener("keydown", this._onEsc);
    window.addEventListener("resize", this._onResize);
    window.addEventListener("blur", this._onBlur);
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this._onPointerDown
    );
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isLocked) return;
    let mx: number, my: number;
    if (this.fallbackMode) {
      if (this.fb.lastX === null) {
        this.fb.lastX = e.clientX;
        this.fb.lastY = e.clientY;
        return;
      }
      mx = (e.clientX - this.fb.lastX) * MOUSE_SENS_FB;
      my = (e.clientY - (this.fb.lastY ?? e.clientY)) * MOUSE_SENS_FB;
      this.fb.lastX = e.clientX;
      this.fb.lastY = e.clientY;
    } else {
      mx = (e.movementX || 0) * MOUSE_SENS;
      my = (e.movementY || 0) * MOUSE_SENS;
    }
    this.yawObject.rotation.y -= mx;
    this.pitchObject.rotation.x -= my;
    this.pitchObject.rotation.x = Math.max(
      -PI_2 + 0.05,
      Math.min(PI_2 - 0.05, this.pitchObject.rotation.x)
    );
  }

  private handleFbPointerMove(e: PointerEvent): void {
    if (!this.isLocked || !this.fallbackMode) return;
    if (this.fb.lastX === null) {
      this.fb.lastX = e.clientX;
      this.fb.lastY = e.clientY;
      return;
    }
    const mx = (e.clientX - this.fb.lastX) * MOUSE_SENS_FB;
    const my = (e.clientY - (this.fb.lastY ?? e.clientY)) * MOUSE_SENS_FB;
    this.fb.lastX = e.clientX;
    this.fb.lastY = e.clientY;
    this.yawObject.rotation.y -= mx;
    this.pitchObject.rotation.x -= my;
    this.pitchObject.rotation.x = Math.max(
      -PI_2 + 0.05,
      Math.min(PI_2 - 0.05, this.pitchObject.rotation.x)
    );
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        this.moveState.forward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        this.moveState.back = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.moveState.left = true;
        break;
      case "KeyD":
      case "ArrowRight":
        this.moveState.right = true;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.moveState.sprint = true;
        break;
      case "Space":
        if (this.onGround) {
          this.playerYVel = JUMP_V;
          this.onGround = false;
        }
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        this.moveState.forward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        this.moveState.back = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.moveState.left = false;
        break;
      case "KeyD":
      case "ArrowRight":
        this.moveState.right = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.moveState.sprint = false;
        break;
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.gameActive) return;
    if (this.modalOpen) return;
    if (!this.isLocked) {
      this.lockPointer();
      return;
    }
    if (e.button === 0) this.shoot();
  }

  private handlePointerDown(e: PointerEvent): void {
    if (!this.fallbackMode || !this.isLocked || this.pointerCaptured) return;
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.pointerCaptured = true;
      this.renderer.domElement.addEventListener(
        "pointermove",
        this._onPointerMove
      );
      this.renderer.domElement.addEventListener(
        "lostpointercapture",
        () => {
          this.pointerCaptured = false;
          this.renderer.domElement.removeEventListener(
            "pointermove",
            this._onPointerMove
          );
        },
        { once: true }
      );
    } catch {
      /* ignore */
    }
  }

  private handlePointerLockChange(): void {
    if (this.fallbackMode) return;
    if (document.pointerLockElement === this.renderer.domElement) {
      this.isLocked = true;
      document.body.classList.add("playing");
      this.sounds.init();
      this.cb.onLock();
    } else {
      this.isLocked = false;
      document.body.classList.remove("playing");
      if (!this.modalOpen && !this.dead && this.gameActive) this.cb.onUnlock();
    }
  }

  private enableFallback(): void {
    if (this.fallbackMode) return;
    this.fallbackMode = true;
  }

  private handleResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private moveWithCollision(dx: number, dz: number): void {
    const feetY = this.yawObject.position.y - PLAYER_HEIGHT;
    let nx = this.yawObject.position.x + dx;
    if (!this.collidesAt(nx, this.yawObject.position.z, feetY))
      this.yawObject.position.x = nx;
    let nz = this.yawObject.position.z + dz;
    if (!this.collidesAt(this.yawObject.position.x, nz, feetY))
      this.yawObject.position.z = nz;
  }

  private collidesAt(x: number, z: number, feetY: number): boolean {
    for (const c of this.colliders) {
      if (feetY > c.height) continue;
      if (
        x + PLAYER_RADIUS > c.minX &&
        x - PLAYER_RADIUS < c.maxX &&
        z + PLAYER_RADIUS > c.minZ &&
        z - PLAYER_RADIUS < c.maxZ
      )
        return true;
    }
    return false;
  }

  private moveForward(d: number): void {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.yawObject.quaternion
    );
    fwd.y = 0;
    fwd.normalize();
    this.moveWithCollision(fwd.x * d, fwd.z * d);
  }

  private moveRight(d: number): void {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
      this.yawObject.quaternion
    );
    right.y = 0;
    right.normalize();
    this.moveWithCollision(right.x * d, right.z * d);
  }

  private getPlayerWorldPos(): THREE.Vector3 {
    this.yawObject.updateMatrixWorld();
    this.camWorldPos.setFromMatrixPosition(this.camera.matrixWorld);
    return this.camWorldPos;
  }

  // ─── Health Zones ─────────────────────────────────────────────────────────

  private spawnHealthZones(): void {
    const POSITIONS: [number, number][] = [
      [  0,   0],   // central plaza
      [ 42,   0],   // east road  (mid-point between outer blocks)
      [-42,   0],   // west road
      [  0,  42],   // north road
      [  0, -42],   // south road
    ];
    const COL = 0x00ff55;
    for (const [x, z] of POSITIONS) {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);

      const baseMat = new THREE.MeshStandardMaterial({
        color: COL, emissive: COL, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.6,
      });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.07, 20), baseMat);
      base.position.y = 0.035;
      grp.add(base);

      const ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.05, 6, 24),
        new THREE.MeshStandardMaterial({ color: COL, emissive: COL, emissiveIntensity: 1 }),
      );
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.07;
      grp.add(ringMesh);

      const plusMat = new THREE.MeshStandardMaterial({ color: COL, emissive: COL, emissiveIntensity: 1.2 });
      const plusGrp = new THREE.Group();
      plusGrp.position.y = 1.1;
      plusGrp.add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.12), plusMat));
      plusGrp.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.12), plusMat));
      grp.add(plusGrp);

      this.scene.add(grp);
      this.healthZones.push({ group: grp, base, plus: plusGrp, cooldown: 0, ready: true });
    }
  }

  // ─── Shooting ─────────────────────────────────────────────────────────────

  private shoot(): void {
    if (!this.isLocked || this.dead) return;
    if (this.ammo <= 0) return;
    this.ammo--;
    this.cb.onAmmoChange(this.ammo, this.ammoMax);
    this.recoil = 0.18;
    this.sounds.shoot();
    this.flashMuzzle();

    this.yawObject.updateMatrixWorld(true);
    this._v3a.setFromMatrixPosition(this.camera.matrixWorld);
    this.camera.getWorldDirection(this._v3b);

    this.spawnProjectile(this._v3a, this._v3b);

    this._fireRay.set(this._v3a, this._v3b);
    this._rebuildFireTargets();
    const hits = this._fireRay.intersectObjects(this._fireTargets, false);
    if (hits.length) {
      const hit = hits[0];
      if (hit.object.userData.isStation) {
        this.hitStation(hit.object as THREE.Mesh);
        this.flashHitMarker();
      } else if (hit.object.userData.isEnemy) {
        this.damageEnemy(hit.object.userData.enemyRef as Enemy);
        this.flashHitMarker();
      } else {
        this.spawnImpactSpark(hit.point);
      }
    }
  }

  private flashMuzzle(): void {
    if (!this._muzzleFlash) return;
    (this._muzzleFlash.material     as THREE.MeshBasicMaterial).opacity = 1.00;
    (this._muzzleFlash2!.material   as THREE.MeshBasicMaterial).opacity = 0.85;
    (this._muzzleFlashRing!.material as THREE.MeshBasicMaterial).opacity = 0.90;
    this._muzzleFlash.scale.setScalar(1);
    this._muzzleTimer = 0.065;
    this._recoilY     = 0.025;
    this._recoilRot   = 0.045;
  }

  private flashHitMarker(): void {
    const el = document.getElementById("hit-marker");
    if (!el) return;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  private spawnProjectile(origin: THREE.Vector3, dir: THREE.Vector3): void {
    const m = new THREE.Mesh(this._playerShotGeo, this._playerShotMat);
    m.position.copy(origin).add(dir.clone().multiplyScalar(1));
    this.scene.add(m);
    this.projectiles.push({ mesh: m, dir: dir.clone(), life: 1.2 });
  }

  private spawnImpactSpark(point: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(this._sparkGeo, this._sparkMat);
      p.position.copy(point);
      this.scene.add(p);
      const d = this._v3c.set(
        Math.random() - 0.5,
        Math.random() * 0.5 + 0.2,
        Math.random() - 0.5
      ).normalize().clone();
      this.projectiles.push({ mesh: p, dir: d, life: 0.4, debris: true });
    }
  }

  private hitStation(crystal: THREE.Mesh): void {
    const id = crystal.userData.stationId as StationId;
    crystal.userData.shake = 0.4;
    if (!this.discovered.has(id)) {
      this.discovered.add(id);
      this.cb.onDiscoverStation(id);
      this.cb.onToast("STATION UNLOCKED", id.toUpperCase());
      if (this.discovered.size === STATIONS.length) {
        setTimeout(
          () => this.cb.onToast("ALL STATIONS DISCOVERED", "MISSION COMPLETE"),
          2400
        );
      }
    }
    this.modalOpen = true;
    // Release pointer lock so the cursor is visible and the modal is clickable
    if (!this.fallbackMode) {
      document.exitPointerLock();
    } else {
      this.isLocked = false;
      document.body.classList.remove("playing");
    }
    this.cb.onOpenStation(id);
  }

  // ─── Enemies ──────────────────────────────────────────────────────────────

  private _rebuildFireTargets(): void {
    this._fireTargets.length = 0;
    for (const m of this.stationMeshes) this._fireTargets.push(m);
    for (const e of this.enemies) this._fireTargets.push(e.mesh);
    for (const w of this.wallMeshes) this._fireTargets.push(w);
  }

  private spawnEnemy(): void {
    if (this.enemies.length >= ENEMY_MAX) return;
    const grp = new THREE.Group();

    // Dark octahedron body
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff2030, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.9 })
    );
    core.userData = { isEnemy: true };
    grp.add(core);

    // Outer ring — large, horizontal
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.05, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0x0d0d0d, emissive: 0xff2030, emissiveIntensity: 0.5, metalness: 0.95, roughness: 0.1 })
    );
    ring.rotation.x = Math.PI / 2;
    grp.add(ring);

    // Inner ring — smaller, tilted (gyroscope effect)
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.045, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x0d0d0d, emissive: 0xff4010, emissiveIntensity: 0.9, metalness: 0.95, roughness: 0.1 })
    );
    ring2.rotation.set(Math.PI / 3, Math.PI / 6, 0);
    grp.add(ring2);

    // Red eye / sensor
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff1000, emissiveIntensity: 3.0, roughness: 0.05, metalness: 0 })
    );
    eye.position.set(0, 0, 0.52);
    grp.add(eye);

    // 4 thruster nubs on the outer ring
    const tnGeo = new THREE.SphereGeometry(0.09, 6, 4);
    const tnMat = new THREE.MeshStandardMaterial({ color: 0x1a0a00, emissive: 0xff5000, emissiveIntensity: 1.5, metalness: 0.8 });
    for (const [x, z] of [[1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0]] as [number, number][]) {
      const t = new THREE.Mesh(tnGeo, tnMat);
      t.position.set(x, 0, z);
      grp.add(t);
    }

    const angle = Math.random() * Math.PI * 2;
    grp.position.set(Math.cos(angle) * 30, 2 + Math.random() * 2, Math.sin(angle) * 30);
    this.scene.add(grp);

    const enemy: Enemy = { group: grp, mesh: core, ring, ring2, hp: 2, speed: 2 + Math.random() * 1.5, fireCooldown: 2 + Math.random() * 2, bobOffset: Math.random() * Math.PI * 2 };
    core.userData.enemyRef = enemy;

    this.enemies.push(enemy);
    this.cb.onEnemyCountChange(this.enemies.length);
  }

  private damageEnemy(enemy: Enemy): void {
    enemy.hp -= 1;
    (enemy.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 4;
    setTimeout(() => {
      if (enemy.mesh) (enemy.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
    }, 120);
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Enemy): void {
    // Improved explosion — 30 particles, 4 mixed colours, shared geo/mat
    for (let i = 0; i < 12; i++) {
      const ci = Math.floor(Math.random() * this._explMats.length);
      const p = new THREE.Mesh(this._explGeo, this._explMats[ci]);
      p.position.copy(enemy.group.position);
      this.scene.add(p);
      const d = this._v3c.set(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(0.8 + Math.random() * 1.2);
      this.projectiles.push({ mesh: p, dir: d.clone(), life: 0.6 + Math.random() * 0.4, debris: true });
    }
    this.scene.remove(enemy.group);
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.cb.onEnemyCountChange(this.enemies.length);
    // Screen shake + sound
    this._shakeAmt  = 0.08;
    this._shakeTime = 0.2;
    this.sounds.explode();
    this.cb.onKill();
  }

  private hasLineOfSight(enemy: Enemy, playerPos: THREE.Vector3): boolean {
    this._v3b.copy(enemy.group.position);
    this._v3a.subVectors(playerPos, this._v3b);
    const dist = this._v3a.length();
    this._losRay.set(this._v3b, this._v3a.normalize());
    this._losRay.near = 0.5;
    this._losRay.far  = dist - 0.5;
    return this._losRay.intersectObjects(this.wallMeshes, false).length === 0;
  }

  private enemyShoot(enemy: Enemy, playerPos: THREE.Vector3): void {
    const dir = this._v3c.subVectors(playerPos, enemy.group.position).normalize().clone();
    const m = new THREE.Mesh(this._enemyShotGeo, this._enemyShotMat);
    m.position.copy(enemy.group.position);
    this.scene.add(m);
    this.enemyShots.push({ mesh: m, dir, life: 3 });
  }

  // ─── Game state ───────────────────────────────────────────────────────────

  private damagePlayer(amt: number): void {
    if (this.dead) return;
    this.health -= amt;
    this.cb.onHealthChange(this.health);
    const vignette = document.getElementById("damage-vignette");
    if (vignette) {
      vignette.classList.add("hit");
      if (this._vignetteTimer) clearTimeout(this._vignetteTimer);
      this._vignetteTimer = setTimeout(() => { vignette.classList.remove("hit"); this._vignetteTimer = null; }, 150);
    }
    // Screen shake + sound
    this._shakeAmt  = 0.12 + amt * 0.006;
    this._shakeTime = 0.25;
    this.sounds.hit();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.cb.onHealthChange(0);
      this.cb.onDead();
      // React handles redirect to lobby — no auto-respawn
    }
  }

  private respawn(): void {
    this.health = 100;
    this.dead = false;
    this.yawObject.position.set(0, PLAYER_HEIGHT, 0);
    this.pitchObject.rotation.x = 0;
    this.yawObject.rotation.y = 0;
    this.playerYVel = 0;
    this.cb.onHealthChange(100);
    this.cb.onRespawn();
    this.cb.onToast("RESPAWNED", "BACK IN THE ARENA");
  }

  // ─── Minimap ──────────────────────────────────────────────────────────────

  private drawMinimap(t: number): void {
    const W = this.mmCanvas.width,
      H = this.mmCanvas.height;
    this.mmCtx.clearRect(0, 0, W, H);

    // Grid
    this.mmCtx.strokeStyle = "rgba(0,255,213,.15)";
    this.mmCtx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      this.mmCtx.beginPath();
      this.mmCtx.moveTo(i * (W / 10), 0);
      this.mmCtx.lineTo(i * (W / 10), H);
      this.mmCtx.stroke();
      this.mmCtx.beginPath();
      this.mmCtx.moveTo(0, i * (H / 10));
      this.mmCtx.lineTo(W, i * (H / 10));
      this.mmCtx.stroke();
    }

    const scale = W / 90;
    const w2m = (x: number, z: number): [number, number] => [
      W / 2 + x * scale,
      H / 2 + z * scale
    ];

    // Obstacles
    this.mmCtx.fillStyle = "rgba(120,140,180,.45)";
    this.mmCtx.strokeStyle = "rgba(0,255,213,.5)";
    this.mmCtx.lineWidth = 0.5;
    this.colliders.forEach((c) => {
      const [x1, y1] = w2m(c.minX, c.minZ),
        [x2, y2] = w2m(c.maxX, c.maxZ);
      this.mmCtx.fillRect(x1, y1, x2 - x1, y2 - y1);
      this.mmCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    });

    // Stations
    STATIONS.forEach((s) => {
      const [mx, my] = w2m(s.position[0], s.position[2]);
      const col = "#" + s.color.toString(16).padStart(6, "0");
      const found = this.discovered.has(s.id);
      this.mmCtx.strokeStyle = found ? col : "rgba(255,255,255,.55)";
      this.mmCtx.lineWidth = 1.2;
      this.mmCtx.beginPath();
      this.mmCtx.arc(mx, my, 8, 0, Math.PI * 2);
      this.mmCtx.stroke();
      this.mmCtx.fillStyle = found ? col : "rgba(255,255,255,.85)";
      this.mmCtx.beginPath();
      this.mmCtx.arc(mx, my, 6, 0, Math.PI * 2);
      this.mmCtx.fill();
      this.mmCtx.fillStyle = "#000814";
      this.mmCtx.font = "bold 8px Orbitron, monospace";
      this.mmCtx.textAlign = "center";
      this.mmCtx.textBaseline = "middle";
      this.mmCtx.fillText(s.title.charAt(0), mx, my + 0.5);
    });

    // ── Waypoint indicator on minimap ──────────────────────────────────────
    const mmWaypoint = useGameStore.getState().waypoint;
    if (mmWaypoint) {
      let tx: number | null = null, tz: number | null = null;
      if (mmWaypoint.type === 'station') {
        const st = STATIONS.find((s) => s.id === mmWaypoint.id);
        if (st) { tx = st.position[0]; tz = st.position[2]; }
      } else {
        const playerP = this.getPlayerWorldPos();
        let best: typeof this.healthZones[0] | null = null, bestD = Infinity;
        for (const hz of this.healthZones) {
          if (!hz.ready) continue;
          const d = hz.group.position.distanceTo(playerP);
          if (d < bestD) { bestD = d; best = hz; }
        }
        if (best) { tx = best.group.position.x; tz = best.group.position.z; }
      }
      if (tx !== null && tz !== null) {
        const [ttx, tty] = w2m(tx, tz);
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        const col = mmWaypoint.type === 'heal' ? `rgba(0,255,85,${0.55 + pulse * 0.45})` : `rgba(255,220,0,${0.55 + pulse * 0.45})`;
        // Pulsing outer ring
        this.mmCtx.strokeStyle = col;
        this.mmCtx.lineWidth = 2;
        this.mmCtx.beginPath();
        this.mmCtx.arc(ttx, tty, 11 + pulse * 5, 0, Math.PI * 2);
        this.mmCtx.stroke();
        // Dashed line from player to target
        const playerP2 = this.getPlayerWorldPos();
        const [ppx, ppy] = w2m(playerP2.x, playerP2.z);
        const ddx = ttx - ppx, ddy = tty - ppy;
        const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (ddist > 16) {
          const nx = ddx / ddist, ny = ddy / ddist;
          this.mmCtx.setLineDash([3, 4]);
          this.mmCtx.strokeStyle = col;
          this.mmCtx.lineWidth = 1.2;
          this.mmCtx.beginPath();
          this.mmCtx.moveTo(ppx + nx * 8, ppy + ny * 8);
          this.mmCtx.lineTo(ttx - nx * 15, tty - ny * 15);
          this.mmCtx.stroke();
          this.mmCtx.setLineDash([]);
        }
      }
    }

    // Enemies
    this.enemies.forEach((e) => {
      const [mx, my] = w2m(e.group.position.x, e.group.position.z);
      this.mmCtx.fillStyle = "#ff3860";
      this.mmCtx.beginPath();
      this.mmCtx.arc(mx, my, 3, 0, Math.PI * 2);
      this.mmCtx.fill();
    });

    // Health zones — green + cross, dim when on cooldown
    this.healthZones.forEach((zone) => {
      const [mx, my] = w2m(zone.group.position.x, zone.group.position.z);
      this.mmCtx.fillStyle = zone.ready ? '#00ff55' : 'rgba(0,255,85,.22)';
      this.mmCtx.fillRect(mx - 5, my - 1.5, 10, 3);
      this.mmCtx.fillRect(mx - 1.5, my - 5, 3, 10);
    });

    // Player
    const wp = this.getPlayerWorldPos();
    const [px, py] = w2m(wp.x, wp.z);
    const heading = Math.atan2(-this.shootDirCached.x, -this.shootDirCached.z);
    this.mmCtx.save();
    this.mmCtx.translate(px, py);
    this.mmCtx.rotate(heading);
    this.mmCtx.fillStyle = "#fff";
    this.mmCtx.beginPath();
    this.mmCtx.moveTo(0, -7);
    this.mmCtx.lineTo(5, 5);
    this.mmCtx.lineTo(-5, 5);
    this.mmCtx.closePath();
    this.mmCtx.fill();
    this.mmCtx.restore();
  }

  // ─── Animation loop ───────────────────────────────────────────────────────

  startLoop(): void {
    this.clock.start();
    const loop = () => {
      this.animId = requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const inPlay = this.isLocked && !this.dead && !this.modalOpen;

    this._fpsFrames++;
    this._fpsAccum += dt;
    if (this._fpsAccum >= 0.5) {
      this.cb.onFpsUpdate(Math.round(this._fpsFrames / this._fpsAccum));
      this._fpsFrames = 0;
      this._fpsAccum  = 0;
    }
    this._tacAccum += dt;
    if (this._tacAccum >= 0.2) {
      this._tacAccum = 0;
      useGameStore.getState().setTacticalData(
        this.enemies.map((e) => ({ x: e.group.position.x, z: e.group.position.z })),
        { x: this.yawObject.position.x, z: this.yawObject.position.z, angle: this.yawObject.rotation.y },
        this.healthZones.map((hz) => hz.cooldown <= 0)
      );
    }

    // ── Waypoint screen projection (10 Hz) ────────────────────────────────
    this._wpAccum += dt;
    if (this._wpAccum >= 0.1) {
      this._wpAccum = 0;
      const store = useGameStore.getState();
      const wpData = store.waypoint;

      // Auto-clear station waypoint when discovered
      if (wpData?.type === 'station' && this.discovered.has(wpData.id)) {
        store.setWaypoint(null);
      }
      // Auto-clear heal waypoint when health restored
      if (wpData?.type === 'heal' && this.health >= 80) {
        store.setWaypoint(null);
        this._lowHealthWarned = false;
      }
      // Auto-trigger heal waypoint when health < 50
      if (!this.dead && this.health < 50 && !this._lowHealthWarned) {
        this._lowHealthWarned = true;
        if (!store.waypoint) store.setWaypoint({ type: 'heal' });
      }
      if (this.health >= 70) this._lowHealthWarned = false;

      // Project waypoint world position → screen coords
      const active = useGameStore.getState().waypoint;
      if (active) {
        let wx = 0, wy = 1.5, wz = 0;
        let resolved = false;
        if (active.type === 'station') {
          const st = STATIONS.find((s) => s.id === active.id);
          if (st) { wx = st.position[0]; wz = st.position[2]; resolved = true; }
        } else {
          const pp = this.getPlayerWorldPos();
          let best: HealthZone | null = null, bestD = Infinity;
          for (const hz of this.healthZones) {
            if (!hz.ready) continue;
            const d = hz.group.position.distanceTo(pp);
            if (d < bestD) { bestD = d; best = hz; }
          }
          if (best) { wx = best.group.position.x; wz = best.group.position.z; resolved = true; }
        }
        if (resolved) {
          this._v3c.set(wx, wy, wz);
          this._v3c.project(this.camera);
          const W = this.renderer.domElement.clientWidth  || window.innerWidth;
          const H = this.renderer.domElement.clientHeight || window.innerHeight;
          const sx = (this._v3c.x  *  0.5 + 0.5) * W;
          const sy = (-this._v3c.y *  0.5 + 0.5) * H;
          const inFront = this._v3c.z < 1.0;
          const margin = 70;
          const onscreen = inFront && sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin;
          const angle = Math.atan2(sy - H / 2, sx - W / 2);
          let ex = sx, ey = sy;
          if (!onscreen) {
            const cos = Math.cos(angle), sin = Math.sin(angle);
            const s1 = (W / 2 - margin) / Math.abs(cos || 0.0001);
            const s2 = (H / 2 - margin) / Math.abs(sin || 0.0001);
            const sc = Math.min(s1, s2);
            ex = W / 2 + cos * sc;
            ey = H / 2 + sin * sc;
            if (!inFront) { ex = W - ex; ey = H - ey; }
          }
          store.setWaypointScreen({ x: ex, y: ey, onscreen, angle });
        } else {
          store.setWaypointScreen(null);
        }
      } else {
        store.setWaypointScreen(null);
      }
    }

    this.skyMat.uniforms["time"].value = t;

    // Player movement
    if (this.isLocked && !this.dead) {
      this._v3a.set(0, 0, 0);
      if (this.moveState.forward) this._v3a.z -= 1;
      if (this.moveState.back)    this._v3a.z += 1;
      if (this.moveState.left)    this._v3a.x -= 1;
      if (this.moveState.right)   this._v3a.x += 1;
      this._v3a.normalize();
      const dir = this._v3a;
      const spd = this.moveState.sprint ? SPRINT : SPEED;
      if (dir.lengthSq() > 0) {
        this.moveForward(-dir.z * spd * dt);
        this.moveRight(dir.x * spd * dt);
        // Footstep dust
        if (this.onGround) {
          this._dustCooldown -= dt;
          if (this._dustCooldown <= 0) {
            this._dustCooldown = this.moveState.sprint ? 0.12 : 0.22;
            for (let i = 0; i < 2; i++) {
              const p = new THREE.Mesh(this._dustGeo, this._dustMat);
              p.position.set(
                this.yawObject.position.x + (Math.random() - 0.5) * 0.5,
                0.1,
                this.yawObject.position.z + (Math.random() - 0.5) * 0.5
              );
              this.scene.add(p);
              const d = this._v3c.set(
                (Math.random() - 0.5) * 0.3,
                0.3 + Math.random() * 0.3,
                (Math.random() - 0.5) * 0.3
              ).clone();
              this.projectiles.push({ mesh: p, dir: d, life: 0.35, debris: true });
            }
            this.sounds.step();
          }
        }
      }
      this.playerYVel -= GRAVITY * dt;
      this.yawObject.position.y += this.playerYVel * dt;
      if (this.yawObject.position.y <= PLAYER_HEIGHT) {
        this.yawObject.position.y = PLAYER_HEIGHT;
        this.playerYVel = 0;
        this.onGround = true;
      }
      const B = 50;
      this.yawObject.position.x = Math.max(
        -B,
        Math.min(B, this.yawObject.position.x)
      );
      this.yawObject.position.z = Math.max(
        -B,
        Math.min(B, this.yawObject.position.z)
      );
      this.camera.getWorldDirection(this.shootDirCached);
    }

    // ── Muzzle flash decay ──────────────────────────────────────────────────
    if (this._muzzleTimer > 0) {
      this._muzzleTimer -= dt;
      const f = Math.max(0, this._muzzleTimer / 0.065);
      if (this._muzzleFlash) {
        (this._muzzleFlash.material      as THREE.MeshBasicMaterial).opacity = f;
        (this._muzzleFlash2!.material    as THREE.MeshBasicMaterial).opacity = f * 0.85;
        (this._muzzleFlashRing!.material as THREE.MeshBasicMaterial).opacity = f * 0.70;
        this._muzzleFlash.scale.setScalar(0.70 + Math.random() * 0.60);
        this._muzzleFlash.rotation.z += dt * 18;
      }
    }

    // ── Recoil recovery ──────────────────────────────────────────────────────
    if (this.recoil    > 0) this.recoil    = Math.max(0, this.recoil    - dt * 7.0);
    if (this._recoilY  > 0) this._recoilY  = Math.max(0, this._recoilY  - dt * 5.5);
    if (this._recoilRot> 0) this._recoilRot= Math.max(0, this._recoilRot - dt * 4.5);

    // ── Weapon bob + sway ────────────────────────────────────────────────────
    const moving =
      this.moveState.forward || this.moveState.back ||
      this.moveState.left    || this.moveState.right;
    const sprinting = this.moveState.sprint && moving;
    const bobFreq   = sprinting ? 14 : 10;
    const bobAmt    = sprinting ? 0.020 : 0.007;

    let gx = 0.30, gy = -0.28;
    const gRotX = this._recoilRot;
    let gRotZ = 0;

    if (this.isLocked && moving) {
      gx += Math.sin(t * bobFreq) * bobAmt;
      gy += Math.abs(Math.sin(t * bobFreq)) * bobAmt * 0.7;
    }
    if (sprinting) {
      gRotZ = -0.22;
      gx   += 0.04;
      gy   -= 0.04;
    }

    this.gunGroup.rotation.x += (gRotX - this.gunGroup.rotation.x) * Math.min(1, dt * 16);
    this.gunGroup.rotation.z += (gRotZ - this.gunGroup.rotation.z) * Math.min(1, dt * 12);
    this.gunGroup.position.set(gx, gy - this._recoilY, -0.55 + this.recoil * 0.32);

    // Stations animate
    this.stationObjects.forEach((so, i) => {
      so.crystal.rotation.y += dt * 0.7;
      so.crystal.rotation.x += dt * 0.3;
      let bob = Math.sin(t * 1.5 + i) * 0.2;
      if (so.crystal.userData.shake > 0) {
        bob += (Math.random() - 0.5) * so.crystal.userData.shake;
        so.crystal.userData.shake = Math.max(
          0,
          so.crystal.userData.shake - dt * 2
        );
      }
      so.crystal.position.y = so.crystal.userData.baseY + bob;
      so.shell.rotation.y -= dt * 0.4;
      so.shell.rotation.x -= dt * 0.2;
      so.shell.position.y = so.crystal.position.y;
      so.ring.rotation.z += dt * 0.2;
    });

    // Sun tracks player
    const pp = this.getPlayerWorldPos();
    this.sun.lookAt(pp.x, this.sun.position.y, pp.z);

    // Antenna blinkers
    if (this.blinkers.length) {
      const on = Math.sin(t * 3) > 0;
      this.blinkers.forEach((b) =>
        (b.material as THREE.MeshBasicMaterial).color.setHex(
          on ? 0xff0040 : 0x330010
        )
      );
    }

    // Player projectiles
    if (inPlay) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.mesh.position.addScaledVector(p.dir, (p.debris ? 6 : 60) * dt);
        if (p.debris) p.dir.y -= dt * 5;
        p.life -= dt;
        if (p.life <= 0) {
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    }

    // Compute player world position once — reused by all systems below
    const playerPos = this.getPlayerWorldPos();

    // Enemy shots
    if (inPlay) {
      for (let i = this.enemyShots.length - 1; i >= 0; i--) {
        const s = this.enemyShots[i];
        s.mesh.position.addScaledVector(s.dir, 20 * dt);
        s.life -= dt;
        if (s.mesh.position.distanceTo(playerPos) < 1.2) {
          this.damagePlayer(8);
          this.scene.remove(s.mesh);
          this.enemyShots.splice(i, 1);
          continue;
        }
        if (s.life <= 0) {
          this.scene.remove(s.mesh);
          this.enemyShots.splice(i, 1);
        }
      }
    }

    // Traffic cars
    if (inPlay) {
      const FOLLOW_DIST = 9;
      this.trafficCars.forEach((tc) => {
        const perpAxis = tc.axis === "x" ? "z" : "x";
        const myLane = tc.group.position[perpAxis];
        const myPos = tc.group.position[tc.axis];
        const span = tc.wrapMax - tc.wrapMin;

        let moveSpeed = tc.baseSpeed;

        // Same-lane following — match actual speed of car ahead (includes stops)
        for (const other of this.trafficCars) {
          if (other === tc) continue;
          if (other.axis !== tc.axis || other.dir !== tc.dir) continue;
          if (Math.abs(other.group.position[perpAxis] - myLane) > 0.5) continue;
          let rawDist = (other.group.position[tc.axis] - myPos) * tc.dir;
          if (rawDist < 0) rawDist += span;
          if (rawDist < FOLLOW_DIST)
            moveSpeed = Math.min(moveSpeed, other.speed);
        }

        // Two-way intersection yield: the car farther from the crossing yields.
        // Skip entirely if this car has already passed the crossing (no conflict ahead).
        for (const other of this.trafficCars) {
          if (other.axis === tc.axis) continue;
          const dx = other.group.position.x - tc.group.position.x;
          const dz = other.group.position.z - tc.group.position.z;
          if (dx * dx + dz * dz >= 16) continue;
          // Crossing x-coord = other.x (for x-car); crossing z-coord = other.z (for z-car)
          const crossCoord = tc.axis === 'x'
            ? other.group.position.x
            : other.group.position.z;
          const myCoord = tc.group.position[tc.axis];
          // If crossing is behind us (already passed), no need to yield
          if ((crossCoord - myCoord) * tc.dir <= 0) continue;
          const myDist    = tc.axis === 'x' ? Math.abs(dx) : Math.abs(dz);
          const otherDist = tc.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
          if (myDist > otherDist) { moveSpeed = 0; break; }
        }

        // Store actual speed so cars behind can read it next frame
        tc.speed = moveSpeed;

        tc.group.position[tc.axis] += moveSpeed * tc.dir * dt;
        if (tc.dir > 0 && tc.group.position[tc.axis] > tc.wrapMax)
          tc.group.position[tc.axis] = tc.wrapMin;
        else if (tc.dir < 0 && tc.group.position[tc.axis] < tc.wrapMin)
          tc.group.position[tc.axis] = tc.wrapMax;

        if (tc.hitCooldown > 0) {
          tc.hitCooldown -= dt;
          return;
        }
        const dx = tc.group.position.x - playerPos.x;
        const dz = tc.group.position.z - playerPos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.8) {
          this.damagePlayer(25);
          this._v3a.set(-dx, 0, -dz).normalize().multiplyScalar(4);
          this.yawObject.position.add(this._v3a);
          tc.hitCooldown = 1.5;
        }
      });
    } // end inPlay — traffic cars

    // Enemies
    if (inPlay) {
      this.enemies.forEach((e) => {
        this._v3a.subVectors(playerPos, e.group.position);
        const dist = this._v3a.length();
        this._v3a.normalize();
        if (dist > 8) e.group.position.addScaledVector(this._v3a, e.speed * dt);
        else if (dist < 5) e.group.position.addScaledVector(this._v3a, -e.speed * dt);
        e.group.position.y = 2 + Math.sin(t * 2 + e.bobOffset) * 0.4;
        e.ring.rotation.z  += dt * 1.8;
        e.ring2.rotation.z += dt * 2.8;
        e.ring2.rotation.x += dt * 0.9;
        e.mesh.rotation.y  += dt * 0.7;
        e.group.lookAt(playerPos);
        e.fireCooldown -= dt;
        if (e.fireCooldown <= 0) {
          if (dist <= ENEMY_SHOOT_RANGE && this.hasLineOfSight(e, playerPos))
            this.enemyShoot(e, playerPos);
          e.fireCooldown = 2.5 + Math.random() * 1.5;
        }
      });

      // Enemy spawning
      this.enemySpawnTimer -= dt;
      if (this.enemySpawnTimer <= 0) {
        this.spawnEnemy();
        this.enemySpawnTimer = 6 + Math.random() * 4;
      }
    } // end inPlay — enemies

    // Ammo regen (+1 per second)
    if (this.ammo < this.ammoMax) {
      this.ammoRegen += dt;
      if (this.ammoRegen >= 1) {
        this.ammoRegen -= 1;
        this.ammo = Math.min(this.ammoMax, this.ammo + 1);
        this.cb.onAmmoChange(this.ammo, this.ammoMax);
      }
    } else {
      this.ammoRegen = 0;
    }

    // Health zones — animate + pickup
    const ZONE_COOLDOWN = 20;
    const pp2 = this.getPlayerWorldPos();
    for (const zone of this.healthZones) {
      zone.plus.rotation.y += dt * 1.2;
      if (zone.cooldown > 0) zone.cooldown -= dt;

      const nowReady = zone.cooldown <= 0;
      if (nowReady !== zone.ready) {
        zone.ready = nowReady;
        const mat = zone.base.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = nowReady ? 0.5 : 0.1;
        mat.opacity           = nowReady ? 0.6 : 0.2;
      }

      if (nowReady && !this.dead && pp2.distanceTo(zone.group.position) < 2 && this.health < 100) {
        this.health = Math.min(100, this.health + 40);
        this.cb.onHealthChange(this.health);
        this.cb.onToast('HEALTH PACK', '+40 HP');
        this.sounds.pickup();
        zone.cooldown = ZONE_COOLDOWN;
        zone.ready = false;
        const mat = zone.base.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.1;
        mat.opacity           = 0.2;
      }
    }

    // Minimap (throttled to ~14fps)
    this.mmTick += dt;
    if (this.mmTick > 0.07) {
      this.mmTick = 0;
      this.drawMinimap(t);
    }

    // Animated billboard scroll (~25 fps)
    this._billboardAccum += dt;
    if (this._billboardAccum > 0.04 && this._billboardCtx && this._billboardTex) {
      this._billboardAccum = 0;
      this._billboardOffset++;
      const ctx  = this._billboardCtx;
      const text = this._billboardLines.join('  ·  ') + '  ·  ';
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = 'rgba(0,0,0,0.88)';
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#00ffd5';
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'left';
      const textW = ctx.measureText(text).width;
      const x = 512 - (this._billboardOffset * 1.5) % (textW + 512);
      ctx.fillText(text, x, 80);
      this._billboardTex.needsUpdate = true;
    }

    // Screen shake — apply local camera offset
    if (this._shakeTime > 0) {
      this._shakeTime -= dt;
      const s = this._shakeAmt * (this._shakeTime / 0.25);
      this.camera.position.set(
        (Math.random() - 0.5) * s,
        (Math.random() - 0.5) * s,
        0
      );
    } else {
      this.camera.position.set(0, 0, 0);
    }

    this.composer.render();
  }
}
