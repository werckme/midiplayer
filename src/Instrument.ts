import { InstrumentNames } from "./GM";
import { IMidiEvent } from "./IMidiEvent";
import { InstrumentSamples } from "./InstrumentSamples";


const instrumentSampleMap = new Map<string, InstrumentSamples>();

export class Instrument {

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
        const node = new AudioBufferSourceNode(this.audioContext);
        node.buffer = buffer;
        node.connect(this.audioContext.destination)
        node.start()
    }
}