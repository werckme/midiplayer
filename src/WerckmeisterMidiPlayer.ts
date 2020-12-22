import { Base64Binary } from "./Base64binary";
import * as MidiPlayer from "midi-player-js";

declare const MIDI;

const midifile = "data:@file/midi;base64,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";

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