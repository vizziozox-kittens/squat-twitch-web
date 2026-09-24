// ============================================================
// ELEMENTOS HTML
// ============================================================

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const counterElement = document.getElementById("counter");
const stateElement = document.getElementById("state");
const statusElement = document.getElementById("status");

const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");

const counterInput = document.getElementById("counterInput");
const setCounterButton = document.getElementById("setCounterButton");

const addModeButton = document.getElementById("addModeButton");
const subtractModeButton = document.getElementById("subtractModeButton");
const modeText = document.getElementById("modeText");

const twitchStatus = document.getElementById("twitchStatus");
const connectTwitchButton = document.getElementById("connectTwitchButton");

const clientIdInput = document.getElementById("clientIdInput");

const rewardsContainer = document.getElementById("rewardsContainer");
const rewardsList = document.getElementById("rewardsList");
const saveRewardsButton = document.getElementById("saveRewardsButton");

const bitsAmountInput = document.getElementById("bitsAmountInput");
const bitsSquatsInput = document.getElementById("bitsSquatsInput");
const saveBitsButton = document.getElementById("saveBitsButton");


// ============================================================
// VARIABLES
// ============================================================

let counter = 0;

let detectorActive = false;
let camera = null;
let socket = null;

// IMPORTANTE:
// "add" = cada sentadilla suma 1
// "subtract" = cada sentadilla resta 1
let detectorMode = "add";


// ============================================================
// CONTADOR
// ============================================================

function updateCounter() {

    counter = Math.max(
        0,
        Math.floor(Number(counter) || 0)
    );

    counterElement.textContent = counter;

    counterInput.value = counter;
}


// ============================================================
// CARGAR CONTADOR
// ============================================================

async function loadCounter() {

    try {

        const response = await fetch("/api/squats");

        if (!response.ok) {
            throw new Error("No se pudo obtener el contador");
        }

        const data = await response.json();

        counter = Number(data.pendingSquats || 0);

        updateCounter();

    } catch (error) {

        console.error(
            "Error cargando contador:",
            error
        );

    }

}


// ============================================================
// CAMBIAR CONTADOR POR UNA SENTADILLA
// ============================================================

async function registerDetectedSquat() {

    try {

        const amount =
            detectorMode === "add"
                ? 1
                : -1;

        const response = await fetch(
            "/api/squats/change",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    amount
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                "No se pudo cambiar el contador"
            );
        }

        const data = await response.json();

        counter = Number(
            data.pendingSquats || 0
        );

        updateCounter();

        return true;

    } catch (error) {

        console.error(
            "Error registrando sentadilla:",
            error
        );

        return false;
    }

}


// ============================================================
// ESTABLECER CONTADOR
// ============================================================

async function setCounter(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return;
    }

    try {

        const response = await fetch(
            "/api/squats/set",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    value: Math.max(
                        0,
                        Math.floor(number)
                    )
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                "No se pudo establecer el contador"
            );
        }

    } catch (error) {

        console.error(
            "Error estableciendo contador:",
            error
        );

    }

}


// ============================================================
// REINICIAR CONTADOR
// ============================================================

async function resetCounter() {

    try {

        await fetch(
            "/api/squats/reset",
            {
                method: "POST"
            }
        );

    } catch (error) {

        console.error(
            "Error reiniciando:",
            error
        );

    }

}


// ============================================================
// MODO SUMAR
// ============================================================

addModeButton.addEventListener(
    "click",
    () => {

        detectorMode = "add";

        addModeButton.classList.add("active");

        subtractModeButton.classList.remove(
            "active"
        );

        modeText.textContent =
            "➕ Cada sentadilla suma 1";

    }
);


// ============================================================
// MODO RESTAR
// ============================================================

subtractModeButton.addEventListener(
    "click",
    () => {

        detectorMode = "subtract";

        subtractModeButton.classList.add(
            "active"
        );

        addModeButton.classList.remove(
            "active"
        );

        modeText.textContent =
            "➖ Cada sentadilla resta 1";

    }
);


// ============================================================
// ESTABLECER VALOR
// ============================================================

setCounterButton.addEventListener(
    "click",
    () => {

        setCounter(
            counterInput.value
        );

    }
);


counterInput.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {

            setCounter(
                counterInput.value
            );

        }

    }
);


// ============================================================
// WEBSOCKET
// ============================================================

