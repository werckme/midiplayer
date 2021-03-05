import { ISampleFile, ISkeletonFile } from "./SfCompose";

export class SfRepository {
    baseUrl = "https://raw.githubusercontent.com/werckme/soundfont-server/feature/splitandcompose/soundfonts/FluidR3_GM";
    skeleton = "FluidR3_GM.sf2.skeleton";
    sampleTemplate = "FluidR3_GM.sf2.$id.smpl";
    sfName = "FluidR3_GM";
    private skeletonFile: ISkeletonFile;

    public getUrl(path) {
        return `${this.baseUrl}/${path}`;
    }

    public async getSkeleton(): Promise<ISkeletonFile> {
        if (this.skeletonFile) {
            return this.skeletonFile;
        }
        const response = await fetch(this.getUrl(this.skeleton));
        const data = await response.blob();
        this.skeletonFile = { sfName: this.sfName, data };
        return this.skeletonFile;
    }

    public async getSampleFiles(sampleIds: number[]): Promise<ISampleFile[]> {
        const _fetch = async (id, url) => {
            const response = await fetch(url);
            const blob = await response.blob();
            return {id, blob};
        }
        const fetches: Promise<{id: number, blob: Blob}>[] = [];

        for(const id of sampleIds) {
            const url = `${this.baseUrl}/${this.sampleTemplate.replace('$id', id.toString())}`
            fetches.push(_fetch(id, url));
        }
        const blobs = await Promise.all(fetches);
        return blobs
            .map(x => ({
                sfName: this.sfName,
                id: x.id,
                data: x.blob
            }));
    }
}