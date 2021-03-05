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
        const result: ISampleFile[] = [];
        for(const id of sampleIds) {
            const url = `${this.baseUrl}/${this.sampleTemplate.replace('$id', id.toString())}`
            const response = await fetch(url);
            const data = await response.blob();
            result.push({
                sfName: this.sfName,
                id: id,
                data
            });
        }
        return result;
    }
}