class Game {
    frameCount = 0;

    width = 16 * 20 * (NUIPARAMS.wm ?? 1);
    height = 16 * 12 * (NUIPARAMS.hm ?? 1);

    audioCtx = null;
    bufferLoader = null;

    bgmId = null;
    soundFrame = {};

    lastKeys = null;
    cpuKeys = new Object;

    currentStage = 0;

    score = 0;
    scoreDisplay = 0;

    noelMode = !!(NUIPARAMS.noelmode ?? false);

    isPaused = false;
    manualPause = false;
    timer = 0;

    tick = 60;
    fpsSkipMode = false;
    drawBuffer = false;

    constructor(assets, data) {
        // Assets
        this.assets = assets;

        // parsed game file data
        this.data = data;

        // Controller
        // this.keys = new KeyboardListener().keys;
        this.inputManager = INPUTMANAGER;

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

        this.resize();
        window.addEventListener('resize', this.resize);

        if (!document.hasFocus()) {
            document.getElementById('focus-warning').style.display = 'flex';
            document.getElementById('game-container').style.boxShadow = '0 0 2px 1px #08f';
        }

        if (!SAVEOK) {
            document.getElementById('game-container').textContent = 'The saving system is incompatible with your navigator, please enable cookies/localstorage';
        }

        document.getElementById('pause-icon').onclick = () => this.togglePause();

        document.getElementById('fps-checkbox').onclick = () => {
            this.fpsSkipMode = !this.fpsSkipMode;
            console.log('fps skip mode:', this.fpsSkipMode);
        }

        // Audio
        this.audioCtx = assets.audioCtx;

        // DEBUG
        // const urlParams = new URLSearchParams(window.location.search);
        // if (urlParams.has('stage')) this.currentStage = parseInt(urlParams.get('stage')) - 1;

        // Init stage selection
        this.scene = new Scene(this, this.data.game.stages[this.currentStage]);

        if (!localStorage.getItem('nuinui-save-item-fire')) localStorage.setItem('nuinui-save-item-fire', true);
        this.updateItems();
        this.updateAchievements();
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

    togglePause = () => {
        this.manualPause = !this.manualPause;
        if (this.isPaused) this.resume();
        else this.pause();
    }

    pause = () => {
        console.log('game paused');
        if (this.audioCtx.state === 'running') this.audioCtx.suspend();
        clearInterval(this.updateInterval);
        this.updateInterval = null;
        this.isPaused = true;
        document.getElementById('pause-icon').firstChild.src = "./img/icon_resume.png";
    }

    resume = () => {
        console.log('resumed');
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        this.isPaused = false;
        document.getElementById('pause-icon').firstChild.src = "./img/icon_pause.png";
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
        this.scene.update(this);
        if (this.bgmFadeOut) {
            this.bgm.gainNode.gain.value -= BGMVOLUME / 32;
            if (this.bgm.gainNode.gain.value <= 0.003) {
                this.bgmFadeOut = false;
                this.stopBGM();
            }
        }
        this.frameCount++;
    }

    updateItems = () => {
        ['bow', 'gun', 'clock', 'jump', 'fire', 'rocket', 'petal', 'sword', 'shield', 'dual'].forEach((item, i) => {
            if (localStorage.getItem(`nuinui-save-item-${item}`)) {
                const elem = document.getElementById(`save-item-${i+1}`);
                elem.classList.add("unlocked");
                if (['bow', 'gun'].includes(item)) {
                    elem.onclick = e => {
                        const flare = this.scene.actors.find(actor => actor instanceof Flare);
                        Array.from(document.getElementsByClassName('item-selected')).forEach(a => a.classList.remove('item-selected'));
                        elem.classList.add('item-selected');
                        flare.weapon = item;
                        if (item === 'bow') {
                            flare.maxHealth = 1;
                            flare.health = 1;
                        } else {
                            flare.maxHealth = 16;
                        }
                        if (NUIPARAMS.maxhealth) {
                          flare.health = flare.maxHealth = NUIPARAMS.maxhealth;
                        }
                        this.playSound('wakeup');
                    }
                }
            }
        });
    }

    updateAchievements = () => {
        if (Object.entries(localStorage).filter(a => a[0].search("nuinui-save-achievement-") !== -1 && a[1]).length === 20) localStorage.setItem('nuinui-save-item-bow', true);
        Array.from(document.getElementsByClassName('save-achievement')).forEach((elem, i) => {
            if (localStorage.getItem(`nuinui-save-achievement-${i+1}`)) elem.classList.add('unlocked');
        });
    }

    resetCanvas = () => {
        for (let i = 0; i < 4; i++) {
            this[`ctx${i}`].clearRect(0, 0, this.width, this.height);
            this[`canvas${i}`].style.filter = 'none';
        }
    }

    draw = () => {
        this.animation = requestAnimationFrame(this.draw);
        if(!this.drawBuffer && (!this.fpsSkipMode || this.scene.frameCount % 2)) {
            this.drawBuffer = true;
            this.scene.draw(this);
        }
    }

    playSound = id => {
        const sound = this.assets.audioList.find(sound => sound.id === id);
        if (SEMUTED || !sound.buffer || this.soundFrame[id]) return;
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
        sound.gainNode.gain.value = SEMUTED ? 0 : SEVOLUME;
        
        if (this.audioCtx.state === "suspended") this.audioCtx.resume().then(() => sound.source.start());
        else sound.source.start();
    }

    playBGM = id => {
        const bgm = this.assets.bgmData.find(bgm => bgm.id === id);
        if (!bgm.buffer) return;
        this.bgm = bgm;
        const source = this.audioCtx.createBufferSource();
        source.buffer = this.bgm.buffer;
        source.loop = true;
        source.loopStart = this.bgm.loopStart;
        source.loopEnd = source.buffer.duration;
        this.bgm.source = source;
        this.bgm.gainNode = this.audioCtx.createGain();
        source.connect(this.bgm.gainNode);
        this.bgm.gainNode.connect(this.audioCtx.destination);

        this.bgm.updateVolume = () => this.bgm.gainNode.gain.value = BGMMUTED ? 0 : BGMVOLUME;
        this.bgm.updateVolume();

        document.getElementById("bgm-volume").onchange = e => {
            BGMVOLUME = e.target.value;
            this.bgm.updateVolume();
        }
        document.getElementById("bgm-volume-icon").onclick = e => {
            BGMMUTED = !BGMMUTED;
            document.getElementById("bgm-volume-icon").firstElementChild.src = `./img/${BGMMUTED ? 'icon_volume_off' : 'icon_volume_on'}.png`;
            this.bgm.updateVolume();
        }

        if (this.audioCtx.state === "suspended") this.audioCtx.resume().then(() => this.bgm.source.start());
        else this.bgm.source.start();
    }

    stopBGM = fadeout => {
        if (!this.bgm) return;
        if (fadeout) {
            this.bgmFadeOut = true;
        } else {
            this.bgm.source.stop();
            this.bgm = null;
            
            document.getElementById("bgm-volume").onchange = e => {
                BGMVOLUME = e.target.value;
            }
            document.getElementById("bgm-volume-icon").onclick = e => {
                BGMMUTED = !BGMMUTED;
                document.getElementById("bgm-volume-icon").firstElementChild.src = `./img/${BGMMUTED ? 'icon_volume_off' : 'icon_volume_on'}.png`;
            }
        }
    }

    // Resize display canvas
    resize = () => {
        const scaleX = window.innerWidth / this.width;
        const scaleY = window.innerHeight / this.height;
        const scaleToFit = Math.floor(Math.max(1, Math.min(scaleX, scaleY)));
        // const scaleToFit = Math.max(1, Math.min(scaleX, scaleY));
        document.getElementById('game-container').style.transform = 'scale(' + (SCREENDISPLAY ? SCREENDISPLAY : scaleToFit) + ')';
    }
}
