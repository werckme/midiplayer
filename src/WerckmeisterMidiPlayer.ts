import * as _ from 'lodash';
import { Instrument, SampleRate } from "./Instrument";
import { IMidiEvent, MidiEventTypes } from "./IMidiEvent";
import { DefaultInstrument, GetInstrumentNameForPc } from "./GM";
import * as MidiFileModule from "midifile";
const MidiFile = (MidiFileModule as any).default;
import * as MidiEvents from "midievents";
import { Base64Binary } from "./Base64binary";
import { Constants } from './Constants';

const percussionInstrumentName = "percussion";
const percussionMidiChannel = 9;
const EventEmitterRefreshRateMillis = 10;

export enum PlayerState {
    Stopped,
    Preparing,
    Playing,
}

export class WerckmeisterMidiPlayer {
    private _playerState: PlayerState = PlayerState.Stopped;
    playedTime: number = 0;
    midifile: any;
    private audioContext: AudioContext;
    private instruments = new Map<number, Instrument>();
    private percussion: Instrument|null;
    private events: IMidiEvent[];
    private audioBuffer: AudioBuffer;
    private playblackNode: AudioBufferSourceNode;
    public onPlayerStateChanged: (oldState: PlayerState, newState: PlayerState) => void = ()=>{};
    public onMidiEvent: (event: IMidiEvent) => void = ()=>{};
    
    private get ppq(): number {
        return this.midifile.header.getTicksPerBeat();
    }

    public get playerState(): PlayerState {
        return this._playerState;
    }

    public set playerState(newState: PlayerState) {
        const oldState = this._playerState;
        this._playerState = newState;
        if (newState !== oldState) {
            this.onPlayerStateChanged(oldState, newState);
        }
    }

    public initAudioEnvironment(event: Event) {
        if (this.audioContext) {
            return;
        }
        this.audioContext = new AudioContext();
    }

    private convertEvent(event: any): IMidiEvent | null {
        const pc = (x) => ({
            type: MidiEventTypes.Pc,
            channel: x.channel,
            track: x.track,
            param1: x.param1,
            absPositionTicks: x.absPositionTicks,
            playTime: x.playTime
        });
        const cc = (x) => ({
            type: MidiEventTypes.Cc,
            channel: x.channel,
            track: x.track,
            param1: x.param1,
            param2: x.param2,
            absPositionTicks: x.absPositionTicks,
            playTime: x.playTime
        });        
        const noteon = (x) => ({
            type: MidiEventTypes.NoteOn,
            noteName: Constants.NOTES[x.param1],
            channel: x.channel,
            track: x.track,
            param1: x.param1,
            param2: x.param2,
            absPositionTicks: x.absPositionTicks,
            playTime: x.playTime
        });
        const noteoff = (x) => ({
            type: MidiEventTypes.NoteOff,
            noteName: Constants.NOTES[x.param1],
            channel: x.channel,
            track: x.track,
            param1: x.param1,
            param2: x.param2,
            absPositionTicks: x.absPositionTicks,
            playTime: x.playTime
        });
        const pitchbend = (x) => ({
            type: MidiEventTypes.PitchBend,
            channel: x.channel,
            track: x.track,
            param1: x.param1,
            param2: x.param2,
            absPositionTicks: x.absPositionTicks,
            pitchbendValue: x.param2*128 + x.param1,
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
        const absolutePositions:number[] = [];
        const addAbsolutePosition = (x: any) => {
            let pos = absolutePositions[x.track] || 0;
            // for some reason the delta value in x is not correct, so we fetch it via getTrackEvents()
            const trackEvents:any[] = this.midifile.getTrackEvents(x.track);
            const delta = (trackEvents.find(tev => tev.index === x.index)).delta || 0;
            x.absPositionTicks = pos + delta;
            absolutePositions[x.track] = x.absPositionTicks;
            return x;
        };
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
            .map(x => this.convertEvent(addAbsolutePosition(x)))
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

    private noteOn(event: IMidiEvent, offset: number) {
        const instrument = this.getInstrument(event);
        instrument.noteOn(event, offset);
    }

    private noteOff(event: IMidiEvent, offset: number) {
        const instrument = this.getInstrument(event);
        instrument.noteOff(this.audioBuffer, event, offset);
    }

    private controllerChange(event: IMidiEvent) {
        const instrument = this.getInstrument(event);
        instrument.controllerChange(event);
    }

    private programChange(event: IMidiEvent) {
        const instrumentName = GetInstrumentNameForPc(event.param1);
        const instrument = new Instrument(this.audioContext);
        instrument.setInstrument(instrumentName);
        this.instruments.set(event.track, instrument);
    }

    private pitchBend(event: IMidiEvent) {
        const instrument = this.getInstrument(event);
        instrument.pitchBend(event);
    }

    public async load(base64Data: string) {
        const bff = Base64Binary.decodeArrayBuffer(base64Data);
        this.midifile = new MidiFile(bff);
        await this.preprocessEvents(this.midifile.getEvents());
    }

    private async render() {
        return new Promise<void>(resolve => {
            setTimeout(() => {
                for(let i=0; i<this.events.length; ++i) {
                    const event = this.events[i];
                    let eventTseconds = event.playTime / 1000;
                    switch(event.type) {
                        case MidiEventTypes.NoteOn: this.noteOn(event, eventTseconds); break;
                        case MidiEventTypes.NoteOff: this.noteOff(event, eventTseconds); break;
                        case MidiEventTypes.Pc: this.programChange(event); break;
                        case MidiEventTypes.Cc: this.controllerChange(event); break;
                        case MidiEventTypes.PitchBend: this.pitchBend(event); break;
                        //default: console.log(event.name); break;
                    }
                }
                resolve();
            });
        });
    }

    public async play() {
        if (!this.midifile) {
            return;
        }
        this.playedTime = 0;
        this.playerState = PlayerState.Preparing;
        try {
            const songTimeSecs = _.last(this.events).playTime/1000 + 5;
            this.audioBuffer = new AudioBuffer({length: songTimeSecs*SampleRate, sampleRate: SampleRate, numberOfChannels: 2})
            await this.render();
            this.playblackNode = new AudioBufferSourceNode(this.audioContext, {buffer: this.audioBuffer});
            this.playblackNode.connect(this.audioContext.destination);
            this.playblackNode.start();
            this.playerState = PlayerState.Playing;
            this.startEventNotification();
        } catch {
            this.playerState = PlayerState.Stopped;
        }
    }

    /**
     * fires the midi events parallel to the playback
     */
    private startEventNotification() {
        let eventIndex = 0;
        const startTime = performance.now();
        const intervalId = setInterval(() => {
            const t = performance.now() - startTime;
            this.playedTime = t / 1000;
            if (this.playerState !== PlayerState.Playing) {
                clearInterval(intervalId);
            }
            while(true) {
                const event = this.events[eventIndex];
                if (event.playTime > t) {
                    break;
                }
                this.onMidiEvent(event);
                ++eventIndex;
                if (eventIndex >= this.events.length) {
                    clearInterval(intervalId);
                    break;
                }
            }

        }, EventEmitterRefreshRateMillis);
    }

    public stop() {
        if (!this.midifile) {
            return;
        }
        this.playblackNode.stop();
        this.playerState = PlayerState.Stopped;
    }

}