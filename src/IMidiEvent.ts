export const MidiEventNames = {
    NoteOn: "Note on",
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
}