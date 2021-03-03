declare const require
const SfComposerFactory = require('@werckmeister/sfcompose/sfcompose');
const fs = require('fs');
const _ = require ('lodash');

export interface ISkeletonFile {
    data: Blob;
    sfName: string;
}

export interface IInstrument {
    bank: number;
    preset: number;
}

export interface ISampleFile {
    id: number;
    sfName: string;
    data: Blob;
}

export interface ISoundFont {
    sfName: string;
    instruments: IInstrument[];
    data: Blob;
}

interface SfComposeModule {
    cwrap: (name: string, returnType: string, args: any[]) => CallableFunction;
    _free: (ptr: number) => void;
    UTF8ToString: (strPtr: number) => string;
    FS: {
        writeFile: (path: string, data: string|ArrayBufferView, opts?: {flags?: string}) => void,
        readFile(path: string, opts?: {flags?: string, encoding?: string})
        analyzePath: (path: string, dontResolveLastLink: boolean) => {
            isRoot: boolean,
            exists: boolean,
            error: Error,
            name: string,
            path: string,
            object: string,
            parentExists: boolean,
            parentPath: string,
            parentObject: string
        },
        mkdir: (path: string) => void,
        unlink: (path: string) => void,
        syncfs: () => void;
    };
}

export class SfCompose {
    private performCompose: (spaceSeparatedArgs: string) => number;
    private debugArgs: (spaceSeparatedArgs: string) => number;
    module: Promise<SfComposeModule>;
    /**
     * 
     */
    constructor() {
        this.module = SfComposerFactory().then(async module => {
            await this.init(module);
            return module;
        });
    }

    /**
     * 
     * @param module 
     */
    async init(module: SfComposeModule) {
        this.prepareModule(module);
    }

    /**
     * 
     * @param module 
     */
    private prepareModule(module: SfComposeModule) {
        this.performCompose =
            module.cwrap('composejs', 'number', ['string']) as (spaceSeparatedArgs: string) => number;
        this.debugArgs =
            module.cwrap('debug_args', 'number', ['string']) as (spaceSeparatedArgs: string) => number;            
    }

    private async dirExists(path: string): Promise<boolean> {
        const module = await this.module;
        const res = module.FS.analyzePath(path, false);
        return res.exists;
    }

    public async writeSamples(samples: ISampleFile[]): Promise<void> {
        const module = await this.module;
        for(const sample of samples) {
            const bff = await sample.data.arrayBuffer();
            const samplePath = `${sample.sfName}/_${sample.id}.smpl`
            module.FS.writeFile(samplePath, new Uint8Array(bff));
        }
    }

    public async getRequiredSampleIds(skeleton: ISkeletonFile, instruments:IInstrument[]): Promise<number[]> {
        const module = await this.module;
        if (await this.dirExists(skeleton.sfName) === false) {
            if (skeleton.sfName.indexOf('/') >= 0) {
                throw new Error(`invalid sfName "${skeleton.sfName}": contains '/' `);
            }
            module.FS.mkdir(skeleton.sfName);
        }
        const skeletonPath = `${skeleton.sfName}/skeleton`;
        const bff = await skeleton.data.arrayBuffer();
        module.FS.writeFile(skeletonPath, new Uint8Array(bff));
        // execute
        let strPtr: number = 0;
        const instrumentIds = instruments.map(x => `${x.bank} ${x.preset}`).join(" ");
        strPtr = this.performCompose(`${skeletonPath} --getsampleids ${instrumentIds}`);
        const resultStr = module.UTF8ToString(strPtr);
        module._free(strPtr);
        let json:any = {};
        try {
            json = JSON.parse(resultStr);
        } catch(ex) {
            throw new Error("sfcompose: failed to parse result: " + resultStr);
        }
        if (Array.isArray(json)) {
            return json.filter(x => !!x && x>=0); // TODO for some reason we have -1 in here
        }
        if (json.error) {
            throw new Error("sfcompose: " + json.error);
        }
    }

    public async compose(sfName: string, instruments:IInstrument[]): Promise<ISoundFont> {
        const module = await this.module;
        if (await this.dirExists(sfName) === false) {
           throw new Error("sfcompose: missing data for " + sfName);
        }
        const skeletonPath = `${sfName}/skeleton`;

        // execute
        let strPtr: number = 0;
        const instrumentIds = instruments.map(x => `${x.bank} ${x.preset}`).join(" ");
        const samplePathTemplate = '_';
        const outFile = `${sfName}.sf2`
        const pathToSamples = sfName;
        const args = `${skeletonPath} ${pathToSamples} ${samplePathTemplate} ${outFile} ${instrumentIds}`;
        strPtr = this.performCompose(args);
        const resultStr = module.UTF8ToString(strPtr);
        module._free(strPtr);
        let json:any = {};
        try {
            json = JSON.parse(resultStr);
        } catch(ex) {
            throw new Error("sfcompose: failed to parse result: " + resultStr);
        }
        if (json.error) {
            throw new Error("sfcompose: " + json.error);
        }
        try {
            const data:Uint8Array = module.FS.readFile(outFile);
            const blob = new Blob([data], {type: 'application/octet-stream'});
            return {
                data: blob,
                instruments,
                sfName
            };
        } catch {
            throw new Error("failed to read result");
        }
    }
}