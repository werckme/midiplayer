import {WerckmeisterMidiPlayer} from './src/WerckmeisterMidiPlayer';
import {ipanema, c9, mario} from './testmidi';

const werckmeisterMidiPlayer = new WerckmeisterMidiPlayer();

const los = document.querySelector("button#los") as HTMLButtonElement;
const halt = document.querySelector("button#halt") as HTMLButtonElement;

los.onclick = async (ev: Event) => {
    werckmeisterMidiPlayer.initAudioEnvironment(ev);
    await werckmeisterMidiPlayer.load(mario)
    werckmeisterMidiPlayer.overrideTempo(210)
    werckmeisterMidiPlayer.play();
}

halt.onclick = async (ev: Event) => {
   werckmeisterMidiPlayer.stop();
}