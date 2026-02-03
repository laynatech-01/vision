const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const btnDescribir = document.getElementById('btnDescribir');
const btnNoDescribir = document.getElementById('btnNoDescribir');
const inputText = document.getElementById('inputText');
const statusElem = document.getElementById('status');

let model, streaming = false, localStream = null;
let objetosYaAnunciados = new Set();
let modoDescripcion = true; 

let manosOcupadas = false;
let ultimoMomentoConObjeto = 0;
const TIEMPO_ESPERA_RESTABLECER = 10000; 
const FOCAL_LENGTH = 600;
let cantidadPersonasPrevia = -1; 
let conteoEstablecido = 0;
let tiempoInicioEstabilidad = 0;

const ALTURAS_REALES = { "person": 1.7, "chair": 0.9, "cell phone": 0.15, "bottle": 0.25, "knife": 0.20 };

const TRADUCCIONES = {
    "person": "persona", "bicycle": "bicicleta", "car": "carro", "motorcycle": "moto",
    "airplane": "avión", "bus": "bus", "train": "tren", "truck": "camión", "boat": "barco",
    "traffic light": "semáforo", "fire hydrant": "hidrante", "stop sign": "señal de pare",
    "parking meter": "parquímetro", "bench": "banca", "bird": "pájaro", "cat": "gato",
    "dog": "perro", "horse": "caballo", "sheep": "oveja", "cow": "vaca", "elephant": "elefante",
    "bear": "oso", "zebra": "cebra", "giraffe": "jirafa", "backpack": "mochila",
    "umbrella": "paraguas", "handbag": "bolso", "tie": "corbata", "suitcase": "maleta",
    "frisbee": "frisbee", "skis": "esquís", "snowboard": "snowboard", "sports ball": "pelota",
    "kite": "cometa", "baseball bat": "bate de béisbol", "baseball glove": "guante de béisbol",
    "skateboard": "patineta", "surfboard": "tabla de surf", "tennis racket": "raqueta de tenis",
    "bottle": "botella", "wine glass": "copa de vino", "cup": "taza", "fork": "tenedor",
    "knife": "cuchillo", "spoon": "cuchara", "bowl": "tazón", "banana": "plátano",
    "apple": "manzana", "sandwich": "sándwich", "orange": "naranja", "broccoli": "brócoli",
    "carrot": "zanahoria", "hot dog": "hot dog", "pizza": "pizza", "donut": "dona",
    "cake": "pastel", "chair": "silla", "couch": "sofá", "potted plant": "planta",
    "bed": "cama", "dining table": "mesa", "toilet": "inodoro", "tv": "televisión",
    "laptop": "computadora", "mouse": "mouse", "remote": "control remoto", "keyboard": "teclado",
    "cell phone": "celular", "microwave": "microondas", "oven": "horno", "toaster": "tostadora",
    "sink": "lavabo", "refrigerator": "refrigerador", "book": "libro", "clock": "reloj",
    "vase": "florero", "scissors": "tijeras", "teddy bear": "oso de peluche",
    "hair drier": "secador de pelo", "toothbrush": "cepillo de dientes"
};

function hablar(texto, urgente = false) {
    if (!modoDescripcion && !urgente) return;
    if (urgente) window.speechSynthesis.cancel();
    inputText.value = texto; 
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.rate = urgente ? 1.3 : 1.1;
    window.speechSynthesis.speak(msg);
}

function obtenerObjetoEnMano(persona, todasPreds) {
    const [px, py, pw, ph] = persona.bbox;
    const zX = px - (pw * 0.2), zY = py + (ph * 0.2);
    const zW = pw * 1.4, zH = ph * 0.7;

    return todasPreds.find(obj => {
        if (obj.class === "person" || obj.score < 0.3) return false;
        const [ox, oy, ow, oh] = obj.bbox;
        const cX = ox + ow / 2, cY = oy + oh / 2;
        return (cX > zX && cX < (zX + zW) && cY > zY && cY < (zY + zH));
    });
}

