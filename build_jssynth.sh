#!/bin/sh
mkdir -p jssynthbuild
cd jssynthbuild 
cp ../node_modules/js-synthesizer/externals/libfluidsynth-2.0.2.js . 
cp ../node_modules/js-synthesizer/dist/js-synthesizer.js .
cat libfluidsynth-2.0.2.js > main.js
cat js-synthesizer.js >> main.js
rm libfluidsynth-2.0.2.js
rm js-synthesizer.js
echo '{"name": "js-synthbuild","version": "1.0.0","description": "","main": "main.js","author": "","license": "ISC"}' > package.json