import {WerckmeisterMidiPlayer} from './src/WerckmeisterMidiPlayer';

const werckmeisterMidiPlayer = new WerckmeisterMidiPlayer();

const button = document.querySelector("button");
button.onclick = async () => {
    await werckmeisterMidiPlayer.init();
}