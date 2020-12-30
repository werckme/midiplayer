import * as _ from 'lodash';
import { Instrument, SampleRate } from "./Instrument";
import { IMidiEvent, MidiEventNames } from "./IMidiEvent";
import { DefaultInstrument, GetInstrumentNameForPc } from "./GM";
import * as MidiFileModule from "midifile";
const MidiFile = (MidiFileModule as any).default;
import * as MidiEvents from "midievents";
import { Base64Binary } from "./Base64binary";
import { Constants } from './Constants';

const percussionInstrumentName = "percussion";
const percussionMidiChannel = 9;



export class WerckmeisterMidiPlayer {
    midifile: any;
    audioContext: AudioContext;
    instruments = new Map<number, Instrument>();
    percussion: Instrument|null;
    events: IMidiEvent[];
    audioBuffer: AudioBuffer;
    playblackNode: AudioBufferSourceNode;
    
    private get ppq(): number {
        return this.midifile.header.getTicksPerBeat();
    }

    public initAudioEnvironment(event: Event) {
        if (this.audioContext) {
            return;
        }
        this.audioContext = new AudioContext();
    }

    private convertEvent(event: any): IMidiEvent | null {
        const pc = (x) => ({
            name: MidiEventNames.Pc,
            channel: x.channel,
            delta: x.delta,
            track: x.track,
            value: x.param1,
            playTime: x.playTime
        });
        const cc = (x) => ({
            name: MidiEventNames.Cc,
            channel: x.channel,
            delta: x.delta,
            track: x.track,
            number: x.param1,
            value: x.param2,
            playTime: x.playTime
        });        
        const noteon = (x) => ({
            name: MidiEventNames.NoteOn,
            noteName: Constants.NOTES[x.param1],
            channel: x.channel,
            delta: x.delta,
            track: x.track,
            value: x.param1,
            velocity: x.param2,
            playTime: x.playTime
        });
        const noteoff = (x) => ({
            name: MidiEventNames.NoteOff,
            noteName: Constants.NOTES[x.param1],
            channel: x.channel,
            delta: x.delta,
            track: x.track,
            value: x.param1,
            velocity: x.param2,
            playTime: x.playTime
        });
        const pitchbend = (x) => ({
            name: MidiEventNames.PitchBend,
            channel: x.channel,
            delta: x.delta,
            track: x.track,
            value: x.param2*128 + x.param1,
            playTime: x.playTime
        });        
        if (event.type === MidiEvents.EVENT_MIDI) {
            switch(event.subtype) {
                case MidiEvents.EVENT_MIDI_PROGRAM_CHANGE: return pc(event);
                case MidiEvents.EVENT_MIDI_CONTROLLER: return cc(event);
                case MidiEvents.EVENT_MIDI_NOTE_ON: return noteon(event);
                case MidiEvents.EVENT_MIDI_NOTE_OFF: return noteoff(event);
                case MidiEvents.EVENT_MIDI_PITCH_BEND: return pitchbend(event);
            }
        }
        return null;
    }


    private async preprocessEvents(events) {
        let neededInstruments = _.chain(events)
            .filter(x => x.type === MidiEvents.EVENT_MIDI && x.subtype === MidiEvents.EVENT_MIDI_PROGRAM_CHANGE)
            .map(x => GetInstrumentNameForPc(x.param1))
            .uniq()
            .filter(x => !!x)
            .value();
        neededInstruments.push(DefaultInstrument);
        const needsPercussion = _.chain(events)
            .some(x => x.channel === percussionMidiChannel)
            .value();
        if (needsPercussion) {
            neededInstruments.push(percussionInstrumentName);
            this.percussion = new Instrument(this.audioContext);
            this.percussion.setInstrument(percussionInstrumentName);
        }
        for(const instrumentName of neededInstruments) {
            await Instrument.loadSamples(instrumentName, this.audioContext);
        }
        this.events = _.chain(events)
            .map(x => this.convertEvent(x))
            .filter(x => !!x)
            .value();
    }

    private getInstrument(event: IMidiEvent) {
        if (event.channel === percussionMidiChannel) {
            return this.percussion;
        }
        if (!this.instruments.has(event.track)) {
            const newInstrument = new Instrument(this.audioContext);
            this.instruments.set(event.track, newInstrument);
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
        const instrument = this.getInstrument(event);
        instrument.controllerChange(event);
    }

    programChange(event: IMidiEvent) {
        const instrumentName = GetInstrumentNameForPc(event.value);
        const instrument = new Instrument(this.audioContext);
        instrument.setInstrument(instrumentName);
        this.instruments.set(event.track, instrument);
    }

    pitchBend(event: IMidiEvent) {
        const instrument = this.getInstrument(event);
        instrument.pitchBend(event);
    }

    async load(base64Data: string) {
        const bff = Base64Binary.decodeArrayBuffer(base64Data);
        this.midifile = new MidiFile(bff);
        await this.preprocessEvents(this.midifile.getEvents());
    }


    async render(): Promise<void> {
        return new Promise(resolve => {
            setTimeout(() => {
                for(let i=0; i<this.events.length; ++i) {
                    const event = this.events[i];
                    let eventTseconds = event.playTime / 1000;
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
        });
    }

    async play() {
        if (!this.midifile) {
            return;
        }
        const songTimeSecs = _.last(this.events).playTime/1000 + 5;
        this.audioBuffer = new AudioBuffer({length: songTimeSecs*SampleRate, sampleRate: SampleRate, numberOfChannels: 2})
        await this.render();
        this.playblackNode = new AudioBufferSourceNode(this.audioContext, {buffer: this.audioBuffer});
        this.playblackNode.connect(this.audioContext.destination);
        this.playblackNode.start();
    }

    stop() {
        if (!this.midifile) {
            return;
        }
        this.playblackNode.stop();
    }

}