import * as _ from 'lodash';
import { IMidiEvent, MidiEventTypes } from "./IMidiEvent";
import * as MidiFileModule from "midifile";
const MidiFile = (MidiFileModule as any).default;
import * as MidiEvents from "midievents";
import { Base64Binary } from "./Base64binary";
import { Constants } from './Constants';
import { IInstrument, ISoundFont, SfCompose } from './SfCompose';
import { SfRepository } from './SfRepository';
import * as JSSynth from 'js-synthbuild';

// https://github.com/jet2jet/js-synthesizer/blob/master/src/main/ISynthesizer.ts
const percussionMidiChannel = 9;
const EventEmitterRefreshRateMillis = 10;
const DefaultRepoUrl = "https://raw.githubusercontent.com/werckme/soundfont-server/feature/splitandcompose/soundfonts/FluidR3_GM/FluidR3_GM.sf2.json";

export enum PlayerState {
    Stopped,
    Preparing,
    Playing,
}

const DefaultInstrument:IInstrument = {bank: 0, preset: 0};
const DefaultPercussionInstrument:IInstrument = {bank: 128, preset: 0};

let _lastSoundFont: ISoundFont;

function downloadLastSoundFont() {
    if (!_lastSoundFont) {
        console.warn("wm midi no last soundfont");
        return;
    }
    const soundFont = _lastSoundFont;
    const url = window.URL.createObjectURL(soundFont.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = soundFont.sfName + ".sf2";
    document.body.appendChild(a);
    a.click();    
    a.remove(); 
}

(window as any).__wmmididownloadlastsoundfont = downloadLastSoundFont;

export class WerckmeisterMidiPlayer {
    private _playerState: PlayerState = PlayerState.Stopped;
    playedTime: number = 0;
    midifile: any;
    private audioContext: AudioContext;
    private events: IMidiEvent[];
    public onPlayerStateChanged: (oldState: PlayerState, newState: PlayerState) => void = () => { };
    public onMidiEvent: (event: IMidiEvent) => void = () => { };
    private sfComposer = new SfCompose();
    private _sfRepository = null;
    private neededInstruments: IInstrument[];
    private midiBuffer: Uint8Array;
    public soundFont: ISoundFont;
    private soundFontHash: string;
    private synth;
    private repoUrl = DefaultRepoUrl;
    public get ppq(): number {
        return this.midifile.header.getTicksPerBeat();
    }

    private async getSfRepository() {
        if (!this._sfRepository) {
            this._sfRepository = new SfRepository();
            await this._sfRepository.setRepo(this.repoUrl);
        }
        return this._sfRepository;
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
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
        }
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
            .filter(x => !!x)
            .uniqBy(x => `${x.bank}-${x.preset}`)
            .value();
        
        const needsPercussion = _.chain(events)
            .some(x => x.channel === percussionMidiChannel)
            .value();

        if (needsPercussion) {
           this.neededInstruments.push(DefaultPercussionInstrument);
        }

        if (this.neededInstruments.length === 0) {
            this.neededInstruments.push(DefaultInstrument);
        }

        this.events = _.chain(events)
            .map(x => this.convertEvent(addAbsolutePosition(x)))
            .filter(x => !!x)
            .value();
    }

    private instrumentHash(instrument: IInstrument): string {
        return `${instrument.bank}-${instrument.preset}`;
    }

    private instrumentsHash(instruments: IInstrument[]): string {
        return instruments
            .map(i => this.instrumentHash(i))
            .sort()
            .join(",");
    }

    private async getSoundfont(requiredInstruments: IInstrument[]): Promise<ISoundFont> {
        const sfRepository = await this.getSfRepository();
        const skeleton = await sfRepository.getSkeleton();
        const requiredSampleIds = await this.sfComposer.getRequiredSampleIds(skeleton, requiredInstruments);
        const samples = await sfRepository.getSampleFiles(requiredSampleIds);
        await this.sfComposer.writeSamples(samples);
        const sf = await this.sfComposer.compose(skeleton.sfName, requiredInstruments);
        return sf;

    }

    public async load(base64Data: string) {
        this.midiBuffer = Base64Binary.decodeArrayBuffer(base64Data);
        this.midifile = new MidiFile(this.midiBuffer);
        await this.preprocessEvents(this.midifile.getEvents());
        const soundFontHash = this.instrumentsHash(this.neededInstruments);
        if (soundFontHash === this.soundFontHash) {
            return;
        }
        this.soundFont = await this.getSoundfont(this.neededInstruments);
        _lastSoundFont = this.soundFont;
        this.soundFontHash = soundFontHash;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public async play() {
        if (!this.midifile || this.playerState > PlayerState.Stopped) {
            return;
        }
        this.playedTime = 0;
        this.playerState = PlayerState.Preparing;
        this.startEventNotification();
        this.playerState = PlayerState.Playing;
        const context = this.audioContext;
        await context.audioWorklet.addModule('libfluidsynth-2.0.2.js');
        await context.audioWorklet.addModule('js-synthesizer.worklet.js');
        this.synth = new JSSynth.AudioWorkletNodeSynthesizer();
        this.synth.init(context.sampleRate);
        const audioNode = this.synth.createAudioNode(context);
        audioNode.connect(context.destination);
        await this.synth.loadSFont(await this.soundFont.data.arrayBuffer());
        await this.synth.addSMFDataToPlayer(this.midiBuffer);   
        this.synth.playPlayer();     
        this.waitUntilStopped(audioNode);
    }

    public setRepoUrl(url: string) {
        this.repoUrl = url;
        this._sfRepository = null;
    }

    private async waitUntilStopped(node: AudioNode) {
        await this.synth.waitForPlayerStopped();
        await this.synth.waitForVoicesStopped();
        const stopWasPressed = this.playerState === PlayerState.Stopped;
        if (!stopWasPressed) {
            await this.sleep(1000);
        }
        this.playerState = PlayerState.Stopped;
        node.disconnect();
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
        this.synth.stopPlayer();
        this.playerState = PlayerState.Stopped;
    }

}