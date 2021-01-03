import { times } from "lodash";
import { DefaultInstrument, InstrumentNames } from "./GM";
import { IMidiEvent } from "./IMidiEvent";
import { InstrumentSamples } from "./InstrumentSamples";
import * as _ from 'lodash';

const InstrumentSampleMap = new Map<string, InstrumentSamples>();
export const SampleRate = 44100;
const FadeOutSamples = 10;

class Note {
    constructor(public startTimeSecs: number, public velocity: number) {}
}

export class Instrument {
    pitchBendCurve = {};
    exprCurve = {};
    panoramaCurve = {};

    private notes = new Map<string, Note>();
    private instrumentName: string;
    public static async loadSamples(instrumentName: string, audioContext: AudioContext) {
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
        this.instrumentName = name;
    }

    /**
     * the event will be stored to be rendered during the associated noteOff event
     * @param event 
     * @param offset 
     */
    noteOn(event: IMidiEvent, offset: number = 0) {
        this.notes.set(event.noteName, new Note(offset, event.param2));
    }

    findLastValue(container: {}, currentIndex: number, defaultValue: number = 1): number {
        const keys = _.chain(_.keys(container))
            .map(x => Number.parseInt(x))
            .filter(x => x <= currentIndex)
            .orderBy(x => x)
            .value();
        if (keys.length === 0) {
            return defaultValue;
        }
        const key = _.last(keys);
        const value = container[key];
        return value;
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
        let lastPitch = this.findLastValue(this.pitchBendCurve, tIndex, 1);
        let lastExpr = this.findLastValue(this.exprCurve, tIndex, 1);
        let lastPanorama = this.findLastValue(this.panoramaCurve, tIndex, 0.5); 
        for(let i=0; i<sData.length; ++i) {
            let fadeOut = 1;
            if (i >= fadeOutIndex) {
                fadeOut = 1 - (1/fadeOutSamples) * (i-fadeOutIndex);
                if (fadeOut <= 0) {
                    break;
                }
            }
            lastPitch = this.pitchBendCurve[tIndex] ? this.pitchBendCurve[tIndex] : lastPitch;
            lastExpr = this.exprCurve[tIndex] !== undefined ? this.exprCurve[tIndex] : lastExpr;
            lastPanorama = this.panoramaCurve[tIndex] !== undefined ? this.panoramaCurve[tIndex] : lastPanorama;
            const ptr = Math.round(phasePtr);
            const linInt = phasePtr - ptr;
            if ((ptr+1) >= sData.length) {
                break;
            }
            const sampleValue = ((sData[ptr+1]*linInt)+(sData[ptr])*(1-linInt)) * velocity * lastExpr * fadeOut;
            // https://www.desmos.com/calculator/6tzweuanxw
            tDataL[tIndex] += sampleValue * (-lastPanorama + 1);
            tDataR[tIndex] += sampleValue * (lastPanorama);
            ++tIndex;
            phasePtr = phasePtr + lastPitch;
        }
    }

    expression(event: IMidiEvent) {
        this.exprCurve[Math.floor(event.playTime/1000*SampleRate)] = event.param2 / 127;
    }

    panorama(event: IMidiEvent) {
        this.panoramaCurve[Math.floor(event.playTime/1000*SampleRate)] = event.param2 / 127;
    }

    controllerChange(event: IMidiEvent) {
        switch (event.param1) {
            case 0xa: return this.panorama(event);
            case 0xb: return this.expression(event);
        }
    }

    /**
     * @param event pitch min/max one whole tone which has the relation of 9/8
     */
    pitchBend(event: IMidiEvent) {
        // https://www.desmos.com/calculator/rhhb5ihehk?
        const pitchBendValue = event.pitchbendValue / 16383;
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