function connectWebSocket() {

    if (
        socket &&
        (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        )
    ) {
        return;
    }

    const protocol =
        location.protocol === "https:"
            ? "wss:"
            : "ws:";

    const url =
        `${protocol}//${location.host}/ws`;

    socket = new WebSocket(url);


    socket.addEventListener(
        "open",
        () => {

            console.log(
                "🟢 WebSocket conectado"
            );

        }
    );


    socket.addEventListener(
        "message",
        event => {

            try {

                const message =
                    JSON.parse(event.data);

                if (
                    message.type ===
                    "counter:update"
                ) {

                    counter =
                        Number(
                            message.data
                                ?.pendingSquats || 0
                        );

                    updateCounter();

                }

            } catch (error) {

                console.error(
                    "Error WebSocket:",
                    error
                );

            }

        }
    );


    socket.addEventListener(
        "close",
        () => {

            console.log(
                "🔴 WebSocket desconectado"
            );

            setTimeout(
                connectWebSocket,
                2000
            );

        }
    );

}


// ============================================================
// DETECCIÓN
// ============================================================

const STATE = {

    CALIBRATING:
        "CALIBRATING",

    STANDING:
        "STANDING",

    DESCENDING:
        "DESCENDING",

    BOTTOM:
        "BOTTOM",

    ASCENDING:
        "ASCENDING"

};


let squatState =
    STATE.CALIBRATING;

let standingFrames = 0;
let downFrames = 0;
let bottomFrames = 0;
let upFrames = 0;

let baseline = null;

let smoothedDown = 0;
let previousDown = 0;
let previousTime = 0;

let lastSquatTime = 0;


// ============================================================
// UMBRALES
// ============================================================

// Menor = más rápido
const CALIBRATION_FRAMES = 12;

// Movimiento mínimo hacia abajo
const DOWN_THRESHOLD = 0.045;

// Profundidad mínima
const BOTTOM_THRESHOLD = 0.075;

// Ángulo máximo de rodilla para considerar
// que realmente se agachó
const MIN_KNEE_ANGLE = 130;

// Diferencia mínima entre ambos lados
const MAX_KNEE_ANGLE_DIFFERENCE = 40;

// Tiempo mínimo entre sentadillas
const MIN_TIME_BETWEEN_SQUATS = 500;


// ============================================================
// MATEMÁTICAS
// ============================================================

function point(x, y) {

    return {
        x,
        y
    };

}


function midpoint(a, b) {

    return point(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2
    );

}


function subtract(a, b) {

    return point(
        a.x - b.x,
        a.y - b.y
    );

}


function dot(a, b) {

    return (
        a.x * b.x +
        a.y * b.y
    );

}


function normalize(v) {

    const magnitude =
        Math.hypot(
            v.x,
            v.y
        );

    if (!magnitude) {
        return null;
    }

    return point(
        v.x / magnitude,
        v.y / magnitude
    );

}


function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );

}


function angle2D(
    a,
    b,
    c
) {

    const ab =
        subtract(a, b);

    const cb =
        subtract(c, b);

    const m1 =
        Math.hypot(
            ab.x,
            ab.y
        );

    const m2 =
        Math.hypot(
            cb.x,
            cb.y
        );

    if (!m1 || !m2) {
        return null;
    }

    let cosine =
        dot(ab, cb) /
        (m1 * m2);

    cosine =
        clamp(
            cosine,
            -1,
            1
        );

    return (
        Math.acos(cosine) *
        180 /
        Math.PI
    );

}


function visible(
    landmarks,
    ids,
    minimum = 0.25
) {

    return ids.every(
        id =>
            (
                landmarks[id]?.visibility ?? 0
            ) >= minimum
    );

}


// ============================================================
// DATOS DEL CUERPO
// ============================================================

