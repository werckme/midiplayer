import { InstrumentNames } from "./GM";
import { IMidiEvent } from "./IMidiEvent";
import { InstrumentSamples } from "./InstrumentSamples";


const instrumentSampleMap = new Map<string, InstrumentSamples>();
export const SampleRate = 44100;

class Note {
    constructor(public startTimeSecs: number, public velocity: number) {}
}

export class Instrument {
    private notes = new Map<string, Note>();
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


    noteOn(event: IMidiEvent, offset: number = 0) {
        this.notes.set(event.noteName, new Note(offset, event.velocity));
    }

    noteOff(target: AudioBuffer, event: IMidiEvent, offset: number) {
        const note = this.notes.get(event.noteName);
        if (!note) {
            return;
        }
        const samples = instrumentSampleMap.get(this.instrumentName);
        const buffer = samples.getNoteSample(event.noteName);
        const startTimeSecs = note.startTimeSecs;
        const numSamples = (offset - startTimeSecs) * SampleRate;
        const volume = note.velocity / 127;
        if (!buffer) {
            return;
        }
        const sData = buffer.getChannelData(0);
        const tData = target.getChannelData(0);
        let tIndex = Math.floor(startTimeSecs * SampleRate);
        for(let i=0; i<sData.length; ++i) {
            tData[tIndex++] += i<numSamples ? sData[i] * volume : 0;
        }
    }

}