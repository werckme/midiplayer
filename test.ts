import {WerckmeisterMidiPlayer} from './src/WerckmeisterMidiPlayer';
import {ipanema, c9} from './testmidi';

const werckmeisterMidiPlayer = new WerckmeisterMidiPlayer();

const los = document.querySelector("button#los") as HTMLButtonElement;
const halt = document.querySelector("button#halt") as HTMLButtonElement;

los.onclick = async (ev: Event) => {
    werckmeisterMidiPlayer.initAudioEnvironment(ev);
    await werckmeisterMidiPlayer.load(c9)
    werckmeisterMidiPlayer.play();
}

halt.onclick = async (ev: Event) => {
   werckmeisterMidiPlayer.stop();
}