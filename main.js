const wg = {
    userInput: false,
    mainGoInit: false,
    mainGoError: "",
    mainGoReady: false,
    audioInit: false,
    audioError: "",
    audioContext: null,
    workletInit: false,
    workletError: "",
    workletNode: null,
    workletLoaded: false,
    workletStarted: false,
    workletBlockCount16: 0,
    workletReady: false,
    workletMessageTodo: [],
    workletWatInit: false,
    workletWatError: "",
    workletWatWasm: null,
    workletWatReady: false,
    workletWatVersion: 0,
};
window["wg"] = wg;
const version = Date.now();
const keyTones = {
    Backquote: 46,
    Tab: 47,
    KeyQ: 48,
    Digit2: 49,
    KeyW: 50,
    Digit3: 51,
    KeyE: 52,
    KeyR: 53,
    Digit5: 54,
    KeyT: 55,
    Digit6: 56,
    KeyY: 57,
    Digit7: 58,
    KeyU: 59,
    KeyI: 60,
    Digit9: 61,
    KeyO: 62,
    Digit0: 63,
    KeyP: 64,
    BracketLeft: 65,
    Equal: 66,
    BracketRight: 67,
    Backspace: 68,
    Enter: 69,
    ShiftLeft: 33,
    CapsLock: 34,
    IntlBackslash: 35,
    KeyZ: 36,
    KeyS: 37,
    KeyX: 38,
    KeyD: 39,
    KeyC: 40,
    KeyV: 41,
    KeyG: 42,
    KeyB: 43,
    KeyH: 44,
    KeyN: 45,
    KeyJ: 46,
    KeyM: 47,
    Comma: 48,
    KeyL: 49,
    Period: 50,
    Semicolon: 51,
    Slash: 52,
    ShiftRight: 53,
    Backslash: 54,
};
let baseOctave = 1;
function initUserEvents() {
    onclick = () => {
        wg.userInput = true;
        initAudio();
    };
    onmousedown = () => {
        wg.userInput = true;
        initAudio();
    };
    onkeydown = e => {
        switch (e.key) { // special keys = no user input
            case "Alt":
            case "Control":
            case "Shift":
            case "CapsLock":
            case "Escape":
            case "ScrollLock":
            case "NumLock": {
                break;
            }
            default: {
                wg.userInput = true;
                initAudio();
                break;
            }
        }
        document.title = "key: " + e.code;
        if (keyTones[e.code]) {
            toneStart(keyTones[e.code] + baseOctave * 12, true);
            e.preventDefault();
        }
        if (e.code === "PageUp") {
            baseOctave++;
            if (baseOctave > 4)
                baseOctave = 4;
            toneKill();
            e.preventDefault();
        }
        if (e.code === "PageDown") {
            baseOctave--;
            if (baseOctave < -2)
                baseOctave = -2;
            toneKill();
            e.preventDefault();
        }
    };
    onkeyup = e => {
        if (keyTones[e.code]) {
            toneEnd(keyTones[e.code] + baseOctave * 12);
            e.preventDefault();
        }
    };
    // --- note-buttons ---
    const addNoteButtons = (noteButtons, hq) => {
        for (let i = 0; i < noteButtons.length; i++) {
            const button = noteButtons[i];
            const code = parseInt(button.dataset.midicode);
            if (code) {
                let active = false;
                const start = () => {
                    if (active)
                        return;
                    toneStart(code, hq);
                    active = true;
                };
                const end = () => {
                    if (!active)
                        return;
                    toneEnd(code);
                    active = false;
                };
                button.addEventListener("mousedown", start);
                button.addEventListener("mouseenter", (ev) => {
                    if (ev.buttons === 1)
                        start();
                });
                button.addEventListener("touchstart", start);
                button.addEventListener("mouseup", end);
                button.addEventListener("mouseout", end);
                button.addEventListener("dragend", end);
                button.addEventListener("touchend", end);
            }
        }
    };
    addNoteButtons(document.getElementsByClassName("note_button"), false);
    addNoteButtons(document.getElementsByClassName("note_buttonh"), true);
}
function initMainGo() {
    try {
        if (typeof Go !== "function") {
            wg.mainGoError = "Go-Handler not found: maybe fail wasm_exec.js?";
            return;
        }
        const go = new Go();
        const loadWasm = "main.wasm?" + version;
        wg.mainGoInit = true;
        WebAssembly.instantiateStreaming(fetch(loadWasm), go.importObject).then(r => {
            go.run(r.instance).catch(r => {
                wg.mainGoError = loadWasm + " - " + r.toString();
            });
        }).catch(r => {
            wg.mainGoError = loadWasm + " - " + r.toString();
        });
    }
    catch (e) {
        wg.mainGoError = e.toString();
    }
}
function initAudio() {
    if (wg.audioInit)
        return;
    if (!wg.userInput)
        return;
    wg.audioInit = true;
    try {
        if (wg.audioContext == null) {
            wg.audioContext = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
            const interval = setInterval(() => {
                if (wg.audioContext.state === "running") {
                    clearInterval(interval);
                    if (!wg.audioInit) {
                        wg.userInput = true;
                        initAudio();
                    }
                }
            }, 10);
        }
        else {
            wg.audioContext.resume().then();
        }
    }
    catch (e) {
        wg.audioError = e.toString();
        return;
    }
    if (wg.audioContext.state === "suspended") {
        console.log("no user gesture");
        wg.audioInit = false;
        wg.userInput = false;
        return;
    }
    wg.workletInit = true;
    const workletUrl = "worklet.js?" + version;
    wg.audioContext.audioWorklet.addModule(workletUrl).then(r => {
        wg.workletNode = new AudioWorkletNode(wg.audioContext, "worklet", { outputChannelCount: [2] });
        wg.workletNode.port.onmessage = workletReceiveMessage;
        wg.workletNode.connect(wg.audioContext.destination);
        wg.workletLoaded = true;
    }).catch(r => {
        wg.workletError = workletUrl + " - " + r.toString();
    });
}
function initWorkletWat() {
    wg.workletWatInit = true;
    const loadWasm = "worklet.wasm?" + version;
    fetch(loadWasm).then(r => r.arrayBuffer().then(buffer => {
        if (r.status !== 200) {
            wg.workletWatError = loadWasm + " - " + r.statusText;
        }
        wg.workletWatWasm = new Uint8Array(buffer);
        workletSendMessage({ t: "watWasm", val: wg.workletWatWasm });
    }).catch(r => {
        wg.workletWatError = loadWasm + " - " + r.toString();
    }));
}
function workletSendMessage(msg) {
    if (!wg.workletReady) {
        if (msg != null)
            wg.workletMessageTodo.push(msg);
        return;
    }
    if (wg.workletMessageTodo.length > 0) {
        for (let i = 0; i < wg.workletMessageTodo.length; i++) {
            wg.workletNode.port.postMessage(wg.workletMessageTodo[i]);
        }
        wg.workletMessageTodo = [];
    }
    if (msg != null)
        wg.workletNode.port.postMessage(msg);
}
function workletReceiveMessage(msg) {
    switch (msg.data) {
        case "ok: start": {
            wg.workletStarted = true;
            break;
        }
        case "ok: block16": {
            wg.workletBlockCount16++;
            wg.workletReady = true;
            workletSendMessage(null);
            break;
        }
        default: {
            if (msg.data.indexOf("ok: watWasmReady ") === 0) {
                wg.workletWatReady = true;
                wg.workletWatVersion = msg.data.substr(17);
                break;
            }
            console.log("unknown message: \"" + msg.data + "\"");
            break;
        }
    }
}
function toneStart(midiCode, hq) {
    workletSendMessage({ t: "toneStart", val: midiCode, hq: hq });
}
function toneEnd(midiCode) {
    workletSendMessage({ t: "toneEnd", val: midiCode });
}
function toneKill() {
    workletSendMessage({ t: "toneKill" });
}
function updateStat() {
    const msg = txt => {
        const el = document.getElementById("stat");
        if (el && el.innerText !== txt)
            el.innerText = txt;
    };
    if (!wg.userInput)
        return msg("wait for first user input...");
    if (!wg.mainGoInit)
        return msg("initMainGo() not started");
    if (wg.mainGoError)
        return msg("mainGoError: " + wg.mainGoError);
    if (!wg.mainGoReady)
        return msg("mainGo: not ready");
    if (!wg.audioInit)
        return msg("initAudio() not started");
    if (wg.audioError)
        return msg("audioError: " + wg.audioError);
    if (wg.audioContext === null)
        return msg("audioContext == null");
    if (!wg.workletInit)
        return msg("workletInit not reached");
    if (wg.workletError)
        return msg("workletError: " + wg.workletError);
    if (wg.workletNode === null)
        return msg("workletNode == null");
    if (!wg.workletLoaded)
        return msg("load worklet module...");
    if (!wg.workletStarted)
        return msg("worklet not started");
    if (!wg.workletReady)
        return msg("worklet not ready");
    if (!wg.workletWatInit)
        return msg("initWorkletWat() not started");
    if (wg.workletWatError)
        return msg("workletWatError: " + wg.workletWatError);
    if (wg.workletWatWasm === null)
        return msg("load worklet.wasm...");
    if (!wg.workletWatReady)
        return msg("worklet.wasm not ready");
    msg("run: " + wg.audioContext.currentTime.toFixed(1) + " s - " + (wg.workletBlockCount16 * 16) + " blocks - " + (wg.workletBlockCount16 * 16 * 128 / 1000000).toFixed(2) + "M samples (wat version: " + (wg.workletWatVersion / 10000).toFixed(4) + ")");
    const el = document.getElementById("octave");
    if (el)
        el.innerText = baseOctave.toString();
}
window.addEventListener("load", () => {
    setInterval(() => {
        updateStat();
    }, 10);
    initUserEvents();
    initMainGo();
    initWorkletWat();
});
