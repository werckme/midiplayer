let _synth = null;
let _sampleRate = 0;

const RendererIdleTimeMillis = 100;

function getSynth() {
    if (!_synth) {
        _synth = new JSSynth.Synthesizer();
        _synth.init(_sampleRate);
    }
    return _synth;
}

const session = {
    running: false
}

function render(sessionId, soundFontBff, midiBuffer, audioBufferLength, inBlockSize) {
    session.running = true;
    session.sesisonId = sessionId;
    const synth = getSynth();
    synth.loadSFont(soundFontBff).then(() => {
        synth.addSMFDataToPlayer(midiBuffer).then(() => {
            synth.playPlayer().then(()=> {
                let samplesLeft = audioBufferLength;
                function renderBlock() {
                    console.log("renderBlock")
                    if (samplesLeft <= 0 || session.running === false) {
                        synth.resetPlayer();
                        return;
                    }
                    const blockSize = Math.min(inBlockSize, samplesLeft);
                    const audioBuffer = [
                        new Float32Array(blockSize),
                        new Float32Array(blockSize)
                    ];
                    synth.render(audioBuffer);
                    const bffL = audioBuffer[0].buffer;
                    const bffR = audioBuffer[1].buffer;
                    const samplePos = audioBufferLength - samplesLeft;
                    const lastBlock = (samplesLeft - blockSize) <= 0;
                    self.postMessage({bffL, bffR, blockSize, samplePos, lastBlock, sessionId}, [bffL, bffR]);
                    samplesLeft -= blockSize;
                    setTimeout(renderBlock, RendererIdleTimeMillis); // aka. sleep 100
                }
                renderBlock();               
            });
        });
    });
}

self.onmessage = function (msg) {
    if(msg.data.stop) {
        session.running = false;
        return;
    }
    if (session.running) {
        return;
    }
    const {soundFont, midiBuffer, audioBufferLength, blockSize, sampleRate, sessionId} = msg.data;
    _sampleRate = sampleRate;
    render(sessionId, soundFont, midiBuffer, audioBufferLength, blockSize);
}

