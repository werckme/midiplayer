import { InstrumentNames } from "./GM";
import { IMidiEvent } from "./IMidiEvent";
import { InstrumentSamples } from "./InstrumentSamples";


const instrumentSampleMap = new Map<string, InstrumentSamples>();


export class Instrument {
    private notes = new Map<string, GainNode>();
    public static async loadSamples(instrumentName: string, audioContext: AudioContext): Promise<void> {
        if(instrumentSampleMap.has(instrumentName)) {
            return;
        }
        const samples = new InstrumentSamples(instrumentName, audioContext);
        await samples.load();
        instrumentSampleMap.set(instrumentName, samples);
    }

    constructor(private instrumentName: string, private audioContext: AudioContext) {
    }

    noteOn(event: IMidiEvent) {
        const samples = instrumentSampleMap.get(this.instrumentName);
        const buffer = samples.getNoteSample(event.noteName);
        if (!buffer) {
            return;
        }
        const gainNode = new GainNode(this.audioContext, {gain: event.velocity / 127});
        const sampleNode = new AudioBufferSourceNode(this.audioContext);
        sampleNode.buffer = buffer;
        sampleNode.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        sampleNode.start()
        this.notes.set(event.noteName, gainNode);
    }

    noteOff(event: IMidiEvent) {
        const note = this.notes.get(event.noteName);
        if (!note) {
            return;
        }
        const gain = note.gain;
        gain.linearRampToValueAtTime(gain.value, this.audioContext.currentTime);
        gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
    }

    stop() {
        for(const note of Array.from(this.notes.values())) {
            const gain = note.gain;
            gain.linearRampToValueAtTime(gain.value, this.audioContext.currentTime);
            gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
        }
    }
}