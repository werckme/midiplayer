import * as MidiPlayer from "midi-player-js";
import * as _ from 'lodash';
import { Instrument, SampleRate } from "./Instrument";
import { IMidiEvent, MidiEventNames } from "./IMidiEvent";
import { GetInstrumentNameForPc } from "./GM";
import { off } from "process";

const percussionInstrumentName = "percussion";
const percussionMidiChannel = 10;

export class WerckmeisterMidiPlayer {
    midiPlayer: MidiPlayer.Player;
    audioContext: AudioContext;
    instruments = new Map<number, Instrument>();
    percussion: Instrument|null;
    events: IMidiEvent[];
    lastEventIndex: 0;
    intervalId: any;
    startTime: number|null;
    lastEventTSeconds: number;
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
            .orderBy(x => x.tick)
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

    programChange(event: IMidiEvent) {
        const instrumentName = GetInstrumentNameForPc(event.value);
        const instrument = new Instrument(instrumentName, this.audioContext);
        this.instruments.set(event.track, instrument);
    }

    async load(base64Data: string) {
        this.midiPlayer = new MidiPlayer.Player();
        this.midiPlayer.loadDataUri(base64Data);
        await this.preprocessEvents(this.midiPlayer.getEvents());
    }

    overrideTempo(bpm: number) {
        this.midiPlayer.tempo = bpm;
    }


    onRender() {
        if (this.startTime === null) {
            this.startTime = performance.now();
        }
        while(this.lastEventIndex < this.events.length) {
            const event = this.events[this.lastEventIndex];
            let eventTseconds = (event.tick / this.midiPlayer.division) * (60 / this.midiPlayer.tempo);
            switch(event.name) {
                case MidiEventNames.NoteOn: this.noteOn(event, eventTseconds); break;
                case MidiEventNames.NoteOff: this.noteOff(event, eventTseconds); break;
                case MidiEventNames.Pc: this.programChange(event); break;
            }
            ++this.lastEventIndex;
        }
    }

    play() {
        if (!this.midiPlayer) {
            return;
        }
        this.startTime = null;
        this.lastEventIndex = 0;
        this.lastEventTSeconds = 0;
        const songTimeSecs = this.midiPlayer.getSongTime() + 5;
        this.audioBuffer = new AudioBuffer({length: songTimeSecs*SampleRate, sampleRate: SampleRate})
        this.onRender();
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