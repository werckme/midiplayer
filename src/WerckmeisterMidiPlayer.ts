import * as _ from 'lodash';
import { IMidiEvent, MidiEventTypes } from "./IMidiEvent";
import * as MidiFileModule from "midifile";
const MidiFile = (MidiFileModule as any).default;
import * as MidiEvents from "midievents";
import { Base64Binary } from "./Base64binary";
import { Constants } from './Constants';
import { IInstrument, ISoundFont, SfCompose } from './SfCompose';
import { SfRepository } from './SfRepository';
import * as JSSynth from 'poc';

const percussionInstrumentName = "percussion";
const percussionMidiChannel = 9;
const EventEmitterRefreshRateMillis = 10;

export enum PlayerState {
    Stopped,
    Preparing,
    Playing,
}

const DefaultInstrument:IInstrument = null; //{bank: 0, preset: 0};

export class WerckmeisterMidiPlayer {
    private _playerState: PlayerState = PlayerState.Stopped;
    playedTime: number = 0;
    midifile: any;
    private audioContext: AudioContext;
    private events: IMidiEvent[];
    public onPlayerStateChanged: (oldState: PlayerState, newState: PlayerState) => void = () => { };
    public onMidiEvent: (event: IMidiEvent) => void = () => { };
    private sfComposer = new SfCompose();
    private sfRepository = new SfRepository();
    private neededInstruments: IInstrument[];
    private midiBuffer: Uint8Array;
    public soundFont: ISoundFont;
    private synth;
    public get ppq(): number {
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
        this.synth = new JSSynth.Synthesizer();
        this.synth.init(this.audioContext.sampleRate);
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
            pitchbendValue: x.param2 * 128 + x.param1,
            playTime: x.playTime
        });
        if (event.type === MidiEvents.EVENT_MIDI) {
            switch (event.subtype) {
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
        const absolutePositions: number[] = [];
        const addAbsolutePosition = (x: any) => {
            const trackId = x.track || 0;
            let pos = absolutePositions[trackId] || 0;
            // for some reason the delta value in x is not correct, so we fetch it via getTrackEvents()
            const trackEvents: any[] = this.midifile.getTrackEvents(trackId);
            const delta = (trackEvents.find(tev => tev.index === x.index)).delta || 0;
            x.absPositionTicks = pos + delta;
            absolutePositions[trackId] = x.absPositionTicks;
            return x;
        };
        this.neededInstruments = _.chain(events)
            .filter(x => x.type === MidiEvents.EVENT_MIDI && x.subtype === MidiEvents.EVENT_MIDI_PROGRAM_CHANGE)
            .map(x => { return {bank:0, preset: x.param1 as number} })
            .concat([DefaultInstrument])
            .filter(x => !!x)
            .uniqBy(x => `${x.bank}-${x.preset}`)
            .value();
        
        const needsPercussion = _.chain(events)
            .some(x => x.channel === percussionMidiChannel)
            .value();

        if (needsPercussion) {
           this.neededInstruments.push({bank: 128, preset: 0});
        }

        this.events = _.chain(events)
            .map(x => this.convertEvent(addAbsolutePosition(x)))
            .filter(x => !!x)
            .value();
    }

    public async load(base64Data: string) {
        this.midiBuffer = Base64Binary.decodeArrayBuffer(base64Data);
        this.midifile = new MidiFile(this.midiBuffer);
        await this.preprocessEvents(this.midifile.getEvents());
        const skeleton = await this.sfRepository.getSkeleton();
        const requiredSampleIds = await this.sfComposer.getRequiredSampleIds(skeleton, this.neededInstruments);
        const samples = await this.sfRepository.getSampleFiles(requiredSampleIds);
        await this.sfComposer.writeSamples(samples);
        this.soundFont = await this.sfComposer.compose(skeleton.sfName, this.neededInstruments);
    }

    public download(soundFont: ISoundFont) {
        const url = window.URL.createObjectURL(soundFont.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = soundFont.sfName + ".sf2";
        document.body.appendChild(a); // we need to append the element to the dom -> otherwise it will not work in firefox
        a.click();    
        a.remove(); 
    }

    public async play() {
        if (!this.midifile || this.playerState > PlayerState.Stopped) {
            return;
        }
        this.playedTime = 0;
        this.playerState = PlayerState.Preparing;
        try {
            // Create AudioNode (ScriptProcessorNode) to output audio data
            const node = this.synth.createAudioNode(this.audioContext, 8192); // 8192 is the frame count of buffer
            console.log("node created");  
            node.connect(this.audioContext.destination);
            // Load your SoundFont data (sfontBuffer: ArrayBuffer)
            await this.synth.loadSFont(await this.soundFont.data.arrayBuffer());
            console.log("font loaded");            
            await this.synth.addSMFDataToPlayer(this.midiBuffer);
            console.log("smf file added");
            await this.synth.playPlayer();
            console.log("player started");
            await this.synth.waitForPlayerStopped();
            await this.synth.waitForVoicesStopped();
            this.synth.close();
            node.disconnect();
            console.log("done");
            // const songTimeSecs = _.last(this.events).playTime/1000 + 1.5;
            // this.startEventNotification();

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
            while (true) {
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
        if (!this.midifile || this.playerState === PlayerState.Stopped) {
            return;
        }
        this.playerState = PlayerState.Stopped;
    }

}