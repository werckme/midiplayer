import { times } from "lodash";
import { DefaultInstrument, InstrumentNames } from "./GM";
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
    lastPitch: number = 1;

    exprCurve: number[] = [];
    lastExpr: number = 1;
    
    panoramaCurve: number[] = [];
    lastPanorama: number = 0.5;

    private notes = new Map<string, Note>();
    private instrumentName: string;
    public static async loadSamples(instrumentName: string, audioContext: AudioContext): Promise<void> {
        if(InstrumentSampleMap.has(instrumentName)) {
            return;
        }
        const samples = new InstrumentSamples(instrumentName, audioContext);
        await samples.load();
        InstrumentSampleMap.set(instrumentName, samples);
    }

    constructor(private audioContext: AudioContext) {
        this.instrumentName = DefaultInstrument;
    }

    setInstrument(name: string) {
        this.pitchBendCurve = [];
        this.lastPitch = 1;
        this.exprCurve = [];
        this.lastExpr = 1;
        this.panoramaCurve = [];
        this.lastPanorama = 0.5;
        this.instrumentName = name;
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
        if (!samples) {
            throw new Error(`no samples found for instrument: "${this.instrumentName}"`);
        }
        const buffer = samples.getNoteSample(event.noteName);
        const startTimeSecs = note.startTimeSecs;
        // exp((x-1)*3) 
        // https://www.desmos.com/calculator/qo25cegi5e
        // const velocity = note.velocity/127 * this.volume;
        const velocity = Math.exp(((note.velocity/127)-1)*3) + 0.2;
        if (!buffer) {
            return;
        }
        const numSamples = (offset - startTimeSecs) * SampleRate;
        const fadeOutSamples = Math.min(numSamples, FadeOutSamples);
        const sData = buffer.getChannelData(0);
        const tDataL = target.getChannelData(0);
        const tDataR = target.getChannelData(1);
        let tIndex = Math.floor(startTimeSecs * SampleRate);
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
            this.lastPitch = this.pitchBendCurve[tIndex] ? this.pitchBendCurve[tIndex] : this.lastPitch;
            this.lastExpr = this.exprCurve[tIndex] ? this.exprCurve[tIndex] : this.lastExpr;
            this.lastPanorama = this.panoramaCurve[tIndex] ? this.panoramaCurve[tIndex] : this.lastPanorama;
            const ptr = Math.round(phasePtr);
            const linInt = phasePtr - ptr;
            if ((ptr+1) >= sData.length) {
                break;
            }
            const sampleValue = ((sData[ptr+1]*linInt)+(sData[ptr])*(1-linInt)) * velocity * this.lastExpr * fadeOut;
            // https://www.desmos.com/calculator/6tzweuanxw
            tDataL[tIndex] += sampleValue * (-this.lastPanorama + 1);
            tDataR[tIndex] += sampleValue * (this.lastPanorama);
            ++tIndex;
            phasePtr = phasePtr + this.lastPitch;
        }
    }

    expression(event: IMidiEvent) {
        this.exprCurve[Math.floor(event.playTime/1000*SampleRate)] = event.value / 127;
    }

    panorama(event: IMidiEvent) {
        this.panoramaCurve[Math.floor(event.playTime/1000*SampleRate)] = event.value / 127;
    }

    controllerChange(event: IMidiEvent) {
        switch (event.number) {
            case 0xa: return this.panorama(event);
            case 0xb: return this.expression(event);
        }
    }

    /**
     * @param event pitch min/max one whole tone which has the relation of 9/8
     */
    pitchBend(event: IMidiEvent) {
        // https://www.desmos.com/calculator/rhhb5ihehk?
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