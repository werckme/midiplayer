import * as JSSynth from 'js-synthbuild';

let _synth = null;

function getSynth() {
    if (!_synth) {
        _synth = new JSSynth.Synthesizer();
        _synth.init(44100); // TODO: don't use static sample rate
    }
    return _synth;
}

function render(soundFontBff, midiBuffer, audioBufferLength) {
    const synth = getSynth();
    synth.loadSFont(soundFontBff).then(() => {
        synth.addSMFDataToPlayer(midiBuffer).then(() => {
            synth.playPlayer().then(()=> {
                const audioBuffer = [
                    new Float32Array(audioBufferLength),
                    new Float32Array(audioBufferLength)
                ];
                synth.render(audioBuffer);
                const bffL = audioBuffer[0].buffer;
                const bffR = audioBuffer[1].buffer;
                self.postMessage({bffL, bffR}, [bffL, bffR]);
                synth.resetPlayer();
            });
        });
    });
}

self.onmessage = function (msg) {
    const {soundFont, midiBuffer, audioBufferLength} = msg.data;
    render(soundFont, midiBuffer, audioBufferLength);
}

