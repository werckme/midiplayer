import { times } from "lodash";
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
    pitchBendCurve: number[] = [];
    volume: number = 1;
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
        // const volume = note.velocity/127 * this.volume;
        const volume = Math.exp(((note.velocity/127)-1)*3) + 0.2;
        if (!buffer) {
            return;
        }
        const numSamples = (offset - startTimeSecs) * SampleRate;
        const fadeOutSamples = Math.min(numSamples, FadeOutSamples);
        const sData = buffer.getChannelData(0);
        const tData = target.getChannelData(0);
        let tIndex = Math.floor(startTimeSecs * SampleRate);
        let pitch = 1;
        const fadeOutIndex = numSamples - fadeOutSamples;
        let phasePtr = 0;
        for(let i=0; i<sData.length; ++i) {
            let fadeOut = 1;
            if (i >= fadeOutIndex) {
                fadeOut = 1 - (1/fadeOutSamples) * (i-fadeOutIndex);
                if (fadeOut <= 0) {
                    break;
                }
            }
            pitch = this.pitchBendCurve[tIndex] ? this.pitchBendCurve[tIndex] : pitch;
            const ptr = Math.round(phasePtr);
            const linInt = phasePtr - ptr;
            if ((ptr+1) >= sData.length) {
                break;
            }
            tData[tIndex++] += ((sData[ptr+1]*linInt)+(sData[ptr])*(1-linInt)) * volume * fadeOut;
            phasePtr = phasePtr + pitch;
        }
    }

    controllerChange(event: IMidiEvent) {
        // switch (event.number) {
        //     //case 10: console.log(event.value);
        //     //case 11: console.log(event.value);
        // }
    }

    /**
     * @param event pitch min/max one whole tone which has the relation of 9/8
     */
    pitchBend(event: IMidiEvent) {
        const pitchBendValue = event.value / 16383;
        let pitch = 1;
        if (Math.abs(pitchBendValue - 0.5) < 0.001) {
            pitch = 1;
        }
        else if (pitchBendValue > 0.5) {
            const x = (pitchBendValue - 0.5) * 2;
            pitch = x * 0.125 + 1;
        } else {
            const x = pitchBendValue * 2;
            pitch = x * 0.111111 + (8/9)
        }
        this.pitchBendCurve[Math.floor(event.playTime/1000*SampleRate)] = pitch;
    }

}