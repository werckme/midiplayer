
export class WerckmeisterMidiPlayer {
    public async init(): Promise<void> {
        const audioContext = new AudioContext();
        try {
            await audioContext.audioWorklet.addModule('WerckmeisterMidiPlayerAudioProcessor.js')
            const audioNode = new AudioWorkletNode(audioContext, 'werckmeister-midi-player-audio-processor');
            audioNode.connect(audioContext.destination)
        } catch (ex) {
            console.log(ex)
        }
    }
}