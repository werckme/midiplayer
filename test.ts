import { InstrumentNames } from './src/GM';
import { IMidiEvent, MidiEventTypes } from './src/IMidiEvent';
import {PlayerState, WerckmeisterMidiPlayer} from './src/WerckmeisterMidiPlayer';
import {ipanema, c9, mario, blackpages, ennios, pitch, cc} from './testmidi';
import 'regenerator-runtime/runtime'

const werckmeisterMidiPlayer = new WerckmeisterMidiPlayer();


const los = document.querySelector("button#los") as HTMLButtonElement;
const halt = document.querySelector("button#halt") as HTMLButtonElement;
const out = document.querySelector("#output") as HTMLElement;
const repoInput = document.querySelector("input[type=text]") as HTMLInputElement;

repoInput.value = werckmeisterMidiPlayer.repoUrl;

function log(str:string) {
    out.innerHTML += `<li>${str}</li>`
}


werckmeisterMidiPlayer.onMidiEvent = (event: IMidiEvent) => {
    if (event.type !== MidiEventTypes.Pc) {
        //log(`♪ ${event.param1}`);
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
    console.log(PlayerState[oldState], PlayerState[newState])
};


los.onclick = (ev: Event) => {
    log("play pressed")
    const visitor = {
        newTasks: (tasks) => {
            console.log('new tasks', tasks);
        },
        done: (task) => {
            console.log('done', task)
        },
        message: (txt) => {
            console.info(txt);
        }
    };
    setTimeout(async () => {
        werckmeisterMidiPlayer.initAudioEnvironment(ev);
        werckmeisterMidiPlayer.setRepoUrl(repoInput.value);
        await werckmeisterMidiPlayer.load(blackpages, visitor);
        werckmeisterMidiPlayer.play();
    });
}

halt.onclick = async (ev: Event) => {
   werckmeisterMidiPlayer.stop();
}
