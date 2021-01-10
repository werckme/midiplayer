export const Constants = {
    NOTES: [],
};

var allNotes = [['C'], ['C#', 'Db'], ['D'], ['D#', 'Eb'], ['E'], ['F'], ['F#', 'Gb'], ['G'], ['G#', 'Ab'], ['A'], ['A#', 'Bb'], ['B']];
var counter = 0;

var _loop = function _loop(i) {
    allNotes.forEach(function (noteGroup) {
        noteGroup.forEach(function (note) {
            return Constants.NOTES[counter] = note + i;
        });
        counter++;
    });
};

for (var i = -1; i <= 9; i++) {
    _loop(i);
}