function getMotionData(landmarks) {

    if (
        !visible(
            landmarks,
            [
                11,
                12,
                23,
                24
            ],
            0.20
        )
    ) {

        return null;
    }


    const shoulders =
        midpoint(
            landmarks[11],
            landmarks[12]
        );


    const hips =
        midpoint(
            landmarks[23],
            landmarks[24]
        );


    const torsoVector =
        subtract(
            hips,
            shoulders
        );


    const torsoSize =
        Math.hypot(
            torsoVector.x,
            torsoVector.y
        );


    if (torsoSize < 0.03) {
        return null;
    }


    const axis =
        normalize(
            torsoVector
        );


    if (!axis) {
        return null;
    }


    let leftKneeAngle = null;
    let rightKneeAngle = null;


    if (
        visible(
            landmarks,
            [
                23,
                25,
                27
            ],
            0.18
        )
    ) {

        leftKneeAngle =
            angle2D(
                landmarks[23],
                landmarks[25],
                landmarks[27]
            );

    }


    if (
        visible(
            landmarks,
            [
                24,
                26,
                28
            ],
            0.18
        )
    ) {

        rightKneeAngle =
            angle2D(
                landmarks[24],
                landmarks[26],
                landmarks[28]
            );

    }


    let kneeAngle = null;

    if (
        leftKneeAngle !== null &&
        rightKneeAngle !== null
    ) {

        kneeAngle =
            (
                leftKneeAngle +
                rightKneeAngle
            ) / 2;

    } else if (
        leftKneeAngle !== null
    ) {

        kneeAngle =
            leftKneeAngle;

    } else if (
        rightKneeAngle !== null
    ) {

        kneeAngle =
            rightKneeAngle;

    }


    return {

        shoulders,
        hips,
        axis,
        torsoSize,

        leftKneeAngle,
        rightKneeAngle,
        kneeAngle

    };

}


// ============================================================
// CALIBRACIÓN
// ============================================================

function calibrateBody(data) {

    if (!baseline) {

        baseline = {

            shoulders: {
                ...data.shoulders
            },

            hips: {
                ...data.hips
            },

            axis: {
                ...data.axis
            },

            torsoSize:
                data.torsoSize

        };

        return;
    }


    const factor = 0.10;


    baseline.shoulders.x +=
        (
            data.shoulders.x -
            baseline.shoulders.x
        ) * factor;


    baseline.shoulders.y +=
        (
            data.shoulders.y -
            baseline.shoulders.y
        ) * factor;


    baseline.hips.x +=
        (
            data.hips.x -
            baseline.hips.x
        ) * factor;


    baseline.hips.y +=
        (
            data.hips.y -
            baseline.hips.y
        ) * factor;


    baseline.torsoSize +=
        (
            data.torsoSize -
            baseline.torsoSize
        ) * factor;


    const newAxis =
        normalize(
            subtract(
                baseline.hips,
                baseline.shoulders
            )
        );


    if (newAxis) {
        baseline.axis = newAxis;
    }

}


// ============================================================
// MOVIMIENTO HACIA ABAJO
// ============================================================

function getDownAmount(data) {

    if (!baseline) {
        return 0;
    }


    const hipDelta =
        subtract(
            data.hips,
            baseline.hips
        );


    const torsoScale =
        Math.max(
            baseline.torsoSize,
            0.001
        );


    const hipDown =
        dot(
            hipDelta,
            baseline.axis
        ) / torsoScale;


    const baseCenter =
        midpoint(
            baseline.shoulders,
            baseline.hips
        );


    const currentCenter =
        midpoint(
            data.shoulders,
            data.hips
        );


    const centerDelta =
        subtract(
            currentCenter,
            baseCenter
        );


    const centerDown =
        dot(
            centerDelta,
            baseline.axis
        ) / torsoScale;


    return (
        hipDown * 0.75 +
        centerDown * 0.25
    );

}


// ============================================================
// REINICIAR DETECTOR
// ============================================================

function resetDetector() {

    squatState =
        STATE.CALIBRATING;

    standingFrames = 0;
    downFrames = 0;
    bottomFrames = 0;
    upFrames = 0;

    baseline = null;

    smoothedDown = 0;
    previousDown = 0;
    previousTime = 0;

}


// ============================================================
// MEDIAPIPE
// ============================================================

