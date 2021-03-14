import * as _ from 'lodash';
import { IMidiEvent, MidiEventTypes } from "./IMidiEvent";
import * as MidiFileModule from "midifile";
const MidiFile = (MidiFileModule as any).default;
import * as MidiEvents from "midievents";
import { Base64Binary } from "./Base64binary";
import { Constants } from './Constants';
import { IInstrument, ISoundFont, SfCompose } from './SfCompose';
import { SfRepository } from './SfRepository';
declare const require;
const fs = require('fs');
// Read contents as a string
const libfluidsynth = fs.readFileSync('./node_modules/js-synthesizer/externals/libfluidsynth-2.0.2.js', 'utf8');
const jsSynthesizer = fs.readFileSync('./node_modules/js-synthesizer/dist/js-synthesizer.js', 'utf8');
const workerjs = fs.readFileSync('./src/FluidSynthWorker.js', 'utf8');
const workerLibs = [libfluidsynth, jsSynthesizer, workerjs];
const workerUrl = `data:text/javascript;base64,${btoa(workerLibs.join('\n'))}`;
const webworker = new Worker(workerUrl);
// https://github.com/jet2jet/js-synthesizer/blob/master/src/main/ISynthesizer.ts
const percussionMidiChannel = 9;
const EventEmitterRefreshRateMillis = 10;
const DefaultRepoUrl = "https://raw.githubusercontent.com/werckme/soundfont-server/v1.1/soundfonts/FluidR3_GM/FluidR3_GM.sf2.json";
const DefaultRendererBufferSeconds = 10;
export enum PlayerState {
    Stopped,
    Preparing,
    Playing,
    Stopping
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
    private static instaces = 0;
    private instanceId: number;
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
    private repoUrl = DefaultRepoUrl;
    private audioNodes = new Map<number, AudioBufferSourceNode>();
    private playblackNode: AudioBufferSourceNode;
    public rendererBufferSeconds = DefaultRendererBufferSeconds;
    constructor() {
        this.instanceId = ++WerckmeisterMidiPlayer.instaces;
    }
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

    private sleepAsync(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public async play() {
        if (!this.midifile || this.playerState > PlayerState.Stopped) {
            return;
        }
        this.playedTime = 0;
        this.playerState = PlayerState.Preparing;
        const sampleRate = this.audioContext.sampleRate;        
        this.startPlayback().then(() => {
            this.playerState = PlayerState.Stopped;
        });
    }
    
    public stop() {
        if (!this.midifile || this.playerState === PlayerState.Stopped || this.playerState === PlayerState.Stopping) {
            return;
        }
        this.playerState = PlayerState.Stopping;
        const nodeKeys = Array.from(this.audioNodes.keys());
        for(const nodeKey of nodeKeys) {
            const node = this.audioNodes.get(nodeKey);
            node.stop();
            node.disconnect(this.audioContext.destination);
            this.audioNodes.delete(nodeKey);
        }
    }

    private postWebworker(data: any) {
        data.sessionId = this.instanceId;
        webworker.postMessage(data);
    }

    private async startPlayback() {
        return new Promise<void>(async resolve => {
            const sfData = await this.soundFont.data.arrayBuffer();
            const songTimeSecs = _.last(this.events).playTime/1000 + 1.5;
            let startTime = undefined;
            const sampleRate = this.audioContext.sampleRate;
            let firstResponse = true;
            let nodeId = 0;
            this.audioNodes = new Map<number, AudioBufferSourceNode>();
            const playNextBlock = (audioBlock: AudioBuffer, lastBlock: boolean) => {
                this.playerState = PlayerState.Playing;
                const node = new AudioBufferSourceNode(this.audioContext, {buffer: audioBlock});
                this.audioNodes.set(nodeId++, node);
                node.connect(this.audioContext.destination);
                node.start();
                if (lastBlock) {
                    node.onended = stop.bind(this);
                }
            }
            const stop = () => {
                this.postWebworker({stop:true});
            }
            const onWorkerResponse = (msg) => {
                if (msg.data.sessionId !== this.instanceId) {
                    return;
                }
                if (msg.data.stopped) {
                    webworker.removeEventListener('message', onWorkerResponse);
                    this.audioNodes.clear();
                    resolve();
                    return;
                }
                if (startTime === undefined) {
                    this.playerState = PlayerState.Playing;
                    startTime = this.audioContext.currentTime;
                    this.startEventNotification();
                }
                if (this.playerState === PlayerState.Stopping) {
                    stop();
                    return;
                }
                if (this.playerState !== PlayerState.Playing) {
                    return;                    
                }                
                const bffL: ArrayBuffer = msg.data.bffL;
                const bffR: ArrayBuffer = msg.data.bffR;
                const startPosSamples = msg.data.samplePos;
                const playedSeconds = this.audioContext.currentTime - startTime;
                const playedSamples = this.audioContext.sampleRate * playedSeconds;
                const sampleOffset =  Math.floor(startPosSamples - playedSamples);
                const audioBuffer = new AudioBuffer({length: msg.data.blockSize + sampleOffset, sampleRate: sampleRate, numberOfChannels: 2});
                audioBuffer.copyToChannel(new Float32Array(msg.data.bffL), 0, sampleOffset);
                audioBuffer.copyToChannel(new Float32Array(msg.data.bffR), 1, sampleOffset);
                playNextBlock(audioBuffer, msg.data.lastBlock);
            };
            webworker.addEventListener('message', onWorkerResponse);
            this.postWebworker({
                soundFont: sfData,
                midiBuffer: this.midiBuffer,
                audioBufferLength: songTimeSecs * sampleRate,
                blockSize: sampleRate * this.rendererBufferSeconds,
                sampleRate: this.audioContext.sampleRate,
                sessionId: this.instanceId
            });
        });
    }
    
    public setRepoUrl(url: string) {
        this.repoUrl = url;
        this._sfRepository = null;
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

}