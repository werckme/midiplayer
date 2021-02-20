import * as JSSynth from 'js-synthesizer';

async function fetchBinary(url) {
    const response = await fetch(url);
    const bff = await response.arrayBuffer()
    return bff;
}



async function play() {
    console.log("Play");
    try {
        const context = new AudioContext();
        const synth = new JSSynth.Synthesizer();
        synth.init(context.sampleRate);

        // Create AudioNode (ScriptProcessorNode) to output audio data
        var node = synth.createAudioNode(context, 8192); // 8192 is the frame count of buffer
        node.connect(context.destination);
        const sfontBuffer = await fetchBinary('sf.sf2');
        // Load your SoundFont data (sfontBuffer: ArrayBuffer)
        await synth.loadSFont(sfontBuffer);
        console.log("SF loaded");

        const smfBuffer = await fetchBinary('midifile.mid');
        console.log('MIDI file loaded', smfBuffer);
        await synth.addSMFDataToPlayer(smfBuffer);
        console.log("smf file added");
        await synth.playPlayer();
        console.log("player started");
        await synth.waitForPlayerStopped();
        await synth.waitForVoicesStopped();
        synth.close();
        node.disconnect();
        console.log("done");
    } catch(ex) {
        console.log("error");
    }
}





document.addEventListener('DOMContentLoaded', () => {
    const btnPlay = document.getElementById("btnPlay");
    btnPlay.onclick = () => play();
});

