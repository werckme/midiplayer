#!/bin/sh
mkdir -p jssynthbuild
cd jssynthbuild 
cp ../node_modules/js-synthesizer/dist/js-synthesizer.js .
echo "var Module = typeof Module !== 'undefined' ? Module : {};" > main.js
cat js-synthesizer.js >> main.js
rm js-synthesizer.js
echo '{"name": "js-synthbuild","version": "1.0.0","description": "","main": "main.js","author": "","license": "ISC"}' > package.json