async function predict() {
    if (!streaming) return;
    try {
        const preds = await model.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ahora = Date.now();
        
        let conteoFrameActual = 0; 
        let masCercanoDist = 999;
        let amenazaDetectadaEnEsteFrame = false;

        preds.forEach(p => {
            if (p.score > 0.5 && p.class === "person") {
                conteoFrameActual++;
                const [x, y, w, h] = p.bbox;
                const dist = parseFloat(((1.7 * FOCAL_LENGTH) / h).toFixed(1));
                if (dist < masCercanoDist) masCercanoDist = dist;

                ctx.strokeStyle = "#00ff00";
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = "#00ff00";
                ctx.fillText(`${dist}m`, x, y - 5);

                const objetoMano = obtenerObjetoEnMano(p, preds);
                if (objetoMano) {
                    amenazaDetectadaEnEsteFrame = true;
                    manosOcupadas = true;
                    ultimoMomentoConObjeto = ahora;
                    ctx.strokeStyle = "#ffff00";
                    ctx.lineWidth = 6;
                    ctx.strokeRect(...objetoMano.bbox);

                    if (!objetosYaAnunciados.has("ALERTA_MANOS")) {
                        hablar("se detecta objeto en las manos", true);
                        objetosYaAnunciados.add("ALERTA_MANOS");
                    }
                }
            }
        });

        if (conteoFrameActual !== cantidadPersonasPrevia) {
            if (conteoFrameActual !== conteoEstablecido) {
                conteoEstablecido = conteoFrameActual;
                tiempoInicioEstabilidad = ahora;
            } else if (ahora - tiempoInicioEstabilidad > 2000) {
                let mensaje = "";
                if (conteoFrameActual === 0) mensaje = "Ya no detecto personas";
                else if (conteoFrameActual === 1) mensaje = `Una persona detectada a ${masCercanoDist} metros`;
                else mensaje = `${conteoFrameActual} personas. La más cercana a ${masCercanoDist} metros`;
                
                hablar(mensaje);
                cantidadPersonasPrevia = conteoFrameActual;
            }
        }

        ctx.fillStyle = "#00ff00";
        ctx.font = "bold 20px Segoe UI";
        ctx.fillText(`PERSONAS: ${conteoFrameActual}`, 10, 30);

        if (!amenazaDetectadaEnEsteFrame && manosOcupadas && (ahora - ultimoMomentoConObjeto > TIEMPO_ESPERA_RESTABLECER)) {
            manosOcupadas = false;
            objetosYaAnunciados.delete("ALERTA_MANOS");
        }

        if (!manosOcupadas) {
            preds.forEach(p => {
                if (p.score > 0.5 && p.class !== "person") {
                    if (!objetosYaAnunciados.has(p.class)) {
                        const d = ((ALTURAS_REALES[p.class] || 0.5) * FOCAL_LENGTH / p.bbox[3]).toFixed(1);
                        hablar(`${TRADUCCIONES[p.class] || p.class} a ${d} metros`);
                        objetosYaAnunciados.add(p.class);
                        setTimeout(() => objetosYaAnunciados.delete(p.class), 15000);
                    }
                    ctx.strokeStyle = "#00ff00";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(...p.bbox);
                }
            });
        }
    } catch (e) { console.error(e); }
    requestAnimationFrame(predict);
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const recognition = new Recognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.onresult = (e) => {
        const cmd = e.results[e.results.length - 1][0].transcript.toLowerCase();
        if (cmd.includes("activar sistema")) iniciarSistema();
        if (cmd.includes("desactivar sistema")) detenerSistema();
        if (cmd.includes("activar describir")) activarDescripcion();
        if (cmd.includes("desactivar describir")) desactivarDescripcion();
    };
    recognition.start();
}

async function iniciarSistema() {
    const pin = prompt("LaynaTech Visión 1.0 - Ingrese PIN:");
    if (pin === "9632") {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream;
        video.play();
        streaming = true;
        startButton.disabled = true; stopButton.disabled = false;
        hablar("Hola, soy el sistema de vision por computadora creado por LaynaTech, pensado como una herramienta de apoyo visual para personas ciegas, esta herramienta no permite realizar actividades que representen un riesgo para el usuario, requiere siempre asistencia humana, esta herramienta es responsabilidad de quien la usa, la empresa se deslinda de cualquier responsabilidad, consultar terminos legales.", true);
        video.onloadedmetadata = () => { canvas.width = video.videoWidth; canvas.height = video.videoHeight; predict(); };
    } else {
        alert("PIN incorrecto");
    }
}

function detenerSistema() {
    streaming = false;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    startButton.disabled = false; stopButton.disabled = true;
    hablar("Visión Apagada", true);
}

function activarDescripcion() { modoDescripcion = true; hablar("Descripción activa"); }
function desactivarDescripcion() { hablar("Descripción desactivada"); setTimeout(() => modoDescripcion = false, 1000); }

startButton.onclick = iniciarSistema;
stopButton.onclick = detenerSistema;
btnDescribir.onclick = activarDescripcion;
btnNoDescribir.onclick = desactivarDescripcion;

(async () => {
    try {
        statusElem.textContent = "INICIALIZANDO LAYNATECH VISION 1.0...";
        model = await cocoSsd.load();
        statusElem.textContent = "SISTEMA LISTO";
        startButton.disabled = false;
    } catch (e) { statusElem.textContent = "ERROR MOTOR"; }
})();