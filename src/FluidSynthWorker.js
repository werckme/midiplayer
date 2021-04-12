const RendererIdleTimeMillis = 100;

function getSynth() {
    const _synth = new JSSynth.Synthesizer();
    _synth.init(_sampleRate);
    return _synth;
}

const State = {
    stopped: 0,
    playing: 1,
    stopping: 2
}

const session = {
    state: State.stopped
}

function render(sessionId, soundFontBff, midiBuffer, audioBufferLength, inBlockSize, gain) {
    session.state = State.playing;
    session.sesisonId = sessionId;
    const synth = getSynth();
    if (!!gain) {
        synth.setGain(gain);
    }
    synth.loadSFont(soundFontBff).then(() => {
        synth.addSMFDataToPlayer(midiBuffer).then(() => {
            synth.playPlayer().then(()=> {
                let samplesLeft = audioBufferLength;
                function renderBlock() {
                    if (samplesLeft <= 0 || session.state !== State.playing) {
                        session.state = State.stopped;
                        self.postMessage({sessionId, done: true});
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
                    setTimeout(renderBlock, RendererIdleTimeMillis); // aka. sleep
                }
                renderBlock();               
            });
        });
    });
}

self.onmessage = function (msg) {
    if(msg.data.stop && session.state === State.playing) {
        session.state = State.stopping;
        return;
    }
    if (session.state !== State.stopped) {
        return;
    }
    const {soundFont, midiBuffer, audioBufferLength, blockSize, sampleRate, sessionId, gain} = msg.data;
    _sampleRate = sampleRate;
    render(sessionId, soundFont, midiBuffer, audioBufferLength, blockSize, gain);
}

