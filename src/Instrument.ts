const samplesBaseUrl = 'https://werckme.github.io/midi-js-soundfonts/FluidR3_GM';
import { Base64Binary } from "./Base64binary";
import { IMidiEvent } from "./IMidiEvent";

let GlobalMIDIExists = false;
declare const MIDI; // loaded soundfonts are stored here

export class Instrument {
    sampleCache = new Map<string, AudioBuffer>();

    constructor(private name: string, private audioContext: AudioContext) {

    }

    async load() {
        if (!GlobalMIDIExists || !MIDI.Soundfont[this.name]) {
            const url = `${samplesBaseUrl}/${this.name}-ogg.js`;
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


    async fillSampleCache() {
        const noteNames = Object.keys(MIDI.Soundfont[this.name]);
        for(const noteName of noteNames) {
            await this.initNoteBuffer(noteName);
        }
    }

    async initNoteBuffer(noteName: string): Promise<AudioBuffer> {
        if (!this.sampleCache.has(noteName)) {
            const note = MIDI.Soundfont[this.name][noteName];
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

    noteOn(event: IMidiEvent) {
        if (!this.sampleCache.has(event.noteName)) {
            return;
        }
        const node = new AudioBufferSourceNode(this.audioContext);
        node.buffer = this.sampleCache.get(event.noteName);
        node.connect(this.audioContext.destination)
        node.start()
    }
}