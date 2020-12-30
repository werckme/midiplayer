export const MidiEventTypes = {
    NoteOn: 9,
    NoteOff: 8,
    Pc: 0xC,
    Cc: 0xB,
    PitchBend: 0xE
}

export interface IMidiEvent {
    type: number;
    noteName?: string;
    channel: number;
    track: number;
    param1: number;
    param2?: number;
    playTime: number;
    pitchbendValue?: number;
}
