import { InstrumentNames } from "./GM";
import { IMidiEvent } from "./IMidiEvent";
import { InstrumentSamples } from "./InstrumentSamples";


const InstrumentSampleMap = new Map<string, InstrumentSamples>();
export const SampleRate = 44100;
const FadeOutSamples = 500;

class Note {
    constructor(public startTimeSecs: number, public velocity: number) {}
}

export class Instrument {
    private notes = new Map<string, Note>();
    public static async loadSamples(instrumentName: string, audioContext: AudioContext): Promise<void> {
        if(InstrumentSampleMap.has(instrumentName)) {
            return;
        }
        const samples = new InstrumentSamples(instrumentName, audioContext);
        await samples.load();
        InstrumentSampleMap.set(instrumentName, samples);
    }

    constructor(private instrumentName: string, private audioContext: AudioContext) {
    }

    /**
     * the event will be stored to be rendered during the associated noteOff event
     * @param event 
     * @param offset 
     */
    noteOn(event: IMidiEvent, offset: number = 0) {
        this.notes.set(event.noteName, new Note(offset, event.velocity));
    }

    noteOff(target: AudioBuffer, event: IMidiEvent, offset: number) {
        const note = this.notes.get(event.noteName);
        if (!note) {
            return;
        }
        const samples = InstrumentSampleMap.get(this.instrumentName);
        const buffer = samples.getNoteSample(event.noteName);
        const startTimeSecs = note.startTimeSecs;
        // exp((x-1)*3)
        const volume = Math.exp(((note.velocity/127)-1)*3) + 0.2;
        if (!buffer) {
            return;
        }
        const numSamples = (offset - startTimeSecs) * SampleRate;
        const fadeOutSamples = Math.min(numSamples, FadeOutSamples);
        const sData = buffer.getChannelData(0);
        const tData = target.getChannelData(0);
        let tIndex = Math.floor(startTimeSecs * SampleRate);
        const fadeOutIndex = numSamples - fadeOutSamples;
        for(let i=0; i<sData.length; ++i) {
            let fadeOut = 1;
            if (i >= fadeOutIndex) {
                fadeOut = 1 - (1/fadeOutSamples) * (i-fadeOutIndex);
                if (fadeOut <= 0) {
                    break;
                }
            }
            tData[tIndex++] += sData[i] * volume * fadeOut;
        }
    }

}