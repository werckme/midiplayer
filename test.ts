import {WerckmeisterMidiPlayer} from './src/WerckmeisterMidiPlayer';
import {ipanema, c9, mario, blackpages, ennios} from './testmidi';

const werckmeisterMidiPlayer = new WerckmeisterMidiPlayer();

const los = document.querySelector("button#los") as HTMLButtonElement;
const halt = document.querySelector("button#halt") as HTMLButtonElement;
const out = document.querySelector("#output") as HTMLElement;

function log(str:string) {
    out.innerHTML += `<li>${str}</li>`
}

los.onclick = async (ev: Event) => {
    log("play pressed")
    werckmeisterMidiPlayer.initAudioEnvironment(ev);
    await werckmeisterMidiPlayer.load(ennios);
    //werckmeisterMidiPlayer.overrideTempo(140)
    log("loaded")
    const t = performance.now();
    werckmeisterMidiPlayer.play();
    log(`preparation time: ${(performance.now()-t) / 1000}`);
}

halt.onclick = async (ev: Event) => {
   werckmeisterMidiPlayer.stop();
}