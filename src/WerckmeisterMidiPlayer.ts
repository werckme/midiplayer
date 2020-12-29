import { MidiPlayer } from "./midiplayer";
import * as _ from 'lodash';
import { Instrument, SampleRate } from "./Instrument";
import { IMidiEvent, MidiEventNames } from "./IMidiEvent";
import { GetInstrumentNameForPc } from "./GM";
import { parseArrayBuffer } from 'midi-json-parser';

const percussionInstrumentName = "percussion";
const percussionMidiChannel = 10;
const RenderSecsPerCycle = 5;

export class WerckmeisterMidiPlayer {
    midiPlayer: any;
    audioContext: AudioContext;
    instruments = new Map<number, Instrument>();
    percussion: Instrument|null;
    events: IMidiEvent[];
    audioBuffer: AudioBuffer;
    playblackNode: AudioBufferSourceNode;

    public initAudioEnvironment(event: Event) {
        if (this.audioContext) {
            return;
        }
        this.audioContext = new AudioContext();
    }


    private async preprocessEvents(events) {
        let neededInstruments = _.chain(events)
            .flatten()
            .filter(x => x.name === 'Program Change')
            .map(x => GetInstrumentNameForPc(x.value))
            .uniq()
            .filter(x => !!x)
            .value();
        const needsPercussion = _.chain(events)
            .flatten()
            .some(x => x.channel === percussionMidiChannel)
            .value();
        if (needsPercussion) {
            neededInstruments.push(percussionInstrumentName);
            this.percussion = new Instrument(percussionInstrumentName, this.audioContext);
        }
        for(const instrumentName of neededInstruments) {
            await Instrument.loadSamples(instrumentName, this.audioContext);
        }
        this.events = _.chain(events)
            .flatten()
            .value();
    }

    private getInstrument(event: IMidiEvent) {
        if (event.channel === percussionMidiChannel) {
            return this.percussion;
        }
        return this.instruments.get(event.track);
    }

    noteOn(event: IMidiEvent, offset: number) {
        const instrument = this.getInstrument(event);
        instrument.noteOn(event, offset);
    }

    noteOff(event: IMidiEvent, offset: number) {
        const instrument = this.getInstrument(event);
        instrument.noteOff(this.audioBuffer, event, offset);
    }

    controllerChange(event: IMidiEvent) {
        // console.log(event.track, event.number, event.value);
        // const instrument = this.getInstrument(event);
        // if (!instrument) {
        //     return;
        // }
        // instrument.controllerChange(event);
    }

    programChange(event: IMidiEvent) {
        const instrumentName = GetInstrumentNameForPc(event.value);
        const instrument = new Instrument(instrumentName, this.audioContext);
        this.instruments.set(event.track, instrument);
    }

    pitchBend(event: IMidiEvent) {
        const instrument = this.getInstrument(event);
        instrument.pitchBend(event);
    }

    async load(base64Data: string) {
        this.midiPlayer = new MidiPlayer.Player();
        this.midiPlayer.loadDataUri(base64Data);
        await this.preprocessEvents(this.midiPlayer.getEvents());
    }

    overrideTempo(bpm: number) {
        this.midiPlayer.tempo = bpm;
    }


    render(): Promise<void> {
        console.log((this.midiPlayer as any))
        return new Promise(resolve => {
            for(let i=0; i<this.events.length; ++i) {
                const event = this.events[i];
                let eventTseconds = (event.tick / this.midiPlayer.division) * (60 / this.midiPlayer.tempo);
                switch(event.name) {
                    case MidiEventNames.NoteOn: this.noteOn(event, eventTseconds); break;
                    case MidiEventNames.NoteOff: this.noteOff(event, eventTseconds); break;
                    case MidiEventNames.Pc: this.programChange(event); break;
                    case MidiEventNames.Cc: this.controllerChange(event); break;
                    case MidiEventNames.PitchBend: this.pitchBend(event); break;
                    //default: console.log(event.name); break;
                }
            }
            resolve();
        });
    }

    async play() {
        if (!this.midiPlayer) {
            return;
        }
        const songTimeSecs = this.midiPlayer.getSongTime() + 5;
        this.audioBuffer = new AudioBuffer({length: songTimeSecs*SampleRate, sampleRate: SampleRate})
        await this.render();
        this.playblackNode = new AudioBufferSourceNode(this.audioContext, {buffer: this.audioBuffer});
        this.playblackNode.connect(this.audioContext.destination);
        this.playblackNode.start();
    }

    stop() {
        if (!this.midiPlayer) {
            return;
        }
        this.playblackNode.stop();
    }

    pause() {
        if (!this.midiPlayer) {
            return;
        }
        this.midiPlayer.pause();
    }

}