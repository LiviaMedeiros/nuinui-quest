class Game {
    frameCount = 0;

    width = 16 * 20;
    height = 16 * 12;

    fullscreen = document.fullscreenElement ? true : false;
    scale = false;

    audioCtx = null;
    bufferLoader = null;

    bgmId = null;
    soundFrame = {};

    seVolume = .3;
    bgmVolume = .4;

    lastKeys = null;
    cpuKeys = {};

    currentStage = 0;

    score = 0;
    scoreDisplay = 0;

    mode = 'flare';

    isPaused = false;
    timer = 0;

    tick = 60;
    drawBuffer = false;

    saveCount = 3;
    saveData = new SaveData();

    constructor(assets, data) {
        // Assets
        this.assets = assets;
        this.assets.load();

        // parsed game file data
        this.data = data;

        // Controller
        // this.keys = new KeyboardListener().keys;
        this.inputManager = new InputManager();;

        // Display layers
        const container = document.createElement("div");
        document.body.appendChild(container);
        container.id = 'game-container';
        container.style.width = `${this.width}px`;
        container.style.height = `${this.height}px`;
        for (let i = 0; i < 4; i++) {
            this[`canvas${i}`] = document.createElement("canvas");
            container.appendChild(this[`canvas${i}`]);
            this[`canvas${i}`].id = `layer${i}`;
            this[`canvas${i}`].style.zIndex = i;
            this[`canvas${i}`].width = this.width;
            this[`canvas${i}`].height = this.height;
            this[`ctx${i}`] = this[`canvas${i}`].getContext('2d');
            this[`ctx${i}`].imageSmoothingEnabled = false;
        }

        {
            let hideCursor = null;
            container.addEventListener('pointermove', ({ currentTarget: { style } }) => {
              if (hideCursor) clearTimeout(hideCursor);
              else style.cursor = 'auto';
              hideCursor = setTimeout(() => { style.cursor = 'none'; hideCursor = null; }, 2e3);
            });
        }

        this.resize();
        window.addEventListener('resize', this.resize);
        if (!window.__TAURI__) document.onfullscreenchange = () => this.fullscreen = document.fullscreenElement;

        // Audio
        this.audioCtx = assets.audioCtx;

        // Options
        const seOpt = this.saveData.getOpt('se');
        const bgmOpt = this.saveData.getOpt('bgm');
        this.seVolume = seOpt === null ? this.seVolume : Number(seOpt);
        this.bgmVolume = bgmOpt === null ? this.bgmVolume : Number(bgmOpt);

        // DEBUG
        if (DEBUGMODE) {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('stage')) this.currentStage = parseInt(urlParams.get('stage')) - 1;
        }

        // Init stage selection
        this.scene = new Scene(this, this.data.game.stages[this.currentStage]);
    }

    start = () => {
        // Manage pausing game when window out of focus
        document.onvisibilitychange = () => {
            if (document.visibilityState === 'hidden' && !this.isPaused) this.pause();
            else if (this.isPaused && !this.manualPause) this.resume();
        };
        if (document.visibilityState !== 'hidden') this.run();
        else this.isPaused = true;
    }

    pause = () => {
        if (this.audioCtx.state === 'running') this.audioCtx.suspend();
        clearInterval(this.updateInterval);
        this.updateInterval = null;
        this.isPaused = true;
    }

    resume = () => {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        this.isPaused = false;
        this.run();
    }

    run = () => {
        this.animation = requestAnimationFrame(this.draw);
        this.updateInterval = setInterval(() => this.update(), 1000 / this.tick);
    }

    update = () => {
        if (this.drawBuffer) this.drawBuffer = false;
        this.soundFrame = {};
        this.keys = this.inputManager[KEYMODE === 'keyboard' ? 'getKeyboardKeys' : 'getGamepadKeys']();

        if (this.menu) this.menu.update(this);
        else if (this.scene) this.scene.update(this);

        if (this.bgmFadeOut) {
            this.bgm.gainNode.gain.value -= this.bgmVolume / 32;
            if (this.bgm.gainNode.gain.value <= 0.003) {
                this.bgmFadeOut = false;
                this.stopBGM();
            }
        }

        if (this.bgmFadeIn) {
            this.bgm.gainNode.gain.value += this.bgmVolume / 32;
            if (this.bgm.gainNode.gain.value >= this.bgmVolume) {
                this.bgmFadeIn = false;
                this.bgm.gainNode.gain.value = this.bgmVolume;
            }
        }

        this.frameCount++;
    }

    setStage = stageIndex => {
        this.checkpoint = null;
        this.currentStage = stageIndex;
        this.scene = new Scene(this, this.data.game.stages[this.currentStage]);
        this.resetCpuKeys();
        this.stopBGM();
        this.menu = null;
    }

    resetCpuKeys = () => this.cpuKeys = {};

    draw = () => {
        this.animation = requestAnimationFrame(this.draw);

        if(!this.drawBuffer) {
            this.drawBuffer = true;
            
            if (this.menu) this.menu.draw(this);
            else if (this.scene) this.scene.draw(this);
        }
    }

    playSound = id => {
        const sound = this.assets.audioList.find(sound => sound.id === id);
        if (!this.seVolume || !sound.buffer || this.soundFrame[id]) return;
        this.soundFrame[id] = true;
        const source = this.audioCtx.createBufferSource();
        source.buffer = sound.buffer;
        source.loop = false;
        source.loopStart = 0;
        source.loopEnd = source.buffer.duration;
        if (['step', 'pew', 'bow_shoot', 'miko_chant', 'dash', 'slash', 'gun'].includes(id)) source.playbackRate.value = 1 + Math.random() * .2 - .1;
        sound.source = source;
        sound.gainNode = this.audioCtx.createGain();
        source.connect(sound.gainNode);
        sound.gainNode.connect(this.audioCtx.destination);
        sound.gainNode.gain.value = this.seVolume;
        
        if (this.audioCtx.state === "suspended") this.audioCtx.resume().then(() => sound.source.start());
        else sound.source.start();
    }

    playBGM = (id, fadein) => {
        const bgm = this.assets.bgmData.find(bgm => bgm.id === id);
        if (!bgm.buffer) return;
        this.bgm = bgm;
        this.bgmId = id;
        
        const source = this.audioCtx.createBufferSource();
        this.source = source;
        source.buffer = this.bgm.buffer;
        source.loop = true;
        source.loopStart = this.bgm.loopStart;
        source.loopEnd = source.buffer.duration;
        this.bgm.source = source;
        this.bgm.gainNode = this.audioCtx.createGain();
        source.connect(this.bgm.gainNode);
        this.bgm.gainNode.connect(this.audioCtx.destination);

        this.bgm.updateVolume = () => this.bgm.gainNode.gain.value = this.bgmVolume;
        this.bgm.updateVolume();

        if (fadein) {
            this.bgmFadeIn = true;
            this.bgm.gainNode.gain.value = 0;
        }

        if (this.audioCtx.state === "suspended") this.audioCtx.resume().then(() => this.bgm.source.start());
        else this.bgm.source.start();
    }

    stopBGM = fadeout => {
        if (!this.bgm) return;
        if (fadeout) this.bgmFadeOut = true;
        else {
            this.bgm.source.stop();
            this.bgm = null;
        }
    }

    // Resize display canvas
    resize = () => {
        const scaleX = window.innerWidth / this.width;
        const scaleY = window.innerHeight / this.height;
        let scale = Math.max(1, Math.min(scaleX, scaleY));
        if (this.scale) scale = Math.floor(scale);
        document.getElementById('game-container').style.transform = 'scale(' + scale + ')';
    }
}