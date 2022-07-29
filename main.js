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
};
window["wg"] = wg;
const version = Date.now();
function initUserEvents() {
    onclick = () => {
        wg.userInput = true;
        initAudio();
    };
    onmousedown = () => {
        wg.userInput = true;
        initAudio();
    };
    onkeydown = (e) => {
        switch (e.key) {
            case "Alt":
            case "Control":
            case "Shift":
            case "CapsLock":
            case "Escape":
            case "ScrollLock":
            case "NumLock":
                return;
        }
        wg.userInput = true;
        initAudio();
    };
    // --- note-buttons ---
    const addNoteButtons = (noteButtons, hq) => {
        for (let i = 0; i < noteButtons.length; i++) {
            const button = noteButtons[i];
            console.log(button);
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
        case "ok: watWasmReady": {
            wg.workletWatReady = true;
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
function updateStat() {
    const msg = txt => {
        const el = document.getElementById("stat");
        if (el && el.innerText !== txt)
            el.innerText = txt;
    };
    if (!wg.userInput)
        return msg("wait for user input...");
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
    msg("run: " + wg.audioContext.currentTime.toFixed(1) + " s - " + wg.workletBlockCount16 + " blocks - " + (wg.workletBlockCount16 * 16 * 128 / 1000000).toFixed(2) + "M samples");
}
window.addEventListener("load", () => {
    setInterval(() => {
        updateStat();
    }, 10);
    initUserEvents();
    initMainGo();
    initWorkletWat();
});
