
export class WerckmeisterMidiPlayer {
    public async init(): Promise<void> {
        await this.load();
        const audioContext = new AudioContext();
        try {
            //audioNode.connect(audioContext.destination)
        } catch (ex) {
            console.log(ex)
        }
    }

    async load() {
        const url = 'https://werckme.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-ogg.js';
        const response = await fetch(url);
        const text = await response.text();
        const script:any = document.createElement('script');
        script.language = 'javascript';
        script.type = 'text/javascript';
        script.text = text;
        document.body.appendChild(script);
    }
}