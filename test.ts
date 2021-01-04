import { InstrumentNames } from './src/GM';
import { IMidiEvent, MidiEventTypes } from './src/IMidiEvent';
import {PlayerState, WerckmeisterMidiPlayer} from './src/WerckmeisterMidiPlayer';
import {ipanema, c9, mario, blackpages, ennios, pitch, cc} from './testmidi';
import 'regenerator-runtime/runtime'

const werckmeisterMidiPlayer = new WerckmeisterMidiPlayer();


const los = document.querySelector("button#los") as HTMLButtonElement;
const halt = document.querySelector("button#halt") as HTMLButtonElement;
const out = document.querySelector("#output") as HTMLElement;

function log(str:string) {
    out.innerHTML += `<li>${str}</li>`
}

werckmeisterMidiPlayer.onMidiEvent = (event: IMidiEvent) => {
    if (event.type !== MidiEventTypes.Pc) {
        return;
    }
    log(`use instrument ${InstrumentNames[event.param1]}`);   
};

let startPreparingTime: number;

werckmeisterMidiPlayer.onPlayerStateChanged = (oldState: PlayerState, newState: PlayerState) => {
    if (newState === PlayerState.Preparing) {
        startPreparingTime = performance.now();
    }
    if (newState === PlayerState.Playing) {
        log(`Render Time: ${(performance.now() - startPreparingTime) / 1000}`);
    }
    log(PlayerState[newState]);
};


los.onclick = async (ev: Event) => {
    log("play pressed")
    werckmeisterMidiPlayer.initAudioEnvironment(ev);
    await werckmeisterMidiPlayer.load(mario);
    werckmeisterMidiPlayer.play();
}

halt.onclick = async (ev: Event) => {
   werckmeisterMidiPlayer.stop();
}
