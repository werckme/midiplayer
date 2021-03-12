let _synth = null;
let _sampleRate = 0;

function getSynth() {
    if (!_synth) {
        _synth = new JSSynth.Synthesizer();
        _synth.init(_sampleRate);
    }
    return _synth;
}

function render(soundFontBff, midiBuffer, audioBufferLength, inBlockSize) {
    const synth = getSynth();
    synth.loadSFont(soundFontBff).then(() => {
        synth.addSMFDataToPlayer(midiBuffer).then(() => {
            synth.playPlayer().then(()=> {
                let samplesLeft = audioBufferLength;
                while(samplesLeft > 0) {
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
                    self.postMessage({bffL, bffR, blockSize, samplePos, lastBlock}, [bffL, bffR]);
                    samplesLeft -= blockSize;
                }
                synth.resetPlayer();
            });
        });
    });
}

self.onmessage = function (msg) {
    const {soundFont, midiBuffer, audioBufferLength, blockSize, sampleRate} = msg.data;
    _sampleRate = sampleRate;
    render(soundFont, midiBuffer, audioBufferLength, blockSize);
}

