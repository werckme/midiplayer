# Just another MIDI player 
* instead of triggering note events by a timer, this player prerenders a MIDI file to an [AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer). So the result is more precise regarding the timing than other JS MIDI players, but on the other hand the precalculation needs a bit of extra time
* uses  [midifile](https://github.com/nfroidure/midifile) for parsing midi data.
* used by [werckmeister component](https://github.com/werckme/werckmeister-component)


## Supported MIDI events
* Note On
* Note Off
* CC
  * experssion
  * panorama
* PC
* Pitch Bend
* Meta Events
  * Tempo

# TODO
prepare js-synthesizer
```
cp ../node_modules/js-synthesizer/externals/libfluidsynth-2.0.2.js .
cp ../node_modules/js-synthesizer/dist/js-synthesizer.js .
cat libfluidsynth-2.0.2.js > main.js
cat js-synthesizer.js >> main.js

```