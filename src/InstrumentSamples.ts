const samplesBaseUrl = 'https://werckme.github.io/midi-js-soundfonts/FluidR3_GM';
import { Base64Binary } from "./Base64binary";

let GlobalMIDIExists = false;
declare const MIDI; // loaded soundfonts are stored here

export class InstrumentSamples {
    sampleCache = new Map<string, AudioBuffer>();

    constructor(private instrumentName: string, private audioContext: AudioContext) {

    }

    public async load() {
        if (!GlobalMIDIExists || !MIDI.Soundfont[this.instrumentName]) {
            const url = `${samplesBaseUrl}/${this.instrumentName}-ogg.js`;
            const response = await fetch(url);
            const text = await response.text();
            const script:any = document.createElement('script');
            script.language = 'javascript';
            script.type = 'text/javascript';
            script.text = text;
            document.body.appendChild(script);
            GlobalMIDIExists = true;
        }
        await this.fillSampleCache();
    }


    private async fillSampleCache() {
        const noteNames = Object.keys(MIDI.Soundfont[this.instrumentName]);
        for(const noteName of noteNames) {
            await this.initNoteBuffer(noteName);
        }
    }

    private async initNoteBuffer(noteName: string): Promise<AudioBuffer> {
        if (!this.sampleCache.has(noteName)) {
            const note = MIDI.Soundfont[this.instrumentName][noteName];
            if (!note) {
                throw new Error(`note "${noteName}" not found`);
            }
            const base64 = note.split(',')[1];
            const buffer = Base64Binary.decodeArrayBuffer(base64);
            const audioBuffer = await this.audioContext.decodeAudioData(buffer);
            this.sampleCache.set(noteName, audioBuffer);
        }
        return this.sampleCache.get(noteName);
    }

    public getNoteSample(noteName: string): AudioBuffer|undefined {
        if (!this.sampleCache.has(noteName)) {
            return undefined;
        }
        return this.sampleCache.get(noteName);
    } 
}