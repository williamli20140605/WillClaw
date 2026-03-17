export interface ChannelAdapter {
    readonly name: string;

    start(): Promise<boolean>;
    stop(): Promise<void>;
}
