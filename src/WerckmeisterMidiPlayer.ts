import * as MidiPlayer from "midi-player-js";
import * as _ from 'lodash';
import { Instrument } from "./Instrument";
import { IMidiEvent, MidiEventNames } from "./IMidiEvent";
import { GetInstrumentNameForPc } from "./GM";
import { ipanema } from "./testmidi";


const midifile = ipanema;
const percussionInstrumentName = "percussion";
const percussionMidiChannel = 10;

export class WerckmeisterMidiPlayer {
    audioContext: AudioContext;
    instruments = new Map<number, Instrument>();
    percussion: Instrument|null;
    public async init(): Promise<void> {
        try {
            this.audioContext = new AudioContext();
            this.play();
        } catch (ex) {
            console.log(ex)
        }
    }


    private async preprocessEvents(events: MidiPlayer.Event[]) {
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
    }

    private getInstrument(event: IMidiEvent) {
        if (event.channel === percussionMidiChannel) {
            return this.percussion;
        } 
        return this.instruments.get(event.track);
    }

    noteOn(event: IMidiEvent) {
        const instrument = this.getInstrument(event);
        instrument.noteOn(event);
    }

    noteOff(event: IMidiEvent) {
        const instrument = this.getInstrument(event);
        instrument.noteOff(event);
    }    

    ProgramChange(event: IMidiEvent) {
        const instrumentName = GetInstrumentNameForPc(event.value);
        const instrument = new Instrument(instrumentName, this.audioContext);
        this.instruments.set(event.track, instrument);
    }

    async play() {
        const midiPlayer = new MidiPlayer.Player();
        midiPlayer.on('midiEvent', (event: IMidiEvent) => {
            switch(event.name) {
                case MidiEventNames.NoteOn: return this.noteOn(event);
                case MidiEventNames.NoteOff: return this.noteOff(event);
                case MidiEventNames.Pc: return this.ProgramChange(event);
            }
        });
        midiPlayer.loadDataUri(midifile);
        await this.preprocessEvents(midiPlayer.getEvents());
        midiPlayer.play();
    }
}