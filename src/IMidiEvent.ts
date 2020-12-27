export const MidiEventNames = {
    NoteOn: "Note on",
    NoteOff: "Note off",
    Pc: "Program Change",
}

export interface IMidiEvent {
    name: string;
    noteName: string;
    byteIndex: number;
    channel: number;
    delta: number;
    tick: number;
    track: number;
    value: number;
    velocity: number;
}
