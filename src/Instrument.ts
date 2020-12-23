import { InstrumentNames } from "./GM";
import { IMidiEvent } from "./IMidiEvent";
import { InstrumentSamples } from "./InstrumentSamples";


const instrumentSampleMap = new Map<string, InstrumentSamples>();

export class Instrument {
    private notes = new Map<string, AudioBufferSourceNode>();
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
        const volumeNode = new GainNode(this.audioContext, {gain: event.velocity / 100});
        const sampleNode = new AudioBufferSourceNode(this.audioContext);
        sampleNode.buffer = buffer;
        sampleNode.connect(volumeNode);
        volumeNode.connect(this.audioContext.destination);
        sampleNode.start()
        this.notes.set(event.noteName, sampleNode);
    }

    noteOff(event: IMidiEvent) {
        const node = this.notes.get(event.noteName);
        if (!node) {
            return;
        }
        node.stop();
    }
}