import { Base64Binary } from "./Base64binary";
import * as MidiPlayer from "midi-player-js";

declare const MIDI;

const midifile = "data:audio/midi;base64,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";

export class WerckmeisterMidiPlayer {
    audioContext: AudioContext;
    sampleCache = new Map<string, AudioBuffer>();
    public async init(): Promise<void> {
        try {
            this.audioContext = new AudioContext();
            await this.load();
            await this.fillSampleCache();
            this.play();
            //const audioBuffer = await this.generateTestBuffer();
            //const node = new AudioBufferSourceNode(this.audioContext);
            //node.buffer = audioBuffer;
            //node.connect(this.audioContext.destination)
            //node.start()
        } catch (ex) {
            console.log(ex)
        }
    }

    async load() {
        const url = 'https://werckme.github.io/midi-js-soundfonts/FluidR3_GM/marimba-ogg.js';
        const response = await fetch(url);
        const text = await response.text();
        const script:any = document.createElement('script');
        script.language = 'javascript';
        script.type = 'text/javascript';
        script.text = text;
        document.body.appendChild(script);
    }


    async fillSampleCache() {
        const noteNames = Object.keys(MIDI.Soundfont.marimba);
        for(const noteName of noteNames) {
            await this.getNoteBuffer(noteName);
        }
    }

    async getNoteBuffer(noteName: string): Promise<AudioBuffer> {
        if (!this.sampleCache.has(noteName)) {
            const note = MIDI.Soundfont.marimba[noteName];
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

    play() {
        const midiPlayer = new MidiPlayer.Player();
        midiPlayer.on('midiEvent', (event) => {
            console.log(event);
            if (event.name !== 'Note on') {
                return;
            }
            if (!this.sampleCache.has(event.noteName)) {
                return;
            }
            const node = new AudioBufferSourceNode(this.audioContext);
            node.buffer = this.sampleCache.get(event.noteName);
            node.connect(this.audioContext.destination)
            node.start()
        });
        midiPlayer.loadDataUri(midifile);
        midiPlayer.play()

    }
}