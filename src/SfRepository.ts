import { ISampleFile, ISkeletonFile } from "./SfCompose";

interface IRepoMetaData {
    baseUrl: string;
    skeleton: string;
    sampleTemplate: string;
    sfName: string;
    license?: string;
};

export type SampleLoadingEvent = (id: number, url: string) => void;

export class SfRepository {
    public licenseMessageSent: boolean;
    private _repoMetaData = null;
    private skeletonFile: ISkeletonFile;

    public get repoMetaData(): IRepoMetaData {
        if (!this._repoMetaData) {
            throw new Error("missing repo meta data. Did you forgot to set the repo url?");
        }
        return this._repoMetaData;
    }

    constructor() {
    }

    public async setRepo(url: string): Promise<void> {
        const json: IRepoMetaData = await (await fetch(url)).json();
        if (!json.baseUrl || !json.sampleTemplate || !json.sfName || !json.skeleton) {
            throw new Error("invalid repo url");
        }
        this._repoMetaData = json;
    }

    public getUrl(path) {
        return `${this.repoMetaData.baseUrl}/${path}`;
    }

    public async getSkeleton(): Promise<ISkeletonFile> {
        if (this.skeletonFile) {
            return this.skeletonFile;
        }
        const response = await fetch(this.getUrl(this.repoMetaData.skeleton));
        const data = await response.blob();
        this.skeletonFile = { sfName: this.repoMetaData.sfName, data };
        return this.skeletonFile;
    }

    public async getSampleFiles(sampleIds: number[], onDowloaded:SampleLoadingEvent = ()=>{}, onDowloading:SampleLoadingEvent = ()=>{}): Promise<ISampleFile[]> {
        const _fetch = async (id, url) => {
            onDowloading(id, url);
            const response = await fetch(url);
            const blob = await response.blob();
            onDowloaded(id, url);
            return {id, blob};
        }
        const fetches: Promise<{id: number, blob: Blob}>[] = [];

        for(const id of sampleIds) {
            const url = `${this.repoMetaData.baseUrl}/${this.repoMetaData.sampleTemplate.replace('$id', id.toString())}`
            fetches.push(_fetch(id, url));
        }
        const blobs = await Promise.all(fetches);
        return blobs
            .map(x => ({
                sfName: this.repoMetaData.sfName,
                id: x.id,
                data: x.blob
            }));
    }
}