const pose =
    new Pose({

        locateFile:
            file =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`

    });


pose.setOptions({

    modelComplexity: 2,

    smoothLandmarks: true,

    enableSegmentation: false,

    smoothSegmentation: false,

    minDetectionConfidence: 0.45,

    minTrackingConfidence: 0.45

});


pose.onResults(
    results => {

        if (!results.poseLandmarks) {

            stateElement.textContent =
                "🧍 No se detecta el cuerpo";

            return;
        }


        canvas.width =
            video.videoWidth;

        canvas.height =
            video.videoHeight;


        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        drawConnectors(
            ctx,
            results.poseLandmarks,
            POSE_CONNECTIONS,
            {
                color: "#9147ff",
                lineWidth: 3
            }
        );


        drawLandmarks(
            ctx,
            results.poseLandmarks,
            {
                color: "#ffffff",
                fillColor: "#9147ff",
                lineWidth: 2,
                radius: 5
            }
        );


        if (detectorActive) {

            detectSquat(
                results.poseLandmarks
            );

        }

    }
);


// ============================================================
// DETECTOR
// ============================================================

function detectSquat(landmarks) {

    const data =
        getMotionData(
            landmarks
        );


    if (!data) {

        stateElement.textContent =
            "🧍 Cuerpo no visible";

        return;
    }


    const now =
        performance.now();


    const rawDown =
        getDownAmount(data);


    // Suavizado más rápido
    smoothedDown =
        smoothedDown * 0.65 +
        rawDown * 0.35;


    const velocity =
        previousTime
            ? (
                smoothedDown -
                previousDown
            ) /
            Math.max(
                (
                    now -
                    previousTime
                ) / 1000,
                0.001
            )
            : 0;


    previousDown =
        smoothedDown;

    previousTime =
        now;


    // ========================================================
    // CALIBRACIÓN
    // ========================================================

    if (
        squatState ===
        STATE.CALIBRATING
    ) {

        calibrateBody(data);

        standingFrames++;


        stateElement.textContent =
            `🧍 Calibrando de pie... ${
                Math.min(
                    100,
                    Math.round(
                        standingFrames /
                        CALIBRATION_FRAMES *
                        100
                    )
                )
            }%`;


        if (
            standingFrames >=
            CALIBRATION_FRAMES
        ) {

            squatState =
                STATE.STANDING;

            smoothedDown = 0;
            previousDown = 0;

            stateElement.textContent =
                "🟢 Listo";

        }

        return;
    }


    // ========================================================
    // ACTUALIZAR BASE CUANDO ESTÁ DE PIE
    // ========================================================

    if (
        squatState ===
        STATE.STANDING &&
        Math.abs(smoothedDown) < 0.025
    ) {

        calibrateBody(data);

    }


    // ========================================================
    // DE PIE → BAJANDO
    // ========================================================

    if (
        squatState ===
        STATE.STANDING
    ) {

        if (
            smoothedDown >
            DOWN_THRESHOLD
        ) {

            downFrames++;


            stateElement.textContent =
                `⬇️ Bajando... ${
                    Math.round(
                        smoothedDown * 100
                    )
                }%`;


            if (
                downFrames >= 2
            ) {

                squatState =
                    STATE.DESCENDING;

                downFrames = 0;

                bottomFrames = 0;

            }

        } else {

            downFrames = 0;

            stateElement.textContent =
                "🧍 Listo";

        }

        return;
    }


    // ========================================================
    // BAJANDO → FONDO
    // ========================================================

    if (
        squatState ===
        STATE.DESCENDING
    ) {

        const validKnees =
            data.kneeAngle !== null &&
            data.kneeAngle <=
                MIN_KNEE_ANGLE;


        const validBothKnees =
            data.leftKneeAngle !== null &&
            data.rightKneeAngle !== null &&
            Math.abs(
                data.leftKneeAngle -
                data.rightKneeAngle
            ) <=
                MAX_KNEE_ANGLE_DIFFERENCE;


        const kneeValid =
            validKnees &&
            (
                !data.leftKneeAngle ||
                !data.rightKneeAngle ||
                validBothKnees
            );


        if (
            smoothedDown >=
                BOTTOM_THRESHOLD &&
            kneeValid
        ) {

            bottomFrames++;


            stateElement.textContent =
                `🧎 Sentadilla detectada · ${
                    Math.round(
                        data.kneeAngle
                    )
                }°`;


            if (
                bottomFrames >= 2
            ) {

                squatState =
                    STATE.BOTTOM;

                bottomFrames = 0;

            }


        } else if (
            smoothedDown <
                DOWN_THRESHOLD * 0.65
        ) {

            squatState =
                STATE.STANDING;

            downFrames = 0;

            stateElement.textContent =
                "↩️ Movimiento incompleto";

        } else {

            stateElement.textContent =
                "🧎 Baja un poco más";

        }

        return;
    }


    // ========================================================
    // FONDO → SUBIENDO
    // ========================================================

    if (
        squatState ===
        STATE.BOTTOM
    ) {

        if (
            velocity < -0.02
        ) {

            upFrames++;


            if (
                upFrames >= 1
            ) {

                squatState =
                    STATE.ASCENDING;

                upFrames = 0;


                // ============================================
                // AQUÍ SE REGISTRA LA SENTADILLA
                // ============================================

                const currentTime =
                    Date.now();


                if (
                    currentTime -
                    lastSquatTime >=
                    MIN_TIME_BETWEEN_SQUATS
                ) {

                    lastSquatTime =
                        currentTime;


                    registerDetectedSquat();


                    if (
                        detectorMode ===
                        "add"
                    ) {

                        stateElement.textContent =
                            "✅ ¡+1 SENTADILLA!";

                    } else {

                        stateElement.textContent =
                            "✅ ¡-1 SENTADILLA!";

                    }

                }

            }

        } else {

            upFrames = 0;

            stateElement.textContent =
                "🧎 Fondo";

        }

        return;
    }


    // ========================================================
    // SUBIENDO → DE PIE
    // ========================================================

    if (
        squatState ===
        STATE.ASCENDING
    ) {

        if (
            smoothedDown <=
            0.035
        ) {

            squatState =
                STATE.STANDING;

            upFrames = 0;
            downFrames = 0;
            bottomFrames = 0;


        } else {

            stateElement.textContent =
                "⬆️ Subiendo...";

        }

    }

}


// ============================================================
// INICIAR CÁMARA
// ============================================================

startButton.addEventListener(
    "click",
    async () => {

        try {

            statusElement.textContent =
                "Solicitando cámara...";


            const stream =
                await navigator.mediaDevices
                    .getUserMedia({

                        video: {
                            width: 1280,
                            height: 720
                        },

                        audio: false

                    });


            video.srcObject =
                stream;


            await video.play();


            detectorActive =
                true;


            resetDetector();


            statusElement.textContent =
                "🟢 Cámara activa";


            stateElement.textContent =
                "🧍 Ponte de pie para calibrar";


            startButton.disabled =
                true;


            pauseButton.disabled =
                false;


            camera =
                new Camera(
                    video,
                    {

                        onFrame:
                            async () =>
                                await pose.send({
                                    image: video
                                }),

                        width: 1280,

                        height: 720

                    }
                );


            camera.start();


        } catch (error) {

            console.error(error);


            statusElement.textContent =
                "❌ Error de cámara";


            stateElement.textContent =
                "No se pudo acceder a la cámara";


            alert(
                "No se pudo acceder a la cámara.\n\n" +
                error.message
            );

        }

    }
);


// ============================================================
// PAUSAR
// ============================================================

pauseButton.addEventListener(
    "click",
    () => {

        detectorActive =
            !detectorActive;


        pauseButton.textContent =
            detectorActive
                ? "⏸ Pausar detector"
                : "▶️ Reanudar detector";


        stateElement.textContent =
            detectorActive
                ? "🟢 Detector activo"
                : "⏸ Detector pausado";

    }
);


// ============================================================
// REINICIAR
// ============================================================

resetButton.addEventListener(
    "click",
    async () => {

        await resetCounter();

        resetDetector();


        if (detectorActive) {

            stateElement.textContent =
                "🧍 Ponte de pie para calibrar";

        }

    }
);


// ============================================================
// CONFIGURACIÓN TWITCH
// ============================================================
// En la versión web las credenciales se configuran en el servidor
// mediante variables de entorno. El Client Secret nunca se expone
// al navegador.

// ============================================================
// CONECTAR TWITCH
// ============================================================

connectTwitchButton.addEventListener(
    "click",
    () => {

        window.location.href =
            "/auth/twitch";

    }
);


// ============================================================
// ESTADO TWITCH
// ============================================================

async function checkTwitchStatus() {

    try {

        const response =
            await fetch(
                "/api/status"
            );


        const data =
            await response.json();


        if (
            data.twitch &&
            data.twitch.connected
        ) {

            twitchStatus.textContent =
                `🟢 Conectado como ${
                    data.twitch.user.display_name
                }`;


            twitchStatus.classList.add(
                "connected"
            );


            connectTwitchButton.textContent =
                "🟢 Twitch conectado";


            await loadTwitchRewards();

            await loadTwitchConfig();

        } else {

            twitchStatus.textContent =
                "🔴 No conectado";


            twitchStatus.classList.remove(
                "connected"
            );


            connectTwitchButton.textContent =
                "🟣 Conectar con Twitch";

        }


    } catch (error) {

        console.error(
            "Error comprobando Twitch:",
            error
        );

    }

}


// ============================================================
// CARGAR CONFIGURACIÓN TWITCH
// ============================================================

async function loadTwitchConfig() {

    try {

        const response =
            await fetch(
                "/api/twitch/config"
            );


        const data =
            await response.json();


        if (data.clientId) {

            clientIdInput.value =
                data.clientId;
            clientIdInput.readOnly = true;

        }


        if (data.bitsPerBlock) {

            bitsAmountInput.value =
                data.bitsPerBlock;

        }


        if (data.squatsPerBlock) {

            bitsSquatsInput.value =
                data.squatsPerBlock;

        }

    } catch (error) {

        console.error(
            "Error cargando configuración:",
            error
        );

    }

}


// ============================================================
// CARGAR RECOMPENSAS DE TWITCH
// ============================================================

async function loadTwitchRewards() {

    try {

        const response =
            await fetch(
                "/api/twitch/rewards"
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "No se pudieron obtener las recompensas."
            );

        }


        rewardsList.innerHTML = "";


        if (
            !data.rewards ||
            data.rewards.length === 0
        ) {

            rewardsList.innerHTML =
                `
                <div class="rewards-description">
                    No tienes recompensas personalizadas creadas.
                </div>
                `;

            rewardsContainer.style.display =
                "block";

            return;
        }


        data.rewards.forEach(
            reward => {

                const savedValue =
                    data.mappings?.[reward.id] ||
                    0;


                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "reward-item";


                item.innerHTML =
                    `
                    <div class="reward-info">

                        <div class="reward-name">
                            ${escapeHtml(
                                reward.title
                            )}
                        </div>

                        <div class="reward-cost">
                            ${reward.cost.toLocaleString()}
                            puntos
                        </div>

                    </div>

                    <input
                        class="reward-value"
                        type="number"
                        min="0"
                        value="${savedValue}"
                        data-reward-id="${reward.id}"
                        placeholder="0"
                    >
                    `;


                rewardsList.appendChild(
                    item
                );

            }
        );


        rewardsContainer.style.display =
            "block";


    } catch (error) {

        console.error(
            "Error cargando recompensas:",
            error
        );

        rewardsContainer.style.display =
            "block";


        rewardsList.innerHTML =
            `
            <div class="rewards-description">
                ⚠️ ${escapeHtml(
                    error.message
                )}
            </div>
            `;

    }

}


// ============================================================
// GUARDAR VALORES DE RECOMPENSAS
// ============================================================

saveRewardsButton.addEventListener(
    "click",
    async () => {

        const inputs =
            document.querySelectorAll(
                ".reward-value"
            );


        const mappings = [];


        inputs.forEach(
            input => {

                const rewardId =
                    input.dataset.rewardId;


                const squats =
                    Math.max(
                        0,
                        Math.floor(
                            Number(
                                input.value
                            ) || 0
                        )
                    );


                mappings.push({

                    rewardId,

                    squats

                });

            }
        );


        try {

            const response =
                await fetch(
                    "/api/twitch/reward-mappings",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            mappings
                        })
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "No se pudieron guardar."
                );

            }


            alert(
                "✅ Valores de recompensas guardados."
            );


        } catch (error) {

            alert(
                "❌ " +
                error.message
            );

        }

    }
);


// ============================================================
// GUARDAR BITS
// ============================================================

saveBitsButton.addEventListener(
    "click",
    async () => {

        const bitsPerBlock =
            Math.max(
                1,
                Math.floor(
                    Number(
                        bitsAmountInput.value
                    ) || 1
                )
            );


        const squatsPerBlock =
            Math.max(
                1,
                Math.floor(
                    Number(
                        bitsSquatsInput.value
                    ) || 1
                )
            );


        try {

            const response =
                await fetch(
                    "/api/twitch/bits-config",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({

                            bitsPerBlock,

                            squatsPerBlock

                        })
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "No se pudo guardar."
                );

            }


            alert(
                "✅ Configuración de Bits guardada."
            );


        } catch (error) {

            alert(
                "❌ " +
                error.message
            );

        }

    }
);


// ============================================================
// ESCAPAR HTML
// ============================================================

function escapeHtml(value) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


// ============================================================
// INICIALIZACIÓN
// ============================================================

connectWebSocket();

loadCounter();

checkTwitchStatus();

setInterval(
    checkTwitchStatus,
    5000
);

updateCounter();